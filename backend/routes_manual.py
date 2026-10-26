"""Manual payment modes with maker-checker controls, plus admin collection registers."""
import re

from fastapi import APIRouter, Depends, Request, HTTPException, Body, UploadFile, File, Form
from fastapi.responses import Response

from db import db, new_id, clean
from config import get_settings, get_active_cycle_id
from util import iso, now_utc, to_ist, valid_indian_mobile
from audit import audit
from auth import require
from routes_collect import _issue_receipt

router = APIRouter(prefix="/api")


async def _create_hh_intent(body: dict, method: str, user: dict):
    settings = await get_settings()
    cycle_id = await get_active_cycle_id()
    tower = await db.towers.find_one({"id": body.get("tower_id")})
    flat = await db.flats.find_one({"id": body.get("flat_id")})
    if not tower or not flat:
        raise HTTPException(status_code=400, detail="Invalid tower/flat.")
    if not valid_indian_mobile(body.get("mobile", "")):
        raise HTTPException(status_code=400, detail="Valid mobile required.")
    base = int(settings["subscription"]["base_amount_paise"])
    donation = int(round(float(body.get("donation_rupees") or 0) * 100))
    household = await db.households.find_one({"cycle_id": cycle_id, "tower_id": tower["id"],
                                             "flat_id": flat["id"], "is_deleted": {"$ne": True}})
    if household:
        hid = household["id"]
    else:
        hid = new_id("hh")
        household = {"id": hid, "cycle_id": cycle_id, "tower_id": tower["id"],
                     "tower_name": tower["name"], "flat_id": flat["id"], "flat_number": flat["number"],
                     "occupancy_type": body.get("occupancy_type", "other"),
                     "family_members": int(body.get("family_members") or 1),
                     "primary_name": body.get("name", ""), "primary_mobile": body.get("mobile", ""),
                     "email": body.get("email", ""), "created_at": iso(), "is_deleted": False}
        await db.households.insert_one(dict(household))
    comps = [{"code": c["code"], "label": c["label"], "amount_paise": c["amount_paise"],
              "account_code": c["account_code"]} for c in settings["subscription"]["components"]]
    intent = {"id": new_id("intent"), "cycle_id": cycle_id, "household_id": hid, "kind": "subscription",
              "base_amount": base, "donation_amount": donation, "total_amount": base + donation,
              "components": comps, "payer_name": body.get("name", ""),
              "payer_mobile": body.get("mobile", ""), "status": "payment_pending", "method": method,
              "created_at": iso()}
    await db.subscription_intents.insert_one(dict(intent))
    return household, intent


# --------------------------------------------------------------- Cash
@router.post("/manual/cash")
async def cash_create(body: dict = Body(...), request: Request = None,
                      user: dict = Depends(require("manual:create"))):
    household, intent = await _create_hh_intent(body, "cash", user)
    rec = {"id": new_id("cash"), "intent_id": intent["id"], "household_id": household["id"],
           "amount_paise": intent["total_amount"], "collector_id": user["user_id"],
           "collector_name": user.get("name", ""), "collector_ack": True,
           "collected_at": body.get("collected_at", iso()),
           "handover_batch": body.get("handover_batch", ""), "status": "pending_acceptance",
           "deposit_ref": "", "deposit_date": "", "created_at": iso(), "is_deleted": False}
    await db.cash_collections.insert_one(dict(rec))
    await audit("cash.collect", actor=user, entity_type="cash_collection", entity_id=rec["id"],
                after={"amount": rec["amount_paise"]}, request=request)
    return clean(rec)


@router.post("/manual/cash/{cash_id}/accept")
async def cash_accept(cash_id: str, request: Request = None,
                      user: dict = Depends(require("manual:approve"))):
    rec = await db.cash_collections.find_one({"id": cash_id})
    if not rec:
        raise HTTPException(status_code=404, detail="Not found.")
    if rec["collector_id"] == user["user_id"]:
        raise HTTPException(status_code=403, detail="Collector cannot accept their own cash.")
    if rec["status"] != "pending_acceptance":
        raise HTTPException(status_code=409, detail="Not pending acceptance.")
    intent = await db.subscription_intents.find_one({"id": rec["intent_id"]})
    receipt = await _issue_receipt(intent, method="cash", masked_ref=rec.get("handover_batch", "CASH"),
                                   provider_payment_id=f"cash_{cash_id}", debit_account="1002",
                                   request=request)
    await db.cash_collections.update_one({"id": cash_id}, {"$set": {
        "status": "accepted", "accepted_by": user["user_id"], "accepted_at": iso()}})
    await audit("cash.accept", actor=user, entity_type="cash_collection", entity_id=cash_id,
                approval_chain=[rec["collector_id"], user["user_id"]], request=request)
    return {"ok": True, "receipt": receipt}


@router.post("/manual/cash/{cash_id}/deposit")
async def cash_deposit(cash_id: str, body: dict = Body(...), request: Request = None,
                       user: dict = Depends(require("manual:approve"))):
    rec = await db.cash_collections.find_one({"id": cash_id})
    if not rec:
        raise HTTPException(status_code=404, detail="Not found.")
    await db.cash_collections.update_one({"id": cash_id}, {"$set": {
        "deposit_ref": body.get("deposit_ref", ""), "deposit_date": body.get("deposit_date", iso()),
        "deposited": True}})
    await audit("cash.deposit", actor=user, entity_type="cash_collection", entity_id=cash_id, request=request)
    return {"ok": True}


# --------------------------------------------------------------- Bank transfer
@router.post("/manual/bank-transfer")
async def bank_transfer_create(body: dict = Body(...), request: Request = None,
                               user: dict = Depends(require("manual:create"))):
    household, intent = await _create_hh_intent(body, "bank_transfer", user)
    rec = {"id": new_id("btr"), "intent_id": intent["id"], "household_id": household["id"],
           "amount_paise": intent["total_amount"], "utr": body.get("utr", ""),
           "txn_date": body.get("txn_date", ""), "proof_doc_id": body.get("proof_doc_id", ""),
           "maker_id": user["user_id"], "status": "pending_match", "matched": False,
           "created_at": iso(), "is_deleted": False}
    await db.bank_transfers.insert_one(dict(rec))
    await audit("bank_transfer.create", actor=user, entity_type="bank_transfer", entity_id=rec["id"],
                after={"utr": rec["utr"]}, request=request)
    return clean(rec)


@router.post("/manual/bank-transfer/{btr_id}/approve")
async def bank_transfer_approve(btr_id: str, body: dict = Body(default={}), request: Request = None,
                                user: dict = Depends(require("manual:approve"))):
    rec = await db.bank_transfers.find_one({"id": btr_id})
    if not rec:
        raise HTTPException(status_code=404, detail="Not found.")
    if rec["maker_id"] == user["user_id"]:
        raise HTTPException(status_code=403, detail="Maker cannot approve their own transfer.")
    if rec["status"] != "pending_match":
        raise HTTPException(status_code=409, detail="Not pending match.")
    if not body.get("bank_statement_matched"):
        raise HTTPException(status_code=400, detail="Bank statement match confirmation required before receipt.")
    intent = await db.subscription_intents.find_one({"id": rec["intent_id"]})
    receipt = await _issue_receipt(intent, method="bank_transfer",
                                   masked_ref="UTR-" + (rec.get("utr", "")[-4:] or "xxxx"),
                                   provider_payment_id=f"btr_{btr_id}", debit_account="1001",
                                   request=request)
    await db.bank_transfers.update_one({"id": btr_id}, {"$set": {"status": "approved", "matched": True,
                                                                 "approved_by": user["user_id"],
                                                                 "approved_at": iso()}})
    await audit("bank_transfer.approve", actor=user, entity_type="bank_transfer", entity_id=btr_id,
                approval_chain=[rec["maker_id"], user["user_id"]], request=request)
    return {"ok": True, "receipt": receipt}


# --------------------------------------------------------------- Cheque
@router.post("/manual/cheque")
async def cheque_create(body: dict = Body(...), request: Request = None,
                        user: dict = Depends(require("manual:create"))):
    household, intent = await _create_hh_intent(body, "cheque", user)
    rec = {"id": new_id("chq"), "intent_id": intent["id"], "household_id": household["id"],
           "amount_paise": intent["total_amount"], "cheque_no": body.get("cheque_no", ""),
           "bank": body.get("bank", ""), "deposit_date": body.get("deposit_date", ""),
           "maker_id": user["user_id"], "clearing_status": "pending", "status": "pending_clearing",
           "created_at": iso(), "is_deleted": False}
    await db.cheques.insert_one(dict(rec))
    await audit("cheque.create", actor=user, entity_type="cheque", entity_id=rec["id"], request=request)
    return clean(rec)


@router.post("/manual/cheque/{chq_id}/clear")
async def cheque_clear(chq_id: str, body: dict = Body(default={}), request: Request = None,
                       user: dict = Depends(require("manual:approve"))):
    rec = await db.cheques.find_one({"id": chq_id})
    if not rec:
        raise HTTPException(status_code=404, detail="Not found.")
    if rec["maker_id"] == user["user_id"]:
        raise HTTPException(status_code=403, detail="Maker cannot clear their own cheque.")
    if rec["status"] != "pending_clearing":
        raise HTTPException(status_code=409, detail="Not pending clearing.")
    intent = await db.subscription_intents.find_one({"id": rec["intent_id"]})
    receipt = await _issue_receipt(intent, method="cheque",
                                   masked_ref="CHQ-" + (rec.get("cheque_no", "")[-4:] or "xxxx"),
                                   provider_payment_id=f"chq_{chq_id}", debit_account="1001",
                                   request=request)
    await db.cheques.update_one({"id": chq_id}, {"$set": {"clearing_status": "cleared",
                                                          "status": "cleared",
                                                          "cleared_by": user["user_id"],
                                                          "cleared_at": iso()}})
    await audit("cheque.clear", actor=user, entity_type="cheque", entity_id=chq_id,
                approval_chain=[rec["maker_id"], user["user_id"]], request=request)
    return {"ok": True, "receipt": receipt}


@router.get("/manual/queues")
async def manual_queues(user: dict = Depends(require("payments:read", "manual:approve"))):
    return {
        "cash_pending": await db.cash_collections.find({"status": "pending_acceptance"}, {"_id": 0}).to_list(500),
        "bank_transfer_pending": await db.bank_transfers.find({"status": "pending_match"}, {"_id": 0}).to_list(500),
        "cheque_pending": await db.cheques.find({"status": "pending_clearing"}, {"_id": 0}).to_list(500),
        "duplicate_payments": await db.duplicate_payments.find({}, {"_id": 0}).to_list(500),
    }


# --------------------------------------------------------------- Admin registers
def _mask_household(h):
    return {"id": h["id"], "tower_name": h.get("tower_name"), "flat_number": h.get("flat_number"),
            "primary_name": h.get("primary_name"), "occupancy_type": h.get("occupancy_type"),
            "family_members": h.get("family_members"), "email": h.get("email"),
            "has_accessibility_request": h.get("has_accessibility_request", False),
            "created_at": h.get("created_at")}


@router.get("/admin/households")
async def admin_households(user: dict = Depends(require("households:read"))):
    hs = await db.households.find({"is_deleted": {"$ne": True}}, {"_id": 0}).sort("created_at", -1).to_list(3000)
    out = []
    for h in hs:
        m = _mask_household(h)
        m["paid"] = bool(await db.receipts.count_documents({"household_id": h["id"], "status": "issued"}))
        out.append(m)
    return {"items": out, "count": len(out)}


@router.get("/admin/households/{hid}")
async def admin_household_detail(hid: str, user: dict = Depends(require("households:read"))):
    h = await db.households.find_one({"id": hid}, {"_id": 0})
    if not h:
        raise HTTPException(status_code=404, detail="Not found.")
    # accessibility request restricted to convenor/treasurer/coordinator
    from auth import user_permissions
    if not h.get("accessibility_request"):
        pass
    elif "ops:manage" not in user_permissions(user) and "settings:manage" not in user_permissions(user) \
            and "manual:approve" not in user_permissions(user):
        h["accessibility_request"] = "[restricted]"
    receipts = await db.receipts.find({"household_id": hid}, {"_id": 0}).to_list(50)
    return {"household": h, "receipts": receipts}


@router.get("/admin/receipts")
async def admin_receipts(user: dict = Depends(require("receipts:read"))):
    from docs import receipt_is_bank_verified
    rs = await db.receipts.find({}, {"_id": 0}).sort("issued_at", -1).to_list(5000)
    hh_ids = {r["household_id"] for r in rs if r.get("household_id")}
    food_ids = {r["food_subscription_id"] for r in rs if r.get("food_subscription_id")}
    households = {
        h["id"]: h
        for h in await db.households.find(
            {"id": {"$in": list(hh_ids)}}, {"_id": 0, "id": 1, "flat_id": 1, "primary_mobile": 1}
        ).to_list(5000)
    }
    food_subs = {
        f["id"]: f
        for f in await db.food_subscriptions.find(
            {"id": {"$in": list(food_ids)}}, {"_id": 0, "id": 1, "flat_id": 1, "mobile": 1}
        ).to_list(5000)
    }
    flat_ids = {d.get("flat_id") for d in [*households.values(), *food_subs.values()] if d.get("flat_id")}
    flat_food_mobile = {}
    async for f in db.food_subscriptions.find(
        {"flat_id": {"$in": list(flat_ids)}}, {"_id": 0, "flat_id": 1, "mobile": 1}
    ).sort("created_at", -1):
        if _real_mobile(f.get("mobile")):
            flat_food_mobile.setdefault(f["flat_id"], f["mobile"])

    items = []
    for r in rs:
        row = dict(r)
        row["bank_verified"] = receipt_is_bank_verified(r)
        h = households.get(r.get("household_id")) or {}
        f = food_subs.get(r.get("food_subscription_id")) or {}
        candidates = [
            (r.get("payer_mobile"), "receipt"),
            (h.get("primary_mobile"), "household"),
            (f.get("mobile"), "food order"),
            (flat_food_mobile.get(h.get("flat_id") or f.get("flat_id")), "flat food order"),
        ]
        row["contact_mobile"], row["contact_mobile_source"] = next(
            ((m, src) for m, src in candidates if _real_mobile(m)), ("", "")
        )
        items.append(row)
    return {"items": items, "count": len(items)}


_PLACEHOLDER_MOBILES = {"9876543210", "9999999999", "0000000000", "1234567890"}


def _real_mobile(m) -> bool:
    m = str(m or "")
    return len(m) == 10 and m[0] in "6789" and m.isdigit() and m not in _PLACEHOLDER_MOBILES


@router.post("/admin/receipts/{rid}/bank-verify")
async def admin_receipt_bank_verify(
    rid: str,
    request: Request = None,
    user: dict = Depends(require("receipts:manage", "payments:manage")),
):
    """Treasurer confirms the UTR appears on the bank statement → mark receipt bank verified."""
    from docs import receipt_is_bank_verified

    r = await db.receipts.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Receipt not found.")
    if r.get("status") not in ("issued", "partially_refunded"):
        raise HTTPException(status_code=400, detail="Only issued receipts can be bank-verified.")
    if receipt_is_bank_verified(r):
        return {"ok": True, "already": True, "receipt": {**r, "bank_verified": True}}

    now = iso()
    patch = {
        "bank_verified": True,
        "verification_level": "bank_statement",
        "bank_verified_at": now,
        "bank_verified_by": user.get("user_id") or user.get("login_id") or "",
    }
    await db.receipts.update_one({"id": rid}, {"$set": patch})
    # Keep linked UPI payment row in sync when present
    pay_id = r.get("payment_id")
    if pay_id:
        await db.payments.update_many(
            {"provider_payment_id": pay_id},
            {"$set": {"bank_verified": True, "bank_verified_at": now}},
        )
    await audit(
        "receipt.bank_verify",
        actor=user,
        entity_type="receipt",
        entity_id=rid,
        after={"receipt_no": r.get("receipt_no"), "payment_id": pay_id},
        request=request,
    )
    updated = {**r, **patch}
    return {"ok": True, "already": False, "receipt": updated}


@router.post("/admin/households/{hid}/clear-subscription")
async def admin_clear_household_subscription(hid: str, body: dict = Body(default={}),
                                             request: Request = None,
                                             user: dict = Depends(require("receipts:manage"))):
    """Void issued subscription receipts and soft-delete the household so the flat can pay again."""
    h = await db.households.find_one({"id": hid})
    if not h or h.get("is_deleted"):
        raise HTTPException(status_code=404, detail="Household not found.")
    reason = (body.get("reason") or "Cleared to allow a fresh subscription payment.").strip()
    now = iso()
    voided = await db.receipts.update_many(
        {"household_id": hid, "status": "issued", "kind": {"$ne": "donation"}},
        {"$set": {"status": "voided", "voided_at": now, "void_reason": reason,
                  "voided_by": user.get("user_id")}})
    superseded = await db.subscription_intents.update_many(
        {"household_id": hid, "kind": {"$ne": "donation"},
         "status": {"$in": ["paid", "payment_pending", "pending", "authorised"]}},
        {"$set": {"status": "superseded", "superseded_at": now, "supersede_reason": reason}})
    await db.upi_submissions.update_many(
        {"household_id": hid, "status": {"$nin": ["voided", "rejected"]}},
        {"$set": {"status": "voided", "voided_at": now}})
    await db.households.update_one(
        {"id": hid},
        {"$set": {"is_deleted": True, "deleted_at": now, "deleted_by": user.get("user_id"),
                  "delete_reason": reason}})
    await audit("household.clear_subscription", actor=user, entity_type="household", entity_id=hid,
                after={"receipts_voided": voided.modified_count,
                       "intents_superseded": superseded.modified_count},
                reason=reason, request=request)
    return {"ok": True, "household_id": hid, "receipts_voided": voided.modified_count,
            "intents_superseded": superseded.modified_count}


@router.post("/admin/households/clear-by-flat")
async def admin_clear_by_flat(body: dict = Body(...), request: Request = None,
                              user: dict = Depends(require("receipts:manage"))):
    """Clear the active-cycle household for a tower+flat (convenience for ops)."""
    cycle_id = await get_active_cycle_id()
    tower_id = body.get("tower_id")
    flat_id = body.get("flat_id")
    if not tower_id or not flat_id:
        raise HTTPException(status_code=400, detail="tower_id and flat_id are required.")
    h = await db.households.find_one({"cycle_id": cycle_id, "tower_id": tower_id, "flat_id": flat_id,
                                      "is_deleted": {"$ne": True}})
    if not h:
        raise HTTPException(status_code=404, detail="No active household found for that flat.")
    return await admin_clear_household_subscription(h["id"], body, request, user)


@router.get("/admin/payments")
async def admin_payments(user: dict = Depends(require("payments:read"))):
    ps = await db.payments.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    orders = await db.payment_orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    return {"payments": ps, "orders": orders}


_PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
_GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$")
_SPONSOR_DEBIT = {"bank_transfer": "1001", "cheque": "1001", "upi_qr": "1001", "cash": "1002"}


def _sponsor_identity(body: dict) -> dict:
    pan = (body.get("sponsor_pan") or "").strip().upper()
    gstin = (body.get("sponsor_gstin") or "").strip().upper()
    if pan and not _PAN_RE.match(pan):
        raise HTTPException(status_code=400, detail="Sponsor PAN must look like ABCDE1234F.")
    if gstin and not _GSTIN_RE.match(gstin):
        raise HTTPException(status_code=400, detail="Sponsor GSTIN must be 15 characters (e.g. 19ABCDE1234F1Z5).")
    return {
        "sponsor_pan": pan,
        "sponsor_gstin": gstin,
        "sponsor_address": (body.get("sponsor_address") or "").strip(),
        "sponsor_contact": (body.get("sponsor_contact") or "").strip(),
    }


@router.post("/admin/sponsorships/receipt")
async def admin_issue_sponsorship_receipt(body: dict = Body(...), request: Request = None,
                                          user: dict = Depends(require("receipts:manage", "payments:manage"))):
    """Record a sponsor's payment (from the bank statement) and issue a sponsorship receipt."""
    from audit import next_formatted
    from ledger import post_journal
    from tokens import receipt_token

    name = (body.get("sponsor_name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Sponsor name is required.")
    try:
        paid = int(round(float(body.get("amount_rupees") or 0) * 100))
    except (TypeError, ValueError):
        paid = 0
    if paid <= 0:
        raise HTTPException(status_code=400, detail="Enter the amount received.")
    method = (body.get("method") or "bank_transfer").strip()
    if method not in _SPONSOR_DEBIT:
        raise HTTPException(status_code=400, detail="Method must be bank_transfer, cheque, upi_qr or cash.")
    reference = re.sub(r"\s+", "", body.get("reference") or "")
    if method != "cash" and not reference:
        raise HTTPException(status_code=400, detail="Bank / UTR reference is required.")
    received_on = (body.get("received_on") or "").strip()
    if received_on and not re.match(r"^\d{4}-\d{2}-\d{2}$", received_on):
        raise HTTPException(status_code=400, detail="received_on must be YYYY-MM-DD.")
    identity = _sponsor_identity(body)

    if reference and await db.receipts.find_one({"kind": "sponsorship", "payment_id": reference,
                                                 "status": {"$ne": "voided"}}):
        raise HTTPException(status_code=409, detail="A sponsorship receipt already exists for this reference.")

    settings = await get_settings()
    cycle_id = await get_active_cycle_id()
    campaign_title = settings.get("campaign", {}).get("title") or settings.get("cycle", {}).get("name") or "One 10 Events"
    purpose = (body.get("purpose") or "").strip() or f"Sponsorship — {campaign_title}"
    n, receipt_no = await next_formatted("receipt", settings["receipt"]["prefix"], 6)
    rid = new_id("rcpt")
    sponsor_id = new_id("spon")
    journal = await post_journal(
        source_type="receipt", source_id=rid,
        narration=f"Sponsorship receipt {receipt_no} — {name} ({method})",
        lines=[{"account_code": _SPONSOR_DEBIT[method], "debit": paid, "credit": 0},
               {"account_code": "4200", "debit": 0, "credit": paid}],
        actor=user, date=(f"{received_on}T00:00:00+05:30" if received_on else None))
    receipt = {
        "id": rid, "receipt_no": receipt_no, "cycle_id": cycle_id,
        "household_id": None, "intent_id": None, "sponsor_id": sponsor_id,
        "payment_id": reference, "kind": "sponsorship",
        "payer_name": name, "payer_mobile": "",
        "tower_name": "Sponsor", "flat_number": "—",
        "base_amount": 0, "donation_amount": 0, "sponsorship_amount": paid, "total_amount": paid,
        "components": [{"code": "SPONSOR", "label": purpose, "amount_paise": paid, "account_code": "4200"}],
        "method": method, "masked_ref": (f"UTR-{reference[-4:]}" if reference else ""),
        "status": "issued", "bank_verified": method != "cash",
        "verification_level": "bank_statement" if method != "cash" else "",
        "issuance_source": "sponsorship", "journal_id": journal["id"], "issued_at": iso(),
        "received_on": received_on, "paid_on": received_on or to_ist(now_utc()).strftime("%Y-%m-%d"),
        "bank_narration": (body.get("bank_narration") or "").strip(),
        "receiver_pan": (settings.get("organisation", {}).get("sponsorship_pan")
                         or settings.get("organisation", {}).get("pan") or ""),
        "receiver_name": settings.get("organisation", {}).get("sponsorship_legal_name") or "",
        "campaign_title": campaign_title, **identity,
        "is_partial": False, "amount_due_after": 0, "original_total_amount": paid, "amount_paid_to_date": paid,
    }
    receipt["verify_token"] = receipt_token(rid)
    await db.receipts.insert_one(dict(receipt))
    await db.sponsors.insert_one({
        "id": sponsor_id, "cycle_id": cycle_id, "name": name, "cash_amount_paise": paid,
        "receipt_id": rid, "receipt_no": receipt_no, "method": method, "reference": reference,
        "received_on": received_on, "package": (body.get("package") or "").strip(), **identity,
        "status": "active", "is_deleted": False, "created_at": iso(), "created_by": user.get("user_id"),
    })
    await audit("receipt.issue", actor=user, entity_type="receipt", entity_id=rid,
                after={"receipt_no": receipt_no, "total": paid, "kind": "sponsorship", "sponsor": name},
                request=request)
    return {"ok": True, "receipt": clean(receipt)}


@router.patch("/admin/sponsorships/{rid}")
async def admin_update_sponsorship(rid: str, body: dict = Body(...), request: Request = None,
                                   user: dict = Depends(require("receipts:manage"))):
    """Update sponsor identity on a sponsorship receipt (name, PAN, GSTIN, address). Amounts never change."""
    r = await db.receipts.find_one({"id": rid, "kind": "sponsorship"}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Sponsorship receipt not found.")
    patch = {k: v for k, v in _sponsor_identity({**r, **body}).items()}
    if (body.get("sponsor_name") or "").strip():
        patch["payer_name"] = body["sponsor_name"].strip()
    await db.receipts.update_one({"id": rid}, {"$set": patch})
    sponsor_patch = {k: v for k, v in patch.items() if k != "payer_name"}
    if "payer_name" in patch:
        sponsor_patch["name"] = patch["payer_name"]
    await db.sponsors.update_one({"id": r.get("sponsor_id")}, {"$set": sponsor_patch})
    await audit("sponsorship.update", actor=user, entity_type="receipt", entity_id=rid,
                before={k: r.get(k) for k in patch}, after=patch, request=request)
    return {"ok": True, "receipt": {**r, **patch}}


@router.get("/admin/intents")
async def admin_intents(user: dict = Depends(require("payments:read"))):
    items = await db.subscription_intents.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    return {"items": items}


@router.get("/admin/receipts/{rid}/pdf")
async def admin_receipt_pdf(rid: str, user: dict = Depends(require("receipts:read"))):
    from docs import receipt_pdf
    r = await db.receipts.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Not found.")
    settings = await get_settings()
    import os
    verify_url = (os.environ.get("APP_URL", "").rstrip("/") + "/receipt/verify/" + r["verify_token"])
    pdf = receipt_pdf(r, settings, verify_url)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{r["receipt_no"]}.pdf"'})


@router.get("/admin/collection/template")
async def admin_collection_template(user: dict = Depends(require("receipts:read", "households:read", "payments:read"))):
    """Download a sample-filled Excel template for bulk subscription/donation import."""
    from subscription_import import TEMPLATE_FILENAME, base_amount_paise, build_template_xlsx

    settings = await get_settings()
    base_rupees = max(1, int(base_amount_paise(settings) or 350000) // 100)
    data = build_template_xlsx(base_rupees=base_rupees)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{TEMPLATE_FILENAME}"'},
    )


@router.post("/admin/collection/import")
async def admin_collection_import(
    request: Request,
    file: UploadFile = File(...),
    dry_run: bool = Form(False),
    user: dict = Depends(require("receipts:manage", "households:write", "payments:manage")),
):
    """Upload a filled Excel/CSV template — upserts households and issues receipts."""
    from subscription_import import run_import

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file.")
    try:
        summary = await run_import(
            raw,
            file.filename or "upload.xlsx",
            dry_run=bool(dry_run),
            actor=user,
            request=request,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Could not read Excel/CSV. Download the sample template, fill it, and try again.",
        )

    await audit(
        "collection.excel_import",
        entity_type="collection_import",
        entity_id=summary.get("cycle_id") or "import",
        after={
            "filename": file.filename,
            "dry_run": bool(dry_run),
            "message": summary.get("message"),
            "issued": len(summary.get("issued") or []),
            "skipped": len(summary.get("skipped") or []),
            "errors": len(summary.get("errors") or []),
        },
        request=request,
        actor=user,
    )
    return summary
