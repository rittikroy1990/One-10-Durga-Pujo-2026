"""Food subscriptions — public register + admin list (coupons/poll kept for compatibility)."""
import csv
import io
import re
from copy import deepcopy

from fastapi import APIRouter, Depends, HTTPException, Body, Request, Response, UploadFile, File
from fastapi.responses import StreamingResponse

from db import db, new_id, clean, NO_ID
from config import get_settings, get_active_cycle_id
from util import iso
from audit import audit, next_formatted
from auth import require
from docs import food_coupon_pdf
from food_poll_catalog import build_catalog, DISHES, POLL_META, MEALS, DAYS

router = APIRouter(prefix="/api")

_DISH_IDS = {d["id"] for d in DISHES}
_DAY_CODES = {d["code"] for d in DAYS}
_MEAL_CODES = {m["code"] for m in MEALS}
_MAX_PER_MEAL = int(POLL_META.get("max_dishes_per_meal") or 8)
_ALLOWED_MEALS = {"breakfast", "lunch", "dinner"}


def _strip_evening_menu(food: dict) -> dict:
    """Public subscription menu: breakfast / lunch / dinner only."""
    out = deepcopy(food) if food else {}
    days = []
    for day in out.get("days") or []:
        meals = [m for m in (day.get("meals") or []) if (m.get("code") or "") in _ALLOWED_MEALS]
        if meals:
            d = dict(day)
            d["meals"] = meals
            days.append(d)
    out["days"] = days
    subtitle = out.get("subtitle") or ""
    for phrase in ("evening snacks", "Evening snacks", "evening snack", "Evening snack"):
        subtitle = subtitle.replace(phrase, "")
    subtitle = " ".join(subtitle.replace(" & ", " ").replace(" and ", " ").split())
    if subtitle:
        out["subtitle"] = subtitle
    return out


def _menu_lookup(food: dict) -> dict:
    """Map day_code|meal_code → meal meta from config (B/L/D only)."""
    food = _apply_default_prices(food)
    out = {}
    for day in food.get("days") or []:
        for meal in day.get("meals") or []:
            out[f"{day['code']}|{meal['code']}"] = {
                "day_code": day["code"],
                "day_label": day["label"],
                "meal_code": meal["code"],
                "meal_label": meal["label"],
                "amount_paise": meal.get("amount_paise"),
                "amount_label": meal.get("amount_label") or "TBC",
                "amount_status": meal.get("amount_status") or "TBC",
            }
    return out


def _normalize_selections(food: dict, selections: list) -> list:
    """Accept cart lines with quantities.

    Supported shapes:
      - "day|meal"
      - {"day_code","meal_code", quantity|qty}
    Quantities for the same day/meal are merged. Max 50 per line.
    """
    lookup = _menu_lookup(food)
    cleaned = []
    index_by_key = {}
    for raw in selections or []:
        qty = 1
        if isinstance(raw, str) and "|" in raw:
            key = raw.strip()
        elif isinstance(raw, dict):
            key = f"{raw.get('day_code')}|{raw.get('meal_code')}"
            try:
                qty = int(raw.get("quantity") if raw.get("quantity") is not None else raw.get("qty") or 1)
            except (TypeError, ValueError):
                qty = 1
        else:
            continue
        if key not in lookup or qty < 1:
            continue
        qty = min(qty, 50)
        if key in index_by_key:
            item = cleaned[index_by_key[key]]
            item["quantity"] = min(50, int(item.get("quantity") or 0) + qty)
            unit = item.get("amount_paise")
            item["line_total_paise"] = (int(unit) * item["quantity"]) if unit not in (None, "") else None
            continue
        item = dict(lookup[key])
        item["quantity"] = qty
        unit = item.get("amount_paise")
        item["line_total_paise"] = (int(unit) * qty) if unit not in (None, "") else None
        index_by_key[key] = len(cleaned)
        cleaned.append(item)
    return cleaned


def _selection_totals(selections: list) -> tuple:
    """Return (total_paise|None, item_count)."""
    total_paise = 0
    item_count = 0
    for sel in selections or []:
        qty = max(1, int(sel.get("quantity") or 1))
        item_count += qty
        unit = sel.get("amount_paise")
        line = sel.get("line_total_paise")
        if line not in (None, ""):
            total_paise += int(line)
        elif unit not in (None, ""):
            total_paise += int(unit) * qty
        else:
            return None, item_count
    return total_paise, item_count


DEFAULT_MEAL_PRICES_PAISE = {
    "breakfast": 6000,   # ₹60
    "lunch": 30000,      # ₹300
    "dinner": 30000,     # ₹300
}


def _apply_default_prices(food: dict) -> dict:
    """Ensure B/L/D meals have amount_paise + ₹ labels when missing."""
    out = _strip_evening_menu(food or {})
    for day in out.get("days") or []:
        for meal in day.get("meals") or []:
            code = meal.get("code") or ""
            if meal.get("amount_paise") in (None, "", 0) and code in DEFAULT_MEAL_PRICES_PAISE:
                meal["amount_paise"] = DEFAULT_MEAL_PRICES_PAISE[code]
            paise = meal.get("amount_paise")
            if paise not in (None, ""):
                try:
                    rupees = int(paise) // 100
                    meal["amount_label"] = f"₹{rupees}"
                    meal["amount_status"] = "fixed"
                except Exception:
                    pass
    return out


def _meal_price_map(food: dict) -> dict:
    food = _apply_default_prices(food)
    prices = {}
    for day in food.get("days") or []:
        for meal in day.get("meals") or []:
            code = meal.get("code")
            if code and code not in prices:
                prices[code] = {
                    "code": code,
                    "label": meal.get("label") or code.title(),
                    "amount_paise": meal.get("amount_paise"),
                    "amount_label": meal.get("amount_label") or "TBC",
                }
    return prices


@router.get("/food/menu")
async def food_menu():
    s = await get_settings()
    food = _apply_default_prices(s.get("food_subscription") or {})
    return {
        "menu": food,
        "payment_enabled": bool(food.get("payment_enabled")),
        "payment_note": food.get("payment_note") or "Pay via UPI QR after registering.",
        "meal_prices": list(_meal_price_map(food).values()),
    }


@router.post("/food/register")
async def food_register(body: dict = Body(...), request: Request = None):
    """Public food subscription — optional mobile; UPI QR payment when enabled."""
    s = await get_settings()
    food = _apply_default_prices(s.get("food_subscription") or {})
    if not food:
        raise HTTPException(status_code=503, detail="Food subscription is not configured yet.")

    name = (body.get("name") or "").strip()
    mobile_raw = "".join(c for c in str(body.get("mobile") or "") if c.isdigit())
    mobile = mobile_raw[-10:] if mobile_raw else ""
    if not name:
        raise HTTPException(status_code=400, detail="Name is required.")
    if mobile and len(mobile) != 10:
        raise HTTPException(status_code=400, detail="If provided, mobile must be a valid 10-digit number.")

    selections = _normalize_selections(food, body.get("selections") or [])
    if not selections:
        raise HTTPException(status_code=400, detail="Add at least one meal to your cart.")

    total_paise, item_count = _selection_totals(selections)

    payment_enabled = bool(food.get("payment_enabled")) and total_paise is not None and total_paise > 0
    cycle_id = await get_active_cycle_id()
    sid = new_id("food")
    doc = {
        "id": sid,
        "cycle_id": cycle_id,
        "name": name,
        "mobile": mobile,
        "tower_id": body.get("tower_id") or "",
        "tower_name": (body.get("tower_name") or "").strip(),
        "flat_id": body.get("flat_id") or "",
        "flat_number": (body.get("flat_number") or "").strip(),
        "family_members": int(body.get("family_members") or 1),
        "notes": (body.get("notes") or "").strip()[:500],
        "selections": selections,
        "selection_count": item_count,
        "amount_status": "fixed" if total_paise is not None else "TBC",
        "total_amount_paise": total_paise,
        "payment_status": "pending" if payment_enabled else "not_open",
        "status": "registered",
        "coupon_id": None,
        "coupon_no": None,
        "intent_id": None,
        "created_at": iso(),
        "updated_at": iso(),
        "source": "public",
    }

    intent_id = None
    status_tok = None
    if payment_enabled:
        # Lightweight household so UPI receipt path stays consistent
        hid = new_id("hh")
        await db.households.insert_one({
            "id": hid, "cycle_id": cycle_id,
            "tower_id": doc["tower_id"] or "food",
            "tower_name": doc["tower_name"] or "Food subscription",
            "flat_id": doc["flat_id"] or new_id("xflat"),
            "flat_number": doc["flat_number"] or "—",
            "occupancy_type": "other", "family_members": doc["family_members"],
            "primary_name": name, "primary_mobile": mobile or "",
            "is_food_subscriber": True, "created_at": iso(), "is_deleted": False,
            "source": "food_subscription",
        })
        intent_id = new_id("intent")
        intent = {
            "id": intent_id, "cycle_id": cycle_id, "household_id": hid,
            "kind": "food_subscription",
            "food_subscription_id": sid,
            "base_amount": total_paise, "donation_amount": 0, "total_amount": total_paise,
            "components": [],
            "payer_name": name, "payer_mobile": mobile or "",
            "status": "payment_pending", "method": "upi_qr",
            "notes": doc["notes"], "created_at": iso(),
        }
        await db.subscription_intents.insert_one(dict(intent))
        doc["intent_id"] = intent_id
        from tokens import status_token as _status_token
        status_tok = _status_token(intent_id)

    await db.food_subscriptions.insert_one(doc)
    await audit(
        "food.subscription.register",
        actor="public",
        entity_type="food_subscription",
        entity_id=sid,
        after={
            "name": name,
            "mobile": (mobile[-4:] if mobile else ""),
            "selection_count": item_count,
            "total_amount_paise": total_paise,
            "payment_enabled": payment_enabled,
        },
        reason="Public food subscription",
        request=request,
    )
    return {
        "ok": True,
        "id": sid,
        "status": "registered",
        "payment_enabled": payment_enabled,
        "total_amount_paise": total_paise,
        "selection_count": item_count,
        "selections": selections,
        "intent_id": intent_id,
        "status_token": status_tok,
        "message": (
            "Registered. Pay via UPI QR and upload your payment screenshot."
            if payment_enabled else
            "Registered. Payment is not open yet."
        ),
    }


@router.get("/admin/food-subscriptions/prices")
async def admin_food_prices(user: dict = Depends(require("households:read", "ops:read", "receipts:read"))):
    s = await get_settings()
    food = _apply_default_prices(s.get("food_subscription") or {})
    return {
        "payment_enabled": bool(food.get("payment_enabled")),
        "payment_note": food.get("payment_note") or "",
        "prices": list(_meal_price_map(food).values()),
    }


@router.put("/admin/food-subscriptions/prices")
async def admin_update_food_prices(
    body: dict = Body(...),
    request: Request = None,
    user: dict = Depends(require("households:write", "ops:manage", "receipts:manage")),
):
    """Update breakfast/lunch/dinner prices (rupees) and optionally open payment."""
    s = await get_settings()
    food = dict(s.get("food_subscription") or {})
    if not food:
        raise HTTPException(status_code=503, detail="Food subscription is not configured yet.")

    prices_in = body.get("prices") or {}
    # Accept {breakfast: 60, lunch: 300, dinner: 300} in rupees
    paise_map = {}
    for code in ("breakfast", "lunch", "dinner"):
        if code not in prices_in:
            continue
        try:
            rupees = float(prices_in[code])
        except Exception:
            raise HTTPException(status_code=400, detail=f"Invalid price for {code}")
        if rupees < 0:
            raise HTTPException(status_code=400, detail=f"Price for {code} cannot be negative")
        paise_map[code] = int(round(rupees * 100))

    days = []
    for day in food.get("days") or []:
        meals = []
        for meal in day.get("meals") or []:
            m = dict(meal)
            code = m.get("code")
            if code in paise_map:
                m["amount_paise"] = paise_map[code]
                m["amount_label"] = f"₹{paise_map[code] // 100}"
                m["amount_status"] = "fixed"
            meals.append(m)
        d = dict(day)
        d["meals"] = meals
        days.append(d)
    food["days"] = days

    if "payment_enabled" in body:
        food["payment_enabled"] = bool(body.get("payment_enabled"))
    if "payment_note" in body:
        food["payment_note"] = str(body.get("payment_note") or "")[:300]
    if food.get("payment_enabled") and not food.get("payment_note"):
        food["payment_note"] = "Pay via UPI QR after selecting meals, then upload your payment screenshot."

    await db.application_settings.update_one({}, {"$set": {"food_subscription": food}}, upsert=True)
    await audit(
        "food.prices.update",
        actor=user,
        entity_type="food_subscription",
        entity_id="menu",
        after={"prices": paise_map, "payment_enabled": food.get("payment_enabled")},
        request=request,
    )
    food = _apply_default_prices(food)
    return {
        "ok": True,
        "payment_enabled": bool(food.get("payment_enabled")),
        "payment_note": food.get("payment_note") or "",
        "prices": list(_meal_price_map(food).values()),
    }


@router.get("/admin/food-subscriptions")
async def admin_list_food(user: dict = Depends(require("households:read", "ops:read", "receipts:read"))):
    items = await db.food_subscriptions.find({}, NO_ID).sort("created_at", -1).to_list(2000)
    s = await get_settings()
    food = s.get("food_subscription") or {}
    return {"items": items, "payment_enabled": bool(food.get("payment_enabled"))}


_BASE_TEMPLATE_COLS = [
    "id",
    "name",
    "mobile",
    "tower_name",
    "flat_number",
    "family_members",
    "notes",
    "payment_status",
    "status",
]
_TRUTHY = {"y", "yes", "1", "true", "t", "x", "✓", "✔"}


def _meal_slot_headers(food: dict) -> list[str]:
    food = _strip_evening_menu(food or {})
    headers = []
    for day in food.get("days") or []:
        dcode = (day.get("code") or "").strip()
        if not dcode:
            continue
        for meal in day.get("meals") or []:
            mcode = (meal.get("code") or "").strip()
            if mcode:
                headers.append(f"{dcode}_{mcode}")
    return headers


def _normalize_header(h: str) -> str:
    return re.sub(r"[^a-z0-9_]+", "_", (h or "").strip().lower()).strip("_")


def _is_truthy(val) -> bool:
    if val is None:
        return False
    s = str(val).strip().lower()
    return s in _TRUTHY


def _parse_spreadsheet(content: bytes, filename: str) -> list[list]:
    name = (filename or "").lower()
    if name.endswith(".xlsx") or name.endswith(".xls"):
        from openpyxl import load_workbook
        wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        ws = wb.active
        return [[("" if c is None else c) for c in r] for r in ws.iter_rows(values_only=True)]
    text = content.decode("utf-8-sig", errors="replace")
    return list(csv.reader(io.StringIO(text)))


def _row_dict(header: list[str], row: list) -> dict:
    out = {}
    for i, key in enumerate(header):
        if not key:
            continue
        out[key] = row[i] if i < len(row) else ""
    return out


def _selections_from_row(food: dict, row: dict, meal_headers: list[str]) -> list | None:
    """Return selections from Y/N meal columns, or None if file has no meal columns."""
    present = [h for h in meal_headers if h in row]
    if not present:
        # Also accept a compact "meals" column: day|meal;day|meal
        raw = str(row.get("meals") or "").strip()
        if not raw:
            return None
        keys = [p.strip() for p in re.split(r"[;,]", raw) if p.strip()]
        return _normalize_selections(food, keys)

    lines = []
    for h in present:
        raw = str(row.get(h) or "").strip()
        if not raw:
            continue
        if "_" not in h:
            continue
        day, meal = h.split("_", 1)
        # Numeric quantity (e.g. 3) or truthy Y/yes
        qty = None
        try:
            qty = int(float(raw))
        except (TypeError, ValueError):
            qty = 1 if _is_truthy(raw) else 0
        if qty and qty > 0:
            lines.append({"day_code": day, "meal_code": meal, "quantity": qty})
    return _normalize_selections(food, lines)


def _payment_status_from_cell(val: str) -> str:
    s = (val or "").strip().lower()
    if s in {"paid", "captured", "settled", "yes", "y", "1"}:
        return "paid"
    if s in {"unpaid", "not_open", "not open", "pending", "no", "n", "0"}:
        return "not_open"
    if s:
        return s.replace(" ", "_")
    return "not_open"


@router.get("/admin/food-subscriptions/template")
async def admin_food_template(
    include_data: bool = True,
    user: dict = Depends(require("households:read", "ops:read", "receipts:read")),
):
    """CSV template for offline capture. Fill meal columns with Y/N, then upload."""
    s = await get_settings()
    food = _strip_evening_menu(s.get("food_subscription") or {})
    meal_headers = _meal_slot_headers(food)
    headers = _BASE_TEMPLATE_COLS + meal_headers

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)

    # Instruction / example blank row guidance as comment-like first data hint
    if include_data:
        items = await db.food_subscriptions.find({}, NO_ID).sort("created_at", -1).to_list(5000)
        for item in items:
            chosen = {
                f"{(sel.get('day_code') or '')}_{(sel.get('meal_code') or '')}"
                for sel in (item.get("selections") or [])
            }
            row = [
                item.get("id") or "",
                item.get("name") or "",
                item.get("mobile") or "",
                item.get("tower_name") or "",
                item.get("flat_number") or "",
                item.get("family_members") or 1,
                item.get("notes") or "",
                item.get("payment_status") or "not_open",
                item.get("status") or "registered",
            ]
            row.extend(["Y" if h in chosen else "" for h in meal_headers])
            writer.writerow(row)
    else:
        # One blank sample row so Excel opens with columns ready
        writer.writerow([""] * len(headers))

    data = buf.getvalue().encode("utf-8-sig")
    return StreamingResponse(
        io.BytesIO(data),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="food_subscription_template.csv"'},
    )


@router.post("/admin/food-subscriptions/import")
async def admin_food_import(
    file: UploadFile = File(...),
    request: Request = None,
    user: dict = Depends(require("households:write", "ops:manage", "receipts:manage")),
):
    """Upload filled template (CSV/XLSX) to create or update food subscriptions."""
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file.")

    rows = _parse_spreadsheet(content, file.filename or "upload.csv")
    if not rows or len(rows) < 2:
        raise HTTPException(status_code=400, detail="File needs a header row and at least one data row.")

    header = [_normalize_header(str(h)) for h in rows[0]]
    if "name" not in header or "mobile" not in header:
        raise HTTPException(status_code=400, detail="Template must include name and mobile columns.")

    s = await get_settings()
    food = s.get("food_subscription") or {}
    if not food:
        raise HTTPException(status_code=503, detail="Food subscription is not configured yet.")
    meal_headers = _meal_slot_headers(food)
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

        selections = _selections_from_row(food, row, meal_headers)
        sid = str(row.get("id") or "").strip()
        existing = None
        if sid:
            existing = await db.food_subscriptions.find_one({"id": sid})
        if not existing:
            existing = await db.food_subscriptions.find_one({"mobile": mobile}, sort=[("created_at", -1)])

        family_members = 1
        try:
            family_members = max(1, int(float(str(row.get("family_members") or 1).strip() or 1)))
        except Exception:
            family_members = 1

        payment_status = _payment_status_from_cell(str(row.get("payment_status") or ""))
        status = (str(row.get("status") or "").strip() or (existing or {}).get("status") or "registered")
        notes = str(row.get("notes") or "").strip()[:500]
        tower_name = str(row.get("tower_name") or "").strip()
        flat_number = str(row.get("flat_number") or "").strip()

        patch = {
            "name": name,
            "mobile": mobile,
            "tower_name": tower_name,
            "flat_number": flat_number,
            "family_members": family_members,
            "notes": notes,
            "payment_status": payment_status,
            "status": status,
            "updated_at": iso(),
        }
        if selections is not None:
            if not selections:
                skipped += 1
                errors.append({"row": idx, "error": "Select at least one meal (put Y in meal columns)"})
                continue
            patch["selections"] = selections
            patch["selection_count"] = len(selections)

        if existing:
            await db.food_subscriptions.update_one({"id": existing["id"]}, {"$set": patch})
            updated += 1
            await audit(
                "food.subscription.import_update",
                actor=user,
                entity_type="food_subscription",
                entity_id=existing["id"],
                after={"name": name, "mobile": mobile[-4:], "selection_count": patch.get("selection_count")},
                reason=f"Template upload row {idx}",
                request=request,
            )
        else:
            if selections is None or not selections:
                skipped += 1
                errors.append({"row": idx, "error": "New rows need at least one meal marked Y"})
                continue
            new_sid = new_id("food")
            doc = {
                "id": new_sid,
                "cycle_id": cycle_id,
                "tower_id": "",
                "flat_id": "",
                "amount_status": "TBC",
                "total_amount_paise": None,
                "coupon_id": None,
                "coupon_no": None,
                "created_at": iso(),
                "source": "admin_import",
                **patch,
            }
            await db.food_subscriptions.insert_one(doc)
            created += 1
            await audit(
                "food.subscription.import_create",
                actor=user,
                entity_type="food_subscription",
                entity_id=new_sid,
                after={"name": name, "mobile": mobile[-4:], "selection_count": len(selections)},
                reason=f"Template upload row {idx}",
                request=request,
            )

    return {
        "ok": True,
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "errors": errors[:50],
        "message": f"Import done — {created} created, {updated} updated, {skipped} skipped.",
    }


@router.get("/admin/food-subscriptions/{sid}")
async def admin_get_food(sid: str, user: dict = Depends(require("households:read", "ops:read", "receipts:read"))):
    doc = await db.food_subscriptions.find_one({"id": sid}, NO_ID)
    if not doc:
        raise HTTPException(status_code=404, detail="Food subscription not found.")
    coupon = None
    if doc.get("coupon_id"):
        coupon = await db.food_coupons.find_one({"id": doc["coupon_id"]}, NO_ID)
    trail = await db.audit_events.find(
        {"entity_type": "food_subscription", "entity_id": sid}, NO_ID
    ).sort("seq", 1).to_list(200)
    if doc.get("coupon_id"):
        trail += await db.audit_events.find(
            {"entity_type": "food_coupon", "entity_id": doc["coupon_id"]}, NO_ID
        ).sort("seq", 1).to_list(200)
        trail.sort(key=lambda e: e.get("seq") or 0)
    return {"item": doc, "coupon": coupon, "trail": trail}


@router.post("/admin/food-subscriptions/{sid}/coupon")
async def admin_generate_coupon(sid: str, request: Request = None,
                                user: dict = Depends(require("receipts:manage"))):
    """Generate a food coupon (admin only). Payment may still be TBC."""
    doc = await db.food_subscriptions.find_one({"id": sid})
    if not doc:
        raise HTTPException(status_code=404, detail="Food subscription not found.")
    if doc.get("coupon_id"):
        existing = await db.food_coupons.find_one({"id": doc["coupon_id"]}, NO_ID)
        return {"ok": True, "coupon": clean(existing), "already_existed": True}

    s = await get_settings()
    prefix = (s.get("food_subscription") or {}).get("coupon_prefix") or "ONE10-FOOD26"
    _, coupon_no = await next_formatted("food_coupon", prefix, 5)
    cid = new_id("fcoupon")
    coupon = {
        "id": cid,
        "coupon_no": coupon_no,
        "subscription_id": sid,
        "cycle_id": doc.get("cycle_id"),
        "name": doc.get("name"),
        "mobile": doc.get("mobile"),
        "tower_name": doc.get("tower_name"),
        "flat_number": doc.get("flat_number"),
        "selections": doc.get("selections") or [],
        "status": "issued",
        "print_count": 0,
        "issued_by": user.get("user_id"),
        "issued_by_name": user.get("name") or user.get("login_id") or "",
        "created_at": iso(),
        "updated_at": iso(),
    }
    await db.food_coupons.insert_one(coupon)
    await db.food_subscriptions.update_one(
        {"id": sid},
        {"$set": {"coupon_id": cid, "coupon_no": coupon_no, "status": "coupon_issued", "updated_at": iso()}},
    )
    await audit(
        "food.coupon.generate",
        actor=user,
        entity_type="food_coupon",
        entity_id=cid,
        after={"coupon_no": coupon_no, "subscription_id": sid},
        reason="Admin generated food coupon",
        request=request,
    )
    await audit(
        "food.subscription.coupon_link",
        actor=user,
        entity_type="food_subscription",
        entity_id=sid,
        after={"coupon_no": coupon_no, "coupon_id": cid},
        request=request,
    )
    return {"ok": True, "coupon": clean(coupon), "already_existed": False}


@router.get("/admin/food-coupons/{cid}/pdf")
async def admin_food_coupon_pdf(cid: str, request: Request = None,
                                user: dict = Depends(require("receipts:manage"))):
    """A4 food coupon printout — admin only."""
    coupon = await db.food_coupons.find_one({"id": cid}, NO_ID)
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon not found.")
    sub = await db.food_subscriptions.find_one({"id": coupon["subscription_id"]}, NO_ID)
    s = await get_settings()
    pdf = food_coupon_pdf(coupon, sub or {}, s)

    await db.food_coupons.update_one(
        {"id": cid},
        {"$inc": {"print_count": 1}, "$set": {"last_printed_at": iso(), "last_printed_by": user.get("user_id")}},
    )
    await audit(
        "food.coupon.print",
        actor=user,
        entity_type="food_coupon",
        entity_id=cid,
        after={"coupon_no": coupon.get("coupon_no"), "print_count": (coupon.get("print_count") or 0) + 1},
        reason="Admin printed A4 food coupon",
        request=request,
    )
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{coupon.get("coupon_no", "food-coupon")}.pdf"'},
    )


# =============================================================== FOOD MENU POLL / VOTING
async def _poll_tallies() -> dict:
    """Aggregate vote counts: key = day|meal|dish_id → count."""
    tallies: dict[str, int] = {}
    voter_count = 0
    diet_counts = {"pure_veg": 0, "eggetarian": 0, "non_veg": 0}
    async for vote in db.food_poll_votes.find({"is_deleted": {"$ne": True}}):
        voter_count += 1
        diet = vote.get("diet") or "pure_veg"
        if diet in diet_counts:
            diet_counts[diet] += 1
        for pick in vote.get("picks") or []:
            day = pick.get("day_code")
            meal = pick.get("meal_code")
            for dish_id in pick.get("dish_ids") or []:
                key = f"{day}|{meal}|{dish_id}"
                tallies[key] = tallies.get(key, 0) + 1
    return {"tallies": tallies, "voter_count": voter_count, "diet_counts": diet_counts}


def _proposed_menu(catalog: dict, tallies: dict, top_n: int = 6) -> list:
    """Build ultimate menu draft: top dishes per day/meal by votes (fallback to PDF suggested)."""
    proposed = []
    for day in catalog["days"]:
        meals = []
        for meal in day["meals"]:
            scored = []
            for dish in catalog["dishes"]:
                key = f"{day['code']}|{meal['code']}|{dish['id']}"
                votes = tallies.get(key, 0)
                if votes:
                    scored.append({**dish, "votes": votes})
            scored.sort(key=lambda x: (-x["votes"], x["name"]))
            if scored:
                top = scored[:top_n]
            else:
                # Fallback: pure_veg PDF suggestions
                sug = (meal.get("streams") or {}).get("pure_veg", {}).get("suggested") or []
                top = [{**d, "votes": 0} for d in sug[:top_n]]
            meals.append({
                "meal_code": meal["code"],
                "meal_label": meal["label"],
                "timing": meal.get("timing"),
                "top_dishes": top,
            })
        proposed.append({
            "day_code": day["code"],
            "day_label": day["label"],
            "date": day.get("date"),
            "weekday": day.get("weekday"),
            "meals": meals,
        })
    return proposed


@router.get("/food/poll")
async def food_poll():
    catalog = build_catalog()
    agg = await _poll_tallies()
    return {
        **catalog,
        "tallies": agg["tallies"],
        "voter_count": agg["voter_count"],
        "diet_counts": agg["diet_counts"],
        "proposed_menu": _proposed_menu(catalog, agg["tallies"]),
    }


@router.get("/food/poll/results")
async def food_poll_results():
    catalog = build_catalog()
    agg = await _poll_tallies()
    return {
        "meta": catalog["meta"],
        "voter_count": agg["voter_count"],
        "diet_counts": agg["diet_counts"],
        "tallies": agg["tallies"],
        "proposed_menu": _proposed_menu(catalog, agg["tallies"], top_n=8),
        "days": catalog["days"],
    }


@router.post("/food/poll/vote")
async def food_poll_vote(body: dict = Body(...), request: Request = None):
    """Submit or update a household vote (keyed by mobile)."""
    name = (body.get("name") or "").strip()
    mobile = "".join(c for c in str(body.get("mobile") or "") if c.isdigit())[-10:]
    diet = (body.get("diet") or "pure_veg").strip().lower()
    if diet not in {"pure_veg", "eggetarian", "non_veg"}:
        raise HTTPException(status_code=400, detail="Invalid diet preference.")
    if not name or len(mobile) != 10:
        raise HTTPException(status_code=400, detail="Name and a valid 10-digit mobile are required.")

    stream = "non_veg" if diet in {"non_veg", "eggetarian"} else "pure_veg"
    picks_in = body.get("picks") or []
    cleaned = []
    seen_slots = set()
    for raw in picks_in:
        day = (raw.get("day_code") or "").strip()
        meal = (raw.get("meal_code") or "").strip()
        if day not in _DAY_CODES or meal not in _MEAL_CODES:
            continue
        slot = f"{day}|{meal}"
        if slot in seen_slots:
            continue
        seen_slots.add(slot)
        ids = []
        for did in raw.get("dish_ids") or []:
            did = str(did).strip()
            if did in _DISH_IDS and did not in ids:
                # Eggetarian can pick veg+egg; pure_veg only veg
                dish = next(d for d in DISHES if d["id"] == did)
                if diet == "pure_veg" and dish["diet"] != "veg":
                    continue
                if diet == "eggetarian" and dish["diet"] == "nonveg":
                    continue
                ids.append(did)
            if len(ids) >= _MAX_PER_MEAL:
                break
        if ids:
            cleaned.append({"day_code": day, "meal_code": meal, "dish_ids": ids})

    if not cleaned:
        raise HTTPException(status_code=400, detail="Select at least one dish for any meal.")

    cycle_id = await get_active_cycle_id()
    now = iso()
    doc = {
        "cycle_id": cycle_id,
        "name": name,
        "mobile": mobile,
        "diet": diet,
        "stream": stream,
        "tower_id": (body.get("tower_id") or "").strip() or None,
        "tower_name": (body.get("tower_name") or "").strip() or None,
        "flat_number": (body.get("flat_number") or "").strip() or None,
        "notes": (body.get("notes") or "").strip() or None,
        "picks": cleaned,
        "updated_at": now,
        "is_deleted": False,
    }

    existing = await db.food_poll_votes.find_one({"mobile": mobile, "cycle_id": cycle_id, "is_deleted": {"$ne": True}})
    if existing:
        await db.food_poll_votes.update_one({"id": existing["id"]}, {"$set": doc})
        vote_id = existing["id"]
        created = False
    else:
        vote_id = new_id("fpoll")
        doc["id"] = vote_id
        doc["created_at"] = now
        await db.food_poll_votes.insert_one(doc)
        created = True

    await audit(
        "food.poll.vote",
        entity_type="food_poll_vote",
        entity_id=vote_id,
        after={"mobile": mobile[-4:], "diet": diet, "slots": len(cleaned), "created": created},
        request=request,
    )

    agg = await _poll_tallies()
    catalog = build_catalog()
    return {
        "ok": True,
        "vote_id": vote_id,
        "updated": not created,
        "message": "Thanks! Your votes are in — the ultimate menu updates live." if created else "Vote updated.",
        "voter_count": agg["voter_count"],
        "proposed_menu": _proposed_menu(catalog, agg["tallies"]),
    }


@router.get("/admin/food-poll/votes")
async def admin_food_poll_votes(user: dict = Depends(require("households:read", "ops:read", "receipts:read"))):
    items = await db.food_poll_votes.find({"is_deleted": {"$ne": True}}, NO_ID).sort("updated_at", -1).to_list(5000)
    agg = await _poll_tallies()
    return {"items": items, "voter_count": agg["voter_count"], "diet_counts": agg["diet_counts"]}

