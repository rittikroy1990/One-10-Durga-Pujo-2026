"""Razorpay integration: server-side order creation, checkout-signature verification and
raw-body webhook signature verification. Test-mode-safe: works with placeholder keys so the
verified state machine is demonstrable without a live account. No fake-success path runs when
RAZORPAY_MODE=live."""
import hashlib
import hmac
import os
import secrets

RAZORPAY_MODE = (os.environ.get("RAZORPAY_MODE") or "test").strip().lower()
KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "")
KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")
WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")

PROVIDER = "razorpay"


def is_live() -> bool:
    return RAZORPAY_MODE == "live"


def keys_configured() -> bool:
    return bool(KEY_ID) and bool(KEY_SECRET) and not KEY_ID.endswith("placeholder")


def _try_live_order(amount_paise: int, receipt: str, notes: dict):
    """Attempt a real Razorpay order when a working key is present."""
    try:
        import razorpay
        client = razorpay.Client(auth=(KEY_ID, KEY_SECRET))
        order = client.order.create({
            "amount": amount_paise,
            "currency": "INR",
            "receipt": receipt[:40],
            "payment_capture": 1,
            "notes": notes,
        })
        return order["id"], "live"
    except Exception:
        return None, None


def create_order(amount_paise: int, receipt: str, notes: dict | None = None):
    """Returns (provider_order_id, mode). In test mode without a live account we mint a
    synthetic order id so the verification state machine can be exercised end-to-end."""
    notes = notes or {}
    if is_live():
        oid, mode = _try_live_order(amount_paise, receipt, notes)
        if oid:
            return oid, mode
        raise RuntimeError("Razorpay live order creation failed")
    # test mode: try live keys first (real test account), else synthetic
    if keys_configured():
        oid, mode = _try_live_order(amount_paise, receipt, notes)
        if oid:
            return oid, mode
    return f"order_test_{secrets.token_hex(8)}", "test"


def checkout_signature(order_id: str, payment_id: str) -> str:
    msg = f"{order_id}|{payment_id}".encode()
    return hmac.new(KEY_SECRET.encode(), msg, hashlib.sha256).hexdigest()


def verify_checkout_signature(order_id: str, payment_id: str, signature: str) -> bool:
    if not (order_id and payment_id and signature):
        return False
    expected = checkout_signature(order_id, payment_id)
    return hmac.compare_digest(expected, signature)


def webhook_signature(raw_body: bytes) -> str:
    return hmac.new(WEBHOOK_SECRET.encode(), raw_body, hashlib.sha256).hexdigest()


def verify_webhook_signature(raw_body: bytes, signature: str) -> bool:
    if not signature:
        return False
    expected = webhook_signature(raw_body)
    return hmac.compare_digest(expected, signature)


def simulate_success_signature(order_id: str) -> tuple[str, str]:
    """Preview/test only: produce a valid (payment_id, signature) pair to demonstrate the
    verified path. Guarded — never invoked when RAZORPAY_MODE=live."""
    if is_live():
        raise RuntimeError("Simulation disabled in live mode")
    payment_id = f"pay_test_{secrets.token_hex(8)}"
    return payment_id, checkout_signature(order_id, payment_id)
