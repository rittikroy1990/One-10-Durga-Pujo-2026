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


def _normalize_selections(food: dict, selections: list, items_by_id: dict | None = None) -> list:
    """Accept cart lines with quantities.

    Supported shapes:
      - "day|meal"
      - {"day_code","meal_code", quantity|qty}
      - {"item_id", quantity|qty}  (menu catalog items)
    Quantities for the same key are merged. Max 50 per line.
    """
    items_by_id = items_by_id or {}
    lookup = _menu_lookup(food)
    cleaned = []
    index_by_key = {}
    for raw in selections or []:
        qty = 1
        item = None
        key = None
        if isinstance(raw, str) and "|" in raw:
            key = raw.strip()
            if key not in lookup:
                continue
            item = dict(lookup[key])
        elif isinstance(raw, dict) and (raw.get("item_id") or raw.get("id")):
            iid = (raw.get("item_id") or raw.get("id") or "").strip()
            src = items_by_id.get(iid)
            if not src or not src.get("active", True):
                continue
            try:
                qty = int(raw.get("quantity") if raw.get("quantity") is not None else raw.get("qty") or 1)
            except (TypeError, ValueError):
                qty = 1
            key = f"item|{iid}"
            item = {
                "item_id": iid,
                "name": src.get("name") or "",
                "description": src.get("description") or "",
                "image_url": src.get("image_url") or "",
                "category": src.get("category") or "",
                "category_label": MEAL_CATEGORIES.get(src.get("category") or "") or src.get("category") or "",
                "diet": src.get("diet") or "",
                "diet_label": DIET_TYPES.get(src.get("diet") or "") or "",
                "menu_date": src.get("menu_date") or "",
                "day_code": "menu",
                "day_label": src.get("menu_date") or "Menu",
                "meal_code": src.get("category") or "item",
                "meal_label": src.get("name") or "Item",
                "amount_paise": int(src.get("amount_paise") or 0),
                "amount_label": src.get("amount_label") or "",
                "amount_status": "fixed",
            }
        elif isinstance(raw, dict):
            key = f"{raw.get('day_code')}|{raw.get('meal_code')}"
            try:
                qty = int(raw.get("quantity") if raw.get("quantity") is not None else raw.get("qty") or 1)
            except (TypeError, ValueError):
                qty = 1
            if key not in lookup:
                continue
            item = dict(lookup[key])
        else:
            continue
        if not item or qty < 1:
            continue
        qty = min(qty, 50)
        if key in index_by_key:
            row = cleaned[index_by_key[key]]
            row["quantity"] = min(50, int(row.get("quantity") or 0) + qty)
            unit = row.get("amount_paise")
            row["line_total_paise"] = (int(unit) * row["quantity"]) if unit not in (None, "") else None
            continue
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



def _food_page_enabled(food: dict) -> bool:
    """Public Food page is coming-soon unless admin explicitly enables it."""
    return bool((food or {}).get("page_enabled"))

@router.get("/food/menu")
async def food_menu():
    s = await get_settings()
    food = _apply_default_prices(s.get("food_subscription") or {})
    page_enabled = _food_page_enabled(food)
    catalog = []
    if page_enabled:
        catalog = await db.food_menu_items.find(
            {"active": True, "is_deleted": {"$ne": True}}, NO_ID
        ).sort([("menu_date", 1), ("category", 1), ("sort_order", 1), ("created_at", 1)]).to_list(200)
    from pujo_menu_2026 import MENU_META
    return {
        "menu": food if page_enabled else {"days": []},
        "items": [_item_public(i) for i in catalog],
        "page_enabled": page_enabled,
        "coming_soon_message": (food.get("coming_soon_message") or "").strip()
            or "Food subscriptions will open soon. Please check back.",
        "payment_enabled": bool(food.get("payment_enabled")) if page_enabled else False,
        "payment_note": food.get("payment_note") or "Pay via UPI QR after registering.",
        "meal_prices": list(_meal_price_map(food).values()) if page_enabled else [],
        "mode": "items" if catalog else "meals",
        "overall_menu_url": (food.get("overall_menu_url") or "").strip() if page_enabled else "",
        "overall_menu_filename": (food.get("overall_menu_filename") or "").strip() if page_enabled else "",
        "menu_meta": MENU_META if page_enabled else {},
        "kids_note": (food.get("kids_note") or MENU_META.get("kids_note") or "") if page_enabled else "",
        "timings": (food.get("timings") or MENU_META.get("timings") or {}) if page_enabled else {},
    }


@router.post("/food/register")
async def food_register(body: dict = Body(...), request: Request = None):
    """Public food order — menu items and/or day meals; UPI QR when enabled."""
    s = await get_settings()
    food = _apply_default_prices(s.get("food_subscription") or {})
    if not food:
        raise HTTPException(status_code=503, detail="Food subscription is not configured yet.")
    if not _food_page_enabled(food):
        raise HTTPException(status_code=403, detail="Food subscriptions are coming soon.")

    name = (body.get("name") or "").strip()
    mobile_raw = "".join(c for c in str(body.get("mobile") or "") if c.isdigit())
    mobile = mobile_raw[-10:] if mobile_raw else ""
    if not name:
        raise HTTPException(status_code=400, detail="Name is required.")
    if len(mobile) != 10:
        raise HTTPException(status_code=400, detail="Enter a valid 10-digit mobile number.")

    catalog = await db.food_menu_items.find(
        {"active": True, "is_deleted": {"$ne": True}}, NO_ID
    ).to_list(500)
    items_by_id = {c["id"]: c for c in catalog}
    selections = _normalize_selections(food, body.get("selections") or [], items_by_id=items_by_id)
    if not selections:
        raise HTTPException(status_code=400, detail="Add at least one item to your cart.")

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
        "order_mode": "items" if any(s.get("item_id") for s in selections) else "meals",
    }

    intent_id = None
    status_tok = None
    if payment_enabled:
        hid = new_id("hh")
        await db.households.insert_one({
            "id": hid, "cycle_id": cycle_id,
            "tower_id": doc["tower_id"] or "food",
            "tower_name": doc["tower_name"] or "Food order",
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
        reason="Public food order",
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
            "Order placed. Pay via UPI QR and upload your payment screenshot."
            if payment_enabled else
            "Order placed. Payment is not open yet."
        ),
    }


@router.get("/admin/food-subscriptions/prices")
async def admin_food_prices(user: dict = Depends(require("households:read", "ops:read", "receipts:read"))):
    s = await get_settings()
    food = _apply_default_prices(s.get("food_subscription") or {})
    return {
        "page_enabled": _food_page_enabled(food),
        "coming_soon_message": (food.get("coming_soon_message") or "").strip(),
        "payment_enabled": bool(food.get("payment_enabled")),
        "payment_note": food.get("payment_note") or "",
        "prices": list(_meal_price_map(food).values()),
    }


MEAL_CATEGORIES = {
    "breakfast": "Breakfast",
    "lunch": "Lunch",
    "dinner": "Dinner",
}
DIET_TYPES = {
    "veg": "Veg",
    "non_veg": "Non-veg",
}


def _normalize_meal_category(raw: str) -> str:
    key = (raw or "").strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "bf": "breakfast",
        "brkfast": "breakfast",
        "l": "lunch",
        "d": "dinner",
        "din": "dinner",
    }
    key = aliases.get(key, key)
    return key if key in MEAL_CATEGORIES else ""


def _normalize_diet(raw: str) -> str:
    key = (raw or "").strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "vegetarian": "veg",
        "veggie": "veg",
        "nonveg": "non_veg",
        "nonvegetarian": "non_veg",
        "nv": "non_veg",
    }
    key = aliases.get(key, key)
    return key if key in DIET_TYPES else ""


def _normalize_menu_date(raw: str) -> str:
    """Accept YYYY-MM-DD (HTML date) or DD/MM/YYYY; return YYYY-MM-DD or ''."""
    s = (raw or "").strip()
    if not s:
        return ""
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return s
    m = re.fullmatch(r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= mo <= 12 and 1 <= d <= 31:
            return f"{y:04d}-{mo:02d}-{d:02d}"
    return ""


def _default_menu_image(category: str, diet: str, day_code: str = "") -> str:
    """Prefer day×meal×diet plate photos; fall back to generic meal samples."""
    cat = (category or "").strip().lower()
    if cat not in {"breakfast", "lunch", "dinner"}:
        return ""
    day = (day_code or "").strip().lower()
    diet_norm = (diet or "").strip().lower()
    diet_key = "nonveg" if diet_norm == "non_veg" else ("veg" if diet_norm == "veg" else "")
    if day and diet_key:
        return f"/images/food-menu/day/{day}-{cat}-{diet_key}.png"
    if not diet_key:
        return ""
    return f"/images/food-menu/menu-{diet_key}-{cat}.png"


def _item_public(doc: dict) -> dict:
    category = _normalize_meal_category(doc.get("category") or "") or (doc.get("category") or "")
    diet = _normalize_diet(doc.get("diet") or doc.get("veg_type") or "")
    menu_date = _normalize_menu_date(doc.get("menu_date") or doc.get("date") or "") or (doc.get("menu_date") or "")
    day_code = (doc.get("day_code") or "").strip()
    image_url = (doc.get("image_url") or "").strip() or _default_menu_image(category, diet, day_code)
    return clean({
        "id": doc.get("id"),
        "name": doc.get("name") or "",
        "description": doc.get("description") or "",
        "image_url": image_url,
        "amount_paise": int(doc.get("amount_paise") or 0),
        "amount_label": doc.get("amount_label") or f"₹{int(doc.get('amount_paise') or 0) // 100}",
        "category": category,
        "category_label": MEAL_CATEGORIES.get(category) or category or "",
        "diet": diet,
        "diet_label": DIET_TYPES.get(diet) or "",
        "menu_date": menu_date,
        "day_code": day_code,
        "day_label": doc.get("day_label") or "",
        "matrix_key": doc.get("matrix_key") or "",
        "active": bool(doc.get("active", True)),
        "sort_order": int(doc.get("sort_order") or 0),
        "is_complimentary": bool(doc.get("is_complimentary")),
        "complimentary_note": (doc.get("complimentary_note") or "").strip(),
        "price_note": (doc.get("price_note") or "").strip(),
        "badge": (doc.get("badge") or "").strip(),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    })


@router.get("/admin/food-menu-items")
async def admin_list_food_items(user: dict = Depends(require("households:read", "ops:read", "receipts:read"))):
    items = await db.food_menu_items.find(
        {"is_deleted": {"$ne": True}}, NO_ID
    ).sort([("sort_order", 1), ("created_at", -1)]).to_list(500)
    return {"items": [_item_public(i) for i in items]}


@router.post("/admin/food-menu-items")
async def admin_create_food_item(request: Request, user: dict = Depends(require("households:write", "ops:manage", "receipts:manage", "settings:manage"))):
    """Create a sellable menu item: date, meal category, veg/non-veg, image, price."""
    form = await request.form()
    name = (form.get("name") or "").strip()
    description = (form.get("description") or form.get("menu") or "").strip()[:800]
    category = _normalize_meal_category(form.get("category") or "")
    diet = _normalize_diet(form.get("diet") or form.get("veg_type") or "")
    menu_date = _normalize_menu_date(form.get("menu_date") or form.get("date") or "")
    price_raw = form.get("price_rupees") or form.get("price") or "0"
    try:
        price_rupees = float(str(price_raw).replace(",", "").strip() or 0)
    except ValueError:
        raise HTTPException(status_code=400, detail="Enter a valid price in rupees.")
    if not name or len(name) < 2:
        raise HTTPException(status_code=400, detail="Item name / menu title is required.")
    if not category:
        raise HTTPException(status_code=400, detail="Category must be Breakfast, Lunch, or Dinner.")
    if not diet:
        raise HTTPException(status_code=400, detail="Select Veg or Non-veg.")
    if not menu_date:
        raise HTTPException(status_code=400, detail="Menu date is required (YYYY-MM-DD).")
    if price_rupees < 0:
        raise HTTPException(status_code=400, detail="Price cannot be negative.")
    amount_paise = int(round(price_rupees * 100))
    active = str(form.get("active") or "true").lower() in ("1", "true", "yes", "on")
    try:
        sort_order = int(form.get("sort_order") or 0)
    except ValueError:
        sort_order = 0

    image_url = ""
    file = form.get("image")
    if file and getattr(file, "filename", None):
        data = await file.read()
        if data:
            if len(data) > 8 * 1024 * 1024:
                raise HTTPException(status_code=400, detail="Image too large (max 8 MB).")
            from storage import save_document
            ctype = getattr(file, "content_type", None) or "image/jpeg"
            doc = await save_document(
                data=data,
                filename=file.filename or "food-item.jpg",
                doc_type="food_menu",
                linked_type="food_menu_item",
                linked_id="pending",
                uploaded_by=user.get("user_id") or "admin",
                content_type=ctype,
            )
            image_url = doc.get("storage_path") or ""

    iid = new_id("fitem")
    if image_url:
        await db.documents.update_one({"storage_path": image_url}, {"$set": {"linked_id": iid}})
    rec = {
        "id": iid,
        "name": name,
        "description": description,
        "category": category,
        "diet": diet,
        "menu_date": menu_date,
        "image_url": image_url,
        "amount_paise": amount_paise,
        "amount_label": f"₹{int(amount_paise) // 100}",
        "active": active,
        "sort_order": sort_order,
        "is_deleted": False,
        "created_at": iso(),
        "updated_at": iso(),
        "created_by": user.get("user_id") or "",
    }
    await db.food_menu_items.insert_one(dict(rec))
    await audit("food.menu_item.create", entity_type="food_menu_item", entity_id=iid,
                after={"name": name, "amount_paise": amount_paise, "category": category, "diet": diet, "menu_date": menu_date},
                request=request)
    return {"ok": True, "item": _item_public(rec)}


@router.put("/admin/food-menu-items/{item_id}")
async def admin_update_food_item(item_id: str, request: Request, user: dict = Depends(require("households:write", "ops:manage", "receipts:manage", "settings:manage"))):
    existing = await db.food_menu_items.find_one({"id": item_id, "is_deleted": {"$ne": True}})
    if not existing:
        raise HTTPException(status_code=404, detail="Menu item not found.")
    form = await request.form()
    patch = {"updated_at": iso()}
    if "name" in form:
        name = (form.get("name") or "").strip()
        if len(name) < 2:
            raise HTTPException(status_code=400, detail="Item name is required.")
        patch["name"] = name
    if "description" in form or "menu" in form:
        patch["description"] = (form.get("description") or form.get("menu") or "").strip()[:800]
    if "category" in form:
        category = _normalize_meal_category(form.get("category") or "")
        if not category:
            raise HTTPException(status_code=400, detail="Category must be Breakfast, Lunch, or Dinner.")
        patch["category"] = category
    if "diet" in form or "veg_type" in form:
        diet = _normalize_diet(form.get("diet") or form.get("veg_type") or "")
        if not diet:
            raise HTTPException(status_code=400, detail="Select Veg or Non-veg.")
        patch["diet"] = diet
    if "menu_date" in form or "date" in form:
        menu_date = _normalize_menu_date(form.get("menu_date") or form.get("date") or "")
        if not menu_date:
            raise HTTPException(status_code=400, detail="Menu date is required (YYYY-MM-DD).")
        patch["menu_date"] = menu_date
    if "price_rupees" in form or "price" in form:
        try:
            price_rupees = float(str(form.get("price_rupees") or form.get("price") or 0).replace(",", ""))
        except ValueError:
            raise HTTPException(status_code=400, detail="Enter a valid price in rupees.")
        if price_rupees < 0:
            raise HTTPException(status_code=400, detail="Price cannot be negative.")
        amount_paise = int(round(price_rupees * 100))
        patch["amount_paise"] = amount_paise
        patch["amount_label"] = f"₹{amount_paise // 100}"
    if "active" in form:
        patch["active"] = str(form.get("active") or "").lower() in ("1", "true", "yes", "on")
    if "sort_order" in form:
        try:
            patch["sort_order"] = int(form.get("sort_order") or 0)
        except ValueError:
            pass
    file = form.get("image")
    if file and getattr(file, "filename", None):
        data = await file.read()
        if data:
            from storage import save_document
            ctype = getattr(file, "content_type", None) or "image/jpeg"
            doc = await save_document(
                data=data,
                filename=file.filename or "food-item.jpg",
                doc_type="food_menu",
                linked_type="food_menu_item",
                linked_id=item_id,
                uploaded_by=user.get("user_id") or "admin",
                content_type=ctype,
            )
            patch["image_url"] = doc.get("storage_path") or ""
    await db.food_menu_items.update_one({"id": item_id}, {"$set": patch})
    updated = await db.food_menu_items.find_one({"id": item_id}, NO_ID)
    await audit("food.menu_item.update", entity_type="food_menu_item", entity_id=item_id,
                after=patch, request=request)
    return {"ok": True, "item": _item_public(updated)}


@router.delete("/admin/food-menu-items/{item_id}")
async def admin_delete_food_item(item_id: str, request: Request = None, user: dict = Depends(require("households:write", "ops:manage", "receipts:manage", "settings:manage"))):
    existing = await db.food_menu_items.find_one({"id": item_id, "is_deleted": {"$ne": True}})
    if not existing:
        raise HTTPException(status_code=404, detail="Menu item not found.")
    await db.food_menu_items.update_one({"id": item_id}, {"$set": {
        "is_deleted": True, "active": False, "updated_at": iso(),
    }})
    await audit("food.menu_item.delete", entity_type="food_menu_item", entity_id=item_id, request=request)
    return {"ok": True}


@router.get("/admin/food-menu-matrix")
async def admin_food_menu_matrix(user: dict = Depends(require("households:read", "ops:read", "receipts:read"))):
    """Day × Meal × Veg/Non-veg matrix for admin pricing and images."""
    from food_menu_matrix import matrix_payload
    items = await db.food_menu_items.find({"is_deleted": {"$ne": True}}, NO_ID).to_list(500)
    payload = matrix_payload(items)
    s = await get_settings()
    food = s.get("food_subscription") or {}
    payload["page_enabled"] = _food_page_enabled(food)
    payload["payment_enabled"] = bool(food.get("payment_enabled"))
    payload["overall_menu_url"] = (food.get("overall_menu_url") or "").strip()
    payload["overall_menu_filename"] = (food.get("overall_menu_filename") or "").strip()
    payload["overall_menu_uploaded_at"] = food.get("overall_menu_uploaded_at") or ""
    return payload


@router.post("/admin/food-menu-matrix/seed-official")
async def admin_seed_official_pujo_menu(
    request: Request,
    user: dict = Depends(require("households:write", "ops:manage", "receipts:manage", "settings:manage")),
):
    """Replace/upsert all 36 cells from the committee poster catalog + day plate images."""
    from pujo_menu_2026 import official_cells_for_seed, MENU_META
    cells = official_cells_for_seed()
    upserted = 0
    for cell in cells:
        key = cell["matrix_key"]
        existing = await db.food_menu_items.find_one({"matrix_key": key, "is_deleted": {"$ne": True}})
        patch = {
            **{k: cell[k] for k in (
                "matrix_key", "day_code", "day_label", "menu_date", "category", "diet",
                "name", "description", "amount_paise", "amount_label", "image_url",
                "active", "is_complimentary", "complimentary_note", "price_note", "badge", "sort_order",
            )},
            "updated_at": iso(),
            "is_deleted": False,
            "source": "official_poster_2026",
        }
        if existing:
            await db.food_menu_items.update_one({"id": existing["id"]}, {"$set": patch})
        else:
            await db.food_menu_items.insert_one({
                "id": new_id("fitem"),
                **patch,
                "created_at": iso(),
                "created_by": user.get("user_id") or "",
            })
        upserted += 1

    s = await get_settings()
    food = dict(s.get("food_subscription") or {})
    food["page_enabled"] = True
    food["payment_enabled"] = True if food.get("payment_enabled") is None else bool(food.get("payment_enabled"))
    food["kids_note"] = MENU_META.get("kids_note") or food.get("kids_note") or ""
    food["timings"] = MENU_META.get("timings") or food.get("timings") or {}
    food["overall_menu_url"] = food.get("overall_menu_url") or "/images/food-menu/pujo-menu-poster-2026.jpg"
    food["overall_menu_filename"] = food.get("overall_menu_filename") or "Durga Puja Menu 2026 poster.jpg"
    food["payment_note"] = food.get("payment_note") or (
        "Pay the cart total via UPI QR after checkout, then upload your payment screenshot."
    )
    await db.application_settings.update_one({"id": "app_settings"}, {"$set": {"food_subscription": food}}, upsert=True)
    await audit(
        "food.menu_matrix.seed_official",
        entity_type="food_menu",
        entity_id="matrix",
        after={"cells": upserted},
        request=request,
    )
    return {"ok": True, "upserted": upserted, "message": f"Seeded {upserted} official menu cells from the Pujo poster."}


@router.put("/admin/food-menu-matrix/cell")
async def admin_upsert_matrix_cell(request: Request, user: dict = Depends(require("households:write", "ops:manage", "receipts:manage", "settings:manage"))):
    """Create/update one matrix cell (multipart): day_code, meal, diet, price, image, …"""
    from food_menu_matrix import (
        DAYS, MEALS, MATRIX_DIETS, matrix_key, default_cell_name, DEFAULT_CELL_PRICE_RUPEES,
    )
    form = await request.form()
    day_code = (form.get("day_code") or "").strip().lower()
    meal = _normalize_meal_category(form.get("meal") or form.get("category") or "")
    diet = _normalize_diet(form.get("diet") or "")
    day = next((d for d in DAYS if d["code"] == day_code), None)
    if not day:
        raise HTTPException(status_code=400, detail="Unknown Pujo day code.")
    if not meal:
        raise HTTPException(status_code=400, detail="Meal must be breakfast, lunch, or dinner.")
    if not diet:
        raise HTTPException(status_code=400, detail="Diet must be veg or non_veg.")

    key = matrix_key(day_code, meal, diet)
    meal_label = next(m["label"] for m in MEALS if m["code"] == meal)
    diet_label = next(d["label"] for d in MATRIX_DIETS if d["code"] == diet)
    day_label = day.get("short_label") or day["label"]

    name = (form.get("name") or "").strip() or default_cell_name(day_label, meal_label, diet_label)
    description = (form.get("description") or form.get("menu") or "").strip()[:800]
    price_raw = form.get("price_rupees") or form.get("price")
    if price_raw is None or str(price_raw).strip() == "":
        price_rupees = float(DEFAULT_CELL_PRICE_RUPEES.get(meal, 300))
    else:
        try:
            price_rupees = float(str(price_raw).replace(",", "").strip())
        except ValueError:
            raise HTTPException(status_code=400, detail="Enter a valid price in rupees.")
    if price_rupees < 0:
        raise HTTPException(status_code=400, detail="Price cannot be negative.")
    amount_paise = int(round(price_rupees * 100))
    active = str(form.get("active") if form.get("active") is not None else "true").lower() in (
        "1", "true", "yes", "on", "y"
    )

    existing = await db.food_menu_items.find_one({"matrix_key": key, "is_deleted": {"$ne": True}})
    image_url = (existing or {}).get("image_url") or ""
    file = form.get("image")
    if file and getattr(file, "filename", None):
        data = await file.read()
        if data:
            if len(data) > 8 * 1024 * 1024:
                raise HTTPException(status_code=400, detail="Image too large (max 8 MB).")
            from storage import save_document
            ctype = getattr(file, "content_type", None) or "image/jpeg"
            doc = await save_document(
                data=data,
                filename=file.filename or "food-matrix.jpg",
                doc_type="food_menu",
                linked_type="food_menu_item",
                linked_id=(existing or {}).get("id") or "pending",
                uploaded_by=user.get("user_id") or "admin",
                content_type=ctype,
            )
            image_url = doc.get("storage_path") or image_url
    elif form.get("clear_image") in ("1", "true", "yes"):
        image_url = ""
    elif form.get("image_url"):
        image_url = str(form.get("image_url")).strip()[:500]

    patch = {
        "matrix_key": key,
        "day_code": day_code,
        "day_label": day_label,
        "menu_date": day["date"],
        "category": meal,
        "diet": diet,
        "name": name[:120],
        "description": description,
        "amount_paise": amount_paise,
        "amount_label": f"₹{amount_paise // 100}",
        "image_url": image_url,
        "active": active,
        "updated_at": iso(),
        "is_deleted": False,
        "is_complimentary": str(form.get("is_complimentary") or "").lower() in ("1", "true", "yes", "on", "y"),
        "complimentary_note": str(form.get("complimentary_note") or "").strip()[:400],
        "price_note": str(form.get("price_note") or "").strip()[:300],
        "badge": str(form.get("badge") or "").strip()[:120],
    }

    if existing:
        await db.food_menu_items.update_one({"id": existing["id"]}, {"$set": patch})
        item_id = existing["id"]
        if image_url:
            await db.documents.update_one({"storage_path": image_url}, {"$set": {"linked_id": item_id}})
    else:
        item_id = new_id("fitem")
        rec = {
            "id": item_id,
            **patch,
            "sort_order": int(day.get("order") or 0) * 100 + (1 if meal == "breakfast" else 2 if meal == "lunch" else 3) * 10 + (1 if diet == "veg" else 2),
            "created_at": iso(),
            "created_by": user.get("user_id") or "",
            "source": "matrix",
        }
        await db.food_menu_items.insert_one(dict(rec))
        if image_url:
            await db.documents.update_one({"storage_path": image_url}, {"$set": {"linked_id": item_id}})

    updated = await db.food_menu_items.find_one({"id": item_id}, NO_ID)
    await audit("food.menu_matrix.cell_upsert", entity_type="food_menu_item", entity_id=item_id,
                after={"matrix_key": key, "amount_paise": amount_paise, "active": active}, request=request)
    return {"ok": True, "item": _item_public(updated)}


@router.get("/admin/food-menu-matrix/template")
async def admin_food_matrix_template(user: dict = Depends(require("households:read", "ops:read", "receipts:read"))):
    from food_menu_matrix import build_matrix_template_xlsx
    items = await db.food_menu_items.find({"is_deleted": {"$ne": True}}, NO_ID).to_list(500)
    data = build_matrix_template_xlsx(items)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="one10_food_menu_matrix.xlsx"'},
    )


@router.post("/admin/food-menu-matrix/import")
async def admin_food_matrix_import(
    file: UploadFile = File(...),
    request: Request = None,
    user: dict = Depends(require("households:write", "ops:manage", "receipts:manage", "settings:manage")),
):
    """Bulk upsert matrix cells from Excel/CSV (prices, names, active; optional image URL)."""
    from food_menu_matrix import parse_matrix_upload, MEALS, MATRIX_DIETS

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file.")
    try:
        rows = parse_matrix_upload(raw, file.filename or "")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read Excel/CSV. Use the downloaded template.")

    created = updated = skipped = 0
    errors = []
    for row in rows:
        if row.get("error"):
            errors.append({"row": row.get("excel_row"), "error": row["error"]})
            skipped += 1
            continue
        key = row["matrix_key"]
        existing = await db.food_menu_items.find_one({"matrix_key": key, "is_deleted": {"$ne": True}})
        meal_label = next(m["label"] for m in MEALS if m["code"] == row["meal"])
        diet_label = next(d["label"] for d in MATRIX_DIETS if d["code"] == row["diet"])
        patch = {
            "matrix_key": key,
            "day_code": row["day_code"],
            "day_label": row["day_label"],
            "menu_date": row["menu_date"],
            "category": row["meal"],
            "diet": row["diet"],
            "name": row["name"],
            "description": row.get("description") or "",
            "amount_paise": row["amount_paise"],
            "amount_label": f"₹{row['amount_paise'] // 100}",
            "active": row["active"],
            "updated_at": iso(),
            "is_deleted": False,
            "source": "matrix_excel",
        }
        if row.get("image_url"):
            patch["image_url"] = row["image_url"]
        elif not existing:
            patch["image_url"] = ""

        if existing:
            # Don't wipe image unless Excel provided a URL
            if "image_url" not in patch:
                pass
            await db.food_menu_items.update_one({"id": existing["id"]}, {"$set": patch})
            updated += 1
        else:
            from food_poll_catalog import DAYS as _DAYS
            day = next((d for d in _DAYS if d["code"] == row["day_code"]), {})
            await db.food_menu_items.insert_one({
                "id": new_id("fitem"),
                **patch,
                "image_url": patch.get("image_url") or "",
                "sort_order": int(day.get("order") or 0) * 100,
                "created_at": iso(),
                "created_by": user.get("user_id") or "",
            })
            created += 1

    await audit(
        "food.menu_matrix.import",
        actor=user,
        entity_type="food_menu_matrix",
        entity_id="import",
        after={"created": created, "updated": updated, "skipped": skipped, "errors": len(errors)},
        request=request,
    )
    return {
        "ok": True,
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "errors": errors[:20],
        "message": f"Imported matrix: {created} created, {updated} updated"
        + (f", {skipped} skipped" if skipped else ""),
    }


@router.post("/admin/food-menu-matrix/upload-overall")
async def admin_food_matrix_upload_overall(
    file: UploadFile = File(...),
    request: Request = None,
    user: dict = Depends(require("households:write", "ops:manage", "receipts:manage", "settings:manage")),
):
    """Upload overall food menu (Word/Excel/PDF/image). Stores file + fills matrix when parseable."""
    from food_menu_matrix import parse_overall_menu_file, DAYS as MATRIX_DAYS
    from storage import save_document

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file.")
    if len(raw) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 20 MB).")

    filename = file.filename or "food-menu"
    try:
        parsed = parse_overall_menu_file(raw, filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read that menu file.")

    ctype = getattr(file, "content_type", None) or "application/octet-stream"
    doc = await save_document(
        data=raw,
        filename=filename,
        doc_type="food_menu_overall",
        linked_type="food_subscription",
        linked_id="overall_menu",
        uploaded_by=user.get("user_id") or "admin",
        content_type=ctype,
    )
    overall_url = doc.get("storage_path") or ""

    s = await get_settings()
    food = dict(s.get("food_subscription") or {})
    food["overall_menu_url"] = overall_url
    food["overall_menu_filename"] = filename[:200]
    food["overall_menu_uploaded_at"] = iso()
    food["overall_menu_kind"] = parsed.get("kind") or "document"
    await db.application_settings.update_one({}, {"$set": {"food_subscription": food}}, upsert=True)

    created = updated = skipped = filled = 0
    errors = []
    rows = parsed.get("rows") or []
    apply_all = parsed.get("kind") == "matrix_excel"

    for row in rows:
        if row.get("error"):
            errors.append({"row": row.get("excel_row"), "error": row["error"]})
            skipped += 1
            continue
        if not apply_all and not row.get("filled"):
            continue
        filled += 1
        key = row["matrix_key"]
        existing = await db.food_menu_items.find_one({"matrix_key": key, "is_deleted": {"$ne": True}})
        if apply_all or not existing:
            amount_paise = int(row["amount_paise"])
        else:
            amount_paise = int(existing.get("amount_paise") or row["amount_paise"])
        description = (row.get("description") or "").strip()
        if not description and existing:
            description = existing.get("description") or ""
        patch = {
            "matrix_key": key,
            "day_code": row["day_code"],
            "day_label": row["day_label"],
            "menu_date": row["menu_date"],
            "category": row["meal"],
            "diet": row["diet"],
            "name": row["name"],
            "description": description,
            "amount_paise": amount_paise,
            "amount_label": f"₹{amount_paise // 100}",
            "active": bool(row.get("active", True)),
            "updated_at": iso(),
            "is_deleted": False,
            "source": "overall_menu_upload",
        }
        if apply_all and row.get("image_url"):
            patch["image_url"] = row["image_url"]

        if existing:
            await db.food_menu_items.update_one({"id": existing["id"]}, {"$set": patch})
            updated += 1
        else:
            day = next((d for d in MATRIX_DAYS if d["code"] == row["day_code"]), {})
            meal = row["meal"]
            diet = row["diet"]
            await db.food_menu_items.insert_one({
                "id": new_id("fitem"),
                **patch,
                "image_url": patch.get("image_url") or "",
                "sort_order": int(day.get("order") or 0) * 100
                    + (1 if meal == "breakfast" else 2 if meal == "lunch" else 3) * 10
                    + (1 if diet == "veg" else 2),
                "created_at": iso(),
                "created_by": user.get("user_id") or "",
            })
            created += 1

    note = parsed.get("note") or "Overall menu uploaded"
    message = note
    if created or updated:
        message = f"{note}. Matrix: {created} created, {updated} updated"
    elif parsed.get("kind") == "document":
        message = f"{note} Residents can open it on the Food page."

    await audit(
        "food.menu_matrix.upload_overall",
        actor=user,
        entity_type="food_menu_matrix",
        entity_id="overall",
        after={
            "filename": filename,
            "url": overall_url,
            "kind": parsed.get("kind"),
            "created": created,
            "updated": updated,
            "filled": filled,
        },
        request=request,
    )
    return {
        "ok": True,
        "message": message,
        "kind": parsed.get("kind"),
        "overall_menu_url": overall_url,
        "overall_menu_filename": filename,
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "filled": filled,
        "errors": errors[:20],
        "note": note,
    }


@router.put("/admin/food-subscriptions/page")
async def admin_set_food_page(
    body: dict = Body(...),
    request: Request = None,
    user: dict = Depends(require("households:write", "ops:manage", "receipts:manage")),
):
    """One-click open / coming-soon for the public Food page."""
    s = await get_settings()
    food = dict(s.get("food_subscription") or {})
    if not food:
        raise HTTPException(status_code=503, detail="Food subscription is not configured yet.")
    if "page_enabled" not in body:
        raise HTTPException(status_code=400, detail="page_enabled is required.")
    food["page_enabled"] = bool(body.get("page_enabled"))
    if "coming_soon_message" in body:
        food["coming_soon_message"] = str(body.get("coming_soon_message") or "")[:300]
    await db.application_settings.update_one({}, {"$set": {"food_subscription": food}}, upsert=True)
    await audit(
        "food.page.update",
        actor=user,
        entity_type="food_subscription",
        entity_id="page",
        after={"page_enabled": food.get("page_enabled")},
        request=request,
    )
    return {
        "ok": True,
        "page_enabled": _food_page_enabled(food),
        "coming_soon_message": (food.get("coming_soon_message") or "").strip(),
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

    if "page_enabled" in body:
        food["page_enabled"] = bool(body.get("page_enabled"))
    if "coming_soon_message" in body:
        food["coming_soon_message"] = str(body.get("coming_soon_message") or "")[:300]
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
        "page_enabled": _food_page_enabled(food),
        "coming_soon_message": (food.get("coming_soon_message") or "").strip(),
        "payment_enabled": bool(food.get("payment_enabled")),
        "payment_note": food.get("payment_note") or "",
        "prices": list(_meal_price_map(food).values()),
    }


@router.get("/admin/food-subscriptions")
async def admin_list_food(user: dict = Depends(require("households:read", "ops:read", "receipts:read"))):
    items = await db.food_subscriptions.find({}, NO_ID).sort("created_at", -1).to_list(2000)
    s = await get_settings()
    food = s.get("food_subscription") or {}
    return {
        "items": items,
        "page_enabled": _food_page_enabled(food),
        "payment_enabled": bool(food.get("payment_enabled")),
    }


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

