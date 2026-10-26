import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, BadgeCheck, CheckCircle2, ClipboardCheck, Download, Home as HomeIcon, Image as ImageIcon,
  MapPin, ShieldCheck, Sparkles, Store, Wallet,
} from "lucide-react";
import PublicLayout from "../../components/PublicLayout";
import { Button } from "../../components/ui";
import { loadAdsCatalog } from "../../lib/adClicks";
import { formatPaise } from "../../lib/utils";

const PLACEMENT_LABEL = {
  home_strip: "Home strip",
  directory: "Directory",
  sponsors_rail: "Sponsors rail",
  full_page: "Own page",
  story_layout: "Story layout",
  takeover: "Top of Home",
};

const STEPS = [
  { icon: ClipboardCheck, t: "Apply", d: "Pick a package and tell us about your business." },
  { icon: Wallet, t: "Pay", d: "Pay the exact amount by UPI and upload the screenshot + UTR." },
  { icon: ShieldCheck, t: "Review", d: "The committee checks your creative and payment." },
  { icon: BadgeCheck, t: "Live", d: "Your promotion goes live on one10events.in and runs till 30 Nov." },
];

function fmtSpec(s) {
  if (s.width) return `${s.width}×${s.height} px`;
  return `${s.resolution || ""}${s.max_seconds ? `, up to ${s.max_seconds}s` : ""}`;
}

const DEMO = "/images/advertise/demo";
const MEDIA_V = "?v=4";
const DEMO_PACKAGES = [
  { code: "neighbourhood_card", name: "Neighbourhood Card" },
  { code: "spotlight_feature", name: "Spotlight Feature" },
  { code: "story_page", name: "Story Page" },
];
const SAMPLE_CREATIVES = [
  { file: "sample-logo-800x800.png", label: "Logo", size: "800×800" },
  { file: "sample-card-1200x630.jpg", label: "Card image", size: "1200×630" },
  { file: "sample-hero-1920x1080.jpg", label: "Hero banner", size: "1920×1080" },
  { file: "sample-story-1080x1920.jpg", label: "Vertical poster", size: "1080×1920" },
];

function DownloadLink({ file, children }) {
  return (
    <a href={`${DEMO}/${file}${MEDIA_V}`} download={file} className="inline-flex items-center gap-1 font-semibold text-vermilion-600 hover:underline">
      <Download className="h-3.5 w-3.5" /> {children || "Download"}
    </a>
  );
}

function SampleKit({ packages }) {
  const list = DEMO_PACKAGES.map((d) => ({ ...d, name: packages.find((p) => p.code === d.code)?.name || d.name }));
  const [code, setCode] = useState(list[0].code);
  const cur = list.find((p) => p.code === code) || list[0];

  return (
    <section className="border-t border-sun-400/25 bg-sun-50/60" data-testid="advertise-sample-kit">
      <div className="mx-auto max-w-7xl px-5 py-12">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-vermilion-500" />
          <h2 className="font-display text-4xl text-brown-900">See a sample ad</h2>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-brown-800/65">
          Every package shown with one example business — Anchol Katha, a Bengal handloom saree label. It is a
          sample to show what you get, not a booked ad. Download and forward these to any business you know.
        </p>

        <div className="mt-6 flex flex-wrap gap-2" role="tablist">
          {list.map((p) => (
            <button
              key={p.code}
              type="button"
              role="tab"
              aria-selected={p.code === code}
              onClick={() => setCode(p.code)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                p.code === code
                  ? "border-vermilion-500 bg-vermilion-500 text-white"
                  : "border-sun-400/40 bg-white text-brown-900 hover:border-vermilion-500/50"
              }`}
              data-testid={`sample-tab-${p.code}`}
            >
              {p.name}
            </button>
          ))}
        </div>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[10fr_7fr]">
          <figure>
            <a href={`${DEMO}/${cur.code}-infographic.jpg${MEDIA_V}`} target="_blank" rel="noreferrer">
              <img
                src={`${DEMO}/${cur.code}-infographic.jpg${MEDIA_V}`}
                alt={`${cur.name} infographic with the Anchol Katha sample ad`}
                className="w-full rounded-2xl border border-sun-400/30 shadow-sm"
                loading="lazy"
              />
            </a>
            <figcaption className="mt-2 flex flex-wrap items-center gap-3 text-xs text-brown-800/60">
              Infographic · 1080×1350 · for WhatsApp and Instagram
              <DownloadLink file={`${cur.code}-infographic.jpg`} />
            </figcaption>
          </figure>
          <figure className="mx-auto w-full max-w-sm lg:max-w-none">
            <video
              key={cur.code}
              controls
              playsInline
              preload="none"
              poster={`${DEMO}/${cur.code}-video-poster.jpg${MEDIA_V}`}
              className="aspect-[9/16] w-full rounded-2xl bg-brown-950 object-cover shadow-sm"
              data-testid="sample-package-video"
            >
              <source src={`${DEMO}/${cur.code}-video.mp4${MEDIA_V}`} type="video/mp4" />
            </video>
            <figcaption className="mt-2 flex flex-wrap items-center gap-3 text-xs text-brown-800/60">
              17-second reel · 1080×1920
              <DownloadLink file={`${cur.code}-video.mp4`} />
            </figcaption>
          </figure>
        </div>

        <h3 className="mt-12 font-display text-3xl text-brown-900">The sample creatives, at the exact upload sizes</h3>
        <p className="mt-1 text-sm text-brown-800/65">This is what Anchol Katha would send us. Your files go through the same automatic size check.</p>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <figure className="rounded-2xl border border-sun-400/30 bg-white p-3 shadow-sm">
            <video
              controls
              playsInline
              preload="none"
              poster={`${DEMO}/sample-video-1920x1080-poster.jpg${MEDIA_V}`}
              className="aspect-video w-full rounded-xl bg-brown-950 object-cover"
            >
              <source src={`${DEMO}/sample-video-1920x1080.mp4${MEDIA_V}`} type="video/mp4" />
            </video>
            <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-brown-800/60">
              <span><span className="font-semibold text-brown-900">Video</span> · 1920×1080 · 12 s (Story Page)</span>
              <DownloadLink file="sample-video-1920x1080.mp4" />
            </figcaption>
          </figure>
          <div className="grid grid-cols-2 gap-4">
            {SAMPLE_CREATIVES.map((c) => (
              <figure key={c.file} className="flex flex-col rounded-2xl border border-sun-400/30 bg-white p-3 shadow-sm">
                <a href={`${DEMO}/${c.file}`} target="_blank" rel="noreferrer" className="flex h-36 items-center justify-center rounded-xl bg-ivory-100 p-2">
                  <img src={`${DEMO}/${c.file}`} alt={`Sample ${c.label.toLowerCase()} for Anchol Katha`} className="max-h-full max-w-full rounded-md object-contain" loading="lazy" />
                </a>
                <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-1 text-xs text-brown-800/60">
                  <span><span className="font-semibold text-brown-900">{c.label}</span> · {c.size}</span>
                  <DownloadLink file={c.file} />
                </figcaption>
              </figure>
            ))}
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-sun-400/30 bg-white px-5 py-4 text-sm text-brown-800/75">
          <span className="font-semibold text-brown-900">Share kit:</span>
          <DownloadLink file="packages-overview.jpg">All packages poster</DownloadLink>
          <DownloadLink file="promote-share-1200x630.jpg">Link preview image</DownloadLink>
        </div>
      </div>
    </section>
  );
}

export default function Advertise() {
  const [cat, setCat] = useState(null);
  useEffect(() => { loadAdsCatalog().then(setCat); }, []);

  const packages = cat?.packages || [];
  const specs = cat?.creative_specs || {};
  const rules = cat?.rules || {};
  const open = !!cat?.apply_open;
  const neededBy = (kind) => packages.filter((p) => (p.required_media || []).includes(kind)).map((p) => p.name);
  const optionalFor = (kind) => packages.filter((p) => (p.optional_media || []).includes(kind)).map((p) => p.name);

  return (
    <PublicLayout>
      <section className="relative overflow-hidden border-b border-sun-400/25" data-testid="advertise-hero">
        <div className="absolute inset-0">
          <img src="/images/campaign/hero-cover.jpg" alt="" className="h-full w-full object-cover opacity-25" />
          <div className="absolute inset-0 bg-gradient-to-r from-sky-50/95 via-sun-50/90 to-sky-50/60" />
        </div>
        <div className="relative mx-auto max-w-7xl px-5 py-16 md:py-24">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <p className="text-xs uppercase tracking-[0.3em] text-vermilion-600">One 10 Durgotsav 2026 · Local business promotions</p>
            <h1 className="mt-2 max-w-3xl font-display text-5xl text-brown-900 sm:text-6xl">Promote your business at One10</h1>
            <p className="mt-4 max-w-2xl text-lg text-brown-800/75">
              Reach One Ten families during Durgotsav — inside the complex or from the neighbourhood.
              Committee-reviewed. Prepaid packages from ₹1,000 — free card for subscribers.
            </p>
            {cat?.preview && (
              <p className="mt-4 inline-block rounded-full bg-sun-200 px-3 py-1 text-xs font-semibold text-brown-900" data-testid="advertise-preview-note">
                Committee preview — ads are switched off for the public.
              </p>
            )}
            <div className="mt-8 flex flex-wrap gap-3">
              {open ? (
                <Link to="/promote/apply">
                  <Button variant="primary" size="lg" data-testid="advertise-apply-cta">Start application <ArrowRight className="h-5 w-5" /></Button>
                </Link>
              ) : (
                <div className="rounded-2xl border border-sun-400/40 bg-white/90 px-5 py-3 text-brown-900 shadow-sm" data-testid="advertise-coming-soon">
                  {cat?.flag_off_message || "Business promotions open soon. Follow One10 Events for the date."}
                </div>
              )}
              <Link to="/local-businesses">
                <Button variant="outline" size="lg">See local businesses</Button>
              </Link>
            </div>
            {cat?.window_label && <p className="mt-4 text-sm text-brown-800/60">Promotions run {cat.window_label}.</p>}
          </motion.div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-sun-400/30 bg-white p-5 shadow-sm">
            <HomeIcon className="h-6 w-6 text-vermilion-500" />
            <h3 className="mt-3 font-display text-2xl text-brown-900">Inside One Ten</h3>
            <p className="mt-1 text-sm text-brown-800/70">Residents running a home kitchen, tuition, boutique, salon or service — standard package prices.</p>
          </div>
          <div className="rounded-2xl border border-sun-400/30 bg-white p-5 shadow-sm">
            <MapPin className="h-6 w-6 text-vermilion-500" />
            <h3 className="mt-3 font-display text-2xl text-brown-900">From the neighbourhood</h3>
            <p className="mt-1 text-sm text-brown-800/70">Shops and services around Newtown — welcome too, at a 50% outside rate.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-12" data-testid="advertise-packages">
        <h2 className="font-display text-4xl text-brown-900">Packages</h2>
        <p className="mt-1 text-sm text-brown-800/65">One payment for the whole window. Sponsorship for gates, stage and souvenir stays on the <Link to="/sponsors" className="text-vermilion-600 hover:underline">Sponsors page</Link>.</p>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {packages.map((p) => (
            <div key={p.code} className={`flex flex-col rounded-2xl border bg-white p-5 shadow-sm ${p.featured ? "border-vermilion-500/35" : "border-sun-400/30"}`} data-testid={`ad-pkg-${p.code}`}>
              <h3 className="font-display text-2xl text-brown-900">{p.name}</h3>
              <div className="mt-2 font-display text-3xl text-vermilion-600">{formatPaise(p.amount_paise)}</div>
              <div className="text-xs text-brown-800/55">Outside One Ten: {formatPaise(p.amount_paise_outside)}</div>
              {p.free_for_subscribers && (
                <div className="mt-2 inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">Free for One Ten subscribers</div>
              )}
              <p className="mt-3 text-sm text-brown-800/75">{p.description}</p>
              <ul className="mt-3 flex-1 space-y-1.5 text-sm text-brown-800/75">
                {(p.includes || []).map((x) => (
                  <li key={x} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-vermilion-500" /> {x}</li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-1">
                {(p.placements || []).map((pl) => (
                  <span key={pl} className="rounded-full bg-sun-50 px-2 py-0.5 text-[11px] text-brown-800/70">{PLACEMENT_LABEL[pl] || pl}</span>
                ))}
              </div>
              {p.max_concurrent ? <p className="mt-3 text-xs text-brown-800/50">Limited to {p.max_concurrent} at a time.</p> : null}
              {open && (
                <Link to={`/promote/apply?package=${p.code}`} className="mt-4" data-testid={`ad-pkg-apply-${p.code}`}>
                  <Button variant={p.featured ? "primary" : "outline"} size="sm" className="w-full justify-center">
                    Apply for {p.name} <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              )}
            </div>
          ))}
        </div>
        {!!(cat?.addons || []).length && (
          <div className="mt-6 rounded-2xl border border-sun-400/30 bg-sun-50/60 p-5">
            <h3 className="font-display text-2xl text-brown-900">Add-ons</h3>
            <ul className="mt-2 grid gap-2 text-sm text-brown-800/80 md:grid-cols-3">
              {cat.addons.map((a) => (
                <li key={a.code}>
                  <span className="font-semibold text-brown-900">{a.name}</span> —{" "}
                  {a.amount_paise_by_package
                    ? Object.entries(a.amount_paise_by_package).map(([k, v]) => `${packages.find((p) => p.code === k)?.name?.split(" ")[0] || k} ${formatPaise(v)}`).join(" · ")
                    : formatPaise(a.amount_paise)}
                  <div className="text-xs text-brown-800/55">{a.description}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <SampleKit packages={packages} />

      <section className="border-y border-sun-400/25 bg-white" data-testid="advertise-specs">
        <div className="mx-auto max-w-7xl px-5 py-12">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-6 w-6 text-vermilion-500" />
            <h2 className="font-display text-4xl text-brown-900">Creative sizes</h2>
          </div>
          <p className="mt-1 text-sm text-brown-800/65">Uploads are checked automatically — images must be within 2% of the size below.</p>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-sun-400/30 text-xs uppercase tracking-wide text-brown-800/55">
                <tr><th className="py-2 pr-4">Asset</th><th className="py-2 pr-4">Size</th><th className="py-2 pr-4">Formats</th><th className="py-2 pr-4">Max</th><th className="py-2">Needed for</th></tr>
              </thead>
              <tbody className="divide-y divide-sun-400/20">
                {Object.entries(specs).map(([k, s]) => {
                  const req = neededBy(k);
                  const opt = optionalFor(k);
                  return (
                    <tr key={k}>
                      <td className="py-2 pr-4 font-semibold text-brown-900">{s.label}</td>
                      <td className="py-2 pr-4">{fmtSpec(s)} <span className="text-brown-800/50">({s.aspect})</span></td>
                      <td className="py-2 pr-4 uppercase">{(s.formats || []).filter((f) => f !== "jpeg").join(" / ")}</td>
                      <td className="py-2 pr-4">{s.max_mb} MB</td>
                      <td className="py-2 text-brown-800/70">
                        {req.length === packages.length ? "All packages" : req.join(", ")}
                        {opt.length ? `${req.length ? " · " : ""}Optional: ${opt.join(", ")}` : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12">
        <h2 className="font-display text-4xl text-brown-900">How it works</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.t} className="relative rounded-2xl border border-sun-400/30 bg-white p-5 shadow-sm">
              <span className="absolute right-4 top-4 font-display text-3xl text-sun-400/60">{i + 1}</span>
              <s.icon className="h-6 w-6 text-vermilion-500" />
              <h3 className="mt-3 font-display text-2xl text-brown-900">{s.t}</h3>
              <p className="mt-1 text-sm text-brown-800/70">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-sun-400/25 bg-sun-50/70" data-testid="advertise-rules">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 md:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl text-brown-900">Refunds</h2>
            <ul className="mt-3 space-y-2 text-sm text-brown-800/80">
              {(rules.refund_policy || []).map((r) => <li key={r} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-vermilion-500" />{r}</li>)}
              <li className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-vermilion-500" />One free resubmit if the committee asks for changes.</li>
            </ul>
          </div>
          <div>
            <h2 className="font-display text-3xl text-brown-900">Content policy</h2>
            <ul className="mt-3 space-y-2 text-sm text-brown-800/80">
              {(rules.content_policy || []).map((r) => <li key={r} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-vermilion-500" />{r}</li>)}
            </ul>
          </div>
        </div>
        <div className="mx-auto flex max-w-7xl flex-wrap gap-3 px-5 pb-14">
          {open && (
            <Link to="/promote/apply"><Button variant="primary" size="lg">Start application <ArrowRight className="h-5 w-5" /></Button></Link>
          )}
          <Link to="/local-businesses"><Button variant="outline" size="lg"><Store className="h-5 w-5" /> Local businesses directory</Button></Link>
        </div>
      </section>
    </PublicLayout>
  );
}
