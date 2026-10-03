"""Official One 10 Durgotsav 2026 Pujo food menu (updated poster, 2 Oct 2026).

6 days × breakfast / pure-veg breakfast packet / lunch / dinner × veg / non_veg.
Plate photos live under /images/food-menu/day/{day}-{meal}-{veg|nonveg}.png
"""
from __future__ import annotations

from typing import Any

BREAKFAST_PRICE = 70
PACKET_PRICE = 70
ASHTAMI_BHOG_EXTRA = 170

BREAKFAST_COUPON_NOTE = (
    "3 complimentary breakfast coupons per household subscription (no take-aways). "
    f"Extra breakfasts ₹{BREAKFAST_PRICE} each."
)
BREAKFAST_BADGE = "3 free coupons / subscription"

MENU_META = {
    "title": "Durga Puja Menu 2026",
    "tagline": "Food · Festivity · Togetherness",
    "timings": {
        "breakfast": "9:00 AM – 11:00 AM",
        "lunch": "1:00 PM – 3:00 PM",
        "dinner": "8:30 PM – 11:00 PM",
    },
    "kids_note": "Food is complimentary for kids below 7 years.",
    "notes": [
        f"Breakfast ₹{BREAKFAST_PRICE} — 3 complimentary coupons per household subscription (no take-aways).",
        f"Pure veg breakfast packet ₹{PACKET_PRICE} available every day.",
        f"Ashtami lunch (khichuri bhog) is complimentary for 4 per subscription; extra ₹{ASHTAMI_BHOG_EXTRA} per head (no take-aways).",
    ],
    "poster_note": "Prices and plates from the One 10 Events Organising Committee menu poster (updated Oct 2026).",
}


def _breakfast(day_code: str, diet: str, name: str, description: str, *, active: bool = True,
               price_note: str = "") -> dict[str, Any]:
    return {
        "day_code": day_code, "meal": "breakfast", "diet": diet,
        "name": name, "description": description,
        "amount_rupees": BREAKFAST_PRICE,
        "is_complimentary": True,
        "complimentary_note": BREAKFAST_COUPON_NOTE,
        "badge": BREAKFAST_BADGE,
        "active": active,
        "price_note": price_note,
    }


def _packet(day_code: str, name: str, description: str) -> dict[str, Any]:
    return {
        "day_code": day_code, "meal": "breakfast_packet", "diet": "veg",
        "name": name, "description": description,
        "amount_rupees": PACKET_PRICE,
        "badge": "Pure veg",
    }


_SAME_AS_VEG = "Same breakfast plate as veg — hidden on public menu to avoid duplicate"

# amount_rupees is the chargeable plate price (extra plate / head for complimentary meals).
CELLS: list[dict[str, Any]] = [
    # —— Sasthi · 16 Oct (Friday) ——
    _breakfast("sasthi", "veg", "Sasthi Breakfast", "Luchi, sada aloo tarkari, bode, tea / coffee"),
    _breakfast("sasthi", "non_veg", "Sasthi Non-veg Breakfast", "Luchi, sada aloo tarkari, bode, tea / coffee",
               active=False, price_note=_SAME_AS_VEG),
    _packet("sasthi", "Sasthi Breakfast Packet", "Club kachori (5 pcs), jalebi"),
    {
        "day_code": "sasthi", "meal": "lunch", "diet": "veg",
        "name": "Sasthi Veg Lunch",
        "description": "Rice / luchi, moong dal, lomba begun bhaja, dhokar dalna, aloo fulkopi, chatni, papad, mishti",
        "amount_rupees": 220,
    },
    {
        "day_code": "sasthi", "meal": "lunch", "diet": "non_veg",
        "name": "Sasthi Non-veg Lunch",
        "description": "Rice / luchi, moong dal, lomba begun bhaja, doi katla, aloo fulkopi, chatni, papad, mishti",
        "amount_rupees": 270,
    },
    {
        "day_code": "sasthi", "meal": "dinner", "diet": "veg",
        "name": "Sasthi Veg Dinner",
        "description": "Radha ballavi, aloo dum, white kaju & kismis polao, paneer butter masala, chatni, papad, mishti",
        "amount_rupees": 270,
    },
    {
        "day_code": "sasthi", "meal": "dinner", "diet": "non_veg",
        "name": "Sasthi Non-veg Dinner",
        "description": "Radha ballavi, aloo dum, white kaju & kismis polao, chicken butter masala, chatni, papad, mishti",
        "amount_rupees": 320,
    },
    # —— Saptami · 17 Oct (Saturday) ——
    _breakfast("saptami", "veg", "Saptami Veg Breakfast", "Veg sandwich, french fries, muffin, tea / coffee"),
    _breakfast("saptami", "non_veg", "Saptami Non-veg Breakfast", "Chicken sandwich, french fries, muffin, tea / coffee"),
    _packet("saptami", "Saptami Breakfast Packet", "Idli (2 pcs), gulab jamun"),
    {
        "day_code": "saptami", "meal": "lunch", "diet": "veg",
        "name": "Saptami Veg Lunch",
        "description": "Rice, veg moong dal, jhuri aloo bhaja, potoler dolma, chanar kofta, chatni, papad",
        "amount_rupees": 220,
    },
    {
        "day_code": "saptami", "meal": "lunch", "diet": "non_veg",
        "name": "Saptami Non-veg Lunch",
        "description": "Rice, veg moong dal, jhuri aloo bhaja, potoler dolma, pabda with sorshe, kachalanka dhonepata chicken, chatni, papad",
        "amount_rupees": 320,
    },
    {
        "day_code": "saptami", "meal": "dinner", "diet": "veg",
        "name": "Saptami Veg Dinner",
        "description": "Veg Afghani kabuli rice, paneer kolhapuri, raita, gulab jamun",
        "amount_rupees": 220,
    },
    {
        "day_code": "saptami", "meal": "dinner", "diet": "non_veg",
        "name": "Saptami Non-veg Dinner",
        "description": "Mutton Afghani kabuli rice, chicken kolhapuri, raita, gulab jamun",
        "amount_rupees": 470,
    },
    # —— 18 Oct (Sunday) — poster labels Saptami; portal day = Sap–Asht ——
    _breakfast("saptami_ashtami", "veg", "18 Oct Veg Breakfast", "Veg pasta, potato wedges, chocolate cake, tea / coffee"),
    _breakfast("saptami_ashtami", "non_veg", "18 Oct Non-veg Breakfast", "Non-veg pasta, potato wedges, chocolate cake, tea / coffee"),
    _packet("saptami_ashtami", "18 Oct Breakfast Packet", "Hing kachori (3 pcs), imarti"),
    {
        "day_code": "saptami_ashtami", "meal": "lunch", "diet": "veg",
        "name": "18 Oct Veg Lunch",
        "description": "Rice, masoor dal, crispy aloo fry, mixed veg, echorer kofta, chatni & papad, mishti doi",
        "amount_rupees": 220,
    },
    {
        "day_code": "saptami_ashtami", "meal": "lunch", "diet": "non_veg",
        "name": "18 Oct Non-veg Lunch",
        "description": "Rice, masoor dal, crispy aloo fry, macher matha diye labra, aloo diye chicken-er jhol, katla begum bahar, chatni & papad, mishti doi",
        "amount_rupees": 320,
    },
    {
        "day_code": "saptami_ashtami", "meal": "dinner", "diet": "veg",
        "name": "18 Oct Veg Dinner",
        "description": "Paneer satay, veg fried rice, veg noodles, veg manchurian, ice cream",
        "amount_rupees": 240,
    },
    {
        "day_code": "saptami_ashtami", "meal": "dinner", "diet": "non_veg",
        "name": "18 Oct Non-veg Dinner",
        "description": "Chicken satay, veg fried rice, veg noodles, chilli chicken, ice cream",
        "amount_rupees": 320,
    },
    # —— Ashtami · 19 Oct (Monday) ——
    _breakfast("ashtami", "veg", "Ashtami Breakfast", "Luchi, cholar dal, kalakand, tea / coffee"),
    _breakfast("ashtami", "non_veg", "Ashtami Non-veg Breakfast", "Luchi, cholar dal, kalakand, tea / coffee",
               active=False, price_note=_SAME_AS_VEG),
    _packet("ashtami", "Ashtami Breakfast Packet", "Dahi vada (2 pcs), gulab jamun"),
    {
        "day_code": "ashtami", "meal": "lunch", "diet": "veg",
        "name": "Ashtami Lunch (Khichuri bhog)",
        "description": "Khichuri, luchi, cholar dal, labra, beguni, aloo dum, chatni, papad, payesh",
        "amount_rupees": ASHTAMI_BHOG_EXTRA,
        "is_complimentary": True,
        "complimentary_note": (
            "Complimentary for 4 per household subscription (no take-aways). "
            f"Extra ₹{ASHTAMI_BHOG_EXTRA} per head."
        ),
        "badge": f"Complimentary (4) · Extra ₹{ASHTAMI_BHOG_EXTRA}",
    },
    {
        "day_code": "ashtami", "meal": "lunch", "diet": "non_veg",
        "name": "Ashtami Non-veg Lunch (Khichuri bhog)",
        "description": "Khichuri, luchi, cholar dal, labra, beguni, aloo dum, chatni, papad, payesh",
        "amount_rupees": ASHTAMI_BHOG_EXTRA,
        "active": False,
        "is_complimentary": True,
        "complimentary_note": (
            f"Same Ashtami bhog as veg — use the veg lunch card (complimentary for 4 / extra ₹{ASHTAMI_BHOG_EXTRA})."
        ),
        "badge": f"Complimentary (4) · Extra ₹{ASHTAMI_BHOG_EXTRA}",
        "price_note": "Duplicate of veg Ashtami bhog — hidden on public menu",
    },
    {
        "day_code": "ashtami", "meal": "dinner", "diet": "veg",
        "name": "Ashtami Veg Dinner",
        "description": "Basanti polao, radha ballavi, stuffed aloo dum, paneer masala, chatni, papad, malai toast",
        "amount_rupees": 270,
    },
    {
        "day_code": "ashtami", "meal": "dinner", "diet": "non_veg",
        "name": "Ashtami Non-veg Dinner",
        "description": "Basanti polao, radha ballavi, stuffed aloo dum, chicken kasha, chatni, papad, malai toast",
        "amount_rupees": 270,
    },
    # —— Nabami · 20 Oct (Tuesday) ——
    _breakfast("nabami", "veg", "Nabami Breakfast", "Aloo paratha, doi / raita, achar, tea / coffee"),
    _breakfast("nabami", "non_veg", "Nabami Non-veg Breakfast", "Aloo paratha, doi / raita, achar, tea / coffee",
               active=False, price_note=_SAME_AS_VEG),
    _packet("nabami", "Nabami Breakfast Packet", "Samosa, khasta kachori, dhokla"),
    {
        "day_code": "nabami", "meal": "lunch", "diet": "veg",
        "name": "Nabami Veg Lunch",
        "description": "Rice, sukto, veg cutlet, paneer tikka butter masala, pineapple chatni, papad, ice cream",
        "amount_rupees": 270,
    },
    {
        "day_code": "nabami", "meal": "lunch", "diet": "non_veg",
        "name": "Nabami Non-veg Lunch",
        "description": "Rice, sukto, fish fry, mutton / chicken kasha, pineapple chatni, papad, ice cream",
        "amount_rupees": 520,
    },
    {
        "day_code": "nabami", "meal": "dinner", "diet": "veg",
        "name": "Nabami Veg Dinner",
        "description": "Roomali roti / ruti, dal makhani, jeera rice, kadhai paneer, pineapple chatni, papad, kheer kadam",
        "amount_rupees": 270,
    },
    {
        "day_code": "nabami", "meal": "dinner", "diet": "non_veg",
        "name": "Nabami Non-veg Dinner",
        "description": "Roomali roti / ruti, dal makhani, jeera rice, chicken butter masala, pineapple chatni, papad, kheer kadam",
        "amount_rupees": 320,
    },
    # —— Dashami · 21 Oct (Wednesday) ——
    _breakfast("dashami", "veg", "Dashami Breakfast", "Korai shutir kochuri, aloo dum, rosogolla, tea / coffee"),
    _breakfast("dashami", "non_veg", "Dashami Non-veg Breakfast", "Korai shutir kochuri, aloo dum, rosogolla, tea / coffee",
               active=False, price_note=_SAME_AS_VEG),
    _packet("dashami", "Dashami Breakfast Packet", "Vada (2 pcs), jalebi"),
    {
        "day_code": "dashami", "meal": "lunch", "diet": "veg",
        "name": "Dashami Veg Lunch",
        "description": "Veg biryani, paneer chaap, raita, green salad, masala cold drinks",
        "amount_rupees": 270,
    },
    {
        "day_code": "dashami", "meal": "lunch", "diet": "non_veg",
        "name": "Dashami Non-veg Lunch",
        "description": "Mutton biryani, chicken chaap, raita, green salad, masala cold drinks",
        "amount_rupees": 500,
    },
    {
        "day_code": "dashami", "meal": "dinner", "diet": "veg",
        "name": "Dashami Veg Dinner",
        "description": "Paneer pasinda, green salad, gobi masala, peas polao, sweet",
        "amount_rupees": 220,
    },
    {
        "day_code": "dashami", "meal": "dinner", "diet": "non_veg",
        "name": "Dashami Non-veg Dinner",
        "description": "Egg devil, green salad, chicken korma, peas polao, sweet",
        "amount_rupees": 270,
    },
]

# Sort order inside a day: breakfast, packet, lunch, dinner; veg before non-veg.
_MEAL_SORT = {"breakfast": 10, "breakfast_packet": 20, "lunch": 30, "dinner": 40}
_DIET_SORT = {"veg": 0, "non_veg": 1}


def day_meal_image_path(day_code: str, meal: str, diet: str = "veg") -> str:
    diet_key = "nonveg" if (diet or "").strip().lower() in {"non_veg", "nonveg"} else "veg"
    return f"/images/food-menu/day/{day_code}-{meal}-{diet_key}.png"


def cell_image_url(day_code: str, meal: str, diet: str = "veg") -> str:
    return day_meal_image_path(day_code, meal, diet)


def official_cells_for_seed() -> list[dict[str, Any]]:
    """Flatten CELLS into upsert-ready documents."""
    from food_menu_matrix import matrix_key
    from food_poll_catalog import DAYS

    day_by = {d["code"]: d for d in DAYS}
    out = []
    for raw in CELLS:
        day = day_by.get(raw["day_code"]) or {}
        rupees = int(raw["amount_rupees"])
        meal = raw["meal"]
        diet = raw["diet"]
        out.append({
            "matrix_key": matrix_key(raw["day_code"], meal, diet),
            "day_code": raw["day_code"],
            "day_label": day.get("short_label") or day.get("label") or raw["day_code"],
            "menu_date": day.get("date") or "",
            "category": meal,
            "diet": diet,
            "name": raw["name"],
            "description": raw["description"],
            "amount_paise": rupees * 100,
            "amount_label": f"₹{rupees}",
            "image_url": cell_image_url(raw["day_code"], meal, diet),
            "active": bool(raw.get("active", True)),
            "is_complimentary": bool(raw.get("is_complimentary")),
            "complimentary_note": (raw.get("complimentary_note") or "")[:400],
            "price_note": (raw.get("price_note") or "")[:300],
            "badge": (raw.get("badge") or "")[:120],
            "sort_order": int(day.get("order") or 0) * 100 + _MEAL_SORT.get(meal, 90) + _DIET_SORT.get(diet, 5),
        })
    return out
