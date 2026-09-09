"""Cashfree Payment Gateway helpers for One 10 Events checkout."""
from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
from typing import Any

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)

CASHFREE_API_VERSION = "2023-08-01"
CASHFREE_CURRENCY = "INR"
CASHFREE_MIN_AMOUNT = 1.0  # rupees


def cashfree_mode() -> str:
    configured = str(os.environ.get("CASHFREE_MODE") or "").strip().lower()
    if configured in {"sandbox", "production"}:
        return configured
    app_id = str(os.environ.get("CASHFREE_APP_ID") or "").strip()
    if app_id.upper().startswith("TEST"):
        return "sandbox"
    return "production"


def cashfree_base_url() -> str:
    if cashfree_mode() == "sandbox":
        return "https://sandbox.cashfree.com/pg"
    return "https://api.cashfree.com/pg"


def cashfree_configured() -> bool:
    app_id = str(os.environ.get("CASHFREE_APP_ID") or "").strip()
    secret = str(os.environ.get("CASHFREE_SECRET_KEY") or "").strip()
    return bool(app_id and secret)


def cashfree_credentials() -> tuple[str, str]:
    app_id = str(os.environ.get("CASHFREE_APP_ID") or "").strip()
    secret = str(os.environ.get("CASHFREE_SECRET_KEY") or "").strip()
    if not app_id or not secret:
        raise HTTPException(
            status_code=503,
            detail="Online payment is temporarily unavailable",
        )
    public_site = str(
        os.environ.get("PUBLIC_SITE_URL")
        or os.environ.get("APP_URL")
        or ""
    ).lower()
    allow_sandbox = str(
        os.environ.get("CASHFREE_ALLOW_SANDBOX_ON_PRODUCTION") or ""
    ).strip().lower() in {"1", "true", "yes", "on"}
    is_test_key = app_id.upper().startswith("TEST") or secret.startswith("cfsk_ma_test_")
    # Block accidental sandbox keys on a live public site unless explicitly allowed ("for now").
    if is_test_key and public_site and not allow_sandbox:
        logger.error("Blocked Cashfree sandbox credentials on the production site")
        raise HTTPException(
            status_code=503,
            detail="Online payment is temporarily unavailable. Please use UPI QR instead.",
        )
    return app_id, secret


def cashfree_is_test_mode() -> bool:
    explicit = os.environ.get("ORDER_TEST_MODE", "").strip().lower()
    if explicit in {"1", "true", "yes", "on"}:
        return True
    return cashfree_mode() == "sandbox" or str(
        os.environ.get("CASHFREE_APP_ID") or ""
    ).upper().startswith("TEST")


def _auth_headers() -> dict[str, str]:
    app_id, secret = cashfree_credentials()
    return {
        "x-client-id": app_id,
        "x-client-secret": secret,
        "x-api-version": CASHFREE_API_VERSION,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


async def create_cashfree_order(
    *,
    order_id: str,
    amount_rupees: float,
    customer_id: str,
    customer_phone: str,
    customer_email: str | None,
    customer_name: str,
    return_url: str,
    notify_url: str,
    order_note: str,
) -> dict[str, Any]:
    if amount_rupees < CASHFREE_MIN_AMOUNT:
        raise HTTPException(
            status_code=400,
            detail="Payment amount must be at least ₹1",
        )
    payload = {
        "order_id": order_id,
        "order_amount": round(float(amount_rupees), 2),
        "order_currency": CASHFREE_CURRENCY,
        "customer_details": {
            "customer_id": (customer_id or order_id)[:50],
            "customer_phone": "".join(ch for ch in str(customer_phone or "") if ch.isdigit())[-10:],
            "customer_name": (customer_name or "Customer")[:100],
        },
        "order_meta": {
            "return_url": return_url,
            "notify_url": notify_url,
        },
        "order_note": (order_note or "")[:200],
        "order_tags": {
            "source": "one10_events",
        },
    }
    if customer_email:
        payload["customer_details"]["customer_email"] = str(customer_email)[:100]
    phone = payload["customer_details"]["customer_phone"]
    if len(phone) != 10:
        raise HTTPException(status_code=400, detail="A valid 10-digit mobile is required for online payment")

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30, connect=10)) as client:
            response = await client.post(
                f"{cashfree_base_url()}/orders",
                headers=_auth_headers(),
                json=payload,
            )
    except httpx.HTTPError as error:
        logger.exception("Cashfree order creation network error")
        raise HTTPException(
            status_code=500,
            detail="Could not initialise online payment",
        ) from error

    if response.status_code in {401, 403}:
        logger.warning("Cashfree authentication failed: %s", response.text[:300])
        raise HTTPException(status_code=401, detail="Cashfree authentication failed")
    if response.status_code >= 400:
        logger.warning(
            "Cashfree order creation failed (%s): %s",
            response.status_code,
            response.text[:500],
        )
        raise HTTPException(
            status_code=500,
            detail="Could not initialise online payment",
        )

    try:
        result = response.json()
    except ValueError as error:
        raise HTTPException(
            status_code=500,
            detail="Could not initialise online payment",
        ) from error

    session_id = str(result.get("payment_session_id") or "").strip()
    returned_order_id = str(result.get("order_id") or "").strip()
    if not session_id or returned_order_id != order_id:
        logger.error("Cashfree returned an invalid order response: %s", result)
        raise HTTPException(
            status_code=500,
            detail="Could not initialise online payment",
        )
    return result


async def fetch_cashfree_order(order_id: str) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(20, connect=10)) as client:
            response = await client.get(
                f"{cashfree_base_url()}/orders/{order_id}",
                headers=_auth_headers(),
            )
    except httpx.HTTPError as error:
        logger.exception("Cashfree order fetch network error")
        raise HTTPException(
            status_code=502,
            detail="Could not verify payment with Cashfree",
        ) from error
    if response.status_code == 404:
        raise HTTPException(status_code=404, detail="Payment order not found")
    if response.status_code >= 400:
        logger.warning("Cashfree order fetch failed: %s", response.text[:400])
        raise HTTPException(
            status_code=502,
            detail="Could not verify payment with Cashfree",
        )
    return response.json()


async def fetch_cashfree_payments(order_id: str) -> list[dict[str, Any]]:
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(20, connect=10)) as client:
            response = await client.get(
                f"{cashfree_base_url()}/orders/{order_id}/payments",
                headers=_auth_headers(),
            )
    except httpx.HTTPError as error:
        logger.exception("Cashfree payments fetch network error")
        raise HTTPException(
            status_code=502,
            detail="Could not verify payment with Cashfree",
        ) from error
    if response.status_code >= 400:
        logger.warning("Cashfree payments fetch failed: %s", response.text[:400])
        raise HTTPException(
            status_code=502,
            detail="Could not verify payment with Cashfree",
        )
    payload = response.json()
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict) and isinstance(payload.get("payments"), list):
        return payload["payments"]
    return []


def successful_cashfree_payment(payments: list[dict[str, Any]]) -> dict[str, Any] | None:
    for payment in payments:
        status = str(payment.get("payment_status") or payment.get("status") or "").upper()
        if status in {"SUCCESS", "PAID", "CAPTURED"}:
            return payment
    return None


def verify_cashfree_webhook_signature(
    body: bytes,
    signature: str,
    timestamp: str,
) -> bool:
    secret = str(
        os.environ.get("CASHFREE_WEBHOOK_SECRET")
        or os.environ.get("CASHFREE_SECRET_KEY")
        or ""
    ).strip()
    if not secret or not signature or not timestamp:
        return False
    signed_payload = f"{timestamp}{body.decode('utf-8')}"
    digest = hmac.new(
        secret.encode("utf-8"),
        signed_payload.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    expected_b64 = base64.b64encode(digest).decode("utf-8")
    expected_hex = digest.hex()
    return hmac.compare_digest(expected_b64, signature) or hmac.compare_digest(
        expected_hex, signature
    )
