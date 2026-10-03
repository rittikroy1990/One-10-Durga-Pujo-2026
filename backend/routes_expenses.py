"""Admin Expenses — record paid spends with bill upload; sync ledger + payment vouchers."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request, HTTPException, Query, UploadFile, File
from fastapi.responses import Response

from db import db, new_id, clean, NO_ID
from util import iso
from audit import audit, next_formatted
from ledger import post_journal, reverse_journal, LedgerError
from auth import require
from config import CHART_OF_ACCOUNTS

router = APIRouter(prefix="/api")

PAID_FROM = {
    "bank": "1001",
    "cash": "1002",
}
PAYMENT_MODES = {"upi", "neft", "cash", "cheque"}

EXPENSE_WRITE = ("expense:create", "expense:approve", "accounting:post")
EXPENSE_READ = ("budget:read", "reports:read", "expense:approve", "accounting:post", "expense:create")


def _expense_categories() -> list[dict]:
    return [
        {"code": a["code"], "name": a["name"]}
        for a in CHART_OF_ACCOUNTS
        if a.get("type") == "expense" and str(a.get("code", "")).startswith("5")
    ]


def _category_name(code: str) -> str:
    for a in _expense_categories():
        if a["code"] == code:
            return a["name"]
    return code


async def _create_paid_expense(
    *,
    user: dict,
    request: Request | None,
    payee: str,
    purpose: str,
    amount_rupees: float,
    account_code: str = "5900",
    paid_from: str = "bank",
    payment_mode: str = "upi",
    utr: str = "",
    notes: str = "",
    date: str = "",
    bill_file=None,
    source: str = "admin_manual",
) -> dict:
    payee = (payee or "").strip()[:120]
    purpose = (purpose or "").strip()[:400]
    notes = (notes or "").strip()[:500]
    date = (date or "").strip()[:32] or iso()[:10]
    account_code = (account_code or "5900").strip()
    paid_from = (paid_from or "bank").strip().lower()
    payment_mode = (payment_mode or "upi").strip().lower()
    utr = (utr or "").strip()[:80]

    if not payee:
        raise HTTPException(status_code=400, detail="Payee is required.")
    if not purpose:
        raise HTTPException(status_code=400, detail="Purpose is required.")
    if account_code not in {c["code"] for c in _expense_categories()}:
        raise HTTPException(status_code=400, detail=f"Invalid expense category: {account_code}")
    if paid_from not in PAID_FROM:
        raise HTTPException(status_code=400, detail="Paid from must be bank or cash.")
    if payment_mode not in PAYMENT_MODES:
        raise HTTPException(status_code=400, detail="Invalid payment mode.")
    if amount_rupees <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero.")

    amount_paise = int(round(float(amount_rupees) * 100))
    credit_account = PAID_FROM[paid_from]
    expense_id = new_id("exp")

    bill_doc_id = ""
    bill_url = ""
    if bill_file and getattr(bill_file, "filename", None):
        data = await bill_file.read()
        if data:
            if len(data) > 15 * 1024 * 1024:
                raise HTTPException(status_code=400, detail="Bill file too large (max 15 MB).")
            from storage import save_document
            ctype = getattr(bill_file, "content_type", None) or "application/octet-stream"
            try:
                doc = await save_document(
                    data=data,
                    filename=bill_file.filename or "expense-bill.jpg",
                    doc_type="expense_bill",
                    linked_type="expense_claim",
                    linked_id=expense_id,
                    uploaded_by=user.get("user_id") or "admin",
                    content_type=ctype,
                )
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
            bill_doc_id = doc.get("id") or ""
            bill_url = doc.get("storage_path") or ""

    n, voucher_no = await next_formatted("voucher", "PV26", 5)
    try:
        journal = await post_journal(
            source_type="expense",
            source_id=expense_id,
            narration=f"Expense {voucher_no}: {payee} — {purpose}"[:200],
            lines=[
                {"account_code": account_code, "debit": amount_paise, "credit": 0},
                {"account_code": credit_account, "debit": 0, "credit": amount_paise},
            ],
            actor=user,
            approved_by=user.get("user_id") or "",
            date=date,
        )
    except LedgerError as e:
        raise HTTPException(status_code=400, detail=str(e))

    voucher_id = new_id("pv")
    voucher = {
        "id": voucher_id,
        "voucher_no": voucher_no,
        "expense_id": expense_id,
        "proposal_id": "",
        "vendor_id": "",
        "payee": payee,
        "amount_paise": amount_paise,
        "account_code": account_code,
        "paid_from": paid_from,
        "credit_account": credit_account,
        "bank_reference": utr,
        "journal_id": journal["id"],
        "status": "paid",
        "source": "admin_expense",
        "approved_by": user.get("user_id") or "",
        "created_at": iso(),
    }
    await db.payment_vouchers.insert_one(dict(voucher))

    doc = {
        "id": expense_id,
        "source": source,
        "claimant_id": user.get("user_id") or "",
        "claimant_name": user.get("name") or "",
        "payee": payee,
        "purpose": purpose,
        "notes": notes,
        "date": date,
        "account_code": account_code,
        "account_name": _category_name(account_code),
        "amount_paise": amount_paise,
        "paid_from": paid_from,
        "credit_account": credit_account,
        "payment_mode": payment_mode,
        "utr": utr,
        "bill_doc_id": bill_doc_id,
        "bill_url": bill_url,
        "status": "paid",
        "voucher_no": voucher_no,
        "voucher_id": voucher_id,
        "journal_id": journal["id"],
        "approved_by": user.get("user_id") or "",
        "declaration": True,
        "created_at": iso(),
        "paid_at": iso(),
        "is_deleted": False,
    }
    await db.expense_claims.insert_one(dict(doc))
    await audit(
        "expense.admin_create",
        actor=user,
        entity_type="expense_claim",
        entity_id=expense_id,
        after={
            "amount_paise": amount_paise,
            "account_code": account_code,
            "paid_from": paid_from,
            "voucher_no": voucher_no,
            "source": source,
        },
        request=request,
    )
    return {"ok": True, "expense": clean(doc), "voucher_no": voucher_no}


@router.get("/admin/expenses/categories")
async def admin_expense_categories(user: dict = Depends(require(*EXPENSE_READ))):
    return {"items": _expense_categories()}


@router.get("/admin/expenses/template")
async def admin_expense_template(user: dict = Depends(require(*EXPENSE_READ))):
    from expense_import import TEMPLATE_FILENAME, build_template_xlsx

    codes = [c["code"] for c in _expense_categories()]
    data = build_template_xlsx(category_codes=codes)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{TEMPLATE_FILENAME}"'},
    )


@router.post("/admin/expenses/import")
async def admin_expense_import(
    request: Request,
    file: UploadFile = File(...),
    user: dict = Depends(require(*EXPENSE_WRITE)),
):
    from expense_import import parse_import_rows

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file.")
    try:
        rows = parse_import_rows(raw, file.filename or "upload.xlsx")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Could not read Excel/CSV. Download the sample template, fill it, and try again.",
        )
    if not rows:
        raise HTTPException(status_code=400, detail="No data rows found. Replace the sample rows and try again.")

    created = []
    errors = []
    for row in rows:
        try:
            amt_raw = str(row.get("amount_rupees") or "").replace(",", "").strip()
            amount_rupees = float(amt_raw)
        except ValueError:
            errors.append({**row, "reason": "Invalid amount"})
            continue
        try:
            result = await _create_paid_expense(
                user=user,
                request=request,
                payee=row.get("payee") or "",
                purpose=row.get("purpose") or row.get("payee") or "Expense",
                amount_rupees=amount_rupees,
                account_code=row.get("account_code") or "5900",
                paid_from=row.get("paid_from") or "bank",
                payment_mode=row.get("payment_mode") or "upi",
                utr=row.get("utr") or "",
                notes=row.get("notes") or "",
                date=row.get("date") or "",
                source="admin_excel_template",
            )
            created.append({
                "excel_row": row.get("excel_row"),
                "voucher_no": result.get("voucher_no"),
                "payee": row.get("payee"),
                "amount_rupees": amount_rupees,
            })
        except HTTPException as e:
            errors.append({**row, "reason": e.detail})
        except Exception as e:
            errors.append({**row, "reason": f"{type(e).__name__}: {e}"})

    message = (
        f"Import done — {len(created)} expenses recorded, {len(errors)} errors "
        f"(from {len(rows)} rows)."
    )
    await audit(
        "expense.excel_import",
        actor=user,
        entity_type="expense_import",
        entity_id="import",
        after={
            "filename": file.filename,
            "message": message,
            "created": len(created),
            "errors": len(errors),
        },
        request=request,
    )
    return {
        "ok": len(errors) == 0,
        "message": message,
        "created": created[:200],
        "errors": errors[:100],
        "row_count": len(rows),
    }


@router.get("/admin/expenses")
async def admin_list_expenses(
    status: str = Query(""),
    account_code: str = Query(""),
    paid_from: str = Query(""),
    limit: int = Query(500, ge=1, le=2000),
    user: dict = Depends(require(*EXPENSE_READ)),
):
    q: dict = {"is_deleted": {"$ne": True}}
    if status:
        q["status"] = status.strip().lower()
    if account_code:
        q["account_code"] = account_code.strip()
    if paid_from:
        q["paid_from"] = paid_from.strip().lower()

    items = await db.expense_claims.find(q, NO_ID).sort("created_at", -1).to_list(limit)

    by_category: dict[str, int] = {}
    by_paid_from: dict[str, int] = {}
    paid_total = 0
    for it in items:
        if it.get("status") != "paid":
            continue
        amt = int(it.get("amount_paise") or 0)
        paid_total += amt
        code = it.get("account_code") or "5900"
        by_category[code] = by_category.get(code, 0) + amt
        pf = it.get("paid_from") or "bank"
        by_paid_from[pf] = by_paid_from.get(pf, 0) + amt

    return {
        "items": items,
        "summary": {
            "paid_total_paise": paid_total,
            "by_category": [
                {"account_code": c, "name": _category_name(c), "amount_paise": a}
                for c, a in sorted(by_category.items())
            ],
            "by_paid_from": [
                {"paid_from": k, "amount_paise": v} for k, v in sorted(by_paid_from.items())
            ],
            "count_paid": sum(1 for i in items if i.get("status") == "paid"),
            "count_all": len(items),
        },
    }


@router.post("/admin/expenses")
async def admin_create_expense(
    request: Request,
    user: dict = Depends(require(*EXPENSE_WRITE)),
):
    """Single-step: record a paid expense, upload bill, post ledger, create payment voucher."""
    form = await request.form()
    price_raw = form.get("amount_rupees") or form.get("amount") or form.get("price_rupees")
    try:
        amount_rupees = float(str(price_raw or "").replace(",", "").strip())
    except ValueError:
        raise HTTPException(status_code=400, detail="Enter a valid amount in rupees.")

    return await _create_paid_expense(
        user=user,
        request=request,
        payee=form.get("payee") or "",
        purpose=form.get("purpose") or "",
        amount_rupees=amount_rupees,
        account_code=form.get("account_code") or "5900",
        paid_from=form.get("paid_from") or "bank",
        payment_mode=form.get("payment_mode") or "upi",
        utr=form.get("utr") or form.get("bank_reference") or "",
        notes=form.get("notes") or "",
        date=form.get("date") or "",
        bill_file=form.get("bill") or form.get("receipt") or form.get("file"),
        source="admin_manual",
    )


@router.post("/admin/expenses/{expense_id}/void")
async def admin_void_expense(
    expense_id: str,
    request: Request,
    user: dict = Depends(require(*EXPENSE_WRITE)),
):
    form = {}
    try:
        form = await request.json()
    except Exception:
        form = {}
    reason = (form.get("reason") if isinstance(form, dict) else None) or "Voided by admin"

    claim = await db.expense_claims.find_one({"id": expense_id, "is_deleted": {"$ne": True}})
    if not claim:
        raise HTTPException(status_code=404, detail="Expense not found.")
    if claim.get("status") != "paid":
        raise HTTPException(status_code=409, detail="Only paid expenses can be voided.")
    if claim.get("voided"):
        raise HTTPException(status_code=409, detail="Already voided.")

    journal_id = claim.get("journal_id")
    if not journal_id:
        raise HTTPException(status_code=400, detail="Expense has no journal to reverse.")

    try:
        rev = await reverse_journal(journal_id, reason=str(reason)[:200], actor=user)
    except LedgerError as e:
        raise HTTPException(status_code=400, detail=str(e))

    await db.expense_claims.update_one(
        {"id": expense_id},
        {"$set": {
            "status": "voided",
            "voided": True,
            "voided_at": iso(),
            "voided_by": user.get("user_id") or "",
            "void_reason": str(reason)[:200],
            "reversal_journal_id": rev.get("id"),
        }},
    )
    voucher_id = claim.get("voucher_id")
    if voucher_id:
        await db.payment_vouchers.update_one(
            {"id": voucher_id},
            {"$set": {"status": "voided", "voided_at": iso(), "voided_by": user.get("user_id") or ""}},
        )
    elif claim.get("voucher_no"):
        await db.payment_vouchers.update_one(
            {"voucher_no": claim["voucher_no"]},
            {"$set": {"status": "voided", "voided_at": iso(), "voided_by": user.get("user_id") or ""}},
        )

    await audit(
        "expense.void",
        actor=user,
        entity_type="expense_claim",
        entity_id=expense_id,
        reason=str(reason)[:200],
        request=request,
    )
    return {"ok": True, "reversal_journal_id": rev.get("id")}
