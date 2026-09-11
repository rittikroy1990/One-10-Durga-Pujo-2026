"""Payment gateway stubs — Razorpay/Cashfree are disabled.

Public payments use uploaded UPI QR + screenshot submit only
(`/payments/upi/session`, `/payments/upi/submit`).
"""

PROVIDER = "disabled"
KEY_ID = ""
KEY_SECRET = ""


def is_live() -> bool:
    return False


def keys_configured() -> bool:
    return False


def create_order(*args, **kwargs):
    raise RuntimeError("Payment gateways are disabled. Use UPI QR payment.")


def verify_checkout_signature(*args, **kwargs) -> bool:
    return False


def verify_webhook_signature(*args, **kwargs) -> bool:
    return False


def simulate_success_signature(*args, **kwargs):
    raise RuntimeError("Payment gateways are disabled.")
