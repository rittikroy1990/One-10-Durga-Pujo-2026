"""Manual payment modes with maker-checker controls, plus admin collection registers."""
from fastapi import APIRouter, Depends, Request, HTTPException, Body

from db import db, new_id, clean
from config import get_settings, get_active_cycle_id
from util import iso, valid_indian_mobile
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
    rs = await db.receipts.find({}, {"_id": 0}).sort("issued_at", -1).to_list(5000)
    return {"items": rs, "count": len(rs)}


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


@router.get("/admin/intents")
async def admin_intents(user: dict = Depends(require("payments:read"))):
    items = await db.subscription_intents.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    return {"items": items}


@router.get("/admin/receipts/{rid}/pdf")
async def admin_receipt_pdf(rid: str, user: dict = Depends(require("receipts:read"))):
    from fastapi import Response
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
