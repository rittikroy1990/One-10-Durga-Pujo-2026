"""Public (unauthenticated) routes: campaign config, master data, events, receipt verification."""
from fastapi import APIRouter, HTTPException

from db import db
from config import get_settings
from tokens import read_receipt_token
from util import mask_name, mask_mobile, fmt_inr

router = APIRouter(prefix="/api")


@router.get("/health")
async def health():
    return {"status": "ok", "app": "One10 Durgotsav 2026 Portal"}


@router.get("/config")
async def public_config():
    s = await get_settings()
    # Only expose non-sensitive, public-facing configuration.
    return {
        "organisation": {k: s["organisation"].get(k) for k in
                         ("community", "organiser", "contact_email", "contact_phone", "logo_url", "hero_url")},
        "campaign": s.get("campaign", {}),
        "cycle": s.get("cycle", {}),
        "subscription": s.get("subscription", {}),
        "receipt": {"prefix": s["receipt"]["prefix"], "refund_policy_ref": s["receipt"]["refund_policy_ref"],
                    "tax_deductible": s["receipt"]["tax_deductible"]},
        "feature_flags": s.get("feature_flags", {}),
    }


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
    events = await db.events.find({}, {"_id": 0}).to_list(50)
    s = await get_settings()
    return {"items": events, "venue": s["campaign"]["venue"]}


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
    }
