#!/usr/bin/env python3
"""Generate 4 door-to-door Durgotsav 2026 Nirghonto campaign cards (A5 portrait PNGs)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT_DIRS = [
    ROOT / "frontend" / "public" / "campaign-cards",
    Path("/opt/cursor/artifacts/campaign-cards"),
]

W, H = 1240, 1748  # ~A5 @ 150dpi
BROWN = (31, 20, 18)
BROWN2 = (42, 27, 24)
IVORY = (255, 255, 240)
IVORY_DIM = (245, 240, 230)
GOLD = (212, 175, 55)
GOLD_SOFT = (230, 179, 30)
VERMILION = (217, 56, 30)
WHITE = (255, 255, 255)

BN = "/usr/share/fonts/truetype/noto/NotoSerifBengali-Regular.ttf"
BN_B = "/usr/share/fonts/truetype/noto/NotoSerifBengali-Bold.ttf"
EN = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
EN_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
EN_SERIF_B = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"


def font(path, size):
    return ImageFont.truetype(path, size)


def draw_bg(draw):
    draw.rectangle([0, 0, W, H], fill=BROWN)
    draw.rectangle([36, 36, W - 36, H - 36], outline=GOLD, width=3)
    draw.rectangle([48, 48, W - 48, H - 48], outline=GOLD, width=1)
    draw.rectangle([48, 48, W - 48, 160], fill=BROWN2)
    draw.line([48, 160, W - 48, 160], fill=GOLD, width=2)


def text_w(draw, text, fnt):
    b = draw.textbbox((0, 0), text, font=fnt)
    return b[2] - b[0]


def center_text(draw, y, text, fnt, fill=IVORY):
    tw = text_w(draw, text, fnt)
    draw.text(((W - tw) / 2, y), text, font=fnt, fill=fill)
    b = draw.textbbox((0, 0), text, font=fnt)
    return y + (b[3] - b[1]) + 8


def wrap_lines(draw, text, fnt, max_w):
    words = text.split()
    lines, cur = [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if text_w(draw, trial, fnt) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines or [text]


def draw_footer(draw, page_label):
    y = H - 120
    draw.line([80, y, W - 80, y], fill=GOLD, width=1)
    center_text(draw, y + 16, "EOC One10 · PS One-10, New Town", font(EN, 22), GOLD)
    center_text(draw, y + 48, page_label, font(BN, 26), IVORY_DIM)


def section_header(d, y, title_bn, title_en, date_line):
    y = center_text(d, y, title_bn, font(BN_B, 44), GOLD)
    y = center_text(d, y, title_en, font(EN_SERIF_B, 36), IVORY)
    y = center_text(d, y + 4, date_line, font(EN, 26), VERMILION)
    d.line([140, y + 10, W - 140, y + 10], fill=GOLD, width=1)
    return y + 28


def card_cover():
    img = Image.new("RGB", (W, H), BROWN)
    d = ImageDraw.Draw(img)
    draw_bg(d)

    y = 70
    y = center_text(d, y, "Events Organising Committee", font(EN, 26), GOLD)
    y = center_text(d, y + 4, "One10 Durgotsav 2026", font(EN_SERIF_B, 54), IVORY)
    y = center_text(d, y + 2, "আমাদের পুজো · আমাদের One10", font(BN_B, 36), GOLD_SOFT)

    y += 36
    box = [180, y, W - 180, y + 90]
    d.rounded_rectangle(box, radius=20, fill=VERMILION)
    center_text(d, y + 22, "16 – 21 October 2026", font(EN_B, 36), WHITE)

    y = box[3] + 28
    y = center_text(d, y, "ষষ্ঠী → দশমী  ·  পূর্ণ নির্ঘণ্ট সহ", font(BN, 32), IVORY)
    y = center_text(d, y + 4, "Door-to-door campaign card set", font(EN, 26), IVORY_DIM)

    y += 28
    d.rounded_rectangle([100, y, W - 100, y + 260], radius=24, outline=GOLD, width=2, fill=BROWN2)
    center_text(d, y + 28, "Household subscription", font(EN, 24), GOLD)
    center_text(d, y + 70, "₹ 3,500", font(EN_SERIF_B, 72), IVORY)
    center_text(d, y + 160, "₹2,500 + ₹300 Kali + ₹700 Bijoya", font(EN, 24), IVORY_DIM)
    center_text(d, y + 200, "Verified digital receipt after payment", font(EN, 22), GOLD_SOFT)

    y += 300
    d.rounded_rectangle([100, y, W - 100, y + 180], radius=24, fill=(23, 13, 11), outline=GOLD, width=1)
    center_text(d, y + 28, "Principal venue", font(EN, 22), GOLD)
    yy = y + 70
    for line in wrap_lines(d, "Badminton court near the tennis court, in front of Tower 11", font(EN, 28), W - 260):
        center_text(d, yy, line, font(EN, 28), IVORY)
        yy += 40

    y += 220
    for b in [
        "১৬ অক্টোবর ষষ্ঠী · ১৭ সপ্তমী · ১৮ সপ্তমী/অষ্টমী",
        "১৯ অষ্টমী (সন্ধিপুজো) · ২০ নবমী · ২১ দশমী",
        "প্রাচীন পঞ্জিকা · ঠাকুরমশাই নিশ্চিত",
    ]:
        center_text(d, y, b, font(BN, 28), IVORY_DIM)
        y += 42

    y += 16
    d.rounded_rectangle([200, y, W - 200, y + 70], radius=35, fill=VERMILION)
    center_text(d, y + 16, "Subscribe & Pay · One 10 Events", font(EN_B, 28), WHITE)

    draw_footer(d, "কার্ড ১ / ৪  ·  কভার")
    return img


def card_sasthi_saptami():
    img = Image.new("RGB", (W, H), BROWN)
    d = ImageDraw.Draw(img)
    draw_bg(d)
    y = 70
    y = center_text(d, y, "পুজো নির্ঘণ্ট · প্রাচীন পঞ্জিকা", font(BN, 28), GOLD)
    y = section_header(d, y + 20, "ষষ্ঠী ও সপ্তমী", "Sasthi & Saptami", "16–18 October 2026")

    d.rounded_rectangle([90, y, W - 90, y + 320], radius=20, fill=BROWN2, outline=GOLD, width=1)
    d.text((120, y + 24), "মহা ষষ্ঠী · 16 Oct (Fri) · ২৮ আশ্বিন", font=font(BN_B, 30), fill=GOLD_SOFT)
    lines = [
        "তিথি: 16 Oct 1:42 AM → 17 Oct 3:46 AM",
        "সকাল ৮:৩০-এর মধ্যে সংকল্প ও ষষ্ঠী পুজো",
        "পূর্বাহ্ন সকাল ৯:২৮ পর্যন্ত",
        "সন্ধ্যায়: বোধন, আমন্ত্রণ, বেলবরণ, অধিবাস",
    ]
    yy = y + 80
    for line in lines:
        d.text((130, yy), "•  " + line, font=font(BN, 28), fill=IVORY)
        yy += 48

    y = y + 350
    d.rounded_rectangle([90, y, W - 90, y + 420], radius=20, fill=BROWN2, outline=GOLD, width=1)
    d.text((120, y + 24), "মহা সপ্তমী · 17–18 Oct · ২৯–৩০ আশ্বিন", font=font(BN_B, 30), fill=GOLD_SOFT)
    lines = [
        "তিথি শুরু: 17 Oct 3:46 AM (অহোরাত্র)",
        "দিবা ৭:০৪-এর পরে নবপত্রিকা প্রবেশ ও স্থাপন",
        "সপ্তমাদি কল্পারম্ভ ও সপ্তমী বিহিত পুজো",
        "তিথি শেষ: 18 Oct 5:53 AM",
        "ভোর ৫:৫৩-এর মধ্যে অধিক সপ্তমী পুজো",
        "রাত ১০:৫৯–১১:৪৭ অর্ধরাত্রি পুজো",
    ]
    yy = y + 80
    for line in lines:
        d.text((130, yy), "•  " + line, font=font(BN, 28), fill=IVORY)
        yy += 48

    draw_footer(d, "কার্ড ২ / ৪  ·  ষষ্ঠী–সপ্তমী")
    return img


def card_ashtami_sandhi():
    img = Image.new("RGB", (W, H), BROWN)
    d = ImageDraw.Draw(img)
    draw_bg(d)
    y = 70
    y = center_text(d, y, "পুজো নির্ঘণ্ট · প্রাচীন পঞ্জিকা", font(BN, 28), GOLD)
    y = section_header(d, y + 20, "মহাষ্টমী ও সন্ধিপুজো", "Maha Ashtami & Sandhi", "18–19 October 2026")

    d.rounded_rectangle([90, y, W - 90, y + 160], radius=20, fill=VERMILION)
    center_text(d, y + 28, "সন্ধিপুজো", font(BN_B, 36), WHITE)
    center_text(d, y + 80, "19 Oct · 7:26 AM – 8:14 AM", font(EN_B, 34), WHITE)

    y += 190
    d.rounded_rectangle([90, y, W - 90, y + 520], radius=20, fill=BROWN2, outline=GOLD, width=1)
    d.text((120, y + 24), "তিথি ও পুজোর সময়", font=font(BN_B, 30), fill=GOLD_SOFT)
    lines = [
        "অষ্টমী শুরু: 18 Oct রবিবার সকাল ৫:৫৩",
        "অষ্টমী শেষ: 19 Oct সোমবার সকাল ৭:৫০",
        "সকাল ৭:০৫-এর মধ্যে মহাষ্টমী কল্পারম্ভ",
        "অঞ্জলি ও বীরাষ্টমী ব্রত সকাল ৭:০৫-এর মধ্যে",
        "সন্ধিপুজো: ৭:২৬ গতে → ৮:১৪-এর মধ্যে",
        "বলিদান: সকাল ৭:৫০",
        "পূর্বাহ্ন সকাল ৯:২৮ পর্যন্ত",
    ]
    yy = y + 80
    for line in lines:
        d.text((130, yy), "•  " + line, font=font(BN, 28), fill=IVORY)
        yy += 52

    y += 560
    d.rounded_rectangle([90, y, W - 90, y + 110], radius=16, outline=GOLD_SOFT, width=2)
    note = "বিশুদ্ধ সিদ্ধান্ত মতে সন্ধিপুজো: সকাল ১০:২৮ – ১১:১৬ (One10 প্রাচীন পঞ্জিকা মানবে)"
    for i, line in enumerate(wrap_lines(d, note, font(BN, 26), W - 240)):
        d.text((120, y + 28 + i * 36), line, font=font(BN, 26), fill=GOLD_SOFT)

    draw_footer(d, "কার্ড ৩ / ৪  ·  অষ্টমী–সন্ধি")
    return img


def card_navami_dashami():
    img = Image.new("RGB", (W, H), BROWN)
    d = ImageDraw.Draw(img)
    draw_bg(d)
    y = 70
    y = center_text(d, y, "পুজো নির্ঘণ্ট · প্রাচীন পঞ্জিকা", font(BN, 28), GOLD)
    y = section_header(d, y + 16, "নবমী ও বিজয়া দশমী", "Navami & Vijaya Dashami", "19–21 October 2026")

    d.rounded_rectangle([90, y, W - 90, y + 300], radius=20, fill=BROWN2, outline=GOLD, width=1)
    d.text((120, y + 24), "মহানবমী · 19–20 Oct · ২ কার্তিক", font=font(BN_B, 30), fill=GOLD_SOFT)
    lines = [
        "তিথি: 19 Oct 7:50 AM → 20 Oct 9:31 AM",
        "সকাল ৭:০৫-এর মধ্যে মহানবমী পুজো",
        "পুনঃ ৮:৩১ – ৯:৩১ কেবল মহানবমী কল্প",
        "নবরাত্রি ব্রত সমাপন",
    ]
    yy = y + 80
    for line in lines:
        d.text((130, yy), "•  " + line, font=font(BN, 28), fill=IVORY)
        yy += 48

    y += 330
    d.rounded_rectangle([90, y, W - 90, y + 320], radius=20, fill=BROWN2, outline=GOLD, width=1)
    d.text((120, y + 24), "বিজয়া দশমী · 20–21 Oct · ৩ কার্তিক", font=font(BN_B, 30), fill=GOLD_SOFT)
    lines = [
        "তিথি: 20 Oct 9:31 AM → 21 Oct 10:47 AM",
        "সকাল ৮:৩১-এর মধ্যে দশমী পুজো ও বিসর্জন",
        "বিসর্জনান্তে অপরাজিতা পুজো",
        "বিজয়া দশমী কৃত্য / দশেরা",
    ]
    yy = y + 80
    for line in lines:
        d.text((130, yy), "•  " + line, font=font(BN, 28), fill=IVORY)
        yy += 48

    y += 360
    d.rounded_rectangle([90, y, W - 90, y + 160], radius=20, fill=VERMILION)
    center_text(d, y + 28, "পরিবার পিছু চাঁদা ₹৩,৫০০", font(BN_B, 34), WHITE)
    center_text(d, y + 85, "Subscribe on One 10 Events · verified receipt", font(EN, 24), WHITE)

    draw_footer(d, "কার্ড ৪ / ৪  ·  নবমী–দশমী")
    return img


def main():
    cards = [
        ("01-cover-subscribe.png", card_cover()),
        ("02-sasthi-saptami.png", card_sasthi_saptami()),
        ("03-ashtami-sandhi.png", card_ashtami_sandhi()),
        ("04-navami-dashami.png", card_navami_dashami()),
    ]
    for out in OUT_DIRS:
        out.mkdir(parents=True, exist_ok=True)
        for name, img in cards:
            path = out / name
            img.save(path, "PNG", optimize=True)
            print(f"wrote {path}")


if __name__ == "__main__":
    main()
