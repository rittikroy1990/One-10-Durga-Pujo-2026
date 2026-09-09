"""Auth endpoints, dashboards, audit trail, period close, public report, users/roles,
settings, documents and reports/exports."""
import hashlib
import io
from datetime import datetime

from fastapi import (APIRouter, Depends, Request, Response, HTTPException, Body,
                     UploadFile, File, Form, Query)

from db import db, new_id, clean
from config import get_settings, get_active_cycle_id, list_campaigns, DEFAULT_SETTINGS
from util import iso, now_utc, fmt_inr, to_ist
from audit import audit
from ledger import trial_balance, account_balance
from auth import (get_current_user, exchange_session, login_with_password, require, ROLES, ROLE_PERMISSIONS,
                  sod_conflicts, user_permissions)
from docs import export_csv, export_xlsx, export_pdf
from storage import save_document, get_object

router = APIRouter(prefix="/api")


# =============================================================== AUTH

@router.post("/auth/login")
async def auth_login(body: dict = Body(...), response: Response = None, request: Request = None):
    """Committee portal password login (user id + password)."""
    result = await login_with_password(body.get("login_id"), body.get("password"))
    response.set_cookie(
        "session_token",
        result["session_token"],
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
        max_age=7 * 24 * 3600,
    )
    await audit(
        "auth.login",
        actor=result["user"],
        entity_type="user",
        entity_id=result["user"]["user_id"],
        request=request,
    )
    return {"user": result["user"]}


@router.post("/auth/session")
async def auth_session(body: dict = Body(...), response: Response = None):
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    result = await exchange_session(session_id)
    response.set_cookie("session_token", result["session_token"], httponly=True, secure=True,
                        samesite="none", path="/", max_age=7 * 24 * 3600)
    await audit("auth.login", actor=result["user"], entity_type="user",
                entity_id=result["user"]["user_id"])
    return {"user": result["user"]}


@router.get("/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    return {**user, "permissions": sorted(user_permissions(user))}


@router.post("/auth/logout")
async def auth_logout(request: Request, response: Response):
    token = request.cookies.get("session_token") or (
        request.headers.get("Authorization", "")[7:] if request.headers.get("Authorization", "").startswith("Bearer ") else None)
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


@router.get("/auth/roles")
async def auth_roles(user: dict = Depends(require("users:manage", "audit:read", "settings:read"))):
    return {"roles": [{"key": k, "description": v, "permissions": sorted(ROLE_PERMISSIONS.get(k, set()))}
                      for k, v in ROLES.items()]}


# =============================================================== USERS
@router.get("/users")
async def list_users(user: dict = Depends(require("users:manage"))):
    users = await db.users.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for u in users:
        u["sod_conflicts"] = sod_conflicts(u.get("roles", []))
    return {"items": users}


@router.put("/users/{uid}/roles")
async def set_roles(uid: str, body: dict = Body(...), request: Request = None,
                    user: dict = Depends(require("users:manage"))):
    target = await db.users.find_one({"user_id": uid}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    roles = [r for r in body.get("roles", []) if r in ROLES]
    conflicts = sod_conflicts(roles)
    await db.users.update_one({"user_id": uid}, {"$set": {"roles": roles}})
    await audit("user.roles.change", actor=user, entity_type="user", entity_id=uid,
                before={"roles": target.get("roles")}, after={"roles": roles, "conflicts": conflicts},
                request=request)
    return {"ok": True, "roles": roles, "sod_conflicts": conflicts}


# =============================================================== SETTINGS
@router.get("/admin/settings")
async def get_admin_settings(user: dict = Depends(require("settings:read"))):
    return await get_settings()


@router.put("/admin/settings")
async def update_settings(body: dict = Body(...), request: Request = None,
                          user: dict = Depends(require("settings:manage"))):
    before = await get_settings()
    cycle_id = await get_active_cycle_id()
    updates = {}
    cycle_updates = {}
    for section in ("organisation", "platform", "approval_thresholds_paise", "eligibility",
                    "feature_flags"):
        if section in body:
            merged = {**before.get(section, {}), **body[section]}
            updates[section] = merged
    # Campaign / subscription / receipt live on the active cycle document
    for section in ("campaign", "subscription", "receipt"):
        if section in body:
            merged = {**(before.get(section) or {}), **body[section]}
            if section == "subscription":
                comps = merged.get("components") or []
                comp_sum = sum(c["amount_paise"] for c in comps)
                if comps and comp_sum != merged["base_amount_paise"]:
                    raise HTTPException(status_code=400, detail="Component amounts must sum to the base amount.")
            cycle_updates[section] = merged
            updates[section] = merged  # mirror for legacy settings consumers
    updates["updated_at"] = iso()
    await db.application_settings.update_one({"id": "app_settings"}, {"$set": updates})
    if cycle_updates:
        await db.annual_cycles.update_one({"id": cycle_id}, {"$set": cycle_updates})
    after = await get_settings()
    await audit("settings.update", actor=user, entity_type="application_settings",
                entity_id="app_settings", before=before, after=after, request=request)
    return after


# =============================================================== ONE-TIME PAYMENT QR UPLOAD
def _payment_qr_paths():
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent
    return [
        root / "frontend" / "public" / "images" / "payment-qr.png",
        root / "frontend" / "build" / "images" / "payment-qr.png",
        root / "_uploads" / "payment-qr.png",
    ]


@router.get("/admin/payment-qr")
async def admin_payment_qr_status(user: dict = Depends(require("settings:read", "settings:manage", "receipts:manage", "payments:manage", "households:write"))):
    settings = await get_settings()
    upi = (settings.get("organisation") or {}).get("upi") or {}
    locked = bool(upi.get("qr_locked"))
    url = upi.get("static_qr_url") or "/images/payment-qr.png"
    return {
        "locked": locked,
        "uploaded": locked or bool(upi.get("qr_uploaded_at")),
        "url": url,
        "uploaded_at": upi.get("qr_uploaded_at"),
        "uploaded_by": upi.get("qr_uploaded_by"),
        "vpa": upi.get("vpa") or "",
        "payee_name": upi.get("payee_name") or "",
        "can_upload": not locked,
    }


@router.post("/admin/payment-qr")
async def admin_upload_payment_qr(request: Request = None,
                                  user: dict = Depends(require("settings:manage", "receipts:manage", "payments:manage", "households:write")),
                                  file: UploadFile = File(...)):
    """One-time upload of the public UPI payment QR. After success, further uploads are locked."""
    settings = await get_settings()
    org = dict(settings.get("organisation") or {})
    upi = dict(org.get("upi") or {})
    if upi.get("qr_locked"):
        raise HTTPException(
            status_code=409,
            detail="Payment QR upload is deactivated — a QR was already uploaded once.",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file.")
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="QR image too large (max 8 MB).")
    ctype = (file.content_type or "").lower()
    name = (file.filename or "").lower()
    if not (ctype.startswith("image/") or name.endswith((".png", ".jpg", ".jpeg", ".webp"))):
        raise HTTPException(status_code=400, detail="Upload a PNG or JPG QR image.")

    # Normalize to PNG for consistent serving; try to decode VPA from the QR.
    decoded_vpa = ""
    decoded_payee = ""
    decoded_uri = ""
    try:
        from PIL import Image
        import io as _io
        im = Image.open(_io.BytesIO(data)).convert("RGB")
        buf = _io.BytesIO()
        im.save(buf, format="PNG")
        png_bytes = buf.getvalue()
        try:
            from pyzbar.pyzbar import decode as _zbar_decode
            from urllib.parse import parse_qs, urlparse, unquote
            for sym in _zbar_decode(im) or []:
                raw = (sym.data or b"").decode("utf-8", errors="ignore").strip()
                if not raw.lower().startswith("upi://"):
                    continue
                decoded_uri = raw
                qs = parse_qs(urlparse(raw).query)
                decoded_vpa = unquote((qs.get("pa") or [""])[0]).strip()
                decoded_payee = unquote((qs.get("pn") or [""])[0]).strip()
                break
        except Exception:
            pass
    except Exception:
        png_bytes = data

    written = []
    for path in _payment_qr_paths():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(png_bytes)
        written.append(str(path))

    stamp = iso()
    cache_bust = stamp.replace(":", "").replace("-", "").replace(".", "")[:18]
    static_url = f"/images/payment-qr.png?v={cache_bust}"
    upi.update({
        "enabled": True,
        "static_qr_url": static_url,
        "qr_locked": True,
        "qr_uploaded_at": stamp,
        "qr_uploaded_by": user.get("email") or user.get("user_id") or "",
        "instructions": (
            "Scan the committee QR with any UPI app and pay the exact amount shown. "
            "Then upload your payment screenshot and enter the UTR / UPI reference number. "
            "Do not type the UPI ID manually."
        ),
    })
    if decoded_vpa:
        upi["vpa"] = decoded_vpa
    if decoded_payee:
        upi["payee_name"] = decoded_payee
    if decoded_uri:
        upi["merchant_upi_uri"] = decoded_uri
    org["upi"] = upi
    result = await db.application_settings.update_one(
        {"id": "app_settings"},
        {"$set": {"organisation.upi": upi, "updated_at": stamp}},
    )
    if result.matched_count == 0:
        await db.application_settings.update_one(
            {},
            {"$set": {"organisation.upi": upi, "updated_at": stamp}},
        )
    await audit(
        "payment_qr.upload",
        actor=user,
        entity_type="organisation.upi",
        entity_id="payment_qr",
        after={
            "url": static_url,
            "bytes": len(png_bytes),
            "paths": written,
            "vpa": decoded_vpa or upi.get("vpa"),
            "payee_name": decoded_payee or upi.get("payee_name"),
        },
        request=request,
    )
    return {
        "ok": True,
        "locked": True,
        "url": static_url,
        "uploaded_at": stamp,
        "vpa": decoded_vpa or upi.get("vpa") or "",
        "payee_name": decoded_payee or upi.get("payee_name") or "",
        "message": "Payment QR saved and upload deactivated.",
    }


# =============================================================== CAMPAIGNS / CYCLES
@router.get("/admin/campaigns")
async def admin_list_campaigns(user: dict = Depends(require("settings:read", "reports:read"))):
    items = await list_campaigns(published_only=False)
    return {"items": items, "active_cycle_id": await get_active_cycle_id()}


@router.post("/admin/campaigns")
async def create_campaign(body: dict = Body(...), request: Request = None,
                          user: dict = Depends(require("settings:manage"))):
    name = (body.get("name") or "").strip()
    slug = (body.get("slug") or "").strip().lower().replace(" ", "-")
    if not name or not slug:
        raise HTTPException(status_code=400, detail="name and slug are required.")
    if await db.annual_cycles.find_one({"$or": [{"slug": slug}, {"id": body.get("id") or f"cycle_{slug.replace('-', '_')}"}]}):
        raise HTTPException(status_code=409, detail="A campaign with this slug already exists.")
    cycle_id = body.get("id") or f"cycle_{slug.replace('-', '_')}"
    sub = body.get("subscription") or {
        "base_amount_paise": int(round(float(body.get("base_amount_rupees") or 0) * 100)),
        "components": body.get("components") or [],
        "donation_min_paise": 0,
        "allow_donation": True,
    }
    if sub.get("components"):
        if sum(c["amount_paise"] for c in sub["components"]) != sub["base_amount_paise"]:
            raise HTTPException(status_code=400, detail="Component amounts must sum to the base amount.")
    prefix = (body.get("receipt_prefix") or f"ONE10-{slug[:8].upper()}").replace(" ", "")
    doc = {
        "id": cycle_id,
        "name": name,
        "slug": slug,
        "kind": body.get("kind") or "event",
        "summary": body.get("summary") or "",
        "currency": "INR",
        "timezone": "Asia/Kolkata",
        "is_active": bool(body.get("is_active", False)),
        "is_locked": False,
        "is_published": bool(body.get("is_published", False)),
        "campaign": body.get("campaign") or {
            "title": name,
            "theme_line": body.get("theme_line") or "",
            "inclusive_line": body.get("inclusive_line") or "",
            "consecutive_year": int(body.get("consecutive_year") or 1),
            "venue": body.get("venue") or "",
            "important_notice": "A receipt is issued only after payment is verified.",
            "short_url": f"https://one10events.in/campaigns/{slug}",
            "hero_url": body.get("hero_url") or "",
        },
        "subscription": sub,
        "receipt": body.get("receipt") or {
            "prefix": prefix,
            "credit_note_prefix": f"{prefix}-CN",
            "computer_generated_note": "This is a computer-generated receipt and does not require a physical signature.",
            "refund_policy_ref": "See /refund-policy",
            "document_version": "v1.0",
            "tax_deductible": False,
        },
        "created_at": iso(),
    }
    await db.annual_cycles.insert_one(dict(doc))
    await audit("campaign.create", actor=user, entity_type="annual_cycle", entity_id=cycle_id,
                after={"name": name, "slug": slug}, request=request)
    return clean(doc)


@router.put("/admin/campaigns/{cycle_id}")
async def update_campaign(cycle_id: str, body: dict = Body(...), request: Request = None,
                          user: dict = Depends(require("settings:manage"))):
    existing = await db.annual_cycles.find_one({"id": cycle_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    allowed = ("name", "summary", "kind", "is_published", "is_active", "campaign",
               "subscription", "receipt", "slug")
    updates = {k: body[k] for k in allowed if k in body}
    if "subscription" in updates and updates["subscription"].get("components"):
        sub = updates["subscription"]
        if sum(c["amount_paise"] for c in sub["components"]) != sub["base_amount_paise"]:
            raise HTTPException(status_code=400, detail="Component amounts must sum to the base amount.")
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided.")
    updates["updated_at"] = iso()
    await db.annual_cycles.update_one({"id": cycle_id}, {"$set": updates})
    # Keep mirrored settings in sync when editing the active cycle
    if cycle_id == await get_active_cycle_id():
        mirror = {k: updates[k] for k in ("campaign", "subscription", "receipt") if k in updates}
        if mirror:
            mirror["updated_at"] = iso()
            await db.application_settings.update_one({"id": "app_settings"}, {"$set": mirror})
    await audit("campaign.update", actor=user, entity_type="annual_cycle", entity_id=cycle_id,
                after=updates, request=request)
    return clean(await db.annual_cycles.find_one({"id": cycle_id}))


@router.post("/admin/campaigns/{cycle_id}/activate")
async def activate_campaign(cycle_id: str, request: Request = None,
                            user: dict = Depends(require("settings:manage"))):
    cycle = await db.annual_cycles.find_one({"id": cycle_id})
    if not cycle:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    if cycle.get("is_locked"):
        raise HTTPException(status_code=423, detail="Cannot activate a locked cycle.")
    await db.annual_cycles.update_many({}, {"$set": {"is_active": False}})
    await db.annual_cycles.update_one({"id": cycle_id}, {"$set": {"is_active": True, "is_published": True}})
    mirror = {
        "active_cycle_id": cycle_id,
        "cycle": {
            "id": cycle["id"],
            "name": cycle.get("name"),
            "currency": cycle.get("currency", "INR"),
            "timezone": cycle.get("timezone", "Asia/Kolkata"),
            "is_active": True,
            "is_locked": bool(cycle.get("is_locked")),
        },
        "updated_at": iso(),
    }
    if cycle.get("campaign"):
        mirror["campaign"] = cycle["campaign"]
    if cycle.get("subscription"):
        mirror["subscription"] = cycle["subscription"]
    if cycle.get("receipt"):
        mirror["receipt"] = cycle["receipt"]
    await db.application_settings.update_one({"id": "app_settings"}, {"$set": mirror})
    await audit("campaign.activate", actor=user, entity_type="annual_cycle", entity_id=cycle_id,
                request=request)
    return await get_settings()


# =============================================================== DOCUMENTS
@router.post("/documents/upload")
async def upload_document(file: UploadFile = File(...), doc_type: str = Form("general"),
                          linked_type: str = Form(""), linked_id: str = Form(""),
                          request: Request = None, user: dict = Depends(require("documents:write"))):
    data = await file.read()
    try:
        rec = await save_document(data=data, filename=file.filename, doc_type=doc_type,
                                  linked_type=linked_type, linked_id=linked_id,
                                  uploaded_by=user["user_id"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    await audit("document.upload", actor=user, entity_type="document", entity_id=rec["id"],
                after={"filename": rec["original_filename"], "hash": rec["content_hash"]}, request=request)
    return rec


@router.get("/documents")
async def list_documents(user: dict = Depends(require("documents:read"))):
    docs = await db.documents.find({"is_deleted": False, "is_current": True}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return {"items": docs}


@router.get("/documents/{doc_id}/download")
async def download_document(doc_id: str, request: Request = None,
                            user: dict = Depends(require("documents:read"))):
    rec = await db.documents.find_one({"id": doc_id, "is_deleted": False})
    if not rec:
        raise HTTPException(status_code=404, detail="Not found.")
    await db.documents.update_one({"id": doc_id}, {"$push": {"access_history": {
        "user_id": user["user_id"], "at": iso()}}})
    await audit("document.access", actor=user, entity_type="document", entity_id=doc_id, request=request)
    data, ctype = get_object(rec["storage_path"])
    return Response(content=data, media_type=rec.get("content_type", ctype))


@router.get("/documents/evidence-completeness")
async def evidence_completeness(user: dict = Depends(require("audit:read"))):
    total = await db.journal_entries.count_documents({})
    linked = await db.journal_entries.count_documents({"evidence_status": "linked"})
    score = round((linked / total) * 100, 1) if total else 100.0
    return {"total_journals": total, "linked": linked, "score_pct": score,
            "note": "An automated score does not replace an auditor's judgement."}


# =============================================================== DASHBOARDS
@router.get("/dashboards/collection")
async def dashboard_collection(user: dict = Depends(require("reports:read"))):
    settings = await get_settings()
    eligible = settings["eligibility"]["eligible_occupied_households"]
    registered = await db.households.count_documents({"is_deleted": {"$ne": True}})
    paid_ids = await db.receipts.distinct("household_id", {"status": "issued"})
    paid = len(paid_ids)
    pending = await db.subscription_intents.count_documents({"status": "payment_pending"})

    base_total = donation_total = 0
    method_totals = {}
    async for r in db.receipts.find({"status": "issued"}):
        base_total += r.get("base_amount", 0)
        donation_total += r.get("donation_amount", 0)
        m = r.get("method", "other")
        method_totals[m] = method_totals.get(m, 0) + r.get("total_amount", 0)

    # by tower
    towers = await db.towers.find({}, {"_id": 0}).sort("name", 1).to_list(50)
    by_tower = []
    for t in towers:
        reg = await db.households.count_documents({"tower_id": t["id"], "is_deleted": {"$ne": True}})
        hh_ids = await db.households.distinct("id", {"tower_id": t["id"]})
        pd = await db.receipts.count_documents({"household_id": {"$in": hh_ids}, "status": "issued"})
        by_tower.append({"tower": t["name"], "registered": reg, "paid": pd})

    # daily trend
    trend = {}
    async for r in db.receipts.find({"status": "issued"}):
        day = (r.get("issued_at", "") or "")[:10]
        trend[day] = trend.get(day, 0) + r.get("total_amount", 0)
    daily = [{"date": k, "amount": v} for k, v in sorted(trend.items())]

    dup = await db.duplicate_payments.count_documents({})
    refunds = await db.refunds.count_documents({"status": {"$in": ["requested", "processing"]}})
    recon = await db.payment_orders.count_documents({"status": "reconciliation_required"})
    return {
        "eligible": eligible, "registered": registered, "paid": paid, "pending": pending,
        "unpaid": max(eligible - paid, 0),
        "collection_rate_pct": round((paid / eligible) * 100, 1) if eligible else 0,
        "base_total": base_total, "donation_total": donation_total,
        "grand_total": base_total + donation_total,
        "method_totals": method_totals, "by_tower": by_tower, "daily": daily,
        "exceptions": {"duplicate_payments": dup, "refunds_open": refunds, "reconciliation_required": recon},
    }


@router.get("/dashboards/financial")
async def dashboard_financial(user: dict = Depends(require("reports:read"))):
    bank = await db.bank_accounts.find_one({"id": "bank_main"})
    opening = bank.get("opening_balance_paise", 0) if bank else 0
    receipts_total = 0
    async for r in db.receipts.find({"status": "issued"}):
        receipts_total += r.get("total_amount", 0)
    payments_total = 0
    async for v in db.payment_vouchers.find({}):
        payments_total += v.get("amount_paise", 0)
    bank_bal = await account_balance("1001")
    cash_bal = await account_balance("1002")
    gateway_bal = await account_balance("1003")
    advances_outstanding = 0
    async for a in db.advances.find({"status": "outstanding"}):
        advances_outstanding += a.get("amount_paise", 0)
    payables = 0
    async for inv in db.vendor_invoices.find({"status": {"$in": ["received", "review"]}}):
        payables += inv.get("amount_paise", 0)
    return {
        "opening_bank": opening,
        "verified_receipts": receipts_total,
        "total_payments": payments_total,
        "bank_balance": opening + bank_bal, "cash_balance": cash_bal,
        "gateway_clearing": gateway_bal,
        "current_balance": opening + bank_bal + cash_bal + gateway_bal,
        "advances_outstanding": advances_outstanding, "payables": payables,
    }


@router.get("/dashboards/audit")
async def dashboard_audit(user: dict = Depends(require("audit:read"))):
    users = await db.users.find({}, {"_id": 0}).to_list(500)
    sod = [{"user": u["email"], "conflicts": sod_conflicts(u.get("roles", []))}
           for u in users if sod_conflicts(u.get("roles", []))]
    unreconciled = await db.bank_statement_lines.count_documents({"matched": False})
    dup_invoices = await db.vendor_invoices.count_documents({"warnings": {"$ne": []}})
    dup_pay = await db.duplicate_payments.count_documents({})
    overrides = await db.audit_events.count_documents({"action": {"$regex": "override"}})
    post_close = await db.audit_events.count_documents({"post_close": True})
    bank_changes = await db.vendor_bank_accounts.count_documents({})
    stale_adv = await db.advances.count_documents({"status": "outstanding"})
    refunds_pending = await db.refunds.count_documents({"status": {"$in": ["requested", "processing"]}})
    missing_evidence = await db.journal_entries.count_documents({"evidence_status": "missing"})
    return {
        "unreconciled_items": unreconciled, "duplicate_invoices": dup_invoices,
        "duplicate_payments": dup_pay, "manual_overrides": overrides, "post_close_entries": post_close,
        "bank_detail_changes": bank_changes, "stale_advances": stale_adv,
        "refunds_pending": refunds_pending, "sod_conflicts": sod, "missing_evidence": missing_evidence,
    }


# =============================================================== AUDIT TRAIL
@router.get("/audit/events")
async def audit_events(action: str = Query(""), entity_type: str = Query(""),
                       limit: int = Query(200), user: dict = Depends(require("audit:read"))):
    q = {}
    if action:
        q["action"] = {"$regex": action}
    if entity_type:
        q["entity_type"] = entity_type
    events = await db.audit_events.find(q, {"_id": 0}).sort("seq", -1).to_list(min(limit, 2000))
    return {"items": events, "count": len(events)}


@router.get("/audit/verify-chain")
async def verify_chain(user: dict = Depends(require("audit:read"))):
    import json
    prev_hash = "GENESIS"
    ok = True
    broken_at = None
    count = 0
    async for e in db.audit_events.find({}, {"_id": 0}).sort("seq", 1):
        count += 1
        stored = e.pop("hash")
        expected_prev = e.get("prev_hash")
        body = {k: v for k, v in e.items()}
        recomputed = hashlib.sha256((expected_prev + json.dumps(body, sort_keys=True, default=str, separators=(",", ":"))).encode()).hexdigest()
        if expected_prev != prev_hash or recomputed != stored:
            ok = False
            broken_at = e.get("seq")
            break
        prev_hash = stored
    return {"intact": ok, "events_checked": count, "broken_at": broken_at,
            "note": "Hash chaining is tamper-evident, not tamper-proof; pair with periodic signed snapshots."}


@router.get("/audit/export")
async def audit_export(user: dict = Depends(require("audit:read"))):
    events = await db.audit_events.find({}, {"_id": 0}).sort("seq", 1).to_list(20000)
    headers = ["seq", "created_at", "actor_id", "actor_role", "action", "entity_type", "entity_id", "reason", "hash"]
    rows = [[e.get(h, "") for h in headers] for e in events]
    data = export_csv(headers, rows)
    await audit("audit.export", actor=user, entity_type="audit_events", entity_id="all",
                after={"count": len(events)})
    return Response(content=data, media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="audit_log.csv"'})


# =============================================================== PERIOD CLOSE
async def _close_checklist():
    unreconciled = await db.bank_statement_lines.count_documents({"matched": False})
    cash_not_deposited = await db.cash_collections.count_documents({"status": "accepted", "deposited": {"$ne": True}})
    advances_out = await db.advances.count_documents({"status": "outstanding"})
    payables = await db.vendor_invoices.count_documents({"status": {"$in": ["received", "review"]}})
    refunds_pending = await db.refunds.count_documents({"status": {"$in": ["requested", "processing"]}})
    missing_evidence = await db.journal_entries.count_documents({"evidence_status": "missing"})
    tb = await trial_balance()
    balanced = sum(r["debit"] for r in tb) == sum(r["credit"] for r in tb)
    checklist = [
        {"item": "Bank reconciliation (unmatched lines)", "value": unreconciled, "pass": unreconciled == 0},
        {"item": "Cash collected but not deposited", "value": cash_not_deposited, "pass": cash_not_deposited == 0},
        {"item": "Outstanding advances", "value": advances_out, "pass": advances_out == 0},
        {"item": "Payables outstanding", "value": payables, "pass": True},
        {"item": "Refunds pending", "value": refunds_pending, "pass": refunds_pending == 0},
        {"item": "Journals missing evidence", "value": missing_evidence, "pass": missing_evidence == 0},
        {"item": "Trial balance balanced", "value": balanced, "pass": balanced},
    ]
    return checklist


@router.get("/periods")
async def list_periods(user: dict = Depends(require("reports:read"))):
    items = await db.period_closes.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"items": items}


@router.get("/periods/checklist")
async def period_checklist(user: dict = Depends(require("period:close"))):
    return {"checklist": await _close_checklist()}


@router.post("/periods/close")
async def period_close(body: dict = Body(...), request: Request = None,
                       user: dict = Depends(require("period:close"))):
    checklist = await _close_checklist()
    doc = {"id": new_id("pc"), "label": body.get("label", "Period"),
           "scope": body.get("scope", "monthly"), "checklist": checklist,
           "prepared_by": user["user_id"], "status": "prepared",
           "unresolved": [c for c in checklist if not c["pass"]], "created_at": iso()}
    await db.period_closes.insert_one(dict(doc))
    await audit("period.prepare", actor=user, entity_type="period_close", entity_id=doc["id"],
                after={"unresolved": len(doc["unresolved"])}, request=request)
    return clean(doc)


@router.post("/periods/{pc_id}/approve")
async def period_approve(pc_id: str, body: dict = Body(default={}), request: Request = None,
                         user: dict = Depends(require("period:close"))):
    pc = await db.period_closes.find_one({"id": pc_id})
    if not pc:
        raise HTTPException(status_code=404, detail="Not found.")
    if pc["prepared_by"] == user["user_id"]:
        raise HTTPException(status_code=403, detail="Preparer cannot approve the close.")
    unresolved = [c for c in pc["checklist"] if not c["pass"]]
    if unresolved and not body.get("carry_forward_reason"):
        raise HTTPException(status_code=400, detail="Unresolved items must be explained or carried forward.")
    await db.period_closes.update_one({"id": pc_id}, {"$set": {
        "status": "locked", "approved_by": user["user_id"], "locked_at": iso(),
        "carry_forward_reason": body.get("carry_forward_reason", "")}})
    if pc.get("scope") == "final":
        cycle_id = await get_active_cycle_id()
        await db.application_settings.update_one({"id": "app_settings"}, {"$set": {"cycle.is_locked": True}})
        await db.annual_cycles.update_one({"id": cycle_id}, {"$set": {"is_locked": True}})
    await audit("period.lock", actor=user, entity_type="period_close", entity_id=pc_id,
                approval_chain=[pc["prepared_by"], user["user_id"]], request=request)
    return {"ok": True, "status": "locked"}


@router.post("/periods/{pc_id}/reopen")
async def period_reopen(pc_id: str, body: dict = Body(...), request: Request = None,
                        user: dict = Depends(require("period:close"))):
    pc = await db.period_closes.find_one({"id": pc_id})
    if not pc or pc["status"] != "locked":
        raise HTTPException(status_code=409, detail="Only a locked period can be reopened.")
    reason = body.get("reason", "")
    approvals = body.get("approvals", [])
    if not reason or len(approvals) < 2:
        raise HTTPException(status_code=400, detail="Reopening requires a reason and two authorised approvals.")
    await db.period_closes.update_one({"id": pc_id}, {"$set": {"status": "reopened",
                                                               "reopen_reason": reason,
                                                               "reopen_approvals": approvals,
                                                               "reopened_at": iso()}})
    if pc.get("scope") == "final":
        cycle_id = await get_active_cycle_id()
        await db.application_settings.update_one({"id": "app_settings"}, {"$set": {"cycle.is_locked": False}})
        await db.annual_cycles.update_one({"id": cycle_id}, {"$set": {"is_locked": False}})
    await audit("period.reopen", actor=user, entity_type="period_close", entity_id=pc_id,
                reason=reason, approval_chain=approvals, request=request)
    return {"ok": True, "status": "reopened"}


# =============================================================== PUBLIC REPORT
@router.post("/public-report/generate")
async def generate_public_report(body: dict = Body(default={}), request: Request = None,
                                 user: dict = Depends(require("public_report:publish"))):
    base_total = donation_total = 0
    async for r in db.receipts.find({"status": "issued"}):
        base_total += r.get("base_amount", 0)
        donation_total += r.get("donation_amount", 0)
    sponsor_total = 0
    async for s in db.sponsors.find({"is_deleted": {"$ne": True}}):
        sponsor_total += int(s.get("cash_amount_paise", 0) or 0)
    expenses = {}
    async for j in db.journal_entries.find({}):
        for ln in j["lines"]:
            if ln["account_code"].startswith("5"):
                acc = await db.chart_of_accounts.find_one({"code": ln["account_code"]})
                name = acc["name"] if acc else ln["account_code"]
                expenses[name] = expenses.get(name, 0) + ln["debit"] - ln["credit"]
    bank = await db.bank_accounts.find_one({"id": "bank_main"})
    opening = bank.get("opening_balance_paise", 0) if bank else 0
    closing = opening + await account_balance("1001") + await account_balance("1002") + await account_balance("1003")
    report = {"id": new_id("pubrep"), "subscription_total": base_total, "donation_total": donation_total,
              "sponsor_total": sponsor_total, "expenses_by_category": expenses, "closing_balance": closing,
              "note": body.get("note", ""), "published": False, "generated_by": user["user_id"],
              "created_at": iso()}
    await db.public_reports.insert_one(dict(report))
    await audit("public_report.generate", actor=user, entity_type="public_report", entity_id=report["id"], request=request)
    return clean(report)


@router.post("/public-report/{rep_id}/publish")
async def publish_public_report(rep_id: str, request: Request = None,
                                user: dict = Depends(require("public_report:publish"))):
    rep = await db.public_reports.find_one({"id": rep_id})
    if not rep:
        raise HTTPException(status_code=404, detail="Not found.")
    await db.public_reports.update_many({"published": True}, {"$set": {"published": False}})
    await db.public_reports.update_one({"id": rep_id}, {"$set": {"published": True, "published_at": iso(),
                                                                 "published_by": user["user_id"]}})
    await audit("public_report.publish", actor=user, entity_type="public_report", entity_id=rep_id, request=request)
    return {"ok": True}


@router.get("/public-report")
async def public_report():
    rep = await db.public_reports.find_one({"published": True}, {"_id": 0}, sort=[("published_at", -1)])
    if not rep:
        return {"published": False}
    return {"published": True, "report": {
        "subscription_total": fmt_inr(rep["subscription_total"]),
        "donation_total": fmt_inr(rep["donation_total"]),
        "sponsor_total": fmt_inr(rep["sponsor_total"]),
        "expenses_by_category": {k: fmt_inr(v) for k, v in rep["expenses_by_category"].items()},
        "closing_balance": fmt_inr(rep["closing_balance"]),
        "note": rep.get("note", ""), "published_at": rep.get("published_at"),
    }}


# =============================================================== REPORTS + EXPORTS
async def _rep_receipt_register():
    rows = []
    async for r in db.receipts.find({}, {"_id": 0}).sort("issued_at", 1):
        rows.append([r["receipt_no"], r.get("payer_name"), r.get("tower_name"), r.get("flat_number"),
                     fmt_inr(r.get("base_amount", 0)), fmt_inr(r.get("donation_amount", 0)),
                     fmt_inr(r.get("total_amount", 0)), r.get("method"), r.get("status"),
                     r.get("refund_status", "")])
    return ("Receipt Register", ["Receipt No", "Payer", "Tower", "Flat", "Base", "Donation",
                                 "Total", "Method", "Status", "Refund"], rows)


async def _rep_household_register():
    rows = []
    async for h in db.households.find({"is_deleted": {"$ne": True}}, {"_id": 0}):
        paid = await db.receipts.count_documents({"household_id": h["id"], "status": "issued"})
        rows.append([h.get("tower_name"), h.get("flat_number"), h.get("primary_name"),
                     h.get("occupancy_type"), h.get("family_members"), "Yes" if paid else "No"])
    return ("Household Subscription Register", ["Tower", "Flat", "Primary Contact", "Occupancy",
                                               "Members", "Paid"], rows)


async def _rep_general_ledger():
    rows = []
    async for j in db.journal_entries.find({}, {"_id": 0}).sort("posted_at", 1):
        for ln in j["lines"]:
            rows.append([j["journal_no"], j.get("date", "")[:10], j["source_type"], ln["account_code"],
                         fmt_inr(ln["debit"]), fmt_inr(ln["credit"]), j["narration"]])
    return ("General Ledger", ["Journal", "Date", "Source", "Account", "Debit", "Credit", "Narration"], rows)


async def _rep_trial_balance():
    tb = await trial_balance()
    rows = [[r["code"], r["name"], r["type"], fmt_inr(r["debit"]), fmt_inr(r["credit"]),
             fmt_inr(r["balance"])] for r in tb]
    return ("Trial Balance", ["Code", "Account", "Type", "Debit", "Credit", "Balance"], rows)


async def _rep_collection_by_tower():
    towers = await db.towers.find({}, {"_id": 0}).to_list(50)
    rows = []
    for t in towers:
        hh_ids = await db.households.distinct("id", {"tower_id": t["id"]})
        total = 0
        async for r in db.receipts.find({"household_id": {"$in": hh_ids}, "status": "issued"}):
            total += r.get("total_amount", 0)
        pd = await db.receipts.count_documents({"household_id": {"$in": hh_ids}, "status": "issued"})
        rows.append([t["name"], pd, fmt_inr(total)])
    return ("Collection by Tower", ["Tower", "Paid Households", "Total Collected"], rows)


async def _rep_voucher_register():
    rows = []
    async for v in db.payment_vouchers.find({}, {"_id": 0}).sort("created_at", 1):
        rows.append([v["voucher_no"], v.get("vendor_id"), fmt_inr(v.get("amount_paise", 0)),
                     v.get("bank_reference", ""), v.get("approved_by")])
    return ("Payment Voucher Register", ["Voucher", "Vendor", "Amount", "Bank Ref", "Approved By"], rows)


async def _rep_refund_register():
    rows = []
    async for r in db.refunds.find({}, {"_id": 0}).sort("created_at", 1):
        rows.append([r["id"], r.get("receipt_id"), fmt_inr(r.get("amount_paise", 0)),
                     r.get("status"), r.get("credit_note_no", ""), r.get("reason", "")])
    return ("Refund Register", ["Refund", "Receipt", "Amount", "Status", "Credit Note", "Reason"], rows)


async def _rep_gateway_register():
    rows = []
    async for o in db.payment_orders.find({}, {"_id": 0}).sort("created_at", 1):
        rows.append([o.get("provider_order_id"), fmt_inr(o.get("expected_amount", 0)),
                     o.get("currency"), o.get("status"), o.get("mode")])
    return ("Gateway Order/Payment Register", ["Provider Order", "Amount", "Currency", "Status", "Mode"], rows)


async def _rep_advances_ageing():
    from datetime import datetime as _dt
    rows = []
    now = now_utc()
    async for a in db.advances.find({}, {"_id": 0}):
        try:
            created = _dt.fromisoformat(a["created_at"].replace("Z", "+00:00"))
            age = (now - created).days
        except Exception:
            age = 0
        rows.append([a.get("person"), a.get("purpose"), fmt_inr(a.get("amount_paise", 0)),
                     fmt_inr(a.get("spent_paise", 0)), a.get("status"), age])
    return ("Advances Ageing & Settlement", ["Person", "Purpose", "Amount", "Spent", "Status", "Age (days)"], rows)


async def _rep_sod():
    users = await db.users.find({}, {"_id": 0}).to_list(500)
    rows = []
    for u in users:
        conflicts = sod_conflicts(u.get("roles", []))
        rows.append([u["email"], ",".join(u.get("roles", [])),
                     "; ".join(c["description"] for c in conflicts) or "None"])
    return ("User Access & Segregation-of-Duty Report", ["User", "Roles", "Conflicts"], rows)


async def _rep_income_expenditure():
    tb = await trial_balance()
    rows = []
    for r in tb:
        if r["type"] in ("income", "expense"):
            rows.append([r["type"].title(), r["name"], fmt_inr(abs(r["balance"]))])
    return ("Income & Expenditure Summary", ["Type", "Account", "Amount"], rows)


REPORTS = {
    "household_register": _rep_household_register,
    "receipt_register": _rep_receipt_register,
    "collection_by_tower": _rep_collection_by_tower,
    "gateway_register": _rep_gateway_register,
    "general_ledger": _rep_general_ledger,
    "trial_balance": _rep_trial_balance,
    "voucher_register": _rep_voucher_register,
    "refund_register": _rep_refund_register,
    "advances_ageing": _rep_advances_ageing,
    "sod_report": _rep_sod,
    "income_expenditure": _rep_income_expenditure,
}


@router.get("/reports/list")
async def reports_list(user: dict = Depends(require("reports:read"))):
    return {"items": [{"key": k, "title": k.replace("_", " ").title()} for k in REPORTS]}


@router.get("/reports/{key}")
async def report_data(key: str, user: dict = Depends(require("reports:read"))):
    if key not in REPORTS:
        raise HTTPException(status_code=404, detail="Unknown report.")
    title, headers, rows = await REPORTS[key]()
    return {"title": title, "headers": headers, "rows": rows,
            "generated_at": iso(), "generated_by": user.get("email"),
            "filters": {}, "data_through": iso()}


@router.get("/reports/{key}/export")
async def report_export(key: str, format: str = Query("csv"),
                        user: dict = Depends(require("reports:read"))):
    if key not in REPORTS:
        raise HTTPException(status_code=404, detail="Unknown report.")
    title, headers, rows = await REPORTS[key]()
    await audit("report.export", actor=user, entity_type="report", entity_id=key,
                after={"format": format, "rows": len(rows)})
    meta = {"Generated": to_ist(now_utc()).strftime("%d %b %Y %I:%M %p IST"),
            "By": user.get("email", ""), "Data through": to_ist(now_utc()).strftime("%d %b %Y")}
    if format == "xlsx":
        data = export_xlsx(headers, rows, title)
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ext = "xlsx"
    elif format == "pdf":
        data = export_pdf(title, headers, rows, meta)
        media = "application/pdf"
        ext = "pdf"
    else:
        data = export_csv(headers, rows)
        media = "text/csv"
        ext = "csv"
    return Response(content=data, media_type=media,
                    headers={"Content-Disposition": f'attachment; filename="{key}.{ext}"'})
