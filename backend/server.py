"""One10 Durgotsav 2026 Portal — FastAPI application entrypoint."""
import logging
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from db import ensure_indexes
from config import ensure_settings
from auth import seed_demo_users

import routes_public
import routes_collect
import routes_manual
import routes_finance
import routes_procure
import routes_ops
import routes_gov
import routes_food

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("one10")

app = FastAPI(title="One 10 Events Portal", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (routes_public, routes_collect, routes_manual, routes_finance,
               routes_procure, routes_ops, routes_gov, routes_food):
    app.include_router(module.router)

# Public uploaded PDFs
_UPLOADS = Path(__file__).resolve().parent.parent / "frontend" / "public" / "uploads"
_UPLOADS.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_UPLOADS)), name="uploads")


# Serve CRA production build when present (same-origin /api + static assets).
FRONTEND_BUILD = Path(__file__).resolve().parent.parent / "frontend" / "build"
if FRONTEND_BUILD.is_dir() and (FRONTEND_BUILD / "index.html").exists():
    assets = FRONTEND_BUILD / "static"
    if assets.is_dir():
        app.mount("/static", StaticFiles(directory=str(assets)), name="static")
    images = FRONTEND_BUILD / "images"
    if images.is_dir():
        app.mount("/images", StaticFiles(directory=str(images)), name="images")

    @app.get("/")
    async def spa_index():
        return FileResponse(FRONTEND_BUILD / "index.html")

    _ASSET_EXT = {
        ".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".ico",
        ".css", ".js", ".map", ".woff", ".woff2", ".ttf", ".pdf",
        ".txt", ".xml",
    }

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        if full_path.startswith("api/") or full_path in ("docs", "openapi.json", "redoc"):
            from fastapi import HTTPException
            raise HTTPException(status_code=404)
        candidate = FRONTEND_BUILD / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        # Missing media must 404 — returning index.html makes <img> show a broken icon
        if Path(full_path).suffix.lower() in _ASSET_EXT:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Asset not found")
        return FileResponse(FRONTEND_BUILD / "index.html")


@app.on_event("startup")
async def startup():
    await ensure_indexes()
    await ensure_settings()
    created = await seed_demo_users()  # preview-only demo committee users
    if created:
        logger.info(f"Seeded demo users: {created}")
    try:
        from storage import init_storage
        init_storage()
        logger.info("Object storage initialised")
    except Exception as e:
        logger.warning(f"Storage init deferred: {e}")
    logger.info("One 10 Events Portal ready")
