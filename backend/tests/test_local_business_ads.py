"""Local business ads: catalogue rules, helpers, and a full lifecycle against a throwaway database.

Run from backend/:  python -m pytest --noconftest tests/test_local_business_ads.py
The lifecycle test creates its own `one10_ads_test_*` database and drops it afterwards.
"""
import asyncio
import io
import os
import sys
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ["DB_NAME"] = f"one10_ads_test_{uuid.uuid4().hex[:8]}"
os.environ["PRIVATE_UPLOAD_DIR"] = tempfile.mkdtemp(prefix="ads_test_uploads_")
os.environ.pop("EMERGENT_LLM_KEY", None)

from config import CHART_OF_ACCOUNTS, DEFAULT_SETTINGS, LOCAL_BUSINESS_AD_PACKAGES  # noqa: E402

PKGS = {p["code"]: p for p in LOCAL_BUSINESS_AD_PACKAGES["packages"]}


def test_packages_paid_with_outside_premium():
    expected = {
        "neighbourhood_card": (100000, 150000),
        "spotlight_feature": (200000, 300000),
        "story_page": (300000, 450000),
    }
    assert set(PKGS) == set(expected)
    for code, (inside, outside) in expected.items():
        assert PKGS[code]["amount_paise"] == inside
        assert PKGS[code]["amount_paise_outside"] == outside
        assert outside == inside * 3 // 2


def test_spotlight_and_above_include_sponsors_rail():
    assert "sponsors_rail" not in PKGS["neighbourhood_card"]["placements"]
    for code in ("spotlight_feature", "story_page"):
        assert "sponsors_rail" in PKGS[code]["placements"]
        assert "full_page" in PKGS[code]["placements"]
        assert "hero" in PKGS[code]["required_media"]
    assert PKGS["spotlight_feature"]["max_concurrent"] == 12
    assert PKGS["story_page"]["max_concurrent"] == 6
    assert "story_layout" in PKGS["story_page"]["placements"]
    assert {"story_vertical", "video"} <= set(PKGS["story_page"]["optional_media"])


def test_flag_defaults_off_and_income_account_exists():
    assert DEFAULT_SETTINGS["feature_flags"]["local_business_ads_enabled"] is False
    assert any(a["code"] == "4205" and a["type"] == "income" for a in CHART_OF_ACCOUNTS)
    assert LOCAL_BUSINESS_AD_PACKAGES["window_end"] == "2026-11-30"


def test_price_with_addons():
    from routes_ads import _price

    amount, lines = _price(LOCAL_BUSINESS_AD_PACKAGES, PKGS["spotlight_feature"], "outside_one_ten",
                           ["pin_home_3d", "extend_30d"])
    assert amount == 300000 + 80000 + 200000
    assert [l["code"] for l in lines] == ["spotlight_feature", "pin_home_3d", "extend_30d"]
    with pytest.raises(HTTPException) as e:
        _price(LOCAL_BUSINESS_AD_PACKAGES, PKGS["neighbourhood_card"], "inside_one_ten", ["pin_home_3d"])
    assert e.value.status_code == 400


def test_card_free_for_subscribers_only():
    from routes_ads import _price

    card, spot = PKGS["neighbourhood_card"], PKGS["spotlight_feature"]
    assert _price(LOCAL_BUSINESS_AD_PACKAGES, card, "inside_one_ten", [], subscriber=True)[0] == 0
    assert _price(LOCAL_BUSINESS_AD_PACKAGES, card, "inside_one_ten", ["extend_30d"], subscriber=True)[0] == 100000
    assert _price(LOCAL_BUSINESS_AD_PACKAGES, card, "inside_one_ten", [], subscriber=False)[0] == 100000
    assert _price(LOCAL_BUSINESS_AD_PACKAGES, card, "outside_one_ten", [], subscriber=True)[0] == 150000
    assert _price(LOCAL_BUSINESS_AD_PACKAGES, spot, "inside_one_ten", [], subscriber=True)[0] == 200000


def test_validate_link_rules():
    from routes_ads import _validate_link

    assert _validate_link("none", "") == ("none", "")
    assert _validate_link("internal", "/donate") == ("internal", "/donate")
    assert _validate_link("external", "https://wa.me/919876543210")[0] == "external"
    for kind, url in (("external", "http://insecure.example"), ("internal", "https://evil.example"),
                      ("internal", "//evil.example"), ("bogus", "/x")):
        with pytest.raises(HTTPException) as e:
            _validate_link(kind, url)
        assert e.value.status_code == 400


def test_dimension_error_helper():
    from routes_ads import dimension_error

    card = LOCAL_BUSINESS_AD_PACKAGES["creative_specs"]["card"]
    assert dimension_error(card, 1200, 630) == ""
    assert dimension_error(card, 1220, 620) == ""
    assert dimension_error(card, 800, 600) == "Card image must be 1200×630 px (yours is 800×600)."
    assert dimension_error(card, 1240, 630) != ""


def test_status_view_resubmit_flags():
    from routes_ads import _status_view

    base = {"id": "ad_1", "status_token": "tok", "business_name": "Cafe", "media": [{"doc_id": "d1", "kind": "logo"}]}
    assert _status_view({**base, "status": "changes_requested", "resubmit_used": 0})["can_resubmit"] is True
    assert _status_view({**base, "status": "rejected", "resubmit_used": 1})["can_resubmit"] is False
    view = _status_view({**base, "status": "draft"})
    assert view["slug"] is None
    assert view["media"][0]["url"] == "/api/ads/media/d1?token=tok"


def _png(w: int, h: int) -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (w, h), (200, 60, 40)).save(buf, format="PNG")
    return buf.getvalue()


async def _lifecycle():
    import httpx
    from fastapi import FastAPI

    import routes_ads
    from config import ensure_settings
    from db import client, db, ensure_indexes

    assert db.name.startswith("one10_ads_test_"), "refusing to run against a real database"
    app = FastAPI()
    app.include_router(routes_ads.router)
    try:
        await ensure_indexes()
        await ensure_settings()
        await db.users.insert_one({"user_id": "u_admin", "name": "Test Convenor", "email": "t@example.test",
                                   "roles": ["convenor"], "is_active": True})
        await db.user_sessions.insert_one({
            "session_token": "sess_admin", "user_id": "u_admin", "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        })

        async def set_flag(on: bool):
            await db.application_settings.update_one(
                {"id": "app_settings"}, {"$set": {"feature_flags.local_business_ads_enabled": on}})

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://t") as pub, \
                httpx.AsyncClient(transport=transport, base_url="http://t",
                                  cookies={"session_token": "sess_admin"}) as adm:
            body = {
                "package_code": "neighbourhood_card", "business_name": "Maa Tara Sweets", "contact_name": "Riya",
                "mobile": "9876543210", "location_scope": "inside_one_ten", "tower_or_area": "Tower 4",
                "category": "Food & cloud kitchen", "headline": "Fresh mishti daily", "writeup": "Rosogolla and more.",
                "link_type": "external", "link_url": "https://wa.me/919876543210", "link_label": "WhatsApp",
                "terms_accepted": True,
            }

            # Flag off: public blocked and empty, committee can still dry-run
            await set_flag(False)
            assert (await pub.get("/api/ads/placements/home")).json()["items"] == []
            assert (await pub.post("/api/ads/applications", json=body)).status_code == 403
            pk = (await pub.get("/api/ads/packages")).json()
            assert pk["enabled"] is False and pk["apply_open"] is False
            assert (await adm.get("/api/ads/packages")).json()["apply_open"] is True

            await set_flag(True)
            r = await pub.post("/api/ads/applications", json=body)
            assert r.status_code == 200, r.text
            ad_id, tok = r.json()["id"], r.json()["status_token"]
            assert r.json()["amount_paise"] == 100000

            # one open application per mobile
            assert (await pub.post("/api/ads/applications", json=body)).status_code == 409

            # outside spotlight is +50%
            r = await pub.post("/api/ads/applications", json={
                **body, "package_code": "spotlight_feature", "mobile": "9876500001",
                "location_scope": "outside_one_ten", "business_name": "Newtown Salon"})
            assert r.json()["amount_paise"] == 300000

            # wrong size rejected with a clear message; right sizes accepted
            r = await pub.post(f"/api/ads/applications/{ad_id}/media", data={"status_token": tok, "kind": "card"},
                                files={"file": ("card.png", _png(100, 100), "image/png")})
            assert r.status_code == 400 and "1200×630" in r.json()["detail"]
            r = await pub.post(f"/api/ads/applications/{ad_id}/media", data={"status_token": tok, "kind": "hero"},
                                files={"file": ("hero.png", _png(1920, 1080), "image/png")})
            assert r.status_code == 400
            for kind, size in (("logo", (800, 800)), ("card", (1200, 630))):
                r = await pub.post(f"/api/ads/applications/{ad_id}/media", data={"status_token": tok, "kind": kind},
                                    files={"file": (f"{kind}.png", _png(*size), "image/png")})
                assert r.status_code == 200, r.text

            # submit blocked without payment
            assert (await pub.post(f"/api/ads/applications/{ad_id}/submit", json={"status_token": tok})).status_code == 400
            r = await pub.post(f"/api/ads/applications/{ad_id}/payment-proof",
                               data={"status_token": tok, "utr": "UTR123456789"},
                               files={"screenshot": ("pay.png", _png(300, 600), "image/png")})
            assert r.status_code == 200, r.text
            r = await pub.post(f"/api/ads/applications/{ad_id}/submit", json={"status_token": tok})
            assert r.status_code == 200 and r.json()["status"] == "submitted"

            # draft media private until published
            proof_id = (await db.business_ads.find_one({"id": ad_id}))["payment_proof_doc_id"]
            assert (await pub.get(f"/api/ads/media/{proof_id}")).status_code == 403
            assert (await pub.get(f"/api/ads/media/{proof_id}?token={tok}")).status_code == 200

            # publish needs payment confirmation; posts 4205 journal once
            assert (await pub.post(f"/api/ads/admin/{ad_id}/review", json={"action": "start_review"})).status_code == 401
            r = await adm.post(f"/api/ads/admin/{ad_id}/review", json={"action": "approve_publish"})
            assert r.status_code == 400
            r = await adm.post(f"/api/ads/admin/{ad_id}/review", json={"action": "approve_publish", "payment_verified": True})
            assert r.status_code == 200, r.text
            ad = r.json()["ad"]
            assert ad["status"] == "published" and ad["slug"] == "maa-tara-sweets"
            assert ad["live_until"].startswith("2026-11-30T18:29:59")
            jv = await db.journal_entries.find_one({"source_type": "business_ad", "source_id": ad_id})
            assert jv and {l["account_code"] for l in jv["lines"]} == {"1001", "4205"}

            home = (await pub.get("/api/ads/placements/home")).json()["items"]
            assert [i["id"] for i in home] == [ad_id]
            assert (await pub.get("/api/ads/placements/sponsors")).json()["items"] == []
            assert (await pub.get("/api/ads/directory/maa-tara-sweets")).status_code == 200
            assert (await pub.get("/api/ads/directory", params={"q": "mishti"})).json()["count"] == 1

            # clicks
            for _ in range(2):
                assert (await pub.post(f"/api/ads/{ad_id}/click", json={"placement": "home_strip"})).status_code == 200
            doc = await db.business_ads.find_one({"id": ad_id})
            assert doc["click_count"] == 2 and doc["clicks_by_surface"]["home_strip"] == 2

            # pause hides; resume does not post a second journal
            await adm.post(f"/api/ads/admin/{ad_id}/review", json={"action": "pause"})
            assert (await pub.get("/api/ads/placements/home")).json()["items"] == []
            await adm.post(f"/api/ads/admin/{ad_id}/review", json={"action": "resume"})
            assert await db.journal_entries.count_documents({"source_id": ad_id}) == 1

            # inventory cap → 409
            for i in range(6):
                await db.business_ads.insert_one({"id": f"ad_fill{i}", "status": "submitted", "package_code": "story_page",
                                                  "category": "Other", "mobile": f"98000000{i}0", "is_deleted": False})
            r = await pub.post("/api/ads/applications", json={**body, "package_code": "story_page",
                                                               "mobile": "9876500002", "business_name": "Big Brand"})
            assert r.status_code == 409

            # changes requested → one resubmit → reject → no more resubmits
            r = await pub.post("/api/ads/applications", json={**body, "mobile": "9876500003", "business_name": "Tutor Point",
                                                               "category": "Tuition & coaching"})
            ad2, tok2 = r.json()["id"], r.json()["status_token"]
            for kind, size in (("logo", (800, 800)), ("card", (1200, 630))):
                await pub.post(f"/api/ads/applications/{ad2}/media", data={"status_token": tok2, "kind": kind},
                               files={"file": (f"{kind}.png", _png(*size), "image/png")})
            await pub.post(f"/api/ads/applications/{ad2}/payment-proof", data={"status_token": tok2, "utr": "UTR998877"},
                           files={"screenshot": ("pay.png", _png(300, 600), "image/png")})
            await pub.post(f"/api/ads/applications/{ad2}/submit", json={"status_token": tok2})
            assert (await adm.post(f"/api/ads/admin/{ad2}/review", json={"action": "request_changes"})).status_code == 400
            await adm.post(f"/api/ads/admin/{ad2}/review", json={"action": "request_changes", "notes": "Bigger logo"})
            st = (await pub.get(f"/api/ads/status/{tok2}")).json()
            assert st["can_resubmit"] is True and st["review_notes"] == "Bigger logo"
            assert (await pub.post(f"/api/ads/applications/{ad2}/submit", json={"status_token": tok2})).status_code == 200
            assert (await adm.post(f"/api/ads/admin/{ad2}/review", json={"action": "reject"})).status_code == 400
            r = await adm.post(f"/api/ads/admin/{ad2}/review", json={"action": "reject", "reason": "policy", "notes": "No"})
            assert r.status_code == 200 and r.json()["ad"]["refund_status"] == "not_eligible"
            st = (await pub.get(f"/api/ads/status/{tok2}")).json()
            assert st["status"] == "rejected" and st["can_resubmit"] is False
            assert (await pub.post(f"/api/ads/applications/{ad2}/submit", json={"status_token": tok2})).status_code == 409

            # payment waiver: only allow-listed signed-in users; publish posts no journal
            r = await pub.post("/api/ads/applications", json={**body, "mobile": "9876500004", "business_name": "Waived Co"})
            ad3, tok3 = r.json()["id"], r.json()["status_token"]
            for kind, size in (("logo", (800, 800)), ("card", (1200, 630))):
                await pub.post(f"/api/ads/applications/{ad3}/media", data={"status_token": tok3, "kind": kind},
                               files={"file": (f"{kind}.png", _png(*size), "image/png")})
            waive = {"status_token": tok3, "waive_payment": True}
            os.environ["ADS_PAYMENT_WAIVER_USER_IDS"] = "someone_else"
            assert (await adm.get("/api/ads/payment-waiver")).json()["allowed"] is False
            assert (await adm.post(f"/api/ads/applications/{ad3}/submit", json=waive)).status_code == 403
            os.environ["ADS_PAYMENT_WAIVER_USER_IDS"] = "u_admin"
            assert (await pub.get("/api/ads/payment-waiver")).json()["allowed"] is False
            assert (await pub.post(f"/api/ads/applications/{ad3}/submit", json=waive)).status_code == 403
            assert (await adm.get("/api/ads/payment-waiver")).json()["allowed"] is True
            r = await adm.post(f"/api/ads/applications/{ad3}/submit", json=waive)
            assert r.status_code == 200, r.text
            assert (await pub.get(f"/api/ads/status/{tok3}")).json()["payment_waived"] is True
            r = await adm.post(f"/api/ads/admin/{ad3}/review", json={"action": "approve_publish"})
            assert r.status_code == 200, r.text
            assert r.json()["ad"]["status"] == "published" and r.json()["ad"]["journal_id"] is None
            assert await db.journal_entries.count_documents({"source_id": ad3}) == 0
            os.environ.pop("ADS_PAYMENT_WAIVER_USER_IDS", None)

            # Neighbourhood Card is free for a flat with an issued subscription receipt this cycle
            from config import get_active_cycle_id
            await db.flats.insert_many([{"id": "flat_sub", "tower_id": "tw1", "number": "9B"},
                                        {"id": "flat_nosub", "tower_id": "tw1", "number": "9C"}])
            await db.households.insert_one({"id": "hh_sub", "flat_id": "flat_sub"})
            await db.receipts.insert_one({"id": "rc_sub", "household_id": "hh_sub", "kind": "subscription",
                                          "status": "issued", "cycle_id": await get_active_cycle_id(), "total_amount": 100})
            q = {"package_code": "neighbourhood_card", "location_scope": "inside_one_ten"}
            r = (await pub.get("/api/ads/quote", params={**q, "flat_id": "flat_sub"})).json()
            assert r["amount_paise"] == 0 and r["subscriber"] is True and r["payment_required"] is False
            assert (await pub.get("/api/ads/quote", params={**q, "flat_id": "flat_nosub"})).json()["amount_paise"] == 100000
            assert (await pub.get("/api/ads/quote", params={**q, "package_code": "spotlight_feature",
                                                            "flat_id": "flat_sub"})).json()["amount_paise"] == 200000
            r = await pub.post("/api/ads/applications", json={**body, "mobile": "9876500005", "business_name": "Free Card Co",
                                                               "tower_id": "tw1", "flat_id": "flat_sub"})
            assert r.status_code == 200 and r.json()["amount_paise"] == 0
            ad4, tok4 = r.json()["id"], r.json()["status_token"]
            for kind, size in (("logo", (800, 800)), ("card", (1200, 630))):
                await pub.post(f"/api/ads/applications/{ad4}/media", data={"status_token": tok4, "kind": kind},
                               files={"file": (f"{kind}.png", _png(*size), "image/png")})
            r = await pub.post(f"/api/ads/applications/{ad4}/submit", json={"status_token": tok4})
            assert r.status_code == 200, r.text
            assert (await pub.get(f"/api/ads/status/{tok4}")).json()["subscriber_free"] is True
            r = await adm.post(f"/api/ads/admin/{ad4}/review", json={"action": "approve_publish"})
            assert r.status_code == 200, r.text
            assert r.json()["ad"]["journal_id"] is None
            assert await db.journal_entries.count_documents({"source_id": ad4}) == 0
            # non-subscriber flat still has to pay
            r = await pub.post("/api/ads/applications", json={**body, "mobile": "9876500006", "business_name": "Paying Co",
                                                               "tower_id": "tw1", "flat_id": "flat_nosub"})
            ad5, tok5 = r.json()["id"], r.json()["status_token"]
            assert r.json()["amount_paise"] == 100000
            for kind, size in (("logo", (800, 800)), ("card", (1200, 630))):
                await pub.post(f"/api/ads/applications/{ad5}/media", data={"status_token": tok5, "kind": kind},
                               files={"file": (f"{kind}.png", _png(*size), "image/png")})
            assert (await pub.post(f"/api/ads/applications/{ad5}/submit", json={"status_token": tok5})).status_code == 400

            # kill switch
            await set_flag(False)
            assert (await pub.get("/api/ads/placements/home")).json()["items"] == []
            assert (await pub.get("/api/ads/directory/maa-tara-sweets")).status_code == 404
            assert (await adm.get("/api/ads/admin/queue", params={"status": "all"})).status_code == 200
    finally:
        await client.drop_database(os.environ["DB_NAME"])


def test_lifecycle_against_throwaway_db():
    asyncio.run(_lifecycle())
