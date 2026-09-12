"""Phase 1 collection core: subscribe, UPI QR payment, receipts, refunds,
and manual (cash/bank-transfer/cheque) maker-checker modes. Payment gateways disabled."""
from fastapi import APIRouter, Depends, Request, HTTPException, Body, Response
from pydantic import BaseModel, Field
from typing import Optional

import json

from db import db, new_id, clean
from config import get_settings, get_active_cycle_id
from util import (now_utc, iso, valid_indian_mobile, mask_mobile, mask_name, fmt_inr,
                  rupees_to_paise)
from audit import audit, next_formatted
from ledger import post_journal, reverse_journal
from tokens import receipt_token, status_token, read_status_token
from docs import receipt_pdf
from auth import require, get_current_user, require_reauth
from notify import notify

router = APIRouter(prefix="/api")

OCCUPANCY = {"owner_resident", "tenant_resident", "owner_non_resident", "other"}


class SubscribeIn(BaseModel):
    primary_contact_name: str
    mobile: Optional[str] = ""
    tower_id: str
    flat_id: str
    occupancy_type: str
    family_members: int = Field(ge=1, le=20)
    accuracy_confirmed: bool
    privacy_consent: bool
    terms_consent: bool
    email: Optional[str] = None
    alternate_contact: Optional[str] = None
    family_display_name: Optional[str] = None
    donation_rupees: float = 0  # ignored — use /donate; kept for older clients
    interests: list[str] = []
    accessibility_request: Optional[str] = None
    comments: Optional[str] = None
    payer_is_member: bool = True
    payer_name: Optional[str] = None
    payer_mobile: Optional[str] = None
    payer_relationship: Optional[str] = None


class DonateIn(BaseModel):
    """Standalone voluntary donation — decoupled from family subscription."""
    donor_type: str  # "resident" | "other"
    donor_name: str
    mobile: Optional[str] = ""
    email: Optional[str] = None
    donation_rupees: float
    accuracy_confirmed: bool
    privacy_consent: bool
    terms_consent: bool
    # Resident-only
    tower_id: Optional[str] = None
    flat_id: Optional[str] = None
    occupancy_type: Optional[str] = None
    # Other / non-resident
    city: Optional[str] = None
    organisation: Optional[str] = None
    notes: Optional[str] = None
    relation_to_one10: Optional[str] = None


async def _components(settings, donation_paise):
    comps = [{"code": c["code"], "label": c["label"], "amount_paise": c["amount_paise"],
              "account_code": c["account_code"]} for c in settings["subscription"]["components"]]
    return comps


@router.post("/subscribe")
async def subscribe(body: SubscribeIn, request: Request):
    settings = await get_settings()
    cycle_id = await get_active_cycle_id()
    if settings["cycle"].get("is_locked"):
        raise HTTPException(status_code=423, detail="This campaign cycle is locked.")
    if not (body.accuracy_confirmed and body.privacy_consent and body.terms_consent):
        raise HTTPException(status_code=400, detail="All confirmations and consents are required.")
    mobile = (body.mobile or "").strip()
    if mobile and not valid_indian_mobile(mobile):
        raise HTTPException(status_code=400, detail="Enter a valid 10-digit Indian mobile number, or leave it blank.")
    body.mobile = mobile
    if body.occupancy_type not in OCCUPANCY:
        raise HTTPException(status_code=400, detail="Invalid occupancy type.")

    tower = await db.towers.find_one({"id": body.tower_id})
    flat = await db.flats.find_one({"id": body.flat_id, "tower_id": body.tower_id})
    if not tower or not flat:
        raise HTTPException(status_code=400, detail="Invalid tower/flat selection.")

    base = int(settings["subscription"]["base_amount_paise"])  # server-side only
    comp_sum = sum(c["amount_paise"] for c in settings["subscription"]["components"])
    if comp_sum != base:
        raise HTTPException(status_code=500, detail="Component allocation misconfigured.")
    # Subscription checkout is base-only; voluntary gifts go through /donate.
    donation = 0

    # Reuse the cycle+tower+flat household when present; never block a new payment.
    household = await db.households.find_one({"cycle_id": cycle_id, "tower_id": body.tower_id,
                                              "flat_id": body.flat_id, "is_deleted": {"$ne": True}})

    if not household:
        hid = new_id("hh")
        household = {
            "id": hid, "cycle_id": cycle_id, "tower_id": body.tower_id, "tower_name": tower["name"],
            "flat_id": body.flat_id, "flat_number": flat["number"],
            "occupancy_type": body.occupancy_type, "family_members": body.family_members,
            "family_display_name": body.family_display_name or "",
            "primary_name": body.primary_contact_name, "primary_mobile": body.mobile,
            "email": body.email or "", "alternate_contact": body.alternate_contact or "",
            "interests": body.interests, "comments": body.comments or "",
            "has_accessibility_request": bool(body.accessibility_request),
            "accessibility_request": body.accessibility_request or "",  # sensitive; restricted in reads
            "created_at": iso(), "is_deleted": False,
        }
        await db.households.insert_one(dict(household))
        person = {"id": new_id("person"), "household_id": hid, "name": body.primary_contact_name,
                  "mobile": body.mobile, "role": "primary", "created_at": iso()}
        await db.people.insert_one(person)
        for ctype, granted in (("privacy", body.privacy_consent), ("terms", body.terms_consent)):
            await db.consents.insert_one({
                "id": new_id("cons"), "household_id": hid, "type": ctype,
                "version": settings["receipt"]["document_version"], "granted": granted,
                "granted_at": iso(),
            })
        await audit("household.create", entity_type="household", entity_id=hid,
                    after={"tower": tower["name"], "flat": flat["number"]}, request=request)
    else:
        hid = household["id"]

    intent = {
        "id": new_id("intent"), "cycle_id": cycle_id, "household_id": hid, "kind": "subscription",
        "base_amount": base, "donation_amount": donation, "total_amount": base + donation,
        "components": await _components(settings, donation),
        "payer_is_member": body.payer_is_member,
        "payer_name": (body.payer_name if not body.payer_is_member else body.primary_contact_name),
        "payer_mobile": (body.payer_mobile if not body.payer_is_member else body.mobile),
        "payer_relationship": body.payer_relationship or "self",
        "status": "payment_pending", "method": "upi_qr",
        "created_at": iso(),
    }
    await db.subscription_intents.insert_one(dict(intent))
    await audit("subscription.intent.create", entity_type="subscription_intent",
                entity_id=intent["id"], correlation_id=intent["id"],
                after={"total": intent["total_amount"], "household": hid,
                       "method": intent["method"]},
                request=request)

    return {
        "intent_id": intent["id"],
        "status_token": status_token(intent["id"]),
        "base_amount": base, "donation_amount": donation, "total_amount": base + donation,
        "components": intent["components"],
        "household": {"tower_name": tower["name"], "flat_number": flat["number"]},
        "payment_method": intent["method"],
    }


@router.post("/donate")
async def donate(body: DonateIn, request: Request):
    """Create a donation-only payment intent (resident or non-resident)."""
    settings = await get_settings()
    cycle_id = await get_active_cycle_id()
    if settings["cycle"].get("is_locked"):
        raise HTTPException(status_code=423, detail="This campaign cycle is locked.")
    sub = settings.get("subscription") or {}
    if sub.get("allow_donation") is False:
        raise HTTPException(status_code=403, detail="Donations are not open for this campaign.")
    if not (body.accuracy_confirmed and body.privacy_consent and body.terms_consent):
        raise HTTPException(status_code=400, detail="All confirmations and consents are required.")
    mobile = (body.mobile or "").strip()
    if mobile and not valid_indian_mobile(mobile):
        raise HTTPException(status_code=400, detail="Enter a valid 10-digit Indian mobile number, or leave it blank.")
    body.mobile = mobile
    donor_type = (body.donor_type or "").strip().lower()
    if donor_type not in ("resident", "other"):
        raise HTTPException(status_code=400, detail="Choose whether you are a One 10 resident or other.")
    name = (body.donor_name or "").strip()
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Enter the donor full name.")

    donation = rupees_to_paise(max(body.donation_rupees or 0, 0))
    min_paise = int(sub.get("donation_min_paise") or 10000)  # default ₹100
    if donation < min_paise:
        raise HTTPException(
            status_code=400,
            detail=f"Minimum donation is {fmt_inr(min_paise)}.",
        )

    tower_name = ""
    flat_number = ""
    if donor_type == "resident":
        if not body.tower_id or not body.flat_id:
            raise HTTPException(status_code=400, detail="Select your tower and flat.")
        occ = body.occupancy_type or "owner_resident"
        if occ not in OCCUPANCY:
            raise HTTPException(status_code=400, detail="Invalid occupancy type.")
        tower = await db.towers.find_one({"id": body.tower_id})
        flat = await db.flats.find_one({"id": body.flat_id, "tower_id": body.tower_id})
        if not tower or not flat:
            raise HTTPException(status_code=400, detail="Invalid tower/flat selection.")
        tower_name = tower["name"]
        flat_number = flat["number"]
        household = await db.households.find_one({
            "cycle_id": cycle_id, "tower_id": body.tower_id, "flat_id": body.flat_id,
            "is_deleted": {"$ne": True},
        })
        if not household:
            hid = new_id("hh")
            household = {
                "id": hid, "cycle_id": cycle_id, "tower_id": body.tower_id, "tower_name": tower_name,
                "flat_id": body.flat_id, "flat_number": flat_number,
                "occupancy_type": occ, "family_members": 1,
                "primary_name": name, "primary_mobile": body.mobile,
                "email": body.email or "", "comments": body.notes or "",
                "created_at": iso(), "is_deleted": False, "source": "donation",
            }
            await db.households.insert_one(dict(household))
            await db.people.insert_one({
                "id": new_id("person"), "household_id": hid, "name": name,
                "mobile": body.mobile, "role": "primary", "created_at": iso(),
            })
        else:
            hid = household["id"]
            tower_name = household.get("tower_name") or tower_name
            flat_number = household.get("flat_number") or flat_number
    else:
        # Non-resident / other — synthetic household so receipts & UPI path stay consistent.
        hid = new_id("hh")
        ext_flat = new_id("xflat")
        tower_name = "External donor"
        flat_number = "—"
        household = {
            "id": hid, "cycle_id": cycle_id,
            "tower_id": "external", "tower_name": tower_name,
            "flat_id": ext_flat, "flat_number": flat_number,
            "occupancy_type": "other", "family_members": 1,
            "primary_name": name, "primary_mobile": body.mobile,
            "email": body.email or "",
            "city": (body.city or "").strip(),
            "organisation": (body.organisation or "").strip(),
            "relation_to_one10": (body.relation_to_one10 or "").strip(),
            "comments": body.notes or "",
            "is_external_donor": True,
            "created_at": iso(), "is_deleted": False, "source": "donation",
        }
        await db.households.insert_one(dict(household))
        await db.people.insert_one({
            "id": new_id("person"), "household_id": hid, "name": name,
            "mobile": body.mobile, "role": "donor", "created_at": iso(),
        })

    for ctype, granted in (("privacy", body.privacy_consent), ("terms", body.terms_consent)):
        await db.consents.insert_one({
            "id": new_id("cons"), "household_id": hid, "type": ctype,
            "version": (settings.get("receipt") or {}).get("document_version") or "v1",
            "granted": granted, "granted_at": iso(),
        })

    intent = {
        "id": new_id("intent"), "cycle_id": cycle_id, "household_id": hid,
        "kind": "donation",
        "donor_type": donor_type,
        "base_amount": 0, "donation_amount": donation, "total_amount": donation,
        "components": [],
        "payer_is_member": donor_type == "resident",
        "payer_name": name, "payer_mobile": body.mobile, "payer_relationship": "donor",
        "status": "payment_pending", "method": "upi_qr",
        "notes": body.notes or "",
        "created_at": iso(),
    }
    await db.subscription_intents.insert_one(dict(intent))
    await audit(
        "donation.intent.create",
        entity_type="subscription_intent",
        entity_id=intent["id"],
        correlation_id=intent["id"],
        after={"total": donation, "donor_type": donor_type, "household": hid},
        request=request,
    )
    return {
        "intent_id": intent["id"],
        "status_token": status_token(intent["id"]),
        "kind": "donation",
        "donor_type": donor_type,
        "donation_amount": donation,
        "total_amount": donation,
        "household": {"tower_name": tower_name, "flat_number": flat_number},
        "payment_method": "upi_qr",
    }


# --------------------------------------------------------------- Payment gateway (DISABLED — UPI QR only)
_GATEWAY_GONE = (
    "Online payment gateways are disabled. Please pay via the uploaded UPI QR "
    "and submit your payment screenshot."
)


@router.post("/payments/order")
async def create_order(body: dict = Body(...)):
    raise HTTPException(status_code=410, detail=_GATEWAY_GONE)


@router.post("/payments/verify")
async def verify_checkout(body: dict = Body(...), request: Request = None):
    raise HTTPException(status_code=410, detail=_GATEWAY_GONE)


@router.post("/payments/simulate")
async def simulate_payment(body: dict = Body(...), request: Request = None):
    raise HTTPException(status_code=410, detail=_GATEWAY_GONE)


@router.post("/webhooks/razorpay")
async def razorpay_webhook(request: Request):
    raise HTTPException(status_code=410, detail=_GATEWAY_GONE)


@router.post("/payments/cashfree/session")
async def cashfree_session_disabled(body: dict = Body(None)):
    raise HTTPException(status_code=410, detail=_GATEWAY_GONE)


@router.post("/payments/cashfree/verify")
async def cashfree_verify_disabled(body: dict = Body(None)):
    raise HTTPException(status_code=410, detail=_GATEWAY_GONE)


@router.api_route("/webhooks/cashfree", methods=["GET", "POST"])
async def cashfree_webhook_disabled():
    raise HTTPException(status_code=410, detail=_GATEWAY_GONE)


async def _issue_receipt(intent, *, method, masked_ref, provider_payment_id, debit_account, request=None):
    """Atomically claim the intent, allocate components, post the ledger and issue ONE receipt."""
    claimed = await db.subscription_intents.find_one_and_update(
        {"id": intent["id"], "status": {"$in": ["payment_pending", "pending", "authorised"]}},
        {"$set": {"status": "paid", "paid_at": iso()}},
        return_document=True)
    if not claimed:
        # Already paid — duplicate settlement for this intent.
        await db.duplicate_payments.insert_one({
            "id": new_id("dup"), "intent_id": intent["id"], "household_id": intent["household_id"],
            "provider_payment_id": provider_payment_id, "amount": intent["total_amount"],
            "method": method, "status": "refund_review", "created_at": iso()})
        await audit("payment.duplicate.detected", entity_type="subscription_intent",
                    entity_id=intent["id"], after={"payment_id": provider_payment_id})
        return None

    household = await db.households.find_one({"id": intent["household_id"]}, {"_id": 0}) or {}
    settings = await get_settings()
    cycle_id = intent.get("cycle_id") or await get_active_cycle_id()
    n, receipt_no = await next_formatted("receipt", settings["receipt"]["prefix"], 6)
    rid = new_id("rcpt")
    kind = intent.get("kind") or "subscription"
    if kind in ("donation", "food_subscription"):
        lines = [
            {"account_code": debit_account, "debit": intent["total_amount"], "credit": 0},
            {"account_code": "4100", "debit": 0, "credit": intent["total_amount"]},
        ]
        narration = (
            f"Food subscription receipt {receipt_no} ({method})"
            if kind == "food_subscription"
            else f"Donation receipt {receipt_no} ({method})"
        )
    else:
        lines = [{"account_code": debit_account, "debit": intent["total_amount"], "credit": 0}]
        for comp in intent.get("components") or []:
            lines.append({"account_code": comp["account_code"], "debit": 0, "credit": comp["amount_paise"]})
        if intent.get("donation_amount"):
            lines.append({"account_code": "4100", "debit": 0, "credit": intent["donation_amount"]})
        narration = f"Subscription receipt {receipt_no} ({method})"
    journal = await post_journal(source_type="receipt", source_id=rid,
                                 narration=narration,
                                 lines=lines, actor="system")
    campaign_title = settings.get("campaign", {}).get("title") or settings.get("cycle", {}).get("name") or "One 10 Events"
    receipt = {
        "id": rid, "receipt_no": receipt_no, "cycle_id": cycle_id,
        "household_id": intent.get("household_id"), "intent_id": intent["id"],
        "payment_id": provider_payment_id, "kind": kind,
        "payer_name": intent.get("payer_name") or household.get("primary_name"),
        "payer_mobile": intent.get("payer_mobile") or household.get("primary_mobile") or "",
        "tower_name": household.get("tower_name") or (
            "External donor" if kind == "donation" else ("Food subscription" if kind == "food_subscription" else "")
        ),
        "flat_number": household.get("flat_number") or (
            "—" if kind in ("donation", "food_subscription") else ""
        ),
        "base_amount": intent.get("base_amount") or 0,
        "donation_amount": intent.get("donation_amount") or 0,
        "total_amount": intent["total_amount"],
        "components": intent.get("components") or [],
        "method": method, "masked_ref": masked_ref, "status": "issued",
        "journal_id": journal["id"], "issued_at": iso(),
        "campaign_title": campaign_title,
        "donor_type": intent.get("donor_type") or "",
        "food_subscription_id": intent.get("food_subscription_id") or "",
    }
    receipt["verify_token"] = receipt_token(rid)
    await db.receipts.insert_one(dict(receipt))
    food_id = intent.get("food_subscription_id")
    if kind == "food_subscription" and food_id:
        await db.food_subscriptions.update_one(
            {"id": food_id},
            {"$set": {
                "payment_status": "paid",
                "status": "paid",
                "receipt_id": rid,
                "receipt_no": receipt_no,
                "intent_id": intent["id"],
                "updated_at": iso(),
            }},
        )
    await audit("receipt.issue", entity_type="receipt", entity_id=rid,
                correlation_id=intent.get("id") or "",
                after={"receipt_no": receipt_no, "total": receipt["total_amount"], "kind": kind}, request=request)
    await notify(channel="email", to=household.get("email", ""), template="receipt_issued",
                 subject=f"Your {campaign_title} receipt {receipt_no}",
                 data={"receipt_no": receipt_no})
    return clean(receipt)


@router.get("/payments/status/{token}")
async def payment_status(token: str):
    intent_id = read_status_token(token)
    if not intent_id:
        raise HTTPException(status_code=404, detail="Invalid or expired status token.")
    intent = await db.subscription_intents.find_one({"id": intent_id}, {"_id": 0})
    if not intent:
        raise HTTPException(status_code=404, detail="Not found.")
    receipt = await db.receipts.find_one({"intent_id": intent_id}, {"_id": 0})
    order = await db.payment_orders.find_one({"intent_id": intent_id}, sort=[("created_at", -1)])
    submission = await db.upi_submissions.find_one({"intent_id": intent_id}, {"_id": 0}, sort=[("created_at", -1)])
    warn = order and order.get("status") in ("authorised", "verification_pending")
    if receipt or intent.get("status") == "paid":
        status = "paid"
        message = "Payment recorded and receipt issued."
    elif submission and submission.get("status") == "needs_review":
        status = "needs_review"
        message = submission.get("review_message") or (
            "Screenshot received. Amount/reference needs committee review — please do not pay again."
        )
        warn = True
    elif submission and submission.get("status") in ("submitted", "llm_ok", "processing"):
        status = "processing"
        message = "Screenshot received. Checking payment details…"
        warn = True
    elif warn:
        status = intent["status"]
        message = "Verification in progress — please do not pay again."
    else:
        status = intent["status"]
        message = "Awaiting payment screenshot."
    return {
        "status": status,
        "intent_status": intent["status"],
        "total_amount": intent["total_amount"],
        "receipt_no": receipt["receipt_no"] if receipt else None,
        "verify_token": receipt["verify_token"] if receipt else None,
        "bank_verified": False if receipt and receipt.get("method") in ("upi_qr", "bank_transfer") else None,
        "submission_status": submission.get("status") if submission else None,
        "do_not_pay_again": bool(warn) or status in ("paid", "needs_review", "processing"),
        "message": message,
    }


# --------------------------------------------------------------- UPI QR + screenshot proof
def _merchant_intent_url(upi: dict, amount_rupees: str) -> str:
    """Build a tap-to-open UPI intent from the uploaded merchant QR.

    Camera-scan works because the image carries merchant params (mc/tr). A
    simplified upi://pay?pa=...&pn=...&am=... link often fails for EazyPay.
    Prefer the exact decoded merchant URI and only add amount when missing.
    """
    from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit, unquote

    raw = (upi.get("merchant_upi_uri") or "").strip()
    if not raw.lower().startswith("upi://"):
        return ""
    parts = urlsplit(raw)
    q = dict(parse_qsl(parts.query, keep_blank_values=True))
    # Keep merchant identity fields intact; fill amount for one-tap convenience.
    if amount_rupees and not (q.get("am") or "").strip():
        q["am"] = amount_rupees
    # Ensure cu is present for UPI apps.
    if not (q.get("cu") or "").strip():
        q["cu"] = "INR"
    # Re-encode without altering pa/pn/tr/mc values beyond standard query encoding.
    query = urlencode([(k, unquote(str(v))) for k, v in q.items()], doseq=False)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, query, parts.fragment))


def _upi_app_links(intent_url: str) -> dict:
    """Map a generic upi:// intent to common Android app deep links."""
    if not intent_url or not intent_url.lower().startswith("upi://"):
        return {}
    # upi://pay?...  →  <scheme>://upi/pay?...  or app-specific hosts
    suffix = intent_url.split("://", 1)[-1]  # pay?...
    query = suffix.split("?", 1)[-1] if "?" in suffix else ""
    return {
        "upi": intent_url,
        "gpay": f"gpay://upi/pay?{query}",
        "tez": f"tez://upi/pay?{query}",
        "phonepe": f"phonepe://pay?{query}",
        "paytm": f"paytmmp://pay?{query}",
        "bhim": f"bhim://pay?{query}",
        "amazon_pay": f"amazonpay://upi/pay?{query}",
    }


def _upi_payload(settings: dict, amount_paise: int, note: str = "") -> dict:
    org = settings.get("organisation") or {}
    upi = org.get("upi") or {}
    bank = org.get("bank_account") or {}
    payee = upi.get("payee_name") or bank.get("account_name") or org.get("organiser") or "EOC One10"
    vpa = (upi.get("vpa") or "").strip()
    amount_rupees = f"{amount_paise / 100:.2f}"
    merchant_uri = (upi.get("merchant_upi_uri") or "").strip()
    # When a merchant QR was uploaded (qr_locked / merchant URI), never synthesize a
    # simplified upi:// string — banks may reject it. Use the merchant URI for tap.
    qr_data = ""
    if vpa and not upi.get("qr_locked") and not merchant_uri:
        from urllib.parse import quote
        qr_data = (
            f"upi://pay?pa={quote(vpa)}&pn={quote(payee)}&am={amount_rupees}"
            f"&cu=INR&tn={quote(note or 'One10 subscription')}"
        )
    intent_url = _merchant_intent_url(upi, amount_rupees) or qr_data
    return {
        "vpa": vpa,
        "payee_name": payee,
        "amount_paise": amount_paise,
        "amount_rupees": amount_rupees,
        "qr_data": qr_data,
        "upi_intent_url": intent_url,
        "upi_app_links": _upi_app_links(intent_url),
        "static_qr_url": upi.get("static_qr_url") or "/images/payment-qr.png",
        "instructions": upi.get("instructions") or "",
        "bank_account": {
            "account_name": bank.get("account_name"),
            "account_number": bank.get("account_number"),
            "ifsc": bank.get("ifsc"),
            "bank": bank.get("bank"),
        },
    }


@router.get("/payments/upi/session")
async def upi_session(intent_id: str):
    intent = await db.subscription_intents.find_one({"id": intent_id}, {"_id": 0})
    if not intent:
        raise HTTPException(status_code=404, detail="Subscription intent not found.")
    if intent["status"] == "paid":
        raise HTTPException(status_code=409, detail="This subscription is already paid.")
    settings = await get_settings()
    payload = _upi_payload(settings, int(intent["total_amount"]), note=intent["id"][:20])
    return {
        "intent_id": intent_id,
        "status_token": status_token(intent_id),
        "total_amount": intent["total_amount"],
        "payment": payload,
        "campaign_notice": (settings.get("campaign") or {}).get("important_notice"),
    }


@router.get("/payments/upi/qr.png")
async def upi_qr_png(intent_id: str):
    """Dynamic UPI QR when VPA is configured; otherwise 404 so client uses static QR."""
    intent = await db.subscription_intents.find_one({"id": intent_id})
    if not intent:
        raise HTTPException(status_code=404, detail="Not found.")
    settings = await get_settings()
    payload = _upi_payload(settings, int(intent["total_amount"]), note=intent["id"][:20])
    if not payload["qr_data"]:
        raise HTTPException(status_code=404, detail="Dynamic UPI QR not configured.")
    from docs import qr_png
    return Response(content=qr_png(payload["qr_data"], box=6), media_type="image/png")


@router.post("/payments/upi/submit")
async def upi_submit(request: Request):
    """Resident uploads payment screenshot + reference. LLM extracts details, validates, auto-issues receipt."""
    from vision_extract import extract_payment_screenshot, normalize_ref
    from storage import save_document

    form = await request.form()
    intent_id = (form.get("intent_id") or "").strip()
    token = (form.get("status_token") or "").strip()
    reference = (form.get("reference") or "").strip()
    file = form.get("screenshot")

    if not intent_id or read_status_token(token) != intent_id:
        raise HTTPException(status_code=400, detail="Invalid payment session.")
    if not reference or len(normalize_ref(reference)) < 6:
        raise HTTPException(status_code=400, detail="Enter a valid UTR / UPI reference number.")
    if not file or not getattr(file, "filename", None):
        raise HTTPException(status_code=400, detail="Payment screenshot is required.")

    intent = await db.subscription_intents.find_one({"id": intent_id})
    if not intent:
        raise HTTPException(status_code=404, detail="Subscription intent not found.")
    if intent["status"] == "paid":
        raise HTTPException(status_code=409, detail="This subscription is already paid.")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty screenshot file.")
    if len(data) > 12 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Screenshot too large (max 12 MB).")

    content_type = getattr(file, "content_type", None) or "image/jpeg"
    filename = file.filename or "payment-screenshot.jpg"
    ref_norm = normalize_ref(reference)

    # Duplicate UTR guard
    existing_pay = await db.payments.find_one({"provider": "upi_qr", "provider_payment_id": ref_norm})
    if existing_pay and existing_pay.get("intent_id") != intent_id:
        raise HTTPException(status_code=409, detail="This payment reference was already used.")

    sub_id = new_id("upi")
    submission = {
        "id": sub_id,
        "intent_id": intent_id,
        "household_id": intent["household_id"],
        "cycle_id": intent.get("cycle_id"),
        "amount_expected_paise": int(intent["total_amount"]),
        "reference_entered": reference,
        "reference_normalized": ref_norm,
        "status": "processing",
        "proof_doc_id": None,
        "llm": {},
        "validation": {},
        "created_at": iso(),
    }
    await db.upi_submissions.insert_one(dict(submission))

    proof_doc_id = None
    try:
        doc = await save_document(
            data=data, filename=filename, doc_type="upi_proof",
            linked_type="subscription_intent", linked_id=intent_id,
            uploaded_by="resident", content_type=content_type,
        )
        proof_doc_id = doc["id"]
    except Exception as e:
        # Still continue — keep bytes path via LLM only; store failure note
        await db.upi_submissions.update_one({"id": sub_id}, {"$set": {"proof_storage_error": str(e)[:200]}})

    llm = extract_payment_screenshot(data, content_type=content_type)
    expected = int(intent["total_amount"])
    llm_amount = llm.get("amount_paise")
    llm_utr = normalize_ref(llm.get("utr") or "") if llm.get("utr") else ""

    amount_ok = llm_amount is None or abs(int(llm_amount) - expected) <= 100  # ± ₹1
    # Prefer matching entered ref to LLM UTR when LLM found one
    utr_ok = True
    if llm_utr:
        utr_ok = (llm_utr == ref_norm) or (ref_norm in llm_utr) or (llm_utr in ref_norm)
    status_ok = (llm.get("status") or "unknown") in ("success", "unknown", None)
    confidence = float(llm.get("confidence") or 0)
    llm_usable = bool(llm.get("ok"))

    auto_flags = (await get_settings()).get("feature_flags") or {}
    auto_issue = bool(auto_flags.get("llm_screenshot_auto_issue", True))

    validation = {
        "amount_ok": amount_ok,
        "utr_ok": utr_ok,
        "status_ok": status_ok,
        "llm_usable": llm_usable,
        "confidence": confidence,
    }

    # Auto-issue when: LLM ok and amount+utr pass, OR LLM unavailable but user supplied ref
    can_issue = auto_issue and amount_ok and utr_ok and status_ok and (
        (llm_usable and confidence >= 0.35) or (not llm_usable and len(ref_norm) >= 8)
    )
    # Hard block if LLM clearly saw wrong amount
    if llm_usable and llm_amount is not None and abs(int(llm_amount) - expected) > 100:
        can_issue = False

    review_message = None
    receipt = None
    final_status = "needs_review"

    if can_issue:
        try:
            await db.payments.insert_one({
                "id": new_id("pay"),
                "provider": "upi_qr",
                "provider_payment_id": ref_norm,
                "intent_id": intent_id,
                "amount": expected,
                "currency": "INR",
                "status": "captured",
                "bank_verified": False,
                "proof_doc_id": proof_doc_id,
                "created_at": iso(),
            })
        except Exception:
            # Unique conflict — already processed
            existing = await db.payments.find_one({"provider": "upi_qr", "provider_payment_id": ref_norm})
            if existing and existing.get("intent_id") == intent_id:
                receipt = await db.receipts.find_one({"intent_id": intent_id}, {"_id": 0})
                final_status = "issued" if receipt else "needs_review"
            else:
                raise HTTPException(status_code=409, detail="This payment reference was already used.")
        else:
            receipt = await _issue_receipt(
                intent,
                method="upi_qr",
                masked_ref="UTR-" + ref_norm[-4:],
                provider_payment_id=ref_norm,
                debit_account="1001",
                request=request,
            )
            if receipt:
                # Mark receipt as not bank-verified
                await db.receipts.update_one(
                    {"id": receipt["id"]},
                    {"$set": {
                        "bank_verified": False,
                        "verification_level": "committee_recorded",
                        "proof_doc_id": proof_doc_id,
                    }},
                )
                receipt["bank_verified"] = False
                final_status = "issued"
            else:
                final_status = "duplicate_payment"
                review_message = "Excess / duplicate payment queued for refund review."
    else:
        reasons = []
        if not amount_ok:
            reasons.append("amount on screenshot does not match payable total")
        if not utr_ok:
            reasons.append("UTR on screenshot does not match the reference entered")
        if llm_usable and not status_ok:
            reasons.append("payment status on screenshot is unclear")
        review_message = "Could not auto-confirm: " + ("; ".join(reasons) or "needs committee review") + ". Please do not pay again."

    await db.upi_submissions.update_one({"id": sub_id}, {"$set": {
        "status": final_status if final_status != "issued" else "issued",
        "proof_doc_id": proof_doc_id,
        "llm": {k: llm.get(k) for k in (
            "ok", "error", "amount_paise", "utr", "txn_time", "payer_name", "payee_name",
            "status", "confidence", "notes", "model",
        )},
        "validation": validation,
        "review_message": review_message,
        "payment_id": ref_norm,
        "receipt_id": receipt.get("id") if receipt else None,
        "processed_at": iso(),
    }})
    await audit(
        "upi.screenshot.submit",
        entity_type="upi_submission",
        entity_id=sub_id,
        correlation_id=intent_id,
        after={"status": final_status, "intent_id": intent_id, "ref": ref_norm[-4:]},
        request=request,
    )

    if final_status == "issued" and receipt:
        return {
            "status": "paid",
            "receipt": clean(receipt),
            "bank_verified": False,
            "message": "Receipt issued. Recorded against your payment reference (not a bank settlement confirmation).",
            "status_token": status_token(intent_id),
        }
    return {
        "status": "needs_review",
        "submission_id": sub_id,
        "bank_verified": False,
        "message": review_message or "Submitted for committee review.",
        "do_not_pay_again": True,
        "status_token": status_token(intent_id),
        "llm": {"ok": llm.get("ok"), "confidence": confidence, "amount_paise": llm_amount},
    }


# --------------------------------------------------------------- Receipt retrieval (resident)
@router.post("/receipt/pending-payment")
async def receipt_pending_payment(body: dict = Body(...), request: Request = None):
    """Find a pending subscription payment for a flat so resident can upload UTR + screenshot."""
    ip = request.client.host if request and request.client else "?"
    since = now_utc().timestamp() - 60
    recent = await db.receipt_lookups.count_documents({"ip": ip, "ts": {"$gt": since}, "kind": "pending_lookup"})
    if recent >= 8:
        raise HTTPException(status_code=429, detail="Too many attempts. Please wait a minute.")
    await db.receipt_lookups.insert_one({
        "ip": ip, "ts": now_utc().timestamp(), "kind": "pending_lookup",
        "tower_id": body.get("tower_id", ""), "flat_id": body.get("flat_id", ""),
    })

    tower_id = (body.get("tower_id") or "").strip()
    flat_id = (body.get("flat_id") or "").strip()
    mobile = (body.get("mobile") or "").strip()
    if not tower_id or not flat_id:
        raise HTTPException(status_code=400, detail="Select tower and flat.")
    if mobile and not valid_indian_mobile(mobile):
        raise HTTPException(status_code=400, detail="Enter a valid 10-digit Indian mobile, or leave it blank.")

    cycle_id = await get_active_cycle_id()
    household = await db.households.find_one({
        "cycle_id": cycle_id, "tower_id": tower_id, "flat_id": flat_id,
        "is_deleted": {"$ne": True},
    })
    if not household:
        raise HTTPException(
            status_code=404,
            detail="No subscription found for this flat. Please Subscribe & Pay first.",
        )

    hh_mobile = (household.get("primary_mobile") or "").strip()
    if mobile and hh_mobile and mobile != hh_mobile:
        raise HTTPException(status_code=404, detail="No pending payment found with those details.")

    intent = await db.subscription_intents.find_one(
        {
            "household_id": household["id"],
            "kind": "subscription",
            "status": {"$in": ["payment_pending", "pending", "authorised"]},
        },
        sort=[("created_at", -1)],
    )
    if not intent:
        paid = await db.subscription_intents.find_one(
            {"household_id": household["id"], "kind": "subscription", "status": "paid"},
            sort=[("created_at", -1)],
        )
        if paid:
            receipt = await db.receipts.find_one({"intent_id": paid["id"]}, {"_id": 0})
            if receipt:
                return {
                    "status": "already_paid",
                    "receipt_no": receipt.get("receipt_no"),
                    "verify_token": receipt.get("verify_token"),
                    "amount": fmt_inr(receipt.get("total_amount") or paid.get("total_amount") or 0),
                    "pdf_url": f"/api/receipt/pdf/{receipt['verify_token']}",
                    "message": "This flat already has a receipt.",
                }
        raise HTTPException(
            status_code=404,
            detail="No pending subscription payment for this flat.",
        )

    await audit(
        "receipt.pending_lookup",
        entity_type="subscription_intent",
        entity_id=intent["id"],
        request=request,
    )
    return {
        "status": "payment_pending",
        "intent_id": intent["id"],
        "status_token": status_token(intent["id"]),
        "total_amount": intent.get("total_amount"),
        "amount": fmt_inr(intent.get("total_amount") or 0),
        "household": {
            "tower_name": household.get("tower_name") or "",
            "flat_number": household.get("flat_number") or "",
            "primary_name": household.get("primary_name") or "",
        },
        "message": "Upload your UTR / UPI reference and payment screenshot to generate the receipt.",
    }


@router.post("/receipt/find")
async def find_receipt(body: dict = Body(...), request: Request = None):
    ip = request.client.host if request and request.client else "?"
    since = now_utc().timestamp() - 60
    recent = await db.receipt_lookups.count_documents({"ip": ip, "ts": {"$gt": since}})
    if recent >= 8:
        raise HTTPException(status_code=429, detail="Too many attempts. Please wait a minute.")
    await db.receipt_lookups.insert_one({"ip": ip, "ts": now_utc().timestamp(),
                                         "receipt_no": body.get("receipt_no", "")})
    receipt_no = (body.get("receipt_no") or "").strip()
    mobile = (body.get("mobile") or "").strip()
    r = await db.receipts.find_one({"receipt_no": receipt_no}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="No receipt found with those details.")
    household = await db.households.find_one({"id": r.get("household_id")}) if r.get("household_id") else None
    if mobile:
        stored = ""
        if household:
            stored = (household.get("primary_mobile") or "").strip()
        receipt_mobile = (r.get("payer_mobile") or "").strip()
        mobile_ok = (stored == mobile) or (receipt_mobile == mobile)
        if not mobile_ok:
            raise HTTPException(status_code=404, detail="No receipt found with those details.")
    await audit("receipt.lookup", entity_type="receipt", entity_id=r["id"], request=request)
    return {"receipt_no": r["receipt_no"], "verify_token": r["verify_token"],
            "amount": fmt_inr(r["total_amount"]), "issued_at": r["issued_at"],
            "pdf_url": f"/api/receipt/pdf/{r['verify_token']}"}


@router.get("/receipt/pdf/{token}")
async def receipt_pdf_public(token: str):
    from tokens import read_receipt_token
    rid = read_receipt_token(token)
    if not rid:
        raise HTTPException(status_code=404, detail="Invalid token.")
    r = await db.receipts.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Not found.")
    settings = await get_settings()
    base_url = (request_base_url() or "").rstrip("/")
    verify_url = f"{base_url}/receipt/verify/{token}"
    pdf = receipt_pdf(r, settings, verify_url)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{r["receipt_no"]}.pdf"'})


def request_base_url():
    import os
    return os.environ.get("APP_URL", "")


# --------------------------------------------------------------- Refunds & credit notes
@router.post("/refunds")
async def create_refund(body: dict = Body(...), request: Request = None,
                        user: dict = Depends(require("refunds:create"))):
    receipt = await db.receipts.find_one({"id": body.get("receipt_id")})
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found.")
    amount = int(body.get("amount_paise") or 0)
    already = 0
    async for rf in db.refunds.find({"receipt_id": receipt["id"],
                                     "status": {"$in": ["approved", "processing", "completed"]}}):
        already += rf.get("amount_paise", 0)
    if amount <= 0 or (already + amount) > receipt["total_amount"]:
        raise HTTPException(status_code=400, detail="Refund exceeds eligible captured amount.")
    refund = {"id": new_id("rfnd"), "receipt_id": receipt["id"], "household_id": receipt["household_id"],
              "intent_id": receipt.get("intent_id") or "",
              "amount_paise": amount, "reason": body.get("reason", ""), "status": "requested",
              "requested_by": user["user_id"], "provider_reference": body.get("provider_reference", ""),
              "created_at": iso()}
    await db.refunds.insert_one(dict(refund))
    await audit("refund.request", actor=user, entity_type="refund", entity_id=refund["id"],
                correlation_id=receipt.get("intent_id") or "",
                after={"amount": amount}, reason=refund["reason"], request=request)
    return clean(refund)


@router.post("/refunds/{refund_id}/approve")
async def approve_refund(refund_id: str, body: dict = Body(default={}), request: Request = None,
                         user: dict = Depends(require("refunds:approve")),
                         _reauth=Depends(require_reauth)):
    refund = await db.refunds.find_one({"id": refund_id})
    if not refund:
        raise HTTPException(status_code=404, detail="Not found.")
    if refund.get("requested_by") == user["user_id"]:
        raise HTTPException(status_code=403, detail="Maker cannot approve their own refund.")
    if refund["status"] != "requested":
        raise HTTPException(status_code=409, detail="Refund not in requestable state.")
    receipt = await db.receipts.find_one({"id": refund["receipt_id"]})
    settings = await get_settings()
    n, cn_no = await next_formatted("credit_note", settings["receipt"]["credit_note_prefix"], 6)
    # reversal ledger: Dr income/contra, Cr bank/clearing (money owed until provider confirms)
    lines = [{"account_code": "4900", "debit": refund["amount_paise"], "credit": 0},
             {"account_code": "1003", "debit": 0, "credit": refund["amount_paise"]}]
    journal = await post_journal(source_type="refund", source_id=refund_id,
                                 narration=f"Refund/credit note {cn_no}", lines=lines, actor=user,
                                 approved_by=user["user_id"])
    cn = {"id": new_id("cn"), "credit_note_no": cn_no, "receipt_id": receipt["id"],
          "refund_id": refund_id, "amount_paise": refund["amount_paise"], "journal_id": journal["id"],
          "created_at": iso()}
    await db.credit_notes.insert_one(dict(cn))
    await db.refunds.update_one({"id": refund_id}, {"$set": {"status": "processing",
                                                             "approved_by": user["user_id"],
                                                             "credit_note_no": cn_no,
                                                             "approved_at": iso()}})
    # partial vs full receipt status
    total_ref = refund["amount_paise"]
    new_status = "refunded" if total_ref >= receipt["total_amount"] else "partially_refunded"
    await db.receipts.update_one({"id": receipt["id"]}, {"$set": {"refund_status": new_status}})
    await audit("refund.approve", actor=user, entity_type="refund", entity_id=refund_id,
                after={"credit_note": cn_no}, approval_chain=[user["user_id"]], request=request)
    return {"ok": True, "credit_note_no": cn_no, "status": "processing"}


@router.post("/refunds/{refund_id}/complete")
async def complete_refund(refund_id: str, body: dict = Body(default={}), request: Request = None,
                          user: dict = Depends(require("refunds:approve"))):
    refund = await db.refunds.find_one({"id": refund_id})
    if not refund or refund["status"] != "processing":
        raise HTTPException(status_code=409, detail="Refund not in processing state.")
    await db.refunds.update_one({"id": refund_id}, {"$set": {
        "status": "completed", "provider_reference": body.get("provider_reference", refund.get("provider_reference", "")),
        "completed_at": iso()}})
    await audit("refund.complete", actor=user, entity_type="refund", entity_id=refund_id, request=request)
    return {"ok": True, "status": "completed"}
