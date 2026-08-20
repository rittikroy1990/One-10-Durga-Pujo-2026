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


def receipt_pdf(receipt: dict, settings: dict, verify_url: str) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    org = settings.get("organisation", {})
    rc = settings.get("receipt", {})

    # border
    c.setStrokeColor(GOLD)
    c.setLineWidth(2)
    c.rect(12 * mm, 12 * mm, W - 24 * mm, H - 24 * mm)
    c.setLineWidth(0.5)
    c.rect(15 * mm, 15 * mm, W - 30 * mm, H - 30 * mm)

    y = H - 30 * mm
    c.setFillColor(VERMILION)
    c.setFont("Helvetica-Bold", 20)
    c.drawCentredString(W / 2, y, org.get("organiser", "One10 EOC"))
    y -= 8 * mm
    c.setFillColor(BROWN)
    c.setFont("Helvetica", 10)
    c.drawCentredString(W / 2, y, org.get("address", ""))
    y -= 10 * mm
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 15)
    c.drawCentredString(W / 2, y, "One10 Durgotsav 2026 Subscription Receipt")
    y -= 12 * mm

    c.setFillColor(BROWN)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(22 * mm, y, f"Receipt No: {receipt['receipt_no']}")
    status = "VERIFIED" if receipt.get("status") == "issued" else receipt.get("status", "").upper()
    c.setFillColor(colors.HexColor("#0f7b45") if receipt.get("status") == "issued" else VERMILION)
    c.drawRightString(W - 22 * mm, y, f"Status: {status}")
    c.setFillColor(BROWN)
    y -= 6 * mm
    c.setFont("Helvetica", 10)
    c.drawString(22 * mm, y, f"Issued: {_ist_str(receipt.get('issued_at', ''))}")
    y -= 8 * mm

    c.drawString(22 * mm, y, f"Payer: {receipt.get('payer_name', '')}")
    y -= 6 * mm
    c.drawString(22 * mm, y, f"Household: {receipt.get('tower_name', '')}, Flat {receipt.get('flat_number', '')}")
    y -= 6 * mm
    c.drawString(22 * mm, y, f"Payment Method: {receipt.get('method', '')}   Ref: {receipt.get('masked_ref', '')}")
    y -= 10 * mm

    # breakup table
    rows = [["Particulars", "Amount (INR)"]]
    for comp in receipt.get("components", []):
        rows.append([comp["label"], fmt_inr(comp["amount_paise"])])
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
    y -= 14 * mm

    # QR
    try:
        qr = qr_png(verify_url, box=4)
        from reportlab.lib.utils import ImageReader
        c.drawImage(ImageReader(io.BytesIO(qr)), 22 * mm, y - 26 * mm, width=26 * mm, height=26 * mm)
    except Exception:
        pass
    c.setFont("Helvetica", 8)
    c.drawString(52 * mm, y - 6 * mm, "Scan to verify this receipt online:")
    c.drawString(52 * mm, y - 11 * mm, verify_url)
    c.drawString(52 * mm, y - 18 * mm, rc.get("computer_generated_note", ""))
    c.drawString(52 * mm, y - 23 * mm, f"Refund policy: {rc.get('refund_policy_ref', '')}  |  Doc {rc.get('document_version', '')}")

    c.setFont("Helvetica-Bold", 10)
    c.drawRightString(W - 22 * mm, y - 30 * mm, org.get("authorised_signatory", "Authorised Signatory"))
    c.setFont("Helvetica", 8)
    c.drawRightString(W - 22 * mm, y - 35 * mm, "Authorised Signatory")

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
