"""Digital Pandal Meter — anonymous visit counter + prize milestones."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends

from auth import require
from db import db

router = APIRouter(prefix="/api")

IST = timezone(timedelta(hours=5, minutes=30))
INCEPTION_DATE = "2026-09-08"
PRIZE_NOTE = (
    "Lucky pandal entries are drawn around each milestone and announced on the "
    "website and community WhatsApp. Every visit counts."
)

PRIZE_LADDER = [
    {"at": 2000, "code": "mithai", "title": "Mithai Magic",
     "prize": "Lucky pandal entry wins a festive mithai box"},
    {"at": 3000, "code": "souvenir", "title": "Souvenir Surprise",
     "prize": "Lucky entry wins a One 10 Durgotsav keepsake"},
    {"at": 4000, "code": "bhog", "title": "Bhog for Two",
     "prize": "Complimentary bhog coupons for a lucky pair"},
    {"at": 5000, "code": "hamper", "title": "Prasadam Hamper",
     "prize": "Special Puja hamper for a lucky family"},
    {"at": 7500, "code": "feast", "title": "Family Feast",
     "prize": "Food voucher for a lucky household"},
    {"at": 10000, "code": "grand", "title": "Grand Pandal Prize",
     "prize": "Premium hamper + cultural shout-out"},
    {"at": 15000, "code": "jubilee", "title": "Jubilee Treat",
     "prize": "Mega festive hamper for a lucky entry"},
    {"at": 25000, "code": "silver", "title": "Silver Celebration",
     "prize": "Family feast package + pandal recognition"},
    {"at": 50000, "code": "golden", "title": "Golden Pandal Jackpot",
     "prize": "Grand celebration prize for a lucky family"},
]


def _label(n: int) -> str:
    return f"{int(n):,}"


def _today_ist() -> str:
    return datetime.now(IST).date().isoformat()


def _prize_row(p: dict, total: int) -> dict:
    at = int(p["at"])
    return {
        "at": at,
        "at_label": _label(at),
        "code": p["code"],
        "title": p["title"],
        "prize": p["prize"],
        "reached": total >= at,
    }


async def _ensure_counter() -> dict:
    doc = await db.footfall_meta.find_one({"_id": "counter"})
    if doc:
        return doc
    seed = {
        "_id": "counter",
        "total": 0,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.footfall_meta.insert_one(seed)
    return seed


async def _series(days: int = 7) -> list[dict]:
    today = datetime.now(IST).date()
    start = today - timedelta(days=days - 1)
    cursor = db.footfall_days.find(
        {"date": {"$gte": start.isoformat(), "$lte": today.isoformat()}},
        {"_id": 0, "date": 1, "count": 1},
    ).sort("date", 1)
    by_date = {d["date"]: int(d.get("count") or 0) async for d in cursor}
    out = []
    for i in range(days):
        d = (start + timedelta(days=i)).isoformat()
        out.append({"date": d, "count": by_date.get(d, 0)})
    return out


async def build_stats() -> dict[str, Any]:
    meta = await _ensure_counter()
    total = int(meta.get("total") or 0)
    today = _today_ist()
    day = await db.footfall_days.find_one({"date": today}, {"_id": 0})
    today_count = int((day or {}).get("count") or 0)
    series = await _series(7)
    last7 = sum(r["count"] for r in series)
    prizes = [_prize_row(p, total) for p in PRIZE_LADDER]
    next_prize = next((p for p in prizes if not p["reached"]), None)
    crossed = [p for p in prizes if p["reached"]]
    last_crossed = crossed[-1] if crossed else None
    return {
        "today": today_count,
        "today_label": _label(today_count),
        "total": total,
        "total_label": _label(total),
        "last7": last7,
        "last7_label": _label(last7),
        "series": series,
        "series_7": series,
        "milestone": last_crossed["at"] if last_crossed else None,
        "milestone_label": last_crossed["at_label"] if last_crossed else None,
        "milestone_prize": (
            {k: last_crossed[k] for k in ("at", "at_label", "code", "title", "prize")}
            if last_crossed else None
        ),
        "next_milestone": next_prize["at"] if next_prize else None,
        "next_milestone_label": next_prize["at_label"] if next_prize else None,
        "next_prize": (
            {k: next_prize[k] for k in ("at", "at_label", "code", "title", "prize")}
            if next_prize else None
        ),
        "milestones": [p["at"] for p in PRIZE_LADDER],
        "prizes": prizes,
        "prize_note": PRIZE_NOTE,
        "as_of": datetime.now(IST).isoformat(),
        "date": today,
        "inception_date": INCEPTION_DATE,
        "includes_history": True,
        "history_note": "Anonymous page-visit counter since digital pandal meter launch.",
    }


def _milestone_just_crossed(before: int, after: int) -> Optional[dict]:
    for p in PRIZE_LADDER:
        at = int(p["at"])
        if before < at <= after:
            return {
                "at": at,
                "at_label": _label(at),
                "code": p["code"],
                "title": p["title"],
                "prize": p["prize"],
            }
    return None


@router.get("/footfall")
async def footfall_stats():
    """Public stats for meter, hero strip, transparency chart."""
    return await build_stats()


@router.post("/footfall/ping")
async def footfall_ping():
    """Record one visit (each page load / refresh). Returns guest number."""
    await _ensure_counter()
    today = _today_ist()
    meta_before = await db.footfall_meta.find_one({"_id": "counter"})
    before = int((meta_before or {}).get("total") or 0)

    await db.footfall_days.update_one(
        {"date": today},
        {"$inc": {"count": 1}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    await db.footfall_meta.update_one(
        {"_id": "counter"},
        {"$inc": {"total": 1}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    after = before + 1
    crossed = _milestone_just_crossed(before, after)
    stats = await build_stats()
    return {
        "ok": True,
        "visit_number": after,
        "visit_number_label": _label(after),
        "is_new_visit": True,
        "milestone_crossed": crossed["at"] if crossed else None,
        "milestone_crossed_label": crossed["at_label"] if crossed else None,
        "milestone_crossed_prize": crossed,
        "stats": stats,
    }


@router.get("/admin/footfall")
async def admin_footfall(user: dict = Depends(require("reports:read", "settings:read"))):
    """Committee footfall dashboard — no PII."""
    stats = await build_stats()
    return {
        **stats,
        "note": "Website session visits — no resident PII. Share the WhatsApp meter to grow prize milestones.",
        "next_milestone_label": stats.get("next_milestone_label"),
        "prize_note": stats.get("prize_note"),
    }
