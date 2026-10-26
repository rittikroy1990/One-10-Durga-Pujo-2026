"""Emergent object storage wrapper with DB-backed metadata + versioning + content hashing."""
import hashlib
import logging
import os
import uuid
from pathlib import Path

import requests

from db import db
from util import iso, now_utc

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "one10-durgotsav"

_storage_key = None
logger = logging.getLogger("one10.storage")

# Used when the object store isn't configured or refuses the upload. Must stay outside the web root:
# these are residents' payment proofs.
LOCAL_DIR = Path(os.environ.get("PRIVATE_UPLOAD_DIR") or Path(__file__).resolve().parent / "private_uploads")
LOCAL_PREFIX = "local:"

MIME_TYPES = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "gif": "image/gif",
    "webp": "image/webp", "pdf": "application/pdf", "json": "application/json",
    "csv": "text/csv", "txt": "text/plain",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xls": "application/vnd.ms-excel",
    "mp4": "video/mp4", "webm": "video/webm", "mov": "video/quicktime",
}
ALLOWED_EXT = set(MIME_TYPES.keys())
VIDEO_EXT = {"mp4", "webm", "mov"}
MAX_SIZE = 15 * 1024 * 1024  # 15 MB
MAX_VIDEO_SIZE = 50 * 1024 * 1024


def init_storage(force: bool = False):
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def _local_file(path: str) -> Path:
    target = (LOCAL_DIR / path).resolve()
    if LOCAL_DIR.resolve() not in target.parents:
        raise ValueError("Invalid storage path")
    return target


def _put_local(path: str, data: bytes) -> dict:
    target = _local_file(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return {"path": LOCAL_PREFIX + path, "size": len(data)}


def put_object(path: str, data: bytes, content_type: str) -> dict:
    if not EMERGENT_KEY:
        return _put_local(path, data)
    try:
        return _put_remote(path, data, content_type)
    except Exception as e:
        logger.warning("Object store upload failed, saving locally: %s", e)
        return _put_local(path, data)


def _put_remote(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key, "Content-Type": content_type},
                        data=data, timeout=120)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": key, "Content-Type": content_type},
                            data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    if path.startswith(LOCAL_PREFIX):
        target = _local_file(path[len(LOCAL_PREFIX):])
        ext = target.suffix.lstrip(".").lower()
        return target.read_bytes(), MIME_TYPES.get(ext, "application/octet-stream")
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


async def save_document(*, data: bytes, filename: str, doc_type: str, linked_type: str = "",
                        linked_id: str = "", uploaded_by: str = "system",
                        content_type: str | None = None) -> dict:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    if ext not in ALLOWED_EXT:
        raise ValueError(f"File type .{ext} not allowed")
    limit = MAX_VIDEO_SIZE if ext in VIDEO_EXT else MAX_SIZE
    if len(data) > limit:
        raise ValueError(f"File exceeds maximum size ({limit // (1024 * 1024)} MB)")
    content_type = content_type or MIME_TYPES.get(ext, "application/octet-stream")
    content_hash = hashlib.sha256(data).hexdigest()
    doc_id = f"doc_{uuid.uuid4().hex[:12]}"

    existing = await db.documents.find_one({"doc_type": doc_type, "linked_id": linked_id,
                                            "original_filename": filename, "is_deleted": False})
    version = 1
    if existing:
        version = existing.get("version", 1) + 1
        await db.documents.update_one({"id": existing["id"]}, {"$set": {"is_current": False}})

    path = f"{APP_NAME}/{doc_type}/{doc_id}.{ext}"
    result = put_object(path, data, content_type)
    rec = {
        "id": doc_id,
        "storage_path": result["path"],
        "original_filename": filename,
        "content_type": content_type,
        "content_hash": content_hash,
        "size": result.get("size", len(data)),
        "doc_type": doc_type,
        "linked_type": linked_type,
        "linked_id": linked_id,
        "version": version,
        "is_current": True,
        "uploaded_by": uploaded_by,
        "access_history": [],
        "is_deleted": False,
        "created_at": iso(),
    }
    await db.documents.insert_one(rec)
    await db.document_versions.insert_one({
        "id": f"dv_{uuid.uuid4().hex[:10]}", "document_id": doc_id, "version": version,
        "content_hash": content_hash, "storage_path": result["path"], "created_at": iso(),
    })
    rec.pop("_id", None)
    return rec
