"""Bijaya Sammilani (বিজয়া সংমিলনী) food subscription — fixed per-plate package + QR pay."""

EVENT_CODE = "bijaya_sammilani"
EVENT_TITLE = "Bijaya Sammilani"
EVENT_TITLE_BN = "বিজয়া সংমিলনী"
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

# Final plate menu — each item has its own 16:9 photo (Durga food card style). No header plate image.
MENU_SECTIONS: list[dict] = [
    {
        "section": "Bijaya Sammilani plate",
        "section_bn": "বিজয়া সংমিলনী প্লেট",
        "items": [
            {
                "id": "water",
                "name": "Bottled water",
                "name_bn": "",
                "diet": "veg",
                "diet_label": "Veg",
                "for_all_diets": True,
                "image_url": "/images/food-menu/bijaya/water.jpg",
            },
            {
                "id": "chop",
                "name": "Fish chop / Veg chop",
                "name_bn": "",
                "diet": "both",
                "diet_label": "Veg / Non-veg",
                "image_url": "/images/food-menu/bijaya/chop.jpg",
            },
            {
                "id": "kasundi",
                "name": "Kasundi",
                "name_bn": "কাসুন্দি",
                "diet": "veg",
                "diet_label": "Veg",
                "for_all_diets": True,
                "image_url": "/images/food-menu/bijaya/kasundi.jpg",
            },
            {
                "id": "salad",
                "name": "Salad",
                "name_bn": "সালাদ",
                "diet": "veg",
                "diet_label": "Veg",
                "for_all_diets": True,
                "image_url": "/images/food-menu/bijaya/salad.jpg",
            },
            {
                "id": "kachuri",
                "name": "Peas kachuri",
                "name_bn": "মটর কচুরি",
                "diet": "veg",
                "diet_label": "Veg",
                "image_url": "/images/food-menu/bijaya/kachuri.jpg",
            },
            {
                "id": "aloo_dum",
                "name": "Kashmiri aloo dum",
                "name_bn": "কাশ্মীরি আলু দম",
                "diet": "veg",
                "diet_label": "Veg",
                "image_url": "/images/food-menu/bijaya/aloodum.jpg",
            },
            {
                "id": "plain_rice",
                "name": "Plain rice",
                "name_bn": "সাদা ভাত",
                "diet": "veg",
                "diet_label": "Veg",
                "for_all_diets": True,
                "image_url": "/images/food-menu/bijaya/plain-rice.jpg",
            },
            {
                "id": "bhetki_paneer",
                "name": "Desi bhetki paturi / Paneer pasinda",
                "name_bn": "",
                "diet": "both",
                "diet_label": "Veg / Non-veg",
                "image_url": "/images/food-menu/bijaya/bhetki-paneer.jpg",
            },
            {
                "id": "basanti_polao",
                "name": "Basanti polao",
                "name_bn": "বসন্তী পোলাও",
                "diet": "veg",
                "diet_label": "Veg",
                "for_all_diets": True,
                "image_url": "/images/food-menu/bijaya/basanti-polao.jpg",
            },
            {
                "id": "curries",
                "name": "Mutton rogan josh / Chicken kosha / Navaratna korma",
                "name_bn": "",
                "diet": "both",
                "diet_label": "Veg / Non-veg",
                "image_url": "/images/food-menu/bijaya/curries.jpg",
            },
            {
                "id": "chutney",
                "name": "Fruit chutney",
                "name_bn": "ফলের চাটনি",
                "diet": "veg",
                "diet_label": "Veg",
                "for_all_diets": True,
                "image_url": "/images/food-menu/bijaya/chutney.jpg",
            },
            {
                "id": "papad",
                "name": "Papad",
                "name_bn": "পাপড়",
                "diet": "veg",
                "diet_label": "Veg",
                "for_all_diets": True,
                "image_url": "/images/food-menu/bijaya/papad.jpg",
            },
            {
                "id": "rosogolla",
                "name": "Rosogolla (2 pcs)",
                "name_bn": "রসগোল্লা (২টি)",
                "diet": "veg",
                "diet_label": "Veg",
                "for_all_diets": True,
                "image_url": "/images/food-menu/bijaya/rosogolla.jpg",
            },
        ],
    },
]

PAYMENT_NOTE = "Pay ₹660 per plate via the committee UPI QR, then upload your payment screenshot."
