"""Official One 10 Durgotsav 2026 Pujo food menu (poster 14 Sep 2026).

36 cells: 6 days × breakfast/lunch/dinner × veg/non_veg.
Shared day×meal plate photos live under /images/food-menu/day/{day}-{meal}.png
"""
from __future__ import annotations

from typing import Any

# Timings + global notes from the committee poster.
MENU_META = {
    "title": "Durga Puja Menu 2026",
    "tagline": "Food · Festivity · Togetherness",
    "timings": {
        "breakfast": "9:00 AM – 11:00 AM",
        "lunch": "1:00 PM – 3:00 PM",
        "dinner": "8:30 PM – 11:00 PM",
    },
    "kids_note": "Food is complimentary for kids below 7 years.",
    "poster_note": "Prices and plates from the One 10 Events Organising Committee menu poster.",
}

# day_code -> meal -> { veg: {...}, non_veg: {...}, shared fields }
# amount_rupees is the chargeable plate price (extra-head for complimentary meals).
CELLS: list[dict[str, Any]] = [
    # —— Sasthi 16 Oct ——
    {
        "day_code": "sasthi", "meal": "breakfast", "diet": "veg",
        "name": "Sasthi Breakfast",
        "description": "Luchi, sada aloo tarkari, bode, tea / coffee",
        "amount_rupees": 60,
    },
    {
        "day_code": "sasthi", "meal": "breakfast", "diet": "non_veg",
        "name": "Sasthi Non-veg Breakfast",
        "description": "Luchi, sada aloo tarkari, bode, tea / coffee",
        "amount_rupees": 60,
        "active": False,
        "price_note": "Same breakfast plate as veg — hidden on public menu to avoid duplicate",
    },
    {
        "day_code": "sasthi", "meal": "lunch", "diet": "veg",
        "name": "Sasthi Veg Lunch",
        "description": "Rice / luchi, moong dal, lomba begun bhaja, dhokar dalna, aloo fulkopi, chatni, papad, mishti",
        "amount_rupees": 200,
    },
    {
        "day_code": "sasthi", "meal": "lunch", "diet": "non_veg",
        "name": "Sasthi Non-veg Lunch",
        "description": "Rice / luchi, moong dal, lomba begun bhaja, doi katla, aloo fulkopi, chatni, papad, mishti",
        "amount_rupees": 250,
    },
    {
        "day_code": "sasthi", "meal": "dinner", "diet": "veg",
        "name": "Sasthi Veg Dinner",
        "description": "Radha ballavi, aloo dum, white kaju & kismis polao, paneer butter masala, chatni, papad, mishti",
        "amount_rupees": 250,
    },
    {
        "day_code": "sasthi", "meal": "dinner", "diet": "non_veg",
        "name": "Sasthi Non-veg Dinner",
        "description": "Radha ballavi, aloo dum, white kaju & kismis polao, chicken butter masala, chatni, papad, mishti",
        "amount_rupees": 300,
    },
    # —— Saptami 17 Oct ——
    {
        "day_code": "saptami", "meal": "breakfast", "diet": "veg",
        "name": "Saptami Veg Breakfast",
        "description": "Veg sandwich, french fries, muffin, tea / coffee",
        "amount_rupees": 70,
    },
    {
        "day_code": "saptami", "meal": "breakfast", "diet": "non_veg",
        "name": "Saptami Non-veg Breakfast",
        "description": "Chicken sandwich, french fries, muffin, tea / coffee",
        "amount_rupees": 70,
    },
    {
        "day_code": "saptami", "meal": "lunch", "diet": "veg",
        "name": "Saptami Veg Lunch",
        "description": "Rice, veg moong dal, jhuri aloo bhaja, potoler dolma, chanar kofta, chatni, papad",
        "amount_rupees": 200,
    },
    {
        "day_code": "saptami", "meal": "lunch", "diet": "non_veg",
        "name": "Saptami Non-veg Lunch",
        "description": "Rice, veg moong dal, jhuri aloo bhaja, potoler dolma, pabda with sorshe, kachalanka dhonepata chicken, chatni, papad",
        "amount_rupees": 300,
    },
    {
        "day_code": "saptami", "meal": "dinner", "diet": "veg",
        "name": "Saptami Veg Dinner",
        "description": "Paneer satay, veg fried rice, veg noodles, veg manchurian, ice cream",
        "amount_rupees": 220,
    },
    {
        "day_code": "saptami", "meal": "dinner", "diet": "non_veg",
        "name": "Saptami Non-veg Dinner",
        "description": "Chicken satay, veg fried rice, veg noodles, chilli chicken, ice cream",
        "amount_rupees": 300,
    },
    # —— 18 Oct (flyer labels Saptami; portal day = Sap–Asht) ——
    {
        "day_code": "saptami_ashtami", "meal": "breakfast", "diet": "veg",
        "name": "18 Oct Veg Breakfast",
        "description": "Veg pasta, potato wedges, chocolate cake, tea / coffee",
        "amount_rupees": 70,
    },
    {
        "day_code": "saptami_ashtami", "meal": "breakfast", "diet": "non_veg",
        "name": "18 Oct Non-veg Breakfast",
        "description": "Non-veg pasta, potato wedges, chocolate cake, tea / coffee",
        "amount_rupees": 70,
    },
    {
        "day_code": "saptami_ashtami", "meal": "lunch", "diet": "veg",
        "name": "18 Oct Veg Lunch",
        "description": "Rice, masoor dal, crispy aloo fry, mixed veg, echorer kofta, chatni & papad, mishti doi",
        "amount_rupees": 200,
    },
    {
        "day_code": "saptami_ashtami", "meal": "lunch", "diet": "non_veg",
        "name": "18 Oct Non-veg Lunch",
        "description": "Rice, masoor dal, crispy aloo fry, macher matha diye labra, aloo diye chicken-er jhol, katla begum bahar, chatni & papad, mishti doi",
        "amount_rupees": 300,
    },
    {
        "day_code": "saptami_ashtami", "meal": "dinner", "diet": "veg",
        "name": "18 Oct Veg Dinner",
        "description": "Veg Afghani kabuli rice, paneer kolhapuri, raita, gulab jamun",
        "amount_rupees": 200,
    },
    {
        "day_code": "saptami_ashtami", "meal": "dinner", "diet": "non_veg",
        "name": "18 Oct Non-veg Dinner",
        "description": "Mutton Afghani kabuli rice, chicken kolhapuri, raita, gulab jamun",
        "amount_rupees": 450,
    },
    # —— Ashtami 19 Oct ——
    {
        "day_code": "ashtami", "meal": "breakfast", "diet": "veg",
        "name": "Ashtami Breakfast",
        "description": "Luchi, cholar dal, kalakand, tea / coffee",
        "amount_rupees": 60,
    },
    {
        "day_code": "ashtami", "meal": "breakfast", "diet": "non_veg",
        "name": "Ashtami Non-veg Breakfast",
        "description": "Luchi, cholar dal, kalakand, tea / coffee",
        "amount_rupees": 60,
        "active": False,
        "price_note": "Same breakfast plate as veg — hidden on public menu to avoid duplicate",
    },
    {
        "day_code": "ashtami", "meal": "lunch", "diet": "veg",
        "name": "Ashtami Lunch (Khichuri bhog)",
        "description": "Khichuri, luchi, cholar dal, labra, beguni, aloo dum, chatni, papad, payesh",
        "amount_rupees": 150,
        "is_complimentary": True,
        "complimentary_note": "Complimentary for 4 heads per household subscription. Extra ₹150 per head.",
        "badge": "Complimentary (4) · Extra ₹150",
    },
    {
        "day_code": "ashtami", "meal": "lunch", "diet": "non_veg",
        "name": "Ashtami Non-veg Lunch (Khichuri bhog)",
        "description": "Khichuri, luchi, cholar dal, labra, beguni, aloo dum, chatni, papad, payesh",
        "amount_rupees": 150,
        "active": False,
        "is_complimentary": True,
        "complimentary_note": "Same Ashtami bhog as veg — use the veg lunch card (complimentary for 4 / extra ₹150).",
        "badge": "Complimentary (4) · Extra ₹150",
        "price_note": "Duplicate of veg Ashtami bhog — hidden on public menu",
    },
    {
        "day_code": "ashtami", "meal": "dinner", "diet": "veg",
        "name": "Ashtami Veg Dinner",
        "description": "Basanti polao, radha ballavi, stuffed aloo dum, paneer masala, chatni, papad, malai toast",
        "amount_rupees": 250,
    },
    {
        "day_code": "ashtami", "meal": "dinner", "diet": "non_veg",
        "name": "Ashtami Non-veg Dinner",
        "description": "Basanti polao, radha ballavi, stuffed aloo dum, chicken kasha, chatni, papad, malai toast",
        "amount_rupees": 250,
    },
    # —— Nabami 20 Oct ——
    {
        "day_code": "nabami", "meal": "breakfast", "diet": "veg",
        "name": "Nabami Breakfast",
        "description": "Aloo paratha, doi / raita, achar, tea / coffee",
        "amount_rupees": 60,
    },
    {
        "day_code": "nabami", "meal": "breakfast", "diet": "non_veg",
        "name": "Nabami Non-veg Breakfast",
        "description": "Aloo paratha, doi / raita, achar, tea / coffee",
        "amount_rupees": 60,
        "active": False,
        "price_note": "Same breakfast plate as veg — hidden on public menu to avoid duplicate",
    },
    {
        "day_code": "nabami", "meal": "lunch", "diet": "veg",
        "name": "Nabami Veg Lunch",
        "description": "Rice, sukto, veg cutlet, paneer tikka butter masala, pineapple chatni, papad, ice cream",
        "amount_rupees": 250,
    },
    {
        "day_code": "nabami", "meal": "lunch", "diet": "non_veg",
        "name": "Nabami Non-veg Lunch",
        "description": "Rice, sukto, fish fry, mutton / chicken kasha, pineapple chatni, papad, ice cream",
        "amount_rupees": 500,
    },
    {
        "day_code": "nabami", "meal": "dinner", "diet": "veg",
        "name": "Nabami Veg Dinner",
        "description": "Roomali roti / ruti, dal makhani, jeera rice, kadhai paneer, pineapple chatni, papad, kheer kadam",
        "amount_rupees": 250,
    },
    {
        "day_code": "nabami", "meal": "dinner", "diet": "non_veg",
        "name": "Nabami Non-veg Dinner",
        "description": "Roomali roti / ruti, dal makhani, jeera rice, chicken butter masala, pineapple chatni, papad, kheer kadam",
        "amount_rupees": 300,
    },
    # —— Dashami 21 Oct ——
    {
        "day_code": "dashami", "meal": "breakfast", "diet": "veg",
        "name": "Dashami Breakfast",
        "description": "Korai shutir kochuri, aloo dum, rosogolla, tea / coffee",
        "amount_rupees": 60,
    },
    {
        "day_code": "dashami", "meal": "breakfast", "diet": "non_veg",
        "name": "Dashami Non-veg Breakfast",
        "description": "Korai shutir kochuri, aloo dum, rosogolla, tea / coffee",
        "amount_rupees": 60,
        "active": False,
        "price_note": "Same breakfast plate as veg — hidden on public menu to avoid duplicate",
    },
    {
        "day_code": "dashami", "meal": "lunch", "diet": "veg",
        "name": "Dashami Veg Lunch",
        "description": "Veg biryani, paneer chaap, raita, green salad, masala cold drinks",
        "amount_rupees": 250,
    },
    {
        "day_code": "dashami", "meal": "lunch", "diet": "non_veg",
        "name": "Dashami Non-veg Lunch",
        "description": "Mutton biryani, chicken chaap, raita, green salad, masala cold drinks",
        "amount_rupees": 480,
    },
    {
        "day_code": "dashami", "meal": "dinner", "diet": "veg",
        "name": "Dashami Veg Dinner",
        "description": "Paneer pasinda, green salad, gobi masala, peas polao, sweet",
        "amount_rupees": 200,
    },
    {
        "day_code": "dashami", "meal": "dinner", "diet": "non_veg",
        "name": "Dashami Non-veg Dinner",
        "description": "Egg devil, green salad, chicken korma, peas polao, sweet",
        "amount_rupees": 250,
    },
]


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
            "sort_order": 0,
        })
    return out
