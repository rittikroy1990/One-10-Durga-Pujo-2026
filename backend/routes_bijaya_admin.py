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

router = APIRouter()

_BIJAYA_EVENT = "bijaya_sammilani"
_TEMPLATE_HEADERS = [
    "id", "name", "mobile", "tower_name", "flat_number",
    "diet", "quantity", "payment_status", "notes",
]
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


async def _enrich(item: dict) -> dict:
    from routes_food import _order_settlement, _food_voucher_token
    it = dict(item)
    settlement = await _order_settlement(it)
    it["voucher_token"] = _food_voucher_token(it["id"])
    it["paid_in_full"] = settlement["settled"]
    it["bank_verified"] = settlement["bank_verified"]
    it["ref"] = it["id"][-6:].upper()
    it["amount_due_paise"] = max(0, int(it.get("total_amount_paise") or 0) - int(settlement["paid"] or 0))
    it["paid_paise"] = int(settlement["paid"] or 0)
    diet = (it.get("diet") or ((it.get("selections") or [{}])[0] or {}).get("diet") or "").strip()
    it["diet"] = diet or ""
    it["diet_label"] = it.get("diet_label") or ("Veg" if diet == "veg" else "Non-veg" if diet == "non_veg" else "")
    qty = int(((it.get("selections") or [{}])[0] or {}).get("quantity") or it.get("selection_count") or 0)
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
        writer.writerow(["", "Example Name", "9876543210", "Tower 1", "101", "veg", "2", "pending", ""])
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
    request: Request = None,
    user: dict = Depends(require("households:write", "ops:manage", "receipts:manage")),
):
    from bijaya_food import (
        EVENT_CODE, EVENT_TITLE, PACKAGE_LABEL, PACKAGE_CODE, PACKAGE_AMOUNT_PAISE,
    )
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file.")
    rows = _parse_spreadsheet(content, file.filename or "upload.csv")
    if not rows or len(rows) < 2:
        raise HTTPException(status_code=400, detail="File needs a header row and at least one data row.")

    header = [_normalize_header(str(h)) for h in rows[0]]
    if "name" not in header or "mobile" not in header:
        raise HTTPException(status_code=400, detail="Template must include name and mobile columns.")

    cfg = await _bijaya_settings()
    unit_paise = int(cfg.get("amount_paise") or PACKAGE_AMOUNT_PAISE)
    cycle_id = await get_active_cycle_id()
    created = updated = skipped = 0
    errors = []

    for idx, raw in enumerate(rows[1:], start=2):
        if not any(str(x).strip() for x in (raw or [])):
            continue
        row = _row_dict(header, raw)
        name = str(row.get("name") or "").strip()
        mobile = "".join(c for c in str(row.get("mobile") or "") if c.isdigit())[-10:]
        if not name or len(mobile) != 10:
            skipped += 1
            errors.append({"row": idx, "error": "Name and valid 10-digit mobile required"})
            continue

        diet = _normalize_diet(str(row.get("diet") or "veg"))
        if diet not in ("veg", "non_veg"):
            skipped += 1
            errors.append({"row": idx, "error": "diet must be veg or non_veg"})
            continue
        try:
            quantity = max(1, min(50, int(float(str(row.get("quantity") or 1).strip() or 1))))
        except Exception:
            quantity = 1
        diet_label = "Veg" if diet == "veg" else "Non-veg"
        total_paise = unit_paise * quantity
        meal_label = f"{PACKAGE_LABEL} ({diet_label})"
        selections = [{
            "item_id": PACKAGE_CODE,
            "day_code": EVENT_CODE,
            "day_label": EVENT_TITLE,
            "meal_code": "package",
            "meal_label": meal_label,
            "diet": diet,
            "diet_label": diet_label,
            "quantity": quantity,
            "unit_amount_paise": unit_paise,
            "line_total_paise": total_paise,
            "free_qty": 0,
            "kid_qty": 0,
        }]

        sid = str(row.get("id") or "").strip()
        existing = await db.food_subscriptions.find_one({"id": sid}) if sid else None
        if not existing:
            existing = await db.food_subscriptions.find_one(
                {"mobile": mobile, "event_code": EVENT_CODE},
                sort=[("created_at", -1)],
            )
        if existing and (
            existing.get("voucher_no") or existing.get("coupon_id") or existing.get("intent_id")
            or existing.get("payment_status") in _VOUCHER_LOCKED
        ):
            skipped += 1
            errors.append({"row": idx, "error": "Locked: paid / vouchered / online orders can't be changed by upload"})
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
        # Offline import: "paid" means committee marked collected; pending otherwise.
        if payment_status not in ("paid", "pending", "not_open", "complimentary"):
            payment_status = "pending"
        notes = str(row.get("notes") or "").strip()[:500]

        patch = {
            "name": name,
            "mobile": mobile,
            "tower_id": tower_id,
            "tower_name": tower_name,
            "flat_id": flat_id,
            "flat_number": flat_number,
            "diet": diet,
            "diet_label": diet_label,
            "notes": notes,
            "payment_status": payment_status,
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
            await db.food_subscriptions.update_one({"id": existing["id"]}, {"$set": patch})
            updated += 1
            await audit(
                "bijaya_food.import_update",
                actor=user,
                entity_type="food_subscription",
                entity_id=existing["id"],
                after={"name": name, "diet": diet, "quantity": quantity},
                reason=f"Bijaya template upload row {idx}",
                request=request,
            )
        else:
            new_sid = new_id("food")
            doc = {
                "id": new_sid,
                "cycle_id": cycle_id,
                "family_members": 1,
                "kids": [],
                "kid_heads": 0,
                "complimentary": {},
                "coupon_id": None,
                "coupon_no": None,
                "intent_id": None,
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
                entity_id=new_sid,
                after={"name": name, "diet": diet, "quantity": quantity},
                reason=f"Bijaya template upload row {idx}",
                request=request,
            )

    return {
        "ok": True,
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "errors": errors[:50],
        "message": f"Bijaya import done — {created} created, {updated} updated, {skipped} skipped.",
    }
