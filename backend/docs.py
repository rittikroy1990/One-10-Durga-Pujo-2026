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


def receipt_is_bank_verified(receipt: dict) -> bool:
    """True when the receipt has been matched to a bank statement (or Excel import).

    Explicit bank_verified=True always wins (treasurer confirmation after screenshot issue).
    payment_screenshot without that flag → not bank verified.
    Collection / Excel / legacy rows → bank verified.
    """
    if receipt.get("bank_verified") is True:
        return True
    source = (receipt.get("issuance_source") or "").strip()
    if source == "payment_screenshot":
        return False
    if source == "collection" and receipt.get("bank_verified") is False:
        # Explicit collection override (e.g. cash pending settlement)
        return False
    # Legacy rows without payment_screenshot source: treat as bank verified
    return True


def _not_bank_verified(receipt: dict) -> bool:
    """True when the receipt must carry an explicit not-bank-verified notice."""
    return not receipt_is_bank_verified(receipt)


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


def _rs(paise) -> str:
    return f"Rs. {fmt_inr(int(paise or 0))}"


def _short_date(iso_date: str) -> str:
    try:
        return datetime.fromisoformat(iso_date).strftime("%d %b")
    except Exception:
        return iso_date or ""


def food_voucher_pdf(voucher: dict, settings: dict) -> bytes:
    """Resident's food voucher: every day / meal / head on the order, what was free and what was paid."""
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

    org = settings.get("organisation", {})
    camp = settings.get("campaign", {})
    letterhead = (settings.get("receipt", {}).get("letterhead_title") or org.get("organiser")
                  or "ONE 10 EVENT ORGANISING COMMITEE")
    title = camp.get("title") or settings.get("cycle", {}).get("name") or "One 10 Durgotsav 2026"

    base = ParagraphStyle("b", fontName="Helvetica", fontSize=9.5, leading=13, textColor=BROWN)
    small = ParagraphStyle("s", parent=base, fontSize=8, leading=11, textColor=colors.HexColor("#6B5A4E"))
    head = ParagraphStyle("h", parent=base, fontName="Helvetica-Bold", fontSize=15, leading=19,
                          textColor=VERMILION, alignment=1)
    sub = ParagraphStyle("sub", parent=base, fontName="Helvetica-Bold", fontSize=12, leading=16,
                         textColor=GOLD, alignment=1)
    section = ParagraphStyle("sec", parent=base, fontName="Helvetica-Bold", fontSize=10.5, leading=14,
                             spaceBefore=6, spaceAfter=4)

    buf = io.BytesIO()
    W, H = A4

    def frame(c, _doc):
        c.saveState()
        c.setStrokeColor(GOLD)
        c.setLineWidth(2)
        c.rect(10 * mm, 10 * mm, W - 20 * mm, H - 20 * mm)
        c.setFont("Helvetica", 7)
        c.setFillColor(colors.HexColor("#6B5A4E"))
        c.drawCentredString(W / 2, 13 * mm, f"Food voucher {voucher.get('voucher_no') or ''} · {letterhead}")
        c.restoreState()

    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                            topMargin=18 * mm, bottomMargin=20 * mm, title=voucher.get("voucher_no") or "Food voucher")
    story = [
        Paragraph(letterhead, head),
        Paragraph(f"{title} — Food Voucher", sub),
        Spacer(1, 6 * mm),
    ]

    status = voucher.get("status_label") or ""
    info_rows = [
        [Paragraph(f"<b>Voucher No:</b> {voucher.get('voucher_no') or ''}", base),
         Paragraph(f"<b>Status:</b> <font color='#0f7b45'>{status.upper()}</font>", base)],
        [Paragraph(f"<b>Name:</b> {voucher.get('name') or ''}", base),
         Paragraph(f"<b>Mobile:</b> {voucher.get('mobile_masked') or ''}", base)],
        [Paragraph(f"<b>Tower / Flat:</b> {voucher.get('tower_name') or ''}, Flat {voucher.get('flat_number') or ''}", base),
         Paragraph(f"<b>Issued:</b> {_ist_str(voucher.get('voucher_issued_at') or '')}", base)],
        [Paragraph(f"<b>Order ID:</b> {voucher.get('order_id') or ''}", small),
         Paragraph(f"<b>Ordered:</b> {_ist_str(voucher.get('ordered_at') or '')}", small)],
    ]
    info = Table(info_rows, colWidths=[104 * mm, 70 * mm])
    info.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                              ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    story += [info, Spacer(1, 3 * mm)]

    totals = voucher.get("totals") or {}
    summary = Table([[
        Paragraph(f"<b>{totals.get('heads', 0)}</b><br/><font size=8>Total heads / plates</font>", base),
        Paragraph(f"<b>{totals.get('free', 0)}</b><br/><font size=8>Complimentary</font>", base),
        Paragraph(f"<b>{totals.get('paid', 0)}</b><br/><font size=8>Paid</font>", base),
        Paragraph(f"<b>{_rs(voucher.get('amount_paid_paise'))}</b><br/><font size=8>Amount paid</font>", base),
    ]], colWidths=[43.5 * mm] * 4)
    summary.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, GOLD), ("INNERGRID", (0, 0), (-1, -1), 0.5, GOLD),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FFF8EC")), ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story += [summary, Spacer(1, 2 * mm)]

    story.append(Paragraph("Meals by day", section))
    rows = [["Day", "Meal", "Item", "Diet", "Heads", "Free", "Paid", "Amount"]]
    for ln in voucher.get("lines") or []:
        rows.append([
            Paragraph(f"<b>{ln.get('day_label')}</b><br/><font size=7>{_short_date(ln.get('date'))} {ln.get('weekday', '')[:3]}</font>", small),
            ln.get("meal_label") or "",
            Paragraph(ln.get("item") or "", small),
            ln.get("diet_label") or "",
            str(ln.get("heads") or 0),
            str(ln.get("free") or 0),
            str(ln.get("paid") or 0),
            _rs(ln.get("amount_paise")) if ln.get("amount_paise") is not None else "-",
        ])
    rows.append(["", "", "Total", "", str(totals.get("heads", 0)), str(totals.get("free", 0)),
                 str(totals.get("paid", 0)), _rs(voucher.get("total_amount_paise"))])
    t = Table(rows, colWidths=[24 * mm, 24 * mm, 50 * mm, 16 * mm, 13 * mm, 12 * mm, 12 * mm, 23 * mm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BROWN), ("TEXTCOLOR", (0, 0), (-1, 0), IVORY),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#F5F0E6")),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (4, 0), (-1, -1), "RIGHT"), ("GRID", (0, 0), (-1, -1), 0.4, GOLD),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(t)

    days = voucher.get("days") or []
    if days:
        story.append(Paragraph("Heads per day", section))
        drows = [["Day", "Meals", "Heads"]]
        for d in days:
            meals = ", ".join(f"{m['meal_label']} {m['heads']}" for m in d.get("meals") or [])
            drows.append([f"{d.get('day_label')} ({_short_date(d.get('date'))})", meals, str(d.get("heads") or 0)])
        dt = Table(drows, colWidths=[40 * mm, 112 * mm, 22 * mm])
        dt.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BROWN), ("TEXTCOLOR", (0, 0), (-1, 0), IVORY),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("ALIGN", (2, 0), (2, -1), "RIGHT"), ("GRID", (0, 0), (-1, -1), 0.4, GOLD),
        ]))
        story.append(dt)

    story.append(Paragraph("Payment", section))
    receipts = voucher.get("receipts") or []
    if receipts:
        prows = [["Receipt No", "Date", "Amount"]]
        for r in receipts:
            prows.append([r.get("receipt_no") or "", _ist_str(r.get("issued_at") or ""), _rs(r.get("amount_paise"))])
        prows.append(["Total paid", "", _rs(voucher.get("amount_paid_paise"))])
        pt = Table(prows, colWidths=[60 * mm, 80 * mm, 34 * mm])
        pt.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BROWN), ("TEXTCOLOR", (0, 0), (-1, 0), IVORY),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8.5), ("ALIGN", (2, 0), (2, -1), "RIGHT"),
            ("GRID", (0, 0), (-1, -1), 0.4, GOLD),
        ]))
        story.append(pt)
    else:
        story.append(Paragraph("Fully complimentary — nothing to pay.", base))

    story.append(Spacer(1, 4 * mm))
    coupon = voucher.get("coupon")
    if coupon:
        story.append(Paragraph(
            f"<b>Coupons given:</b> {_ist_str(coupon.get('issued_at') or '')} (ref {coupon.get('coupon_no')})", base))
    else:
        story.append(Paragraph("<b>Coupons:</b> not yet collected.", base))
    story += [
        Spacer(1, 2 * mm),
        Paragraph("Download or print this voucher and show it to a committee member to collect your food coupons. "
                  "Coupons are given once per voucher. No take-aways for breakfast and Ashtami lunch.", small),
    ]
    doc.build(story, onFirstPage=frame, onLaterPages=frame)
    return buf.getvalue()


def food_coupon_pdf(coupon: dict, subscription: dict, settings: dict, slips: list) -> bytes:
    """Committee printout: one cut-out slip per person per meal, each with its own serial number."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    title = (settings.get("campaign", {}).get("title") or "One 10 Durgotsav 2026")[:30]
    name = coupon.get("name") or subscription.get("name") or ""
    tower = coupon.get("tower_name") or subscription.get("tower_name") or ""
    flat = coupon.get("flat_number") or subscription.get("flat_number") or ""
    voucher_no = coupon.get("voucher_no") or subscription.get("voucher_no") or ""
    coupon_no = coupon.get("coupon_no", "")

    cols, rows_per_page = 3, 7
    margin_x, margin_y = 10 * mm, 14 * mm
    cw = (W - 2 * margin_x) / cols
    ch = (H - 2 * margin_y - 8 * mm) / rows_per_page
    per_page = cols * rows_per_page
    pages = max(1, -(-len(slips) // per_page))
    pad = 3.5 * mm
    green = colors.HexColor("#0f7b45")

    for idx, sl in enumerate(slips):
        slot = idx % per_page
        if slot == 0:
            if idx:
                c.showPage()
            c.setFont("Helvetica-Bold", 8.5)
            c.setFillColor(BROWN)
            c.drawString(margin_x, H - margin_y + 2 * mm,
                         f"Food coupons {coupon_no} · Voucher {voucher_no} · {name[:30]} · {tower}, Flat {flat}")
            c.setFont("Helvetica", 7)
            c.drawCentredString(
                W / 2, margin_y - 8 * mm,
                f"{len(slips)} coupons · one per person per meal · counter keeps the slip · "
                f"page {idx // per_page + 1} of {pages}")
        col, row = slot % cols, slot // cols
        x = margin_x + col * cw
        y = H - margin_y - 4 * mm - (row + 1) * ch
        c.setDash(3, 3)
        c.setStrokeColor(GOLD)
        c.setLineWidth(0.8)
        c.rect(x + 1.5, y + 1.5, cw - 3, ch - 3)
        c.setDash()
        top = y + ch - pad - 1.5
        right = x + cw - pad

        c.setFillColor(VERMILION)
        c.setFont("Helvetica-Bold", 6.3)
        c.drawString(x + pad, top, title)
        c.setFillColor(BROWN)
        c.drawRightString(right, top, "1 PERSON")
        c.setFont("Helvetica-Bold", 12)
        c.drawString(x + pad, top - 5.5 * mm, f"{sl.get('day_label', '')} · {sl.get('meal_label', '')}")
        c.setFont("Helvetica", 6.8)
        c.drawString(x + pad, top - 8.8 * mm,
                     f"{_short_date(sl.get('date'))} {(sl.get('weekday') or '')[:3]} · {sl.get('diet_label', '')}")
        c.drawString(x + pad, top - 12 * mm, (sl.get("item") or "")[:44])
        c.setFont("Helvetica-Bold", 7.2)
        c.setFillColor(green if sl.get("is_free") else VERMILION)
        c.drawString(x + pad, top - 16 * mm, "COMPLIMENTARY" if sl.get("is_free") else "PAID")
        c.setFillColor(BROWN)
        c.drawRightString(right, top - 16 * mm, f"{sl.get('n')} of {sl.get('of')}")

        c.setFont("Helvetica-Bold", 6.3)
        c.drawString(x + pad, y + pad + 3 * mm, f"No. {sl.get('serial', '')}")
        c.setFont("Helvetica", 6)
        c.drawString(x + pad, y + pad, f"{name[:28]} · {tower}, Flat {flat}")

    if not slips:
        c.setFont("Helvetica", 11)
        c.drawString(margin_x, H / 2, "No meals on this order.")
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
