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


def _intent_due_paise(intent: dict) -> int:
    if intent.get("amount_due_paise") is not None:
        return max(0, int(intent["amount_due_paise"]))
    return max(0, int(intent.get("total_amount") or 0))


def _payable_heads(intent: dict) -> list:
    """Current unpaid heads (components + donation) for proportional allocation."""
    heads = []
    for c in intent.get("components") or []:
        amt = int(c.get("amount_paise") or 0)
        if amt > 0:
            heads.append({
                "code": c.get("code") or "",
                "label": c.get("label") or c.get("code") or "Component",
                "amount_paise": amt,
                "account_code": c.get("account_code") or "4001",
            })
    don = int(intent.get("donation_amount") or 0)
    if don > 0:
        heads.append({
            "code": "DONATION",
            "label": "Voluntary Donation",
            "amount_paise": don,
            "account_code": "4100",
        })
    if not heads:
        total = _intent_due_paise(intent)
        if total > 0:
            kind = intent.get("kind") or "subscription"
            if kind == "donation":
                label, acct, code = "Voluntary Donation", "4100", "DONATION"
            elif kind == "food_subscription":
                label, acct, code = "Food Subscription", "4100", "FOOD"
            else:
                label, acct, code = "Subscription", "4001", "SUB"
            heads.append({"code": code, "label": label, "amount_paise": total, "account_code": acct})
    return heads


def _proportion_allocate(heads: list, paid_paise: int) -> list:
    """Split paid_paise across heads in proportion to their amounts (paise-exact)."""
    total = sum(int(h["amount_paise"]) for h in heads)
    if paid_paise <= 0 or total <= 0:
        return []
    paid = min(int(paid_paise), total)
    if paid >= total:
        return [{**h, "amount_paise": int(h["amount_paise"])} for h in heads]
    out, used = [], 0
    for i, h in enumerate(heads):
        if i == len(heads) - 1:
            share = paid - used
        else:
            share = (paid * int(h["amount_paise"])) // total
            used += share
        out.append({**h, "amount_paise": int(share)})
    return out


def _subtract_heads(heads: list, allocated: list) -> list:
    taken = {a.get("code"): int(a["amount_paise"]) for a in allocated}
    rem = []
    for h in heads:
        left = int(h["amount_paise"]) - taken.get(h.get("code"), 0)
        if left > 0:
            rem.append({**h, "amount_paise": left})
    return rem


@router.post("/subscribe")
async def subscribe(body: SubscribeIn, request: Request):
    settings = await get_settings()
    cycle_id = await get_active_cycle_id()
    if settings["cycle"].get("is_locked"):
        raise HTTPException(status_code=423, detail="This campaign cycle is locked.")
    if not (body.accuracy_confirmed and body.privacy_consent and body.terms_consent):
        raise HTTPException(status_code=400, detail="All confirmations and consents are required.")
    mobile = (body.mobile or "").strip()
    if not valid_indian_mobile(mobile):
        raise HTTPException(status_code=400, detail="Enter a valid 10-digit Indian mobile number.")
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
    if not valid_indian_mobile(mobile):
        raise HTTPException(status_code=400, detail="Enter a valid 10-digit Indian mobile number.")
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


async def _issue_receipt(intent, *, method, masked_ref, provider_payment_id, debit_account, request=None,
                         paid_amount_paise=None, bank_verified: bool = True,
                         issuance_source: str = "collection"):
    """Atomically settle (full or partial), allocate heads, post ledger and issue ONE receipt.

    bank_verified=True for committee/cash/bank collection paths.
    bank_verified=False for resident screenshot self-serve (issued, not bank verified).
    """
    due = _intent_due_paise(intent)
    paid = int(paid_amount_paise if paid_amount_paise is not None else due)
    if paid <= 0:
        return None
    if paid > due:
        paid = due

    heads = _payable_heads(intent)
    allocated = _proportion_allocate(heads, paid)
    if not allocated:
        return None
    is_full = paid >= due
    remaining_heads = [] if is_full else _subtract_heads(heads, allocated)
    remaining_total = 0 if is_full else sum(int(h["amount_paise"]) for h in remaining_heads)
    rem_comps = [h for h in remaining_heads if h.get("code") != "DONATION"]
    rem_don = sum(int(h["amount_paise"]) for h in remaining_heads if h.get("code") == "DONATION")
    alloc_comps = [h for h in allocated if h.get("code") != "DONATION"]
    alloc_don = sum(int(h["amount_paise"]) for h in allocated if h.get("code") == "DONATION")
    # Heads that used synthetic SUB/FOOD codes still count as base components on the receipt
    if not alloc_comps and not alloc_don:
        alloc_comps = list(allocated)
    already_paid = int(intent.get("amount_paid_paise") or 0) + paid
    original_total = int(intent.get("original_total_amount") or (int(intent.get("amount_paid_paise") or 0) + due))
    new_status = "paid" if is_full else "partially_paid"

    update = {
        "status": new_status,
        "last_payment_at": iso(),
        "amount_paid_paise": already_paid,
        "amount_due_paise": remaining_total,
        "original_total_amount": original_total,
        "total_amount": original_total if is_full else remaining_total,
    }
    if is_full:
        update["paid_at"] = iso()
        if intent.get("original_components") is not None:
            update["components"] = intent.get("original_components")
            update["donation_amount"] = int(intent.get("original_donation_amount") or 0)
            update["base_amount"] = int(intent.get("original_base_amount") or 0)
        else:
            update["components"] = intent.get("components") or []
            update["donation_amount"] = int(intent.get("donation_amount") or 0)
            update["base_amount"] = int(intent.get("base_amount") or 0)
    else:
        update["partially_paid_at"] = iso()
        update["components"] = rem_comps
        update["donation_amount"] = rem_don
        update["base_amount"] = sum(int(c["amount_paise"]) for c in rem_comps)
        if not intent.get("original_components"):
            update["original_components"] = intent.get("components") or []
            update["original_donation_amount"] = int(intent.get("donation_amount") or 0)
            update["original_base_amount"] = int(intent.get("base_amount") or 0)

    claimed = await db.subscription_intents.find_one_and_update(
        {"id": intent["id"], "status": {"$in": ["payment_pending", "pending", "authorised", "partially_paid"]}},
        {"$set": update},
        return_document=True)
    if not claimed:
        await db.duplicate_payments.insert_one({
            "id": new_id("dup"), "intent_id": intent["id"], "household_id": intent["household_id"],
            "provider_payment_id": provider_payment_id, "amount": paid,
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

    lines = [{"account_code": debit_account, "debit": paid, "credit": 0}]
    for h in allocated:
        if int(h["amount_paise"]) > 0:
            lines.append({"account_code": h["account_code"], "debit": 0, "credit": int(h["amount_paise"])})
    kind_label = (
        "Food subscription" if kind == "food_subscription"
        else ("Donation" if kind == "donation" else "Subscription")
    )
    narration = f"{'Partial ' if not is_full else ''}{kind_label} receipt {receipt_no} ({method})"
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
        "base_amount": sum(int(c["amount_paise"]) for c in alloc_comps),
        "donation_amount": alloc_don,
        "total_amount": paid,
        "components": alloc_comps,
        "method": method, "masked_ref": masked_ref, "status": "issued",
        "bank_verified": bool(bank_verified),
        "issuance_source": issuance_source or ("payment_screenshot" if not bank_verified else "collection"),
        "journal_id": journal["id"], "issued_at": iso(),
        "campaign_title": campaign_title,
        "donor_type": intent.get("donor_type") or "",
        "food_subscription_id": intent.get("food_subscription_id") or "",
        "is_partial": not is_full,
        "amount_due_after": remaining_total,
        "original_total_amount": original_total,
        "amount_paid_to_date": already_paid,
    }
    receipt["verify_token"] = receipt_token(rid)
    await db.receipts.insert_one(dict(receipt))
    food_id = intent.get("food_subscription_id")
    if kind == "food_subscription" and food_id and is_full:
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
                after={"receipt_no": receipt_no, "total": receipt["total_amount"], "kind": kind,
                       "partial": not is_full, "due_after": remaining_total}, request=request)
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
    receipt = await db.receipts.find_one({"intent_id": intent_id}, {"_id": 0}, sort=[("issued_at", -1)])
    order = await db.payment_orders.find_one({"intent_id": intent_id}, sort=[("created_at", -1)])
    submission = await db.upi_submissions.find_one({"intent_id": intent_id}, {"_id": 0}, sort=[("created_at", -1)])
    warn = order and order.get("status") in ("authorised", "verification_pending")
    settings = await get_settings()
    due = _intent_due_paise(intent)
    residual_payment = None

    if intent.get("status") == "partially_paid" and due > 0:
        status = "partially_paid"
        residual_payment = _upi_payload(settings, due, note=intent["id"][:20])
        paid_amt = int(intent.get("amount_paid_paise") or (receipt or {}).get("total_amount") or 0)
        message = (
            f"Partial receipt issued for {fmt_inr(paid_amt)}. "
            f"Please pay the remaining {fmt_inr(due)} and upload the new payment screenshot."
        )
    elif receipt or intent.get("status") == "paid":
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

    payload = {
        "status": status,
        "intent_status": intent["status"],
        "intent_id": intent_id,
        "status_token": status_token(intent_id),
        "total_amount": intent.get("original_total_amount") or intent.get("total_amount"),
        "amount_due_paise": due if intent.get("status") == "partially_paid" else (
            0 if intent.get("status") == "paid" else due
        ),
        "amount_paid_paise": int(intent.get("amount_paid_paise") or 0),
        "receipt_no": receipt["receipt_no"] if receipt else None,
        "verify_token": receipt["verify_token"] if receipt else None,
        "receipt_amount": receipt.get("total_amount") if receipt else None,
        "bank_verified": (_receipt_is_bank_verified(receipt) if receipt else None),
        "submission_status": submission.get("status") if submission else None,
        "do_not_pay_again": bool(warn) or status in ("paid", "needs_review", "processing"),
        "message": message,
    }
    if residual_payment:
        payload["residual_amount"] = due
        payload["residual_amount_fmt"] = fmt_inr(due)
        payload["paid_amount_fmt"] = fmt_inr(int(intent.get("amount_paid_paise") or 0))
        payload["payment"] = residual_payment
        payload["qr_url"] = f"/api/payments/upi/qr.png?intent_id={intent_id}"
        payload["components_due"] = intent.get("components") or []
    return payload


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
    # Keep merchant identity fields intact; always set amount for the payable due.
    if amount_rupees:
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
    payee = upi.get("payee_name") or bank.get("account_name") or org.get("organiser") or "ONE 10 EVENT ORGANISING COMMITEE"
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
    due = _intent_due_paise(intent)
    payload = _upi_payload(settings, due, note=intent["id"][:20])
    return {
        "intent_id": intent_id,
        "status_token": status_token(intent_id),
        "total_amount": due,
        "original_total_amount": intent.get("original_total_amount") or intent.get("total_amount"),
        "amount_paid_paise": int(intent.get("amount_paid_paise") or 0),
        "amount_due_paise": due,
        "partially_paid": intent.get("status") == "partially_paid",
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
    payload = _upi_payload(settings, _intent_due_paise(intent), note=intent["id"][:20])
    qr_source = payload.get("qr_data") or payload.get("upi_intent_url") or ""
    if not qr_source:
        raise HTTPException(status_code=404, detail="Dynamic UPI QR not configured.")
    from docs import qr_png
    return Response(content=qr_png(qr_source, box=6), media_type="image/png")


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

    # Duplicate UTR guard (captured payments)
    existing_pay = await db.payments.find_one({"provider": "upi_qr", "provider_payment_id": ref_norm})
    if existing_pay and existing_pay.get("intent_id") != intent_id:
        raise HTTPException(status_code=409, detail="This payment reference was already used.")

    expected = _intent_due_paise(intent)

    # Reuse prior submission for same UTR (retry after review / network errors / new session)
    existing_sub = await db.upi_submissions.find_one({"reference_normalized": ref_norm})
    if existing_sub:
        existing_intent_id = existing_sub.get("intent_id")
        can_reclaim = False
        if existing_intent_id == intent_id:
            can_reclaim = True
        elif existing_sub.get("receipt_id") or existing_sub.get("status") in ("issued", "partial"):
            can_reclaim = False
        else:
            # Page refresh creates a new intent — reclaim unissued UTRs for same household/payer.
            old_intent = await db.subscription_intents.find_one({"id": existing_intent_id}) or {}
            same_hh = bool(old_intent.get("household_id") and old_intent.get("household_id") == intent.get("household_id"))
            same_payer = (
                (old_intent.get("payer_name") or "").strip().lower()
                == (intent.get("payer_name") or "").strip().lower()
                and (old_intent.get("payer_name") or "").strip() != ""
            )
            same_amount = abs(int(old_intent.get("total_amount") or 0) - int(intent.get("total_amount") or 0)) <= 100
            unissued = existing_sub.get("status") in ("needs_review", "processing", "submitted", "llm_ok") and not existing_sub.get("receipt_id")
            can_reclaim = unissued and same_amount and (same_hh or same_payer)

        if existing_intent_id != intent_id and not can_reclaim:
            raise HTTPException(
                status_code=409,
                detail="This UTR / UPI reference was already submitted for another payment.",
            )

        if existing_sub.get("receipt_id") or existing_sub.get("status") in ("issued", "partial"):
            receipt = await db.receipts.find_one({"id": existing_sub.get("receipt_id")}, {"_id": 0}) if existing_sub.get("receipt_id") else None
            if not receipt:
                receipt = await db.receipts.find_one({"intent_id": existing_intent_id, "payment_id": ref_norm}, {"_id": 0})
            if receipt:
                return {
                    "status": "paid" if not receipt.get("is_partial") else "partially_paid",
                    "receipt": clean(receipt),
                    "bank_verified": False,
                    "message": "Receipt already issued for this payment reference.",
                    "status_token": status_token(receipt.get("intent_id") or existing_intent_id),
                }

        sub_id = existing_sub["id"]
        await db.upi_submissions.update_one({"id": sub_id}, {"$set": {
            "intent_id": intent_id,
            "household_id": intent["household_id"],
            "status": "processing",
            "amount_expected_paise": expected,
            "reference_entered": reference,
            "llm": {},
            "validation": {},
            "review_message": None,
            "reclaimed_from_intent": existing_intent_id if existing_intent_id != intent_id else None,
            "retried_at": iso(),
        }})
    else:
        sub_id = new_id("upi")
        submission = {
            "id": sub_id,
            "intent_id": intent_id,
            "household_id": intent["household_id"],
            "cycle_id": intent.get("cycle_id"),
            "amount_expected_paise": expected,
            "reference_entered": reference,
            "reference_normalized": ref_norm,
            "status": "processing",
            "proof_doc_id": None,
            "llm": {},
            "validation": {},
            "created_at": iso(),
        }
        try:
            await db.upi_submissions.insert_one(dict(submission))
        except Exception as e:
            # Race on unique reference — reload and continue if reclaimable
            existing_sub = await db.upi_submissions.find_one({"reference_normalized": ref_norm})
            if not existing_sub:
                raise HTTPException(status_code=409, detail="This UTR / UPI reference was already submitted.") from e
            if existing_sub.get("intent_id") != intent_id and existing_sub.get("receipt_id"):
                raise HTTPException(status_code=409, detail="This UTR / UPI reference was already submitted.") from e
            sub_id = existing_sub["id"]
            await db.upi_submissions.update_one({"id": sub_id}, {"$set": {
                "intent_id": intent_id,
                "household_id": intent["household_id"],
                "status": "processing",
                "amount_expected_paise": expected,
                "reference_entered": reference,
                "retried_at": iso(),
            }})

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
    from vision_extract import coerce_amount_paise

    # Screenshot OCR is used for TWO checks only:
    #   1) amount on screenshot >= ₹3,500 (subscription floor)
    #   2) payee is M S / One10 Events Organising Committee
    # The resident-entered UTR is stored for records — we do NOT match it against the image.
    MIN_SCREENSHOT_AMOUNT_PAISE = 350000  # ₹3,500

    llm_amount = llm.get("amount_paise")
    org_match = llm.get("org_match") or {}
    org_ok = bool(org_match.get("ok"))

    paid_amount = None
    if llm.get("ok") and llm_amount is not None and int(llm_amount) > 0:
        paid_amount = coerce_amount_paise(int(llm_amount), expected)

    amount_ok = paid_amount is not None and paid_amount >= (MIN_SCREENSHOT_AMOUNT_PAISE - 100)
    status_ok = (llm.get("status") or "unknown") in ("success", "unknown", None)
    confidence = float(llm.get("confidence") or 0)
    llm_usable = bool(llm.get("ok"))

    auto_flags = (await get_settings()).get("feature_flags") or {}
    auto_issue = bool(auto_flags.get("llm_screenshot_auto_issue", True))

    validation = {
        "amount_ok": amount_ok,
        "amount_floor_paise": MIN_SCREENSHOT_AMOUNT_PAISE,
        "utr_ok": True,  # UTR is never validated from the screenshot
        "org_ok": org_ok,
        "org_match": org_match,
        "status_ok": status_ok,
        "llm_usable": llm_usable,
        "confidence": confidence,
        "paid_amount_paise": paid_amount,
        "payee_name": llm.get("payee_name") or llm.get("org_name"),
    }

    # Auto-issue when screenshot shows ≥ ₹3,500 to our committee. Settle at the intent due.
    can_issue = (
        auto_issue and org_ok and amount_ok and status_ok
        and llm_usable and confidence >= 0.35
    )

    review_message = None
    receipt = None
    final_status = "needs_review"
    residual = None
    settings = await get_settings()

    if can_issue:
        settle_amount = expected
        try:
            await db.payments.insert_one({
                "id": new_id("pay"),
                "provider": "upi_qr",
                "provider_payment_id": ref_norm,
                "intent_id": intent_id,
                "amount": settle_amount,
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
                receipt = await db.receipts.find_one(
                    {"intent_id": intent_id, "payment_id": ref_norm}, {"_id": 0}
                ) or await db.receipts.find_one({"intent_id": intent_id}, {"_id": 0}, sort=[("issued_at", -1)])
                final_status = "issued" if receipt else "needs_review"
            else:
                raise HTTPException(status_code=409, detail="This payment reference was already used.")
        else:
            # Refresh intent in case of concurrent partials
            intent = await db.subscription_intents.find_one({"id": intent_id}) or intent
            # Screenshot self-serve: issued, but explicitly not bank verified.
            receipt = await _issue_receipt(
                intent,
                method="upi_qr",
                masked_ref="UTR-" + ref_norm[-4:],
                provider_payment_id=ref_norm,
                debit_account="1001",
                request=request,
                paid_amount_paise=settle_amount,
                bank_verified=False,
                issuance_source="payment_screenshot",
            )
            if receipt:
                await db.receipts.update_one(
                    {"id": receipt["id"]},
                    {"$set": {
                        "bank_verified": False,
                        "issuance_source": "payment_screenshot",
                        "verification_level": "committee_recorded",
                        "proof_doc_id": proof_doc_id,
                    }},
                )
                receipt["bank_verified"] = False
                receipt["issuance_source"] = "payment_screenshot"
                final_status = "partial" if receipt.get("is_partial") else "issued"
                if receipt.get("is_partial"):
                    due_after = int(receipt.get("amount_due_after") or 0)
                    residual = {
                        "amount_paise": due_after,
                        "amount_fmt": fmt_inr(due_after),
                        "payment": _upi_payload(settings, due_after, note=intent_id[:20]),
                        "qr_url": f"/api/payments/upi/qr.png?intent_id={intent_id}",
                    }
            else:
                final_status = "duplicate_payment"
                review_message = "Excess / duplicate payment queued for refund review."
    else:
        reasons = []
        if not org_ok:
            reasons.append(
                org_match.get("reason")
                or "payee on screenshot is not M S ONE 10 EVENT ORGANISING COMMITEE"
            )
        if paid_amount is None:
            reasons.append("could not read payment amount from screenshot")
        elif not amount_ok:
            reasons.append("amount on screenshot is less than ₹3,500")
        if llm_usable and not status_ok:
            reasons.append("payment status on screenshot is unclear")
        review_message = (
            "Could not auto-confirm: "
            + ("; ".join(reasons) or "needs committee review")
            + ". Screenshot must show ₹3,500 or more paid to "
            "M S ONE 10 EVENT ORGANISING COMMITEE. Please do not pay again."
        )
    await db.upi_submissions.update_one({"id": sub_id}, {"$set": {
        "status": (
            "issued" if final_status == "issued"
            else ("partial" if final_status == "partial" else final_status)
        ),
        "proof_doc_id": proof_doc_id,
        "llm": {k: llm.get(k) for k in (
            "ok", "error", "amount_paise", "utr", "utr_candidates", "txn_time", "payer_name", "payee_name",
            "org_name", "org_match", "status", "confidence", "notes", "model",
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
    if final_status == "partial" and receipt:
        due_after = int(receipt.get("amount_due_after") or 0)
        return {
            "status": "partially_paid",
            "receipt": clean(receipt),
            "bank_verified": False,
            "message": (
                f"Partial receipt issued for {fmt_inr(receipt['total_amount'])}. "
                f"Please pay the remaining {fmt_inr(due_after)}."
            ),
            "status_token": status_token(intent_id),
            "intent_id": intent_id,
            "residual_amount": due_after,
            "residual_amount_fmt": fmt_inr(due_after),
            "paid_amount_fmt": fmt_inr(receipt["total_amount"]),
            "payment": (residual or {}).get("payment"),
            "qr_url": (residual or {}).get("qr_url") or f"/api/payments/upi/qr.png?intent_id={intent_id}",
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
async def _receipt_lookup_rate_limit(request: Request, *, kind: str, tower_id: str = "", flat_id: str = ""):
    ip = request.client.host if request and request.client else "?"
    since = now_utc().timestamp() - 60
    recent = await db.receipt_lookups.count_documents({"ip": ip, "ts": {"$gt": since}, "kind": kind})
    if recent >= 8:
        raise HTTPException(status_code=429, detail="Too many attempts. Please wait a minute.")
    await db.receipt_lookups.insert_one({
        "ip": ip, "ts": now_utc().timestamp(), "kind": kind,
        "tower_id": tower_id or "", "flat_id": flat_id or "",
    })


def _receipt_is_bank_verified(receipt: dict) -> bool:
    """Screenshot self-serve receipts are not bank verified; collection/found receipts are."""
    from docs import receipt_is_bank_verified
    return receipt_is_bank_verified(receipt)


def _receipt_public_card(receipt: dict) -> dict:
    token = receipt.get("verify_token") or ""
    bank_verified = _receipt_is_bank_verified(receipt)
    return {
        "receipt_no": receipt.get("receipt_no"),
        "verify_token": token,
        "amount": fmt_inr(receipt.get("total_amount") or 0),
        "issued_at": receipt.get("issued_at"),
        "kind": receipt.get("kind") or "subscription",
        "payer_name": receipt.get("payer_name") or "",
        "pdf_url": f"/api/receipt/pdf/{token}" if token else None,
        "status": receipt.get("status") or "issued",
        "bank_verified": bank_verified,
    }


@router.post("/receipt/by-flat")
async def receipt_by_flat(body: dict = Body(...), request: Request = None):
    """Step 1: look up issued receipts (and any pending payment) by tower + flat."""
    tower_id = (body.get("tower_id") or "").strip()
    flat_id = (body.get("flat_id") or "").strip()
    if not tower_id or not flat_id:
        raise HTTPException(status_code=400, detail="Select tower and flat.")
    await _receipt_lookup_rate_limit(request, kind="by_flat", tower_id=tower_id, flat_id=flat_id)

    cycle_id = await get_active_cycle_id()
    household = await db.households.find_one({
        "cycle_id": cycle_id, "tower_id": tower_id, "flat_id": flat_id,
        "is_deleted": {"$ne": True},
    }, {"_id": 0})

    receipts = []
    pending = None
    if household:
        cursor = db.receipts.find(
            {"household_id": household["id"], "status": {"$in": ["issued", "partially_refunded"]}},
            {"_id": 0},
        ).sort("issued_at", -1)
        async for r in cursor:
            receipts.append(_receipt_public_card(r))

        intent = await db.subscription_intents.find_one(
            {
                "household_id": household["id"],
                "kind": "subscription",
                "status": {"$in": ["payment_pending", "pending", "authorised", "partially_paid"]},
            },
            sort=[("created_at", -1)],
        )
        if intent:
            pending = {
                "intent_id": intent["id"],
                "status_token": status_token(intent["id"]),
                "amount": fmt_inr(_intent_due_paise(intent)),
                "total_amount": _intent_due_paise(intent),
            }

    await audit(
        "receipt.by_flat",
        entity_type="household",
        entity_id=(household or {}).get("id") or "",
        after={"tower_id": tower_id, "flat_id": flat_id, "receipts": len(receipts), "pending": bool(pending)},
        request=request,
    )

    if receipts:
        return {
            "status": "found",
            "household": {
                "tower_name": household.get("tower_name") or "",
                "flat_number": household.get("flat_number") or "",
                "primary_name": household.get("primary_name") or "",
            },
            "receipts": receipts,
            "pending": pending,
            "message": "Receipt(s) found for this flat. You can download them below.",
        }

    return {
        "status": "not_found",
        "household": ({
            "tower_name": household.get("tower_name") or "",
            "flat_number": household.get("flat_number") or "",
            "primary_name": household.get("primary_name") or "",
        } if household else None),
        "receipts": [],
        "pending": pending,
        "message": (
            "No receipt yet for this flat. Enter your details and upload the payment screenshot "
            "to generate and record a receipt."
            if pending or household else
            "No receipt yet for this flat. Enter your name, mobile, UPI reference and payment "
            "screenshot to generate and record a receipt."
        ),
    }


@router.post("/receipt/start-from-proof")
async def receipt_start_from_proof(body: dict = Body(...), request: Request = None):
    """Step 2 when no receipt: create/reuse a pending payment so UTR + screenshot can issue a receipt."""
    tower_id = (body.get("tower_id") or "").strip()
    flat_id = (body.get("flat_id") or "").strip()
    name = (body.get("name") or "").strip()
    mobile = (body.get("mobile") or "").strip()
    await _receipt_lookup_rate_limit(request, kind="start_from_proof", tower_id=tower_id, flat_id=flat_id)

    if not tower_id or not flat_id:
        raise HTTPException(status_code=400, detail="Select tower and flat.")
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Enter the payer / resident name.")
    if not valid_indian_mobile(mobile):
        raise HTTPException(status_code=400, detail="Enter a valid 10-digit Indian mobile number.")

    tower = await db.towers.find_one({"id": tower_id})
    flat = await db.flats.find_one({"id": flat_id, "tower_id": tower_id})
    if not tower or not flat:
        raise HTTPException(status_code=400, detail="Invalid tower/flat selection.")

    settings = await get_settings()
    cycle_id = await get_active_cycle_id()
    if settings.get("cycle", {}).get("is_locked"):
        raise HTTPException(status_code=423, detail="This campaign cycle is locked.")

    household = await db.households.find_one({
        "cycle_id": cycle_id, "tower_id": tower_id, "flat_id": flat_id,
        "is_deleted": {"$ne": True},
    })
    if not household:
        hid = new_id("hh")
        household = {
            "id": hid, "cycle_id": cycle_id, "tower_id": tower_id, "tower_name": tower["name"],
            "flat_id": flat_id, "flat_number": flat["number"],
            "occupancy_type": "other", "family_members": 1,
            "family_display_name": name, "primary_name": name, "primary_mobile": mobile,
            "email": "", "alternate_contact": "", "interests": [], "comments": "Created via receipt proof workflow",
            "has_accessibility_request": False, "accessibility_request": "",
            "created_at": iso(), "is_deleted": False,
        }
        await db.households.insert_one(dict(household))
        await db.people.insert_one({
            "id": new_id("person"), "household_id": hid, "name": name,
            "mobile": mobile, "role": "primary", "created_at": iso(),
        })
        await audit(
            "household.create",
            entity_type="household",
            entity_id=hid,
            after={"tower": tower["name"], "flat": flat["number"], "via": "receipt_proof"},
            request=request,
        )
    else:
        hid = household["id"]
        # Keep contact fresh for committee follow-up when resident self-serves a receipt.
        patch = {}
        if not (household.get("primary_name") or "").strip():
            patch["primary_name"] = name
        if not (household.get("primary_mobile") or "").strip():
            patch["primary_mobile"] = mobile
        if patch:
            await db.households.update_one({"id": hid}, {"$set": patch})
            household = {**household, **patch}

    # Existing receipts for this household → download instead of re-issuing.
    existing = []
    async for r in db.receipts.find(
        {"household_id": hid, "status": {"$in": ["issued", "partially_refunded"]}},
        {"_id": 0},
    ).sort("issued_at", -1):
        existing.append(_receipt_public_card(r))
    if existing:
        return {
            "status": "already_paid",
            "receipts": existing,
            "receipt_no": existing[0].get("receipt_no"),
            "verify_token": existing[0].get("verify_token"),
            "amount": existing[0].get("amount"),
            "pdf_url": existing[0].get("pdf_url"),
            "message": "This flat already has a receipt.",
        }

    intent = await db.subscription_intents.find_one(
        {
            "household_id": hid,
            "kind": "subscription",
            "status": {"$in": ["payment_pending", "pending", "authorised", "partially_paid"]},
        },
        sort=[("created_at", -1)],
    )
    if not intent:
        base = int(settings["subscription"]["base_amount_paise"])
        donation = 0
        intent = {
            "id": new_id("intent"), "cycle_id": cycle_id, "household_id": hid, "kind": "subscription",
            "base_amount": base, "donation_amount": donation, "total_amount": base + donation,
            "components": await _components(settings, donation),
            "payer_is_member": True,
            "payer_name": name,
            "payer_mobile": mobile,
            "payer_relationship": "self",
            "status": "payment_pending", "method": "upi_qr",
            "created_at": iso(),
            "source": "receipt_proof_workflow",
        }
        await db.subscription_intents.insert_one(dict(intent))
        await audit(
            "subscription.intent.create",
            entity_type="subscription_intent",
            entity_id=intent["id"],
            correlation_id=intent["id"],
            after={"total": intent["total_amount"], "household": hid, "via": "receipt_proof"},
            request=request,
        )
    else:
        await db.subscription_intents.update_one(
            {"id": intent["id"]},
            {"$set": {"payer_name": name, "payer_mobile": mobile}},
        )

    await audit(
        "receipt.start_from_proof",
        entity_type="subscription_intent",
        entity_id=intent["id"],
        request=request,
    )
    due = _intent_due_paise(intent)
    return {
        "status": "payment_pending",
        "intent_id": intent["id"],
        "status_token": status_token(intent["id"]),
        "total_amount": due,
        "amount": fmt_inr(due),
        "household": {
            "tower_name": household.get("tower_name") or tower["name"],
            "flat_number": household.get("flat_number") or flat["number"],
            "primary_name": name,
        },
        "message": "Upload your UTR / UPI reference and payment screenshot to generate the receipt.",
    }


@router.post("/receipt/pending-payment")
async def receipt_pending_payment(body: dict = Body(...), request: Request = None):
    """Find a pending subscription payment for a flat so resident can upload UTR + screenshot."""
    await _receipt_lookup_rate_limit(
        request,
        kind="pending_lookup",
        tower_id=(body.get("tower_id") or ""),
        flat_id=(body.get("flat_id") or ""),
    )

    name = (body.get("name") or "").strip()
    tower_id = (body.get("tower_id") or "").strip()
    flat_id = (body.get("flat_id") or "").strip()
    mobile = (body.get("mobile") or "").strip()
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Enter the name used at subscription.")
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

    def _norm_name(s: str) -> str:
        return " ".join((s or "").strip().lower().split())

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

    stored_names = {
        _norm_name(household.get("primary_name") or ""),
        _norm_name(household.get("family_display_name") or ""),
    }
    if intent:
        stored_names.add(_norm_name(intent.get("payer_name") or ""))
    stored_names.discard("")
    if stored_names and _norm_name(name) not in stored_names:
        raise HTTPException(status_code=404, detail="No pending payment found with those details.")

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
