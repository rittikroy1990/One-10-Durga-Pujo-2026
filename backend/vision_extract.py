"""LLM vision extraction for UPI / bank payment screenshots via Emergent proxy."""
from __future__ import annotations

import base64
import json
import logging
import os
import re
from typing import Any, Optional

import requests

logger = logging.getLogger("one10.vision")

LLM_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
LLM_URL = LLM_BASE.rstrip("/") + "/llm/chat/completions"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY") or ""
MODEL = os.environ.get("PAYMENT_VISION_MODEL") or "gpt-4o"


EXTRACT_PROMPT = """You are extracting payment details from an Indian UPI / bank transfer / payment-app screenshot.
Return ONLY valid JSON with these keys:
{
  "amount_rupees": number or null,
  "utr_or_ref": string or null,
  "txn_time": string or null,
  "payer_name": string or null,
  "payee_name": string or null,
  "status": "success" | "failed" | "pending" | "unknown",
  "confidence": number between 0 and 1,
  "notes": string
}
Rules:
- Prefer UTR / UPI Ref / Transaction ID / Reference No as utr_or_ref (alphanumeric).
- amount_rupees must be the paid amount only (no commas).
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
    if rupees is None or rupees == "":
        return None
    try:
        return int(round(float(str(rupees).replace(",", "").strip()) * 100))
    except Exception:
        return None


def extract_payment_screenshot(image_bytes: bytes, content_type: str = "image/jpeg") -> dict:
    """Call Emergent LLM vision. Returns structured extract + raw meta. Never raises for business use."""
    if not EMERGENT_KEY:
        return {
            "ok": False,
            "error": "EMERGENT_LLM_KEY not configured",
            "amount_paise": None,
            "utr": None,
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
        utr = normalize_ref(parsed.get("utr_or_ref") or "")
        return {
            "ok": True,
            "error": None,
            "amount_paise": amount_paise,
            "utr": utr or None,
            "txn_time": parsed.get("txn_time"),
            "payer_name": parsed.get("payer_name"),
            "payee_name": parsed.get("payee_name"),
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
            "confidence": 0,
            "raw": None,
            "model": MODEL,
        }
