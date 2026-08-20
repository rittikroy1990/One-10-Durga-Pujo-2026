"""Configuration: default application settings, feature flags, roles/permissions, chart of accounts.

All amounts are integer paise. Anything marked NOT_APPROVED must be confirmed by EOC before production.
"""
from db import db, clean
from util import now_utc, iso

NOT_APPROVED = "NOT APPROVED FOR PRODUCTION"

CYCLE_2026 = "cycle_2026"

DEFAULT_SETTINGS = {
    "id": "app_settings",
    "organisation": {
        "community": "One10",
        "organiser": "Events Organising Committee (EOC), One10",
        "legal_identity": f"[REQUIRE EOC CONFIRMATION] — {NOT_APPROVED}",
        "address": f"[REQUIRE EOC CONFIRMATION] — {NOT_APPROVED}",
        "contact_email": "eoc@one10.example",
        "contact_phone": "[REQUIRE EOC CONFIRMATION]",
        "authorised_signatory": "Treasurer, EOC One10",
        "logo_url": "",
        "hero_url": "",
    },
    "campaign": {
        "title": "One10 Durgotsav 2026",
        "theme_line": "Amader Pujo \u2022 Amader One10",
        "inclusive_line": "This will be a Pujo for everyone.",
        "consecutive_year": 3,
        "venue": "Badminton court near the tennis court, in front of Tower 11",
        "important_notice": "A receipt is issued only after payment is verified. Please do not share screenshots as proof of payment.",
        "short_url": "one10durgotsav.example/subscribe",
    },
    "cycle": {
        "id": CYCLE_2026,
        "name": "Durgotsav 2026",
        "currency": "INR",
        "timezone": "Asia/Kolkata",
        "is_active": True,
        "is_locked": False,
    },
    "subscription": {
        "base_amount_paise": 350000,
        "components": [
            {"code": "SUB_KDL", "label": "Khuti Puja + Durga Puja + Lakshmi Puja", "amount_paise": 250000, "account_code": "4001"},
            {"code": "SUB_KALI", "label": "Kali Puja", "amount_paise": 30000, "account_code": "4002"},
            {"code": "SUB_BIJOYA", "label": "Bijoya Sammilani", "amount_paise": 70000, "account_code": "4003"},
        ],
        "donation_min_paise": 0,
        "allow_donation": True,
    },
    "receipt": {
        "prefix": "ONE10-DP26",
        "credit_note_prefix": "ONE10-CN26",
        "computer_generated_note": "This is a computer-generated receipt and does not require a physical signature.",
        "refund_policy_ref": "See /refund-policy",
        "document_version": "v1.0",
        "tax_deductible": False,
    },
    "feature_flags": {
        "phase1_collection": True,
        "phase2_expenditure": True,
        "phase3_operations": True,
        "phase4_closure": True,
        "waivers_enabled": False,
        "otp_enabled": False,
        "email_enabled": False,
    },
    "approval_thresholds_paise": {
        "note": NOT_APPROVED,
        "purchase_auto": 500000,
        "purchase_convenor": 5000000,
        "single_source_max": 2500000,
        "payment_reauth": 5000000,
        "recon_auto_match_confidence": 0.9,
    },
    "eligibility": {
        "eligible_occupied_households": 400,
        "note": NOT_APPROVED,
    },
    "policy_checklist": [
        "Society legal identity, address and PAN/registration",
        "Committee contacts and authorised signatory designation",
        "Bank account and Razorpay live credentials + production webhook",
        "Approval thresholds and reconciliation confidence threshold",
        "Refund policy and retention/secure-deletion policy",
        "Receipt legal wording and any tax-deductibility claim",
        "Domain and email sender verification",
    ],
    "updated_at": iso(),
}

# ---------------------------------------------------------------- Chart of accounts
CHART_OF_ACCOUNTS = [
    {"code": "1001", "name": "Bank", "type": "asset"},
    {"code": "1002", "name": "Cash on hand", "type": "asset"},
    {"code": "1003", "name": "Gateway clearing", "type": "asset"},
    {"code": "1200", "name": "Vendor advances", "type": "asset"},
    {"code": "1201", "name": "Volunteer/member advances", "type": "asset"},
    {"code": "2001", "name": "Accounts payable", "type": "liability"},
    {"code": "4001", "name": "Subscription income \u2014 Khuti/Durga/Lakshmi", "type": "income"},
    {"code": "4002", "name": "Subscription income \u2014 Kali Puja", "type": "income"},
    {"code": "4003", "name": "Subscription income \u2014 Bijoya Sammilani", "type": "income"},
    {"code": "4100", "name": "Voluntary donations", "type": "income"},
    {"code": "4200", "name": "Sponsorship income", "type": "income"},
    {"code": "4900", "name": "Refunds/contra income", "type": "income"},
    {"code": "5010", "name": "Idol/ritual", "type": "expense"},
    {"code": "5020", "name": "Pandal/decor", "type": "expense"},
    {"code": "5030", "name": "Lighting/electrical", "type": "expense"},
    {"code": "5040", "name": "Sound/cultural", "type": "expense"},
    {"code": "5050", "name": "Bhog/food", "type": "expense"},
    {"code": "5060", "name": "Security/safety", "type": "expense"},
    {"code": "5070", "name": "Permissions", "type": "expense"},
    {"code": "5080", "name": "Cleaning/waste", "type": "expense"},
    {"code": "5090", "name": "Printing/publicity", "type": "expense"},
    {"code": "5100", "name": "Gifts/prizes", "type": "expense"},
    {"code": "5110", "name": "Venue/logistics", "type": "expense"},
    {"code": "5200", "name": "Gateway fees", "type": "expense"},
    {"code": "5900", "name": "Miscellaneous", "type": "expense"},
]

# ---------------------------------------------------------------- Events / cost centres
EVENTS = [
    {"id": "ev_khuti", "name": "Khuti Puja", "cost_centre": "KHUTI"},
    {"id": "ev_durga", "name": "Durga Puja", "cost_centre": "DURGA"},
    {"id": "ev_lakshmi", "name": "Lakshmi Puja", "cost_centre": "LAKSHMI"},
    {"id": "ev_kali", "name": "Kali Puja", "cost_centre": "KALI"},
    {"id": "ev_bijoya", "name": "Bijoya Sammilani", "cost_centre": "BIJOYA"},
    {"id": "ev_common", "name": "Common / shared", "cost_centre": "COMMON"},
]

# ---------------------------------------------------------------- Towers & flats (demo master data)
TOWERS = [{"id": f"tower_{i}", "name": f"Tower {i}"} for i in range(1, 13)]


async def ensure_settings():
    existing = await db.application_settings.find_one({"id": "app_settings"})
    if not existing:
        await db.application_settings.insert_one(dict(DEFAULT_SETTINGS))
    # chart of accounts
    if await db.chart_of_accounts.count_documents({}) == 0:
        for a in CHART_OF_ACCOUNTS:
            await db.chart_of_accounts.insert_one({**a, "active": True, "id": a["code"]})
    # cycle
    if await db.annual_cycles.count_documents({}) == 0:
        await db.annual_cycles.insert_one({
            "id": CYCLE_2026, "name": "Durgotsav 2026", "currency": "INR",
            "timezone": "Asia/Kolkata", "is_active": True, "is_locked": False,
            "created_at": iso(),
        })
    # events
    for e in EVENTS:
        await db.events.update_one({"id": e["id"]}, {"$setOnInsert": {**e, "cycle_id": CYCLE_2026, "dates": "TBC"}}, upsert=True)
    # towers & flats (demo: 20 flats per tower)
    if await db.towers.count_documents({}) == 0:
        for t in TOWERS:
            await db.towers.insert_one({**t, "cycle_id": CYCLE_2026})
            for f in range(1, 21):
                fid = f"{t['id']}_flat_{f}"
                await db.flats.insert_one({
                    "id": fid, "tower_id": t["id"], "number": f"{f:02d}0{f % 4 + 1}",
                    "cycle_id": CYCLE_2026,
                })
    # bank account
    if await db.bank_accounts.count_documents({}) == 0:
        await db.bank_accounts.insert_one({
            "id": "bank_main", "name": "EOC One10 Main Account",
            "account_no_masked": "XXXXXX0000", "opening_balance_paise": 0,
            "note": NOT_APPROVED, "created_at": iso(),
        })


async def get_settings() -> dict:
    doc = await db.application_settings.find_one({"id": "app_settings"})
    return clean(doc) if doc else dict(DEFAULT_SETTINGS)
