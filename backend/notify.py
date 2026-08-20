"""Notifications abstraction. Provider (Resend/SendGrid) is deferred; sends are recorded and
never asserted as delivered without provider confirmation. Failures never affect finance state."""
import os

from db import db, new_id
from util import iso

EMAIL_PROVIDER = (os.environ.get("EMAIL_PROVIDER") or "").strip().lower()


async def notify(*, channel: str, to: str, template: str, subject: str = "",
                 data: dict | None = None):
    rec = {
        "id": new_id("ntf"),
        "channel": channel,
        "to": to,
        "template": template,
        "subject": subject,
        "data": data or {},
        "provider": EMAIL_PROVIDER or "unconfigured",
        "status": "queued" if EMAIL_PROVIDER else "not_sent_provider_unconfigured",
        "delivery_confirmed": False,
        "created_at": iso(),
    }
    # Provider integration deferred: when EMAIL_PROVIDER + EMAIL_API_KEY are configured,
    # dispatch here and update status only on provider confirmation.
    await db.notifications.insert_one(rec)
    rec.pop("_id", None)
    return rec
