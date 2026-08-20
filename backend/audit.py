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
