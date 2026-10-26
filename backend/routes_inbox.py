"""One-time private links for committee files (ledgers, bank statements, reconciliation reports).

Upload: `python routes_inbox.py "label"` — files land in private_uploads/inbox.
Download: `python routes_inbox.py --send <file> "label"` — the file is copied to private_uploads/outbox.
Links are created from the server shell, work once, expire, and never touch the web root.
"""
from __future__ import annotations

import hashlib
import html
import re
import secrets
from datetime import timedelta
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse

from db import db
from util import iso, now_utc

router = APIRouter(prefix="/api")

INBOX_DIR = Path(__file__).resolve().parent / "private_uploads" / "inbox"
OUTBOX_DIR = INBOX_DIR.parent / "outbox"
MAX_BYTES = 24 * 1024 * 1024  # nginx allows 25 MB on /api
ALLOWED_SUFFIXES = {".xlsx", ".xls", ".csv", ".pdf", ".ods", ".md", ".txt"}


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def _open_link(token: str, kind: str = "upload") -> dict:
    link = await db.upload_inbox.find_one({"token_sha256": _digest(token)}, {"_id": 0})
    if not link or (link.get("kind") or "upload") != kind or link.get("used_at") or link["expires_at"] < iso():
        raise HTTPException(status_code=404, detail="This link has expired or was already used.")
    return link


def _page(body: str) -> HTMLResponse:
    return HTMLResponse(
        "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>"
        "<meta name=robots content=noindex><title>One 10 Events · private upload</title>"
        "<body style='font-family:system-ui;max-width:520px;margin:48px auto;padding:0 20px;color:#3b1f1a'>"
        f"{body}</body>",
        headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
    )


@router.get("/inbox/{token}", response_class=HTMLResponse)
async def inbox_form(token: str):
    link = await _open_link(token)
    return _page(
        "<h1 style='font-weight:600'>Private upload</h1>"
        f"<p>{html.escape(link.get('label') or 'File for the One 10 Events committee')}</p>"
        "<p style='color:#7a5a52;font-size:14px'>Excel, CSV or PDF up to 24 MB. The file goes to the server's "
        "private folder (not the public website). This link works once.</p>"
        f"<form method=post action='/api/inbox/{html.escape(token)}' enctype=multipart/form-data>"
        "<input type=file name=file required accept='.xlsx,.xls,.csv,.pdf,.ods,.md,.txt' style='margin:16px 0;display:block'>"
        "<button style='background:#e0452b;color:#fff;border:0;border-radius:999px;padding:10px 22px;font-size:16px'>"
        "Upload</button></form>"
    )


@router.post("/inbox/{token}", response_class=HTMLResponse)
async def inbox_upload(token: str, file: UploadFile = File(...)):
    link = await _open_link(token)
    name = Path(file.filename or "upload").name
    suffix = Path(name).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(status_code=400, detail="Please upload an Excel, CSV or PDF file.")
    data = await file.read(MAX_BYTES + 1)
    if not data:
        raise HTTPException(status_code=400, detail="The file is empty.")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="The file is larger than 24 MB.")
    claimed = await db.upload_inbox.update_one(
        {"token_sha256": link["token_sha256"], "used_at": None}, {"$set": {"used_at": iso()}},
    )
    if not claimed.modified_count:
        raise HTTPException(status_code=404, detail="This upload link was already used.")
    INBOX_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    safe = re.sub(r"[^\w.\- ()–]+", "_", name).strip() or f"upload{suffix}"
    dest = INBOX_DIR / f"{now_utc().strftime('%Y%m%d-%H%M%S')}_{safe}"
    dest.write_bytes(data)
    dest.chmod(0o600)
    await db.upload_inbox.update_one(
        {"token_sha256": link["token_sha256"]},
        {"$set": {"stored_as": dest.name, "size": len(data), "original_name": name}},
    )
    return _page(
        "<h1 style='font-weight:600'>Uploaded ✓</h1>"
        f"<p>{html.escape(name)} ({len(data) // 1024} KB) reached the server privately. You can close this page.</p>"
    )


@router.get("/outbox/{token}", response_class=HTMLResponse)
async def outbox_page(token: str):
    # GET only shows a button: chat apps prefetch links for previews, which must not consume the download.
    link = await _open_link(token, "download")
    return _page(
        "<h1 style='font-weight:600'>Private download</h1>"
        f"<p>{html.escape(link.get('label') or link['original_name'])}</p>"
        f"<p style='color:#7a5a52;font-size:14px'>{html.escape(link['original_name'])} · {link['size'] // 1024} KB. "
        "This link works once.</p>"
        f"<form method=post action='/api/outbox/{html.escape(token)}'>"
        "<button style='background:#e0452b;color:#fff;border:0;border-radius:999px;padding:10px 22px;font-size:16px'>"
        "Download</button></form>"
    )


@router.post("/outbox/{token}")
async def outbox_download(token: str):
    link = await _open_link(token, "download")
    path = OUTBOX_DIR / link["stored_as"]
    if not path.is_file():
        raise HTTPException(status_code=404, detail="This file is no longer available.")
    claimed = await db.upload_inbox.update_one(
        {"token_sha256": link["token_sha256"], "used_at": None}, {"$set": {"used_at": iso()}},
    )
    if not claimed.modified_count:
        raise HTTPException(status_code=404, detail="This link was already used.")
    return FileResponse(
        path, filename=link["original_name"],
        headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
    )


if __name__ == "__main__":
    import asyncio
    import shutil
    import sys

    async def _create(label: str, hours: int = 3, send: Path | None = None) -> None:
        token = secrets.token_urlsafe(24)
        doc = {
            "token_sha256": _digest(token), "label": label, "created_at": iso(), "kind": "upload",
            "expires_at": (now_utc() + timedelta(hours=hours)).isoformat(), "used_at": None,
        }
        if send:
            OUTBOX_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
            dest = OUTBOX_DIR / f"{now_utc().strftime('%Y%m%d-%H%M%S')}_{send.name}"
            shutil.copyfile(send, dest)
            dest.chmod(0o600)
            doc.update(kind="download", stored_as=dest.name, original_name=send.name, size=dest.stat().st_size)
        await db.upload_inbox.insert_one(doc)
        print(f"https://one10events.in/api/{'outbox' if send else 'inbox'}/{token}")

    args = sys.argv[1:]
    if args[:1] == ["--send"]:
        asyncio.run(_create(args[2] if len(args) > 2 else "", send=Path(args[1])))
    else:
        asyncio.run(_create(args[0] if args else ""))
