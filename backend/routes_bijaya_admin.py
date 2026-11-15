"""Admin ops for Bijaya Sammilani Food — list, CSV template, import/export, page toggles."""

from __future__ import annotations

import csv
import io
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse

from auth import require
from audit import audit
from config import get_settings, get_active_cycle_id
from db import NO_ID, db, new_id
from util import iso

router = APIRouter(prefix="/api")

_BIJAYA_EVENT = "bijaya_sammilani"
_TEMPLATE_HEADERS = [
    "id", "name", "mobile", "tower_name", "flat_number",
    "diet", "quantity", "payment_status", "notes",
]
# diet values: veg | non_veg_chicken | non_veg_mutton (legacy non_veg → chicken)
# payment_status: pending | paid — committee can set paid on upload; mobile is optional.
_VOUCHER_LOCKED = ("paid", "complimentary", "partially_paid")


def _normalize_header(h: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (h or "").strip().lower()).strip("_")


def _normalize_diet(raw: str) -> str:
    s = (raw or "").strip().lower().replace("-", "_").replace(" ", "_")
    if s in ("veg", "vegetarian", "v"):
        return "veg"
    if s in ("non_veg", "nonveg", "nonvegetarian", "nv", "non"):
        return "non_veg"
    return ""


def _normalize_plate_category(raw: str) -> str:
    """Map CSV diet/plate_category cells to veg | non_veg_chicken | non_veg_mutton."""
    s = (raw or "").strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "veg": "veg", "vegetarian": "veg", "v": "veg",
        "chicken": "non_veg_chicken", "non_veg_chicken": "non_veg_chicken",
        "nonveg_chicken": "non_veg_chicken", "nv_chicken": "non_veg_chicken",
        "mutton": "non_veg_mutton", "non_veg_mutton": "non_veg_mutton",
        "nonveg_mutton": "non_veg_mutton", "nv_mutton": "non_veg_mutton",
        # Legacy single non-veg → chicken plate (committee can edit later).
        "non_veg": "non_veg_chicken", "nonveg": "non_veg_chicken", "nv": "non_veg_chicken",
    }
    return aliases.get(s, "")


def _payment_status_from_cell(val: str) -> str:
    s = (val or "").strip().lower()
    if s in {"paid", "captured", "settled", "yes", "y", "1"}:
        return "paid"
    if s in {"unpaid", "not_open", "not open", "pending", "no", "n", "0", ""}:
        return "pending" if s in {"pending", "unpaid", "not_open", "not open", ""} else "pending"
    if s in {"pending"}:
        return "pending"
    return s.replace(" ", "_") or "pending"


def _parse_spreadsheet(content: bytes, filename: str) -> list[list]:
    name = (filename or "").lower()
    if name.endswith(".xlsx") or name.endswith(".xls"):
        try:
            import openpyxl
        except ImportError as e:
            raise HTTPException(status_code=500, detail="Excel support unavailable on server.") from e
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        ws = wb.active
        return [[("" if c is None else str(c)) for c in row] for row in ws.iter_rows(values_only=True)]
    text = content.decode("utf-8-sig", errors="replace")
    return list(csv.reader(io.StringIO(text)))


def _row_dict(header: list[str], raw: list) -> dict:
    out = {}
    for i, key in enumerate(header):
        if not key:
            continue
        out[key] = raw[i] if i < len(raw) else ""
    return out


async def _bijaya_settings() -> dict:
    from bijaya_food import PAGE_ENABLED, PAYMENT_ENABLED, PACKAGE_AMOUNT_PAISE
    s = await get_settings()
    cfg = dict(s.get("bijaya_food") or {})
    return {
        "page_enabled": bool(cfg["page_enabled"]) if "page_enabled" in cfg else bool(PAGE_ENABLED),
        "payment_enabled": bool(cfg["payment_enabled"]) if "payment_enabled" in cfg else bool(PAYMENT_ENABLED),
        "amount_paise": int(cfg.get("amount_paise") or PACKAGE_AMOUNT_PAISE),
    }


def _bijaya_meal_label(order: dict) -> str:
    from bijaya_food import PACKAGE_LABEL
    return f"{PACKAGE_LABEL} ({order.get('diet_label') or 'plate'})"


async def _ensure_payment_intent(order: dict) -> dict:
    """Create a UPI intent for pending Bijaya orders that were saved without one (so Record pay works)."""
    from bijaya_food import PACKAGE_CODE
    if order.get("intent_id"):
        return order
    if order.get("payment_status") not in ("pending", "partially_paid", "not_open"):
        return order
    total = int(order.get("total_amount_paise") or 0)
    if total <= 0:
        return order
    cycle_id = order.get("cycle_id") or await get_active_cycle_id()
    tower_id = order.get("tower_id") or ""
    flat_id = order.get("flat_id") or ""
    name = order.get("name") or ""
    mobile = order.get("mobile") or ""
    existing_hh = await db.households.find_one(
        {"cycle_id": cycle_id, "tower_id": tower_id, "flat_id": flat_id}, {"_id": 0, "id": 1},
    ) if tower_id and flat_id else None
    if existing_hh:
        hid = existing_hh["id"]
        await db.households.update_one({"id": hid}, {"$set": {"is_food_subscriber": True}})
    else:
        hid = new_id("hh")
        await db.households.insert_one({
            "id": hid, "cycle_id": cycle_id,
            "tower_id": tower_id, "tower_name": order.get("tower_name") or "",
            "flat_id": flat_id, "flat_number": order.get("flat_number") or "",
            "occupancy_type": "other", "family_members": int(order.get("family_members") or 1),
            "primary_name": name, "primary_mobile": mobile,
            "is_food_subscriber": True, "created_at": iso(), "is_deleted": False,
            "source": "food_subscription",
        })
    meal_label = _bijaya_meal_label(order)
    intent_id = new_id("intent")
    await db.subscription_intents.insert_one({
        "id": intent_id, "cycle_id": cycle_id, "household_id": hid,
        "kind": "food_subscription",
        "food_subscription_id": order["id"],
        "event_code": _BIJAYA_EVENT,
        "base_amount": total, "donation_amount": 0, "total_amount": total,
        "components": [{"code": PACKAGE_CODE, "label": meal_label, "amount_paise": total, "account_code": "4400"}],
        "payer_name": name, "payer_mobile": mobile,
        "status": "payment_pending", "method": "upi_qr",
        "notes": order.get("notes") or "", "created_at": iso(),
    })
    patch = {"intent_id": intent_id, "updated_at": iso()}
    if order.get("payment_status") == "not_open":
        patch["payment_status"] = "pending"
    await db.food_subscriptions.update_one({"id": order["id"]}, {"$set": patch})
    order = {**order, **patch}
    return order


async def _sync_payment_intent(order: dict) -> dict:
    """Keep an open intent's payable total in sync with the order (quantity/plate edits on upload)."""
    from bijaya_food import PACKAGE_CODE
    if order.get("payment_status") not in ("pending", "partially_paid", "not_open"):
        return order
    total = int(order.get("total_amount_paise") or 0)
    if total <= 0:
        return order
    if not order.get("intent_id"):
        return await _ensure_payment_intent(order)
    intent = await db.subscription_intents.find_one({"id": order["intent_id"]}, NO_ID)
    if not intent:
        return await _ensure_payment_intent({**order, "intent_id": None})
    if intent.get("status") not in ("payment_pending", "pending", "authorised"):
        # Leave partially_paid / paid alone — Record pay owns those.
        return order
    meal_label = _bijaya_meal_label(order)
    await db.subscription_intents.update_one(
        {"id": intent["id"]},
        {"$set": {
            "base_amount": total,
            "donation_amount": 0,
            "total_amount": total,
            "amount_due_paise": total,
            "components": [{"code": PACKAGE_CODE, "label": meal_label, "amount_paise": total, "account_code": "4400"}],
            "payer_name": order.get("name") or intent.get("payer_name") or "",
            "payer_mobile": order.get("mobile") or intent.get("payer_mobile") or "",
            "notes": order.get("notes") or intent.get("notes") or "",
        }},
    )
    return order


async def _settle_committee_paid(order: dict, request: Request = None) -> dict:
    """Mark a Bijaya order paid via the normal receipt+ledger path (cash debit, food credit)."""
    from routes_collect import _issue_receipt
    total = int(order.get("total_amount_paise") or 0)
    if total <= 0:
        return order
    already = await db.receipts.find_one(
        {"food_subscription_id": order["id"], "status": "issued"}, {"_id": 1},
    )
    if already:
        await db.food_subscriptions.update_one(
            {"id": order["id"]},
            {"$set": {"payment_status": "paid", "status": "paid", "updated_at": iso()}},
        )
        return {**order, "payment_status": "paid", "status": "paid"}

    # Intent creation requires a pending status.
    pending = {**order, "payment_status": "pending"}
    pending = await _sync_payment_intent(pending)
    intent = await db.subscription_intents.find_one({"id": pending.get("intent_id")}, NO_ID) if pending.get("intent_id") else None
    if not intent or intent.get("status") not in ("payment_pending", "pending", "authorised", "partially_paid"):
        return order
    receipt = await _issue_receipt(
        intent,
        method="cash",
        masked_ref="Committee upload",
        provider_payment_id=f"bijaya_upload_{order['id'][-10:]}",
        debit_account="1002",
        request=request,
        bank_verified=True,
        issuance_source="bijaya_committee_upload",
    )
    if not receipt:
        return order
    voucher_no = order.get("voucher_no") or (
        f"BJ-{datetime.now(timezone.utc).strftime('%y%m%d')}-{new_id('v')[-4:].upper()}"
    )
    await db.food_subscriptions.update_one(
        {"id": order["id"]},
        {"$set": {
            "payment_status": "paid",
            "status": "paid",
            "voucher_no": voucher_no,
            "receipt_id": receipt.get("id"),
            "updated_at": iso(),
        }},
    )
    return {
        **pending,
        "payment_status": "paid",
        "status": "paid",
        "voucher_no": voucher_no,
        "receipt_id": receipt.get("id"),
        "intent_id": pending.get("intent_id"),
    }


async def _enrich(item: dict) -> dict:
    from routes_food import _order_settlement, _food_voucher_token
    it = dict(item)
    if it.get("payment_status") in ("pending", "partially_paid", "not_open") and not it.get("intent_id"):
        it = await _ensure_payment_intent(it)
    settlement = await _order_settlement(it)
    it["voucher_token"] = _food_voucher_token(it["id"])
    it["paid_in_full"] = settlement["settled"]
    it["bank_verified"] = settlement["bank_verified"]
    it["ref"] = it["id"][-6:].upper()
    it["amount_due_paise"] = max(0, int(it.get("total_amount_paise") or 0) - int(settlement["paid"] or 0))
    it["paid_paise"] = int(settlement["paid"] or 0)
    breakdown = dict(it.get("plate_breakdown") or {})
    if not breakdown:
        for sel in (it.get("selections") or []):
            code = (sel.get("plate_category") or "").strip()
            if not code:
                d = (sel.get("diet") or "").strip()
                code = "veg" if d == "veg" else "non_veg_chicken" if d == "non_veg" else ""
            if not code:
                continue
            breakdown[code] = int(breakdown.get(code) or 0) + int(sel.get("quantity") or 0)
    it["plate_breakdown"] = breakdown
    if not it.get("plate_category"):
        pos = [c for c, q in breakdown.items() if int(q or 0) > 0]
        if len(pos) == 1:
            it["plate_category"] = pos[0]
        elif (it.get("selections") or []):
            it["plate_category"] = ((it.get("selections") or [{}])[0] or {}).get("plate_category") or ""
    diet = (it.get("diet") or ((it.get("selections") or [{}])[0] or {}).get("diet") or "").strip()
    it["diet"] = diet or ""
    if it.get("diet_label"):
        pass
    elif breakdown:
        labels = {
            "veg": "Veg",
            "non_veg_chicken": "Non-veg chicken",
            "non_veg_mutton": "Non-veg mutton",
        }
        it["diet_label"] = ", ".join(
            f"{qty}× {labels.get(code, code)}" for code, qty in breakdown.items() if int(qty or 0) > 0
        )
    else:
        it["diet_label"] = "Veg" if diet == "veg" else "Non-veg" if diet == "non_veg" else ""
    qty = int(it.get("selection_count") or 0)
    if not qty:
        qty = sum(int(v or 0) for v in breakdown.values()) or int(
            ((it.get("selections") or [{}])[0] or {}).get("quantity") or 0
        )
    it["plate_qty"] = qty
    return it


@router.get("/admin/bijaya-food")
async def admin_list_bijaya(user: dict = Depends(require("households:read", "ops:read", "receipts:read"))):
    raw = await db.food_subscriptions.find(
        {"event_code": _BIJAYA_EVENT}, NO_ID,
    ).sort("created_at", -1).to_list(5000)
    items = [await _enrich(o) for o in raw]
    veg_plates = nonveg_plates = paid_count = unpaid_count = 0
    paid_paise = due_paise = 0
    for it in items:
        if it.get("payment_status") in ("cancelled", "expired"):
            continue
        bd = it.get("plate_breakdown") or {}
        if bd:
            veg_plates += int(bd.get("veg") or 0)
            nonveg_plates += int(bd.get("non_veg_chicken") or 0) + int(bd.get("non_veg_mutton") or 0)
        else:
            q = int(it.get("plate_qty") or 0)
            if it.get("diet") == "non_veg":
                nonveg_plates += q
            else:
                veg_plates += q
        if it.get("paid_in_full") or it.get("payment_status") in ("paid", "complimentary"):
            paid_count += 1
            paid_paise += int(it.get("total_amount_paise") or 0)
        else:
            unpaid_count += 1
            due_paise += int(it.get("amount_due_paise") or 0)
    cfg = await _bijaya_settings()
    return {
        "items": items,
        "summary": {
            "orders": len(items),
            "veg_plates": veg_plates,
            "nonveg_plates": nonveg_plates,
            "plates": veg_plates + nonveg_plates,
            "paid_count": paid_count,
            "unpaid_count": unpaid_count,
            "paid_paise": paid_paise,
            "due_paise": due_paise,
        },
        **cfg,
    }


@router.put("/admin/bijaya-food/page")
async def admin_set_bijaya_page(
    body: dict = Body(...),
    request: Request = None,
    user: dict = Depends(require("settings:manage", "ops:manage", "households:write")),
):
    cfg = dict((await get_settings()).get("bijaya_food") or {})
    if "page_enabled" in body:
        cfg["page_enabled"] = bool(body.get("page_enabled"))
    if "payment_enabled" in body:
        cfg["payment_enabled"] = bool(body.get("payment_enabled"))
    if "amount_paise" in body:
        try:
            cfg["amount_paise"] = max(0, int(body.get("amount_paise")))
        except (TypeError, ValueError):
            pass
    await db.application_settings.update_one({}, {"$set": {"bijaya_food": cfg}}, upsert=True)
    await audit(
        "bijaya_food.page",
        actor=user,
        entity_type="settings",
        entity_id="bijaya_food",
        after=cfg,
        request=request,
    )
    return await _bijaya_settings()


@router.get("/admin/bijaya-food/template")
async def admin_bijaya_template(
    include_data: bool = True,
    user: dict = Depends(require("households:read", "ops:read", "receipts:read")),
):
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(_TEMPLATE_HEADERS)
    if include_data:
        items = await db.food_subscriptions.find(
            {"event_code": _BIJAYA_EVENT}, NO_ID,
        ).sort("created_at", -1).to_list(5000)
        for item in items:
            sel = (item.get("selections") or [{}])[0] or {}
            writer.writerow([
                item.get("id") or "",
                item.get("name") or "",
                item.get("mobile") or "",
                item.get("tower_name") or "",
                item.get("flat_number") or "",
                item.get("diet") or sel.get("diet") or "veg",
                sel.get("quantity") or item.get("selection_count") or 1,
                item.get("payment_status") or "pending",
                item.get("notes") or "",
            ])
    else:
        writer.writerow(["", "Example Name", "", "Tower 1", "101", "veg", "2", "paid", "Committee list"])
    data = buf.getvalue().encode("utf-8-sig")
    return StreamingResponse(
        io.BytesIO(data),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="bijaya_food_template.csv"'},
    )


@router.get("/admin/bijaya-food/export")
async def admin_bijaya_export(user: dict = Depends(require("households:read", "ops:read", "receipts:read"))):
    raw = await db.food_subscriptions.find(
        {"event_code": _BIJAYA_EVENT}, NO_ID,
    ).sort("created_at", -1).to_list(5000)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "ref", "id", "name", "mobile", "tower_name", "flat_number",
        "diet", "quantity", "total_rupees", "paid_rupees", "due_rupees",
        "payment_status", "voucher_no", "created_at", "notes",
    ])
    for o in raw:
        it = await _enrich(o)
        total = int(it.get("total_amount_paise") or 0)
        paid = int(it.get("paid_paise") or 0)
        due = int(it.get("amount_due_paise") or 0)
        writer.writerow([
            it.get("ref") or "",
            it.get("id") or "",
            it.get("name") or "",
            it.get("mobile") or "",
            it.get("tower_name") or "",
            it.get("flat_number") or "",
            it.get("diet") or "",
            it.get("plate_qty") or 0,
            f"{total / 100:.2f}",
            f"{paid / 100:.2f}",
            f"{due / 100:.2f}",
            it.get("payment_status") or "",
            it.get("voucher_no") or "",
            it.get("created_at") or "",
            it.get("notes") or "",
        ])
    data = buf.getvalue().encode("utf-8-sig")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    return StreamingResponse(
        io.BytesIO(data),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="bijaya_food_orders_{stamp}.csv"'},
    )


@router.post("/admin/bijaya-food/import")
async def admin_bijaya_import(
    file: UploadFile = File(...),
    mark_paid: bool = False,
    request: Request = None,
    user: dict = Depends(require("households:write", "ops:manage", "receipts:manage")),
):
    """Committee CSV/XLSX upload. Mobile is optional. Set payment_status=paid (or mark_paid=1) to mark paid."""
    from bijaya_food import (
        EVENT_CODE, EVENT_TITLE, PACKAGE_LABEL, PACKAGE_CODE, PACKAGE_AMOUNT_PAISE,
        PLATE_CATEGORIES,
    )
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file.")
    rows = _parse_spreadsheet(content, file.filename or "upload.csv")
    if not rows or len(rows) < 2:
        raise HTTPException(status_code=400, detail="File needs a header row and at least one data row.")

    header = [_normalize_header(str(h)) for h in rows[0]]
    if "name" not in header:
        raise HTTPException(status_code=400, detail="Template must include a name column.")

    cat_by_code = {c["code"]: c for c in PLATE_CATEGORIES}
    cfg = await _bijaya_settings()
    unit_paise = int(cfg.get("amount_paise") or PACKAGE_AMOUNT_PAISE)
    cycle_id = await get_active_cycle_id()
    created = updated = skipped = paid_marked = 0
    errors = []

    for idx, raw in enumerate(rows[1:], start=2):
        if not any(str(x).strip() for x in (raw or [])):
            continue
        row = _row_dict(header, raw)
        name = str(row.get("name") or "").strip()
        mobile_digits = "".join(c for c in str(row.get("mobile") or "") if c.isdigit())
        mobile = mobile_digits[-10:] if len(mobile_digits) >= 10 else (mobile_digits if mobile_digits else "")
        if mobile and len(mobile) != 10:
            skipped += 1
            errors.append({"row": idx, "error": "Mobile must be blank or a valid 10-digit number"})
            continue
        if not name:
            skipped += 1
            errors.append({"row": idx, "error": "Name is required"})
            continue

        plate_cat = _normalize_plate_category(
            str(row.get("plate_category") or row.get("diet") or "veg")
        )
        if plate_cat not in cat_by_code:
            skipped += 1
            errors.append({"row": idx, "error": "diet/plate_category must be veg, non_veg_chicken, or non_veg_mutton"})
            continue
        meta = cat_by_code[plate_cat]
        diet = meta["diet"]
        diet_label = meta["label"]
        try:
            quantity = max(1, min(50, int(float(str(row.get("quantity") or 1).strip() or 1))))
        except Exception:
            quantity = 1
        total_paise = unit_paise * quantity
        meal_label = f"{PACKAGE_LABEL} ({diet_label})"
        selections = [{
            "item_id": f"{PACKAGE_CODE}_{plate_cat}",
            "day_code": EVENT_CODE,
            "day_label": EVENT_TITLE,
            "meal_code": "package",
            "meal_label": meal_label,
            "diet": diet,
            "diet_label": diet_label,
            "plate_category": plate_cat,
            "quantity": quantity,
            "unit_amount_paise": unit_paise,
            "line_total_paise": total_paise,
            "free_qty": 0,
            "kid_qty": 0,
        }]
        plate_breakdown = {plate_cat: quantity}

        sid = str(row.get("id") or "").strip()
        existing = await db.food_subscriptions.find_one({"id": sid}) if sid else None
        if not existing and mobile:
            existing = await db.food_subscriptions.find_one(
                {"mobile": mobile, "event_code": EVENT_CODE},
                sort=[("created_at", -1)],
            )
        if not existing and name and (row.get("tower_name") or row.get("flat_number")):
            q = {"event_code": EVENT_CODE, "name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}
            if row.get("tower_name"):
                q["tower_name"] = {"$regex": f"^{re.escape(str(row.get('tower_name')).strip())}$", "$options": "i"}
            if row.get("flat_number"):
                q["flat_number"] = str(row.get("flat_number")).strip()
            existing = await db.food_subscriptions.find_one(q, sort=[("created_at", -1)])
        if existing and (
            existing.get("voucher_no") or existing.get("coupon_id")
            or existing.get("payment_status") in _VOUCHER_LOCKED
        ):
            skipped += 1
            errors.append({"row": idx, "error": "Locked: already paid / vouchered — leave it or cancel first"})
            continue

        tower_name = str(row.get("tower_name") or "").strip()
        flat_number = str(row.get("flat_number") or "").strip()
        tower_id = flat_id = ""
        if tower_name:
            tower = await db.towers.find_one(
                {"name": {"$regex": f"^{re.escape(tower_name)}$", "$options": "i"}},
                {"_id": 0, "id": 1, "name": 1},
            )
            if tower:
                tower_id = tower["id"]
                tower_name = tower.get("name") or tower_name
                if flat_number:
                    flat = await db.flats.find_one(
                        {"tower_id": tower_id, "number": str(flat_number)},
                        {"_id": 0, "id": 1, "number": 1},
                    )
                    if flat:
                        flat_id = flat["id"]
                        flat_number = flat.get("number") or flat_number

        payment_status = _payment_status_from_cell(str(row.get("payment_status") or ""))
        if mark_paid:
            payment_status = "paid"
        if payment_status == "partially_paid":
            payment_status = "paid"
        if payment_status == "complimentary":
            skipped += 1
            errors.append({
                "row": idx,
                "error": "Complimentary is not supported on upload — use payment_status=paid (or Mark all paid)",
            })
            continue
        if payment_status not in ("pending", "not_open", "paid"):
            payment_status = "pending"
        want_paid = payment_status == "paid"
        notes = str(row.get("notes") or "").strip()[:500]
        if want_paid and "committee upload" not in notes.lower():
            notes = ((notes + " · " if notes else "") + "Marked paid via committee upload").strip(" ·")[:500]

        # Save as pending first when marking paid so intent sync + ledgered receipt can run.
        stored_status = "pending" if want_paid else payment_status
        patch = {
            "name": name,
            "mobile": mobile,
            "tower_id": tower_id,
            "tower_name": tower_name,
            "flat_id": flat_id,
            "flat_number": flat_number,
            "diet": diet,
            "diet_label": diet_label,
            "plate_category": plate_cat,
            "plate_breakdown": plate_breakdown,
            "notes": notes,
            "payment_status": stored_status,
            "status": "registered",
            "selections": selections,
            "selection_count": quantity,
            "total_amount_paise": total_paise,
            "amount_status": "fixed",
            "order_mode": "bijaya_package",
            "event_code": EVENT_CODE,
            "event_title": EVENT_TITLE,
            "updated_at": iso(),
        }

        if existing:
            sid = existing["id"]
            # Keep existing intent_id / voucher_no when present.
            await db.food_subscriptions.update_one({"id": sid}, {"$set": patch})
            updated += 1
            await audit(
                "bijaya_food.import_update",
                actor=user,
                entity_type="food_subscription",
                entity_id=sid,
                after={"name": name, "plate_category": plate_cat, "quantity": quantity, "payment_status": payment_status},
                reason=f"Bijaya template upload row {idx}",
                request=request,
            )
        else:
            sid = new_id("food")
            doc = {
                "id": sid,
                "cycle_id": cycle_id,
                "family_members": 1,
                "kids": [],
                "kid_heads": 0,
                "complimentary": {},
                "coupon_id": None,
                "coupon_no": None,
                "intent_id": None,
                "voucher_no": None,
                "created_at": iso(),
                "source": "admin_bijaya_import",
                **patch,
            }
            await db.food_subscriptions.insert_one(doc)
            created += 1
            await audit(
                "bijaya_food.import_create",
                actor=user,
                entity_type="food_subscription",
                entity_id=sid,
                after={"name": name, "plate_category": plate_cat, "quantity": quantity, "payment_status": payment_status},
                reason=f"Bijaya template upload row {idx}",
                request=request,
            )

        order = await db.food_subscriptions.find_one({"id": sid}, NO_ID)
        if not order:
            continue
        if want_paid and total_paise > 0:
            order = await _settle_committee_paid(order, request=request)
            if order.get("payment_status") == "paid":
                paid_marked += 1
            else:
                errors.append({"row": idx, "error": "Saved but could not issue ledgered receipt — try Record pay"})
        elif stored_status in ("pending", "not_open"):
            await _sync_payment_intent(order)

    return {
        "ok": True,
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "paid_marked": paid_marked,
        "errors": errors[:50],
        "message": (
            f"Bijaya import done — {created} created, {updated} updated, {skipped} skipped"
            + (f", {paid_marked} marked paid." if paid_marked else ".")
        ),
    }
