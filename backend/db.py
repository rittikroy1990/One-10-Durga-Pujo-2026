"""MongoDB connection and shared document helpers."""
import os
import uuid

from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

NO_ID = {"_id": 0}


def new_id(prefix: str = "") -> str:
    h = uuid.uuid4().hex[:16]
    return f"{prefix}_{h}" if prefix else h


def clean(doc: dict) -> dict:
    """Strip Mongo _id from a returned document."""
    if doc and "_id" in doc:
        doc = {k: v for k, v in doc.items() if k != "_id"}
    return doc


async def ensure_indexes():
    # Uniqueness / consistency rules
    await db.users.create_index("user_id", unique=True)
    await db.users.create_index("email", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("user_id")
    await db.households.create_index([("cycle_id", 1), ("tower_id", 1), ("flat_id", 1)], unique=True)
    await db.flats.create_index([("tower_id", 1), ("number", 1)], unique=True)
    await db.payments.create_index([("provider", 1), ("provider_payment_id", 1)], unique=True, sparse=True)
    await db.webhook_events.create_index([("provider", 1), ("event_id", 1)], unique=True)
    await db.settlements.create_index([("provider", 1), ("settlement_ref", 1)], unique=True, sparse=True)
    await db.receipts.create_index("receipt_no", unique=True)
    await db.credit_notes.create_index("credit_note_no", unique=True, sparse=True)
    await db.payment_vouchers.create_index("voucher_no", unique=True, sparse=True)
    await db.purchase_orders.create_index("po_no", unique=True, sparse=True)
    await db.number_sequences.create_index("key", unique=True)
    await db.audit_events.create_index("seq", unique=True)
    await db.audit_events.create_index("created_at")
    await db.journal_entries.create_index("journal_no", unique=True, sparse=True)
