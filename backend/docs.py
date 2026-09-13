"""PDF receipt generation, QR codes and CSV/XLSX/PDF report exports (formula-injection safe)."""
import csv
import io

import qrcode
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle

from util import fmt_inr, rupees_words, neutralise_cell, to_ist
from datetime import datetime

VERMILION = colors.HexColor("#D9381E")
GOLD = colors.HexColor("#B5952F")
BROWN = colors.HexColor("#1F1412")
IVORY = colors.HexColor("#FDFBF7")
NOT_BANK_MUTED = colors.HexColor("#A85A2A")


def _not_bank_verified(receipt: dict) -> bool:
    """True when the receipt must carry an explicit not-bank-verified notice."""
    if "bank_verified" in receipt:
        return receipt.get("bank_verified") is False
    return (receipt.get("method") or "").strip() in ("upi_qr", "bank_transfer", "acknowledge")


def qr_png(data: str, box: int = 8) -> bytes:
    qr = qrcode.QRCode(box_size=box, border=2)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#1F1412", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def qr_svg(data: str) -> str:
    import qrcode.image.svg
    img = qrcode.make(data, image_factory=qrcode.image.svg.SvgImage)
    buf = io.BytesIO()
    img.save(buf)
    return buf.getvalue().decode()


def _ist_str(iso_str: str) -> str:
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return to_ist(dt).strftime("%d %b %Y, %I:%M %p IST")
    except Exception:
        return iso_str


def _method_label(method: str) -> str:
    return {
        "upi_qr": "UPI",
        "bank_transfer": "Bank Transfer",
        "cash": "Cash",
        "cheque": "Cheque",
        "cashfree": "Online (Cashfree)",
        "acknowledge": "Committee acknowledged",
    }.get((method or "").strip(), method or "—")


def _payment_ref_label(method: str) -> str:
    m = (method or "").strip()
    if m in ("upi_qr", "bank_transfer"):
        return "UPI / UTR Reference"
    if m == "cheque":
        return "Cheque No"
    if m == "cash":
        return "Cash Reference"
    if m == "cashfree":
        return "Payment ID"
    return "Payment Reference"


def receipt_pdf(receipt: dict, settings: dict, verify_url: str) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    org = settings.get("organisation", {})
    rc = settings.get("receipt", {})
    camp = settings.get("campaign", {})
    upi = org.get("upi") or {}
    bank = org.get("bank_account") or {}
    letterhead = rc.get("letterhead_title") or org.get("organiser") or "ONE 10 EVENT ORGANISING COMMITEE"
    subtitle = rc.get("letterhead_subtitle") or org.get("legal_status") or ""
    campaign_title = (
        receipt.get("campaign_title")
        or camp.get("title")
        or settings.get("cycle", {}).get("name")
        or "Receipt"
    )
    kind = (receipt.get("kind") or "subscription").strip()
    kind_title = {
        "donation": "Donation Receipt",
        "food_subscription": "Food Subscription Receipt",
        "subscription": "Subscription Receipt",
    }.get(kind, "Receipt")

    # border
    c.setStrokeColor(GOLD)
    c.setLineWidth(2)
    c.rect(12 * mm, 12 * mm, W - 24 * mm, H - 24 * mm)
    c.setLineWidth(0.5)
    c.rect(15 * mm, 15 * mm, W - 30 * mm, H - 30 * mm)

    y = H - 28 * mm
    c.setFillColor(VERMILION)
    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(W / 2, y, letterhead)
    y -= 5 * mm
    c.setFillColor(GOLD)
    c.setFont("Helvetica", 8)
    if subtitle:
        # wrap-ish: truncate long legal status for letterhead
        c.drawCentredString(W / 2, y, subtitle[:110])
        y -= 5 * mm
    c.setFillColor(BROWN)
    c.setFont("Helvetica", 9)
    c.drawCentredString(W / 2, y, org.get("address", ""))
    y -= 5 * mm
    pan = (org.get("pan") or "").strip()
    if pan:
        c.setFont("Helvetica", 8)
        c.drawCentredString(W / 2, y, f"PAN: {pan}")
        y -= 6 * mm
    else:
        y -= 3 * mm
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 13)
    c.drawCentredString(W / 2, y, f"{campaign_title} — {kind_title}")
    y -= 10 * mm

    c.setFillColor(BROWN)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(22 * mm, y, f"Receipt No: {receipt['receipt_no']}")
    if receipt.get("status") == "issued":
        # Avoid implying bank confirmation when the not-bank-verified notice applies
        status = "ISSUED" if _not_bank_verified(receipt) else "VERIFIED"
    else:
        status = (receipt.get("status") or "").upper()
    c.setFillColor(colors.HexColor("#0f7b45") if receipt.get("status") == "issued" else VERMILION)
    c.drawRightString(W - 22 * mm, y, f"Status: {status}")
    c.setFillColor(BROWN)
    y -= 6 * mm
    c.setFont("Helvetica", 10)
    c.drawString(22 * mm, y, f"Issued: {_ist_str(receipt.get('issued_at', ''))}")
    # Same weight/placement language as Status — short, right-aligned, no banner
    if _not_bank_verified(receipt):
        c.setFillColor(NOT_BANK_MUTED)
        c.setFont("Helvetica-Bold", 11)
        c.drawRightString(W - 22 * mm, y, "Not bank verified")
        c.setFillColor(BROWN)
        c.setFont("Helvetica", 10)
    y -= 8 * mm

    c.drawString(22 * mm, y, f"Payer: {receipt.get('payer_name', '')}")
    y -= 6 * mm
    c.drawString(22 * mm, y, f"Household: {receipt.get('tower_name', '')}, Flat {receipt.get('flat_number', '')}")
    y -= 6 * mm

    method = receipt.get("method") or ""
    payment_id = (receipt.get("payment_id") or "").strip()
    masked_ref = (receipt.get("masked_ref") or "").strip()
    c.drawString(22 * mm, y, f"Payment Method: {_method_label(method)}")
    y -= 6 * mm
    if payment_id:
        c.setFont("Helvetica-Bold", 10)
        c.drawString(22 * mm, y, f"{_payment_ref_label(method)}: {payment_id}")
        c.setFont("Helvetica", 10)
        y -= 6 * mm
    elif masked_ref:
        c.drawString(22 * mm, y, f"{_payment_ref_label(method)}: {masked_ref}")
        y -= 6 * mm
    if masked_ref and payment_id and masked_ref not in payment_id and not payment_id.endswith(masked_ref.replace("UTR-", "").replace("CHQ-", "")):
        c.drawString(22 * mm, y, f"Short Ref: {masked_ref}")
        y -= 6 * mm

    if receipt.get("is_partial"):
        c.setFillColor(VERMILION)
        c.setFont("Helvetica-Bold", 10)
        due_after = int(receipt.get("amount_due_after") or 0)
        c.drawString(22 * mm, y, f"PARTIAL PAYMENT — balance due after this receipt: {fmt_inr(due_after)}")
        c.setFillColor(BROWN)
        c.setFont("Helvetica", 10)
        y -= 6 * mm

    vpa = (upi.get("vpa") or "").strip()
    payee = (upi.get("payee_name") or bank.get("account_name") or "").strip()
    if method in ("upi_qr", "bank_transfer") and (vpa or payee):
        if payee:
            c.drawString(22 * mm, y, f"Paid to: {payee}")
            y -= 6 * mm
        if vpa:
            c.drawString(22 * mm, y, f"Committee UPI ID: {vpa}")
            y -= 6 * mm
        acct = (bank.get("account_number") or "").strip()
        ifsc = (bank.get("ifsc") or "").strip()
        if acct:
            c.drawString(22 * mm, y, f"Bank A/c: {acct}" + (f"  IFSC: {ifsc}" if ifsc else ""))
            y -= 6 * mm
    y -= 4 * mm

    # breakup table
    rows = [["Particulars", "Amount (INR)"]]
    if kind == "donation":
        rows.append(["Voluntary Donation", fmt_inr(receipt.get("donation_amount") or receipt.get("total_amount", 0))])
    elif kind == "food_subscription":
        rows.append(["Food Subscription", fmt_inr(receipt.get("total_amount", 0))])
    else:
        comps = receipt.get("components") or []
        for comp in comps:
            rows.append([comp["label"], fmt_inr(comp["amount_paise"])])
        if not comps:
            rows.append(["Base Subscription", fmt_inr(receipt.get("base_amount", 0))])
        if receipt.get("donation_amount", 0):
            rows.append(["Additional Voluntary Donation", fmt_inr(receipt["donation_amount"])])
    rows.append(["Total", fmt_inr(receipt.get("total_amount", 0))])

    t = Table(rows, colWidths=[110 * mm, 55 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BROWN),
        ("TEXTCOLOR", (0, 0), (-1, 0), IVORY),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#F5F0E6")),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.5, GOLD),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    tw, th = t.wrapOn(c, W, H)
    t.drawOn(c, 22 * mm, y - th)
    y = y - th - 10 * mm

    c.setFont("Helvetica-Oblique", 10)
    c.drawString(22 * mm, y, f"Amount in words: {rupees_words(receipt.get('total_amount', 0))}")

    c.showPage()
    c.save()
    return buf.getvalue()


def food_coupon_pdf(coupon: dict, subscription: dict, settings: dict) -> bytes:
    """Single A4 food coupon sheet for admin printout."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    org = settings.get("organisation", {})
    food = settings.get("food_subscription", {})
    letterhead = org.get("organiser") or "ONE 10 EVENT ORGANISING COMMITEE"

    c.setStrokeColor(GOLD)
    c.setLineWidth(2)
    c.rect(12 * mm, 12 * mm, W - 24 * mm, H - 24 * mm)
    c.setLineWidth(0.5)
    c.rect(15 * mm, 15 * mm, W - 30 * mm, H - 30 * mm)

    y = H - 28 * mm
    c.setFillColor(VERMILION)
    c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(W / 2, y, letterhead)
    y -= 6 * mm
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 12)
    c.drawCentredString(W / 2, y, food.get("title") or "Food Subscription Coupon")
    y -= 5 * mm
    c.setFillColor(BROWN)
    c.setFont("Helvetica", 9)
    c.drawCentredString(W / 2, y, food.get("subtitle") or "Shashthi to Dashami")
    y -= 10 * mm

    c.setFont("Helvetica-Bold", 11)
    c.drawString(22 * mm, y, f"Coupon No: {coupon.get('coupon_no', '')}")
    c.setFillColor(colors.HexColor("#0f7b45"))
    c.drawRightString(W - 22 * mm, y, f"Status: {(coupon.get('status') or 'issued').upper()}")
    c.setFillColor(BROWN)
    y -= 7 * mm
    c.setFont("Helvetica", 10)
    c.drawString(22 * mm, y, f"Name: {coupon.get('name') or subscription.get('name') or ''}")
    y -= 5 * mm
    mobile = coupon.get("mobile") or subscription.get("mobile") or ""
    c.drawString(22 * mm, y, f"Mobile: {mobile}")
    y -= 5 * mm
    tower = coupon.get("tower_name") or subscription.get("tower_name") or ""
    flat = coupon.get("flat_number") or subscription.get("flat_number") or ""
    c.drawString(22 * mm, y, f"Household: {tower}{', Flat ' + flat if flat else ''}")
    y -= 5 * mm
    c.drawString(22 * mm, y, f"Issued: {_ist_str(coupon.get('created_at', ''))}")
    y -= 5 * mm
    c.setFont("Helvetica-Oblique", 9)
    c.drawString(22 * mm, y, "Amounts: TBC · Payment not activated")
    y -= 8 * mm

    # Meal grid: Day | Breakfast | Lunch | Evening | Dinner
    meal_codes = ["breakfast", "lunch", "evening", "dinner"]
    meal_labels = ["Breakfast", "Lunch", "Evening", "Dinner"]
    selected = {
        (x.get("day_code"), x.get("meal_code"))
        for x in (coupon.get("selections") or subscription.get("selections") or [])
    }
    days = food.get("days") or []
    if not days:
        # fall back from selections
        day_order = []
        for x in (coupon.get("selections") or []):
            if x.get("day_code") not in day_order:
                day_order.append(x.get("day_code"))
        days = [{"code": d, "label": (next((s.get("day_label") for s in (coupon.get("selections") or []) if s.get("day_code") == d), d))} for d in day_order]

    header = ["Day"] + meal_labels
    rows = [header]
    for day in days:
        row = [day.get("label") or day.get("code")]
        for mc in meal_codes:
            row.append("✓" if (day.get("code"), mc) in selected else "—")
        rows.append(row)

    t = Table(rows, colWidths=[40 * mm, 32 * mm, 32 * mm, 32 * mm, 32 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BROWN),
        ("TEXTCOLOR", (0, 0), (-1, 0), IVORY),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("GRID", (0, 0), (-1, -1), 0.5, GOLD),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#FFF8EC")),
    ]))
    tw, th = t.wrapOn(c, W, H)
    t.drawOn(c, 22 * mm, y - th)
    y = y - th - 10 * mm

    c.setFont("Helvetica", 8)
    c.drawString(22 * mm, y, f"Issued by: {coupon.get('issued_by_name') or 'EOC Admin'}")
    y -= 5 * mm
    c.drawString(22 * mm, y, "Present this coupon for meal entitlement. Valid for selected meals only.")
    y -= 8 * mm
    c.setFont("Helvetica", 7)
    c.setFillColor(colors.HexColor("#6B5A4E"))
    c.drawCentredString(W / 2, 18 * mm, "Admin printout · One A4 sheet · ONE 10 EVENT ORGANISING COMMITEE")

    c.showPage()
    c.save()
    return buf.getvalue()


# ------------------------------------------------------------------ Exports
def export_csv(headers: list[str], rows: list[list]) -> bytes:
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow([neutralise_cell(h) for h in headers])
    for r in rows:
        w.writerow([neutralise_cell(c) for c in r])
    return out.getvalue().encode("utf-8")


def export_xlsx(headers: list[str], rows: list[list], title: str = "Report") -> bytes:
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.title = title[:31]
    ws.append([neutralise_cell(h) for h in headers])
    for r in rows:
        ws.append([neutralise_cell(c) for c in r])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def export_pdf(title: str, headers: list[str], rows: list[list], meta: dict) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    c.setFillColor(VERMILION)
    c.setFont("Helvetica-Bold", 15)
    c.drawString(18 * mm, H - 22 * mm, title)
    c.setFillColor(BROWN)
    c.setFont("Helvetica", 8)
    yy = H - 28 * mm
    for k, v in meta.items():
        c.drawString(18 * mm, yy, f"{k}: {v}")
        yy -= 4 * mm
    data = [[neutralise_cell(h) for h in headers]] + [[neutralise_cell(x) for x in r] for r in rows[:400]]
    ncols = max(1, len(headers))
    t = Table(data, colWidths=[(W - 36 * mm) / ncols] * ncols)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BROWN),
        ("TEXTCOLOR", (0, 0), (-1, 0), IVORY),
        ("FONTSIZE", (0, 0), (-1, -1), 6),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.grey),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ]))
    tw, th = t.wrapOn(c, W, H)
    t.drawOn(c, 18 * mm, max(yy - th - 4 * mm, 18 * mm))
    c.showPage()
    c.save()
    return buf.getvalue()
