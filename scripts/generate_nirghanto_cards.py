#!/usr/bin/env python3
"""Rebuild aligned campaign collages and regenerate Nirghonto door-to-door cards."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
CAMPAIGN = ROOT / "frontend" / "public" / "images" / "campaign"
OUT_CARDS = [
    ROOT / "frontend" / "public" / "campaign-cards",
    Path("/opt/cursor/artifacts/campaign-cards"),
]
ARTIFACTS = Path("/opt/cursor/artifacts/campaign-images")

W_CARD, H_CARD = 1240, 1748
MARGIN = 56
L = MARGIN + 24
R = W_CARD - MARGIN - 24
CW = R - L
FOOTER_Y = H_CARD - 100

BROWN = (27, 17, 15)
PANEL = (36, 23, 21)
IVORY = (255, 255, 240)
IVORY_DIM = (220, 210, 195)
GOLD = (212, 175, 55)
GOLD_SOFT = (230, 179, 30)
VERMILION = (217, 56, 30)
WHITE = (255, 255, 255)
NAVY = (12, 22, 48)

BN = "/usr/share/fonts/truetype/noto/NotoSansBengali-Regular.ttf"
BN_B = "/usr/share/fonts/truetype/noto/NotoSansBengali-Bold.ttf"
EN = "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf"
EN_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def font(path, size):
    return ImageFont.truetype(path, size)


def fit(path, tw, th, center=(0.5, 0.4)):
    im = Image.open(path).convert("RGB")
    return ImageOps.fit(im, (tw, th), method=Image.Resampling.LANCZOS, centering=center)


def rounded_paste(base, photo, xy, radius=16):
    x, y = xy
    w, h = photo.size
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=255)
    base.paste(photo, (x, y), mask)


def text_center(draw, y, text, fnt, fill, width=None, x0=0):
    width = width or W_CARD
    bb = draw.textbbox((0, 0), text, font=fnt)
    tw = bb[2] - bb[0]
    draw.text((x0 + (width - tw) / 2, y), text, font=fnt, fill=fill)
    return y + (bb[3] - bb[1]) + 8


def rebuild_highlights():
    """Last Year Celebrations — 3 rows x 2 equal photos, perfect grid."""
    W, H = 1200, 1600
    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)

    # header bar
    d.rounded_rectangle([60, 40, W - 60, 130], radius=20, fill=IVORY)
    text_center(d, 68, "Last Year Celebrations", font(EN_B, 42), NAVY, width=W)

    rows = [
        ("Khuti Puja 2024", (255, 214, 90), ["full-30.jpg", "full-34.jpg"]),
        ("Durga Puja 2024", (120, 200, 255), ["full-14.jpg", "full-24.jpg"]),
        ("Kali Puja & Bijoya 2024", (255, 140, 180), ["full-27.jpg", "full-26.jpg"]),
    ]

    pad_x = 60
    gap = 20
    usable_w = W - 2 * pad_x
    cell_w = (usable_w - gap) // 2
    cell_h = 360
    y = 160

    for title, color, files in rows:
        d.text((pad_x, y), title, font=font(EN_B, 28), fill=color)
        y += 48
        for i, name in enumerate(files):
            x = pad_x + i * (cell_w + gap)
            # white frame
            frame = [x - 6, y - 6, x + cell_w + 6, y + cell_h + 6]
            d.rounded_rectangle(frame, radius=18, fill=WHITE)
            photo = fit(CAMPAIGN / name, cell_w, cell_h, center=(0.5, 0.35))
            rounded_paste(img, photo, (x, y), radius=14)
        y += cell_h + 36

    out = CAMPAIGN / "highlights.jpg"
    img.save(out, "JPEG", quality=92, optimize=True)
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    img.save(ARTIFACTS / "highlights.jpg", "JPEG", quality=92)
    print("rebuilt", out)
    return out


def rebuild_experience():
    """This Year Celebrations — 3 equal full-width photos, aligned frames."""
    W, H = 1200, 1600
    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)

    d.rounded_rectangle([60, 40, 780, 120], radius=18, fill=IVORY)
    d.text((90, 62), "This Year Celebrations", font=font(EN_B, 36), fill=NAVY)

    sections = [
        ("Saraswati Puja 2026", (80, 220, 210), "full-33.jpg"),
        ("Dol / Holi 2026", (255, 150, 170), "full-23.jpg"),
        ("Poila Boishakh 2026", (255, 200, 150), "full-20.jpg"),
    ]

    pad_x = 60
    frame_w = W - 2 * pad_x
    photo_h = 360
    y = 150

    for title, color, name in sections:
        d.text((pad_x, y), title, font=font(EN_B, 28), fill=color)
        y += 46
        d.rounded_rectangle([pad_x - 6, y - 6, pad_x + frame_w + 6, y + photo_h + 6], radius=18, fill=WHITE)
        photo = fit(CAMPAIGN / name, frame_w, photo_h, center=(0.5, 0.35))
        rounded_paste(img, photo, (pad_x, y), radius=14)
        y += photo_h + 28
        if y < H - 40:
            d.line([pad_x, y - 12, pad_x + frame_w, y - 12], fill=(80, 100, 140), width=1)

    out = CAMPAIGN / "experience.jpg"
    img.save(out, "JPEG", quality=92, optimize=True)
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    img.save(ARTIFACTS / "experience.jpg", "JPEG", quality=92)
    print("rebuilt", out)
    return out


def rebuild_hero():
    """Clean full-bleed idol hero for site + cards."""
    W, H = 1200, 1600
    photo = fit(CAMPAIGN / "full-36.jpg", W, H, center=(0.5, 0.35))
    # subtle bottom gradient for overlays
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for i in range(280):
        a = int(160 * (i / 280))
        od.line([(0, H - 280 + i), (W, H - 280 + i)], fill=(20, 12, 10, a))
    out_im = Image.alpha_composite(photo.convert("RGBA"), overlay).convert("RGB")
    out = CAMPAIGN / "hero-cover.jpg"
    out_im.save(out, "JPEG", quality=92, optimize=True)
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    out_im.save(ARTIFACTS / "hero-cover.jpg", "JPEG", quality=92)
    print("rebuilt", out)
    return out


# ---- Nirghonto cards ----

def is_bn(ch):
    return 0x0980 <= ord(ch) <= 0x09FF


def split_runs(text):
    runs, cur, mode = [], "", None
    for ch in text:
        m = "bn" if is_bn(ch) else "en"
        if mode is None:
            mode, cur = m, ch
        elif m == mode or ch.isspace() or ch in "|/-–,.:()₹+•'\"0123456789":
            cur += ch
        else:
            runs.append((mode, cur))
            mode, cur = m, ch
    if cur:
        runs.append((mode, cur))
    return runs


def measure(draw, text, size, bold=False):
    w = h = 0
    for mode, run in split_runs(text):
        path = (BN_B if bold else BN) if mode == "bn" else (EN_B if bold else EN)
        bb = draw.textbbox((0, 0), run, font=font(path, size))
        w += bb[2] - bb[0]
        h = max(h, bb[3] - bb[1])
    return w, h


def draw_mixed(draw, x, y, text, size, fill, bold=False, center=False, max_w=None):
    max_w = max_w or CW
    words = text.split(" ")
    lines, cur = [], ""
    for word in words:
        trial = (cur + " " + word).strip()
        if measure(draw, trial, size, bold)[0] <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    cy = y
    for line in lines:
        lw, lh = measure(draw, line, size, bold)
        lx = (L + (CW - lw) / 2) if center else x
        cx = lx
        for mode, run in split_runs(line):
            path = (BN_B if bold else BN) if mode == "bn" else (EN_B if bold else EN)
            f = font(path, size)
            draw.text((cx, cy), run, font=f, fill=fill)
            bb = draw.textbbox((0, 0), run, font=f)
            cx += bb[2] - bb[0]
        cy += lh + 10
    return cy


def base(photo_name, photo_h=300):
    img = Image.new("RGB", (W_CARD, H_CARD), BROWN)
    d = ImageDraw.Draw(img)
    d.rectangle([MARGIN - 6, MARGIN - 6, W_CARD - MARGIN + 6, H_CARD - MARGIN + 6], outline=GOLD, width=3)
    d.rectangle([MARGIN, MARGIN, W_CARD - MARGIN, H_CARD - MARGIN], outline=(170, 135, 40), width=1)
    y = MARGIN + 18
    photo = fit(CAMPAIGN / photo_name, CW, photo_h, center=(0.5, 0.35))
    # frame photo full width of content
    rounded_paste(img, photo, (L, y), radius=18)
    d.rounded_rectangle([L, y, R, y + photo_h], radius=18, outline=GOLD, width=2)
    y = y + photo_h + 22
    return img, d, y


def footer(d, label):
    d.line([L, FOOTER_Y - 16, R, FOOTER_Y - 16], fill=GOLD, width=1)
    draw_mixed(d, L, FOOTER_Y - 6, "EOC One10 | PS One-10, New Town", 20, GOLD, center=True)
    draw_mixed(d, L, FOOTER_Y + 26, label, 20, IVORY_DIM, center=True)


def info_box(d, y, title, lines):
    line_h = 38
    h = 28 + 40 + len(lines) * line_h + 18
    d.rounded_rectangle([L, y, R, y + h], radius=16, fill=PANEL, outline=GOLD, width=2)
    ty = y + 18
    ty = draw_mixed(d, L + 24, ty, title, 24, GOLD_SOFT, bold=True, max_w=CW - 48)
    for line in lines:
        ty = draw_mixed(d, L + 24, ty + 2, "•  " + line, 22, IVORY, max_w=CW - 48)
    return y + h + 16


def card_cover():
    img, d, y = base("full-36.jpg", 340)
    y = draw_mixed(d, L, y, "Events Organising Committee", 22, GOLD, center=True)
    y = draw_mixed(d, L, y + 2, "One10 Durgotsav 2026", 46, IVORY, bold=True, center=True)
    y = draw_mixed(d, L, y + 6, "আমাদের পুজো | আমাদের ওয়ান-টেন", 26, GOLD_SOFT, bold=True, center=True)
    y += 12
    d.rounded_rectangle([L + 100, y, R - 100, y + 64], radius=16, fill=VERMILION)
    draw_mixed(d, L, y + 16, "16 - 21 October 2026", 28, WHITE, bold=True, center=True)
    y += 80
    y = draw_mixed(d, L, y, "ষষ্ঠী থেকে দশমী | পূর্ণ নির্ঘণ্ট", 24, IVORY, center=True)
    y = draw_mixed(d, L, y, "Door-to-door campaign cards", 20, IVORY_DIM, center=True)
    y += 12
    d.rounded_rectangle([L, y, R, y + 190], radius=16, fill=PANEL, outline=GOLD, width=2)
    cy = y + 18
    cy = draw_mixed(d, L, cy, "Household subscription", 20, GOLD, center=True)
    cy = draw_mixed(d, L, cy + 2, "Rs 3,500 / family", 40, IVORY, bold=True, center=True)
    cy = draw_mixed(d, L, cy, "Rs 2,500 + Rs 300 Kali + Rs 700 Bijoya", 20, IVORY_DIM, center=True)
    draw_mixed(d, L, cy, "Verified digital receipt after payment", 18, GOLD_SOFT, center=True)
    y += 206
    d.rounded_rectangle([L, y, R, y + 100], radius=16, fill=(20, 12, 10), outline=GOLD, width=1)
    cy = y + 16
    cy = draw_mixed(d, L, cy, "Principal venue", 18, GOLD, center=True)
    draw_mixed(d, L, cy, "Badminton court near tennis court, Tower 11", 22, IVORY, center=True)
    y += 116
    for line in [
        "16 Sasthi | 17 Saptami | 18 Saptami/Ashtami",
        "19 Ashtami (Sandhi) | 20 Navami | 21 Dashami",
    ]:
        y = draw_mixed(d, L, y, line, 20, IVORY_DIM, center=True)
    y += 8
    d.rounded_rectangle([L + 60, y, R - 60, y + 58], radius=28, fill=VERMILION)
    draw_mixed(d, L, y + 14, "one10events.in/subscribe  |  /nirghanto", 18, WHITE, bold=True, center=True)
    footer(d, "Card 1/4 Cover | one10events.in/nirghanto")
    return img


def card_sasthi():
    img, d, y = base("full-34.jpg", 260)
    y = draw_mixed(d, L, y, "পুজো নির্ঘণ্ট | প্রাচীন পঞ্জিকা", 22, GOLD, center=True)
    y = draw_mixed(d, L, y + 4, "ষষ্ঠী ও সপ্তমী", 36, GOLD, bold=True, center=True)
    y = draw_mixed(d, L, y, "Sasthi & Saptami", 26, IVORY, bold=True, center=True)
    y = draw_mixed(d, L, y, "16 - 18 October 2026", 22, VERMILION, bold=True, center=True)
    y += 14
    y = info_box(d, y, "Maha Sasthi | 16 Oct (Fri)", [
        "Tithi: 16 Oct 1:42 AM - 17 Oct 3:46 AM",
        "Sankalpa & Sasthi puja by 8:30 AM",
        "Purvahna until 9:28 AM",
        "Evening: Bodhon, Belbaran, Adhibas",
    ])
    y = info_box(d, y, "Maha Saptami | 17-18 Oct", [
        "Tithi starts 17 Oct 3:46 AM (day-night)",
        "Nabapatrika after 7:04 AM",
        "Saptami kalparambha & puja",
        "Tithi ends 18 Oct 5:53 AM",
        "Midnight puja 10:59 PM - 11:47 PM",
    ])
    footer(d, "Card 2/4 Sasthi-Saptami | one10events.in/nirghanto")
    return img


def card_ashtami():
    img, d, y = base("full-18.jpg", 260)
    y = draw_mixed(d, L, y, "পুজো নির্ঘণ্ট | প্রাচীন পঞ্জিকা", 22, GOLD, center=True)
    y = draw_mixed(d, L, y + 4, "মহাষ্টমী ও সন্ধিপুজো", 34, GOLD, bold=True, center=True)
    y = draw_mixed(d, L, y, "Maha Ashtami & Sandhi", 26, IVORY, bold=True, center=True)
    y = draw_mixed(d, L, y, "18 - 19 October 2026", 22, VERMILION, bold=True, center=True)
    y += 12
    d.rounded_rectangle([L, y, R, y + 100], radius=16, fill=VERMILION)
    draw_mixed(d, L, y + 18, "সন্ধিপুজো / Sandhi Puja", 26, WHITE, bold=True, center=True)
    draw_mixed(d, L, y + 56, "19 Oct  |  7:26 AM - 8:14 AM", 26, WHITE, bold=True, center=True)
    y += 118
    y = info_box(d, y, "Tithi & puja timings (Prachin)", [
        "Ashtami starts: 18 Oct Sun 5:53 AM",
        "Ashtami ends: 19 Oct Mon 7:50 AM",
        "Kalparambha & Anjali by 7:05 AM",
        "Sandhi Puja: 7:26 AM - 8:14 AM",
        "Balidan: 7:50 AM | Purvahna to 9:28 AM",
    ])
    d.rounded_rectangle([L, y, R, y + 90], radius=14, fill=PANEL, outline=GOLD_SOFT, width=2)
    draw_mixed(
        d, L + 20, y + 20,
        "Bisuddha Sandhi: 10:28 AM - 11:16 AM. One10 follows Prachin / Thakurmasai.",
        20, GOLD_SOFT, max_w=CW - 40,
    )
    footer(d, "Card 3/4 Ashtami-Sandhi | one10events.in/nirghanto")
    return img


def card_navami():
    img, d, y = base("full-15.jpg", 260)
    y = draw_mixed(d, L, y, "পুজো নির্ঘণ্ট | প্রাচীন পঞ্জিকা", 22, GOLD, center=True)
    y = draw_mixed(d, L, y + 4, "নবমী ও বিজয়া দশমী", 34, GOLD, bold=True, center=True)
    y = draw_mixed(d, L, y, "Navami & Vijaya Dashami", 26, IVORY, bold=True, center=True)
    y = draw_mixed(d, L, y, "19 - 21 October 2026", 22, VERMILION, bold=True, center=True)
    y += 12
    y = info_box(d, y, "Maha Navami | 19-20 Oct", [
        "Tithi: 19 Oct 7:50 AM - 20 Oct 9:31 AM",
        "Mahanaavami puja by 7:05 AM",
        "Again 8:31 AM - 9:31 AM",
        "Navaratri brata concludes",
    ])
    y = info_box(d, y, "Vijaya Dashami | 20-21 Oct", [
        "Tithi: 20 Oct 9:31 AM - 21 Oct 10:47 AM",
        "Dashami puja & Visarjan by 8:31 AM",
        "Aparajita puja after Visarjan",
        "Vijaya Dashami rites / Dussehra",
    ])
    d.rounded_rectangle([L, y, R, y + 100], radius=16, fill=VERMILION)
    draw_mixed(d, L, y + 18, "পরিবার পিছু চাঁদা Rs 3,500", 28, WHITE, bold=True, center=True)
    draw_mixed(d, L, y + 58, "one10events.in/subscribe  |  /nirghanto", 18, WHITE, center=True)
    footer(d, "Card 4/4 Navami-Dashami | one10events.in/subscribe")
    return img


def export_pdfs(card_png_names):
    """Write individual A5 PDFs + one combined PDF next to the PNGs."""
    try:
        from reportlab.lib.pagesizes import A5
        from reportlab.pdfgen import canvas
        from reportlab.lib.utils import ImageReader
    except ImportError:
        print("reportlab not installed — skip PDF export")
        return

    primary = OUT_CARDS[0]
    pdf_names = []
    page_w, page_h = A5
    for png_name in card_png_names:
        pdf_name = png_name.replace(".png", ".pdf")
        pdf_names.append(pdf_name)
        for out in OUT_CARDS:
            pdf_path = out / pdf_name
            c = canvas.Canvas(str(pdf_path), pagesize=A5)
            c.drawImage(
                ImageReader(str(out / png_name)),
                0, 0, width=page_w, height=page_h,
                preserveAspectRatio=True, anchor="c",
            )
            c.showPage()
            c.save()
            print("pdf", pdf_path)

    combined = "one10-durgotsav-2026-nirghonto-cards.pdf"
    for out in OUT_CARDS:
        c = canvas.Canvas(str(out / combined), pagesize=A5)
        for png_name in card_png_names:
            c.drawImage(
                ImageReader(str(out / png_name)),
                0, 0, width=page_w, height=page_h,
                preserveAspectRatio=True, anchor="c",
            )
            c.showPage()
        c.save()
        print("pdf", out / combined)


def main():
    rebuild_highlights()
    rebuild_experience()
    rebuild_hero()
    cards = [
        ("01-cover-subscribe.png", card_cover()),
        ("02-sasthi-saptami.png", card_sasthi()),
        ("03-ashtami-sandhi.png", card_ashtami()),
        ("04-navami-dashami.png", card_navami()),
    ]
    names = []
    for out in OUT_CARDS:
        out.mkdir(parents=True, exist_ok=True)
        for name, img in cards:
            img.save(out / name, "PNG", optimize=True)
            print("card", out / name)
            if name not in names:
                names.append(name)
    export_pdfs(names)


if __name__ == "__main__":
    main()
