"""Local business advertising — paid apply → committee review → publish."""
from __future__ import annotations

import io
import json
import os
import re
import secrets
import subprocess
import tempfile
from datetime import datetime, timedelta
from urllib.parse import urlparse

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response

from audit import audit
from auth import get_optional_user, require, user_permissions
from config import get_active_cycle_id, get_settings
from db import clean, db, new_id
from ledger import LedgerError, post_journal
from storage import VIDEO_EXT, get_object, save_document
from util import IST, iso, now_utc, to_ist, valid_indian_mobile

router = APIRouter(prefix="/api")

EDITABLE = ("draft", "changes_requested", "rejected")
IN_PIPELINE = ("submitted", "in_review")
OPEN_FOR_MOBILE = ("draft", "submitted", "in_review", "changes_requested")
STALE_DRAFT_HOURS = 48
IMAGE_KINDS = ("logo", "card", "hero", "story_vertical")
PROOF_EXT = {"jpg", "jpeg", "png", "webp", "pdf"}
BANK_ACCOUNT = "1001"
INCOME_ACCOUNT = "4205"
NO_STORE = "no-store"
FLAG_OFF_MESSAGE = "Business promotions open soon. Follow One10 Events for the date."


# ------------------------------------------------------------------ helpers
def _slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return s[:48].strip("-") or "business"


async def _unique_slug(base: str, ad_id: str) -> str:
    root = _slugify(base)
    slug, n = root, 0
    while await db.business_ads.find_one({"slug": slug, "id": {"$ne": ad_id}}):
        n += 1
        slug = f"{root}-{n}"
    return slug


async def _catalog() -> dict:
    s = await get_settings()
    return s.get("local_business_ads") or {}


async def _flag_on() -> bool:
    s = await get_settings()
    return bool((s.get("feature_flags") or {}).get("local_business_ads_enabled"))


async def _is_reviewer(request: Request | None) -> bool:
    if request is None:
        return False
    user = await get_optional_user(request)
    if not user:
        return False
    perms = user_permissions(user)
    return bool({"ads:review", "ops:manage"} & perms)


def _waiver_user_ids() -> set[str]:
    return {u.strip() for u in (os.environ.get("ADS_PAYMENT_WAIVER_USER_IDS") or "").split(",") if u.strip()}


async def _waiver_actor(request: Request | None) -> dict | None:
    """Signed-in user allowed to submit without payment (ADS_PAYMENT_WAIVER_USER_IDS in backend/.env)."""
    if request is None:
        return None
    user = await get_optional_user(request)
    if user and user.get("user_id") in _waiver_user_ids():
        return user
    return None


async def _public_visible(request: Request | None) -> bool:
    """Public placements: on when the flag is on; committee reviewers always see a preview."""
    return await _flag_on() or await _is_reviewer(request)


async def _require_open(request: Request | None):
    if not await _public_visible(request):
        raise HTTPException(status_code=403, detail=FLAG_OFF_MESSAGE)


def _pkg(catalog: dict, code: str) -> dict | None:
    return next((p for p in catalog.get("packages") or [] if p.get("code") == code), None)


def _addon(catalog: dict, code: str) -> dict | None:
    return next((a for a in catalog.get("addons") or [] if a.get("code") == code), None)


def _subscriber_free(pkg: dict, scope: str, subscriber: bool) -> bool:
    return bool(subscriber and scope == "inside_one_ten" and pkg.get("free_for_subscribers"))


def _price(catalog: dict, pkg: dict, scope: str, addon_codes: list[str], subscriber: bool = False) -> tuple[int, list[dict]]:
    if _subscriber_free(pkg, scope, subscriber):
        lines = [{"code": pkg["code"], "label": f"{pkg['name']} (free for subscribers)", "amount_paise": 0}]
    else:
        base = int(pkg["amount_paise_outside"] if scope == "outside_one_ten" else pkg["amount_paise"])
        lines = [{"code": pkg["code"], "label": pkg["name"] + (" (outside One Ten)" if scope == "outside_one_ten" else ""),
                  "amount_paise": base}]
    for code in addon_codes:
        a = _addon(catalog, code)
        if not a:
            raise HTTPException(status_code=400, detail=f"Unknown add-on: {code}")
        if pkg["code"] not in (a.get("eligible_packages") or []):
            raise HTTPException(status_code=400, detail=f"{a['name']} is not available with {pkg['name']}.")
        amt = int((a.get("amount_paise_by_package") or {}).get(pkg["code"]) or a.get("amount_paise") or 0)
        lines.append({"code": code, "label": a["name"], "amount_paise": amt})
    return sum(l["amount_paise"] for l in lines), lines


def _validate_link(link_type: str, link_url: str) -> tuple[str, str]:
    link_type = (link_type or "none").strip().lower()
    link_url = (link_url or "").strip()
    if link_type in ("", "none"):
        return "none", ""
    if link_type == "internal":
        if not link_url.startswith("/") or link_url.startswith("//"):
            raise HTTPException(status_code=400, detail="Internal link must start with /")
        return "internal", link_url
    if link_type == "external":
        parsed = urlparse(link_url)
        if parsed.scheme != "https" or not parsed.netloc:
            raise HTTPException(status_code=400, detail="External links must use https://")
        return "external", link_url
    raise HTTPException(status_code=400, detail="Invalid link type")


def dimension_error(spec: dict, width: int, height: int, tolerance: float = 0.02) -> str:
    """Empty string when width/height are within tolerance of the spec, else a human error."""
    want_w, want_h = int(spec["width"]), int(spec["height"])
    if abs(width - want_w) <= want_w * tolerance and abs(height - want_h) <= want_h * tolerance:
        return ""
    return f"{spec.get('label', 'Image')} must be {want_w}×{want_h} px (yours is {width}×{height})."


def _video_seconds(data: bytes, ext: str) -> float | None:
    try:
        with tempfile.NamedTemporaryFile(suffix=f".{ext}") as tmp:
            tmp.write(data)
            tmp.flush()
            out = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", tmp.name],
                capture_output=True, timeout=20, check=False,
            )
        return float(json.loads(out.stdout or b"{}").get("format", {}).get("duration"))
    except Exception:
        return None


def _live_query(now: str | None = None, **extra) -> dict:
    now = now or iso()
    q = {"status": "published", "is_deleted": {"$ne": True},
         "live_from": {"$lte": now}, "live_until": {"$gte": now}}
    q.update(extra)
    return q


def _end_of_day_ist(day: str) -> datetime:
    d = datetime.strptime(day, "%Y-%m-%d")
    return IST.localize(d.replace(hour=23, minute=59, second=59))


def _client_ip(request: Request | None) -> str:
    if request is None:
        return "?"
    return (request.headers.get("x-real-ip")
            or (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
            or (request.client.host if request.client else "?"))


async def _rate_limit(request: Request | None, catalog: dict):
    cap = int((catalog.get("rules") or {}).get("submissions_per_ip_per_day") or 10)
    ip = _client_ip(request)
    day = to_ist(now_utc()).strftime("%Y-%m-%d")
    if await db.ads_submissions.count_documents({"ip": ip, "day": day}) >= cap:
        raise HTTPException(status_code=429, detail="Too many applications from this network today. Try again tomorrow.")
    await db.ads_submissions.insert_one({"ip": ip, "day": day, "ts": iso()})


async def _check_inventory(catalog: dict, pkg: dict, addons: list[str], category: str, exclude_id: str = ""):
    now = iso()
    not_self = {"id": {"$ne": exclude_id}} if exclude_id else {}
    active = {"$or": [{"status": {"$in": list(IN_PIPELINE)}},
                      {"status": "published", "live_until": {"$gte": now}}]}
    base = {"is_deleted": {"$ne": True}, **not_self}

    cap = pkg.get("max_concurrent")
    if cap:
        used = await db.business_ads.count_documents({**base, **active, "package_code": pkg["code"]})
        if used >= int(cap):
            raise HTTPException(status_code=409, detail=f"All {cap} {pkg['name']} slots are taken for this window. "
                                                        "Choose another package or try again later.")

    if "pin_home_3d" in addons:
        a = _addon(catalog, "pin_home_3d") or {}
        pin_cap = int(a.get("max_concurrent") or 3)
        pinned = await db.business_ads.count_documents({**base, "addons": "pin_home_3d", "$or": [
            {"status": {"$in": list(IN_PIPELINE)}},
            {"status": "published", "pinned_until": {"$gte": now}},
        ]})
        if pinned >= pin_cap:
            raise HTTPException(status_code=409, detail="All Home-strip pin slots are taken right now. Remove the pin add-on or try later.")

    if category:
        exclusive = await db.business_ads.find_one({**base, **active, "category": category, "addons": "category_exclusive"})
        if exclusive:
            raise HTTPException(status_code=409, detail=f"“{category}” is reserved by a category-exclusive advertiser for this window.")
        if "category_exclusive" in addons:
            other = await db.business_ads.find_one({**base, **active, "category": category})
            if other:
                raise HTTPException(status_code=409, detail=f"Category exclusive is unavailable: another “{category}” ad is already running or in review.")


def _media_url(m: dict, token: str = "") -> str:
    url = f"/api/ads/media/{m['doc_id']}"
    return f"{url}?token={token}" if token else url


def _public_card(doc: dict) -> dict:
    media = [{"kind": m.get("kind"), "url": _media_url(m), "width": m.get("width"), "height": m.get("height"),
              "content_type": m.get("content_type")} for m in doc.get("media") or []]
    return {
        "id": doc["id"],
        "slug": doc.get("slug"),
        "business_name": doc.get("business_name"),
        "headline": doc.get("headline"),
        "writeup": doc.get("writeup"),
        "category": doc.get("category"),
        "location_scope": doc.get("location_scope"),
        "tower_or_area": doc.get("tower_or_area"),
        "package_code": doc.get("package_code"),
        "package_name": doc.get("package_name"),
        "placements": doc.get("placements") or [],
        "featured": doc.get("package_code") != "neighbourhood_card",
        "link_type": doc.get("link_type"),
        "link_url": doc.get("link_url"),
        "link_label": doc.get("link_label") or "Visit",
        "media": media,
        "published_at": doc.get("published_at"),
        "live_until": doc.get("live_until"),
    }


def _status_view(doc: dict) -> dict:
    used = int(doc.get("resubmit_used") or 0)
    st = doc.get("status")
    token = doc.get("status_token") or ""
    can_renew = False
    if st in ("published", "archived", "paused") and doc.get("live_until"):
        try:
            left = datetime.fromisoformat(doc["live_until"]) - now_utc()
            can_renew = timedelta(days=-14) <= left <= timedelta(days=3)
        except ValueError:
            can_renew = False
    return {
        "id": doc["id"],
        "status": st,
        "status_token": token,
        "business_name": doc.get("business_name"),
        "contact_name": doc.get("contact_name"),
        "mobile": doc.get("mobile"),
        "email": doc.get("email") or "",
        "package_code": doc.get("package_code"),
        "package_name": doc.get("package_name"),
        "addons": doc.get("addons") or [],
        "amount_paise": doc.get("amount_paise"),
        "price_lines": doc.get("price_lines") or [],
        "headline": doc.get("headline"),
        "writeup": doc.get("writeup"),
        "category": doc.get("category"),
        "location_scope": doc.get("location_scope"),
        "tower_or_area": doc.get("tower_or_area"),
        "tower_id": doc.get("tower_id") or "",
        "flat_id": doc.get("flat_id") or "",
        "link_type": doc.get("link_type"),
        "link_url": doc.get("link_url"),
        "link_label": doc.get("link_label"),
        "media": [{**{k: m.get(k) for k in ("doc_id", "kind", "width", "height", "content_type", "bytes", "original_name")},
                   "url": _media_url(m, token)} for m in doc.get("media") or []],
        "payment_utr": doc.get("payment_utr") or "",
        "payment_proof_doc_id": doc.get("payment_proof_doc_id"),
        "payment_waived": bool(doc.get("payment_waived")),
        "subscriber_free": bool(doc.get("subscriber_free")),
        "review_notes": doc.get("review_notes") or "",
        "reject_reason": doc.get("reject_reason") or "",
        "refund_status": doc.get("refund_status") or "",
        "resubmit_used": used,
        "resubmits_allowed": 1,
        "can_resubmit": st in ("rejected", "changes_requested") and used < 1,
        "can_edit": st == "draft" or (st in ("rejected", "changes_requested") and used < 1),
        "can_renew": can_renew,
        "slug": doc.get("slug") if st == "published" else None,
        "published": st == "published",
        "click_count": int(doc.get("click_count") or 0),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
        "submitted_at": doc.get("submitted_at"),
        "published_at": doc.get("published_at"),
        "live_from": doc.get("live_from"),
        "live_until": doc.get("live_until"),
    }


async def _by_token(token: str) -> dict:
    doc = await db.business_ads.find_one({"status_token": token, "is_deleted": {"$ne": True}})
    if not doc:
        raise HTTPException(status_code=404, detail="Application not found.")
    return doc


async def _owned(ad_id: str, token: str) -> dict:
    token = (token or "").strip()
    doc = await db.business_ads.find_one({"id": ad_id, "status_token": token, "is_deleted": {"$ne": True}}) if token else None
    if not doc:
        raise HTTPException(status_code=404, detail="Application not found.")
    return doc


def _assert_editable(doc: dict, what: str):
    st = doc.get("status")
    if st not in EDITABLE:
        raise HTTPException(status_code=409, detail=f"{what} can only be changed before submit or during the one allowed resubmit.")
    if st in ("changes_requested", "rejected") and int(doc.get("resubmit_used") or 0) >= 1:
        raise HTTPException(status_code=409, detail="Only one resubmit is allowed on this application.")


async def _is_subscriber(scope: str, flat_id: str) -> bool:
    if scope != "inside_one_ten" or not flat_id:
        return False
    from routes_food import _flat_subscribed
    return await _flat_subscribed(flat_id)


def _clean_fields(body: dict, catalog: dict, subscriber: bool = False) -> dict:
    limits = catalog.get("copy_limits") or {}
    pkg = _pkg(catalog, (body.get("package_code") or "").strip())
    if not pkg:
        raise HTTPException(status_code=400, detail="Choose a valid advertising package.")

    business_name = (body.get("business_name") or "").strip()[: int(limits.get("business_name") or 80)]
    contact_name = (body.get("contact_name") or "").strip()[:80]
    mobile = re.sub(r"\D", "", body.get("mobile") or "")[-10:]
    if not business_name or not contact_name:
        raise HTTPException(status_code=400, detail="Business name and contact name are required.")
    if not valid_indian_mobile(mobile):
        raise HTTPException(status_code=400, detail="Enter a valid 10-digit Indian mobile number.")

    scope = (body.get("location_scope") or "").strip()
    if scope not in ("inside_one_ten", "outside_one_ten"):
        raise HTTPException(status_code=400, detail="Say whether the business is inside or outside One Ten.")

    link_type, link_url = _validate_link(body.get("link_type") or "none", body.get("link_url") or "")
    headline = (body.get("headline") or "").strip()[: int(limits.get("headline") or 120)]
    writeup = (body.get("writeup") or "").strip()[: int(limits.get("writeup") or 2000)]
    if not headline or not writeup:
        raise HTTPException(status_code=400, detail="Headline and write-up are required.")

    categories = catalog.get("categories") or []
    category = (body.get("category") or "").strip()
    if categories and category not in categories:
        raise HTTPException(status_code=400, detail="Choose a valid business category.")
    if category in ((catalog.get("rules") or {}).get("banned_categories") or []):
        raise HTTPException(status_code=400, detail="This category is not accepted.")

    addons = []
    for code in body.get("addons") or []:
        code = str(code).strip()
        if code and code not in addons:
            addons.append(code)
    amount, lines = _price(catalog, pkg, scope, addons, subscriber)

    return {
        "subscriber_free": _subscriber_free(pkg, scope, subscriber),
        "package_code": pkg["code"],
        "package_name": pkg["name"],
        "placements": list(pkg.get("placements") or []),
        "addons": addons,
        "amount_paise": amount,
        "price_lines": lines,
        "currency": "INR",
        "business_name": business_name,
        "contact_name": contact_name,
        "mobile": mobile,
        "email": (body.get("email") or "").strip().lower()[:120],
        "location_scope": scope,
        "tower_or_area": (body.get("tower_or_area") or "").strip()[:120],
        "tower_id": (body.get("tower_id") or "").strip()[:40] if scope == "inside_one_ten" else "",
        "flat_id": (body.get("flat_id") or "").strip()[:60] if scope == "inside_one_ten" else "",
        "category": category,
        "headline": headline,
        "writeup": writeup,
        "link_type": link_type,
        "link_url": link_url,
        "link_label": ((body.get("link_label") or "Visit").strip()[: int(limits.get("link_label") or 24)]) or "Visit",
    }, pkg


# ------------------------------------------------------------------ public catalog & placements
@router.get("/ads/packages")
async def ads_packages(request: Request, response: Response):
    response.headers["Cache-Control"] = NO_STORE
    catalog = await _catalog()
    enabled = await _flag_on()
    preview = not enabled and await _is_reviewer(request)
    return {**catalog, "enabled": enabled, "preview": preview, "apply_open": enabled or preview,
            "flag_off_message": FLAG_OFF_MESSAGE}


@router.get("/ads/directory")
async def ads_directory(request: Request, response: Response, category: str = "", scope: str = "", q: str = ""):
    response.headers["Cache-Control"] = NO_STORE
    if not await _public_visible(request):
        return {"items": [], "count": 0, "enabled": False, "message": FLAG_OFF_MESSAGE}
    extra: dict = {}
    if category:
        extra["category"] = category
    if scope in ("inside_one_ten", "outside_one_ten"):
        extra["location_scope"] = scope
    if q.strip():
        rx = {"$regex": re.escape(q.strip()[:60]), "$options": "i"}
        extra["$or"] = [{"business_name": rx}, {"headline": rx}, {"writeup": rx}]
    items = await db.business_ads.find(_live_query(**extra), {"_id": 0}).sort("published_at", -1).to_list(300)
    items.sort(key=lambda d: (d.get("package_code") == "neighbourhood_card", ))
    return {"items": [_public_card(i) for i in items], "count": len(items), "enabled": True}


@router.get("/ads/directory/{slug}")
async def ads_directory_detail(slug: str, request: Request, response: Response):
    response.headers["Cache-Control"] = NO_STORE
    if not await _public_visible(request):
        raise HTTPException(status_code=404, detail="Ad not found.")
    doc = await db.business_ads.find_one(_live_query(slug=slug), {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Ad not found.")
    return _public_card(doc)


@router.get("/ads/placements/home")
async def ads_home_placement(request: Request, response: Response):
    response.headers["Cache-Control"] = NO_STORE
    if not await _public_visible(request):
        return {"items": []}
    now = iso()
    items = await db.business_ads.find(_live_query(now, placements="home_strip"), {"_id": 0}).to_list(200)

    def rank(d):
        if "takeover" in (d.get("placements") or []):
            return 0
        if (d.get("pinned_until") or "") >= now:
            return 1
        return 2

    pinned = [d for d in items if rank(d) < 2]
    rest = [d for d in items if rank(d) == 2]
    pinned.sort(key=lambda d: (rank(d), d.get("published_at") or ""))
    secrets.SystemRandom().shuffle(rest)
    return {"items": [_public_card(i) for i in (pinned + rest)[:24]]}


@router.get("/ads/placements/sponsors")
async def ads_sponsors_placement(request: Request, response: Response):
    response.headers["Cache-Control"] = NO_STORE
    if not await _public_visible(request):
        return {"items": []}
    items = await db.business_ads.find(_live_query(placements="sponsors_rail"), {"_id": 0}).to_list(60)
    secrets.SystemRandom().shuffle(items)
    return {"items": [_public_card(i) for i in items[:24]]}


@router.post("/ads/{ad_id}/click")
async def track_ad_click(ad_id: str, body: dict = Body(default={})):
    body = body or {}
    surface = re.sub(r"[^a-z0-9_]", "", str(body.get("placement") or body.get("surface") or "unknown").lower())[:40] or "unknown"
    res = await db.business_ads.update_one(
        _live_query(id=ad_id),
        {"$inc": {"click_count": 1, f"clicks_by_surface.{surface}": 1}},
    )
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Ad not found.")
    return {"ok": True}


# ------------------------------------------------------------------ application lifecycle
@router.post("/ads/applications")
async def create_ad_application(request: Request, body: dict = Body(...)):
    await _require_open(request)
    catalog = await _catalog()
    if not body.get("terms_accepted"):
        raise HTTPException(status_code=400, detail="Please accept the advertising terms.")
    fields, pkg = _clean_fields(body, catalog, await _is_subscriber(
        (body.get("location_scope") or "").strip(), (body.get("flat_id") or "").strip()))

    if (catalog.get("rules") or {}).get("one_active_submission", True):
        stale = iso(now_utc() - timedelta(hours=STALE_DRAFT_HOURS))
        clash = await db.business_ads.find_one({
            "mobile": fields["mobile"], "is_deleted": {"$ne": True},
            "$or": [{"status": {"$in": [s for s in OPEN_FOR_MOBILE if s != "draft"]}},
                    {"status": "draft", "updated_at": {"$gte": stale}}],
        })
        if clash:
            raise HTTPException(status_code=409, detail="An application from this mobile is already open. "
                                                        "Use the status link you saved, or contact the committee.")
    await _check_inventory(catalog, pkg, fields["addons"], fields["category"])
    await _rate_limit(request, catalog)

    ad_id = new_id("ad")
    status_token = secrets.token_urlsafe(24)
    doc = {
        "id": ad_id,
        "cycle_id": await get_active_cycle_id(),
        "status": "draft",
        "status_token": status_token,
        **fields,
        "media": [],
        "payment_utr": "",
        "payment_proof_doc_id": None,
        "payment_verified": False,
        "terms_accepted": True,
        "terms_accepted_at": iso(),
        "review_notes": "",
        "reviewed_by": None,
        "reviewed_at": None,
        "resubmit_used": 0,
        "click_count": 0,
        "clicks_by_surface": {},
        "renewal_of": (body.get("renewal_of") or "").strip()[:40],
        "submitted_at": None,
        "published_at": None,
        "live_from": None,
        "live_until": None,
        "is_deleted": False,
        "created_at": iso(),
        "updated_at": iso(),
    }
    await db.business_ads.insert_one(dict(doc))
    await audit("ads.application.create", entity_type="business_ad", entity_id=ad_id,
                after={"package": pkg["code"], "business": fields["business_name"], "amount_paise": fields["amount_paise"]},
                request=request)
    return {"id": ad_id, "status_token": status_token, "status": "draft",
            "amount_paise": fields["amount_paise"], "price_lines": fields["price_lines"],
            "package_name": pkg["name"],
            "message": "Application created. Upload creative + payment proof, then submit."}


@router.put("/ads/applications/{ad_id}")
async def update_ad_application(ad_id: str, request: Request, body: dict = Body(...)):
    token = body.get("status_token") or request.headers.get("x-status-token") or ""
    doc = await _owned(ad_id, token)
    _assert_editable(doc, "Details")
    catalog = await _catalog()
    fields, pkg = _clean_fields(body, catalog, await _is_subscriber(
        (body.get("location_scope") or "").strip(), (body.get("flat_id") or "").strip()))
    await _check_inventory(catalog, pkg, fields["addons"], fields["category"], exclude_id=ad_id)
    allowed = set(pkg.get("required_media") or []) | set(pkg.get("optional_media") or [])
    media = [m for m in doc.get("media") or [] if m.get("kind") in allowed]
    amount_changed = int(fields["amount_paise"]) != int(doc.get("amount_paise") or 0)
    update = {**fields, "media": media, "updated_at": iso()}
    if amount_changed and doc.get("payment_proof_doc_id"):
        update["payment_amount_mismatch"] = int(fields["amount_paise"]) > int(doc.get("payment_amount_paise") or 0)
    await db.business_ads.update_one({"id": ad_id}, {"$set": update})
    await audit("ads.application.update", entity_type="business_ad", entity_id=ad_id,
                after={"package": pkg["code"], "amount_paise": fields["amount_paise"]}, request=request)
    fresh = await db.business_ads.find_one({"id": ad_id})
    return {**_status_view(clean(fresh)), "amount_changed": amount_changed,
            "message": "Details updated. Upload creative + payment proof if needed, then submit."}


async def _quote(package_code: str, location_scope: str, addons: str, flat_id: str = "") -> tuple[int, list[dict], bool]:
    catalog = await _catalog()
    pkg = _pkg(catalog, package_code.strip())
    if not pkg or location_scope not in ("inside_one_ten", "outside_one_ten"):
        raise HTTPException(status_code=400, detail="Choose a package and where the business is.")
    codes = [c.strip() for c in addons.split(",") if c.strip()]
    subscriber = await _is_subscriber(location_scope, flat_id.strip())
    amount, lines = _price(catalog, pkg, location_scope, codes, subscriber)
    return amount, lines, subscriber


@router.get("/ads/quote")
async def ad_quote(response: Response, package_code: str = "", location_scope: str = "inside_one_ten", addons: str = "",
                   flat_id: str = ""):
    """Price + UPI details before an application exists, so the one-page form can show the QR up front."""
    from routes_collect import _upi_payload
    response.headers["Cache-Control"] = NO_STORE
    amount, lines, subscriber = await _quote(package_code, location_scope, addons, flat_id)
    payload = _upi_payload(await get_settings(), amount, note="One10 promotion")
    qr_url = None
    if payload.get("qr_data"):
        from urllib.parse import urlencode
        qr_url = "/api/ads/quote/qr.png?" + urlencode(
            {"package_code": package_code, "location_scope": location_scope, "addons": addons, "flat_id": flat_id})
    return {"amount_paise": amount, "price_lines": lines, "payment": payload, "qr_url": qr_url,
            "subscriber": subscriber, "payment_required": amount > 0}


@router.get("/ads/quote/qr.png")
async def ad_quote_qr(package_code: str = "", location_scope: str = "inside_one_ten", addons: str = "", flat_id: str = ""):
    from docs import qr_png
    from routes_collect import _upi_payload
    amount, _, _ = await _quote(package_code, location_scope, addons, flat_id)
    payload = _upi_payload(await get_settings(), amount, note="One10 promotion")
    if not payload.get("qr_data"):
        raise HTTPException(status_code=404, detail="Dynamic UPI QR not configured.")
    return Response(content=qr_png(payload["qr_data"], box=6), media_type="image/png",
                    headers={"Cache-Control": "no-store"})


@router.get("/ads/applications/{ad_id}/payment")
async def ad_payment_info(ad_id: str, token: str = ""):
    from routes_collect import _upi_payload
    doc = await _owned(ad_id, token)
    settings = await get_settings()
    payload = _upi_payload(settings, int(doc.get("amount_paise") or 0), note=f"AD {doc['id'][-10:]}")
    qr_url = f"/api/ads/applications/{ad_id}/qr.png?token={doc['status_token']}" if payload.get("qr_data") else None
    return {"amount_paise": doc.get("amount_paise"), "price_lines": doc.get("price_lines") or [],
            "payment": payload, "qr_url": qr_url}


@router.get("/ads/applications/{ad_id}/qr.png")
async def ad_payment_qr(ad_id: str, token: str = ""):
    from docs import qr_png
    from routes_collect import _upi_payload
    doc = await _owned(ad_id, token)
    settings = await get_settings()
    payload = _upi_payload(settings, int(doc.get("amount_paise") or 0), note=f"AD {doc['id'][-10:]}")
    if not payload.get("qr_data"):
        raise HTTPException(status_code=404, detail="Dynamic UPI QR not configured.")
    return Response(content=qr_png(payload["qr_data"], box=6), media_type="image/png")


@router.post("/ads/applications/{ad_id}/media")
async def upload_ad_media(
    ad_id: str,
    request: Request,
    status_token: str = Form(...),
    kind: str = Form(...),
    file: UploadFile = File(...),
):
    doc = await _owned(ad_id, status_token)
    _assert_editable(doc, "Creative")
    catalog = await _catalog()
    pkg = _pkg(catalog, doc.get("package_code")) or {}
    kind = (kind or "").strip().lower()
    specs = catalog.get("creative_specs") or {}
    allowed = set(pkg.get("required_media") or []) | set(pkg.get("optional_media") or [])
    if kind not in specs or kind not in allowed:
        raise HTTPException(status_code=400, detail=f"{pkg.get('name', 'This package')} does not take a '{kind}' upload.")
    spec = specs[kind]

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file.")
    filename = (file.filename or f"{kind}.bin")[-120:]
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in (spec.get("formats") or []):
        raise HTTPException(status_code=400, detail=f"{spec['label']} must be {'/'.join(f.upper() for f in spec['formats'])}.")
    max_bytes = int(spec.get("max_mb") or 5) * 1024 * 1024
    if len(data) > max_bytes:
        raise HTTPException(status_code=400, detail=f"{spec['label']} must be under {spec['max_mb']} MB.")

    width = height = None
    duration = None
    if kind == "video":
        if ext not in VIDEO_EXT:
            raise HTTPException(status_code=400, detail="Upload an MP4, WebM, or MOV video file.")
        duration = _video_seconds(data, ext)
        max_s = float(spec.get("max_seconds") or 30)
        if duration is not None and duration > max_s + 0.5:
            raise HTTPException(status_code=400, detail=f"Video must be {int(max_s)} seconds or shorter (yours is {duration:.0f}s).")
    else:
        from PIL import Image
        try:
            with Image.open(io.BytesIO(data)) as img:
                width, height = img.size
                fmt = (img.format or "").lower()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"{spec['label']} is not a readable image.") from e
        if fmt not in ("jpeg", "png", "webp") or (fmt == "jpeg" and ext not in ("jpg", "jpeg")) or (fmt != "jpeg" and fmt != ext):
            raise HTTPException(status_code=400, detail=f"{spec['label']} file content does not match its .{ext} extension.")
        err = dimension_error(spec, width, height, float(catalog.get("dimension_tolerance") or 0.02))
        if err:
            raise HTTPException(status_code=400, detail=err)

    try:
        saved = await save_document(data=data, filename=f"{kind}-{filename}", doc_type="business_ad_media",
                                    linked_type="business_ad", linked_id=ad_id, uploaded_by="advertiser",
                                    content_type=file.content_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    entry = {"doc_id": saved["id"], "kind": kind, "width": width, "height": height,
             "duration_s": duration, "content_type": saved.get("content_type"),
             "bytes": len(data), "original_name": filename, "uploaded_at": iso()}
    media = [m for m in doc.get("media") or [] if m.get("kind") != kind] + [entry]
    await db.business_ads.update_one({"id": ad_id}, {"$set": {"media": media, "updated_at": iso()}})
    await audit("ads.application.media", entity_type="business_ad", entity_id=ad_id,
                after={"kind": kind, "doc_id": saved["id"], "bytes": len(data)}, request=request)
    return {"ok": True, "uploaded": entry, "media": media}


@router.post("/ads/applications/{ad_id}/payment-proof")
async def upload_payment_proof(
    ad_id: str,
    request: Request,
    status_token: str = Form(...),
    utr: str = Form(...),
    screenshot: UploadFile = File(...),
):
    doc = await _owned(ad_id, status_token)
    _assert_editable(doc, "Payment proof")
    utr_clean = re.sub(r"\s+", "", utr or "")[:40]
    if len(utr_clean) < 6:
        raise HTTPException(status_code=400, detail="Enter a valid UTR / UPI reference (at least 6 characters).")
    data = await screenshot.read()
    if not data:
        raise HTTPException(status_code=400, detail="Payment screenshot is required.")
    filename = screenshot.filename or "payment-proof.jpg"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in PROOF_EXT:
        raise HTTPException(status_code=400, detail="Payment proof must be an image or PDF.")
    try:
        saved = await save_document(data=data, filename=filename, doc_type="business_ad_payment",
                                    linked_type="business_ad", linked_id=ad_id, uploaded_by="advertiser",
                                    content_type=screenshot.content_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    await db.business_ads.update_one({"id": ad_id}, {"$set": {
        "payment_utr": utr_clean, "payment_proof_doc_id": saved["id"], "payment_verified": False,
        "payment_amount_paise": int(doc.get("amount_paise") or 0), "payment_amount_mismatch": False,
        "updated_at": iso(),
    }})
    await audit("ads.application.payment_proof", entity_type="business_ad", entity_id=ad_id,
                after={"utr": utr_clean, "doc_id": saved["id"]}, request=request)
    return {"ok": True, "payment_utr": utr_clean, "payment_proof_doc_id": saved["id"]}


@router.post("/ads/applications/{ad_id}/submit")
async def submit_ad_application(ad_id: str, request: Request, body: dict = Body(...)):
    await _require_open(request)
    doc = await _owned(ad_id, body.get("status_token") or "")
    _assert_editable(doc, "Application")
    catalog = await _catalog()
    pkg = _pkg(catalog, doc.get("package_code"))
    if not pkg:
        raise HTTPException(status_code=400, detail="This package is no longer offered. Edit the application and pick another.")
    have = {m.get("kind") for m in doc.get("media") or []}
    missing = [k for k in pkg.get("required_media") or [] if k not in have]
    if missing:
        labels = [((catalog.get("creative_specs") or {}).get(k) or {}).get("label", k) for k in missing]
        raise HTTPException(status_code=400, detail=f"Upload the required creative first: {', '.join(labels)}.")
    if doc.get("subscriber_free") and not await _is_subscriber(doc.get("location_scope") or "", doc.get("flat_id") or ""):
        raise HTTPException(status_code=400, detail="This flat no longer shows a paid subscription. Edit the application to see the price.")
    waiver_by = None
    payment_due = int(doc.get("amount_paise") or 0) > 0
    if payment_due and body.get("waive_payment"):
        waiver_by = await _waiver_actor(request)
        if not waiver_by:
            raise HTTPException(status_code=403, detail="Payment waiver is not available for this account.")
    elif payment_due:
        if len(doc.get("payment_utr") or "") < 6 or not doc.get("payment_proof_doc_id"):
            raise HTTPException(status_code=400, detail="Upload UPI payment UTR and screenshot before submitting.")
        if doc.get("payment_amount_mismatch"):
            raise HTTPException(status_code=400, detail="The amount changed after you paid. Pay the difference and upload that UTR and screenshot.")
    await _check_inventory(catalog, pkg, doc.get("addons") or [], doc.get("category") or "", exclude_id=ad_id)

    was_resubmit = doc.get("status") in ("changes_requested", "rejected")
    update = {"status": "submitted", "submitted_at": iso(), "updated_at": iso(), "payment_waived": bool(waiver_by),
              "payment_waived_by": (waiver_by.get("name") or waiver_by.get("user_id")) if waiver_by else None}
    if was_resubmit:
        update["resubmit_used"] = int(doc.get("resubmit_used") or 0) + 1
        update["refund_status"] = ""
    await db.business_ads.update_one({"id": ad_id}, {"$set": update})
    await audit("ads.application.submit", actor=waiver_by, entity_type="business_ad", entity_id=ad_id,
                after={"resubmit": was_resubmit, "payment_waived": bool(waiver_by),
                       "subscriber_free": bool(doc.get("subscriber_free"))}, request=request)
    return {"ok": True, "status": "submitted", "status_token": doc["status_token"],
            "message": "Submitted for committee review. Please do not pay again."}


@router.get("/ads/payment-waiver")
async def ads_payment_waiver(request: Request, response: Response):
    response.headers["Cache-Control"] = NO_STORE
    return {"allowed": bool(await _waiver_actor(request))}


@router.get("/ads/status/{token}")
async def ad_status(token: str, response: Response):
    response.headers["Cache-Control"] = NO_STORE
    return _status_view(clean(await _by_token(token)))


@router.get("/ads/media/{doc_id}")
async def public_ad_media(doc_id: str, token: str = ""):
    """Creative for live ads is public; drafts and payment proofs need the applicant's status token."""
    rec = await db.documents.find_one({"id": doc_id, "linked_type": "business_ad", "is_deleted": {"$ne": True}})
    if not rec:
        raise HTTPException(status_code=404, detail="Media not found.")
    ad = await db.business_ads.find_one({"id": rec.get("linked_id"), "is_deleted": {"$ne": True}})
    if not ad:
        raise HTTPException(status_code=404, detail="Media not found.")
    owner = bool(token) and secrets.compare_digest(token, ad.get("status_token") or "")
    in_use = any(m.get("doc_id") == doc_id for m in ad.get("media") or [])
    public = rec.get("doc_type") == "business_ad_media" and in_use and ad.get("status") == "published"
    if not (public or owner):
        raise HTTPException(status_code=403, detail="Media not available.")
    data, ctype = get_object(rec["storage_path"])
    headers = {"Cache-Control": "public, max-age=86400" if public else "private, no-store"}
    return Response(content=data, media_type=rec.get("content_type") or ctype, headers=headers)


# ------------------------------------------------------------------ admin
REVIEW_PERMS = ("ads:review", "ops:manage")


@router.get("/ads/admin/queue")
async def admin_ads_queue(status: str = "", user: dict = Depends(require(*REVIEW_PERMS))):
    query: dict = {"is_deleted": {"$ne": True}}
    if status == "all":
        pass
    elif status:
        query["status"] = status
    else:
        query["status"] = {"$in": list(IN_PIPELINE)}
    items = await db.business_ads.find(query, {"_id": 0, "status_token": 0}).sort("updated_at", -1).to_list(500)
    counts = {}
    async for row in db.business_ads.aggregate([{"$match": {"is_deleted": {"$ne": True}}},
                                                {"$group": {"_id": "$status", "n": {"$sum": 1}}}]):
        counts[row["_id"]] = row["n"]
    published_paise = sum(int(d.get("amount_paise") or 0) for d in
                          await db.business_ads.find({"is_deleted": {"$ne": True}, "journal_id": {"$nin": [None, ""]}},
                                                     {"amount_paise": 1}).to_list(1000))
    return {"items": items, "count": len(items), "counts": counts, "enabled": await _flag_on(),
            "recognised_paise": published_paise}


@router.get("/ads/admin/media/{doc_id}")
async def admin_ad_media(doc_id: str, user: dict = Depends(require(*REVIEW_PERMS))):
    rec = await db.documents.find_one({"id": doc_id, "linked_type": "business_ad", "is_deleted": {"$ne": True}})
    if not rec:
        raise HTTPException(status_code=404, detail="Media not found.")
    data, ctype = get_object(rec["storage_path"])
    return Response(content=data, media_type=rec.get("content_type") or ctype,
                    headers={"Cache-Control": "private, no-store"})


@router.get("/ads/admin/{ad_id}")
async def admin_ad_detail(ad_id: str, user: dict = Depends(require(*REVIEW_PERMS))):
    doc = await db.business_ads.find_one({"id": ad_id, "is_deleted": {"$ne": True}}, {"_id": 0, "status_token": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found.")
    catalog = await _catalog()
    pkg = _pkg(catalog, doc.get("package_code")) or {}
    have = {m.get("kind") for m in doc.get("media") or []}
    doc["missing_media"] = [k for k in pkg.get("required_media") or [] if k not in have]
    for m in doc.get("media") or []:
        m["url"] = f"/api/ads/admin/media/{m['doc_id']}"
    if doc.get("payment_proof_doc_id"):
        doc["payment_proof_url"] = f"/api/ads/admin/media/{doc['payment_proof_doc_id']}"
    doc["utr_seen_elsewhere"] = await db.business_ads.count_documents({
        "id": {"$ne": ad_id}, "payment_utr": doc.get("payment_utr") or "__none__", "is_deleted": {"$ne": True}})
    doc["history"] = await db.audit_events.find(
        {"entity_type": "business_ad", "entity_id": ad_id},
        {"_id": 0, "action": 1, "created_at": 1, "actor_id": 1, "actor_role": 1, "after": 1},
    ).sort("seq", 1).to_list(100)
    return doc


@router.post("/ads/admin/{ad_id}/review")
async def admin_review_ad(ad_id: str, request: Request, body: dict = Body(...),
                          user: dict = Depends(require(*REVIEW_PERMS))):
    action = (body.get("action") or "").strip().lower()
    notes = (body.get("notes") or "").strip()[:1000]
    doc = await db.business_ads.find_one({"id": ad_id, "is_deleted": {"$ne": True}})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found.")
    status = doc.get("status")
    catalog = await _catalog()
    update = {"updated_at": iso(), "reviewed_by": user.get("name") or user.get("user_id"), "reviewed_at": iso()}
    if notes:
        update["review_notes"] = notes

    if action == "start_review":
        if status != "submitted":
            raise HTTPException(status_code=409, detail="Only submitted ads can enter review.")
        update["status"] = "in_review"

    elif action == "approve_publish":
        if "ads:publish" not in user_permissions(user):
            raise HTTPException(status_code=403, detail="Publishing needs the ads:publish permission (convenor / treasurer / admin).")
        if status not in IN_PIPELINE:
            raise HTTPException(status_code=409, detail="Only submitted or in-review ads can be published.")
        waived = bool(doc.get("payment_waived"))
        if not waived and int(doc.get("amount_paise") or 0) > 0 and not body.get("payment_verified"):
            raise HTTPException(status_code=400, detail="Confirm the UTR/amount was found in the bank statement before publishing.")
        pkg = _pkg(catalog, doc.get("package_code"))
        if not pkg:
            raise HTTPException(status_code=400, detail="Package no longer exists in the catalogue.")
        have = {m.get("kind") for m in doc.get("media") or []}
        if any(k not in have for k in pkg.get("required_media") or []):
            raise HTTPException(status_code=400, detail="Required creative is missing; request changes instead.")
        await _check_inventory(catalog, pkg, doc.get("addons") or [], doc.get("category") or "", exclude_id=ad_id)

        now = now_utc()
        if body.get("live_until"):
            try:
                live_until = _end_of_day_ist(str(body["live_until"])[:10])
            except ValueError as e:
                raise HTTPException(status_code=400, detail="live_until must be YYYY-MM-DD.") from e
        else:
            live_until = _end_of_day_ist(catalog.get("window_end") or to_ist(now).strftime("%Y-%m-%d"))
            if "extend_30d" in (doc.get("addons") or []):
                live_until += timedelta(days=30)
        if live_until <= now:
            raise HTTPException(status_code=400, detail="The live-until date is already past; set a later date.")

        journal_id = doc.get("journal_id")
        if not journal_id and not waived and int(doc.get("amount_paise") or 0) > 0:
            try:
                jv = await post_journal(
                    source_type="business_ad", source_id=ad_id,
                    narration=f"Local business ad — {doc.get('business_name')} ({doc.get('package_name')}) UTR {doc.get('payment_utr')}",
                    lines=[{"account_code": BANK_ACCOUNT, "debit": int(doc["amount_paise"])},
                           {"account_code": INCOME_ACCOUNT, "credit": int(doc["amount_paise"])}],
                    actor=user, date=iso(now),
                )
            except LedgerError as e:
                raise HTTPException(status_code=409, detail=f"Could not post the income journal: {e}") from e
            journal_id = jv.get("id") if isinstance(jv, dict) else jv

        update.update({
            "status": "published",
            "slug": await _unique_slug(doc.get("business_name") or "business", ad_id),
            "payment_verified": not waived and int(doc.get("amount_paise") or 0) > 0,
            "payment_verified_by": None if waived or not int(doc.get("amount_paise") or 0) else (user.get("name") or user.get("user_id")),
            "published_at": doc.get("published_at") or iso(now),
            "live_from": iso(now),
            "live_until": iso(live_until),
            "journal_id": journal_id,
            "refund_status": "",
        })
        if "pin_home_3d" in (doc.get("addons") or []):
            update["pinned_until"] = iso(now + timedelta(days=3))

    elif action == "request_changes":
        if status not in IN_PIPELINE:
            raise HTTPException(status_code=409, detail="Cannot request changes from this status.")
        if not notes:
            raise HTTPException(status_code=400, detail="Explain what needs to change.")
        update["status"] = "changes_requested"

    elif action == "reject":
        if status not in (*IN_PIPELINE, "changes_requested"):
            raise HTTPException(status_code=409, detail="Cannot reject from this status.")
        reason = (body.get("reason") or "").strip()
        codes = {r["code"] for r in catalog.get("reject_reasons") or []}
        if reason not in codes:
            raise HTTPException(status_code=400, detail="Pick a rejection reason.")
        if reason == "other" and not notes:
            raise HTTPException(status_code=400, detail="Add a note explaining the rejection.")
        update["status"] = "rejected"
        update["reject_reason"] = reason
        paid = bool(doc.get("payment_proof_doc_id"))
        update["refund_status"] = "eligible" if paid and int(doc.get("resubmit_used") or 0) == 0 else "not_eligible"

    elif action == "mark_refunded":
        if status not in ("rejected", "archived") or doc.get("refund_status") != "eligible":
            raise HTTPException(status_code=409, detail="Only rejected ads marked refund-eligible can be refunded.")
        if not notes:
            raise HTTPException(status_code=400, detail="Add the refund reference (UTR / date).")
        update["refund_status"] = "refunded"
        update["refund_ref"] = notes

    elif action == "pause":
        if status != "published":
            raise HTTPException(status_code=409, detail="Only live ads can be paused.")
        update["status"] = "paused"

    elif action == "resume":
        if status != "paused":
            raise HTTPException(status_code=409, detail="Only paused ads can be resumed.")
        update["status"] = "published"

    elif action == "archive":
        if status not in ("draft", "published", "paused", "rejected", "changes_requested"):
            raise HTTPException(status_code=409, detail="Cannot archive from this status.")
        update["status"] = "archived"

    else:
        raise HTTPException(status_code=400, detail="Unknown review action.")

    await db.business_ads.update_one({"id": ad_id}, {"$set": update})
    await audit(f"ads.{action}", actor=user, entity_type="business_ad", entity_id=ad_id,
                before={"status": status},
                after={"status": update.get("status", status), "notes": notes[:200],
                       "reason": update.get("reject_reason"), "journal_id": update.get("journal_id")},
                request=request)
    return {"ok": True, "ad": await admin_ad_detail(ad_id, user)}
