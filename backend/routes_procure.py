"""Phase 2: budget, procure-to-pay, vendors (bank-change approval), advances, expense claims."""
from fastapi import APIRouter, Depends, Request, HTTPException, Body

from db import db, new_id, clean
from config import get_settings, EVENTS
from util import iso, now_utc
from audit import audit, next_formatted
from ledger import post_journal, LedgerError
from auth import require, require_reauth, user_permissions
from crud import register_crud

router = APIRouter(prefix="/api")

# Generic masters
register_crud(router, "quotations", read_perm="budget:read", write_perm="procurement:create",
              id_prefix="quo", default_status="received")
register_crud(router, "goods_service_confirmations", read_perm="budget:read",
              write_perm="procurement:create", id_prefix="gsc", default_status="confirmed")


# --------------------------------------------------------------- Budget
@router.get("/budgets")
async def list_budgets(user: dict = Depends(require("budget:read"))):
    items = await db.budget_versions.find({}, {"_id": 0}).sort("version", -1).to_list(200)
    return {"items": items}


@router.post("/budgets")
async def create_budget(body: dict = Body(...), request: Request = None,
                        user: dict = Depends(require("budget:manage"))):
    last = await db.budget_versions.find_one(sort=[("version", -1)])
    version = (last["version"] + 1) if last else 1
    doc = {"id": new_id("bud"), "version": version, "proposer": user["user_id"],
           "approved_by": body.get("approved_by", ""), "notes": body.get("notes", ""),
           "status": body.get("status", "approved"),
           "lines": [{"event": l.get("event"), "account_code": l.get("account_code"),
                      "amount_paise": int(l.get("amount_paise", 0))} for l in body.get("lines", [])],
           "created_at": iso()}
    await db.budget_versions.insert_one(dict(doc))
    await audit("budget.version.create", actor=user, entity_type="budget_version",
                entity_id=doc["id"], after={"version": version}, request=request)
    return clean(doc)


@router.get("/budgets/vs-actual")
async def budget_vs_actual(user: dict = Depends(require("budget:read"))):
    latest = await db.budget_versions.find_one({"status": "approved"}, sort=[("version", -1)])
    lines = latest["lines"] if latest else []
    # actuals: posted expense journals grouped by account
    actuals = {}
    async for j in db.journal_entries.find({"source_type": {"$in": ["voucher", "advance", "expense"]}}):
        for ln in j["lines"]:
            if ln["account_code"].startswith("5"):
                actuals[ln["account_code"]] = actuals.get(ln["account_code"], 0) + ln["debit"] - ln["credit"]
    # commitments: open POs
    commit = {}
    async for po in db.purchase_orders.find({"status": {"$in": ["issued", "open"]}}):
        commit[po.get("account_code", "")] = commit.get(po.get("account_code", ""), 0) + po.get("amount_paise", 0)
    out = []
    for l in lines:
        acc = l["account_code"]
        spent = actuals.get(acc, 0)
        committed = commit.get(acc, 0)
        out.append({"event": l["event"], "account_code": acc, "budget": l["amount_paise"],
                    "committed": committed, "spent": spent, "paid": spent,
                    "available": l["amount_paise"] - spent - committed})
    return {"items": out, "version": latest["version"] if latest else None}


async def _budget_available(account_code: str) -> int:
    latest = await db.budget_versions.find_one({"status": "approved"}, sort=[("version", -1)])
    if not latest:
        return 0
    budget = sum(l["amount_paise"] for l in latest["lines"] if l["account_code"] == account_code)
    spent = 0
    async for j in db.journal_entries.find({}):
        for ln in j["lines"]:
            if ln["account_code"] == account_code:
                spent += ln["debit"] - ln["credit"]
    return budget - spent


# --------------------------------------------------------------- Purchase requests
@router.get("/purchase-requests")
async def list_pr(user: dict = Depends(require("budget:read"))):
    items = await db.purchase_requests.find({"is_deleted": {"$ne": True}}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return {"items": items}


@router.post("/purchase-requests")
async def create_pr(body: dict = Body(...), request: Request = None,
                    user: dict = Depends(require("procurement:create"))):
    estimate = int(body.get("estimate_paise", 0))
    account_code = body.get("account_code", "5900")
    available = await _budget_available(account_code)
    over_budget = estimate > available
    doc = {"id": new_id("pr"), "purpose": body.get("purpose", ""), "event": body.get("event", ""),
           "account_code": account_code, "estimate_paise": estimate,
           "required_date": body.get("required_date", ""), "status": "submitted",
           "over_budget": over_budget, "budget_available": available,
           "created_by": user["user_id"], "created_at": iso(), "is_deleted": False}
    await db.purchase_requests.insert_one(dict(doc))
    await audit("pr.create", actor=user, entity_type="purchase_request", entity_id=doc["id"],
                after={"estimate": estimate, "over_budget": over_budget}, request=request)
    return clean(doc)


@router.post("/purchase-requests/{pr_id}/approve")
async def approve_pr(pr_id: str, body: dict = Body(default={}), request: Request = None,
                     user: dict = Depends(require("procurement:approve"))):
    pr = await db.purchase_requests.find_one({"id": pr_id})
    if not pr:
        raise HTTPException(status_code=404, detail="Not found.")
    if pr["created_by"] == user["user_id"]:
        raise HTTPException(status_code=403, detail="Maker cannot approve their own request.")
    if pr["status"] != "submitted":
        raise HTTPException(status_code=409, detail="Not in submitted state.")
    settings = await get_settings()
    convenor_threshold = settings["approval_thresholds_paise"]["purchase_convenor"]
    if pr["estimate_paise"] > convenor_threshold and "budget:approve" not in user_permissions(user):
        raise HTTPException(status_code=403, detail="Amount exceeds threshold; convenor approval required.")
    if pr.get("over_budget") and not body.get("over_budget_exception_reason"):
        raise HTTPException(status_code=400, detail="Over-budget request requires an exception reason.")
    await db.purchase_requests.update_one({"id": pr_id}, {"$set": {
        "status": "approved", "approved_by": user["user_id"], "approved_at": iso(),
        "over_budget_exception_reason": body.get("over_budget_exception_reason", "")}})
    await audit("pr.approve", actor=user, entity_type="purchase_request", entity_id=pr_id,
                approval_chain=[pr["created_by"], user["user_id"]], request=request)
    return {"ok": True, "status": "approved"}


# --------------------------------------------------------------- Vendors + bank changes
@router.get("/vendors")
async def list_vendors(user: dict = Depends(require("budget:read"))):
    vs = await db.vendors.find({"is_deleted": {"$ne": True}}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    # mask bank details in ordinary views
    for v in vs:
        v.pop("bank_account_no", None)
    return {"items": vs}


@router.post("/vendors")
async def create_vendor(body: dict = Body(...), request: Request = None,
                        user: dict = Depends(require("vendor:manage"))):
    doc = {"id": new_id("vnd"), "legal_name": body.get("legal_name", ""),
           "display_name": body.get("display_name", body.get("legal_name", "")),
           "contact": body.get("contact", ""), "service_category": body.get("service_category", ""),
           "address": body.get("address", ""),
           "bank_account_no_masked": body.get("bank_account_no_masked", ""),
           "tax_id": body.get("tax_id", ""), "verification_status": "unverified",
           "active": True, "conflict_declaration": body.get("conflict_declaration", ""),
           "created_by": user["user_id"], "created_at": iso(), "is_deleted": False}
    await db.vendors.insert_one(dict(doc))
    await audit("vendor.create", actor=user, entity_type="vendor", entity_id=doc["id"],
                after={"name": doc["display_name"]}, request=request)
    return clean(doc)


@router.post("/vendors/{vid}/bank-change")
async def vendor_bank_change(vid: str, body: dict = Body(...), request: Request = None,
                             user: dict = Depends(require("vendor:manage"))):
    v = await db.vendors.find_one({"id": vid})
    if not v:
        raise HTTPException(status_code=404, detail="Not found.")
    change = {"id": new_id("vbc"), "vendor_id": vid, "old_masked": v.get("bank_account_no_masked", ""),
              "new_masked": body.get("new_masked", ""), "maker_id": user["user_id"],
              "status": "pending_approval", "created_at": iso()}
    await db.vendor_bank_accounts.insert_one(dict(change))
    await audit("vendor.bank_change.request", actor=user, entity_type="vendor_bank_account",
                entity_id=change["id"], after={"vendor": vid}, request=request)
    return clean(change)


@router.post("/vendor-bank/{change_id}/approve")
async def vendor_bank_approve(change_id: str, request: Request = None,
                              user: dict = Depends(require("procurement:approve")),
                              _reauth=Depends(require_reauth)):
    change = await db.vendor_bank_accounts.find_one({"id": change_id})
    if not change:
        raise HTTPException(status_code=404, detail="Not found.")
    if change["maker_id"] == user["user_id"]:
        raise HTTPException(status_code=403, detail="Maker cannot approve their own bank change.")
    if change["status"] != "pending_approval":
        raise HTTPException(status_code=409, detail="Not pending approval.")
    await db.vendor_bank_accounts.update_one({"id": change_id}, {"$set": {
        "status": "approved", "approved_by": user["user_id"], "approved_at": iso()}})
    await db.vendors.update_one({"id": change["vendor_id"]}, {"$set": {
        "bank_account_no_masked": change["new_masked"], "verification_status": "reverified"}})
    await audit("vendor.bank_change.approve", actor=user, entity_type="vendor_bank_account",
                entity_id=change_id, approval_chain=[change["maker_id"], user["user_id"]], request=request)
    return {"ok": True}


# --------------------------------------------------------------- Purchase orders
@router.get("/purchase-orders")
async def list_po(user: dict = Depends(require("budget:read"))):
    items = await db.purchase_orders.find({"is_deleted": {"$ne": True}}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return {"items": items}


@router.post("/purchase-orders")
async def create_po(body: dict = Body(...), request: Request = None,
                    user: dict = Depends(require("procurement:approve"))):
    pr = await db.purchase_requests.find_one({"id": body.get("pr_id")})
    if not pr or pr["status"] != "approved":
        raise HTTPException(status_code=400, detail="An approved purchase request is required.")
    n, po_no = await next_formatted("po", "PO26", 5)
    doc = {"id": new_id("po"), "po_no": po_no, "pr_id": pr["id"], "vendor_id": body.get("vendor_id", ""),
           "account_code": pr["account_code"], "event": pr["event"],
           "amount_paise": int(body.get("amount_paise", pr["estimate_paise"])),
           "status": "issued", "created_by": user["user_id"], "created_at": iso(), "is_deleted": False}
    await db.purchase_orders.insert_one(dict(doc))
    await audit("po.create", actor=user, entity_type="purchase_order", entity_id=doc["id"],
                after={"po_no": po_no, "amount": doc["amount_paise"]}, request=request)
    return clean(doc)


# --------------------------------------------------------------- Vendor invoices + 3-way match
@router.get("/vendor-invoices")
async def list_invoices(user: dict = Depends(require("budget:read"))):
    items = await db.vendor_invoices.find({"is_deleted": {"$ne": True}}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return {"items": items}


@router.post("/vendor-invoices")
async def create_invoice(body: dict = Body(...), request: Request = None,
                         user: dict = Depends(require("procurement:create"))):
    vendor_id = body.get("vendor_id", "")
    invoice_number = body.get("invoice_number", "")
    dup = await db.vendor_invoices.find_one({"vendor_id": vendor_id, "invoice_number": invoice_number,
                                             "is_deleted": {"$ne": True}})
    warnings = []
    if dup:
        warnings.append("Duplicate vendor + invoice number — routed for review.")
    doc_hash = body.get("doc_hash", "")
    if doc_hash and await db.vendor_invoices.find_one({"doc_hash": doc_hash}):
        warnings.append("Same document hash as an existing invoice.")
    doc = {"id": new_id("vinv"), "vendor_id": vendor_id, "invoice_number": invoice_number,
           "amount_paise": int(body.get("amount_paise", 0)), "date": body.get("date", ""),
           "po_id": body.get("po_id", ""), "doc_hash": doc_hash,
           "status": "review" if warnings else "received", "warnings": warnings,
           "created_by": user["user_id"], "created_at": iso(), "is_deleted": False}
    await db.vendor_invoices.insert_one(dict(doc))
    await audit("invoice.create", actor=user, entity_type="vendor_invoice", entity_id=doc["id"],
                after={"invoice": invoice_number, "warnings": warnings}, request=request)
    return clean(doc)


@router.post("/vendor-invoices/{inv_id}/three-way-match")
async def three_way_match(inv_id: str, request: Request = None,
                          user: dict = Depends(require("procurement:approve"))):
    inv = await db.vendor_invoices.find_one({"id": inv_id})
    if not inv:
        raise HTTPException(status_code=404, detail="Not found.")
    po = await db.purchase_orders.find_one({"id": inv.get("po_id")})
    gsc = await db.goods_service_confirmations.find_one({"po_id": inv.get("po_id")})
    exceptions = []
    if not po:
        exceptions.append("No matching purchase order.")
    elif po["amount_paise"] < inv["amount_paise"]:
        exceptions.append("Invoice exceeds PO amount.")
    if not gsc:
        exceptions.append("No goods/service confirmation.")
    status = "matched" if not exceptions else "exception"
    await db.vendor_invoices.update_one({"id": inv_id}, {"$set": {"match_status": status,
                                                                  "match_exceptions": exceptions}})
    await audit("invoice.three_way_match", actor=user, entity_type="vendor_invoice", entity_id=inv_id,
                after={"status": status, "exceptions": exceptions}, request=request)
    return {"status": status, "exceptions": exceptions}


# --------------------------------------------------------------- Payment proposals + vouchers
@router.get("/payment-vouchers")
async def list_vouchers(user: dict = Depends(require("accounting:read"))):
    items = await db.payment_vouchers.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return {"items": items}


@router.post("/payment-proposals")
async def create_proposal(body: dict = Body(...), request: Request = None,
                          user: dict = Depends(require("payment_run:create"))):
    inv = await db.vendor_invoices.find_one({"id": body.get("invoice_id")})
    amount = int(body.get("amount_paise", 0))
    exception = False
    if inv and amount > inv["amount_paise"]:
        if not body.get("exception_reason"):
            raise HTTPException(status_code=400, detail="Payment exceeds approved invoice amount; exception reason required.")
        exception = True
    doc = {"id": new_id("pp"), "invoice_id": body.get("invoice_id", ""),
           "vendor_id": body.get("vendor_id", ""), "account_code": body.get("account_code", "5900"),
           "amount_paise": amount, "status": "proposed", "exception": exception,
           "exception_reason": body.get("exception_reason", ""),
           "created_by": user["user_id"], "created_at": iso()}
    await db.payment_proposals.insert_one(dict(doc))
    await audit("payment_proposal.create", actor=user, entity_type="payment_proposal",
                entity_id=doc["id"], after={"amount": amount}, request=request)
    return clean(doc)


@router.post("/payment-proposals/{pp_id}/approve")
async def approve_proposal(pp_id: str, body: dict = Body(default={}), request: Request = None,
                           user: dict = Depends(require("payment_run:approve"))):
    pp = await db.payment_proposals.find_one({"id": pp_id})
    if not pp:
        raise HTTPException(status_code=404, detail="Not found.")
    if pp["created_by"] == user["user_id"]:
        raise HTTPException(status_code=403, detail="Payment maker cannot approve their own proposal.")
    if pp["status"] != "proposed":
        raise HTTPException(status_code=409, detail="Not in proposed state.")
    settings = await get_settings()
    if pp["amount_paise"] > settings["approval_thresholds_paise"]["payment_reauth"] and \
            request.headers.get("X-Reauth", "").lower() != "true":
        raise HTTPException(status_code=401, detail="Re-authentication required for high-value payment.")
    n, voucher_no = await next_formatted("voucher", "PV26", 5)
    try:
        journal = await post_journal(source_type="voucher", source_id=pp_id,
                                     narration=f"Payment voucher {voucher_no}",
                                     lines=[{"account_code": pp["account_code"], "debit": pp["amount_paise"], "credit": 0},
                                            {"account_code": "1001", "debit": 0, "credit": pp["amount_paise"]}],
                                     actor=user, approved_by=user["user_id"])
    except LedgerError as e:
        raise HTTPException(status_code=400, detail=str(e))
    voucher = {"id": new_id("pv"), "voucher_no": voucher_no, "proposal_id": pp_id,
               "vendor_id": pp["vendor_id"], "amount_paise": pp["amount_paise"],
               "bank_reference": body.get("bank_reference", ""), "journal_id": journal["id"],
               "approved_by": user["user_id"], "created_at": iso()}
    await db.payment_vouchers.insert_one(dict(voucher))
    await db.payment_proposals.update_one({"id": pp_id}, {"$set": {"status": "paid", "voucher_no": voucher_no}})
    await audit("payment_voucher.create", actor=user, entity_type="payment_voucher",
                entity_id=voucher["id"], after={"voucher_no": voucher_no},
                approval_chain=[pp["created_by"], user["user_id"]], request=request)
    return {"ok": True, "voucher_no": voucher_no}


# --------------------------------------------------------------- Advances
@router.get("/advances")
async def list_advances(user: dict = Depends(require("accounting:read"))):
    items = await db.advances.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return {"items": items}


@router.post("/advances")
async def create_advance(body: dict = Body(...), request: Request = None,
                         user: dict = Depends(require("advance:manage"))):
    amount = int(body.get("amount_paise", 0))
    is_vendor = body.get("type", "member") == "vendor"
    acc = "1200" if is_vendor else "1201"
    journal = await post_journal(source_type="advance", source_id="",
                                 narration=f"Advance to {body.get('person', '')}",
                                 lines=[{"account_code": acc, "debit": amount, "credit": 0},
                                        {"account_code": "1001", "debit": 0, "credit": amount}],
                                 actor=user)
    doc = {"id": new_id("adv"), "person": body.get("person", ""), "type": body.get("type", "member"),
           "purpose": body.get("purpose", ""), "event": body.get("event", ""),
           "amount_paise": amount, "due_date": body.get("due_date", ""), "spent_paise": 0,
           "status": "outstanding", "journal_id": journal["id"],
           "created_by": user["user_id"], "created_at": iso()}
    await db.advances.insert_one(dict(doc))
    await audit("advance.issue", actor=user, entity_type="advance", entity_id=doc["id"],
                after={"amount": amount}, request=request)
    return clean(doc)


@router.post("/advances/{adv_id}/settle")
async def settle_advance(adv_id: str, body: dict = Body(...), request: Request = None,
                         user: dict = Depends(require("advance:manage"))):
    adv = await db.advances.find_one({"id": adv_id})
    if not adv:
        raise HTTPException(status_code=404, detail="Not found.")
    spent = int(body.get("spent_paise", 0))
    if spent <= 0 and not body.get("exception_note"):
        raise HTTPException(status_code=400, detail="Settlement requires bills or an approved exception note.")
    refund_due = max(adv["amount_paise"] - spent, 0)
    reimbursement_due = max(spent - adv["amount_paise"], 0)
    await db.advances.update_one({"id": adv_id}, {"$set": {"spent_paise": spent, "status": "settled",
                                                           "refund_due": refund_due,
                                                           "reimbursement_due": reimbursement_due,
                                                           "settled_at": iso()}})
    await audit("advance.settle", actor=user, entity_type="advance", entity_id=adv_id,
                after={"spent": spent, "refund_due": refund_due}, request=request)
    return {"ok": True, "refund_due": refund_due, "reimbursement_due": reimbursement_due}


@router.get("/advances/ageing")
async def advances_ageing(user: dict = Depends(require("accounting:read"))):
    now = now_utc()
    out = []
    async for a in db.advances.find({"status": "outstanding"}, {"_id": 0}):
        try:
            from datetime import datetime
            created = datetime.fromisoformat(a["created_at"].replace("Z", "+00:00"))
            age = (now - created).days
        except Exception:
            age = 0
        out.append({**a, "age_days": age})
    return {"items": out}


# --------------------------------------------------------------- Expense claims
@router.get("/expense-claims")
async def list_claims(user: dict = Depends(require("budget:read"))):
    items = await db.expense_claims.find({"is_deleted": {"$ne": True}}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return {"items": items}


@router.post("/expense-claims")
async def create_claim(body: dict = Body(...), request: Request = None,
                       user: dict = Depends(require("expense:create"))):
    doc = {"id": new_id("exp"), "claimant_id": user["user_id"], "claimant_name": user.get("name", ""),
           "account_code": body.get("account_code", "5900"), "purpose": body.get("purpose", ""),
           "date": body.get("date", ""), "amount_paise": int(body.get("amount_paise", 0)),
           "bill_doc_id": body.get("bill_doc_id", ""), "status": "submitted",
           "declaration": body.get("declaration", True), "created_at": iso(), "is_deleted": False}
    await db.expense_claims.insert_one(dict(doc))
    await audit("expense.create", actor=user, entity_type="expense_claim", entity_id=doc["id"],
                after={"amount": doc["amount_paise"]}, request=request)
    return clean(doc)


@router.post("/expense-claims/{claim_id}/approve")
async def approve_claim(claim_id: str, request: Request = None,
                        user: dict = Depends(require("expense:approve"))):
    claim = await db.expense_claims.find_one({"id": claim_id})
    if not claim:
        raise HTTPException(status_code=404, detail="Not found.")
    if claim["claimant_id"] == user["user_id"]:
        raise HTTPException(status_code=403, detail="Claimant cannot approve their own claim.")
    if claim["status"] != "submitted":
        raise HTTPException(status_code=409, detail="Not in submitted state.")
    n, voucher_no = await next_formatted("voucher", "PV26", 5)
    journal = await post_journal(source_type="expense", source_id=claim_id,
                                 narration=f"Expense reimbursement {voucher_no}",
                                 lines=[{"account_code": claim["account_code"], "debit": claim["amount_paise"], "credit": 0},
                                        {"account_code": "1001", "debit": 0, "credit": claim["amount_paise"]}],
                                 actor=user, approved_by=user["user_id"])
    await db.expense_claims.update_one({"id": claim_id}, {"$set": {"status": "approved",
                                                                   "approved_by": user["user_id"],
                                                                   "voucher_no": voucher_no,
                                                                   "journal_id": journal["id"]}})
    await audit("expense.approve", actor=user, entity_type="expense_claim", entity_id=claim_id,
                approval_chain=[claim["claimant_id"], user["user_id"]], request=request)
    return {"ok": True, "voucher_no": voucher_no}
