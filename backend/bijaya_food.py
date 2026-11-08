"""Bijaya Sammilani (বিজয়া সম্মিলনী) food subscription — fixed per-plate package + QR pay."""

EVENT_CODE = "bijaya_sammilani"
EVENT_TITLE = "Bijaya Sammilani Food"
EVENT_TITLE_BN = "বিজয়া সম্মিলনী খাবার"
PACKAGE_LABEL = "Bijaya Sammilani food plate"
PACKAGE_CODE = "bijaya_package"

# Fixed per-plate price — ₹660.00
PACKAGE_AMOUNT_PAISE = 66000

# Public ordering is open; payment is always UPI QR (no card / gateway checkout).
PAGE_ENABLED = True
PAYMENT_ENABLED = True

MENU_READY = True
MENU_PLACEHOLDER_TITLE = "Menu coming soon"
MENU_PLACEHOLDER_NOTE = (
    "The Bijaya Sammilani food menu will be published here once the committee "
    "finalises it. You can still subscribe and pay via UPI QR now."
)

# Orderable plate categories (same ₹660). Catalog dropdown uses these codes.
PLATE_CATEGORIES: list[dict] = [
    {
        "code": "veg",
        "label": "Veg",
        "label_bn": "ভেজ",
        "diet": "veg",
        "meat": "",
    },
    {
        "code": "non_veg_chicken",
        "label": "Non-veg chicken",
        "label_bn": "নন-ভেজ চিকেন",
        "diet": "non_veg",
        "meat": "chicken",
    },
    {
        "code": "non_veg_mutton",
        "label": "Non-veg mutton",
        "label_bn": "নন-ভেজ মাটন",
        "diet": "non_veg",
        "meat": "mutton",
    },
]
PLATE_CATEGORY_CODES = tuple(c["code"] for c in PLATE_CATEGORIES)
_ALL_PLATES = list(PLATE_CATEGORY_CODES)
_NONVEG_PLATES = ["non_veg_mutton", "non_veg_chicken"]

# Final plate menu — each item has its own 16:9 photo. plate_categories controls catalog tabs.
MENU_SECTIONS: list[dict] = [
    {
        "section": "Bijaya Sammilani Food plate",
        "section_bn": "বিজয়া সম্মিলনী খাবার প্লেট",
        "items": [
            {
                "id": "water",
                "name": "Bottled water",
                "name_bn": "",
                "diet": "veg",
                "diet_label": "Veg",
                "for_all_diets": True,
                "plate_categories": _ALL_PLATES,
                "image_url": "/images/food-menu/bijaya/water.jpg",
            },
            {
                "id": "veg_chop",
                "name": "Veg chop",
                "name_bn": "",
                "diet": "veg",
                "diet_label": "Veg",
                "plate_categories": ["veg"],
                "image_url": "/images/food-menu/bijaya/veg-chop-v2.jpg",
            },
            {
                "id": "fish_chop",
                "name": "Fish chop",
                "name_bn": "",
                "diet": "non_veg",
                "diet_label": "Non-veg",
                "plate_categories": list(_NONVEG_PLATES),
                "image_url": "/images/food-menu/bijaya/fish-chop.jpg",
            },
            {
                "id": "kasundi",
                "name": "Kasundi",
                "name_bn": "কাসুন্দি",
                "diet": "veg",
                "diet_label": "Veg",
                "for_all_diets": True,
                "plate_categories": _ALL_PLATES,
                "image_url": "/images/food-menu/bijaya/kasundi.jpg",
            },
            {
                "id": "salad",
                "name": "Salad",
                "name_bn": "সালাদ",
                "diet": "veg",
                "diet_label": "Veg",
                "for_all_diets": True,
                "plate_categories": _ALL_PLATES,
                "image_url": "/images/food-menu/bijaya/salad.jpg",
            },
            {
                "id": "kachuri",
                "name": "Peas kachuri",
                "name_bn": "মটর কচুরি",
                "diet": "veg",
                "diet_label": "Veg",
                "plate_categories": ["veg"],
                "image_url": "/images/food-menu/bijaya/kachuri.jpg",
            },
            {
                "id": "aloo_dum",
                "name": "Kashmiri aloo dum",
                "name_bn": "কাশ্মীরি আলু দম",
                "diet": "veg",
                "diet_label": "Veg",
                "plate_categories": ["veg"],
                "image_url": "/images/food-menu/bijaya/aloodum.jpg",
            },
            {
                "id": "plain_rice",
                "name": "Plain rice",
                "name_bn": "সাদা ভাত",
                "diet": "veg",
                "diet_label": "Veg",
                "for_all_diets": True,
                "plate_categories": _ALL_PLATES,
                "image_url": "/images/food-menu/bijaya/plain-rice.jpg",
            },
            {
                "id": "paneer_pasinda",
                "name": "Paneer pasinda",
                "name_bn": "",
                "diet": "veg",
                "diet_label": "Veg",
                "plate_categories": ["veg"],
                "image_url": "/images/food-menu/bijaya/paneer-pasinda.jpg",
            },
            {
                "id": "bhetki_paturi",
                "name": "Desi bhetki paturi",
                "name_bn": "",
                "diet": "non_veg",
                "diet_label": "Non-veg",
                "plate_categories": list(_NONVEG_PLATES),
                "image_url": "/images/food-menu/bijaya/bhetki-paturi.jpg",
            },
            {
                "id": "basanti_polao",
                "name": "Basanti polao",
                "name_bn": "বাসন্তী পোলাও",
                "diet": "veg",
                "diet_label": "Veg",
                "for_all_diets": True,
                "plate_categories": _ALL_PLATES,
                "image_url": "/images/food-menu/bijaya/basanti-polao.jpg",
            },
            {
                "id": "navaratna_korma",
                "name": "Navaratna korma",
                "name_bn": "",
                "diet": "veg",
                "diet_label": "Veg",
                "plate_categories": ["veg"],
                "image_url": "/images/food-menu/bijaya/navaratna-korma.jpg",
            },
            {
                "id": "mutton_rogan_josh",
                "name": "Mutton rogan josh",
                "name_bn": "",
                "diet": "non_veg",
                "diet_label": "Non-veg mutton",
                "plate_categories": ["non_veg_mutton"],
                "image_url": "/images/food-menu/bijaya/mutton-chicken.jpg",
            },
            {
                "id": "chicken_kosha",
                "name": "Chicken kosha",
                "name_bn": "",
                "diet": "non_veg",
                "diet_label": "Non-veg chicken",
                "plate_categories": ["non_veg_chicken"],
                "image_url": "/images/food-menu/bijaya/mutton-chicken.jpg",
            },
            {
                "id": "chutney",
                "name": "Fruit chutney",
                "name_bn": "ফলের চাটনি",
                "diet": "veg",
                "diet_label": "Veg",
                "for_all_diets": True,
                "plate_categories": _ALL_PLATES,
                "image_url": "/images/food-menu/bijaya/chutney.jpg",
            },
            {
                "id": "papad",
                "name": "Papad",
                "name_bn": "পাপড়",
                "diet": "veg",
                "diet_label": "Veg",
                "for_all_diets": True,
                "plate_categories": _ALL_PLATES,
                "image_url": "/images/food-menu/bijaya/papad.jpg",
            },
            {
                "id": "rosogolla",
                "name": "Rosogolla (2 pcs)",
                "name_bn": "রসগোল্লা (২টি)",
                "diet": "veg",
                "diet_label": "Veg",
                "for_all_diets": True,
                "plate_categories": _ALL_PLATES,
                "image_url": "/images/food-menu/bijaya/rosogolla.jpg",
            },
        ],
    },
]

PAYMENT_NOTE = "Pay ₹660 per plate via the committee UPI QR, then upload your payment screenshot."
