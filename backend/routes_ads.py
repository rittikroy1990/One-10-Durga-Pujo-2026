"""Local business advertising — paid apply → committee review → publish."""
from __future__ import annotations

import re
import secrets
from urllib.parse import urlparse

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response

from audit import audit
from auth import require
from config import get_active_cycle_id, get_settings
from db import clean, db, new_id
from storage import VIDEO_EXT, get_object, save_document
from util import iso, valid_indian_mobile

router = APIRouter(prefix="/api")


def _slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return (s[:48] or "business")


async def _unique_slug(base: str) -> str:
    root = _slugify(base)
    slug = root
    n = 0
    while await db.business_ads.find_one({"slug": slug, "is_deleted": {"$ne": True}}):
        n += 1
        slug = f"{root}-{n}"
    return slug


async def _catalog() -> dict:
    s = await get_settings()
    return s.get("local_business_ads") or {}


def _pkg(catalog: dict, code: str) -> dict | None:
    for row in catalog.get("packages") or []:
        if row.get("code") == code:
            return row
    return None


def _validate_link(link_type: str, link_url: str) -> tuple[str, str]:
    link_type = (link_type or "none").strip().lower()
    link_url = (link_url or "").strip()
    if link_type in ("", "none"):
        return "none", ""
    if link_type == "internal":
        if not link_url.startswith("/"):
            raise HTTPException(status_code=400, detail="Internal link must start with /")
        return "internal", link_url
    if link_type == "external":
        parsed = urlparse(link_url)
        if parsed.scheme != "https" or not parsed.netloc:
            raise HTTPException(status_code=400, detail="External links must use https://")
        return "external", link_url
    raise HTTPException(status_code=400, detail="Invalid link type")


def _public_card(doc: dict) -> dict:
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
        "link_type": doc.get("link_type"),
        "link_url": doc.get("link_url"),
        "link_label": doc.get("link_label") or "Visit",
        "media": doc.get("media") or [],
        "published_at": doc.get("published_at"),
    }


def _status_view(doc: dict) -> dict:
    used = int(doc.get("resubmit_used") or 0)
    st = doc.get("status")
    return {
        "id": doc["id"],
        "status": st,
        "status_token": doc.get("status_token"),
        "business_name": doc.get("business_name"),
        "package_code": doc.get("package_code"),
        "package_name": doc.get("package_name"),
        "amount_paise": doc.get("amount_paise"),
        "headline": doc.get("headline"),
        "writeup": doc.get("writeup"),
        "category": doc.get("category"),
        "location_scope": doc.get("location_scope"),
        "tower_or_area": doc.get("tower_or_area"),
        "link_type": doc.get("link_type"),
        "link_url": doc.get("link_url"),
        "link_label": doc.get("link_label"),
        "media": doc.get("media") or [],
        "payment_utr": doc.get("payment_utr") or "",
        "payment_proof_doc_id": doc.get("payment_proof_doc_id"),
        "review_notes": doc.get("review_notes") or "",
        "resubmit_used": used,
        "resubmits_allowed": 1,
        "can_resubmit": st in ("rejected", "changes_requested") and used < 1,
        "slug": doc.get("slug"),
        "published": st == "published",
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
        "submitted_at": doc.get("submitted_at"),
        "published_at": doc.get("published_at"),
    }


async def _by_token(token: str) -> dict:
    doc = await db.business_ads.find_one({"status_token": token, "is_deleted": {"$ne": True}})
    if not doc:
        raise HTTPException(status_code=404, detail="Application not found.")
    return doc


@router.get("/ads/packages")
async def ads_packages():
    return await _catalog()


@router.get("/ads/directory")
async def ads_directory(category: str = "", scope: str = "", q: str = ""):
    query: dict = {"status": "published", "is_deleted": {"$ne": True}}
    if category:
        query["category"] = category
    if scope in ("inside_one_ten", "outside_one_ten"):
        query["location_scope"] = scope
    if q.strip():
        rx = {"$regex": q.strip(), "$options": "i"}
        query["$or"] = [{"business_name": rx}, {"headline": rx}, {"writeup": rx}]
    items = await db.business_ads.find(query, {"_id": 0}).sort("published_at", -1).to_list(200)
    return {"items": [_public_card(i) for i in items], "count": len(items)}


@router.get("/ads/directory/{slug}")
async def ads_directory_detail(slug: str):
    doc = await db.business_ads.find_one(
        {"slug": slug, "status": "published", "is_deleted": {"$ne": True}}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Ad not found.")
    return _public_card(doc)


@router.get("/ads/placements/home")
async def ads_home_placement():
    items = await db.business_ads.find(
        {"status": "published", "is_deleted": {"$ne": True}, "placements": "home_strip"},
        {"_id": 0},
    ).sort("published_at", -1).to_list(24)
    return {"items": [_public_card(i) for i in items]}


@router.post("/ads/applications")
async def create_ad_application(body: dict = Body(...), request: Request = None):
    catalog = await _catalog()
    pkg = _pkg(catalog, (body.get("package_code") or "").strip())
    if not pkg:
        raise HTTPException(status_code=400, detail="Choose a valid advertising package.")

    business_name = (body.get("business_name") or "").strip()
    contact_name = (body.get("contact_name") or "").strip()
    mobile = (body.get("mobile") or "").strip()
    if not business_name or not contact_name:
        raise HTTPException(status_code=400, detail="Business name and contact name are required.")
    if not valid_indian_mobile(mobile):
        raise HTTPException(status_code=400, detail="Enter a valid 10-digit Indian mobile number.")

    location_scope = (body.get("location_scope") or "").strip()
    if location_scope not in ("inside_one_ten", "outside_one_ten"):
        raise HTTPException(status_code=400, detail="Say whether the business is inside or outside One Ten.")

    link_type, link_url = _validate_link(body.get("link_type") or "none", body.get("link_url") or "")
    headline = (body.get("headline") or "").strip()[:120]
    writeup = (body.get("writeup") or "").strip()[:2000]
    if not headline or not writeup:
        raise HTTPException(status_code=400, detail="Headline and write-up are required.")

    categories = catalog.get("categories") or []
    category = (body.get("category") or "").strip()
    if categories and category not in categories:
        raise HTTPException(status_code=400, detail="Choose a valid business category.")
    if not body.get("terms_accepted"):
        raise HTTPException(status_code=400, detail="Please accept the advertising terms.")

    ad_id = new_id("ad")
    status_token = secrets.token_urlsafe(24)
    slug = await _unique_slug(business_name)
    doc = {
        "id": ad_id,
        "cycle_id": await get_active_cycle_id(),
        "status": "draft",
        "status_token": status_token,
        "slug": slug,
        "package_code": pkg["code"],
        "package_name": pkg["name"],
        "amount_paise": int(pkg["amount_paise"]),
        "placements": list(pkg.get("placements") or []),
        "business_name": business_name,
        "contact_name": contact_name,
        "mobile": mobile,
        "email": (body.get("email") or "").strip().lower(),
        "location_scope": location_scope,
        "tower_or_area": (body.get("tower_or_area") or "").strip()[:120],
        "category": category,
        "headline": headline,
        "writeup": writeup,
        "link_type": link_type,
        "link_url": link_url,
        "link_label": (body.get("link_label") or "Visit").strip()[:40] or "Visit",
        "media": [],
        "payment_utr": "",
        "payment_proof_doc_id": None,
        "payment_verified": False,
        "review_notes": "",
        "reviewed_by": None,
        "resubmit_used": 0,
        "created_at": iso(),
        "updated_at": iso(),
        "submitted_at": None,
        "published_at": None,
        "is_deleted": False,
    }
    await db.business_ads.insert_one(dict(doc))
    await audit(
        "ads.application.create",
        entity_type="business_ad",
        entity_id=ad_id,
        after={"package": pkg["code"], "business": business_name},
        request=request,
    )
    return {
        "id": ad_id,
        "status_token": status_token,
        "status": "draft",
        "amount_paise": doc["amount_paise"],
        "package_name": doc["package_name"],
        "slug": slug,
        "message": "Application created. Upload creative + payment proof, then submit.",
    }


@router.post("/ads/applications/{ad_id}/media")
async def upload_ad_media(
    ad_id: str,
    status_token: str = Form(...),
    file: UploadFile = File(...),
    kind: str = Form("image"),
):
    doc = await db.business_ads.find_one({"id": ad_id, "status_token": status_token, "is_deleted": {"$ne": True}})
    if not doc:
        raise HTTPException(status_code=404, detail="Application not found.")
    if doc.get("status") not in ("draft", "changes_requested", "rejected"):
        raise HTTPException(status_code=409, detail="Media can only be uploaded before submit or during the one allowed resubmit.")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file.")
    filename = file.filename or "creative.bin"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    try:
        saved = await save_document(
            data=data,
            filename=filename,
            doc_type="business_ad_media",
            linked_type="business_ad",
            linked_id=ad_id,
            uploaded_by="advertiser",
            content_type=file.content_type,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    media_kind = "video" if ext in VIDEO_EXT else "image"
    if kind == "video" and media_kind != "video":
        raise HTTPException(status_code=400, detail="Upload an MP4, WebM, or MOV video file.")

    media = list(doc.get("media") or [])
    entry = {
        "doc_id": saved["id"],
        "kind": media_kind,
        "filename": filename,
        "content_type": saved.get("content_type"),
        "size": saved.get("size"),
        "uploaded_at": iso(),
    }
    if media_kind == "video":
        media = [m for m in media if m.get("kind") != "video"] + [entry]
    else:
        images = [m for m in media if m.get("kind") != "video"]
        if len(images) >= 5:
            raise HTTPException(status_code=400, detail="Maximum 5 images per advertisement.")
        media.append(entry)

    await db.business_ads.update_one({"id": ad_id}, {"$set": {"media": media, "updated_at": iso()}})
    return {"ok": True, "media": media, "uploaded": entry}


@router.post("/ads/applications/{ad_id}/payment-proof")
async def upload_payment_proof(
    ad_id: str,
    status_token: str = Form(...),
    utr: str = Form(...),
    screenshot: UploadFile = File(...),
):
    doc = await db.business_ads.find_one({"id": ad_id, "status_token": status_token, "is_deleted": {"$ne": True}})
    if not doc:
        raise HTTPException(status_code=404, detail="Application not found.")
    if doc.get("status") not in ("draft", "changes_requested", "rejected"):
        raise HTTPException(status_code=409, detail="Payment proof cannot be changed in the current status.")

    utr_clean = re.sub(r"\s+", "", utr or "")
    if len(utr_clean) < 6:
        raise HTTPException(status_code=400, detail="Enter a valid UTR / UPI reference.")
    data = await screenshot.read()
    if not data:
        raise HTTPException(status_code=400, detail="Payment screenshot is required.")
    try:
        saved = await save_document(
            data=data,
            filename=screenshot.filename or "payment-proof.jpg",
            doc_type="business_ad_payment",
            linked_type="business_ad",
            linked_id=ad_id,
            uploaded_by="advertiser",
            content_type=screenshot.content_type,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    await db.business_ads.update_one(
        {"id": ad_id},
        {"$set": {
            "payment_utr": utr_clean,
            "payment_proof_doc_id": saved["id"],
            "payment_verified": False,
            "updated_at": iso(),
        }},
    )
    return {"ok": True, "payment_utr": utr_clean, "payment_proof_doc_id": saved["id"]}


@router.post("/ads/applications/{ad_id}/submit")
async def submit_ad_application(ad_id: str, body: dict = Body(...), request: Request = None):
    token = (body.get("status_token") or "").strip()
    doc = await db.business_ads.find_one({"id": ad_id, "status_token": token, "is_deleted": {"$ne": True}})
    if not doc:
        raise HTTPException(status_code=404, detail="Application not found.")
    if doc.get("status") not in ("draft", "changes_requested", "rejected"):
        raise HTTPException(status_code=409, detail="This application is already in the review pipeline.")
    if not (doc.get("media") or []):
        raise HTTPException(status_code=400, detail="Upload at least one image or video before submitting.")
    if not doc.get("payment_utr") or not doc.get("payment_proof_doc_id"):
        raise HTTPException(status_code=400, detail="Upload UPI payment UTR and screenshot before submitting.")

    was_resubmit = doc.get("status") in ("changes_requested", "rejected")
    resubmit_used = int(doc.get("resubmit_used") or 0)
    if was_resubmit and resubmit_used >= 1:
        raise HTTPException(status_code=409, detail="Only one resubmit is allowed on this application.")

    update = {
        "status": "submitted",
        "submitted_at": iso(),
        "updated_at": iso(),
        "review_notes": "",
    }
    if was_resubmit:
        update["resubmit_used"] = resubmit_used + 1

    await db.business_ads.update_one({"id": ad_id}, {"$set": update})
    await audit(
        "ads.application.submit",
        entity_type="business_ad",
        entity_id=ad_id,
        after={"resubmit": was_resubmit},
        request=request,
    )
    return {
        "ok": True,
        "status": "submitted",
        "status_token": token,
        "message": "Submitted for committee review. Please do not pay again.",
    }


@router.get("/ads/status/{token}")
async def ad_status(token: str):
    return _status_view(clean(await _by_token(token)))



@router.get("/ads/media/{doc_id}")
async def public_ad_media(doc_id: str, token: str = ""):
    """Serve creative/payment media for published ads, or drafts with a matching status token."""
    rec = await db.documents.find_one({"id": doc_id, "is_deleted": {"$ne": True}})
    if not rec:
        raise HTTPException(status_code=404, detail="Media not found.")
    linked_id = rec.get("linked_id") or ""
    ad = await db.business_ads.find_one({"id": linked_id, "is_deleted": {"$ne": True}}) if linked_id else None
    if not ad:
        raise HTTPException(status_code=404, detail="Media not found.")
    allowed = ad.get("status") == "published" or (token and token == ad.get("status_token"))
    # Committee reviewers use authenticated document download; public needs published or owner token.
    if not allowed:
        raise HTTPException(status_code=403, detail="Media not available.")
    data, ctype = get_object(rec["storage_path"])
    return Response(content=data, media_type=rec.get("content_type") or ctype)


@router.get("/ads/admin/queue")
async def admin_ads_queue(
    status: str = "",
    user: dict = Depends(require("ads:review", "ops:manage")),
):
    query: dict = {"is_deleted": {"$ne": True}}
    if status:
        query["status"] = status
    else:
        query["status"] = {"$in": [
            "submitted", "in_review", "changes_requested", "approved", "rejected", "published",
        ]}
    items = await db.business_ads.find(query, {"_id": 0}).sort("updated_at", -1).to_list(300)
    for i in items:
        i.pop("status_token", None)
    return {"items": items, "count": len(items)}


@router.get("/ads/admin/{ad_id}")
async def admin_ad_detail(ad_id: str, user: dict = Depends(require("ads:review", "ops:manage"))):
    doc = await db.business_ads.find_one({"id": ad_id, "is_deleted": {"$ne": True}}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found.")
    return doc


@router.post("/ads/admin/{ad_id}/review")
async def admin_review_ad(
    ad_id: str,
    body: dict = Body(...),
    request: Request = None,
    user: dict = Depends(require("ads:review", "ops:manage", "ads:publish")),
):
    action = (body.get("action") or "").strip().lower()
    notes = (body.get("notes") or "").strip()[:1000]
    doc = await db.business_ads.find_one({"id": ad_id, "is_deleted": {"$ne": True}})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found.")

    status = doc.get("status")
    update = {
        "updated_at": iso(),
        "reviewed_by": user.get("user_id") or user.get("login_id"),
        "review_notes": notes,
    }

    if action == "start_review":
        if status not in ("submitted", "in_review"):
            raise HTTPException(status_code=409, detail="Only submitted ads can enter review.")
        update["status"] = "in_review"
    elif action == "approve":
        if status not in ("submitted", "in_review", "approved"):
            raise HTTPException(status_code=409, detail="Cannot approve from this status.")
        update["status"] = "approved"
        update["payment_verified"] = bool(body.get("payment_verified", True))
        if body.get("placements"):
            update["placements"] = list(body["placements"])
    elif action == "request_changes":
        if status not in ("submitted", "in_review"):
            raise HTTPException(status_code=409, detail="Cannot request changes from this status.")
        if not notes:
            raise HTTPException(status_code=400, detail="Explain what needs to change.")
        update["status"] = "changes_requested"
    elif action == "reject":
        if status not in ("submitted", "in_review", "changes_requested"):
            raise HTTPException(status_code=409, detail="Cannot reject from this status.")
        if not notes:
            raise HTTPException(status_code=400, detail="Please add a rejection reason.")
        update["status"] = "rejected"
    elif action == "publish":
        if status not in ("approved", "published"):
            raise HTTPException(status_code=409, detail="Approve the ad before publishing.")
        update["status"] = "published"
        update["published_at"] = doc.get("published_at") or iso()
        if body.get("placements"):
            update["placements"] = list(body["placements"])
    elif action == "archive":
        if status not in ("published", "approved", "rejected"):
            raise HTTPException(status_code=409, detail="Cannot archive from this status.")
        update["status"] = "archived"
    else:
        raise HTTPException(status_code=400, detail="Unknown review action.")

    await db.business_ads.update_one({"id": ad_id}, {"$set": update})
    await audit(
        f"ads.application.{action}",
        actor=user,
        entity_type="business_ad",
        entity_id=ad_id,
        after={"status": update.get("status"), "notes": notes[:200]},
        request=request,
    )
    fresh = await db.business_ads.find_one({"id": ad_id}, {"_id": 0})
    return {"ok": True, "ad": fresh}
