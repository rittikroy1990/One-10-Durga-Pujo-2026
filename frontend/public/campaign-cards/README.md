# Door-to-door Nirghonto cards (set of 4)

Print-ready A5 PNGs for One10 Durgotsav 2026.

| # | File | Content |
|---|------|---------|
| 1 | `01-cover-subscribe.png` | Cover + ₹3,500 + venue + dates |
| 2 | `02-sasthi-saptami.png` | Sasthi & Saptami timings |
| 3 | `03-ashtami-sandhi.png` | Ashtami + Sandhi 7:26–8:14 AM |
| 4 | `04-navami-dashami.png` | Navami, Dashami + subscribe CTA |

## Website routes (after deploy)

- Nirghonto cards page: `/nirghanto`
- Subscribe & pay: `/subscribe`
- Programme: `/events`
- Home: `/`

## Regenerate

```bash
python3 scripts/generate_nirghanto_cards.py
```

Also rebuilds aligned `highlights.jpg`, `experience.jpg`, and `hero-cover.jpg`.
