import React, { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, MapPin, ShieldCheck, HandHeart, Receipt,
  CheckCircle2, Building2, ChevronLeft, ChevronRight,
} from "lucide-react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import BrandLogo from "../../components/BrandLogo";
import { Button } from "../../components/ui";
import { formatPaise } from "../../lib/utils";
import { useConfig } from "../../context/ConfigContext";

/** Fresh community photos — each path used at most once on this page. */
const LIVE_ALL = Array.from({ length: 32 }, (_, i) => `/images/campaign/live/live-${String(i + 1).padStart(2, "0")}.jpg`);
/** Deleted from disk — never request these (avoids broken images). */
const DELETED_LIVE = new Set([
  "/images/campaign/live/live-01.jpg",
  "/images/campaign/live/live-03.jpg",
  "/images/campaign/live/live-04.jpg",
]);
const LIVE = LIVE_ALL; // keep index map stable for named placements
const ok = (src) => src && !DELETED_LIVE.has(src);
/** Main focus: children before the Durga pratima (user-selected centerpiece). */
const HERO = "/images/campaign/live/live-focus.jpg"; // same as live-11
const TOWERS = LIVE[11]; // 12 — wide lit towers
const FIREWORK = LIVE[12]; // 13 — low-angle tower + firework (portrait feature)
/** Newer photos placed in separate sections — never clustered side-by-side. */
const SINDOOR_GROUP = LIVE[27]; // 28
const SINDOOR_GROUP_B = LIVE[28]; // 29
const FAMILY_AT_PANDAL = LIVE[29]; // 30 — family selfie
const SINDUR_RITUAL = LIVE[30]; // 31 — offering sindoor to Maa
const COUPLE_AT_PRATIMA = LIVE[31]; // 32 — couple before the pratima
const PLACE_MAIN = LIVE[20]; // 21 — purohit aarti before Maa
const SKIP_PEEK = new Set([0, 2, 3, 10, 11, 12, 20, 29, 30, 31]); // drop deleted + dedicated placements
const PEEK_POOL = LIVE.filter((_, i) => i < 27 && !SKIP_PEEK.has(i)).filter(ok);
/** Middle gallery: scatter sindoor groups; family+pratima last. */
const SLIDER_A = (() => {
  const base = PEEK_POOL.slice(0, 10);
  const out = [...base];
  if (out.length >= 3) out.splice(2, 0, SINDOOR_GROUP);
  if (out.length >= 8) out.splice(7, 0, SINDOOR_GROUP_B);
  else out.push(SINDOOR_GROUP_B);
  out.push(FAMILY_AT_PANDAL);
  return out.filter(ok).slice(0, 13);
})();
const USED = new Set([
  HERO, PLACE_MAIN, TOWERS, FIREWORK, ...SLIDER_A,
  ...DELETED_LIVE,
  LIVE[10],
  FAMILY_AT_PANDAL, COUPLE_AT_PRATIMA, SINDOOR_GROUP, SINDOOR_GROUP_B,
]);
const SLIDER_B_CLEAN = [
  ...LIVE.filter((src) => ok(src) && !USED.has(src) && src !== SINDUR_RITUAL),
  SINDUR_RITUAL,
  COUPLE_AT_PRATIMA,
].filter(ok);

function PhotoSlider({ images, intervalMs = 4500, aspect = "aspect-[16/10]", fit = "cover", className = "", testid = "photo-slider" }) {
  const [idx, setIdx] = useState(0);
  const pause = useRef(false);
  const n = images.length;

  useEffect(() => {
    if (!n) return undefined;
    const t = setInterval(() => {
      if (!pause.current) setIdx((i) => (i + 1) % n);
    }, intervalMs);
    return () => clearInterval(t);
  }, [n, intervalMs]);

  if (!n) return null;

  const go = (d) => setIdx((i) => (i + d + n) % n);
  const fitClass = fit === "contain" ? "object-contain" : "object-cover";

  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br from-sun-100 via-sky-50 to-sun-50 ${className}`}
      data-testid={testid}
      onMouseEnter={() => { pause.current = true; }}
      onMouseLeave={() => { pause.current = false; }}
    >
      <div className={`relative w-full ${aspect}`}>
        <AnimatePresence mode="wait">
          <motion.img
            key={images[idx]}
            src={images[idx]}
            alt=""
            loading="lazy"
            decoding="async"
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className={`absolute inset-0 h-full w-full ${fitClass}`}
          />
        </AnimatePresence>
        {fit === "cover" && (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-brown-900/30 via-transparent to-transparent" />
        )}
      </div>

      <button
        type="button"
        aria-label="Previous photo"
        onClick={() => go(-1)}
        className="absolute left-3 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center border border-white/50 bg-white/85 text-brown-900 shadow-card backdrop-blur hover:bg-white"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label="Next photo"
        onClick={() => go(1)}
        className="absolute right-3 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center border border-white/50 bg-white/85 text-brown-900 shadow-card backdrop-blur hover:bg-white"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5 px-4">
        {images.map((src, i) => (
          <button
            key={src}
            type="button"
            aria-label={`Go to photo ${i + 1}`}
            onClick={() => setIdx(i)}
            className={`h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-vermilion-500" : "w-1.5 bg-white/70 hover:bg-white"}`}
          />
        ))}
      </div>
    </div>
  );
}

function PeekSlider({ images, testid = "peek-slider" }) {
  const scroller = useRef(null);
  const [srcs, setSrcs] = useState(images);
  const scrollBy = (dir) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.85, 720), behavior: "smooth" });
  };

  useEffect(() => {
    setSrcs(images);
  }, [images]);

  useEffect(() => {
    const el = scroller.current;
    if (!el || srcs.length < 2) return undefined;
    const tick = () => {
      if (!el) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      if (el.scrollLeft >= max - 8) el.scrollTo({ left: 0, behavior: "smooth" });
      else el.scrollBy({ left: Math.min(el.clientWidth * 0.7, 560), behavior: "smooth" });
    };
    const id = setInterval(tick, 3800);
    return () => clearInterval(id);
  }, [srcs.length]);

  if (!srcs.length) return null;

  return (
    <div className="relative" data-testid={testid}>
      <div
        ref={scroller}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 pb-3 sm:px-5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {srcs.map((src) => (
          <div
            key={src}
            className="relative aspect-[4/3] w-[85vw] max-w-md shrink-0 snap-center overflow-hidden border border-sun-400/30 bg-sun-100 shadow-card sm:w-[44vw] md:w-[30vw] lg:w-[22vw]"
          >
            <img
              src={src}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              onError={() => setSrcs((prev) => prev.filter((s) => s !== src))}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        aria-label="Previous"
        onClick={() => scrollBy(-1)}
        className="absolute left-1 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center border border-sun-400/40 bg-white/95 text-brown-900 shadow-card backdrop-blur sm:left-2 sm:h-10 sm:w-10"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label="Next"
        onClick={() => scrollBy(1)}
        className="absolute right-1 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center border border-sun-400/40 bg-white/95 text-brown-900 shadow-card backdrop-blur sm:right-2 sm:h-10 sm:w-10"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}

const fade = {
  hidden: { opacity: 0, y: 28 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.12 + i * 0.1, duration: 0.75, ease: [0.22, 1, 0.36, 1] },
  }),
};

export default function Home() {
  const { cfg } = useConfig();
  const [anns, setAnns] = useState([]);

  useEffect(() => {
    api.get("/announcements").then((r) => setAnns(r.data.items || [])).catch(() => {});
  }, []);

  const sub = cfg?.subscription;
  const camp = cfg?.campaign;
  const org = cfg?.organisation;

  return (
    <PublicLayout>
      <section className="relative overflow-hidden bg-sky-50 pt-16">
        {/* Photo first — on mobile the plate sits below so Durga stays visible */}
        <div className="relative w-full">
          <img
            src={HERO}
            alt="Goddess Durga and her children at One 10 Durgotsav"
            className="block h-auto w-full brightness-[1.06] contrast-[1.04] saturate-[1.08]"
            fetchPriority="high"
            decoding="async"
            width={1600}
            height={1200}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-sun-50/70 via-transparent to-transparent md:from-sun-50 md:via-sun-50/25" />

          <div className="relative z-10 md:absolute md:inset-x-0 md:bottom-0">
            <div className="mx-auto w-full max-w-7xl px-4 pb-6 pt-4 sm:px-5 sm:pb-8 md:pb-12 md:pt-16">
              <motion.div
                initial="hidden"
                animate="show"
                className="w-full max-w-2xl border border-sun-400/40 bg-white/95 p-4 shadow-glow backdrop-blur-md sm:bg-white/93 sm:p-7 md:max-w-3xl md:p-9"
              >
                <motion.div
                  variants={fade}
                  custom={0}
                  className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center sm:justify-start sm:gap-x-4 sm:text-left"
                >
                  <BrandLogo imgClassName="h-11 w-auto sm:h-14 md:h-16 lg:h-[4.5rem]" />
                  <h1 className="font-display text-3xl leading-none text-brown-900 sm:text-5xl md:text-6xl lg:text-7xl">
                    One 10 Durgotsav <span className="text-gradient-gold">2026</span>
                  </h1>
                </motion.div>
                <motion.p
                  variants={fade}
                  custom={1}
                  className="mt-2.5 text-center text-xs leading-snug text-brown-800/65 sm:mt-3 sm:text-left sm:text-sm"
                >
                  3rd year Durga Puja · Organised by EOC
                </motion.p>
                <motion.p variants={fade} custom={2} className="mt-2.5 max-w-lg text-center text-sm leading-relaxed text-brown-800/85 sm:mt-4 sm:text-left sm:text-base md:text-lg">
                  {camp?.theme_line || "Amader Pujo · Amader One10"} — ONE-10 community celebration, organised by EOC.
                </motion.p>
                <motion.div variants={fade} custom={3} className="mt-4 flex w-full flex-col gap-2.5 sm:mt-6 sm:w-auto sm:flex-row sm:flex-wrap sm:gap-3">
                  <Link to="/subscribe" className="w-full sm:w-auto">
                    <Button variant="primary" size="lg" data-testid="hero-subscribe-btn" className="w-full sm:w-auto">
                      Subscribe & Pay <ArrowRight className="h-5 w-5" />
                    </Button>
                  </Link>
                  <Link to="/sponsors#donate" className="w-full sm:w-auto">
                    <Button variant="outline" size="lg" data-testid="hero-sponsor-btn" className="w-full sm:w-auto">
                      Donate / Sponsorship
                    </Button>
                  </Link>
                  <Link to="/participate" className="w-full sm:w-auto">
                    <Button variant="outline" size="lg" data-testid="hero-participate-btn" className="w-full sm:w-auto">
                      Volunteer or perform
                    </Button>
                  </Link>
                </motion.div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {anns.length > 0 && (
        <div className="overflow-hidden border-y border-sun-400/30 bg-sun-100 py-2.5">
          <div className="marquee-track flex w-max gap-12 whitespace-nowrap">
            {[...anns, ...anns].map((a, i) => (
              <span key={i} className="text-sm text-vermilion-600">◆ {a.title}</span>
            ))}
          </div>
        </div>
      )}

      {/* Venue — early, clear, one job */}
      <section id="venue" className="scroll-mt-24 border-b border-sun-400/25 bg-gradient-to-r from-sun-100 via-white to-sky-100">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-8 sm:px-5 sm:py-10 md:grid-cols-[auto_1fr] md:items-center md:gap-8 md:py-12">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center bg-vermilion-500 text-white shadow-glow sm:h-16 sm:w-16">
            <MapPin className="h-7 w-7 sm:h-8 sm:w-8" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.35em] text-vermilion-500 sm:text-xs">Venue · ONE-10</p>
            <h2 className="mt-1 font-display text-2xl text-brown-900 sm:text-3xl md:text-4xl">
              {camp?.venue || "Badminton court near the tennis court, in front of Tower 11"}
            </h2>
            <p className="mt-2 text-sm text-brown-800/70 sm:text-base">
              One10 Residential Complex, Thakdari, Newtown — Action Area 1, Kolkata 700102
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-sun-400/20 bg-sky-50 py-10">
        <div className="mx-auto mb-6 max-w-7xl px-5">
          <p className="text-xs uppercase tracking-[0.35em] text-vermilion-500">Gallery</p>
          <h2 className="mt-2 font-display text-3xl text-brown-900 sm:text-4xl">Life at our Pujo</h2>
        </div>
        <PeekSlider images={SLIDER_A} testid="home-peek-slider" />
      </section>

      <section className="pujo-day grain relative">
        <div className="mx-auto grid max-w-7xl items-stretch gap-6 px-4 py-12 sm:px-5 sm:py-16 lg:grid-cols-2 lg:gap-10 lg:py-24">
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.7 }}
            className="relative overflow-hidden border border-sun-400/35 bg-white shadow-card"
          >
            <div className="relative aspect-[3/4] sm:aspect-[4/5]">
              <img
                src={PLACE_MAIN}
                alt="Purohit performing aarti before Goddess Durga at One10"
                className="h-full w-full object-cover object-top"
              />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="flex flex-col justify-center border border-sun-400/30 bg-white/90 p-5 shadow-card sm:p-8 md:p-10"
          >
            <p className="text-[10px] uppercase tracking-[0.35em] text-vermilion-500 sm:text-xs">ONE-10 · Organised by EOC</p>
            <h2 className="mt-2 font-display text-3xl text-brown-900 sm:text-4xl md:text-5xl lg:text-6xl">
              A Pujo for every household
            </h2>
            <p className="mt-4 text-base leading-relaxed text-brown-800/75 sm:mt-5 sm:text-lg">
              {camp?.inclusive_line || "This will be a Pujo for everyone."} Across the ONE-10 campus —
              families, elders and children gather for rituals, culture and community bonding.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="bg-sky-50" data-testid="lights-warmth-section">
        <div className="mx-auto grid max-w-7xl overflow-hidden border-y border-sun-400/25 lg:grid-cols-12 lg:items-stretch lg:border-x">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.7 }}
            className="relative min-h-[72svh] overflow-hidden border-b border-sun-400/25 sm:min-h-[78svh] lg:col-span-5 lg:min-h-[min(92svh,880px)] lg:border-b-0 lg:border-r"
          >
            <img
              src={FIREWORK}
              alt="One10 tower lit for Pujo with fireworks overhead"
              className="absolute inset-0 h-full w-full object-cover object-[center_30%] sm:object-center"
            />
            <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6 lg:hidden">
              <div className="border border-sun-400/40 bg-white/90 p-4 shadow-card backdrop-blur-md sm:p-5">
                <p className="text-[10px] uppercase tracking-[0.35em] text-vermilion-500">Neighbourhood</p>
                <p className="mt-2 font-display text-2xl leading-snug text-brown-900 sm:text-3xl">
                  Lights, dhaak, and neighbourhood warmth —
                  <span className="italic text-vermilion-500"> year after year.</span>
                </p>
              </div>
            </div>
          </motion.div>

          <div className="flex flex-col lg:col-span-7">
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.1 }}
              className="relative min-h-[36svh] flex-1 overflow-hidden sm:min-h-[42vh]"
            >
              <img
                src={TOWERS}
                alt="One10 towers dressed in festive lights"
                className="absolute inset-0 h-full w-full object-cover object-center"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="hidden border-t border-sun-400/25 bg-white p-8 lg:block lg:p-10 xl:p-12"
            >
              <p className="text-xs uppercase tracking-[0.35em] text-vermilion-500">Neighbourhood</p>
              <p className="mt-3 max-w-xl font-display text-4xl leading-snug text-brown-900 xl:text-5xl">
                Lights, dhaak, and neighbourhood warmth —
                <span className="italic text-vermilion-500"> year after year.</span>
              </p>
              <p className="mt-4 max-w-lg text-sm text-brown-800/60">
                Festival nights across the One10 campus — towers lit, fireworks overhead, and the whole neighbourhood outdoors together.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      <section className="bg-sun-50">
        <div className="mx-auto grid max-w-7xl items-stretch gap-6 px-4 py-12 sm:gap-8 sm:px-5 sm:py-16 lg:grid-cols-2 lg:py-24">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex flex-col justify-center border border-sun-400/30 bg-white p-5 shadow-card sm:p-8 md:p-10"
          >
            <p className="text-[10px] uppercase tracking-[0.35em] text-vermilion-500 sm:text-xs">Household subscription</p>
            <h2 className="mt-3 font-display text-4xl text-brown-900 sm:text-5xl md:text-6xl">
              {sub ? formatPaise(sub.base_amount_paise) : "₹1"}
              <span className="ml-2 align-middle text-base text-brown-800/45 sm:text-lg">/ family</span>
            </h2>
            <p className="mt-4 max-w-md text-sm text-brown-800/70 sm:text-base">
              One transparent contribution for the season. Voluntary donations are recorded separately.
              Receipts issue only after payment is verified.
            </p>
            <div className="mt-6 flex items-center gap-2 text-sm text-brown-800/55 sm:mt-8">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
              Ledgered · reconcilable · publicly verifiable
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.08 }}
            className="border border-sun-400/40 bg-white p-5 text-brown-900 shadow-card sm:p-7 md:p-9"
          >
            <h3 className="font-display text-2xl sm:text-3xl">What it covers</h3>
            <div className="mt-4 divide-y divide-brown-800/10 sm:mt-5">
              {(sub?.components || [
                { label: "Khuti Puja + Durga Puja + Lakshmi Puja", amount_paise: 250000 },
                { label: "Kali Puja", amount_paise: 30000 },
                { label: "Bijoya Sammilani", amount_paise: 70000 },
              ]).map((c, i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-3 sm:gap-4 sm:py-3.5">
                  <div className="flex items-start gap-2 pr-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-vermilion-500" />
                    <span className="text-sm">{c.label}</span>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums sm:text-base">{formatPaise(c.amount_paise)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between bg-gradient-to-r from-vermilion-500 to-sun-400 px-3 py-3 text-white sm:mt-5 sm:px-4 sm:py-3.5">
              <span className="font-display text-xl sm:text-2xl">Total</span>
              <span className="font-display text-2xl sm:text-3xl">
                {sub ? formatPaise(sub.base_amount_paise) : "₹1.00"}
              </span>
            </div>
            <Link to="/subscribe">
              <Button variant="primary" size="lg" className="mt-5 w-full sm:mt-6" data-testid="breakup-subscribe-btn">
                Subscribe & Pay Now <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      <section className="bg-sky-50">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-5 sm:py-16 md:py-24">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3 sm:mb-8 sm:gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.35em] text-vermilion-500 sm:text-xs">Moments</p>
              <h2 className="mt-2 font-display text-3xl text-brown-900 sm:text-4xl md:text-5xl">From our Pujo</h2>
            </div>
            <p className="text-xs text-brown-800/45 sm:text-sm">{SLIDER_B_CLEAN.length} photographs · autoplay</p>
          </div>
          <div className="overflow-hidden border border-sun-400/30 bg-white shadow-card">
            <PhotoSlider
              images={SLIDER_B_CLEAN}
              intervalMs={4200}
              aspect="aspect-[4/5] sm:aspect-[3/4] md:aspect-[4/3]"
              fit="contain"
              testid="home-moments-slider"
            />
          </div>
        </div>
      </section>

      <section className="border-t border-sun-400/25 bg-gradient-to-b from-sun-50 to-sky-100">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-5 sm:py-16 md:py-20">
          <h2 className="font-display text-3xl text-brown-900 sm:text-4xl md:text-5xl">Be part of Amader Pujo</h2>
          <p className="mt-3 max-w-xl text-sm text-brown-800/65 sm:text-base">
            Subscribe for your household, support as a brand partner, or join as a volunteer and performer.
          </p>
          <div className="mt-8 grid gap-3 sm:mt-10 sm:gap-4 md:grid-cols-3">
            {[
              { to: "/subscribe", t: "Subscribe", d: "Pay the family subscription and receive a verified digital receipt.", icon: ShieldCheck },
              { to: "/sponsors", t: "Donate / Sponsorship", d: "Voluntary gifts and brand packages — title, gates, stalls, on-ground presence.", icon: Building2 },
              { to: "/participate", t: "Participate", d: "Offer time behind the scenes or register a cultural performance.", icon: HandHeart },
            ].map((x) => (
              <Link
                key={x.to}
                to={x.to}
                className="group border border-sun-400/30 bg-white p-5 shadow-card transition-colors hover:border-vermilion-400/50 hover:bg-sun-50 sm:p-7 md:p-8"
              >
                <x.icon className="h-6 w-6 text-vermilion-500 transition-transform group-hover:scale-110 sm:h-7 sm:w-7" />
                <h3 className="mt-3 font-display text-2xl text-brown-900 sm:mt-4 sm:text-3xl">{x.t}</h3>
                <p className="mt-2 text-sm text-brown-800/60">{x.d}</p>
                <span className="mt-5 inline-flex items-center gap-1 text-sm text-vermilion-500 sm:mt-6">
                  Continue <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
          <div className="mt-8 flex flex-col gap-4 border-t border-sun-400/25 pt-6 sm:mt-10 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:pt-8">
            <p className="text-sm text-brown-800/50">
              Already paid?{" "}
              <Link to="/receipt/find" className="text-vermilion-500 hover:underline">Generate your receipt</Link>
              {" · "}
              Organised by EOC
            </p>
            <Link to="/receipt/find" className="w-full sm:w-auto">
              <Button variant="outline" size="sm" className="w-full sm:w-auto">
                <Receipt className="h-4 w-4" /> Generate receipt
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
