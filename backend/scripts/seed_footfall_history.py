"""One-time / idempotent seed of footfall from reconstructed nginx history.

Usage (from backend/ with venv + .env):
  python scripts/seed_footfall_history.py
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(ROOT))

from db import db  # noqa: E402
from util import iso, now_utc, to_ist  # noqa: E402

HISTORY = Path(__file__).resolve().parent / "data" / "one10_footfall_history.json"
if not HISTORY.exists():
    HISTORY = Path("/tmp/one10_footfall_history.json")
# Matches the ~1.3k pageview / activity-bucket reconstruction used in production.
DEFAULT_SEED_ID = "pageviews_or_3min_buckets_v2"


async def main():
    if not HISTORY.exists():
        raise SystemExit(f"Missing history file: {HISTORY}")
    data = json.loads(HISTORY.read_text())
    daily = data.get("daily") or {}
    method = data.get("method") or DEFAULT_SEED_ID
    seed_id = data.get("seed_id") or DEFAULT_SEED_ID
    total_hist = int(data.get("total") or sum(int(v) for v in daily.values()))
    today = to_ist(now_utc()).strftime("%Y-%m-%d")

    meta = await db.footfall_meta.find_one({"id": "seed"})
    if meta and meta.get("seed_id") == seed_id and int(meta.get("history_total") or 0) == total_hist:
        print(f"Already seeded with {seed_id} (history={total_hist}).")
        cur = await db.footfall_counters.find_one({"id": "global"}, {"_id": 0})
        print("counter", cur)
        return

    for day, count in daily.items():
        count = int(count)
        existing = await db.footfall_daily.find_one({"id": day})
        prior = int((existing or {}).get("count") or 0)
        # Historical days: use reconstructed nginx totals.
        # Today: keep the larger of seed vs live session pings.
        final = count if day < today else max(prior, count)
        await db.footfall_daily.update_one(
            {"id": day},
            {"$set": {
                "id": day,
                "date": day,
                "count": final,
                "updated_at": iso(),
                "source": "nginx_seed_v2" if final == count else "merged",
            }},
            upsert=True,
        )

    total = 0
    async for row in db.footfall_daily.find({}):
        total += int(row.get("count") or 0)

    await db.footfall_counters.update_one(
        {"id": "global"},
        {"$set": {
            "id": "global",
            "total": total,
            "updated_at": iso(),
            "inception_seed_total": total_hist,
            "inception_note": (
                "Includes every recorded page visit since launch (8 Sep 2026). "
                "Reconstructed from nginx access logs (pageviews / activity buckets)."
            ),
        }},
        upsert=True,
    )
    await db.footfall_meta.update_one(
        {"id": "seed"},
        {"$set": {
            "id": "seed",
            "seed_id": seed_id,
            "method": method,
            "seeded_at": iso(),
            "history_total": total_hist,
            "applied_total": total,
            "daily": {k: int(v) for k, v in daily.items()},
        }},
        upsert=True,
    )
    print(f"Seeded footfall: history={total_hist}, applied_total={total}, days={len(daily)}, seed_id={seed_id}")


if __name__ == "__main__":
    asyncio.run(main())
