"""LLM vision extraction for UPI / bank payment screenshots via Emergent proxy.

Also fuzzy-matches the payee / organisation name against the One10 Events
Organising Committee so receipts are only auto-issued for our committee.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import re
import unicodedata
from difflib import SequenceMatcher
from typing import Any, Optional

import requests

logger = logging.getLogger("one10.vision")

LLM_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
LLM_URL = LLM_BASE.rstrip("/") + "/llm/chat/completions"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY") or ""
MODEL = os.environ.get("PAYMENT_VISION_MODEL") or os.environ.get("VISION_MODEL") or "gpt-4o"

# Canonical names we accept on a payment screenshot (bank / UPI payee / merchant).
EXPECTED_ORG_NAMES = (
    "ONE 10 EVENT ORGANISING COMMITTEE",
    "ONE 10 EVENTS ORGANISING COMMITTEE",
    "ONE10 EVENT ORGANISING COMMITTEE",
    "ONE10 EVENTS ORGANISING COMMITTEE",
    "ONE 10 EVENT ORGANISING COMMITEE",  # bank UPI payee spelling on flyer
    "M/S.ONE 10 EVENT ORGANISING COMMITEE",
    "M S ONE 10 EVENT ORGANISING COMMITEE",  # Google Pay banking name as shown
    "M/S. ONE 10 EVENT ORGANISING COMMITTEE",
    "Events Organizations Committee of One10",
    "Events Organisations Committee of One10",
    "One10 Events Organization Committee",
    "One10 Events Organisation Committee",
    "One 10 Events Organising Committee",
    "One10 events organization committee",
    "EOC One10",
    "Events Organising Committee of One10",
)

# Obvious non-committee merchants — hard reject even before fuzzy match.
# Protects against LLM hallucinations / partial OCR when the screenshot is clearly
# a food / shopping / personal payment app receipt.
BLOCKED_PAYEE_MARKERS = (
    "swiggy",
    "instamart",
    "zomato",
    "blinkit",
    "zepto",
    "amazon",
    "flipkart",
    "myntra",
    "phonepe merchant",
    "google play",
    "netflix",
    "spotify",
    "uber",
    "ola cabs",
    "rapido",
    "irctc",
    "bookmyshow",
    "paytm mall",
)

# Minimum fuzzy ratio against a canonical name (handles OCR / spelling slips).
ORG_FUZZY_MIN = float(os.environ.get("ORG_NAME_FUZZY_MIN") or "0.72")

EXTRACT_PROMPT = """You are extracting payment details from an Indian UPI / payment-app screenshot.
Return ONLY valid JSON with these keys:
{
  "amount_rupees": number or null,
  "payee_name": string or null,
  "org_name": string or null,
  "status": "success" | "failed" | "pending" | "unknown",
  "confidence": number between 0 and 1,
  "notes": string
}
Focus on ONLY these two fields (do not invent UTR / UPI reference numbers):
1) amount_rupees — the paid amount in RUPEES as shown (e.g. 3500 for ₹3,500.00). Never return paise.
   Strip ₹ / Rs / INR / commas. Do not invent an amount.
2) payee_name / org_name — the beneficiary / "Paid to" / "To" name exactly as shown.
   Look carefully for names like "M S ONE 10 EVENT ORGANISING COMMITEE",
   "ONE 10 EVENT ORGANISING COMMITTEE", or "One10 Events Organising Committee".
   NEVER invent or substitute our committee name. If the screenshot says Swiggy, Amazon,
   Zomato, a person, or any other merchant, return that exact payee string.
   If misspelled on screen (Organising / Organization / Committte), still return what you see.
- status: success / failed / pending / unknown from the screenshot.
- Do NOT extract or invent UTR / UPI / Google transaction IDs — leave them out of notes unless needed.
- If unclear, use null and lower confidence.
"""


def _parse_json_loose(text: str) -> dict:
    text = (text or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except Exception:
        m = re.search(r"\{[\s\S]*\}", text)
        if m:
            return json.loads(m.group(0))
        raise


def normalize_ref(ref: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", (ref or "")).upper()


def amount_to_paise(rupees: Any) -> Optional[int]:
    """Parse a rupee amount into paise. Strips currency symbols. Never treats paise as rupees here."""
    if rupees is None or rupees == "":
        return None
    try:
        raw = str(rupees).strip()
        raw = re.sub(r"(?i)\b(inr|rs\.?|rupees?)\b", "", raw)
        raw = raw.replace("₹", "").replace(",", "").strip()
        return int(round(float(raw) * 100))
    except Exception:
        return None


def coerce_amount_paise(paid: Optional[int], expected: Optional[int]) -> Optional[int]:
    """Fix common LLM scale mistakes (returned paise as if rupees → ×100 too large)."""
    if paid is None or paid <= 0:
        return paid
    if expected is None or expected <= 0:
        return paid
    # e.g. expected ₹3500 (350000 paise); LLM returned 350000 "rupees" → 35_000_000 paise
    if paid > expected * 50 and paid % 100 == 0:
        scaled = paid // 100
        if abs(scaled - expected) <= max(100, expected // 20):
            return scaled
    return paid


def refs_match(entered: str, *candidates: Optional[str]) -> bool:
    """True if entered reference equals or is contained in any OCR candidate (either direction)."""
    ent = normalize_ref(entered or "")
    if not ent:
        return False
    for c in candidates:
        norm = normalize_ref(c or "")
        if not norm:
            continue
        if ent == norm or ent in norm or norm in ent:
            return True
    return False


def _fold(text: str) -> str:
    """Lowercase, strip accents/punctuation, collapse whitespace, fix common OCR slips."""
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", str(text))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower()
    # Common OCR / spelling variants for our committee name
    replacements = (
        ("organisation", "organization"),
        ("organising", "organizing"),
        ("committtee", "committee"),
        ("committte", "committee"),
        ("commitee", "committee"),
        ("comittee", "committee"),
        ("organzation", "organization"),
        ("organizaton", "organization"),
        ("organiztion", "organization"),
        ("one 10", "one10"),
        ("one-10", "one10"),
        ("1 10", "one10"),
        ("1-10", "one10"),
        ("events organization committee", "events organizing committee"),
        ("event organization committee", "events organizing committee"),
        ("event organising committee", "events organizing committee"),
        ("event organizing committee", "events organizing committee"),
        ("events organising committee", "events organizing committee"),
    )
    for a, b in replacements:
        text = text.replace(a, b)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _token_set(text: str) -> set[str]:
    return {t for t in _fold(text).split() if t}


def _blocked_merchant(folded: str) -> Optional[str]:
    """Return the blocked marker if payee looks like a known non-committee merchant."""
    for marker in BLOCKED_PAYEE_MARKERS:
        if marker in folded:
            return marker
    return None


def org_name_match(candidate: str | None, expected_names: tuple[str, ...] | None = None) -> dict:
    """Fuzzy spell-check: does candidate look like One10 Events Organising Committee?

    Returns {ok, score, matched_against, normalized, reason, blocked}.
    """
    names = expected_names or EXPECTED_ORG_NAMES
    raw = (candidate or "").strip()
    if not raw:
        return {
            "ok": False,
            "score": 0.0,
            "matched_against": None,
            "normalized": "",
            "reason": "organisation / payee name not found on screenshot",
            "token_gate": False,
            "blocked": None,
        }

    folded = _fold(raw)
    blocked = _blocked_merchant(folded)
    if blocked:
        return {
            "ok": False,
            "score": 0.0,
            "matched_against": None,
            "normalized": folded,
            "reason": (
                f"screenshot shows payment to a different merchant ({blocked}) — "
                "not One10 Events Organising Committee"
            ),
            "token_gate": False,
            "blocked": blocked,
        }

    tokens = _token_set(raw)
    best_name = None
    best_score = 0.0

    for name in names:
        target = _fold(name)
        ratio = SequenceMatcher(None, folded, target).ratio()
        tset = _token_set(name)
        if tset:
            overlap = len(tokens & tset) / max(len(tset), 1)
            ratio = max(ratio, (ratio * 0.55) + (overlap * 0.45))
        if ratio > best_score:
            best_score = ratio
            best_name = name

    # Strong token gate: One10 + (event/events) + organiz* + committee
    has_one10 = "one10" in folded or "one10" in tokens
    has_event = "event" in tokens or "events" in tokens
    has_org = any(t.startswith("organiz") for t in tokens) or "organizing" in folded or "organization" in folded
    has_committee = "committee" in tokens or "committee" in folded
    token_gate = has_one10 and has_event and has_org and has_committee

    ok = bool(token_gate and best_score >= ORG_FUZZY_MIN)
    if not has_one10:
        reason = "screenshot payee is not One10 Events Organising Committee"
    elif not token_gate:
        reason = "organisation name on screenshot is incomplete or misspelled beyond tolerance"
    elif not ok:
        reason = "organisation name on screenshot does not match One10 Events Organising Committee"
    else:
        reason = "matched"

    return {
        "ok": ok,
        "score": round(best_score, 4),
        "matched_against": best_name,
        "normalized": folded,
        "reason": reason,
        "token_gate": token_gate,
        "blocked": None,
    }


def extract_payment_screenshot(image_bytes: bytes, content_type: str = "image/jpeg") -> dict:
    """Call Emergent LLM vision. Returns structured extract + org match. Never raises for business use."""
    if not EMERGENT_KEY:
        return {
            "ok": False,
            "error": "EMERGENT_LLM_KEY not configured",
            "amount_paise": None,
            "utr": None,
            "payee_name": None,
            "org_name": None,
            "org_match": org_name_match(None),
            "confidence": 0,
            "raw": None,
        }

    b64 = base64.b64encode(image_bytes).decode("ascii")
    data_url = f"data:{content_type};base64,{b64}"
    payload = {
        "model": MODEL,
        "temperature": 0,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": EXTRACT_PROMPT},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        ],
    }
    try:
        resp = requests.post(
            LLM_URL,
            headers={
                "Authorization": f"Bearer {EMERGENT_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=90,
        )
        resp.raise_for_status()
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        parsed = _parse_json_loose(content if isinstance(content, str) else json.dumps(content))
        amount_paise = amount_to_paise(parsed.get("amount_rupees"))
        payee_name = (parsed.get("payee_name") or "").strip() or None
        org_name = (parsed.get("org_name") or "").strip() or None
        match_source = org_name or payee_name
        org_match = org_name_match(match_source)
        # UTR / UPI refs are intentionally NOT extracted — auto-issue uses amount + payee only.
        return {
            "ok": True,
            "error": None,
            "amount_paise": amount_paise,
            "utr": None,
            "utr_candidates": [],
            "txn_time": parsed.get("txn_time"),
            "payer_name": parsed.get("payer_name"),
            "payee_name": payee_name,
            "org_name": org_name,
            "org_match": org_match,
            "status": parsed.get("status") or "unknown",
            "confidence": float(parsed.get("confidence") or 0),
            "notes": parsed.get("notes") or "",
            "raw": parsed,
            "model": MODEL,
        }
    except Exception as e:
        logger.exception("payment screenshot LLM extract failed")
        return {
            "ok": False,
            "error": str(e)[:300],
            "amount_paise": None,
            "utr": None,
            "payee_name": None,
            "org_name": None,
            "org_match": org_name_match(None),
            "confidence": 0,
            "raw": None,
            "model": MODEL,
        }
