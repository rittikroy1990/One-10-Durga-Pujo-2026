"""Shared utilities: money (paise), time (UTC<->IST), INR words, formula-injection neutralisation."""
import re
from datetime import datetime, timezone

import pytz

IST = pytz.timezone("Asia/Kolkata")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime | None = None) -> str:
    return (dt or now_utc()).astimezone(timezone.utc).isoformat()


def to_ist(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(IST)


def rupees_to_paise(rupees) -> int:
    return int(round(float(rupees) * 100))


def paise_to_rupees(paise: int) -> float:
    return round((paise or 0) / 100.0, 2)


def fmt_inr(paise: int) -> str:
    """Format paise as Indian-grouped rupees string, e.g. 350000 -> '3,500.00'."""
    rupees = paise_to_rupees(paise)
    whole = int(rupees)
    frac = int(round((rupees - whole) * 100))
    s = str(whole)
    if len(s) > 3:
        last3 = s[-3:]
        rest = s[:-3]
        rest = re.sub(r"(\d)(?=(\d\d)+$)", r"\1,", rest)
        s = rest + "," + last3
    return f"{s}.{frac:02d}"


_ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
         "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
         "Seventeen", "Eighteen", "Nineteen"]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _two(n: int) -> str:
    if n < 20:
        return _ONES[n]
    return (_TENS[n // 10] + (" " + _ONES[n % 10] if n % 10 else "")).strip()


def _three(n: int) -> str:
    h = n // 100
    r = n % 100
    out = ""
    if h:
        out += _ONES[h] + " Hundred"
        if r:
            out += " "
    if r:
        out += _two(r)
    return out


def rupees_words(paise: int) -> str:
    """Indian-system amount in words, e.g. 'Rupees Three Thousand Five Hundred Only'."""
    rupees = int(paise // 100)
    paisa = int(paise % 100)
    if rupees == 0:
        words = "Zero"
    else:
        parts = []
        crore = rupees // 10000000
        rupees %= 10000000
        lakh = rupees // 100000
        rupees %= 100000
        thousand = rupees // 1000
        rupees %= 1000
        hundred = rupees
        if crore:
            parts.append(_two(crore) + " Crore")
        if lakh:
            parts.append(_two(lakh) + " Lakh")
        if thousand:
            parts.append(_two(thousand) + " Thousand")
        if hundred:
            parts.append(_three(hundred))
        words = " ".join(parts).strip()
    out = f"Rupees {words}"
    if paisa:
        out += f" and {_two(paisa)} Paise"
    return out + " Only"


def neutralise_cell(value):
    """Neutralise spreadsheet formula-injection: prefix cells starting with = + - @ with a quote."""
    if value is None:
        return ""
    s = str(value)
    if s and s[0] in ("=", "+", "-", "@"):
        return "'" + s
    return s


MOBILE_RE = re.compile(r"^[6-9]\d{9}$")


def valid_indian_mobile(m: str) -> bool:
    return bool(MOBILE_RE.match((m or "").strip()))


def mask_mobile(m: str) -> str:
    m = (m or "").strip()
    if len(m) >= 4:
        return "xxxxxx" + m[-4:]
    return "xxxx"


def mask_name(name: str) -> str:
    name = (name or "").strip()
    if not name:
        return ""
    parts = name.split()
    out = []
    for p in parts:
        out.append(p[0] + ("*" * max(len(p) - 1, 1)))
    return " ".join(out)
