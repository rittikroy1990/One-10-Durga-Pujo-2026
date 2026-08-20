"""One10 Durgotsav 2026 Portal — FastAPI application entrypoint."""
import logging

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("one10")

app = FastAPI(title="One10 Durgotsav 2026 Portal", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (routes_public, routes_collect, routes_manual, routes_finance,
               routes_procure, routes_ops, routes_gov):
    app.include_router(module.router)


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
    logger.info("One10 Durgotsav 2026 Portal ready")
