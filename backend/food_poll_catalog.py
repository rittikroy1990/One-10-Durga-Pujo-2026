"""Durgotsav 2026 food-menu poll catalog.

Baseline dishes come from the uploaded Pure Veg / Non-Veg banquet PDF
(https://one10events.in/uploads/pdfs/PureVeg-and-Non-Veg-Food-Menu-1-20260909-134131.pdf).
Additional community favourites are included so residents can vote beyond the draft list.
"""

from __future__ import annotations

PDF_URL = "/uploads/pdfs/PureVeg-and-Non-Veg-Food-Menu-1-20260909-134131.pdf"

POLL_META = {
    "title": "Food Menu Poll — Durgotsav 2026",
    "subtitle": "Vote day-wise & meal-wise. Top picks shape the ultimate One 10 menu.",
    "pdf_url": PDF_URL,
    "pdf_note": "Draft reference: Pure Veg (T6) & festive banquet (T7) committee menus.",
    "timings": {
        "breakfast": "9:00 AM – 11:00 AM",
        "lunch": "1:00 PM – 3:00 PM",
        "dinner": "8:30 PM – 11:00 PM",
    },
    "max_dishes_per_meal": 8,
    "ashtami_lunch_note": "Ashtami lunch is complimentary with family subscription (up to 4). Extra guests ~₹200/head (TBC).",
}

DAYS = [
    {"code": "sasthi", "label": "Maha Sasthi", "date": "2026-10-16", "weekday": "Friday", "order": 1},
    {"code": "saptami", "label": "Maha Saptami", "date": "2026-10-17", "weekday": "Saturday", "order": 2},
    {"code": "ashtami", "label": "Maha Ashtami", "date": "2026-10-19", "weekday": "Monday", "order": 3,
     "note": "Sandhi / Ashtami focus — Khichuri-bhog style lunch traditionally complimentary."},
    {"code": "nabami", "label": "Maha Nabami", "date": "2026-10-20", "weekday": "Tuesday", "order": 4},
    {"code": "dashami", "label": "Vijaya Dashami", "date": "2026-10-21", "weekday": "Wednesday", "order": 5},
]

MEALS = [
    {"code": "breakfast", "label": "Breakfast", "order": 1, "icon": "sunrise"},
    {"code": "lunch", "label": "Lunch", "order": 2, "icon": "sun"},
    {"code": "dinner", "label": "Dinner", "order": 3, "icon": "moon"},
]

DIETS = [
    {"code": "pure_veg", "label": "Pure vegetarian", "blurb": "No egg / onion-garlic preferences respected where possible"},
    {"code": "eggetarian", "label": "Eggetarian", "blurb": "Veg + egg dishes"},
    {"code": "non_veg", "label": "Non-vegetarian", "blurb": "Fish, chicken, mutton options welcome"},
]

CATEGORIES = [
    {"code": "breakfast_bengali", "label": "Bengali breakfast"},
    {"code": "breakfast_south", "label": "South Indian breakfast"},
    {"code": "breakfast_light", "label": "Light / continental breakfast"},
    {"code": "rice", "label": "Rice & pulao"},
    {"code": "bread", "label": "Roti / breads / luchi"},
    {"code": "dal", "label": "Dal & legumes"},
    {"code": "sabji", "label": "Vegetable sabji"},
    {"code": "paneer", "label": "Paneer & kofta"},
    {"code": "bengali_veg", "label": "Bengali vegetarian classics"},
    {"code": "fish", "label": "Fish"},
    {"code": "chicken", "label": "Chicken"},
    {"code": "mutton", "label": "Mutton"},
    {"code": "egg", "label": "Egg"},
    {"code": "chinese_veg", "label": "Indo-Chinese (veg)"},
    {"code": "chinese_nv", "label": "Indo-Chinese (non-veg)"},
    {"code": "starter", "label": "Starters & fries"},
    {"code": "salad_side", "label": "Salad, papad, pickle, chutney"},
    {"code": "sweet", "label": "Sweets & dessert"},
    {"code": "beverage", "label": "Tea / coffee / drinks"},
    {"code": "evening", "label": "Evening snacks & chaat"},
    {"code": "kids", "label": "Kids favourites"},
]


def _d(id_, name, category, diet="veg", from_pdf=False, streams=None, tags=None):
    return {
        "id": id_,
        "name": name,
        "category": category,
        "diet": diet,  # veg | egg | nonveg
        "from_pdf": from_pdf,
        "streams": streams or ["pure_veg", "non_veg"],
        "tags": tags or [],
    }


# Exhaustive dish library (PDF items marked from_pdf=True)
DISHES = [
    # —— Breakfast / PDF ——
    _d("radhaballavi", "Radhaballavi", "breakfast_bengali", from_pdf=True, tags=["sasthi", "breakfast"]),
    _d("cholar_dal", "Cholar Dal", "dal", from_pdf=True, tags=["breakfast", "ashtami"]),
    _d("jilapi", "Jilapi / Jalebi", "sweet", from_pdf=True, tags=["breakfast", "nabami"]),
    _d("tea_coffee", "Tea / Coffee", "beverage", from_pdf=True, tags=["breakfast"]),
    _d("veg_chowmein_bf", "Pure Veg Chowmein", "chinese_veg", from_pdf=True, tags=["saptami", "breakfast"]),
    _d("veg_manchurian_bf", "Pure Veg Manchurian", "chinese_veg", from_pdf=True, tags=["saptami", "breakfast"]),
    _d("club_sandwich_veg", "Pure Veg Club Sandwich", "breakfast_light", from_pdf=True, tags=["nabami", "breakfast"]),
    _d("french_fries", "French Fries", "starter", from_pdf=True, tags=["nabami", "kids"]),
    _d("laccha_paratha", "Laccha Paratha", "bread", from_pdf=True, tags=["dashami", "breakfast"]),
    _d("kashmiri_aloo_dum", "Kashmiri Aloo Dum", "sabji", from_pdf=True, tags=["dashami", "breakfast"]),
    _d("poha", "Poha", "breakfast_light", from_pdf=True, tags=["sasthi", "lunch"]),
    _d("idli_vada", "Idli–Vada combo", "breakfast_south", from_pdf=True),
    _d("sambar", "Sambar", "breakfast_south", from_pdf=True),
    _d("coconut_chutney", "Coconut / White Chutney", "salad_side", from_pdf=True),
    _d("upma", "Upma", "breakfast_south", from_pdf=True, tags=["saptami"]),
    _d("dahi_vada", "Dahi Vada", "starter", from_pdf=True, tags=["saptami"]),
    _d("dhokla", "Dhokla", "breakfast_light", from_pdf=True, tags=["nabami"]),
    _d("club_kachori", "Club Kachori", "breakfast_bengali", from_pdf=True, tags=["nabami"]),
    _d("aloo_sabji_bf", "Aloo Sabji (breakfast)", "sabji", from_pdf=True, tags=["nabami"]),
    # Extra breakfast
    _d("luchi_alurdom", "Luchi + Aloor Dum", "breakfast_bengali"),
    _d("kochuri_alurdom", "Kochuri + Aloor Dum", "breakfast_bengali"),
    _d("paratha_sabji", "Paratha + Seasonal Sabji", "breakfast_bengali"),
    _d("dosa_masala", "Masala Dosa", "breakfast_south"),
    _d("uttapam", "Uttapam", "breakfast_south"),
    _d("puri_bhaji", "Puri Bhaji", "breakfast_light"),
    _d("chole_bhature", "Chole Bhature", "breakfast_light"),
    _d("bread_butter_jam", "Bread Butter / Jam", "breakfast_light", tags=["kids"]),
    _d("cornflakes_milk", "Cornflakes & Milk", "breakfast_light", tags=["kids"]),
    _d("omeslette", "Egg Omelette", "egg", diet="egg", streams=["non_veg"]),
    _d("boiled_egg", "Boiled Egg", "egg", diet="egg", streams=["non_veg"]),
    _d("suji_halwa", "Suji Halwa", "sweet"),
    _d("fruit_bowl", "Fresh Fruit Bowl", "breakfast_light"),
    _d("sprouts_salad", "Sprouts Salad", "salad_side"),

    # —— Rice ——
    _d("jeera_rice", "Jeera Rice", "rice", from_pdf=True),
    _d("steam_rice", "Steam Rice / Plain Rice", "rice", from_pdf=True),
    _d("veg_pulao", "Veg Pulao", "rice", from_pdf=True),
    _d("white_pulao", "White Pulao", "rice", from_pdf=True),
    _d("basanti_polau", "Basanti Polau", "rice", from_pdf=True),
    _d("lemon_rice", "Lemon Rice", "rice", from_pdf=True),
    _d("fried_rice_veg", "Veg Fried Rice", "chinese_veg", from_pdf=True),
    _d("fried_rice_ghee", "Ghee / Kaju-Kismis Fried Rice", "rice", from_pdf=True),
    _d("peas_polau", "Peas Polau", "rice", from_pdf=True),
    _d("khichuri", "Bhog Khichuri", "bengali_veg", from_pdf=True, tags=["ashtami"]),
    _d("veg_biryani", "Veg Biryani", "rice", from_pdf=True),
    _d("chicken_biryani", "Chicken Biryani", "chicken", diet="nonveg", from_pdf=True, streams=["non_veg"]),
    _d("mutton_biryani", "Mutton Biryani", "mutton", diet="nonveg", streams=["non_veg"]),
    _d("egg_fried_rice", "Egg Fried Rice", "egg", diet="egg", streams=["non_veg"]),
    _d("coconut_rice", "Coconut Rice", "rice"),
    _d("tamarind_rice", "Tamarind Rice / Puliyodarai", "rice"),
    _d("curd_rice", "Curd Rice", "rice"),
    _d("mishti_pulao", "Mishti Pulao", "rice"),

    # —— Breads ——
    _d("tawa_roti", "Tawa Roti", "bread", from_pdf=True),
    _d("missi_roti", "Missi Roti", "bread", from_pdf=True),
    _d("luchi", "Luchi", "bread", from_pdf=True, tags=["ashtami"]),
    _d("baby_naan", "Baby Naan", "bread", from_pdf=True),
    _d("butter_naan", "Butter Naan", "bread"),
    _d("garlic_naan", "Garlic Naan", "bread"),
    _d("roomali_roti", "Roomali Roti", "bread"),
    _d("phulka", "Phulka", "bread"),
    _d("kulcha", "Kulcha", "bread"),
    _d("thepla", "Thepla", "bread"),

    # —— Dal ——
    _d("yellow_dal_fry", "Yellow Dal Fry", "dal", from_pdf=True),
    _d("dal_makhani", "Dal Makhani", "dal", from_pdf=True),
    _d("moong_dal", "Moong Dal (plain)", "dal", from_pdf=True),
    _d("moong_dal_fish_head", "Moong Dal with Fish Head", "fish", diet="nonveg", from_pdf=True, streams=["non_veg"]),
    _d("masoor_dal", "Masoor Dal", "dal", from_pdf=True),
    _d("rajma", "Rajma", "dal", from_pdf=True),
    _d("chana_masala", "Chana Masala", "dal"),
    _d("sambar_meal", "Sambar (meal)", "dal"),
    _d("dal_tadka", "Dal Tadka", "dal"),
    _d("bengali_musur_dal", "Bengali Musur Dal", "dal"),

    # —— Veg sabji / Bengali ——
    _d("alu_posto", "Alu Posto", "bengali_veg", from_pdf=True),
    _d("labra", "Labra", "bengali_veg", from_pdf=True, tags=["ashtami"]),
    _d("beguni", "Beguni", "bengali_veg", from_pdf=True, tags=["ashtami"]),
    _d("alur_dum", "Aloor Dum", "sabji", from_pdf=True),
    _d("fulkopi_roast", "Fulkopi Roast", "bengali_veg", from_pdf=True),
    _d("chanar_kofta", "Chanar Kofta", "paneer", from_pdf=True),
    _d("mochar_chop", "Mochar Chop", "bengali_veg", from_pdf=True),
    _d("mixed_veg_paneer", "Mixed Veg with Paneer", "paneer", from_pdf=True),
    _d("dhoka_dalna", "Dhoka Dalna", "bengali_veg", from_pdf=True),
    _d("tawa_tamasha", "Tawa Tamasha (mixed veg)", "sabji", from_pdf=True),
    _d("jhuri_aloo_bhaja", "Jhuri Aloo Bhaja", "bengali_veg", from_pdf=True),
    _d("aloo_bhaja", "Aloo Bhaja", "bengali_veg", from_pdf=True),
    _d("potol_dorma_veg", "Plain Potol Dorma", "bengali_veg", from_pdf=True),
    _d("fulkopi_aloo_rosha", "Fulkopi Aloo Rosha", "bengali_veg", from_pdf=True),
    _d("veg_chop", "Veg Chop", "starter", from_pdf=True),
    _d("veg_kofta", "Veg Kofta", "sabji", from_pdf=True),
    _d("koot_curry", "Koot Curry", "sabji", from_pdf=True),
    _d("bikaneri_patty", "Bikaneri Patty", "starter", from_pdf=True),
    _d("cutlet_veg", "Veg Cutlet", "starter", from_pdf=True),
    _d("honey_chilli_potato", "Honey Chilli Potato", "chinese_veg", from_pdf=True),
    _d("chilli_paneer", "Chilli Paneer (gravy / dry)", "chinese_veg", from_pdf=True),
    _d("crispy_babycorn", "Crispy Chilli Babycorn", "chinese_veg", from_pdf=True),
    _d("hakka_noodles_veg", "Veg Hakka Noodles", "chinese_veg", from_pdf=True),
    _d("veg_manchurian_gravy", "Veg Manchurian Gravy", "chinese_veg", from_pdf=True),
    _d("paneer_makhani", "Paneer Makhani / Butter Masala", "paneer", from_pdf=True),
    _d("kadai_paneer", "Kadai Paneer", "paneer", from_pdf=True),
    _d("sahi_paneer", "Shahi Paneer", "paneer", from_pdf=True),
    _d("paneer_pasinda", "Paneer Pasinda", "paneer", from_pdf=True),
    _d("gobi_masala", "Gobi Masala", "sabji", from_pdf=True),
    _d("baingan_bharta", "Baingan Bharta", "sabji"),
    _d("bhindi_fry", "Bhindi Fry", "sabji"),
    _d("palak_paneer", "Palak Paneer", "paneer"),
    _d("malai_kofta", "Malai Kofta", "paneer"),
    _d("navratan_korma", "Navratan Korma", "sabji"),
    _d("veg_jalfrezi", "Veg Jalfrezi", "sabji"),
    _d("mushroom_masala", "Mushroom Masala", "sabji"),
    _d("chhanar_dalna", "Chhanar Dalna", "bengali_veg"),
    _d("doi_begun", "Doi Begun", "bengali_veg"),
    _d("shukto", "Shukto", "bengali_veg"),
    _d("phoron_dal", "Bengali Fôron Dal", "dal"),
    _d("ghugni", "Ghugni", "bengali_veg"),
    _d("cholar_dal_bhaja", "Cholar Dal with Coconut", "dal"),

    # —— Non-veg PDF + extras ——
    _d("katla_kalia", "Katla Kalia (2 pc)", "fish", diet="nonveg", from_pdf=True, streams=["non_veg"]),
    _d("doi_katla", "Doi Katla", "fish", diet="nonveg", from_pdf=True, streams=["non_veg"]),
    _d("fish_finger", "Fish Finger", "fish", diet="nonveg", from_pdf=True, streams=["non_veg"]),
    _d("fish_fry", "Fish Fry", "fish", diet="nonveg", from_pdf=True, streams=["non_veg"]),
    _d("chingri_potol_dorma", "Chingri Potol Dorma", "fish", diet="nonveg", from_pdf=True, streams=["non_veg"]),
    _d("chicken_kosha", "Chicken Kosha", "chicken", diet="nonveg", from_pdf=True, streams=["non_veg"]),
    _d("chicken_malai_kofta", "Chicken Malai Kofta Curry", "chicken", diet="nonveg", from_pdf=True, streams=["non_veg"]),
    _d("chicken_korma", "Chicken Korma", "chicken", diet="nonveg", from_pdf=True, streams=["non_veg"]),
    _d("chicken_chaap", "Chicken Chaap", "chicken", diet="nonveg", from_pdf=True, streams=["non_veg"]),
    _d("mutton_kosha", "Mutton Kosha", "mutton", diet="nonveg", from_pdf=True, streams=["non_veg"]),
    _d("egg_devil", "Egg Devil", "egg", diet="egg", from_pdf=True, streams=["non_veg"]),
    _d("ilish_bhapa", "Ilish Bhapa", "fish", diet="nonveg", streams=["non_veg"]),
    _d("ilish_fry", "Ilish Fry", "fish", diet="nonveg", streams=["non_veg"]),
    _d("chingri_malai", "Chingri Malai Curry", "fish", diet="nonveg", streams=["non_veg"]),
    _d("bhetki_fry", "Bhetki Fry", "fish", diet="nonveg", streams=["non_veg"]),
    _d("bhetki_paturi", "Bhetki Paturi", "fish", diet="nonveg", streams=["non_veg"]),
    _d("rui_kalia", "Rui Kalia", "fish", diet="nonveg", streams=["non_veg"]),
    _d("fish_curry_mustard", "Fish in Mustard (Sorse)", "fish", diet="nonveg", streams=["non_veg"]),
    _d("chicken_butter", "Butter Chicken", "chicken", diet="nonveg", streams=["non_veg"]),
    _d("chicken_tikka_masala", "Chicken Tikka Masala", "chicken", diet="nonveg", streams=["non_veg"]),
    _d("chicken_rezala", "Chicken Rezala", "chicken", diet="nonveg", streams=["non_veg"]),
    _d("chili_chicken", "Chilli Chicken", "chinese_nv", diet="nonveg", streams=["non_veg"]),
    _d("dragon_chicken", "Dragon Chicken", "chinese_nv", diet="nonveg", streams=["non_veg"]),
    _d("mutton_rogan_josh", "Mutton Rogan Josh", "mutton", diet="nonveg", streams=["non_veg"]),
    _d("mutton_curry", "Mutton Curry", "mutton", diet="nonveg", streams=["non_veg"]),
    _d("keema_matir", "Keema Matar", "mutton", diet="nonveg", streams=["non_veg"]),
    _d("egg_curry", "Egg Curry", "egg", diet="egg", streams=["non_veg"]),
    _d("egg_roast", "Egg Roast", "egg", diet="egg", streams=["non_veg"]),
    _d("fish_chips", "Fish & Chips style fry", "fish", diet="nonveg", streams=["non_veg"], tags=["kids"]),

    # —— Sides ——
    _d("salad", "Green Salad", "salad_side", from_pdf=True),
    _d("kimchi_salad", "Kimchi Salad", "salad_side", from_pdf=True),
    _d("raita", "Raita", "salad_side", from_pdf=True),
    _d("papad", "Papad", "salad_side", from_pdf=True),
    _d("pickle", "Pickle", "salad_side", from_pdf=True),
    _d("tomato_chutney", "Tomato Chutney", "salad_side", from_pdf=True),
    _d("aamsattwa_chutney", "Aamsattwa / Khejur Chutney", "salad_side", from_pdf=True),
    _d("anaras_chutney", "Anaras Chutney", "salad_side", from_pdf=True),
    _d("kasundi", "Kasundi", "salad_side", from_pdf=True),
    _d("chutney_generic", "Chutney", "salad_side", from_pdf=True),
    _d("pan_masala", "Pan Masala (post-meal)", "beverage", from_pdf=True),
    _d("thumbs_up", "Thums Up / Soft drink", "beverage", from_pdf=True),
    _d("raita_boondi", "Boondi Raita", "salad_side"),
    _d("cucumber_raita", "Cucumber Raita", "salad_side"),
    _d("kachumber", "Kachumber Salad", "salad_side"),

    # —— Sweets ——
    _d("rosogolla", "Rosogolla", "sweet", from_pdf=True),
    _d("sweet_generic", "Sweet (chef's choice)", "sweet", from_pdf=True),
    _d("chomchom", "Chomchom", "sweet", from_pdf=True),
    _d("kalakand", "Kalakand", "sweet", from_pdf=True),
    _d("pantua", "Pantua", "sweet", from_pdf=True),
    _d("ice_cream", "Ice Cream (Choc / Vanilla)", "sweet", from_pdf=True),
    _d("chanar_barfi", "Chanar Barfi / Barfi Dalna sweet", "sweet", from_pdf=True),
    _d("mishti_doi", "Mishti Doi", "sweet"),
    _d("sandesh", "Sandesh", "sweet"),
    _d("payesh", "Payesh / Rice Kheer", "sweet"),
    _d("gulab_jamun", "Gulab Jamun", "sweet"),
    _d("rasmalai", "Rasmalai", "sweet"),
    _d("baked_rosogolla", "Baked Rosogolla", "sweet"),
    _d("langcha", "Langcha", "sweet"),
    _d("fruit_custard", "Fruit Custard", "sweet", tags=["kids"]),
    _d("brownie", "Chocolate Brownie", "sweet", tags=["kids"]),

    # —— Evening snacks ——
    _d("phuchka", "Phuchka / Pani Puri", "evening"),
    _d("aloo_kabli", "Aloo Kabli", "evening"),
    _d("chowmein_evening", "Evening Chowmein", "evening"),
    _d("roll_veg", "Veg Kathi Roll", "evening"),
    _d("roll_egg", "Egg Roll", "evening", diet="egg", streams=["non_veg"]),
    _d("roll_chicken", "Chicken Roll", "evening", diet="nonveg", streams=["non_veg"]),
    _d("pakora_mix", "Mixed Pakora", "evening"),
    _d("samosa", "Samosa", "evening"),
    _d("chop_fish", "Fish Chop", "evening", diet="nonveg", streams=["non_veg"]),
    _d("mughlai_paratha", "Mughlai Paratha", "evening", diet="egg", streams=["non_veg"]),
    _d("momos_veg", "Veg Momos", "evening"),
    _d("momos_chicken", "Chicken Momos", "evening", diet="nonveg", streams=["non_veg"]),
    _d("tea_biscuits", "Tea & Biscuits", "evening"),
    _d("coffee_cookies", "Coffee & Cookies", "evening"),
    _d("jhalmuri", "Jhalmuri", "evening"),
    _d("chaat_papdi", "Papdi Chaat", "evening"),
    _d("dahi_puri", "Dahi Puri", "evening"),

    # —— Kids ——
    _d("pasta_veg", "Veg Pasta / Macaroni", "kids", tags=["kids"]),
    _d("maggi", "Maggi / Noodles cup style", "kids", tags=["kids"]),
    _d("pizza_slice", "Pizza Slice (veg)", "kids", tags=["kids"]),
    _d("nuggets_veg", "Veg Nuggets", "kids", tags=["kids"]),
    _d("nuggets_chicken", "Chicken Nuggets", "kids", diet="nonveg", streams=["non_veg"], tags=["kids"]),
]

# Suggested baseline picks from the PDF per day × meal × stream
# These appear as “draft menu” chips; voters can keep/change them.
def _s(*ids):
    return list(ids)


PDF_SUGGESTIONS = {
    # Pure veg stream (T6-style)
    ("sasthi", "breakfast", "pure_veg"): _s("radhaballavi", "cholar_dal", "jilapi", "tea_coffee"),
    ("sasthi", "lunch", "pure_veg"): _s("poha", "idli_vada", "sambar", "coconut_chutney", "sweet_generic"),
    ("sasthi", "dinner", "pure_veg"): _s("jeera_rice", "rajma", "alu_posto", "tawa_roti", "sweet_generic", "papad", "pickle", "salad"),
    ("saptami", "breakfast", "pure_veg"): _s("veg_chowmein_bf", "veg_manchurian_bf", "tea_coffee"),
    ("saptami", "lunch", "pure_veg"): _s("upma", "sambar", "coconut_chutney", "dahi_vada", "sweet_generic"),
    ("saptami", "dinner", "pure_veg"): _s("paneer_makhani", "yellow_dal_fry", "steam_rice", "tawa_roti", "cutlet_veg", "salad", "papad", "pickle", "sweet_generic", "chutney_generic"),
    ("ashtami", "lunch", "pure_veg"): _s("khichuri", "luchi", "cholar_dal", "labra", "beguni", "chutney_generic", "papad", "rosogolla"),
    ("ashtami", "dinner", "pure_veg"): _s("honey_chilli_potato", "fried_rice_veg", "chilli_paneer", "kimchi_salad", "sweet_generic"),
    ("nabami", "breakfast", "pure_veg"): _s("club_sandwich_veg", "french_fries", "tea_coffee"),
    ("nabami", "lunch", "pure_veg"): _s("club_kachori", "aloo_sabji_bf", "jilapi", "dhokla", "lemon_rice", "koot_curry", "sweet_generic"),
    ("nabami", "dinner", "pure_veg"): _s("veg_pulao", "raita", "kadai_paneer", "salad", "papad", "pickle", "bikaneri_patty", "chutney_generic", "sweet_generic"),
    ("dashami", "breakfast", "pure_veg"): _s("laccha_paratha", "kashmiri_aloo_dum", "tea_coffee"),
    ("dashami", "lunch", "pure_veg"): _s("crispy_babycorn", "hakka_noodles_veg", "veg_manchurian_gravy", "salad", "sweet_generic"),
    ("dashami", "dinner", "pure_veg"): _s("missi_roti", "dal_makhani", "tawa_tamasha", "steam_rice", "salad", "papad", "pickle", "sweet_generic"),

    # Non-veg / mixed stream (T7-style) — includes veg alternates noted in PDF
    ("sasthi", "breakfast", "non_veg"): _s("radhaballavi", "cholar_dal", "jilapi", "tea_coffee"),
    ("sasthi", "lunch", "non_veg"): _s("white_pulao", "mochar_chop", "salad", "fulkopi_roast", "chanar_kofta", "chutney_generic", "papad", "sweet_generic"),
    ("sasthi", "dinner", "non_veg"): _s("steam_rice", "baby_naan", "mixed_veg_paneer", "dal_makhani", "katla_kalia", "dhoka_dalna", "aamsattwa_chutney", "papad", "rosogolla"),
    ("saptami", "breakfast", "non_veg"): _s("veg_chowmein_bf", "veg_manchurian_bf", "tea_coffee"),
    ("saptami", "lunch", "non_veg"): _s("steam_rice", "moong_dal_fish_head", "moong_dal", "jhuri_aloo_bhaja", "chingri_potol_dorma", "potol_dorma_veg", "chicken_kosha", "fulkopi_aloo_rosha", "tomato_chutney", "papad", "chomchom"),
    ("saptami", "dinner", "non_veg"): _s("radhaballavi", "cholar_dal", "fish_finger", "cutlet_veg", "alur_dum", "steam_rice", "doi_katla", "sahi_paneer", "chutney_generic", "papad", "kalakand"),
    ("ashtami", "lunch", "non_veg"): _s("khichuri", "luchi", "cholar_dal", "alur_dum", "labra", "beguni", "chutney_generic", "papad", "rosogolla"),
    ("ashtami", "dinner", "non_veg"): _s("jeera_rice", "veg_chop", "salad", "paneer_makhani", "veg_kofta", "chutney_generic", "papad", "sweet_generic"),
    ("nabami", "breakfast", "non_veg"): _s("club_sandwich_veg", "french_fries", "tea_coffee"),
    ("nabami", "lunch", "non_veg"): _s("steam_rice", "basanti_polau", "masoor_dal", "moong_dal", "aloo_bhaja", "fish_fry", "cutlet_veg", "kasundi", "salad", "mutton_kosha", "chicken_kosha", "chanar_barfi", "anaras_chutney", "papad", "ice_cream"),
    ("nabami", "dinner", "non_veg"): _s("fried_rice_ghee", "chicken_malai_kofta", "chilli_paneer", "aamsattwa_chutney", "papad", "pan_masala", "pantua"),
    ("dashami", "breakfast", "non_veg"): _s("laccha_paratha", "kashmiri_aloo_dum", "tea_coffee"),
    ("dashami", "lunch", "non_veg"): _s("chicken_biryani", "veg_biryani", "chicken_chaap", "malai_kofta", "raita", "salad", "thumbs_up"),
    ("dashami", "dinner", "non_veg"): _s("peas_polau", "egg_devil", "paneer_pasinda", "salad", "chicken_korma", "gobi_masala", "sweet_generic"),
}


def build_catalog() -> dict:
    dish_by_id = {d["id"]: d for d in DISHES}
    days_out = []
    for day in DAYS:
        meals_out = []
        for meal in MEALS:
            streams = {}
            for diet in ("pure_veg", "non_veg"):
                suggested = [dish_by_id[i] for i in PDF_SUGGESTIONS.get((day["code"], meal["code"], diet), []) if i in dish_by_id]
                streams[diet] = {
                    "suggested": suggested,
                    "suggested_ids": [d["id"] for d in suggested],
                }
            meals_out.append({**meal, "timing": POLL_META["timings"].get(meal["code"]), "streams": streams})
        days_out.append({**day, "meals": meals_out})

    return {
        "meta": POLL_META,
        "days": days_out,
        "meals": MEALS,
        "diets": DIETS,
        "dishes": DISHES,
    }
