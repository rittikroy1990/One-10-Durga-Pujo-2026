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

# Final plate menu (veg / non-veg choices where listed with "/").
MENU_SECTIONS: list[dict] = [
    {
        "section": "Bijaya Sammilani plate",
        "section_bn": "বিজয়া সংমিলনী প্লেট",
        "items": [
            {"name": "Bottled water", "name_bn": ""},
            {"name": "Fish chop / Veg chop", "name_bn": ""},
            {"name": "Kasundi", "name_bn": "কাসুন্দি"},
            {"name": "Salad", "name_bn": "সালাদ"},
            {"name": "Peas kachuri", "name_bn": "মটর কচুরি"},
            {"name": "Kashmiri aloo dum", "name_bn": "কাশ্মীরি আলু দম"},
            {"name": "Plain rice", "name_bn": "সাদা ভাত"},
            {"name": "Desi bhetki paturi / Paneer pasinda", "name_bn": ""},
            {"name": "Basanti polao", "name_bn": "বসন্তী পোলাও"},
            {"name": "Mutton rogan josh / Chicken kosha / Navaratna korma", "name_bn": ""},
            {"name": "Fruit chutney", "name_bn": "ফলের চাটনি"},
            {"name": "Papad", "name_bn": "পাপড়"},
            {"name": "Rosogolla (2 pcs)", "name_bn": "রসগোল্লা (২টি)"},
        ],
    },
]

PAYMENT_NOTE = "Pay ₹660 per plate via the committee UPI QR, then upload your payment screenshot."
