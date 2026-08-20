"""Opaque signed tokens for receipt verification and safe payment-status polling."""
import os

from itsdangerous import URLSafeSerializer, URLSafeTimedSerializer, BadSignature, SignatureExpired

SECRET = os.environ.get("RECEIPT_TOKEN_SECRET", "dev-secret")

_receipt = URLSafeSerializer(SECRET, salt="receipt-verify")
_status = URLSafeTimedSerializer(SECRET, salt="payment-status")


def receipt_token(receipt_id: str) -> str:
    return _receipt.dumps({"r": receipt_id})


def read_receipt_token(token: str) -> str | None:
    try:
        data = _receipt.loads(token)
        return data.get("r")
    except BadSignature:
        return None


def status_token(intent_id: str) -> str:
    return _status.dumps({"i": intent_id})


def read_status_token(token: str, max_age: int = 86400) -> str | None:
    try:
        data = _status.loads(token, max_age=max_age)
        return data.get("i")
    except (BadSignature, SignatureExpired):
        return None
