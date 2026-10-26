"""Consolidated food-coupon revenue report (excludes veg breakfast packets — already paid)."""
from __future__ import annotations

import io
from collections import defaultdict
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle

from db import db
from util import iso, to_ist, now_utc

# Breakfast packets are prepaid / already settled — keep them out of this revenue view.
EXCLUDED_MEALS = frozenset({"breakfast_packet"})

VERMILION = colors.HexColor("#D9381E")
BROWN = colors.HexColor("#1F1412")
IVORY = colors.HexColor("#FDFBF7")
GOLD = colors.HexColor("#B5952F")
MUTED = colors.HexColor("#6B5E55")

DAY_ORDER = {
    "sasthi": 1, "shashthi": 1, "saptami": 2, "saptami_ashtami": 3,
    "ashtami": 4, "nabami": 5, "dashami": 6,
}
MEAL_ORDER = {"breakfast": 0, "lunch": 1, "dinner": 2}
DAY_LABELS = {
    "sasthi": "Sasthi", "shashthi": "Shashthi", "saptami": "Saptami",
    "saptami_ashtami": "18 Oct (Sap–Asht)", "ashtami": "Ashtami",
    "nabami": "Nabami", "dashami": "Dashami",
}


def _indian_int(n: int) -> str:
    """Indian grouping: 12,34,567."""
    sign = "-" if n < 0 else ""
    s = str(abs(int(n)))
    if len(s) <= 3:
        return sign + s
    last3, rest = s[-3:], s[:-3]
    parts = []
    while rest:
        parts.append(rest[-2:])
        rest = rest[:-2]
    return sign + ",".join(reversed(parts)) + "," + last3


def _inr(paise: int) -> str:
    rupees = int(round((paise or 0) / 100.0))
    return f"₹{_indian_int(rupees)}"


def _num(n: int) -> str:
    return _indian_int(int(n or 0))


def _meal_code(sel: dict) -> str:
    return (sel.get("meal_code") or sel.get("category") or "").strip().lower()


async def build_food_revenue_report() -> dict:
    """Aggregate active food orders: rate × paid plates, excluding breakfast packets."""
    replaced = {
        o["id"]
        async for o in db.food_subscriptions.find(
            {"replaced_by": {"$exists": True, "$ne": None}}, {"id": 1}
        )
    }

    by_item: dict = {}
    by_day: dict = defaultdict(lambda: {"heads": 0, "paid": 0, "free": 0, "revenue_paise": 0})
    by_meal: dict = defaultdict(lambda: {"heads": 0, "paid": 0, "free": 0, "revenue_paise": 0})
    by_rate: dict = defaultdict(lambda: {"paid": 0, "free": 0, "revenue_paise": 0})
    by_ps: dict = defaultdict(lambda: {"n": 0, "revenue_paise": 0})

    excluded_heads = excluded_paid = excluded_free = excluded_rev = 0
    n_orders = n_paid = n_partial = n_pending = n_comp = 0
    partial_rows = []

    async for o in db.food_subscriptions.find({}, {"_id": 0}):
        if o["id"] in replaced:
            continue
        ps = o.get("payment_status") or ""
        st = o.get("status") or ""
        if ps in ("cancelled", "expired") or st in ("cancelled", "expired"):
            continue
        n_orders += 1
        if ps == "complimentary":
            n_comp += 1
        elif ps == "partially_paid":
            n_partial += 1
        elif ps == "pending":
            n_pending += 1
        elif ps == "paid":
            n_paid += 1

        order_line_rev = 0
        for sel in o.get("selections") or []:
            meal = _meal_code(sel)
            qty = int(sel.get("quantity") or 0)
            if qty <= 0:
                continue
            free = int(sel.get("complimentary_qty") or 0)
            unit = int(sel.get("amount_paise") or 0)
            if sel.get("line_total_paise") is not None:
                line = int(sel["line_total_paise"])
            else:
                line = max(0, qty - free) * unit
            paid = max(0, qty - free)

            if meal in EXCLUDED_MEALS:
                excluded_heads += qty
                excluded_paid += paid
                excluded_free += free
                excluded_rev += line
                continue

            day = (sel.get("item_day_code") or sel.get("day_code") or "?").strip().lower()
            diet = (sel.get("diet") or "?").strip().lower()
            name = sel.get("name") or sel.get("meal_label") or meal
            key = (day, meal, diet, unit, name)
            row = by_item.setdefault(key, {
                "day": day, "meal": meal, "diet": diet, "unit_paise": unit, "name": name,
                "heads": 0, "paid": 0, "free": 0, "revenue_paise": 0,
            })
            row["heads"] += qty
            row["paid"] += paid
            row["free"] += free
            row["revenue_paise"] += line
            order_line_rev += line

            by_day[day]["heads"] += qty
            by_day[day]["paid"] += paid
            by_day[day]["free"] += free
            by_day[day]["revenue_paise"] += line
            by_meal[meal]["heads"] += qty
            by_meal[meal]["paid"] += paid
            by_meal[meal]["free"] += free
            by_meal[meal]["revenue_paise"] += line
            by_rate[unit]["paid"] += paid
            by_rate[unit]["free"] += free
            by_rate[unit]["revenue_paise"] += line

        by_ps[ps]["n"] += 1
        by_ps[ps]["revenue_paise"] += order_line_rev

        if ps == "partially_paid":
            receipts = [
                r async for r in db.receipts.find(
                    {"food_subscription_id": o["id"], "status": "issued"},
                    {"_id": 0, "receipt_no": 1, "total_amount": 1, "payment_id": 1},
                )
            ]
            paid_amt = sum(int(r.get("total_amount") or 0) for r in receipts)
            partial_rows.append({
                "name": o.get("name") or "",
                "tower": o.get("tower_name") or "",
                "flat": o.get("flat_number") or "",
                "mobile": o.get("mobile") or "",
                "due_paise": order_line_rev,
                "paid_paise": paid_amt,
                "outstanding_paise": max(0, order_line_rev - paid_amt),
                "receipt_nos": [r.get("receipt_no") for r in receipts],
                "items": "Nabami / part-paid order" if order_line_rev else "",
            })

    items = sorted(
        by_item.values(),
        key=lambda r: (
            DAY_ORDER.get(r["day"], 99),
            MEAL_ORDER.get(r["meal"], 9),
            0 if r["diet"] == "veg" else 1,
            r["unit_paise"],
            r["name"],
        ),
    )
    days = [
        {
            "day": d,
            "label": DAY_LABELS.get(d, d.replace("_", " ").title()),
            **by_day[d],
        }
        for d in sorted(by_day.keys(), key=lambda x: DAY_ORDER.get(x, 99))
    ]
    meals = [
        {"meal": m, "label": m.replace("_", " ").title(), **by_meal[m]}
        for m in sorted(by_meal.keys(), key=lambda x: MEAL_ORDER.get(x, 9))
    ]
    rates = [
        {"unit_paise": u, **by_rate[u]}
        for u in sorted(by_rate.keys())
    ]

    total_rev = sum(r["revenue_paise"] for r in items)
    total_heads = sum(r["heads"] for r in items)
    total_paid = sum(r["paid"] for r in items)
    total_free = sum(r["free"] for r in items)
    free_value = sum(r["free"] * r["unit_paise"] for r in items)
    paid_rev = by_ps.get("paid", {}).get("revenue_paise", 0)
    partial_rev = by_ps.get("partially_paid", {}).get("revenue_paise", 0)
    pending_rev = by_ps.get("pending", {}).get("revenue_paise", 0)

    return {
        "generated_at": iso(),
        "generated_at_ist": to_ist(now_utc()).strftime("%d %b %Y, %I:%M %p IST"),
        "title": "One 10 Durga Pujo 2026 — Food coupon revenue",
        "subtitle": "Consolidated · veg breakfast packets excluded (already paid)",
        "exclusion_note": (
            f"Veg breakfast packets excluded (already paid): {_num(excluded_heads)} heads "
            f"· {_num(excluded_paid)} paid / {_num(excluded_free)} free · list {_inr(excluded_rev)}"
        ),
        "totals": {
            "orders": n_orders,
            "paid_orders": n_paid,
            "partial_orders": n_partial,
            "pending_orders": n_pending,
            "complimentary_orders": n_comp,
            "heads": total_heads,
            "paid_plates": total_paid,
            "free_plates": total_free,
            "revenue_paise": total_rev,
            "free_value_paise": free_value,
            "gross_list_paise": total_rev + free_value,
            "collected_paise": paid_rev + partial_rev,  # order-side billed that is paid/partial
            "paid_status_paise": paid_rev,
            "partial_status_paise": partial_rev,
            "pending_paise": pending_rev,
        },
        "by_payment_status": [
            {"status": k or "∅", "orders": v["n"], "revenue_paise": v["revenue_paise"]}
            for k, v in sorted(by_ps.items(), key=lambda x: -x[1]["revenue_paise"])
        ],
        "by_day": days,
        "by_meal": meals,
        "by_rate": rates,
        "items": items,
        "partial": partial_rows,
        "excluded": {
            "meal": "breakfast_packet",
            "heads": excluded_heads,
            "paid": excluded_paid,
            "free": excluded_free,
            "revenue_paise": excluded_rev,
        },
    }


def _style_table(header_bg=BROWN, header_fg=IVORY, font_size=8):
    return TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), header_bg),
        ("TEXTCOLOR", (0, 0), (-1, 0), header_fg),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#F0EBE4")),
        ("FONTSIZE", (0, 0), (-1, -1), font_size),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D4CBC3")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [IVORY, colors.HexColor("#FAF7F3")]),
    ])


def food_revenue_report_pdf(report: dict) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=landscape(A4))
    W, H = landscape(A4)
    m = 12 * mm
    t = report["totals"]

    # Header band
    c.setFillColor(VERMILION)
    c.rect(0, H - 18 * mm, W, 18 * mm, fill=1, stroke=0)
    c.setFillColor(IVORY)
    c.setFont("Helvetica-Bold", 15)
    c.drawString(m, H - 8 * mm, "One 10 Durga Pujo 2026")
    c.setFont("Helvetica", 9)
    c.drawString(m, H - 13.5 * mm, "Food coupon revenue  ·  veg breakfast packets excluded")
    c.drawRightString(W - m, H - 8 * mm, report.get("generated_at_ist") or "")
    c.setFont("Helvetica", 8)
    c.drawRightString(W - m, H - 13.5 * mm, "Committee consolidated report")

    # Hero metrics
    y = H - 28 * mm
    c.setFillColor(BROWN)
    c.setFont("Helvetica", 9)
    c.drawString(m, y, "TOTAL REVENUE")
    c.setFillColor(VERMILION)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(m, y - 9 * mm, _inr(t["revenue_paise"]))

    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8)
    c.drawString(m + 70 * mm, y, "PAID PLATES")
    c.setFillColor(BROWN)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(m + 70 * mm, y - 7 * mm, _num(t["paid_plates"]))

    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8)
    c.drawString(m + 105 * mm, y, "COMPLIMENTARY")
    c.setFillColor(BROWN)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(m + 105 * mm, y - 7 * mm, _num(t["free_plates"]))
    c.setFont("Helvetica", 8)
    c.setFillColor(MUTED)
    c.drawString(m + 105 * mm, y - 12 * mm, f"forgone {_inr(t['free_value_paise'])}")

    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8)
    c.drawString(m + 155 * mm, y, "ORDERS")
    c.setFillColor(BROWN)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(m + 155 * mm, y - 6 * mm,
                 f"{t['paid_orders']} paid  ·  {t['complimentary_orders']} complimentary")
    if t["partial_orders"] or t["pending_orders"]:
        c.setFillColor(VERMILION)
        c.setFont("Helvetica", 8)
        c.drawString(m + 155 * mm, y - 11 * mm,
                     f"{t['partial_orders']} partial  ·  {t['pending_orders']} pending")
    else:
        c.setFillColor(colors.HexColor("#059669"))
        c.setFont("Helvetica-Bold", 8)
        c.drawString(m + 155 * mm, y - 11 * mm, "No pending or partial payments")

    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7)
    c.drawString(m, y - 18 * mm, report["exclusion_note"])

    # Three tables in a row
    top = y - 24 * mm

    day_data = [["Day", "Heads", "Paid", "Free", "Revenue"]]
    for d in report["by_day"]:
        day_data.append([d["label"], _num(d["heads"]), _num(d["paid"]), _num(d["free"]), _inr(d["revenue_paise"])])
    day_data.append(["TOTAL", _num(t["heads"]), _num(t["paid_plates"]), _num(t["free_plates"]), _inr(t["revenue_paise"])])
    dt = Table(day_data, colWidths=[48 * mm, 20 * mm, 20 * mm, 20 * mm, 28 * mm])
    dt.setStyle(_style_table())
    dtw, dth = dt.wrapOn(c, W, H)
    c.setFillColor(BROWN)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(m, top, "By day")
    dt.drawOn(c, m, top - 5 * mm - dth)

    meal_data = [["Meal", "Paid", "Revenue"]]
    for meal in report["by_meal"]:
        meal_data.append([meal["label"], _num(meal["paid"]), _inr(meal["revenue_paise"])])
    meal_data.append(["TOTAL", _num(t["paid_plates"]), _inr(t["revenue_paise"])])
    mt = Table(meal_data, colWidths=[32 * mm, 20 * mm, 28 * mm])
    mt.setStyle(_style_table())
    mtw, mth = mt.wrapOn(c, W, H)
    x2 = m + dtw + 8 * mm
    c.setFillColor(BROWN)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(x2, top, "By meal")
    mt.drawOn(c, x2, top - 5 * mm - mth)

    rate_data = [["Rate", "Paid plates", "Revenue"]]
    for r in report["by_rate"]:
        rate_data.append([_inr(r["unit_paise"]), _num(r["paid"]), _inr(r["revenue_paise"])])
    rate_data.append(["TOTAL", _num(t["paid_plates"]), _inr(t["revenue_paise"])])
    rt = Table(rate_data, colWidths=[24 * mm, 28 * mm, 28 * mm])
    rt.setStyle(_style_table(header_bg=GOLD, header_fg=BROWN))
    rtw, rth = rt.wrapOn(c, W, H)
    x3 = x2 + mtw + 8 * mm
    c.setFillColor(BROWN)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(x3, top, "Rate × paid plates")
    rt.drawOn(c, x3, top - 5 * mm - rth)

    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7)
    c.drawString(m, 8 * mm, "Page 1 of 2  ·  One 10 Events  ·  Rate × paid plates  ·  Breakfast packets excluded")
    c.showPage()

    # Page 2 — line detail
    c.setFillColor(VERMILION)
    c.rect(0, H - 14 * mm, W, 14 * mm, fill=1, stroke=0)
    c.setFillColor(IVORY)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(m, H - 9 * mm, "Meal × rate detail")
    c.setFont("Helvetica", 8)
    c.drawRightString(W - m, H - 9 * mm, report.get("generated_at_ist") or "")

    detail = [["Day", "Meal", "Diet", "Rate", "Heads", "Paid", "Free", "Revenue", "Item"]]
    for r in report["items"]:
        detail.append([
            DAY_LABELS.get(r["day"], r["day"])[:16],
            r["meal"].replace("_", " ")[:12],
            "Non-veg" if r["diet"] == "non_veg" else "Veg",
            _inr(r["unit_paise"]),
            _num(r["heads"]),
            _num(r["paid"]),
            _num(r["free"]),
            _inr(r["revenue_paise"]),
            (r["name"] or "")[:48],
        ])
    detail.append([
        "TOTAL", "", "", "",
        _num(t["heads"]), _num(t["paid_plates"]), _num(t["free_plates"]),
        _inr(t["revenue_paise"]), "",
    ])
    det = Table(detail, colWidths=[30 * mm, 22 * mm, 18 * mm, 18 * mm, 16 * mm, 16 * mm, 16 * mm, 26 * mm, 95 * mm])
    det.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BROWN),
        ("TEXTCOLOR", (0, 0), (-1, 0), IVORY),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#F0EBE4")),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("ALIGN", (3, 0), (7, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#D4CBC3")),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [IVORY, colors.HexColor("#FAF7F3")]),
    ]))
    _, deth = det.wrapOn(c, W - 2 * m, H - 30 * mm)
    det.drawOn(c, m, H - 20 * mm - deth)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7)
    c.drawString(m, 8 * mm, "Page 2 of 2  ·  Line detail excludes veg breakfast packets")
    c.showPage()
    c.save()
    return buf.getvalue()


def food_revenue_report_png(report: dict) -> bytes:
    """A4-ish portrait PNG, clean single composition for WhatsApp / committee share."""
    from PIL import Image, ImageDraw, ImageFont

    W, H = 1080, 1520
    BG = "#FDFBF7"
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    def font(size, bold=False):
        path = (
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
            else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
        )
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            return ImageFont.load_default()

    f_title = font(34, True)
    f_sub = font(15)
    f_label = font(12)
    f_hero = font(52, True)
    f_h = font(18, True)
    f_body = font(15)
    f_body_b = font(15, True)
    f_small = font(13)

    # Header
    draw.rectangle([0, 0, W, 96], fill="#D9381E")
    draw.text((40, 22), "One 10 Durga Pujo 2026", fill="#FDFBF7", font=f_title)
    draw.text((40, 64), "Food coupon revenue  ·  veg breakfast packets excluded", fill="#FDE8E4", font=f_sub)
    draw.text((W - 40, 36), report.get("generated_at_ist") or "", fill="#FDE8E4", font=f_small, anchor="ra")

    t = report["totals"]
    y = 120
    draw.text((40, y), "TOTAL REVENUE", fill="#6B5E55", font=f_label)
    draw.text((40, y + 22), _inr(t["revenue_paise"]), fill="#D9381E", font=f_hero)

    # Right meta
    draw.text((620, y + 8), f"{_num(t['paid_plates'])} paid plates", fill="#1F1412", font=f_h)
    draw.text((620, y + 38), f"{_num(t['free_plates'])} complimentary  ·  forgone {_inr(t['free_value_paise'])}",
              fill="#6B5E55", font=f_body)
    settled = not (t["partial_orders"] or t["pending_orders"])
    if settled:
        draw.rounded_rectangle([620, y + 68, 1040, y + 100], radius=8, fill="#ECFDF5", outline="#A7F3D0")
        draw.text((636, y + 76), "All orders settled — no pending or partial", fill="#047857", font=f_body_b)
    else:
        draw.text((620, y + 72),
                  f"{t['partial_orders']} partial  ·  {t['pending_orders']} pending",
                  fill="#D9381E", font=f_body_b)

    y = 250
    # Status strip — only meaningful cards
    cards = [
        ("Paid orders", _num(t["paid_orders"]), _inr(t["paid_status_paise"]), "#059669"),
        ("Complimentary", _num(t["complimentary_orders"]), "₹0", "#6B5E55"),
        ("Gross list value", "", _inr(t["gross_list_paise"]), "#1F1412"),
    ]
    gap, cw = 16, (W - 80 - 32) // 3
    for i, (label, n, amt, col) in enumerate(cards):
        x = 40 + i * (cw + gap)
        draw.rounded_rectangle([x, y, x + cw, y + 88], radius=12, fill="#FFFFFF", outline="#E8E0D8")
        draw.text((x + 18, y + 14), label, fill="#6B5E55", font=f_label)
        if n:
            draw.text((x + 18, y + 36), n, fill=col, font=f_h)
            draw.text((x + 18, y + 60), amt, fill="#1F1412", font=f_body)
        else:
            draw.text((x + 18, y + 44), amt, fill=col, font=f_h)

    def draw_table(x0, y0, width, title, headers, rows, col_weights, total_row=None):
        draw.text((x0, y0), title, fill="#1F1412", font=f_h)
        y0 += 28
        row_h = 30
        # column x positions
        total_w = sum(col_weights)
        xs = []
        acc = x0
        for w in col_weights:
            xs.append(acc)
            acc += int(width * w / total_w)

        def cell_x(ci, right=False):
            if right:
                end = xs[ci + 1] if ci + 1 < len(xs) else x0 + width
                return end - 10
            return xs[ci] + 10

        # header
        draw.rectangle([x0, y0, x0 + width, y0 + row_h], fill="#1F1412")
        for i, h in enumerate(headers):
            right = i > 0
            draw.text((cell_x(i, right=right), y0 + 7), h, fill="#FDFBF7", font=f_small,
                      anchor="ra" if right else "la")
        y0 += row_h
        for ri, row in enumerate(rows):
            bg = "#FFFFFF" if ri % 2 == 0 else "#FAF7F3"
            draw.rectangle([x0, y0, x0 + width, y0 + row_h], fill=bg)
            for i, val in enumerate(row):
                right = i > 0
                draw.text((cell_x(i, right=right), y0 + 7), str(val), fill="#1F1412", font=f_body,
                          anchor="ra" if right else "la")
            y0 += row_h
        if total_row:
            draw.rectangle([x0, y0, x0 + width, y0 + row_h], fill="#F0EBE4")
            for i, val in enumerate(total_row):
                right = i > 0
                draw.text((cell_x(i, right=right), y0 + 7), str(val), fill="#1F1412", font=f_body_b,
                          anchor="ra" if right else "la")
            y0 += row_h
        return y0

    y = 370
    y = draw_table(
        40, y, 620, "By day",
        ["Day", "Heads", "Paid", "Free", "Revenue"],
        [[d["label"], _num(d["heads"]), _num(d["paid"]), _num(d["free"]), _inr(d["revenue_paise"])]
         for d in report["by_day"]],
        [2.4, 1, 1, 1, 1.5],
        ["TOTAL", _num(t["heads"]), _num(t["paid_plates"]), _num(t["free_plates"]), _inr(t["revenue_paise"])],
    )

    # Right column — by meal stacked above rates
    ry = 370
    ry = draw_table(
        680, ry, 360, "By meal",
        ["Meal", "Paid", "Revenue"],
        [[m["label"], _num(m["paid"]), _inr(m["revenue_paise"])] for m in report["by_meal"]],
        [1.6, 1, 1.4],
        ["TOTAL", _num(t["paid_plates"]), _inr(t["revenue_paise"])],
    )

    y = max(y, ry) + 28
    y = draw_table(
        40, y, 1000, "Rate × paid plates",
        ["Rate", "Paid plates", "Revenue"],
        [[_inr(r["unit_paise"]), _num(r["paid"]), _inr(r["revenue_paise"])] for r in report["by_rate"]],
        [1, 1.2, 1.4],
        ["TOTAL", _num(t["paid_plates"]), _inr(t["revenue_paise"])],
    )

    y += 24
    draw.rounded_rectangle([40, y, W - 40, y + 56], radius=10, fill="#FFF8F0", outline="#E8D5C0")
    draw.text((56, y + 10), "Note", fill="#A85A2A", font=f_body_b)
    draw.text((56, y + 30), report["exclusion_note"], fill="#6B5E55", font=f_small)

    draw.text((40, H - 36), "One 10 Events  ·  Committee report  ·  Breakfast packets kept out (already paid)",
              fill="#6B5E55", font=f_small)

    out = io.BytesIO()
    img.save(out, format="PNG", optimize=True)
    return out.getvalue()
