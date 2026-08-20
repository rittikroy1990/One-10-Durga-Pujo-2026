"""Generic audited CRUD factory for breadth entities (ops, procurement masters, etc.)."""
from fastapi import APIRouter, Depends, Request, HTTPException, Body

from db import db, new_id, clean
from auth import require
from audit import audit
from util import iso


def register_crud(router: APIRouter, name: str, *, read_perm: str, write_perm: str,
                  id_prefix: str, audit_type: str | None = None,
                  default_status: str | None = None):
    coll = db[name]
    atype = audit_type or name

    @router.get(f"/{name}", name=f"list_{name}")
    async def _list(request: Request, user: dict = Depends(require(read_perm))):
        q = {"is_deleted": {"$ne": True}}
        for k, v in request.query_params.items():
            if k in ("limit", "skip"):
                continue
            q[k] = v
        items = await coll.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
        return {"items": items, "count": len(items)}

    @router.post(f"/{name}", name=f"create_{name}")
    async def _create(request: Request, body: dict = Body(...), user: dict = Depends(require(write_perm))):
        doc = dict(body)
        doc["id"] = new_id(id_prefix)
        doc["created_by"] = user["user_id"]
        doc["created_by_name"] = user.get("name", "")
        doc["created_at"] = iso()
        doc["is_deleted"] = False
        if default_status and "status" not in doc:
            doc["status"] = default_status
        await coll.insert_one(dict(doc))
        await audit(f"{atype}.create", actor=user, entity_type=atype, entity_id=doc["id"],
                    after=doc, request=request)
        return clean(doc)

    @router.get(f"/{name}/{{item_id}}", name=f"get_{name}")
    async def _get(item_id: str, user: dict = Depends(require(read_perm))):
        doc = await coll.find_one({"id": item_id, "is_deleted": {"$ne": True}}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Not found")
        return doc

    @router.patch(f"/{name}/{{item_id}}", name=f"update_{name}")
    async def _update(item_id: str, request: Request, body: dict = Body(...),
                      user: dict = Depends(require(write_perm))):
        before = await coll.find_one({"id": item_id}, {"_id": 0})
        if not before:
            raise HTTPException(status_code=404, detail="Not found")
        updates = {k: v for k, v in body.items() if k not in ("id", "created_by", "created_at")}
        updates["updated_by"] = user["user_id"]
        updates["updated_at"] = iso()
        await coll.update_one({"id": item_id}, {"$set": updates})
        after = await coll.find_one({"id": item_id}, {"_id": 0})
        await audit(f"{atype}.update", actor=user, entity_type=atype, entity_id=item_id,
                    before=before, after=after, request=request)
        return after

    @router.delete(f"/{name}/{{item_id}}", name=f"delete_{name}")
    async def _delete(item_id: str, request: Request, user: dict = Depends(require(write_perm))):
        before = await coll.find_one({"id": item_id}, {"_id": 0})
        if not before:
            raise HTTPException(status_code=404, detail="Not found")
        await coll.update_one({"id": item_id}, {"$set": {"is_deleted": True, "deleted_at": iso(),
                                                          "deleted_by": user["user_id"]}})
        await audit(f"{atype}.delete", actor=user, entity_type=atype, entity_id=item_id,
                    before=before, request=request)
        return {"ok": True}
