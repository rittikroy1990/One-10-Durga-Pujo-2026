"""Website footfall / digital pandal meter — visit counter + prize milestones, no PII."""
from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request

from db import db, NO_ID
from util import iso, now_utc, to_ist
from audit import audit
from auth import require

router = APIRouter(prefix="/api")

# Milestone visit counts for celebration banners (no named prizes publicly).
MILESTONE_PRIZES = (
    {"at": 2_000, "code": "m2k", "title": "2,000 visits", "prize": ""},
    {"at": 3_000, "code": "m3k", "title": "3,000 visits", "prize": ""},
    {"at": 4_000, "code": "m4k", "title": "4,000 visits", "prize": ""},
    {"at": 5_000, "code": "m5k", "title": "5,000 visits", "prize": ""},
    {"at": 7_500, "code": "m7k", "title": "7,500 visits", "prize": ""},
    {"at": 10_000, "code": "m10k", "title": "10,000 visits", "prize": ""},
    {"at": 15_000, "code": "m15k", "title": "15,000 visits", "prize": ""},
    {"at": 25_000, "code": "m25k", "title": "25,000 visits", "prize": ""},
    {"at": 50_000, "code": "m50k", "title": "50,000 visits", "prize": ""},
)
MILESTONES = tuple(int(p["at"]) for p in MILESTONE_PRIZES)
_PRIZE_BY_AT = {int(p["at"]): p for p in MILESTONE_PRIZES}
COUNTER_ID = "global"
LAUNCH_DATE = "2026-09-08"


def _ist_today() -> str:
    return to_ist(now_utc()).strftime("%Y-%m-%d")


def _fmt(n: int) -> str:
    return f"{int(n):,}"


def _prize_payload(at: int | None) -> dict | None:
    if not at:
        return None
    p = _PRIZE_BY_AT.get(int(at))
    if not p:
        return None
    return {
        "at": int(p["at"]),
        "at_label": _fmt(p["at"]),
        "code": p["code"],
        "title": p["title"],
        "prize": p["prize"],
    }


def _highest_milestone(total: int) -> int | None:
    hit = [m for m in MILESTONES if total >= m]
    return hit[-1] if hit else None


def _next_milestone(total: int) -> int | None:
    for m in MILESTONES:
        if total < m:
            return m
    return None


def _just_crossed(before: int, after: int) -> int | None:
    for m in MILESTONES:
        if before < m <= after:
            return m
    return None


async def _ensure_counter() -> dict:
    doc = await db.footfall_counters.find_one({"id": COUNTER_ID})
    if doc:
        return doc
    base = {"id": COUNTER_ID, "total": 0, "updated_at": iso()}
    await db.footfall_counters.insert_one(dict(base))
    return base


async def _stats_payload() -> dict:
    today = _ist_today()
    counter = await _ensure_counter()
    total = int(counter.get("total") or 0)
    day = await db.footfall_daily.find_one({"id": today}, NO_ID)
    today_count = int((day or {}).get("count") or 0)

    # Chart starts at launch (8 Sep 2026) — do not pad empty pre-launch days.
    window_start = (to_ist(now_utc()) - timedelta(days=29)).strftime("%Y-%m-%d")
    start = max(LAUNCH_DATE, window_start)
    by_date = {}
    async for row in db.footfall_daily.find({"id": {"$gte": start}}, NO_ID):
        by_date[row["id"]] = int(row.get("count") or 0)

    series = []
    from datetime import datetime as _dt
    cursor_day = _dt.strptime(start, "%Y-%m-%d").date()
    end_day = to_ist(now_utc()).date()
    while cursor_day <= end_day:
        d = cursor_day.strftime("%Y-%m-%d")
        series.append({"date": d, "count": by_date.get(d, 0)})
        cursor_day += timedelta(days=1)

    last7 = series[-7:] if len(series) >= 7 else list(series)
    last7_total = sum(r["count"] for r in last7)
    milestone = _highest_milestone(total)
    nxt = _next_milestone(total)
    prizes = [
        {**_prize_payload(int(p["at"])), "reached": total >= int(p["at"])}
        for p in MILESTONE_PRIZES
    ]
    seed = await db.footfall_meta.find_one({"id": "seed"}, NO_ID)
    inception = LAUNCH_DATE

    return {
        "today": today_count,
        "today_label": _fmt(today_count),
        "total": total,
        "total_label": _fmt(total),
        "last7": last7_total,
        "last7_label": _fmt(last7_total),
        "series": series,
        "series_7": last7,
        "milestone": milestone,
        "milestone_label": _fmt(milestone) if milestone else None,
        "milestone_prize": _prize_payload(milestone),
        "next_milestone": nxt,
        "next_milestone_label": _fmt(nxt) if nxt else None,
        "next_prize": _prize_payload(nxt),
        "milestones": list(MILESTONES),
        "prizes": prizes,
        "prize_note": "Share on WhatsApp to get a prize.",
        "as_of": iso(),
        "date": today,
        "inception_date": inception,
        "includes_history": bool(seed),
        "history_note": (
            counter.get("inception_note")
            or "Visit totals include traffic since website launch on 8 Sep 2026."
        ),
    }


async def _ping_rate_limit(request: Request):
    ip = request.client.host if request and request.client else "?"
    since = now_utc().timestamp() - 60
    recent = await db.footfall_ping_log.count_documents({"ip": ip, "ts": {"$gt": since}})
    if recent >= 40:
        raise HTTPException(status_code=429, detail="Too many visits recorded. Please wait a moment.")
    await db.footfall_ping_log.insert_one({"ip": ip, "ts": now_utc().timestamp()})


@router.get("/footfall")
async def footfall_stats():
    """Public stats for meter, hero strip, transparency chart."""
    return await _stats_payload()


@router.post("/footfall/ping")
async def footfall_ping(request: Request = None):
    """Record one visit (each page load / refresh). Returns visit number."""
    await _ping_rate_limit(request)
    today = _ist_today()

    before_doc = await _ensure_counter()
    before = int(before_doc.get("total") or 0)

    await db.footfall_counters.update_one(
        {"id": COUNTER_ID},
        {"$inc": {"total": 1}, "$set": {"updated_at": iso()}},
        upsert=True,
    )
    await db.footfall_daily.update_one(
        {"id": today},
        {"$inc": {"count": 1}, "$set": {"date": today, "updated_at": iso()}},
        upsert=True,
    )

    after = before + 1
    crossed = _just_crossed(before, after)
    stats = await _stats_payload()

    return {
        "ok": True,
        "visit_number": after,
        "visit_number_label": _fmt(after),
        "is_new_visit": True,
        "milestone_crossed": crossed,
        "milestone_crossed_label": _fmt(crossed) if crossed else None,
        "milestone_crossed_prize": _prize_payload(crossed),
        "stats": stats,
    }


@router.get("/admin/footfall")
async def admin_footfall(user: dict = Depends(require("reports:read"))):
    """Committee footfall dashboard — no PII."""
    stats = await _stats_payload()
    return {
        **stats,
        "note": (
            "Website visits (each page load counts). No names, flats, or phones stored. "
            "Quote these numbers for social proof and prize milestones."
        ),
    }
