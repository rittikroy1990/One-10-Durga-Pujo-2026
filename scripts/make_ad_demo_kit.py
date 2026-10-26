"""Build the /promote demo kit: a sample advertiser's creatives at spec, plus per-package
infographics and short vertical videos for WhatsApp / Instagram.

Usage (from repo root):
    backend/.venv/bin/python scripts/make_ad_demo_kit.py [--brand-dir /root/ancholkatha.com/frontend/public/assets]

Fonts (Cormorant Garamond, Figtree — OFL) are fetched into ~/.cache/one10-fonts on first run.
Output: frontend/public/images/advertise/demo/
"""
from __future__ import annotations

import argparse
import math
import random
import struct
import subprocess
import tempfile
import urllib.request
import wave
from pathlib import Path

import qrcode
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend/public/images/advertise/demo"
ONE10 = ROOT / "frontend/public/images"
FONT_CACHE = Path.home() / ".cache/one10-fonts"
FONTS = {
    "serif": ("CormorantGaramond[wght].ttf", "cormorantgaramond/CormorantGaramond%5Bwght%5D.ttf"),
    "sans": ("Figtree[wght].ttf", "figtree/Figtree%5Bwght%5D.ttf"),
}
APPLY_URL = "https://one10events.in/promote"

# One10 palette
VERMILION = (224, 53, 32)
BROWN = (44, 24, 16)
BROWN_SOFT = (61, 36, 24)
SUN = (245, 166, 35)
SUN_50 = (255, 249, 240)
IVORY = (255, 248, 236)
SKY = (245, 251, 255)
WHITE = (255, 255, 255)
# Anchol Katha palette
AK_BG = (251, 246, 234)
AK_INK = (43, 36, 30)
AK_TERRA = (198, 90, 58)
AK_INDIGO = (31, 42, 90)
AK_HOLUD = (214, 162, 30)

SAMPLE = {
    "business_name": "Anchol Katha",
    "category": "Fashion & boutique",
    "headline": "Handwoven Bengal sarees for Pujo",
    "writeup": "Tant, jamdani and handloom cotton sarees picked for Saptami to Dashami.",
    "cta": "Shop the Pujo edit",
    "site": "ancholkatha.com",
}

PACKAGES = [
    {
        "code": "neighbourhood_card", "name": "Neighbourhood Card", "inside": 1000, "outside": 1500, "cap": None, "free": True,
        "gets": ["Card in the Home page strip", "Listing in the Local businesses directory",
                 "WhatsApp / website button"],
        "send": ["logo", "card"], "optional": [],
        "where": ["home", "directory"],
    },
    {
        "code": "spotlight_feature", "name": "Spotlight Feature", "inside": 2000, "outside": 3000, "cap": 12,
        "gets": ["Everything in Card", "Your own page on one10events.in", "Sponsors page rail",
                 "Featured badge in the directory"],
        "send": ["logo", "card", "hero"], "optional": [],
        "where": ["home", "page", "sponsors"],
    },
    {
        "code": "story_page", "name": "Story Page", "inside": 3000, "outside": 4500, "cap": 6,
        "gets": ["Everything in Spotlight", "Story layout with vertical poster", "Video up to 30 seconds"],
        "send": ["logo", "card", "hero"], "optional": ["story_vertical", "video"],
        "where": ["home", "story", "sponsors"],
    },
]
ASSET_LABEL = {
    "logo": ("Logo", "800×800"),
    "card": ("Card image", "1200×630"),
    "hero": ("Hero banner", "1920×1080"),
    "story_vertical": ("Vertical poster", "1080×1920"),
    "video": ("Video", "≤30 s, 1080p"),
}


# ------------------------------------------------------------------ primitives
# Cormorant defaults to old-style figures, which turn "One10" into "Oneio"; ask raqm for lining figures.
_draw_text, _draw_textlength = ImageDraw.ImageDraw.text, ImageDraw.ImageDraw.textlength


def _text_lnum(self, xy, text, *a, **k):
    k.setdefault("features", ["lnum"])
    return _draw_text(self, xy, text, *a, **k)


def _textlength_lnum(self, text, *a, **k):
    k.setdefault("features", ["lnum"])
    return _draw_textlength(self, text, *a, **k)


ImageDraw.ImageDraw.text, ImageDraw.ImageDraw.textlength = _text_lnum, _textlength_lnum


def font_path(kind: str) -> Path:
    name, remote = FONTS[kind]
    p = FONT_CACHE / name
    if not p.exists():
        FONT_CACHE.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(f"https://github.com/google/fonts/raw/main/ofl/{remote}", p)
    return p


_font_cache: dict = {}


def F(kind: str, size: int, weight: int = 400) -> ImageFont.FreeTypeFont:
    key = (kind, size, weight)
    if key not in _font_cache:
        f = ImageFont.truetype(str(font_path(kind)), size)
        try:
            f.set_variation_by_axes([weight])
        except Exception:
            pass
        _font_cache[key] = f
    return _font_cache[key]


def rupees(n: int) -> str:
    return f"₹{n:,}"


def cover(img: Image.Image, w: int, h: int, focus=(0.5, 0.5)) -> Image.Image:
    return ImageOps.fit(img.convert("RGB"), (w, h), Image.LANCZOS, centering=focus)


def rounded(img: Image.Image, r: int) -> Image.Image:
    img = img.convert("RGBA")
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, img.width - 1, img.height - 1), r, fill=255)
    img.putalpha(mask)
    return img


def shadow(layer: Image.Image, radius=24, offset=(0, 14), opacity=60) -> Image.Image:
    pad = radius * 3
    out = Image.new("RGBA", (layer.width + pad * 2, layer.height + pad * 2), (0, 0, 0, 0))
    a = layer.split()[-1].point(lambda v: v * opacity // 255)
    sh = Image.new("RGBA", layer.size, (20, 10, 5, 255))
    sh.putalpha(a)
    out.alpha_composite(sh, (pad + offset[0], pad + offset[1]))
    out = out.filter(ImageFilter.GaussianBlur(radius))
    out.alpha_composite(layer, (pad, pad))
    return out


def paste_shadowed(base: Image.Image, layer: Image.Image, xy, radius=24, offset=(0, 14), opacity=60):
    sh = shadow(layer, radius, offset, opacity)
    pad = radius * 3
    base.alpha_composite(sh, (xy[0] - pad, xy[1] - pad))


def wrap(draw: ImageDraw.ImageDraw, text: str, font, width: int) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if draw.textlength(trial, font=font) <= width:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def text_block(draw, xy, text, font, fill, width, spacing=1.18) -> int:
    x, y = xy
    for line in wrap(draw, text, font, width):
        draw.text((x, y), line, font=font, fill=fill)
        y += int(font.size * spacing)
    return y


def pill(draw, xy, text, font, fg, bg, pad=(18, 8), radius=None) -> tuple[int, int]:
    x, y = xy
    tw = int(draw.textlength(text, font=font))
    h = font.size + pad[1] * 2
    draw.rounded_rectangle((x, y, x + tw + pad[0] * 2, y + h), radius or h // 2, fill=bg)
    draw.text((x + pad[0], y + pad[1] - font.size * 0.12), text, font=font, fill=fg)
    return tw + pad[0] * 2, h


def qr_image(url: str, size: int, fg=BROWN, bg=WHITE) -> Image.Image:
    q = qrcode.QRCode(border=2, box_size=10, error_correction=qrcode.constants.ERROR_CORRECT_M)
    q.add_data(url)
    q.make(fit=True)
    img = q.make_image(fill_color=fg, back_color=bg).convert("RGB")
    return img.resize((size, size), Image.NEAREST)


def gradient(w, h, top, bottom, alpha_top=255, alpha_bottom=255) -> Image.Image:
    g = Image.new("RGBA", (w, h))
    px = g.load()
    for y in range(h):
        t = y / max(1, h - 1)
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        a = int(alpha_top + (alpha_bottom - alpha_top) * t)
        for x in range(w):
            px[x, y] = (*c, a)
    return g


def vgrad_overlay(w, h, color, a_top, a_bottom) -> Image.Image:
    col = Image.new("RGBA", (1, h))
    for y in range(h):
        t = y / max(1, h - 1)
        col.putpixel((0, y), (*color, int(a_top + (a_bottom - a_top) * t)))
    return col.resize((w, h))


# ------------------------------------------------------------------ sample advertiser creatives
class Brand:
    def __init__(self, brand_dir: Path):
        a = brand_dir
        self.logo = Image.open(a / "brand/anchol-katha-logo-v2.png").convert("RGBA")
        self.mark = Image.open(a / "brand/anchol-katha-mark-v2.png").convert("RGBA")
        c = a / "collections"
        self.pujo = Image.open(c / "durga-pujo-dhak-lane.jpg").convert("RGB")
        self.marigold = Image.open(c / "marigolds-before-evening.jpg").convert("RGB")
        self.cream = Image.open(c / "earthen-cream-slow-afternoon.jpg").convert("RGB")
        self.indigo = Image.open(c / "indigo-after-rain.jpg").convert("RGB")
        self.courtyard = Image.open(c / "white-courtyard-open-window.jpg").convert("RGB")
        self.bazaar = Image.open(c / "bazaar-morning-cotton-folded.jpg").convert("RGB")
        self.saree = Image.open(a / "categories/sarees.jpg").convert("RGB")


def make_logo(b: Brand) -> Image.Image:
    img = Image.new("RGBA", (800, 800), (*AK_BG, 255))
    m = b.mark.copy()
    m.thumbnail((620, 620), Image.LANCZOS)
    img.alpha_composite(m, ((800 - m.width) // 2, (800 - m.height) // 2 - 10))
    return img


def make_card(b: Brand) -> Image.Image:
    w, h = 1200, 630
    img = cover(b.pujo, w, h, (0.32, 0.4)).convert("RGBA")
    panel = Image.new("RGBA", (520, h), (*AK_BG, 0))
    grad = Image.new("L", (520, 1))
    for x in range(520):
        grad.putpixel((x, 0), int(min(245, max(0, (x - 40) * 2.2))))
    panel.putalpha(grad.resize((520, h)))
    img.alpha_composite(panel, (w - 520, 0))
    d = ImageDraw.Draw(img)
    x0 = w - 400
    lg = b.logo.copy()
    lg.thumbnail((330, 160), Image.LANCZOS)
    img.alpha_composite(lg, (x0 - 10, 70))
    y = text_block(d, (x0, 250), "Handwoven Bengal sarees for Pujo", F("serif", 50, 600), AK_INK, 360, 1.05)
    y = text_block(d, (x0, y + 14), "Tant · Jamdani · Handloom cotton", F("sans", 22, 500), AK_TERRA, 360)
    pill(d, (x0, y + 26), SAMPLE["cta"] + "  →", F("sans", 22, 700), WHITE, AK_INDIGO, (22, 12))
    d.text((x0, h - 60), SAMPLE["site"], font=F("sans", 20, 500), fill=(122, 107, 94))
    return img.convert("RGB")


def make_hero(b: Brand) -> Image.Image:
    w, h = 1920, 1080
    img = cover(b.marigold, w, h, (0.45, 0.45)).convert("RGBA")
    side = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    g = Image.new("L", (w, 1))
    for x in range(w):
        g.putpixel((x, 0), int(max(0, 215 - x * 0.24)))
    side.paste(Image.new("RGBA", (w, h), (*AK_INK, 255)), (0, 0), g.resize((w, h)))
    img.alpha_composite(side)
    d = ImageDraw.Draw(img)
    lg = b.logo.copy()
    # light logo on dark: draw on a cream rounded plate
    lg.thumbnail((360, 175), Image.LANCZOS)
    plate = rounded(Image.new("RGBA", (lg.width + 48, lg.height + 36), (*AK_BG, 240)), 22)
    plate.alpha_composite(lg, (24, 18))
    img.alpha_composite(plate, (120, 110))
    y = text_block(d, (120, 380), "This Pujo,", F("serif", 104, 600), WHITE, 1000, 1.0)
    y = text_block(d, (120, y), "wear a story.", F("serif", 104, 600), AK_HOLUD, 1000, 1.0)
    y = text_block(d, (124, y + 20), SAMPLE["writeup"], F("sans", 34, 400), (240, 230, 215), 760, 1.3)
    pill(d, (124, y + 40), SAMPLE["cta"] + "  →", F("sans", 32, 700), AK_INK, AK_HOLUD, (34, 18))
    d.text((124, h - 110), SAMPLE["site"], font=F("sans", 28, 500), fill=(240, 230, 215))
    return img.convert("RGB")


def make_story(b: Brand) -> Image.Image:
    w, h = 1080, 1920
    img = Image.new("RGBA", (w, h), (*AK_BG, 255))
    d = ImageDraw.Draw(img)
    # border motif
    d.rectangle((0, 0, w, 18), fill=AK_TERRA)
    d.rectangle((0, h - 18, w, h), fill=AK_INDIGO)
    lg = b.logo.copy()
    lg.thumbnail((520, 250), Image.LANCZOS)
    img.alpha_composite(lg, ((w - lg.width) // 2, 90))
    photo = rounded(cover(b.cream, 900, 1000, (0.55, 0.4)), 36)
    paste_shadowed(img, photo, (90, 380), 28, (0, 18), 70)
    d = ImageDraw.Draw(img)
    y = 1420
    for line in wrap(d, "Handwoven Bengal sarees for Pujo", F("serif", 76, 600), 900):
        tw = d.textlength(line, font=F("serif", 76, 600))
        d.text(((w - tw) / 2, y), line, font=F("serif", 76, 600), fill=AK_INK)
        y += 80
    sub = "Tant · Jamdani · Handloom cotton"
    f = F("sans", 32, 500)
    d.text(((w - d.textlength(sub, font=f)) / 2, y + 18), sub, font=f, fill=AK_TERRA)
    f = F("sans", 34, 700)
    label = SAMPLE["cta"] + "  →"
    tw = d.textlength(label, font=f)
    pill(d, (int((w - tw) / 2) - 36, y + 100), label, f, WHITE, AK_INDIGO, (36, 20))
    f = F("sans", 28, 500)
    d.text(((w - d.textlength(SAMPLE["site"], font=f)) / 2, h - 110), SAMPLE["site"], font=f, fill=(122, 107, 94))
    return img.convert("RGB")


# ------------------------------------------------------------------ site mockups (mirror the live AdCard)
def ad_card(card_img: Image.Image, logo_img: Image.Image, width: int, featured=True, ghost=False) -> Image.Image:
    s = width / 300
    ih = int(width * 630 / 1200)
    body = int(92 * s)
    card = Image.new("RGBA", (width, ih + body), (*WHITE, 255))
    d = ImageDraw.Draw(card)
    if ghost:
        d.rectangle((0, 0, width, ih), fill=(255, 241, 214))
        f = F("sans", int(15 * s), 600)
        t = "Your business here"
        d.text(((width - d.textlength(t, font=f)) / 2, ih / 2 - 10 * s), t, font=f, fill=(196, 140, 60))
        for i, ww in enumerate((0.55, 0.8)):
            d.rounded_rectangle((12 * s, ih + (18 + i * 24) * s, width * ww, ih + (30 + i * 24) * s), 6 * s, fill=(236, 226, 210))
    else:
        card.paste(cover(card_img, width, ih), (0, 0))
        if featured:
            pill(d, (int(8 * s), int(8 * s)), "FEATURED", F("sans", int(9 * s), 700), WHITE, VERMILION, (int(8 * s), int(4 * s)))
        f = F("sans", int(9 * s), 700)
        tw = d.textlength("AD", font=f)
        pill(d, (int(width - tw - 24 * s), int(8 * s)), "AD", f, (110, 90, 80), (255, 255, 255), (int(8 * s), int(4 * s)))
        lg = logo_img.copy().convert("RGBA")
        lg.thumbnail((int(40 * s), int(40 * s)), Image.LANCZOS)
        card.alpha_composite(lg, (int(12 * s), ih + int(12 * s)))
        x = int(60 * s)
        d.text((x, ih + 10 * s), SAMPLE["category"].upper(), font=F("sans", int(9 * s), 700), fill=VERMILION)
        d.text((x, ih + 24 * s), SAMPLE["business_name"], font=F("serif", int(20 * s), 600), fill=BROWN)
        lines = wrap(d, SAMPLE["headline"], F("sans", int(10.5 * s), 400), width - x - 10 * s)
        for i, line in enumerate(lines[:2]):
            d.text((x, ih + (52 + i * 14) * s), line, font=F("sans", int(10.5 * s), 400), fill=(110, 90, 80))
    card = rounded(card, int(16 * s))
    border = ImageDraw.Draw(card)
    border.rounded_rectangle((0, 0, card.width - 1, card.height - 1), int(16 * s), outline=(245, 214, 160), width=max(1, int(s)))
    return card


def phone(screen: Image.Image, width: int) -> Image.Image:
    """Phone frame around a 390-wide screen render, scaled to `width`."""
    bezel = 14
    w, h = screen.width + bezel * 2, screen.height + bezel * 2
    frame = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(frame)
    d.rounded_rectangle((0, 0, w - 1, h - 1), 56, fill=(28, 18, 12))
    frame.alpha_composite(rounded(screen, 44), (bezel, bezel))
    d.rounded_rectangle((w // 2 - 60, bezel + 10, w // 2 + 60, bezel + 34), 12, fill=(28, 18, 12))
    scale = width / w
    return frame.resize((width, int(h * scale)), Image.LANCZOS)


def site_header(screen: Image.Image, one10_logo: Image.Image):
    d = ImageDraw.Draw(screen)
    d.rectangle((0, 0, screen.width, 62), fill=(224, 53, 32))
    t, f = "DIGITAL PANDAL METER · TODAY 72", F("sans", 13, 700)
    d.text(((screen.width - d.textlength(t, font=f)) / 2, 40), t, font=f, fill=WHITE)
    d.rectangle((0, 62, screen.width, 130), fill=WHITE)
    lg = one10_logo.copy()
    lg.thumbnail((86, 42), Image.LANCZOS)
    screen.alpha_composite(lg, (18, 76))
    d.text((112, 78), "One 10 Durgotsav", font=F("serif", 22, 600), fill=BROWN)
    d.text((112, 104), "3rd year · Organised by EOC", font=F("sans", 11, 400), fill=(130, 110, 100))
    for i in range(3):
        d.rectangle((346, 86 + i * 9, 368, 89 + i * 9), fill=BROWN)


def screen_home(card_img, logo_img, one10_logo, takeover=False) -> Image.Image:
    s = Image.new("RGBA", (390, 844), (*SKY, 255))
    site_header(s, one10_logo)
    d = ImageDraw.Draw(s)
    d.rectangle((0, 130, 390, 300), fill=(255, 241, 214))
    d.text((20, 152), "Be part of Amader Pujo", font=F("serif", 30, 600), fill=BROWN)
    for i, ww in enumerate((330, 260)):
        d.rounded_rectangle((20, 200 + i * 20, 20 + ww, 210 + i * 20), 5, fill=(240, 214, 170))
    d.rounded_rectangle((20, 250, 160, 282), 16, fill=VERMILION)
    d.text((40, 257), "Subscribe & Pay", font=F("sans", 13, 700), fill=WHITE)
    d.text((20, 326), "NEIGHBOURHOOD", font=F("sans", 11, 700), fill=VERMILION)
    d.text((20, 344), "Local businesses", font=F("serif", 30, 600), fill=BROWN)
    d.text((300, 356), "See all →", font=F("sans", 12, 700), fill=VERMILION)
    c1 = ad_card(card_img, logo_img, 270, featured=True)
    c2 = ad_card(card_img, logo_img, 270, ghost=True)
    paste_shadowed(s, c1, (20, 400), 10, (0, 6), 40)
    paste_shadowed(s, c2, (304, 400), 10, (0, 6), 40)
    d = ImageDraw.Draw(s)
    if takeover:
        d.rounded_rectangle((16, 396, 294, 400 + c1.height + 4), 18, outline=SUN, width=4)
        pill(d, (26, 400 + c1.height + 14), "TOP SPOT ALL WINDOW", F("sans", 11, 700), BROWN, SUN, (10, 5))
    y = 400 + c1.height + 60
    d.rectangle((0, y, 390, 844), fill=(255, 249, 240))
    d.text((20, y + 24), "Programme", font=F("serif", 26, 600), fill=BROWN)
    for i in range(3):
        d.rounded_rectangle((20, y + 70 + i * 54, 370, y + 112 + i * 54), 12, fill=WHITE, outline=(245, 214, 160))
    return s


def screen_directory(card_img, logo_img, one10_logo) -> Image.Image:
    s = Image.new("RGBA", (390, 844), (*SUN_50, 255))
    site_header(s, one10_logo)
    d = ImageDraw.Draw(s)
    d.text((20, 150), "NEIGHBOURHOOD", font=F("sans", 11, 700), fill=VERMILION)
    d.text((20, 168), "Local businesses", font=F("serif", 34, 600), fill=BROWN)
    d.rounded_rectangle((20, 222, 370, 256), 10, fill=WHITE, outline=(230, 210, 180))
    d.text((34, 230), "Search name or offer", font=F("sans", 13, 400), fill=(170, 150, 140))
    d.rounded_rectangle((20, 264, 190, 296), 10, fill=WHITE, outline=(230, 210, 180))
    d.text((32, 272), "Fashion & boutique", font=F("sans", 12, 500), fill=BROWN)
    c1 = ad_card(card_img, logo_img, 350, featured=True)
    paste_shadowed(s, c1, (20, 316), 10, (0, 6), 40)
    c2 = ad_card(card_img, logo_img, 350, ghost=True)
    paste_shadowed(s, c2, (20, 316 + c1.height + 18), 10, (0, 6), 40)
    return s


def screen_page(hero_img, logo_img, one10_logo, story=False, story_img=None) -> Image.Image:
    s = Image.new("RGBA", (390, 844), (*SKY, 255))
    site_header(s, one10_logo)
    d = ImageDraw.Draw(s)
    d.text((20, 144), "← Local businesses", font=F("sans", 12, 500), fill=(130, 110, 100))
    hero = rounded(cover(hero_img, 350, 197), 16)
    s.alpha_composite(hero, (20, 170))
    lg = logo_img.copy()
    lg.thumbnail((64, 64), Image.LANCZOS)
    plate = rounded(Image.new("RGBA", (72, 72), (*WHITE, 255)), 14)
    plate.alpha_composite(lg, (4, 4))
    s.alpha_composite(plate, (20, 384))
    d.text((104, 386), "FASHION & BOUTIQUE · PAID AD", font=F("sans", 10, 700), fill=VERMILION)
    d.text((104, 402), "Anchol Katha", font=F("serif", 32, 600), fill=BROWN)
    text_block(d, (20, 470), SAMPLE["headline"], F("sans", 15, 500), BROWN_SOFT, 350)
    d.rounded_rectangle((20, 506, 216, 546), 20, fill=VERMILION)
    d.text((38, 516), SAMPLE["cta"] + " ↗", font=F("sans", 14, 700), fill=WHITE)
    d.rounded_rectangle((226, 506, 330, 546), 20, fill=WHITE, outline=(230, 140, 120), width=2)
    d.text((248, 516), "Share", font=F("sans", 14, 700), fill=BROWN)
    if story and story_img is not None:
        d.rounded_rectangle((20, 566, 210, 820), 14, fill=WHITE, outline=(245, 214, 160))
        text_block(d, (32, 580), SAMPLE["writeup"], F("sans", 12, 400), BROWN_SOFT, 166, 1.35)
        v = rounded(cover(story_img, 150, 254), 14)
        s.alpha_composite(v, (222, 566))
        d.ellipse((276, 672, 316, 712), fill=(255, 255, 255, 230))
        d.polygon([(291, 682), (291, 702), (306, 692)], fill=VERMILION)
    else:
        d.rounded_rectangle((20, 566, 370, 700), 14, fill=WHITE, outline=(245, 214, 160))
        text_block(d, (34, 582), SAMPLE["writeup"], F("sans", 14, 400), BROWN_SOFT, 320, 1.4)
    return s


def screen_sponsors(card_img, logo_img, one10_logo) -> Image.Image:
    s = Image.new("RGBA", (390, 844), (*SKY, 255))
    site_header(s, one10_logo)
    d = ImageDraw.Draw(s)
    d.text((20, 150), "ONE10 DURGA PUJA 2026", font=F("sans", 11, 700), fill=VERMILION)
    d.text((20, 168), "Sponsorship", font=F("serif", 42, 600), fill=BROWN)
    d.rounded_rectangle((20, 232, 370, 330), 14, fill=WHITE, outline=(245, 214, 160))
    d.text((36, 248), "Premium partnerships", font=F("serif", 22, 600), fill=BROWN)
    d.rectangle((0, 352, 390, 844), fill=(255, 249, 240))
    d.text((20, 372), "LOCAL BUSINESS ADS", font=F("sans", 11, 700), fill=VERMILION)
    d.text((20, 390), "Neighbourhood businesses", font=F("serif", 28, 600), fill=BROWN)
    c1 = ad_card(card_img, logo_img, 270, featured=True)
    c2 = ad_card(card_img, logo_img, 270, ghost=True)
    paste_shadowed(s, c1, (20, 444), 10, (0, 6), 40)
    paste_shadowed(s, c2, (304, 444), 10, (0, 6), 40)
    return s


def screen_whatsapp(card_img) -> Image.Image:
    s = Image.new("RGBA", (390, 844), (236, 229, 221, 255))
    d = ImageDraw.Draw(s)
    d.rectangle((0, 0, 390, 110), fill=(7, 94, 84))
    d.ellipse((16, 50, 56, 90), fill=(255, 241, 214))
    d.text((68, 52), "One10 Residents", font=F("sans", 18, 700), fill=WHITE)
    d.text((68, 76), "Durgotsav committee", font=F("sans", 12, 400), fill=(200, 230, 225))
    bubble = Image.new("RGBA", (320, 380), (*WHITE, 255))
    bd = ImageDraw.Draw(bubble)
    bubble.paste(cover(card_img, 300, 158), (10, 10))
    text_block(bd, (14, 182), "Pujo partners this year: Anchol Katha — handwoven Bengal sarees for Saptami to Dashami.",
               F("sans", 14, 400), (40, 40, 40), 292, 1.35)
    bd.text((14, 300), "one10events.in/local-businesses", font=F("sans", 13, 600), fill=(30, 110, 200))
    bd.text((250, 350), "10:30", font=F("sans", 11, 400), fill=(150, 150, 150))
    bubble = rounded(bubble, 14)
    paste_shadowed(s, bubble, (20, 150), 6, (0, 2), 30)
    return s


# ------------------------------------------------------------------ infographics
def where_screens(pkg, assets, one10_logo):
    card, logo, hero, story = assets["card"], assets["logo"], assets["hero"], assets["story"]
    out = []
    for w in pkg["where"]:
        if w == "home":
            out.append(("Home page strip", screen_home(card, logo, one10_logo)))
        elif w == "takeover":
            out.append(("First on Home", screen_home(card, logo, one10_logo, takeover=True)))
        elif w == "directory":
            out.append(("Directory", screen_directory(card, logo, one10_logo)))
        elif w == "page":
            out.append(("Your own page", screen_page(hero, logo, one10_logo)))
        elif w == "story":
            out.append(("Story page", screen_page(hero, logo, one10_logo, story=True, story_img=story)))
        elif w == "sponsors":
            out.append(("Sponsors rail", screen_sponsors(card, logo, one10_logo)))
        elif w == "whatsapp":
            out.append(("WhatsApp mention", screen_whatsapp(card)))
    return out


def infographic(pkg, assets, one10_logo, pujo_bg) -> Image.Image:
    W, H = 1080, 1350
    img = Image.new("RGBA", (W, H), (*SUN_50, 255))
    top = cover(pujo_bg, W, 420, (0.5, 0.35)).convert("RGBA")
    top.alpha_composite(vgrad_overlay(W, 420, BROWN, 150, 235))
    img.alpha_composite(top, (0, 0))
    d = ImageDraw.Draw(img)
    lg = one10_logo.copy()
    lg.thumbnail((120, 56), Image.LANCZOS)
    plate = rounded(Image.new("RGBA", (lg.width + 24, lg.height + 16), (*WHITE, 235)), 12)
    plate.alpha_composite(lg, (12, 8))
    img.alpha_composite(plate, (60, 44))
    d.text((220, 54), "PROMOTE AT ONE10", font=F("sans", 20, 700), fill=SUN)
    d.text((220, 80), "Durgotsav 2026 · Local business promotions", font=F("sans", 20, 400), fill=(255, 235, 210))
    d.text((60, 132), pkg["name"], font=F("serif", 88, 600), fill=WHITE)
    d.text((60, 236), rupees(pkg["inside"]), font=F("serif", 80, 700), fill=SUN)
    pw = d.textlength(rupees(pkg["inside"]), font=F("serif", 80, 700))
    d.text((60 + pw + 22, 262), "inside One Ten", font=F("sans", 22, 500), fill=(255, 235, 210))
    d.text((60 + pw + 22, 292), f"{rupees(pkg['outside'])} for outside businesses", font=F("sans", 22, 500), fill=(255, 235, 210))
    note = ("FREE for One Ten subscribers  ·  " if pkg.get("free") else "") + "Runs now till 30 Nov 2026" \
        + (f"  ·  only {pkg['cap']} slots" if pkg["cap"] else "")
    pill(d, (60, 350), note, F("sans", 20, 600), BROWN, SUN, (18, 9))

    # phones, centred in one row
    screens = where_screens(pkg, assets, one10_logo)[:3]
    pw_, gap, y0 = 230, 44, 452
    x = (W - (len(screens) * pw_ + (len(screens) - 1) * gap)) // 2
    for label, sc in screens:
        ph = phone(sc, pw_)
        paste_shadowed(img, ph, (x, y0), 18, (0, 12), 70)
        d = ImageDraw.Draw(img)
        f = F("sans", 18, 700)
        tw = d.textlength(label, font=f)
        d.text((x + (pw_ - tw) / 2, y0 + ph.height + 12), label, font=f, fill=BROWN)
        x += pw_ + gap
    d = ImageDraw.Draw(img)
    y_cols = y0 + ph.height + 58
    d.line((60, y_cols - 20, W - 60, y_cols - 20), fill=(245, 214, 160), width=2)

    lx, ly, left_w = 60, y_cols, 450
    d.text((lx, ly), "YOU GET", font=F("sans", 18, 700), fill=VERMILION)
    ly += 34
    for g in pkg["gets"]:
        d.ellipse((lx, ly + 9, lx + 12, ly + 21), fill=VERMILION)
        ly = text_block(d, (lx + 24, ly), g, F("sans", 23, 500), BROWN, left_w - 24, 1.25) + 6

    lx2, ly2, right_w = 560, y_cols, 460
    d.text((lx2, ly2), "SEND US", font=F("sans", 18, 700), fill=VERMILION)
    ly2 += 34
    cx = lx2
    for k in pkg["send"] + pkg["optional"]:
        label, size = ASSET_LABEL[k]
        t = f"{label} {size}" + (" · optional" if k in pkg["optional"] else "")
        f = F("sans", 18, 500)
        tw = d.textlength(t, font=f) + 28
        if cx + tw > lx2 + right_w:
            cx = lx2
            ly2 += 44
        pill(d, (cx, ly2), t, f, BROWN, WHITE if k in pkg["optional"] else (255, 230, 190), (14, 9), 12)
        cx += tw + 10

    # footer
    d.rectangle((0, H - 120, W, H), fill=BROWN)
    q = qr_image(APPLY_URL, 92)
    img.paste(q, (W - 60 - 92, H - 106))
    d.text((60, H - 96), "Apply at one10events.in/promote", font=F("serif", 34, 600), fill=WHITE)
    d.text((60, H - 52), "Prepaid by UPI · committee-reviewed · sample shown: Anchol Katha",
           font=F("sans", 18, 400), fill=(230, 210, 190))
    return img.convert("RGB")


def overview(assets, one10_logo, pujo_bg) -> Image.Image:
    W, H = 1080, 1350
    img = Image.new("RGBA", (W, H), (*SUN_50, 255))
    top = cover(pujo_bg, W, 430, (0.5, 0.35)).convert("RGBA")
    top.alpha_composite(vgrad_overlay(W, 430, BROWN, 140, 235))
    img.alpha_composite(top)
    d = ImageDraw.Draw(img)
    d.text((60, 60), "ONE10 DURGOTSAV 2026", font=F("sans", 22, 700), fill=SUN)
    text_block(d, (60, 100), "Promote your business at One10", F("serif", 84, 600), WHITE, 960, 1.0)
    text_block(d, (60, 300), "Reach One Ten families through Pujo and Diwali — inside the complex or from the neighbourhood. "
                             "Prepaid, committee-reviewed.", F("sans", 26, 400), (255, 235, 210), 900, 1.3)
    y = 470
    gap = 24
    cw, ch = (W - 120 - gap * (len(PACKAGES) - 1)) // len(PACKAGES), 520
    for i, p in enumerate(PACKAGES):
        x = 60 + i * (cw + gap)
        tile = Image.new("RGBA", (cw, ch), (*WHITE, 255))
        td = ImageDraw.Draw(tile)
        ty = text_block(td, (24, 22), p["name"], F("serif", 38, 600), BROWN, cw - 48, 1.0)
        td.text((24, ty + 8), rupees(p["inside"]), font=F("serif", 52, 700), fill=VERMILION)
        td.text((24, ty + 72), f"outside {rupees(p['outside'])}", font=F("sans", 18, 500), fill=(120, 100, 90))
        ty += 118
        for g in p["gets"]:
            td.ellipse((24, ty + 8, 32, ty + 16), fill=VERMILION)
            ty = text_block(td, (42, ty), g, F("sans", 18, 500), BROWN_SOFT, cw - 66, 1.3) + 8
        if p["cap"]:
            td.text((24, ch - 44), f"Only {p['cap']} slots", font=F("sans", 17, 600), fill=(150, 120, 100))
        elif p.get("free"):
            pill(td, (24, ch - 54), "FREE for subscribers", F("sans", 17, 700), WHITE, (22, 128, 61), (14, 7))
        tile = rounded(tile, 22)
        paste_shadowed(img, tile, (x, y), 14, (0, 8), 40)
    d = ImageDraw.Draw(img)
    y = y + ch + 34
    d.text((60, y), "HOW IT WORKS", font=F("sans", 20, 700), fill=VERMILION)
    steps = ["Apply online", "Pay by UPI", "Committee review", "Live till 30 Nov"]
    sx = 60
    for i, s in enumerate(steps):
        d.ellipse((sx, y + 44, sx + 46, y + 90), fill=VERMILION)
        d.text((sx + 16, y + 50), str(i + 1), font=F("sans", 26, 700), fill=WHITE)
        d.text((sx + 58, y + 54), s, font=F("sans", 22, 600), fill=BROWN)
        sx += 58 + d.textlength(s, font=F("sans", 22, 600)) + 40
    d.rectangle((0, H - 120, W, H), fill=BROWN)
    q = qr_image(APPLY_URL, 92)
    img.paste(q, (W - 60 - 92, H - 106))
    d.text((60, H - 96), "one10events.in/promote", font=F("serif", 38, 600), fill=WHITE)
    d.text((60, H - 50), "Outside One Ten businesses welcome at +50%", font=F("sans", 18, 400), fill=(230, 210, 190))
    return img.convert("RGB")


def share_card(assets, one10_logo, pujo_bg) -> Image.Image:
    W, H = 1200, 630
    img = cover(pujo_bg, W, H, (0.5, 0.4)).convert("RGBA")
    img.alpha_composite(vgrad_overlay(W, H, BROWN, 120, 230))
    d = ImageDraw.Draw(img)
    d.text((60, 60), "ONE10 DURGOTSAV 2026", font=F("sans", 22, 700), fill=SUN)
    text_block(d, (60, 100), "Promote your business at One10", F("serif", 72, 600), WHITE, 600, 1.0)
    d.text((60, 300), "Prepaid packages from ₹1,000 · free card for subscribers", font=F("sans", 28, 600), fill=(255, 235, 210))
    pill(d, (60, 370), "one10events.in/promote", F("sans", 26, 700), BROWN, SUN, (24, 12))
    c = ad_card(assets["card"], assets["logo"], 420)
    c = c.rotate(-3, expand=True, resample=Image.BICUBIC)
    paste_shadowed(img, c, (700, 150), 20, (0, 14), 90)
    return img.convert("RGB")


# ------------------------------------------------------------------ video
def ease(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


class Layer:
    def __init__(self, img: Image.Image, xy, t_in=0.0, dur=0.6, dy=40, scale_in=False):
        self.img, self.xy, self.t_in, self.dur, self.dy, self.scale_in = img.convert("RGBA"), xy, t_in, dur, dy, scale_in


class Scene:
    def __init__(self, duration, bg: Image.Image, layers: list[Layer], zoom=(1.0, 1.08), pan=(0.0, 0.0)):
        self.duration, self.bg, self.layers, self.zoom, self.pan = duration, bg.convert("RGB"), layers, zoom, pan

    def frame(self, t: float, size) -> Image.Image:
        W, H = size
        z = self.zoom[0] + (self.zoom[1] - self.zoom[0]) * (t / self.duration)
        bw, bh = self.bg.size
        cw, ch = bw / z, bh / z
        cx = (bw - cw) / 2 + self.pan[0] * (t / self.duration) * (bw - cw) / 2
        cy = (bh - ch) / 2 + self.pan[1] * (t / self.duration) * (bh - ch) / 2
        base = self.bg.crop((int(cx), int(cy), int(cx + cw), int(cy + ch))).resize((W, H), Image.BILINEAR).convert("RGBA")
        for L in self.layers:
            p = ease((t - L.t_in) / L.dur)
            if p <= 0:
                continue
            im = L.img
            if p < 1:
                a = im.split()[-1].point(lambda v, p=p: int(v * p))
                im = im.copy()
                im.putalpha(a)
            if L.scale_in and p < 1:
                s = 0.92 + 0.08 * p
                im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.BILINEAR)
                ox = (L.img.width - im.width) // 2
                oy = (L.img.height - im.height) // 2
            else:
                ox = oy = 0
            base.alpha_composite(im, (int(L.xy[0] + ox), int(L.xy[1] + oy + L.dy * (1 - p))))
        return base.convert("RGB")


def render_video(scenes: list[Scene], size, out: Path, fps=30, xfade=0.45):
    total = sum(s.duration for s in scenes) - xfade * (len(scenes) - 1)
    starts, acc = [], 0.0
    for s in scenes:
        starts.append(acc)
        acc += s.duration - xfade
    with tempfile.TemporaryDirectory() as td:
        audio = Path(td) / "a.m4a"
        _festive_audio(audio, total)
        silent = Path(td) / "v.mp4"
        p = subprocess.Popen([
            "ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
            "-s", f"{size[0]}x{size[1]}", "-r", str(fps), "-i", "-",
            "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p", str(silent),
        ], stdin=subprocess.PIPE)
        n = int(total * fps)
        for i in range(n):
            T = i / fps
            active = [(k, T - starts[k]) for k in range(len(scenes)) if 0 <= T - starts[k] < scenes[k].duration]
            if len(active) == 1:
                fr = scenes[active[0][0]].frame(active[0][1], size)
            else:
                (ka, ta), (kb, tb) = active[0], active[-1]
                a = scenes[ka].frame(ta, size)
                b = scenes[kb].frame(tb, size)
                fr = Image.blend(a, b, ease(tb / xfade))
            p.stdin.write(fr.tobytes())
        p.stdin.close()
        p.wait()
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(silent), "-i", str(audio),
                        "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", str(out)],
                       check=True)


SR = 44100
MUSIC: Path | None = None


def _dhak_samples(total: float, seed: int = 7) -> list[float]:
    """Original dhak + kashor + shankh pattern (synthesised here, so no third-party recording is used)."""
    rnd = random.Random(seed)
    n = int(total * SR) + SR
    buf = [0.0] * n

    def add(start: float, samples):
        i0 = int(start * SR)
        for k, v in enumerate(samples):
            j = i0 + k
            if 0 <= j < n:
                buf[j] += v

    def bass(vel):  # dhak bass head: pitch-dropping thump with a skin slap
        out, ph = [], 0.0
        for k in range(int(0.55 * SR)):
            t = k / SR
            f = 68 + 82 * math.exp(-t / 0.045)
            ph += 2 * math.pi * f / SR
            slap = rnd.uniform(-1, 1) * math.exp(-t / 0.006) * 0.35
            out.append(vel * (math.sin(ph) * math.exp(-t / 0.19) + slap))
        return out

    def tap(vel):  # stick on the treble head: bright rattle
        out, lp, ph = [], 0.0, 0.0
        for k in range(int(0.16 * SR)):
            t = k / SR
            noise = rnd.uniform(-1, 1)
            lp += 0.35 * (noise - lp)
            hp = noise - lp
            ph += 2 * math.pi * 310 / SR
            out.append(vel * (0.55 * hp * math.exp(-t / 0.028) + 0.45 * math.sin(ph) * math.exp(-t / 0.05)))
        return out

    def kashor(vel):  # bell-metal plate: inharmonic partials, short ring
        parts = ((830, 0.40, 1.0), (1361, 0.30, 0.7), (2217, 0.22, 0.55), (3104, 0.16, 0.4), (4470, 0.10, 0.3))
        out = []
        for k in range(int(0.45 * SR)):
            t = k / SR
            s = sum(a * math.sin(2 * math.pi * f * t) * math.exp(-t / d) for f, d, a in parts)
            out.append(vel * 0.32 * s)
        return out

    def shankh(dur):  # conch call: slow swell with a little vibrato
        out, ph = [], 0.0
        for k in range(int(dur * SR)):
            t = k / SR
            env = min(1.0, t / 0.35) * min(1.0, (dur - t) / 0.5)
            f = 233 * (1 + 0.006 * math.sin(2 * math.pi * 5.2 * t)) * (1 + 0.03 * min(1.0, t / 0.4))
            ph += 2 * math.pi * f / SR
            s = sum(a * math.sin(h * ph) for h, a in ((1, 1.0), (2, 0.55), (3, 0.35), (4, 0.18), (5, 0.1)))
            out.append(0.32 * env * s)
        return out

    add(0.0, shankh(min(2.2, total * 0.25)))
    step = 60 / 132 / 4
    bars = ("D.tTD.t.D.tTDttt", "D.tTD.t.D.tTDttt", "D.tTD.t.D.tTDttt", "D.tTD.t.DtDtTttt")
    t0, bar = 1.1, 0
    while t0 < total - 0.6:
        pattern = bars[bar % len(bars)]
        for s, ch in enumerate(pattern):
            at = t0 + s * step + rnd.uniform(-0.006, 0.006)
            if at > total - 0.4:
                break
            v = rnd.uniform(0.88, 1.0)
            if ch == "D":
                add(at, bass(0.95 * v))
            elif ch == "T":
                add(at, tap(0.75 * v))
            elif ch == "t":
                add(at, tap(0.45 * v))
            if s % 4 == 0:
                add(at, kashor(0.8 * v))
            elif s % 2 == 0:
                add(at, kashor(0.35 * v))
        t0 += 16 * step
        bar += 1
    add(max(0.0, total - 0.5), bass(1.0))
    peak = max(1e-6, max(abs(v) for v in buf))
    return [v / peak * 0.9 for v in buf[: int(total * SR)]]


def _festive_audio(out: Path, total: float):
    fade_out = max(0.1, total - 1.2)
    fades = f"afade=t=in:d=0.4,afade=t=out:st={round(fade_out, 3)}:d=1.2"
    if MUSIC:
        src = ["-stream_loop", "-1", "-i", str(MUSIC)]
        chain = f"atrim=0:{total},loudnorm=I=-16:TP=-1.5:LRA=11,{fades}"
    else:
        wav = out.with_suffix(".wav")
        with wave.open(str(wav), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(struct.pack(f"<{int(total * SR)}h", *(int(v * 32767) for v in _dhak_samples(total))))
        src = ["-i", str(wav)]
        chain = f"aecho=0.8:0.6:60|140:0.25|0.15,loudnorm=I=-16:TP=-1.5:LRA=11,{fades}"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *src, "-af", chain, "-t", str(total),
                    "-ac", "2", "-ar", str(SR), "-c:a", "aac", "-b:a", "160k", str(out)], check=True)


def text_layer(lines: list[tuple[str, ImageFont.FreeTypeFont, tuple]], width: int, align="left", spacing=1.15,
               shadow=False) -> Image.Image:
    tmp = Image.new("RGBA", (width, 10))
    d = ImageDraw.Draw(tmp)
    rows = []
    for text, font, color in lines:
        for ln in wrap(d, text, font, width):
            rows.append((ln, font, color))
    h = sum(int(f.size * spacing) for _, f, _ in rows) + 10
    img = Image.new("RGBA", (width, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    y = 0
    for ln, f, c in rows:
        x = 0 if align == "left" else (width - d.textlength(ln, font=f)) / 2
        d.text((x, y), ln, font=f, fill=c)
        y += int(f.size * spacing)
    if not shadow:
        return img
    m = 18
    out = Image.new("RGBA", (width + 2 * m, h + 2 * m), (0, 0, 0, 0))
    a = Image.new("L", out.size, 0)
    a.paste(img.split()[-1], (m + 2, m + 4))
    a = a.filter(ImageFilter.GaussianBlur(7)).point(lambda v: min(255, int(v * 1.6)))
    sh = Image.new("RGBA", out.size, (10, 6, 4, 255))
    sh.putalpha(a)
    out.alpha_composite(sh)
    out.alpha_composite(img, (m, m))
    return out


def backed(layer: Image.Image, pad=(52, 38), color=AK_INK, alpha=170, radius=30) -> Image.Image:
    """Dark rounded panel hugging a text layer so it stays readable over any photo."""
    box = layer.getbbox() or (0, 0, layer.width, layer.height)
    layer = layer.crop(box)
    panel = rounded(Image.new("RGBA", (layer.width + pad[0] * 2, layer.height + pad[1] * 2), (*color, alpha)), radius)
    panel.alpha_composite(layer, pad)
    return panel


def solid_bg(size, color) -> Image.Image:
    return Image.new("RGB", (int(size[0] * 1.1), int(size[1] * 1.1)), color)


def package_video(pkg, assets, one10_logo, pujo_bg, out: Path):
    W, H = 1080, 1920
    size = (W, H)
    dark = cover(pujo_bg, int(W * 1.12), int(H * 1.12), (0.5, 0.4)).convert("RGBA")
    dark.alpha_composite(vgrad_overlay(dark.width, dark.height, BROWN, 120, 235))

    lg = one10_logo.copy()
    lg.thumbnail((200, 94), Image.LANCZOS)
    plate = rounded(Image.new("RGBA", (lg.width + 36, lg.height + 24), (*WHITE, 235)), 16)
    plate.alpha_composite(lg, (18, 12))

    s1 = Scene(3.4, dark, [
        Layer(plate, (80, 160), 0.1),
        Layer(text_layer([("ONE10 DURGOTSAV 2026", F("sans", 38, 800), SUN)], 920, shadow=True), (62, 622), 0.3),
        Layer(text_layer([("Promote your business", F("serif", 124, 700), WHITE)], 920, shadow=True), (62, 682), 0.45),
        Layer(text_layer([(pkg["name"], F("serif", 84, 700), (255, 235, 210))], 920, shadow=True), (62, 992), 0.9),
        Layer(text_layer([(rupees(pkg["inside"]), F("serif", 156, 700), SUN)], 920, shadow=True), (62, 1092), 1.2, scale_in=True),
        Layer(text_layer([(f"inside One Ten  ·  {rupees(pkg['outside'])} outside", F("sans", 40, 600), (255, 235, 210))], 920, shadow=True), (66, 1272), 1.5),
        *([Layer(text_layer([("FREE for One Ten subscribers", F("sans", 46, 800), (134, 239, 172))], 920, shadow=True), (66, 1340), 1.8)]
          if pkg.get("free") else []),
    ])

    screens = where_screens(pkg, assets, one10_logo)
    main_label, main_screen = screens[0]
    ph = phone(main_screen, 620)
    sh = shadow(ph, 26, (0, 18), 80)
    s2 = Scene(4.0, solid_bg(size, SUN_50), [
        Layer(text_layer([("YOUR PROMOTION ON ONE10EVENTS.IN", F("sans", 32, 700), VERMILION)], 920, "center"), (80, 150), 0.1),
        Layer(text_layer([(main_label, F("serif", 92, 600), BROWN)], 920, "center"), (80, 200), 0.25),
        Layer(sh, ((W - sh.width) // 2, 380 - 78), 0.5, 0.8, dy=120),
    ], zoom=(1.0, 1.0))

    second = screens[1] if len(screens) > 1 else screens[0]
    ph2 = phone(second[1], 470)
    sh2 = shadow(ph2, 20, (0, 14), 70)
    gets = [Layer(text_layer([("WHAT YOU GET", F("sans", 32, 700), VERMILION)], 920), (80, 140), 0.1)]
    gy = 200
    for i, g in enumerate(pkg["gets"]):
        t = text_layer([("•  " + g, F("sans", 46, 600), BROWN)], 920)
        gets.append(Layer(t, (80, gy), 0.3 + i * 0.35))
        gy += t.height + 18
    gets.append(Layer(sh2, ((W - sh2.width) // 2, max(gy + 10, 760) - 60), 0.4 + len(pkg["gets"]) * 0.35, 0.8, dy=100))
    gets.append(Layer(text_layer([(second[0], F("sans", 36, 700), BROWN)], 920, "center"),
                      (80, max(gy + 10, 760) - 60 + sh2.height - 60), 0.8 + len(pkg["gets"]) * 0.35))
    s3 = Scene(4.2, solid_bg(size, IVORY), gets, zoom=(1.0, 1.0))

    send_layers = [Layer(text_layer([("SEND US", F("sans", 32, 700), VERMILION)], 920), (80, 150), 0.1),
                   Layer(text_layer([("Your creative, at these sizes", F("serif", 84, 600), BROWN)], 920), (80, 200), 0.2)]
    sy = 470
    thumbs = {"logo": assets["logo"], "card": assets["card"], "hero": assets["hero"], "story_vertical": assets["story"]}
    for i, k in enumerate(pkg["send"] + pkg["optional"]):
        row = Image.new("RGBA", (920, 150), (0, 0, 0, 0))
        rd = ImageDraw.Draw(row)
        rd.rounded_rectangle((0, 0, 919, 149), 24, fill=WHITE)
        if k in thumbs:
            th = thumbs[k].copy().convert("RGB")
            th.thumbnail((190, 118), Image.LANCZOS)
            row.alpha_composite(rounded(th, 10), (20 + (190 - th.width) // 2, (150 - th.height) // 2))
        else:
            rd.rounded_rectangle((20, 16, 210, 134), 10, fill=BROWN)
            rd.polygon([(100, 50), (100, 100), (140, 75)], fill=WHITE)
        label, dims = ASSET_LABEL[k]
        rd.text((240, 30), label + (" · optional" if k in pkg["optional"] else ""), font=F("sans", 40, 700), fill=BROWN)
        rd.text((240, 84), dims, font=F("sans", 34, 500), fill=VERMILION)
        send_layers.append(Layer(row, (80, sy), 0.35 + i * 0.25))
        sy += 170
    send_layers.append(Layer(text_layer([("Sample business shown: Anchol Katha", F("sans", 30, 500), (130, 110, 100))], 920),
                             (80, sy + 20), 0.5 + len(pkg["send"] + pkg["optional"]) * 0.25))
    s4 = Scene(3.6, solid_bg(size, SUN_50), send_layers, zoom=(1.0, 1.0))

    q = qr_image(APPLY_URL, 360)
    qp = rounded(Image.new("RGBA", (400, 400), (*WHITE, 255)), 28)
    qp.paste(q, (20, 20))
    s5 = Scene(3.6, dark, [
        Layer(text_layer([("Apply in 5 minutes", F("serif", 116, 700), WHITE)], 920, "center", shadow=True), (62, 312), 0.1),
        Layer(text_layer([("Pay by UPI · committee-reviewed · live till 30 Nov", F("sans", 42, 600), (255, 235, 210))], 920, "center", shadow=True), (62, 582), 0.4),
        Layer(qp, ((W - 400) // 2, 780), 0.6, scale_in=True),
        Layer(text_layer([("one10events.in/promote", F("serif", 76, 700), SUN)], 920, "center", shadow=True), (62, 1222), 0.9),
        Layer(plate, ((W - plate.width) // 2, 1500), 1.1),
    ], zoom=(1.08, 1.0))
    render_video([s1, s2, s3, s4, s5], size, out)


def sample_ad_video(b: Brand, out: Path):
    W, H = 1920, 1080
    size = (W, H)

    def shot(photo, focus, lines, dur, pan):
        bg = cover(photo, int(W * 1.12), int(H * 1.12), focus).convert("RGBA")
        bg.alpha_composite(vgrad_overlay(bg.width, bg.height, AK_INK, 0, 150))
        panel = backed(text_layer(lines, 1300, spacing=1.08, shadow=True))
        return Scene(dur, bg, [Layer(panel, (100, H - 210 - panel.height), 0.3, 0.6)], pan=pan)

    gold = (246, 196, 72)
    s1 = shot(b.pujo, (0.3, 0.4), [("This Pujo,", F("serif", 124, 700), WHITE),
                                   ("wear a story.", F("serif", 124, 700), gold)], 3.6, (-0.6, 0))
    s2 = shot(b.marigold, (0.5, 0.4), [("Handwoven Bengal sarees", F("serif", 108, 700), WHITE),
                                       ("Tant · Jamdani · Handloom cotton", F("sans", 50, 600), gold)], 3.4, (0.5, 0))
    s3 = shot(b.cream, (0.55, 0.4), [("Picked for", F("serif", 108, 700), WHITE),
                                     ("Saptami to Dashami", F("serif", 108, 700), gold)], 3.2, (0, -0.4))
    end_bg = Image.new("RGB", (int(W * 1.1), int(H * 1.1)), AK_BG)
    lg = b.logo.copy()
    lg.thumbnail((760, 360), Image.LANCZOS)
    cta = Image.new("RGBA", (700, 110), (0, 0, 0, 0))
    pill(ImageDraw.Draw(cta), (0, 0), SAMPLE["cta"] + "  →", F("sans", 44, 700), WHITE, AK_INDIGO, (44, 24))
    cta = cta.crop(cta.getbbox())
    s4 = Scene(3.6, end_bg, [
        Layer(lg, ((W - lg.width) // 2, 230), 0.1, scale_in=True),
        Layer(cta, ((W - cta.width) // 2, 660), 0.6),
        Layer(text_layer([(SAMPLE["site"], F("sans", 40, 500), (122, 107, 94))], 800, "center"), ((W - 800) // 2, 820), 0.9),
    ], zoom=(1.0, 1.0))
    render_video([s1, s2, s3, s4], size, out)


def video_poster(mp4: Path, at: float = 2.4):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", str(at), "-i", str(mp4), "-frames:v", "1",
                    "-vf", "scale='min(720,iw)':-2", "-q:v", "4", str(mp4.with_name(mp4.stem + "-poster.jpg"))], check=True)


# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--brand-dir", default="/root/ancholkatha.com/frontend/public/assets")
    ap.add_argument("--skip-video", action="store_true")
    ap.add_argument("--music", type=Path, help="licensed audio file to use instead of the synthesised dhak track")
    args = ap.parse_args()
    global MUSIC
    MUSIC = args.music
    OUT.mkdir(parents=True, exist_ok=True)
    b = Brand(Path(args.brand_dir))
    one10_logo = Image.open(ONE10 / "brand/one10-logo.png").convert("RGBA")
    pujo_bg = Image.open(ONE10 / "campaign/hero-cover.jpg").convert("RGB")

    logo, card, hero, story = make_logo(b), make_card(b), make_hero(b), make_story(b)
    logo.save(OUT / "sample-logo-800x800.png", optimize=True)
    card.save(OUT / "sample-card-1200x630.jpg", quality=88)
    hero.save(OUT / "sample-hero-1920x1080.jpg", quality=86)
    story.save(OUT / "sample-story-1080x1920.jpg", quality=86)
    assets = {"logo": logo, "card": card, "hero": hero, "story": story}

    for p in PACKAGES:
        infographic(p, assets, one10_logo, pujo_bg).save(OUT / f"{p['code']}-infographic.jpg", quality=88)
    overview(assets, one10_logo, pujo_bg).save(OUT / "packages-overview.jpg", quality=88)
    share_card(assets, one10_logo, pujo_bg).save(OUT / "promote-share-1200x630.jpg", quality=86)

    if not args.skip_video:
        sample_ad_video(b, OUT / "sample-video-1920x1080.mp4")
        for p in PACKAGES:
            package_video(p, assets, one10_logo, pujo_bg, OUT / f"{p['code']}-video.mp4")
    for mp4 in OUT.glob("*.mp4"):
        video_poster(mp4)
    for f in sorted(OUT.iterdir()):
        print(f"{f.name}  {f.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
