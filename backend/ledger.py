"""Lightweight double-entry ledger. Posted journals are immutable; corrections use reversals."""
from db import db, clean
from util import iso
from audit import next_formatted, audit


class LedgerError(Exception):
    pass


async def post_journal(*, source_type: str, source_id: str, narration: str,
                       lines: list[dict], actor=None, approved_by: str = "",
                       date: str = None, post_close: bool = False):
    """lines: [{account_code, debit, credit}] in paise. Debits must equal credits."""
    total_debit = sum(int(l.get("debit", 0)) for l in lines)
    total_credit = sum(int(l.get("credit", 0)) for l in lines)
    if total_debit != total_credit:
        raise LedgerError(f"Unbalanced journal: debit {total_debit} != credit {total_credit}")
    if total_debit == 0:
        raise LedgerError("Empty journal")

    # validate accounts exist
    for l in lines:
        acc = await db.chart_of_accounts.find_one({"code": l["account_code"]})
        if not acc:
            raise LedgerError(f"Unknown account {l['account_code']}")

    n, journal_no = await next_formatted("journal", "JV", 6)
    actor_id = actor.get("user_id") if isinstance(actor, dict) else (actor or "system")
    entry = {
        "id": f"jv_{n}",
        "journal_no": journal_no,
        "source_type": source_type,
        "source_id": source_id,
        "narration": narration,
        "lines": [{"account_code": l["account_code"], "debit": int(l.get("debit", 0)),
                   "credit": int(l.get("credit", 0))} for l in lines],
        "total_debit": total_debit,
        "total_credit": total_credit,
        "status": "posted",
        "created_by": actor_id,
        "approved_by": approved_by,
        "posted_at": iso(),
        "date": date or iso(),
        "reversal_of": None,
        "reversed_by": None,
        "evidence_status": "linked" if source_id else "missing",
        "post_close": post_close,
    }
    await db.journal_entries.insert_one(entry)
    await audit("journal.post", actor=actor, entity_type="journal_entry",
                entity_id=entry["id"], after={"journal_no": journal_no, "total": total_debit},
                reason=narration, post_close=post_close)
    return clean(entry)


async def reverse_journal(journal_id: str, *, reason: str, actor=None):
    orig = await db.journal_entries.find_one({"id": journal_id})
    if not orig:
        raise LedgerError("Journal not found")
    if orig.get("reversed_by"):
        raise LedgerError("Already reversed")
    flipped = [{"account_code": l["account_code"], "debit": l["credit"], "credit": l["debit"]}
               for l in orig["lines"]]
    n, journal_no = await next_formatted("journal", "JV", 6)
    actor_id = actor.get("user_id") if isinstance(actor, dict) else (actor or "system")
    rev = {
        "id": f"jv_{n}",
        "journal_no": journal_no,
        "source_type": orig["source_type"],
        "source_id": orig["source_id"],
        "narration": f"Reversal of {orig['journal_no']}: {reason}",
        "lines": flipped,
        "total_debit": orig["total_credit"],
        "total_credit": orig["total_debit"],
        "status": "posted",
        "created_by": actor_id,
        "approved_by": "",
        "posted_at": iso(),
        "date": iso(),
        "reversal_of": orig["id"],
        "reversed_by": None,
        "evidence_status": "linked",
    }
    await db.journal_entries.insert_one(rev)
    await db.journal_entries.update_one({"id": orig["id"]}, {"$set": {"reversed_by": rev["id"]}})
    await audit("journal.reverse", actor=actor, entity_type="journal_entry",
                entity_id=orig["id"], reason=reason, after={"reversal": journal_no})
    return clean(rev)


async def trial_balance() -> list[dict]:
    pipeline = [
        {"$unwind": "$lines"},
        {"$group": {"_id": "$lines.account_code",
                    "debit": {"$sum": "$lines.debit"},
                    "credit": {"$sum": "$lines.credit"}}},
    ]
    rows = {}
    async for r in db.journal_entries.aggregate(pipeline):
        rows[r["_id"]] = {"debit": r["debit"], "credit": r["credit"]}
    out = []
    async for acc in db.chart_of_accounts.find({}, {"_id": 0}).sort("code", 1):
        d = rows.get(acc["code"], {"debit": 0, "credit": 0})
        net = d["debit"] - d["credit"]
        out.append({"code": acc["code"], "name": acc["name"], "type": acc["type"],
                    "debit": d["debit"], "credit": d["credit"], "balance": net})
    return out


async def account_balance(code: str) -> int:
    pipeline = [
        {"$unwind": "$lines"},
        {"$match": {"lines.account_code": code}},
        {"$group": {"_id": None, "debit": {"$sum": "$lines.debit"}, "credit": {"$sum": "$lines.credit"}}},
    ]
    async for r in db.journal_entries.aggregate(pipeline):
        return r["debit"] - r["credit"]
    return 0
