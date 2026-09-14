"""Excel template download + upload import for subscription/donation UPI payments.

Uploading a filled template upserts households/intents, records payments, and issues receipts.
"""
from __future__ import annotations

import csv
import io
import re
import traceback
from typing import Any

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

from audit import audit
from config import get_active_cycle_id, get_settings
from db import db, new_id
from routes_collect import _issue_receipt
from util import iso

TEMPLATE_FILENAME = "one10_subscription_payment_template.xlsx"
IMPORT_SOURCE = "admin_excel_template"

TEMPLATE_HEADERS = [
    "Kind",
    "Name",
    "Bank Name (if different)",
    "Phone",
    "Tower",
    "Flat",
    "Amount (₹)",
    "UTR / UPI Transaction ID",
]

HEADER_ALIASES = {
    "kind": "kind",
    "type": "kind",
    "name": "name",
    "payer_name": "name",
    "resident_name": "name",
    "bank_name": "bank_name",
    "bank_name_if_different": "bank_name",
    "bank_statement_name": "bank_name",
    "phone": "phone",
    "mobile": "phone",
    "tower": "tower",
    "tower_no": "tower",
    "tower_number": "tower",
    "ower": "tower",  # common typo from source sheet
    "flat": "flat",
    "flat_no": "flat",
    "flat_number": "flat",
    "amount": "amount_rupees",
    "amount_": "amount_rupees",
    "amount_rs": "amount_rupees",
    "amount_rupees": "amount_rupees",
    "bank_transaction_id": "txn",
    "bank_txn_id": "txn",
    "transaction_id": "txn",
    "txn": "txn",
    "utr": "txn",
    "utr_ref": "txn",
    "ref": "txn",
    "reference": "txn",
}


def _normalize_header(h: str) -> str:
    return re.sub(r"[^a-z0-9_]+", "_", (h or "").strip().lower()).strip("_")


def _map_header(h: str) -> str | None:
    key = _normalize_header(h)
    if key in HEADER_ALIASES:
        return HEADER_ALIASES[key]
    # Soft match amount headers like "amount_rs" / "amount_inr"
    if key.startswith("amount"):
        return "amount_rupees"
    if "transaction" in key or key.endswith("_id") and "bank" in key:
        return "txn"
    return None


def placeholder_mobile(tower_no: str, flat_no: str) -> str:
    digits = "".join(ch for ch in f"{tower_no}{flat_no}" if ch.isdigit()) or "9000000000"
    base = (digits + "9000000000")[:10]
    if base[0] not in "6789":
        base = "9" + base[1:]
    return base


def subscription_components(settings: dict) -> list[dict]:
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
                "account_code": c.get("account_code") or c.get("gl_code") or "",
            }
        )
    return out


def base_amount_paise(settings: dict) -> int:
    sub = settings.get("subscription") or {}
    if sub.get("base_amount_paise") is not None:
        return int(sub.get("base_amount_paise") or 0)
    cycle_sub = (settings.get("cycle") or {}).get("subscription") or {}
    if cycle_sub.get("base_amount_paise") is not None:
        return int(cycle_sub.get("base_amount_paise") or 0)
    comps = subscription_components(settings)
    if comps:
        return sum(int(c["amount_paise"]) for c in comps)
    return 350000


async def load_import_settings() -> tuple[str, dict]:
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
    return cycle_id, settings


def build_template_xlsx(*, base_rupees: float = 3500.0) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Payments"

    header_fill = PatternFill("solid", fgColor="7A1F1F")
    header_font = Font(color="FFFFFF", bold=True)
    for col, title in enumerate(TEMPLATE_HEADERS, start=1):
        cell = ws.cell(1, col, title)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", wrap_text=True)

    # Sample subscription + donation rows (safe placeholders — operator replaces)
    samples = [
        ["subscription", "Example Resident", "", "9876543210", "6", "11B", base_rupees, "UTR1234567890"],
        ["donation", "Example Donor", "", "9876543210", "10", "18B", 1000, "UTR0987654321"],
    ]
    for r_idx, row in enumerate(samples, start=2):
        for c_idx, val in enumerate(row, start=1):
            ws.cell(r_idx, c_idx, val)

    widths = [14, 22, 22, 14, 10, 10, 12, 22]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

    dv = DataValidation(type="list", formula1='"subscription,donation"', allow_blank=False)
    dv.error = "Kind must be subscription or donation"
    dv.errorTitle = "Invalid Kind"
    ws.add_data_validation(dv)
    dv.add("A2:A5000")

    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:H{max(2, len(samples) + 1)}"

    info = wb.create_sheet("Instructions", 0)
    info["A1"] = "One 10 Durga Pujo — Subscription / Donation payment import"
    info["A1"].font = Font(bold=True, size=14)
    lines = [
        "",
        "1. Fill the Payments sheet (one successful UPI payment per row).",
        "2. Kind: subscription (flat fee) or donation (extra / standalone donation).",
        f"3. Amount (₹): for subscription use exactly {base_rupees:g} (current base). Donations can be any amount.",
        "4. Tower: tower number only (e.g. 6). Flat: flat number (e.g. 11B).",
        "5. UTR / UPI Transaction ID is required and must be unique — used to avoid duplicate receipts.",
        "6. Phone is optional (10 digits). Name is required.",
        "7. Delete the example rows before uploading, or replace them with real data.",
        "8. Upload the filled .xlsx from Admin → Collection → Excel import.",
        "9. Each successful row upserts the household, records the payment as UPI, and automatically issues a receipt.",
        "10. Re-uploading the same UTR / UPI Transaction ID skips that row (idempotent).",
    ]
    for i, line in enumerate(lines, start=2):
        info[f"A{i}"] = line
    info.column_dimensions["A"].width = 110

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _sheet_rows(ws) -> list[list]:
    return [[("" if c is None else c) for c in r] for r in ws.iter_rows(values_only=True)]


def _iter_workbook_grids(content: bytes, filename: str) -> list[tuple[str, list[list]]]:
    """Return [(sheet_name, grid), ...] for xlsx, or a single CSV grid."""
    name = (filename or "").lower()
    if name.endswith(".xlsx") or name.endswith(".xls"):
        wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        named = {s.lower(): s for s in wb.sheetnames}
        # Multi-sheet legacy: Subscription + Donation
        if "subscription" in named or "donation" in named or "donations" in named:
            out = []
            for key, default_kind in (
                ("subscription", "subscription"),
                ("donation", "donation"),
                ("donations", "donation"),
                ("payments", None),
            ):
                if key in named:
                    out.append((named[key], _sheet_rows(wb[named[key]]), default_kind))
            if out:
                return out
        if "payments" in named:
            return [(named["payments"], _sheet_rows(wb[named["payments"]]), None)]
        # Skip Instructions sheet if present
        for title in wb.sheetnames:
            if title.lower() in ("instructions", "readme", "help"):
                continue
            return [(title, _sheet_rows(wb[title]), None)]
        return []

    text = content.decode("utf-8-sig", errors="replace")
    return [("CSV", list(csv.reader(io.StringIO(text))), None)]


def _cell_str(val: Any) -> str:
    if val is None:
        return ""
    if isinstance(val, float) and val.is_integer():
        return str(int(val))
    return str(val).strip()


def _rows_from_grid(grid: list[list], *, default_kind: str | None = None, sheet_label: str = "") -> list[dict]:
    if not grid:
        return []

    header_idx = None
    mapped = []
    for i, raw in enumerate(grid[:30]):
        if not any(_cell_str(c) for c in raw):
            continue
        cols = [_map_header(_cell_str(c)) for c in raw]
        if "name" in cols and ("txn" in cols or "amount_rupees" in cols):
            header_idx = i
            mapped = cols
            break
    if header_idx is None:
        return []

    rows = []
    for excel_row, raw in enumerate(grid[header_idx + 1 :], start=header_idx + 2):
        if not any(_cell_str(c) for c in (raw or [])):
            continue
        data: dict[str, Any] = {"excel_row": excel_row}
        for idx, key in enumerate(mapped):
            if not key:
                continue
            data[key] = raw[idx] if idx < len(raw) else ""

        name = _cell_str(data.get("name"))
        if not name:
            continue
        # Ignore leftover template examples unless operator changed the UTR
        if name.lower().startswith("example ") and _cell_str(data.get("txn")).upper().startswith("UTR"):
            continue

        kind_raw = _cell_str(data.get("kind")).lower()
        if kind_raw in ("sub", "subs", "subscription", "pujo", "durga"):
            kind = "subscription"
        elif kind_raw in ("donation", "donate", "don", "gift"):
            kind = "donation"
        elif default_kind:
            kind = default_kind
        else:
            kind = "subscription"

        phone_digits = "".join(ch for ch in _cell_str(data.get("phone")) if ch.isdigit())
        phone = phone_digits[-10:] if len(phone_digits) >= 10 else (phone_digits or "")

        tower = _cell_str(data.get("tower"))
        if tower.lower().startswith("tower"):
            tower = tower.split()[-1]
        tower = "".join(ch for ch in tower if ch.isdigit()) or tower

        flat = _cell_str(data.get("flat")).upper().replace(" ", "")
        txn = _cell_str(data.get("txn")).replace(" ", "")

        amount_raw = data.get("amount_rupees")
        try:
            if isinstance(amount_raw, (int, float)):
                amount_rupees = float(amount_raw)
            else:
                amount_rupees = float(re.sub(r"[^\d.]", "", _cell_str(amount_raw) or "0") or 0)
        except Exception:
            amount_rupees = 0.0

        rows.append(
            {
                "excel_row": excel_row,
                "sheet": sheet_label,
                "kind": kind,
                "name": name,
                "bank_name": _cell_str(data.get("bank_name")),
                "phone": phone,
                "tower": tower,
                "flat": flat,
                "amount_rupees": amount_rupees,
                "txn": txn,
            }
        )
    return rows


def parse_import_rows(content: bytes, filename: str) -> list[dict]:
    """Parse uploaded spreadsheet into normalized row dicts."""
    grids = _iter_workbook_grids(content, filename)
    if not grids:
        return []

    rows: list[dict] = []
    for item in grids:
        if len(item) == 3:
            sheet_name, grid, default_kind = item
        else:
            sheet_name, grid = item
            default_kind = None
        rows.extend(_rows_from_grid(grid, default_kind=default_kind, sheet_label=sheet_name))

    if not rows:
        raise ValueError(
            "Could not find data rows. Required columns: Name, Tower, Flat, Amount (₹), UTR / UPI Transaction ID."
        )
    return rows


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
        if patch:
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
        "source": IMPORT_SOURCE,
    }
    await db.households.insert_one(dict(hh))
    return hh, True


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
        await db.subscription_intents.update_one(
            {"id": pending["id"]},
            {
                "$set": {
                    "payer_name": name or pending.get("payer_name"),
                    "payer_mobile": phone
                    or pending.get("payer_mobile")
                    or hh.get("primary_mobile"),
                    "method": "upi_qr",
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
        "method": "upi_qr",
        "created_at": iso(),
        "source": IMPORT_SOURCE,
    }
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
        "method": "upi_qr",
        "notes": "Imported from admin Excel template",
        "created_at": iso(),
        "source": IMPORT_SOURCE,
    }
    await db.subscription_intents.insert_one(dict(intent))
    return intent


async def issue_for_row(row, cycle_id, settings, summary, *, dry_run: bool = False, actor=None, request=None):
    txn = (row.get("txn") or "").strip()
    if not txn:
        summary["skipped"].append({**row, "reason": "missing_txn"})
        return
    if not row.get("name"):
        summary["skipped"].append({**row, "reason": "missing_name"})
        return
    if not row.get("tower") or not row.get("flat"):
        summary["errors"].append({**row, "reason": "missing_tower_or_flat"})
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

    amount_paise = int(round(float(row["amount_rupees"]) * 100))
    if amount_paise <= 0:
        summary["errors"].append({**row, "reason": "invalid_amount"})
        return

    if dry_run:
        # Still validate amount / paid status without writing
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
            paid = await db.subscription_intents.find_one(
                {
                    "household_id": (
                        await db.households.find_one(
                            {
                                "cycle_id": cycle_id,
                                "tower_id": tower["id"],
                                "flat_id": flat["id"],
                                "is_deleted": {"$ne": True},
                            }
                        )
                        or {}
                    ).get("id"),
                    "cycle_id": cycle_id,
                    "kind": "subscription",
                    "status": "paid",
                }
            )
            if paid:
                summary["skipped"].append({**row, "reason": "household_already_paid_subscription"})
                return
        summary["would_issue"].append(
            {
                "name": row["name"],
                "tower": row["tower"],
                "flat": row["flat"],
                "txn": txn,
                "kind": row["kind"],
                "amount_paise": amount_paise,
            }
        )
        return

    hh, _created_hh = await upsert_household(
        cycle_id, tower, flat, row["name"], row.get("phone") or ""
    )

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
        # Keep intent total aligned with paid amount
        if int(intent.get("total_amount") or 0) != amount_paise:
            await db.subscription_intents.update_one(
                {"id": intent["id"]},
                {"$set": {"total_amount": amount_paise, "base_amount": amount_paise}},
            )
            intent = await db.subscription_intents.find_one({"id": intent["id"]})
    else:
        intent = await create_donation_intent(
            cycle_id, hh, row["name"], row.get("phone") or "", amount_paise
        )
        intent_mode = "created_donation"

    pay = {
        "id": new_id("pay"),
        "provider": "upi_qr",
        "provider_payment_id": txn,
        "intent_id": intent["id"],
        "amount": amount_paise,
        "currency": "INR",
        "status": "captured",
        "bank_verified": False,
        "proof_doc_id": None,
        "created_at": iso(),
        "source": IMPORT_SOURCE,
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
        method="upi_qr",
        masked_ref="UTR-" + txn[-4:],
        provider_payment_id=txn,
        debit_account="1001",
        request=request,
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
                "import_source": IMPORT_SOURCE,
                "import_txn": txn,
            }
        },
    )
    await audit(
        "receipt.import_excel",
        actor=actor,
        entity_type="receipt",
        entity_id=receipt["id"],
        after={
            "receipt_no": receipt.get("receipt_no"),
            "txn": txn,
            "kind": row["kind"],
            "name": row["name"],
        },
        request=request,
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
            "excel_row": row.get("excel_row"),
        }
    )


async def run_import(
    content: bytes,
    filename: str,
    *,
    dry_run: bool = False,
    actor=None,
    request=None,
) -> dict:
    rows = parse_import_rows(content, filename)
    if not rows:
        raise ValueError("No data rows found. Fill the Payments sheet and try again.")

    cycle_id, settings = await load_import_settings()
    summary = {
        "issued": [],
        "would_issue": [],
        "skipped": [],
        "errors": [],
        "dry_run": dry_run,
        "cycle_id": cycle_id,
        "base_paise": base_amount_paise(settings),
        "row_count": len(rows),
    }
    for row in rows:
        try:
            await issue_for_row(
                row,
                cycle_id,
                settings,
                summary,
                dry_run=dry_run,
                actor=actor,
                request=request,
            )
        except Exception as e:
            summary["errors"].append(
                {
                    **row,
                    "reason": f"exception: {type(e).__name__}: {e}",
                    "trace": traceback.format_exc()[-800:],
                }
            )

    issued_n = len(summary["issued"])
    would_n = len(summary["would_issue"])
    skip_n = len(summary["skipped"])
    err_n = len(summary["errors"])
    if dry_run:
        message = (
            f"Dry run — {would_n} would issue, {skip_n} skipped, {err_n} errors "
            f"(from {summary['row_count']} rows)."
        )
    else:
        message = (
            f"Import done — {issued_n} receipts issued, {skip_n} skipped, {err_n} errors "
            f"(from {summary['row_count']} rows)."
        )
    summary["ok"] = err_n == 0
    summary["message"] = message
    # Cap payloads for API response
    summary["issued"] = summary["issued"][:200]
    summary["would_issue"] = summary["would_issue"][:200]
    summary["skipped"] = summary["skipped"][:100]
    summary["errors"] = summary["errors"][:100]
    return summary
