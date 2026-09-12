#!/usr/bin/env python3
"""Import One10 Durga Pujo subscription Excel → households/intents/payments/receipts."""
from __future__ import annotations

import asyncio
import json
import os
import sys
import traceback
from pathlib import Path

sys.path.insert(0, "/root/one10events-app/backend")
os.chdir("/root/one10events-app/backend")

for line in Path(".env").read_text().splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

from audit import audit  # noqa: E402
from config import get_active_cycle_id, get_settings  # noqa: E402
from db import db, new_id  # noqa: E402
from routes_collect import _issue_receipt  # noqa: E402
from util import iso  # noqa: E402

DRY = "--dry-run" in sys.argv
DATA = Path("/tmp/one10_subscription_import.json")


def placeholder_mobile(tower_no: str, flat_no: str) -> str:
    digits = "".join(ch for ch in f"{tower_no}{flat_no}" if ch.isdigit()) or "9000000000"
    base = (digits + "9000000000")[:10]
    if base[0] not in "6789":
        base = "9" + base[1:]
    return base


async def resolve_flat(tower_no: str, flat_no: str):
    tower_id = f"tower_{tower_no}"
    tower = await db.towers.find_one({"id": tower_id})
    flat = await db.flats.find_one({"tower_id": tower_id, "number": flat_no})
    return tower, flat


async def upsert_household(cycle_id, tower, flat, name, phone):
    hh = await db.households.find_one(
        {
            "cycle_id": cycle_id,
            "tower_id": tower["id"],
            "flat_id": flat["id"],
            "is_deleted": {"$ne": True},
        }
    )
    mobile = phone or placeholder_mobile(str(tower.get("id") or ""), flat["number"])
    if hh:
        patch = {}
        if name and (
            not hh.get("primary_name")
            or hh.get("primary_name") in ("Check", "Test", "")
        ):
            patch["primary_name"] = name
        elif name:
            patch["excel_import_name"] = name
        if phone and (
            not hh.get("primary_mobile")
            or hh.get("primary_mobile") in ("9876543210", "0000000000")
        ):
            patch["primary_mobile"] = phone
        if patch and not DRY:
            patch["updated_at"] = iso()
            await db.households.update_one({"id": hh["id"]}, {"$set": patch})
            hh = {**hh, **patch}
        return hh, False

    hh = {
        "id": new_id("hh"),
        "cycle_id": cycle_id,
        "tower_id": tower["id"],
        "tower_name": tower["name"],
        "flat_id": flat["id"],
        "flat_number": flat["number"],
        "occupancy_type": "owner_resident",
        "family_members": 1,
        "family_display_name": "",
        "primary_name": name,
        "primary_mobile": mobile,
        "email": "",
        "created_at": iso(),
        "is_deleted": False,
        "source": "excel_import_2026",
    }
    if not DRY:
        await db.households.insert_one(dict(hh))
    return hh, True


def subscription_components(settings: dict):
    comps = (
        (settings.get("subscription") or {}).get("components")
        or (settings.get("cycle") or {}).get("subscription", {}).get("components")
        or []
    )
    out = []
    for c in comps:
        out.append(
            {
                "code": c.get("code"),
                "label": c.get("label"),
                "amount_paise": int(c.get("amount_paise") or 0),
                "account_code": c.get("account_code"),
            }
        )
    return out


def base_amount_paise(settings: dict) -> int:
    sub = settings.get("subscription") or {}
    if sub.get("base_amount_paise") or sub.get("base_amount_paise") is not None:
        return int(sub.get("base_amount_paise") or sub.get("base_amount_paise"))
    cycle_sub = (settings.get("cycle") or {}).get("subscription") or {}
    if cycle_sub.get("base_amount_paise") or sub.get("base_amount_paise") is not None:
        return int(cycle_sub.get("base_amount_paise") or sub.get("base_amount_paise"))
    comps = subscription_components(settings)
    if comps:
        return sum(int(c["amount_paise"]) for c in comps)
    return 350000


async def get_or_create_subscription_intent(cycle_id, hh, name, phone, settings):
    existing_paid = await db.subscription_intents.find_one(
        {
            "household_id": hh["id"],
            "cycle_id": cycle_id,
            "kind": "subscription",
            "status": "paid",
        }
    )
    if existing_paid:
        return existing_paid, "already_paid"

    pending = await db.subscription_intents.find_one(
        {
            "household_id": hh["id"],
            "cycle_id": cycle_id,
            "kind": "subscription",
            "status": {
                "$in": [
                    "payment_pending",
                    "pending",
                    "authorised",
                    "partially_paid",
                ]
            },
        },
        sort=[("created_at", -1)],
    )
    if pending:
        if not DRY:
            await db.subscription_intents.update_one(
                {"id": pending["id"]},
                {
                    "$set": {
                        "payer_name": name or pending.get("payer_name"),
                        "payer_mobile": phone
                        or pending.get("payer_mobile")
                        or hh.get("primary_mobile"),
                        "method": "bank_transfer",
                    }
                },
            )
            pending = await db.subscription_intents.find_one({"id": pending["id"]})
        return pending, "reused_pending"

    base = base_amount_paise(settings)
    comps = subscription_components(settings)
    intent = {
        "id": new_id("intent"),
        "cycle_id": cycle_id,
        "household_id": hh["id"],
        "kind": "subscription",
        "base_amount": base,
        "donation_amount": 0,
        "total_amount": base,
        "components": comps,
        "payer_is_member": True,
        "payer_name": name,
        "payer_mobile": phone or hh.get("primary_mobile"),
        "payer_relationship": "self",
        "status": "payment_pending",
        "method": "bank_transfer",
        "created_at": iso(),
        "source": "excel_import_2026",
    }
    if not DRY:
        await db.subscription_intents.insert_one(dict(intent))
    return intent, "created"


async def create_donation_intent(cycle_id, hh, name, phone, amount_paise):
    intent = {
        "id": new_id("intent"),
        "cycle_id": cycle_id,
        "household_id": hh["id"],
        "kind": "donation",
        "donor_type": "resident",
        "base_amount": 0,
        "donation_amount": amount_paise,
        "total_amount": amount_paise,
        "components": [],
        "payer_is_member": True,
        "payer_name": name,
        "payer_mobile": phone or hh.get("primary_mobile"),
        "payer_relationship": "donor",
        "status": "payment_pending",
        "method": "bank_transfer",
        "notes": "Imported from subscription Excel (Donation sheet)",
        "created_at": iso(),
        "source": "excel_import_2026",
    }
    if not DRY:
        await db.subscription_intents.insert_one(dict(intent))
    return intent


async def issue_for_row(row, cycle_id, settings, summary):
    txn = (row.get("txn") or "").strip()
    if not txn:
        summary["skipped"].append({**row, "reason": "missing_txn"})
        return

    existing_pay = await db.payments.find_one({"provider_payment_id": txn})
    if existing_pay:
        summary["skipped"].append(
            {**row, "reason": "txn_already_used", "payment_id": existing_pay.get("id")}
        )
        return

    existing_rcpt = await db.receipts.find_one({"import_txn": txn})
    if existing_rcpt:
        summary["skipped"].append(
            {
                **row,
                "reason": "receipt_already_exists",
                "receipt_no": existing_rcpt.get("receipt_no"),
            }
        )
        return

    tower, flat = await resolve_flat(row["tower"], row["flat"])
    if not tower or not flat:
        summary["errors"].append(
            {
                **row,
                "reason": f"flat_not_found tower={row['tower']} flat={row['flat']}",
            }
        )
        return

    hh, created_hh = await upsert_household(
        cycle_id, tower, flat, row["name"], row.get("phone") or ""
    )
    amount_paise = int(round(float(row["amount_rupees"]) * 100))

    if row["kind"] == "subscription":
        expected = base_amount_paise(settings)
        if amount_paise != expected:
            summary["errors"].append(
                {
                    **row,
                    "reason": f"amount_mismatch expected_base={expected} got={amount_paise}",
                }
            )
            return
        intent, intent_mode = await get_or_create_subscription_intent(
            cycle_id, hh, row["name"], row.get("phone") or "", settings
        )
        if intent_mode == "already_paid":
            summary["skipped"].append(
                {
                    **row,
                    "reason": "household_already_paid_subscription",
                    "intent_id": intent["id"],
                }
            )
            return
    else:
        intent = await create_donation_intent(
            cycle_id, hh, row["name"], row.get("phone") or "", amount_paise
        )
        intent_mode = "created_donation"

    if DRY:
        summary["would_issue"].append(
            {
                "name": row["name"],
                "tower": row["tower"],
                "flat": row["flat"],
                "txn": txn,
                "kind": row["kind"],
                "amount_paise": amount_paise,
                "intent_mode": intent_mode,
                "household_id": hh["id"],
                "intent_id": intent["id"],
                "hh_created": created_hh,
            }
        )
        return

    pay = {
        "id": new_id("pay"),
        "provider": "bank_transfer",
        "provider_payment_id": txn,
        "intent_id": intent["id"],
        "amount": amount_paise,
        "currency": "INR",
        "status": "captured",
        "bank_verified": False,
        "proof_doc_id": None,
        "created_at": iso(),
        "source": "excel_import_2026",
        "payer_name": row["name"],
        "bank_statement_name": row.get("bank_name") or "",
    }
    try:
        await db.payments.insert_one(dict(pay))
    except Exception as e:
        summary["errors"].append({**row, "reason": f"payment_insert_failed: {e}"})
        return

    intent = await db.subscription_intents.find_one({"id": intent["id"]})
    receipt = await _issue_receipt(
        intent,
        method="bank_transfer",
        masked_ref="UTR-" + txn[-4:],
        provider_payment_id=txn,
        debit_account="1001",
        paid_amount_paise=amount_paise,
    )
    if not receipt:
        summary["errors"].append(
            {
                **row,
                "reason": "issue_receipt_returned_none",
                "intent_id": intent["id"],
            }
        )
        return

    await db.receipts.update_one(
        {"id": receipt["id"]},
        {
            "$set": {
                "bank_verified": False,
                "verification_level": "committee_recorded",
                "import_source": "excel_one10_3rd_yr_2026",
                "import_txn": txn,
            }
        },
    )
    await audit(
        "receipt.import_excel",
        entity_type="receipt",
        entity_id=receipt["id"],
        after={
            "receipt_no": receipt.get("receipt_no"),
            "txn": txn,
            "kind": row["kind"],
            "name": row["name"],
        },
    )
    summary["issued"].append(
        {
            "name": row["name"],
            "tower": row["tower"],
            "flat": row["flat"],
            "txn": txn,
            "kind": row["kind"],
            "receipt_no": receipt.get("receipt_no"),
            "receipt_id": receipt.get("id"),
            "intent_id": intent["id"],
            "household_id": hh["id"],
            "intent_mode": intent_mode,
        }
    )


async def main():
    rows = json.loads(DATA.read_text())
    settings = await get_settings()
    cycle_id = await get_active_cycle_id()
    cycle = await db.annual_cycles.find_one({"id": cycle_id}, {"_id": 0}) or {}
    if cycle:
        settings = {**settings, "cycle": cycle}
        settings.setdefault("subscription", {})
        if not settings["subscription"].get("components"):
            settings["subscription"]["components"] = (
                cycle.get("subscription") or {}
            ).get("components") or []
        if settings["subscription"].get("base_amount_paise") is None:
            settings["subscription"]["base_amount_paise"] = (
                cycle.get("subscription") or {}
            ).get("base_amount_paise") or base_amount_paise(settings)

    summary = {
        "issued": [],
        "would_issue": [],
        "skipped": [],
        "errors": [],
        "dry_run": DRY,
        "cycle_id": cycle_id,
        "base_paise": base_amount_paise(settings),
        "row_count": len(rows),
    }
    for row in rows:
        try:
            await issue_for_row(row, cycle_id, settings, summary)
        except Exception as e:
            summary["errors"].append(
                {
                    **row,
                    "reason": f"exception: {type(e).__name__}: {e}",
                    "trace": traceback.format_exc()[-800:],
                }
            )

    Path("/tmp/one10_import_result.json").write_text(
        json.dumps(summary, indent=2, default=str)
    )
    print(
        json.dumps(
            {
                "dry_run": DRY,
                "row_count": len(rows),
                "base_paise": summary["base_paise"],
                "issued": len(summary["issued"]),
                "would_issue": len(summary["would_issue"]),
                "skipped": len(summary["skipped"]),
                "errors": len(summary["errors"]),
                "error_samples": summary["errors"][:8],
                "skip_samples": summary["skipped"][:8],
                "issued_samples": (summary["issued"] or summary["would_issue"])[:8],
            },
            indent=2,
            default=str,
        )
    )


if __name__ == "__main__":
    asyncio.get_event_loop().run_until_complete(main())
