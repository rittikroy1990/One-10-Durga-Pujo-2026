"""Public (unauthenticated) routes: platform config, campaigns, master data, receipt verification."""
from fastapi import APIRouter, HTTPException

from db import db
from config import get_settings, list_campaigns, get_active_cycle_id
from tokens import read_receipt_token
from util import mask_name, fmt_inr

router = APIRouter(prefix="/api")


@router.get("/health")
async def health():
    return {"status": "ok", "app": "One 10 Events", "portal": "subscriptions-accounting-receipts"}


@router.get("/config")
async def public_config():
    s = await get_settings()
    campaigns = await list_campaigns(published_only=True)
    # Only expose non-sensitive, public-facing configuration.
    return {
        "platform": s.get("platform") or {
            "name": "One 10 Events",
            "tagline": "Community celebrations, transparent subscriptions, verified receipts.",
            "short_name": "One10 Events",
        },
        "organisation": {k: s["organisation"].get(k) for k in (
            "community", "organiser", "short_name", "legal_identity", "legal_status",
            "pan", "date_of_formation",
            "address", "area_of_activity", "contact_email", "contact_phone",
            "primary_contact_name", "primary_contact_role", "primary_contact_phone",
            "secondary_contact_name", "secondary_contact_role", "secondary_contact_phone",
            "authorised_signatory", "authorised_signatories_note", "bank_operating_mandate",
            "bank_account", "moa_reference", "objectives_events", "office_bearers",
            "logo_url", "hero_url", "governing_body_size",
        )},
        "campaign": s.get("campaign", {}),
        "cycle": s.get("cycle", {}),
        "subscription": s.get("subscription", {}),
        "receipt": {"prefix": s["receipt"]["prefix"], "refund_policy_ref": s["receipt"]["refund_policy_ref"],
                    "tax_deductible": s["receipt"]["tax_deductible"]},
        "feature_flags": s.get("feature_flags", {}),
        "campaigns": [c["public"] for c in campaigns],
        "active_cycle_id": await get_active_cycle_id(),
        "sponsorship": s.get("sponsorship") or {},
    }


@router.get("/campaigns")
async def public_campaigns():
    items = await list_campaigns(published_only=True)
    return {"items": [c["public"] for c in items], "active_cycle_id": await get_active_cycle_id()}


@router.get("/campaigns/{slug}")
async def public_campaign_by_slug(slug: str):
    cycle = await db.annual_cycles.find_one({"slug": slug, "is_published": True}, {"_id": 0})
    if not cycle:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    items = await list_campaigns(published_only=True)
    match = next((c for c in items if c.get("slug") == slug), None)
    if not match:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    return match["public"]


@router.get("/towers")
async def list_towers():
    towers = await db.towers.find({}, {"_id": 0}).sort("name", 1).to_list(200)
    return {"items": towers}


@router.get("/towers/{tower_id}/flats")
async def list_flats(tower_id: str):
    flats = await db.flats.find({"tower_id": tower_id}, {"_id": 0}).sort("number", 1).to_list(500)
    return {"items": flats}


@router.get("/events")
async def public_events():
    cycle_id = await get_active_cycle_id()
    events = await db.events.find({"cycle_id": cycle_id}, {"_id": 0}).to_list(50)
    if not events:
        events = await db.events.find({}, {"_id": 0}).to_list(50)
    s = await get_settings()
    campaign = s.get("campaign") or {}
    return {
        "items": events,
        "venue": campaign.get("venue"),
        "cycle_id": cycle_id,
        "dates_label": campaign.get("dates_label"),
        "programme": campaign.get("programme") or [],
        "programme_source": campaign.get("programme_source"),
    }


@router.get("/announcements")
async def public_announcements():
    items = await db.announcements.find({"published": True, "is_deleted": {"$ne": True}},
                                        {"_id": 0}).sort("created_at", -1).to_list(50)
    return {"items": items}


@router.get("/receipt/verify/{token}")
async def verify_receipt(token: str):
    """Limited public verification — masked identity only, no personal data."""
    receipt_id = read_receipt_token(token)
    if not receipt_id:
        raise HTTPException(status_code=404, detail="Invalid verification token")
    r = await db.receipts.find_one({"id": receipt_id}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Receipt not found")
    return {
        "receipt_no": r["receipt_no"],
        "payer_name_masked": mask_name(r.get("payer_name", "")),
        "tower_name": r.get("tower_name", ""),
        "flat_number": r.get("flat_number", ""),
        "amount": fmt_inr(r.get("total_amount", 0)),
        "issued_at": r.get("issued_at"),
        "status": "VALID" if r.get("status") == "issued" else r.get("status", "").upper(),
        "verified": r.get("status") == "issued",
        "campaign_title": r.get("campaign_title", ""),
    }
