"""Atomic number sequences and append-only, hash-chained audit event service."""
import hashlib
import json

from db import db
from util import now_utc, iso


async def next_seq(key: str) -> int:
    """Atomically increment and return a named counter (concurrency-safe)."""
    doc = await db.number_sequences.find_one_and_update(
        {"key": key},
        {"$inc": {"value": 1}},
        upsert=True,
        return_document=True,
    )
    return int(doc["value"])


async def next_formatted(key: str, prefix: str, width: int = 6) -> tuple[int, str]:
    n = await next_seq(key)
    return n, f"{prefix}-{n:0{width}d}"


def _canonical(payload: dict) -> str:
    return json.dumps(payload, sort_keys=True, default=str, separators=(",", ":"))


REDACT_FIELDS = {"password", "session_token", "key_secret", "cvv", "card", "account_no",
                 "bank_account_no", "ifsc", "upi", "otp", "signature", "webhook_secret"}


def _redact(data):
    if isinstance(data, dict):
        return {k: ("***REDACTED***" if k.lower() in REDACT_FIELDS else _redact(v)) for k, v in data.items()}
    if isinstance(data, list):
        return [_redact(v) for v in data]
    return data


async def audit(action: str, *, actor=None, entity_type: str = "", entity_id: str = "",
                before=None, after=None, reason: str = "", request=None,
                approval_chain=None, evidence=None, correlation_id: str = "",
                post_close: bool = False):
    """Append an immutable, hash-chained audit event."""
    seq = await next_seq("audit")
    prev = await db.audit_events.find_one({"seq": seq - 1}, sort=[("seq", -1)]) if seq > 1 else None
    prev_hash = prev.get("hash", "") if prev else "GENESIS"

    actor_id = actor.get("user_id") if isinstance(actor, dict) else (actor or "system")
    actor_role = ",".join(actor.get("roles", [])) if isinstance(actor, dict) else ""
    ip = ""
    ua = ""
    if request is not None:
        try:
            ip = request.client.host if request.client else ""
            ua = request.headers.get("user-agent", "")
        except Exception:
            pass

    event = {
        "seq": seq,
        "actor_id": actor_id,
        "actor_role": actor_role,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "reason": reason,
        "before": _redact(before) if before is not None else None,
        "after": _redact(after) if after is not None else None,
        "approval_chain": approval_chain or [],
        "evidence": evidence or [],
        "correlation_id": correlation_id,
        "ip": ip,
        "user_agent": ua,
        "post_close": post_close,
        "created_at": iso(),
    }
    event["prev_hash"] = prev_hash
    event["hash"] = hashlib.sha256((prev_hash + _canonical(event)).encode()).hexdigest()
    await db.audit_events.insert_one(event)
    return event["hash"]


def _add_id(bucket: set, value):
    if value is None:
        return
    s = str(value).strip()
    if s:
        bucket.add(s)


async def resolve_transaction_ids(key: str) -> dict:
    """Resolve a receipt / intent / order / payment key into related IDs for trail lookup."""
    key = (key or "").strip()
    if not key:
        return {"key": "", "related_ids": [], "context": {}}

    related: set[str] = set()
    context: dict = {"lookup": key}
    _add_id(related, key)

    receipt = await db.receipts.find_one(
        {"$or": [{"receipt_no": key}, {"id": key}]},
        {"_id": 0},
    )
    intent = None
    if receipt:
        context["receipt_no"] = receipt.get("receipt_no")
        context["receipt_id"] = receipt.get("id")
        context["method"] = receipt.get("method")
        context["issued_at"] = receipt.get("issued_at")
        context["total_amount"] = receipt.get("total_amount")
        context["status"] = receipt.get("status")
        _add_id(related, receipt.get("id"))
        _add_id(related, receipt.get("receipt_no"))
        _add_id(related, receipt.get("intent_id"))
        _add_id(related, receipt.get("payment_id"))
        _add_id(related, receipt.get("journal_id"))
        _add_id(related, receipt.get("household_id"))
        _add_id(related, receipt.get("proof_doc_id"))
        if receipt.get("intent_id"):
            intent = await db.subscription_intents.find_one({"id": receipt["intent_id"]}, {"_id": 0})

    if not intent:
        intent = await db.subscription_intents.find_one({"id": key}, {"_id": 0})
    if intent:
        context["intent_id"] = intent.get("id")
        context["intent_status"] = intent.get("status")
        context["paid_at"] = intent.get("paid_at")
        context["created_at"] = intent.get("created_at")
        _add_id(related, intent.get("id"))
        _add_id(related, intent.get("household_id"))

    intent_key = context.get("intent_id") or key
    order = await db.payment_orders.find_one(
        {"$or": [{"id": key}, {"provider_order_id": key}, {"intent_id": intent_key}]},
        {"_id": 0},
        sort=[("created_at", -1)],
    )
    if order:
        context["payment_order_id"] = order.get("id")
        context["provider"] = order.get("provider")
        context["provider_order_id"] = order.get("provider_order_id")
        context["order_status"] = order.get("status")
        context["order_created_at"] = order.get("created_at")
        _add_id(related, order.get("id"))
        _add_id(related, order.get("provider_order_id"))
        _add_id(related, order.get("intent_id"))
        _add_id(related, order.get("household_id"))
        if not intent and order.get("intent_id"):
            intent = await db.subscription_intents.find_one({"id": order["intent_id"]}, {"_id": 0})
            if intent:
                context["intent_id"] = intent.get("id")
                _add_id(related, intent.get("id"))

    intent_id = context.get("intent_id")
    if intent_id:
        async for o in db.payment_orders.find({"intent_id": intent_id}, {"_id": 0, "id": 1, "provider_order_id": 1}):
            _add_id(related, o.get("id"))
            _add_id(related, o.get("provider_order_id"))
        async for p in db.payments.find({"intent_id": intent_id}, {"_id": 0, "id": 1, "provider_payment_id": 1, "proof_doc_id": 1}):
            _add_id(related, p.get("id"))
            _add_id(related, p.get("provider_payment_id"))
            _add_id(related, p.get("proof_doc_id"))
        async for s in db.upi_submissions.find({"intent_id": intent_id}, {"_id": 0, "id": 1, "proof_doc_id": 1}):
            _add_id(related, s.get("id"))
            _add_id(related, s.get("proof_doc_id"))
        async for rfund in db.refunds.find({"intent_id": intent_id}, {"_id": 0, "id": 1}):
            _add_id(related, rfund.get("id"))
        if not receipt:
            receipt = await db.receipts.find_one({"intent_id": intent_id}, {"_id": 0})
            if receipt:
                context["receipt_no"] = receipt.get("receipt_no")
                context["receipt_id"] = receipt.get("id")
                context["issued_at"] = receipt.get("issued_at")
                _add_id(related, receipt.get("id"))
                _add_id(related, receipt.get("receipt_no"))
                _add_id(related, receipt.get("payment_id"))
                _add_id(related, receipt.get("journal_id"))

    pay = await db.payments.find_one({"$or": [{"id": key}, {"provider_payment_id": key}]}, {"_id": 0})
    if pay:
        _add_id(related, pay.get("id"))
        _add_id(related, pay.get("intent_id"))
        _add_id(related, pay.get("provider_payment_id"))
        context.setdefault("payment_id", pay.get("id"))
    upi = await db.upi_submissions.find_one({"id": key}, {"_id": 0})
    if upi:
        _add_id(related, upi.get("id"))
        _add_id(related, upi.get("intent_id"))
        _add_id(related, upi.get("proof_doc_id"))
    refund = await db.refunds.find_one({"id": key}, {"_id": 0})
    if refund:
        _add_id(related, refund.get("id"))
        _add_id(related, refund.get("intent_id"))
        _add_id(related, refund.get("receipt_id"))

    return {"key": key, "related_ids": sorted(related), "context": context}


async def fetch_transaction_trail(key: str, *, limit: int = 2000) -> dict:
    """Build a timestamp-ordered audit trail for one payment transaction."""
    resolved = await resolve_transaction_ids(key)
    ids = resolved["related_ids"]
    if not ids:
        return {**resolved, "events": [], "count": 0}

    q = {
        "$or": [
            {"entity_id": {"$in": ids}},
            {"correlation_id": {"$in": ids}},
        ]
    }
    events = await db.audit_events.find(q, {"_id": 0}).sort("seq", 1).to_list(min(limit, 5000))
    events.sort(key=lambda e: (e.get("created_at") or "", e.get("seq") or 0))
    return {
        **resolved,
        "events": events,
        "count": len(events),
    }


def transaction_trail_csv_rows(trail: dict) -> tuple[list[str], list[list]]:
    headers = [
        "seq", "created_at", "actor_id", "actor_role", "action",
        "entity_type", "entity_id", "correlation_id", "reason", "ip",
        "before_json", "after_json", "hash",
    ]
    rows = []
    for e in trail.get("events") or []:
        rows.append([
            e.get("seq", ""),
            e.get("created_at", ""),
            e.get("actor_id", ""),
            e.get("actor_role", ""),
            e.get("action", ""),
            e.get("entity_type", ""),
            e.get("entity_id", ""),
            e.get("correlation_id", ""),
            e.get("reason", ""),
            e.get("ip", ""),
            json.dumps(e.get("before"), default=str) if e.get("before") is not None else "",
            json.dumps(e.get("after"), default=str) if e.get("after") is not None else "",
            e.get("hash", ""),
        ])
    return headers, rows
