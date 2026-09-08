"""Phase 1 collection core: subscribe, Razorpay payment state machine, receipts, refunds,
and manual (cash/bank-transfer/cheque) maker-checker modes."""
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
import payments as pay
from notify import notify

router = APIRouter(prefix="/api")

OCCUPANCY = {"owner_resident", "tenant_resident", "owner_non_resident", "other"}


class SubscribeIn(BaseModel):
    primary_contact_name: str
    mobile: str
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
    donation_rupees: float = 0
    interests: list[str] = []
    accessibility_request: Optional[str] = None
    comments: Optional[str] = None
    payer_is_member: bool = True
    payer_name: Optional[str] = None
    payer_mobile: Optional[str] = None
    payer_relationship: Optional[str] = None


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
    if not valid_indian_mobile(body.mobile):
        raise HTTPException(status_code=400, detail="Enter a valid 10-digit Indian mobile number.")
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
    donation = rupees_to_paise(max(body.donation_rupees or 0, 0))

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
        "status": "payment_pending", "method": "razorpay",
        "created_at": iso(),
    }
    await db.subscription_intents.insert_one(dict(intent))
    await audit("subscription.intent.create", entity_type="subscription_intent",
                entity_id=intent["id"], after={"total": intent["total_amount"], "household": hid},
                request=request)

    return {
        "intent_id": intent["id"],
        "status_token": status_token(intent["id"]),
        "base_amount": base, "donation_amount": donation, "total_amount": base + donation,
        "components": intent["components"],
        "household": {"tower_name": tower["name"], "flat_number": flat["number"]},
    }


# --------------------------------------------------------------- Payment order + verify + webhook
@router.post("/payments/order")
async def create_order(body: dict = Body(...)):
    intent_id = body.get("intent_id")
    intent = await db.subscription_intents.find_one({"id": intent_id})
    if not intent:
        raise HTTPException(status_code=404, detail="Subscription intent not found.")
    if intent["status"] == "paid":
        raise HTTPException(status_code=409, detail="This subscription is already paid.")

    # reuse a still-valid created order
    existing = await db.payment_orders.find_one({"intent_id": intent_id, "status": "created"})
    if existing:
        return {"internal_order_id": existing["id"], "provider_order_id": existing["provider_order_id"],
                "amount": existing["expected_amount"], "currency": "INR", "key_id": pay.KEY_ID,
                "status_token": status_token(intent_id), "mode": existing.get("mode", "test")}

    amount = int(intent["total_amount"])  # server-computed only
    attempt_no = await db.payment_orders.count_documents({"intent_id": intent_id}) + 1
    provider_order_id, mode = pay.create_order(amount, receipt=intent_id[:40],
                                               notes={"household_id": intent["household_id"]})
    order = {
        "id": new_id("ord"), "intent_id": intent_id, "household_id": intent["household_id"],
        "provider": pay.PROVIDER, "provider_order_id": provider_order_id,
        "expected_amount": amount, "currency": "INR", "status": "created",
        "attempt_no": attempt_no, "mode": mode,
        "expires_at": iso(), "created_at": iso(),
    }
    await db.payment_orders.insert_one(dict(order))
    await db.payment_attempts.insert_one({
        "id": new_id("att"), "order_id": order["id"], "intent_id": intent_id,
        "attempt_no": attempt_no, "status": "created", "created_at": iso()})
    await audit("payment.order.create", entity_type="payment_order", entity_id=order["id"],
                after={"provider_order_id": provider_order_id, "amount": amount})
    return {"internal_order_id": order["id"], "provider_order_id": provider_order_id,
            "amount": amount, "currency": "INR", "key_id": pay.KEY_ID,
            "status_token": status_token(intent_id), "mode": mode}


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

    household = await db.households.find_one({"id": intent["household_id"]}, {"_id": 0})
    settings = await get_settings()
    cycle_id = intent.get("cycle_id") or await get_active_cycle_id()
    n, receipt_no = await next_formatted("receipt", settings["receipt"]["prefix"], 6)
    rid = new_id("rcpt")
    lines = [{"account_code": debit_account, "debit": intent["total_amount"], "credit": 0}]
    for comp in intent["components"]:
        lines.append({"account_code": comp["account_code"], "debit": 0, "credit": comp["amount_paise"]})
    if intent["donation_amount"]:
        lines.append({"account_code": "4100", "debit": 0, "credit": intent["donation_amount"]})
    journal = await post_journal(source_type="receipt", source_id=rid,
                                 narration=f"Subscription receipt {receipt_no} ({method})",
                                 lines=lines, actor="system")
    campaign_title = settings.get("campaign", {}).get("title") or settings.get("cycle", {}).get("name") or "One 10 Events"
    receipt = {
        "id": rid, "receipt_no": receipt_no, "cycle_id": cycle_id,
        "household_id": intent["household_id"], "intent_id": intent["id"],
        "payment_id": provider_payment_id, "kind": "subscription",
        "payer_name": intent.get("payer_name") or household.get("primary_name"),
        "tower_name": household.get("tower_name"), "flat_number": household.get("flat_number"),
        "base_amount": intent["base_amount"], "donation_amount": intent["donation_amount"],
        "total_amount": intent["total_amount"], "components": intent["components"],
        "method": method, "masked_ref": masked_ref, "status": "issued",
        "journal_id": journal["id"], "issued_at": iso(),
        "campaign_title": campaign_title,
    }
    receipt["verify_token"] = receipt_token(rid)
    await db.receipts.insert_one(dict(receipt))
    await audit("receipt.issue", entity_type="receipt", entity_id=rid,
                after={"receipt_no": receipt_no, "total": receipt["total_amount"]}, request=request)
    await notify(channel="email", to=household.get("email", ""), template="receipt_issued",
                 subject=f"Your {campaign_title} receipt {receipt_no}",
                 data={"receipt_no": receipt_no})
    return clean(receipt)


async def _finalize_online(order, provider_payment_id, request=None):
    """Idempotent finalisation of a verified online payment."""
    intent = await db.subscription_intents.find_one({"id": order["intent_id"]})
    if not intent:
        return {"status": "error", "detail": "intent missing"}
    # idempotency: unique payment record
    try:
        await db.payments.insert_one({
            "id": new_id("pay"), "provider": pay.PROVIDER, "provider_payment_id": provider_payment_id,
            "order_id": order["id"], "intent_id": order["intent_id"],
            "amount": order["expected_amount"], "currency": "INR", "status": "captured",
            "created_at": iso()})
    except Exception:
        return {"status": "already_processed", "provider_payment_id": provider_payment_id}

    # amount / currency confirmation
    if int(order["expected_amount"]) != int(intent["total_amount"]):
        await db.payment_orders.update_one({"id": order["id"]}, {"$set": {"status": "reconciliation_required"}})
        await audit("payment.reconciliation_required", entity_type="payment_order",
                    entity_id=order["id"], reason="amount mismatch")
        return {"status": "reconciliation_required"}

    receipt = await _issue_receipt(intent, method="razorpay",
                                   masked_ref="xxxx" + provider_payment_id[-4:],
                                   provider_payment_id=provider_payment_id,
                                   debit_account="1003", request=request)
    await db.payment_orders.update_one({"id": order["id"]}, {"$set": {"status": "paid"}})
    if receipt is None:
        return {"status": "duplicate_payment", "message": "Excess payment queued for refund review."}
    return {"status": "paid", "receipt": receipt}


@router.post("/payments/verify")
async def verify_checkout(body: dict = Body(...), request: Request = None):
    order_id = body.get("internal_order_id")
    provider_order_id = body.get("razorpay_order_id")
    payment_id = body.get("razorpay_payment_id")
    signature = body.get("razorpay_signature")
    order = await db.payment_orders.find_one({"id": order_id}) if order_id else \
        await db.payment_orders.find_one({"provider_order_id": provider_order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    if not pay.verify_checkout_signature(order["provider_order_id"], payment_id, signature):
        await db.payment_attempts.update_one({"order_id": order["id"]},
                                             {"$set": {"status": "signature_invalid"}})
        await audit("payment.signature.invalid", entity_type="payment_order", entity_id=order["id"])
        raise HTTPException(status_code=400, detail="Invalid payment signature.")
    result = await _finalize_online(order, payment_id, request)
    return result


@router.post("/payments/simulate")
async def simulate_payment(body: dict = Body(...), request: Request = None):
    """PREVIEW/TEST ONLY — demonstrates the verified path with a server-signed test payment.
    Disabled when RAZORPAY_MODE=live."""
    if pay.is_live():
        raise HTTPException(status_code=403, detail="Simulation disabled in live mode.")
    order = await db.payment_orders.find_one({"id": body.get("internal_order_id")})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    payment_id, signature = pay.simulate_success_signature(order["provider_order_id"])
    if not pay.verify_checkout_signature(order["provider_order_id"], payment_id, signature):
        raise HTTPException(status_code=500, detail="Simulation signature failed.")
    result = await _finalize_online(order, payment_id, request)
    result["simulated"] = True
    return result


@router.post("/webhooks/razorpay")
async def razorpay_webhook(request: Request):
    raw = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    verified = pay.verify_webhook_signature(raw, signature)
    try:
        payload = json.loads(raw.decode() or "{}")
    except Exception:
        payload = {}
    event_id = request.headers.get("X-Razorpay-Event-Id") or payload.get("id") or new_id("evt")
    event_type = payload.get("event", "")
    # persist event (idempotent by unique provider+event_id)
    try:
        await db.webhook_events.insert_one({
            "id": new_id("wh"), "provider": pay.PROVIDER, "event_id": event_id,
            "event_type": event_type, "verified": verified, "processed": False,
            "created_at": iso()})
    except Exception:
        return {"status": "duplicate", "event_id": event_id}

    if not verified:
        await audit("webhook.signature.invalid", entity_type="webhook_event", entity_id=event_id)
        raise HTTPException(status_code=400, detail="Invalid webhook signature.")

    result = {"status": "ignored"}
    try:
        entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
        provider_order_id = entity.get("order_id")
        provider_payment_id = entity.get("id")
        if event_type in ("payment.captured", "payment.authorized") and provider_order_id:
            order = await db.payment_orders.find_one({"provider_order_id": provider_order_id})
            if order:
                result = await _finalize_online(order, provider_payment_id, request)
    finally:
        await db.webhook_events.update_one({"event_id": event_id},
                                           {"$set": {"processed": True, "result": result}})
    return {"status": "processed", "event_id": event_id, "result": result}


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
    warn = order and order.get("status") in ("authorised", "verification_pending")
    return {
        "status": intent["status"],
        "total_amount": intent["total_amount"],
        "receipt_no": receipt["receipt_no"] if receipt else None,
        "verify_token": receipt["verify_token"] if receipt else None,
        "do_not_pay_again": bool(warn),
        "message": ("Verification in progress — please do not pay again."
                    if warn else ("Payment verified." if receipt else "Awaiting payment.")),
    }


# --------------------------------------------------------------- Receipt retrieval (resident)
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
    household = await db.households.find_one({"id": r["household_id"]})
    if not household or household.get("primary_mobile") != mobile:
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
              "amount_paise": amount, "reason": body.get("reason", ""), "status": "requested",
              "requested_by": user["user_id"], "provider_reference": body.get("provider_reference", ""),
              "created_at": iso()}
    await db.refunds.insert_one(dict(refund))
    await audit("refund.request", actor=user, entity_type="refund", entity_id=refund["id"],
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
