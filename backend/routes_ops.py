"""Phase 3: participation & operations. Public interest capture + coordinator-managed entities."""
from fastapi import APIRouter, Depends, Request, HTTPException, Body

from db import db, new_id, clean
from config import get_active_cycle_id
from util import iso, valid_indian_mobile
from audit import audit
from auth import require
from crud import register_crud

router = APIRouter(prefix="/api")

# Coordinator-managed operational entities (generic audited CRUD).
for name, prefix in [("volunteers", "vol"), ("volunteer_shifts", "shift"), ("performances", "perf"),
                     ("sponsors", "spon"), ("sponsor_deliverables", "deliv"),
                     ("inventory_items", "inv"), ("inventory_movements", "mov"),
                     ("incidents", "inc"), ("announcements", "ann"), ("bhog_headcounts", "bhog"),
                     ("conflict_declarations", "cod")]:
    register_crud(router, name, read_perm="ops:read", write_perm="ops:manage",
                  id_prefix=prefix, default_status="active")


# --------------------------------------------------------------- Public participation interest
@router.post("/participate")
async def participate(body: dict = Body(...), request: Request = None):
    kind = body.get("kind", "volunteer")
    name = (body.get("name") or "").strip()
    mobile = (body.get("mobile") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required.")
    if mobile and not valid_indian_mobile(mobile):
        raise HTTPException(status_code=400, detail="Enter a valid Indian mobile number.")
    is_minor = bool(body.get("is_minor"))
    if is_minor and not body.get("guardian_consent"):
        raise HTTPException(status_code=400, detail="Guardian consent is required for minors.")
    cycle_id = await get_active_cycle_id()

    if kind == "performer":
        doc = {"id": new_id("perf"), "cycle_id": cycle_id, "source": "public_interest",
               "act_title": body.get("act_title", ""), "category": body.get("category", ""),
               "participants": body.get("participants", ""), "duration": body.get("duration", ""),
               "technical_needs": body.get("technical_needs", ""), "contact_name": name,
               "contact_mobile": mobile, "is_minor": is_minor,
               "guardian_consent": bool(body.get("guardian_consent")), "review_status": "pending",
               "status": "interested", "created_at": iso(), "is_deleted": False}
        await db.performances.insert_one(dict(doc))
    else:
        doc = {"id": new_id("vol"), "cycle_id": cycle_id, "source": "public_interest",
               "name": name, "mobile": mobile, "skills": body.get("skills", ""),
               "availability": body.get("availability", ""),
               "interests": body.get("interests", []), "status": "interested",
               "created_at": iso(), "is_deleted": False}
        await db.volunteers.insert_one(dict(doc))
    await audit("participation.interest", entity_type=kind, entity_id=doc["id"], request=request)
    return {"ok": True, "kind": kind, "message": "Thank you! The EOC coordinator will be in touch."}


# --------------------------------------------------------------- Inventory physical verification
@router.post("/inventory/physical-verification")
async def physical_verification(body: dict = Body(...), request: Request = None,
                                user: dict = Depends(require("ops:manage"))):
    results = body.get("results", [])  # [{item_id, counted_qty}]
    variances = []
    for r in results:
        item = await db.inventory_items.find_one({"id": r.get("item_id")})
        if not item:
            continue
        expected = item.get("quantity", 0)
        counted = int(r.get("counted_qty", 0))
        if counted != expected:
            variances.append({"item_id": item["id"], "name": item.get("name"),
                              "expected": expected, "counted": counted, "variance": counted - expected})
    report = {"id": new_id("pvr"), "variances": variances, "verified_by": user["user_id"],
              "created_at": iso()}
    await db.inventory_verifications.insert_one(dict(report))
    await audit("inventory.physical_verification", actor=user, entity_type="inventory_verification",
                entity_id=report["id"], after={"variance_count": len(variances)}, request=request)
    return clean(report)
