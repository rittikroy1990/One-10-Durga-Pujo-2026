"""Configuration: One 10 Events platform settings, multi-cycle campaigns, chart of accounts.

All amounts are integer paise. Anything marked NOT_APPROVED must be confirmed by EOC before production.
"""
from typing import Optional

from db import db, clean
from util import iso

NOT_APPROVED = "NOT APPROVED FOR PRODUCTION"

CYCLE_2026 = "cycle_2026"  # default / seed cycle id (kept for backward compatibility)

DURGOTSAV_2026_CAMPAIGN = {
    "title": "One10 Durgotsav 2026",
    "theme_line": "Amader Pujo \u2022 Amader One10",
    "inclusive_line": "This will be a Pujo for everyone.",
    "consecutive_year": 3,
    "venue": "Badminton court near the tennis court, in front of Tower 11",
    "important_notice": "A receipt is issued only after payment is verified. Please do not share screenshots as proof of payment.",
    "short_url": "one10events.example/subscribe",
    "hero_url": "/images/campaign/hero-cover.jpg",
}

DURGOTSAV_2026_SUBSCRIPTION = {
    "base_amount_paise": 350000,
    "components": [
        {"code": "SUB_KDL", "label": "Khuti Puja + Durga Puja + Lakshmi Puja", "amount_paise": 250000, "account_code": "4001"},
        {"code": "SUB_KALI", "label": "Kali Puja", "amount_paise": 30000, "account_code": "4002"},
        {"code": "SUB_BIJOYA", "label": "Bijoya Sammilani", "amount_paise": 70000, "account_code": "4003"},
    ],
    "donation_min_paise": 0,
    "allow_donation": True,
}

DURGOTSAV_2026_RECEIPT = {
    "prefix": "ONE10-DP26",
    "credit_note_prefix": "ONE10-CN26",
    "computer_generated_note": (
        "This is a computer-generated receipt of the Events Organizations Committee of One10 "
        "and does not require a physical signature."
    ),
    "refund_policy_ref": "See /refund-policy",
    "document_version": "v1.1",
    "tax_deductible": False,
    "letterhead_title": "Events Organizations Committee of One10",
    "letterhead_subtitle": "ONE10 Events Committee · Unregistered non-profit community association",
}

# From MoA / Rules & Regulations (notarised Baruipur; stamped 07 Sep 2026)
COMMITTEE_OFFICE_BEARERS = [
    {"name": "Abhijit Chakrabarti", "designation": "President", "phone": "+91 9866136985"},
    {"name": "Subhasis Sarkar", "designation": "Vice President"},
    {"name": "Anjan Nandy", "designation": "Vice President"},
    {"name": "Binoy Banerjee", "designation": "Joint Secretary"},
    {"name": "Debabrata Dey", "designation": "Joint Secretary"},
    {"name": "Smriti Sasmal", "designation": "Asst. Secretary"},
    {"name": "Suman Nandy", "designation": "Asst. Secretary"},
    {"name": "APC", "designation": "Joint Treasurer", "phone": "+91 8017600378"},
    {"name": "Subrata Chatterjee", "designation": "Joint Treasurer"},
    {"name": "Alok Biswas", "designation": "Advisor"},
    {"name": "SC Purakayastha", "designation": "Advisor"},
]

ORGANISATION_DEFAULTS = {
    "community": "One10",
    "organiser": "Events Organizations Committee of One10",
    "short_name": "ONE10 Events Committee",
    "legal_identity": "Events Organizations Committee of One10",
    "legal_status": (
        "Unregistered voluntary non-profit community association "
        "(not a registered society, company or trust). PAN allotted."
    ),
    "pan": "AADAE2932K",
    "date_of_formation": "2026-09-03",
    "address": (
        "One10 Residential Complex, Thakdari, Newtown, Action Area 1, "
        "Kolkata – 700102, West Bengal"
    ),
    "area_of_activity": "One10 campus, Newtown, Kolkata and nearby areas",
    "contact_email": "one10eventgroup@gmail.com",
    "contact_phone": "+91 9866136985 / +91 8017600378",
    "primary_contact_name": "Abhijit Chakrabarti",
    "primary_contact_role": "President",
    "primary_contact_phone": "+91 9866136985",
    "secondary_contact_name": "APC",
    "secondary_contact_role": "Joint Treasurer",
    "secondary_contact_phone": "+91 8017600378",
    "authorised_signatory": "Joint Treasurer, Events Organizations Committee of One10",
    "authorised_signatories_note": (
        "Bank operations: any two of President, Secretary and Treasurer. "
        "PAN / bank KYC may be signed by President, Joint Secretaries and Joint Treasurers "
        "as authorised under the MoA."
    ),
    "bank_operating_mandate": "Any two of President, Secretary and Treasurer (joint signatures).",
    "bank_account": {
        "account_name": "ONE 10 EVENT ORGANISING COMMITTEE",
        "account_number": "572205000037",
        "ifsc": "ICIC0005722",
        "bank": "ICICI Bank",
    },
    "governing_body_size": 11,
    "committee_term_years": 1,
    "moa_reference": (
        "Memorandum of Association and Rules & Regulations; "
        "notarised before Md. Rafiuddin Laskar, Baruipur (Regd. No. 011/2022)."
    ),
    "objectives_events": [
        "Durga Puja",
        "Kali Puja",
        "Saraswati Puja",
        "Diwali Milan",
        "Republic Day",
        "Independence Day",
        "Cultural and community programmes",
    ],
    "office_bearers": list(COMMITTEE_OFFICE_BEARERS),
    "logo_url": "",
    "hero_url": "/images/campaign/hero-cover.jpg",
}

SPONSORSHIP_PACKAGES = {
    "campaign": "One10 Durga Puja 2026",
    "tagline": "Partner with culture. Connect with community. Create lasting recall.",
    "social": {
        "facebook": "https://www.facebook.com/people/One10-Unified-Celebrations/61574992808339/",
    },
    "audience": {
        "apartments": "1000+",
        "reach": "3,000–5,000+",
        "notes": [
            "Premium residential community in Action Area 1, Newtown, Kolkata",
            "Multi-day engagement across rituals, stage programmes and community bonding",
            "High-trust environment with affluent, family-oriented audience",
        ],
        "best_suited_for": [
            "Banks", "Healthcare", "Education", "Lifestyle", "Hospitality",
            "Home decor", "FMCG", "Local premium businesses",
        ],
    },
    "premium": [
        {
            "code": "title",
            "name": "Title Sponsor",
            "amount_paise": 30000000,
            "benefits": [
                "Naming rights: event officially named as “[Sponsor] presents [event]”",
                "Prime logo placement on posters, banners, digital media, invites and press",
                "Dedicated social media branding, teasers and live updates",
                "Exclusive on-ground branding at main stage, VIP area, stalls and game counters",
                "Booth showcase plus option for sponsor-led contests/activities",
                "Complimentary VIP passes, felicitation space and dinner for up to 4 representatives",
                "Name in Vote of Thanks; souvenir special-page coverage; photo/video access",
            ],
        },
        {
            "code": "co",
            "name": "Co-Sponsor",
            "amount_paise": 20000000,
            "benefits": [
                "Logo/name in key official communications with prime high-footfall placement",
                "Dedicated digital and media promotions including live updates",
                "Exclusive branding in selected zones (stage, VIP, stalls, game counters)",
                "Booth showcase plus option for sponsor-led contests/activities",
                "Complimentary VIP passes, felicitation space and dinner for up to 4 representatives",
                "Name in Vote of Thanks; souvenir special-page coverage; photo/video access",
            ],
        },
    ],
    "activation": [
        {"code": "cultural_backstage", "name": "Cultural Event Backstage Branding", "amount_paise": 5000000,
         "benefits": [
             "Stage branding with prominent brand/logo and special call-outs",
             "Mention as Exclusive Venue Sponsor – Backstage in social creatives",
             "Website/schedule acknowledgement under Exclusive Venue Sponsor",
             "Announcements + souvenir coloured full-page coverage",
         ]},
        {"code": "food_stall", "name": "Food Truck / Stall Partners", "amount_label": "₹5,000 per day", "amount_paise": 500000,
         "benefits": [
             "4 days (Sashthi to Nabami) within Puja Prangan",
             "Stall area 6 ft × 4 ft",
             "Non-fire cooking preferred; logistics to be confirmed with EOC",
         ]},
        {"code": "jewelry", "name": "Jewelry & Accessories Partner", "amount_paise": 5000000,
         "benefits": [
             "Exclusive branded display booth for a 1-day pre-Puja sales event",
             "Logo visibility across materials",
             "Photo/video access and souvenir coloured full-page coverage",
         ]},
        {"code": "health", "name": "Health Partner", "amount_paise": 10000000,
         "benefits": [
             "1-day pre-Puja space for health screenings / wellness / fitness demos",
             "Complimentary VIP passes and dinner for up to 2 representatives",
             "Photo/video access and souvenir coloured full-page coverage",
         ]},
        {"code": "media", "name": "Media Partner", "amount_paise": 10000000,
         "benefits": [
             "1-day pre-Puja event organising opportunity",
             "Booth showcase and sponsor-led contests/activities",
             "Complimentary VIP passes and dinner for up to 2 representatives",
             "Photo/video access and souvenir coloured full-page coverage",
         ]},
        {"code": "banner_5x4", "name": "5′ × 4′ Banner", "amount_paise": 1000000,
         "benefits": [
             "Prominent 5 ft × 4 ft banner space in Puja Prangan",
             "Social media mention as esteemed sponsor",
             "Website/schedule acknowledgement under Other Esteemed Sponsors",
         ]},
    ],
    "venue": [
        {"code": "main_gate", "name": "Main Gate Branding", "amount_paise": 7500000,
         "benefits": [
             "Branding rights at main entry gate",
             "Arch/structure 20 ft × 20 ft × 2 ft to be provided",
             "Mention as Main Gate Sponsor on social + website/schedule",
             "Announcements + souvenir coloured full-page coverage",
         ]},
        {"code": "gate", "name": "Gate Branding", "amount_paise": 5000000,
         "benefits": [
             "Branding rights at gates other than the main gate",
             "Arch/structure 20 ft × 20 ft × 2 ft to be provided",
             "Mention as Gate Sponsor on social + website/schedule",
             "Announcements + souvenir coloured full-page coverage",
         ]},
        {"code": "driveway", "name": "Driveway Branding", "amount_paise": 2000000,
         "benefits": [
             "Prominent 8 ft × 4 ft banner space across driveway",
             "Social media mention as esteemed sponsor",
             "Website/schedule acknowledgement under Other Esteemed Sponsors",
         ]},
        {"code": "puja_venue", "name": "Puja-Venue Branding", "amount_paise": 5000000,
         "benefits": [
             "Branding rights inside Puja Venue / Mandap (highest visibility)",
             "Mention as Exclusive Venue Sponsor – Puja Mandap on social + website",
             "Announcements + souvenir coloured full-page coverage",
         ]},
        {"code": "standee", "name": "Standee", "amount_paise": 1000000,
         "benefits": [
             "Standees across driveway / prangan",
             "Social media mention as esteemed sponsor",
         ]},
    ],
    "souvenir_ads": [
        {"code": "back_cover", "name": "Back Cover", "amount_paise": 800000},
        {"code": "special_page", "name": "Special Page", "amount_paise": 800000},
        {"code": "front_inside", "name": "Front Inside Cover", "amount_paise": 650000},
        {"code": "back_inside", "name": "Back Inside Cover", "amount_paise": 600000},
        {"code": "colour_full", "name": "Coloured Full Page", "amount_paise": 500000},
        {"code": "bw_half", "name": "B/W Half Page", "amount_paise": 350000},
        {"code": "bw_quarter", "name": "B/W Quarter Page", "amount_paise": 250000},
    ],
    "gallery": [
        "/images/campaign/full-35.jpg",
        "/images/campaign/full-13.jpg",
        "/images/campaign/full-16.jpg",
        "/images/campaign/full-17.jpg",
        "/images/campaign/full-25.jpg",
        "/images/campaign/full-34.jpg",
        "/images/campaign/full-33.jpg",
        "/images/campaign/full-32.jpg",
        "/images/campaign/sindoor-khela.jpg",
        "/images/campaign/highlights.jpg",
        "/images/campaign/experience.jpg",
        "/images/campaign/hero-cover.jpg",
    ],
}

DEFAULT_SETTINGS = {
    "id": "app_settings",
    "platform": {
        "name": "One 10 Events",
        "tagline": "Community celebrations, transparent subscriptions, verified receipts.",
        "short_name": "One10 Events",
    },
    "organisation": dict(ORGANISATION_DEFAULTS),
    "active_cycle_id": CYCLE_2026,
    # Mirrored from the active cycle for backward-compatible consumers:
    "campaign": dict(DURGOTSAV_2026_CAMPAIGN),
    "cycle": {
        "id": CYCLE_2026,
        "name": "Durgotsav 2026",
        "currency": "INR",
        "timezone": "Asia/Kolkata",
        "is_active": True,
        "is_locked": False,
    },
    "subscription": dict(DURGOTSAV_2026_SUBSCRIPTION),
    "receipt": dict(DURGOTSAV_2026_RECEIPT),
    "feature_flags": {
        "phase1_collection": True,
        "phase2_expenditure": True,
        "phase3_operations": True,
        "phase4_closure": True,
        "waivers_enabled": False,
        "otp_enabled": False,
        "email_enabled": False,
        "multi_campaign": True,
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
        "Razorpay merchant in committee name (currently temporary third-party keys may be in use)",
        "Approval thresholds and reconciliation confidence threshold",
        "Refund window and retention/secure-deletion policy confirmation",
        "Domain and email sender verification",
    ],
    "sponsorship": dict(SPONSORSHIP_PACKAGES),
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


def _cycle_seed_doc(cycle_id: str, name: str, slug: str, kind: str, campaign: dict,
                    subscription: dict, receipt: dict, *, is_active=True, is_published=True,
                    summary: str = "") -> dict:
    return {
        "id": cycle_id,
        "name": name,
        "slug": slug,
        "kind": kind,
        "summary": summary,
        "currency": "INR",
        "timezone": "Asia/Kolkata",
        "is_active": is_active,
        "is_locked": False,
        "is_published": is_published,
        "campaign": campaign,
        "subscription": subscription,
        "receipt": receipt,
        "created_at": iso(),
    }


async def ensure_settings():
    existing = await db.application_settings.find_one({"id": "app_settings"})
    if not existing:
        await db.application_settings.insert_one(dict(DEFAULT_SETTINGS))
    else:
        # Migrate older installs toward platform + active_cycle_id + MoA organisation.
        patch = {}
        if "platform" not in existing:
            patch["platform"] = DEFAULT_SETTINGS["platform"]
        if "active_cycle_id" not in existing:
            patch["active_cycle_id"] = existing.get("cycle", {}).get("id") or CYCLE_2026

        org = existing.get("organisation") or {}
        org_patch = {}
        # Always refresh MoA-backed identity fields unless already customised away from placeholders.
        placeholders = (
            "REQUIRE EOC",
            "NOT APPROVED",
            "Events Organising Committee (EOC)",
            "eoc@one10.example",
            "One10eventsgroup@gmail.com",
            "TO BE CONFIRMED",
        )
        def _is_placeholder(val: str) -> bool:
            s = str(val or "")
            return (not s) or any(p in s for p in placeholders)

        for key, value in ORGANISATION_DEFAULTS.items():
            cur = org.get(key)
            if key in ("contact_email", "contact_phone", "logo_url", "hero_url", "bank_account", "pan", "date_of_formation"):
                # Fill placeholders / missing MoA+proposal fields; keep non-placeholder custom contacts.
                if key in ("logo_url", "hero_url"):
                    if not cur:
                        org_patch[key] = value
                elif key == "bank_account":
                    if not cur or not (cur or {}).get("account_number"):
                        org_patch[key] = value
                elif _is_placeholder(cur) or key in ("pan", "date_of_formation"):
                    org_patch[key] = value
            elif key == "office_bearers":
                if not cur:
                    org_patch[key] = value
            else:
                # MoA facts — load / refresh from notarised document
                if cur != value:
                    org_patch[key] = value
        if org_patch:
            for k, v in org_patch.items():
                org[k] = v
            patch["organisation"] = org

        sp = existing.get("sponsorship") or {}
        if (
            not sp
            or not sp.get("premium")
            or not sp.get("souvenir_ads")
            or not (sp.get("social") or {}).get("facebook")
        ):
            # Refresh sponsorship catalog from proposal; never touches organisation contacts/bank
            patch["sponsorship"] = SPONSORSHIP_PACKAGES

        # Receipt letterhead defaults on settings + active cycle
        rc = existing.get("receipt") or {}
        rc_patch = {}
        for key in ("letterhead_title", "letterhead_subtitle", "computer_generated_note", "document_version"):
            if key not in rc or _is_placeholder(rc.get(key)) or key in ("letterhead_title", "letterhead_subtitle"):
                if key in DURGOTSAV_2026_RECEIPT:
                    rc_patch[key] = DURGOTSAV_2026_RECEIPT[key]
        if rc_patch:
            rc.update(rc_patch)
            patch["receipt"] = rc

        if "policy_checklist" in DEFAULT_SETTINGS:
            patch["policy_checklist"] = DEFAULT_SETTINGS["policy_checklist"]

        if patch:
            patch["updated_at"] = iso()
            await db.application_settings.update_one({"id": "app_settings"}, {"$set": patch})
            if "receipt" in patch:
                cycle_id = patch.get("active_cycle_id") or existing.get("active_cycle_id") or CYCLE_2026
                await db.annual_cycles.update_one({"id": cycle_id}, {"$set": {"receipt": rc}})

    # chart of accounts
    if await db.chart_of_accounts.count_documents({}) == 0:
        for a in CHART_OF_ACCOUNTS:
            await db.chart_of_accounts.insert_one({**a, "active": True, "id": a["code"]})

    # Seed / upgrade annual cycles (campaigns)
    settings_doc = await db.application_settings.find_one({"id": "app_settings"}) or {}
    durga = await db.annual_cycles.find_one({"id": CYCLE_2026})
    if not durga:
        await db.annual_cycles.insert_one(_cycle_seed_doc(
            CYCLE_2026, "Durgotsav 2026", "durgotsav-2026", "durgotsav",
            settings_doc.get("campaign") or DURGOTSAV_2026_CAMPAIGN,
            settings_doc.get("subscription") or DURGOTSAV_2026_SUBSCRIPTION,
            settings_doc.get("receipt") or DURGOTSAV_2026_RECEIPT,
            summary="Full-season household subscription for Khuti, Durga, Lakshmi, Kali and Bijoya.",
        ))
    else:
        upgrade = {}
        if "slug" not in durga:
            upgrade["slug"] = "durgotsav-2026"
        if "kind" not in durga:
            upgrade["kind"] = "durgotsav"
        if "campaign" not in durga:
            upgrade["campaign"] = settings_doc.get("campaign") or DURGOTSAV_2026_CAMPAIGN
        if "subscription" not in durga:
            upgrade["subscription"] = settings_doc.get("subscription") or DURGOTSAV_2026_SUBSCRIPTION
        if "receipt" not in durga:
            upgrade["receipt"] = settings_doc.get("receipt") or DURGOTSAV_2026_RECEIPT
        if "is_published" not in durga:
            upgrade["is_published"] = True
        if "summary" not in durga:
            upgrade["summary"] = "Full-season household subscription for Khuti, Durga, Lakshmi, Kali and Bijoya."
        if upgrade:
            await db.annual_cycles.update_one({"id": CYCLE_2026}, {"$set": upgrade})

    # Placeholder future campaign (unpublished) so the platform is visibly multi-event ready
    if await db.annual_cycles.count_documents({"id": "cycle_diwali_milan_2026"}) == 0:
        await db.annual_cycles.insert_one(_cycle_seed_doc(
            "cycle_diwali_milan_2026", "Diwali Milan 2026", "diwali-milan-2026", "diwali_milan",
            {
                "title": "One10 Diwali Milan 2026",
                "theme_line": "Light, community, One10",
                "inclusive_line": "A neighbourhood gathering for every household.",
                "consecutive_year": 1,
                "venue": "TBC — EOC confirmation required",
                "important_notice": "Subscriptions open only after EOC publishes this campaign.",
                "short_url": "one10events.example/campaigns/diwali-milan-2026",
                "hero_url": "https://images.pexels.com/photos/34431714/pexels-photo-34431714.jpeg",
            },
            {
                "base_amount_paise": 0,
                "components": [],
                "donation_min_paise": 0,
                "allow_donation": True,
            },
            {
                "prefix": "ONE10-DM26",
                "credit_note_prefix": "ONE10-DMCN26",
                "computer_generated_note": "This is a computer-generated receipt and does not require a physical signature.",
                "refund_policy_ref": "See /refund-policy",
                "document_version": "v1.0",
                "tax_deductible": False,
            },
            is_active=False,
            is_published=False,
            summary="Community Diwali Milan — subscription amount and venue pending EOC confirmation.",
        ))

    # events
    for e in EVENTS:
        await db.events.update_one(
            {"id": e["id"]},
            {"$setOnInsert": {**e, "cycle_id": CYCLE_2026, "dates": "TBC"}},
            upsert=True,
        )
    # towers & flats (demo: 20 flats per tower) — shared estate master data
    if await db.towers.count_documents({}) == 0:
        for t in TOWERS:
            await db.towers.insert_one({**t, "estate": "one10"})
            for f in range(1, 21):
                fid = f"{t['id']}_flat_{f}"
                await db.flats.insert_one({
                    "id": fid, "tower_id": t["id"], "number": f"{f:02d}0{f % 4 + 1}",
                    "estate": "one10",
                })
    # bank account
    if await db.bank_accounts.count_documents({}) == 0:
        await db.bank_accounts.insert_one({
            "id": "bank_main", "name": "EOC One10 Main Account",
            "account_no_masked": "XXXXXX0000", "opening_balance_paise": 0,
            "note": NOT_APPROVED, "created_at": iso(),
        })


async def get_active_cycle_id() -> str:
    doc = await db.application_settings.find_one({"id": "app_settings"}, {"_id": 0, "active_cycle_id": 1, "cycle": 1})
    if not doc:
        return CYCLE_2026
    return doc.get("active_cycle_id") or (doc.get("cycle") or {}).get("id") or CYCLE_2026


async def get_cycle(cycle_id: Optional[str] = None) -> Optional[dict]:
    cid = cycle_id or await get_active_cycle_id()
    return clean(await db.annual_cycles.find_one({"id": cid}))


async def get_settings() -> dict:
    """Platform settings merged with the active campaign cycle (campaign/subscription/receipt/cycle)."""
    doc = await db.application_settings.find_one({"id": "app_settings"})
    base = clean(doc) if doc else dict(DEFAULT_SETTINGS)
    if "platform" not in base:
        base["platform"] = dict(DEFAULT_SETTINGS["platform"])

    cycle_id = base.get("active_cycle_id") or (base.get("cycle") or {}).get("id") or CYCLE_2026
    cycle = clean(await db.annual_cycles.find_one({"id": cycle_id}))
    if cycle:
        base["active_cycle_id"] = cycle["id"]
        base["cycle"] = {
            "id": cycle["id"],
            "name": cycle.get("name", ""),
            "slug": cycle.get("slug", ""),
            "kind": cycle.get("kind", "event"),
            "currency": cycle.get("currency", "INR"),
            "timezone": cycle.get("timezone", "Asia/Kolkata"),
            "is_active": bool(cycle.get("is_active", True)),
            "is_locked": bool(cycle.get("is_locked", False)),
            "is_published": bool(cycle.get("is_published", True)),
            "summary": cycle.get("summary", ""),
        }
        if cycle.get("campaign"):
            base["campaign"] = cycle["campaign"]
        if cycle.get("subscription"):
            base["subscription"] = cycle["subscription"]
        if cycle.get("receipt"):
            base["receipt"] = cycle["receipt"]
    return base


async def list_campaigns(*, published_only: bool = False) -> list[dict]:
    q = {"is_published": True} if published_only else {}
    items = await db.annual_cycles.find(q, {"_id": 0}).sort("created_at", 1).to_list(100)
    active_id = await get_active_cycle_id()
    for c in items:
        c["is_current"] = c.get("id") == active_id
        # Public-safe projection helpers
        camp = c.get("campaign") or {}
        sub = c.get("subscription") or {}
        c["public"] = {
            "id": c.get("id"),
            "slug": c.get("slug"),
            "name": c.get("name"),
            "kind": c.get("kind"),
            "summary": c.get("summary", ""),
            "title": camp.get("title") or c.get("name"),
            "theme_line": camp.get("theme_line", ""),
            "venue": camp.get("venue", ""),
            "hero_url": camp.get("hero_url", ""),
            "base_amount_paise": sub.get("base_amount_paise", 0),
            "is_locked": bool(c.get("is_locked")),
            "is_active": bool(c.get("is_active")),
            "is_published": bool(c.get("is_published")),
            "is_current": c["is_current"],
            "accepting_subscriptions": bool(c.get("is_published") and c.get("is_active") and not c.get("is_locked") and (sub.get("base_amount_paise") or 0) > 0),
        }
    return items
