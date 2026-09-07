import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, MapPin, ShieldCheck, Search, HandHeart, Sparkles,
  CheckCircle2, BookOpenCheck, Receipt, Wallet,
} from "lucide-react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { Button } from "../../components/ui";
import { formatPaise } from "../../lib/utils";

const DIYA = "/images/campaign/gallery-3.jpg";

const fade = {
  hidden: { opacity: 0, y: 24 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] } }),
};

export default function Home() {
  const [cfg, setCfg] = useState(null);
  const [anns, setAnns] = useState([]);

  useEffect(() => {
    api.get("/config").then((r) => setCfg(r.data)).catch(() => {});
    api.get("/announcements").then((r) => setAnns(r.data.items || [])).catch(() => {});
  }, []);

  const platform = cfg?.platform;
  const sub = cfg?.subscription;
  const camp = cfg?.campaign;
  const campaigns = (cfg?.campaigns || []).filter((c) => c.is_published !== false);
  const featured = campaigns.find((c) => c.is_current) || campaigns[0];
  const hero = camp?.hero_url || featured?.hero_url || "/images/campaign/hero-cover.jpg";

  return (
    <PublicLayout>
      {/* PLATFORM HERO — brand first */}
      <section className="relative min-h-[88vh] overflow-hidden alpona-bg grain">
        <div className="absolute inset-0">
          <img src={hero} alt="" className="h-full w-full object-cover opacity-30" />
          <div className="absolute inset-0 bg-gradient-to-b from-brown-900/75 via-brown-800/88 to-brown-800" />
        </div>
        <div className="relative mx-auto flex max-w-7xl flex-col justify-center px-5 pt-24 pb-28 md:pt-32 md:pb-36">
          <motion.div initial="hidden" animate="show" className="max-w-3xl">
            <motion.div variants={fade} custom={0} className="mb-5 inline-flex items-center gap-2 rounded-full border border-gold-500/40 bg-brown-900/50 px-4 py-1.5 text-xs uppercase tracking-[0.25em] text-gold-400">
              <Sparkles className="h-3.5 w-3.5" /> Events Organising Committee · PS One-10
            </motion.div>
            <motion.h1 variants={fade} custom={1} className="font-display text-5xl leading-[0.92] text-ivory-100 sm:text-6xl lg:text-7xl">
              {platform?.name || "One 10 Events"}
            </motion.h1>
            <motion.p variants={fade} custom={2} className="mt-5 max-w-xl text-lg text-ivory-100/80 sm:text-xl">
              {platform?.tagline || "Community celebrations, transparent subscriptions, verified receipts."}
            </motion.p>
            <motion.div variants={fade} custom={3} className="mt-9 flex flex-wrap gap-3">
              <Link to="/subscribe">
                <Button variant="primary" size="lg" data-testid="hero-subscribe-btn">
                  Subscribe & Pay <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
              <Link to="/sponsors">
                <Button variant="outline" size="lg" data-testid="hero-sponsors-btn">
                  Sponsorship
                </Button>
              </Link>
              <Link to="/receipt/find">
                <Button variant="outline" size="lg" data-testid="hero-find-receipt-btn">
                  <Search className="h-5 w-5" /> Find Receipt
                </Button>
              </Link>
            </motion.div>
            <motion.div variants={fade} custom={4} className="mt-7 flex items-center gap-2 text-sm text-ivory-100/60">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              Every rupee is ledgered. Receipts issue only after payment is verified.
            </motion.div>
          </motion.div>
        </div>
      </section>

      {anns.length > 0 && (
        <div className="overflow-hidden border-y border-gold-500/20 bg-brown-900 py-2.5">
          <div className="marquee-track flex w-[200%] gap-12 whitespace-nowrap">
            {[...anns, ...anns].map((a, i) => (
              <span key={i} className="text-sm text-gold-400/90">◆ {a.title}</span>
            ))}
          </div>
        </div>
      )}

      {/* What the platform does */}
      <section className="border-b border-gold-500/15 bg-brown-900/40">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 py-16 md:grid-cols-3">
          {[
            { icon: Wallet, t: "Subscriptions", d: "Household contributions online or via cash, UTR and cheque — with maker-checker controls." },
            { icon: Receipt, t: "Verified receipts", d: "Digital receipts with public verification. Never a screenshot as proof of payment." },
            { icon: BookOpenCheck, t: "Accounting & audit", d: "Double-entry ledger, bank reconciliation, procurement and period close for the committee." },
          ].map((f, i) => (
            <motion.div key={f.t} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
              className="rounded-2xl border border-gold-500/20 bg-brown-800/50 p-6">
              <f.icon className="h-7 w-7 text-gold-400" />
              <h3 className="mt-3 font-display text-2xl text-ivory-100">{f.t}</h3>
              <p className="mt-1.5 text-sm text-ivory-100/65">{f.d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Active / published campaigns */}
      {campaigns.length > 0 && (
        <section className="mx-auto max-w-7xl px-5 py-20" data-testid="campaigns-section">
          <p className="text-xs uppercase tracking-[0.3em] text-gold-400">Campaigns</p>
          <h2 className="mt-2 font-display text-4xl text-ivory-100 sm:text-5xl">Open for the community</h2>
          <p className="mt-3 max-w-2xl text-ivory-100/70">Each campaign has its own subscription, receipts and accounts — under one One 10 Events portal.</p>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {campaigns.map((c, i) => (
              <motion.div key={c.id || c.slug} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}
                className="overflow-hidden rounded-3xl border border-gold-500/25 bg-brown-700/40">
                <div className="relative h-44 overflow-hidden">
                  <img src={c.hero_url || "/images/campaign/hero-cover.jpg"} alt="" className="h-full w-full object-cover opacity-70" />
                  <div className="absolute inset-0 bg-gradient-to-t from-brown-900 via-brown-900/40 to-transparent" />
                  {c.is_current && (
                    <span className="absolute left-4 top-4 rounded-full bg-vermilion-500 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
                      Active now
                    </span>
                  )}
                </div>
                <div className="p-6">
                  <h3 className="font-display text-3xl text-ivory-100">{c.title || c.name}</h3>
                  {c.theme_line && <p className="mt-1 text-gold-400">{c.theme_line}</p>}
                  <p className="mt-3 text-sm text-ivory-100/65">{c.summary}</p>
                  {c.venue && (
                    <div className="mt-4 flex items-start gap-2 text-sm text-ivory-100/70">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-vermilion-400" />
                      {c.venue}
                    </div>
                  )}
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="font-display text-3xl text-ivory-100">
                      {c.base_amount_paise > 0 ? formatPaise(c.base_amount_paise) : "TBC"}
                      {c.base_amount_paise > 0 && <span className="ml-2 text-sm text-ivory-100/50">/ family</span>}
                    </div>
                    {c.accepting_subscriptions ? (
                      <Link to="/subscribe">
                        <Button variant="primary" data-testid={`campaign-subscribe-${c.slug}`}>
                          Subscribe <ArrowRight className="h-4 w-4" />
                        </Button>
                      </Link>
                    ) : (
                      <span className="text-xs uppercase tracking-wider text-ivory-100/40">Coming soon</span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Featured subscription breakup (active campaign) */}
      <section className="mx-auto max-w-7xl px-5 py-20">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <p className="text-xs uppercase tracking-[0.3em] text-gold-400">
              {camp?.title || "Active campaign"} · per-family subscription
            </p>
            <div className="mt-2 font-display text-6xl text-ivory-100">
              {sub ? formatPaise(sub.base_amount_paise) : "₹3,500.00"}
              <span className="ml-2 align-middle text-base text-ivory-100/50">/ family</span>
            </div>
            <p className="mt-4 max-w-md text-ivory-100/70">
              {camp?.inclusive_line || "This will be a Pujo for everyone."} Base subscription and any voluntary donation are always recorded separately.
            </p>
            <div className="mt-6 flex items-center gap-3 rounded-xl border border-gold-500/25 bg-brown-700/50 p-4">
              <MapPin className="h-5 w-5 shrink-0 text-vermilion-400" />
              <div>
                <div className="text-xs uppercase tracking-wider text-gold-400">Principal Venue</div>
                <div className="text-ivory-100/90">{camp?.venue || "Badminton court near the tennis court, in front of Tower 11"}</div>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <div className="rounded-3xl border border-gold-500/30 bg-ivory-100 p-1 card-glow">
              <div className="rounded-[22px] bg-ivory-100 p-7 text-brown-900">
                <div className="mb-5 flex items-center gap-2">
                  <img src={DIYA} alt="" className="h-10 w-10 rounded-full object-cover" />
                  <h3 className="font-display text-3xl">Contribution Breakup</h3>
                </div>
                <div className="divide-y divide-gold-500/25">
                  {(sub?.components || [
                    { label: "Khuti Puja + Durga Puja + Lakshmi Puja", amount_paise: 250000 },
                    { label: "Kali Puja", amount_paise: 30000 },
                    { label: "Bijoya Sammilani", amount_paise: 70000 },
                  ]).map((c, i) => (
                    <div key={i} className="flex items-center justify-between py-3.5">
                      <div className="flex items-start gap-2 pr-4">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-vermilion-500" />
                        <span className="text-sm">{c.label}</span>
                      </div>
                      <span className="font-semibold tabular-nums">{formatPaise(c.amount_paise)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between rounded-xl bg-brown-800 px-4 py-3.5 text-ivory-100">
                  <span className="font-display text-2xl">Total</span>
                  <span className="font-display text-3xl text-gold-400">{sub ? formatPaise(sub.base_amount_paise) : "₹3,500.00"}</span>
                </div>
                <Link to="/subscribe">
                  <Button variant="primary" size="lg" className="mt-5 w-full" data-testid="breakup-subscribe-btn">
                    Subscribe & Pay Now <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="border-t border-gold-500/15 bg-brown-900">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 py-14 md:grid-cols-3">
          {[
            { icon: ShieldCheck, t: "Verified payments only", d: "Every receipt is backed by a verified bank/gateway transaction — never a screenshot." },
            { icon: Search, t: "One source of truth", d: "Payment, receipt and ledger totals always reconcile. Auditors can trace any rupee." },
            { icon: HandHeart, t: "A community for everyone", d: "Residents, families, elders, children, performers and volunteers — all welcome." },
          ].map((f, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
              className="rounded-2xl border border-gold-500/20 bg-brown-800/60 p-6">
              <f.icon className="h-7 w-7 text-gold-400" />
              <h4 className="mt-3 font-display text-2xl text-ivory-100">{f.t}</h4>
              <p className="mt-1.5 text-sm text-ivory-100/65">{f.d}</p>
            </motion.div>
          ))}
        </div>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 border-t border-gold-500/10 px-5 py-10">
          <div>
            <div className="font-display text-2xl text-ivory-100">Want to volunteer or perform?</div>
            <p className="text-sm text-ivory-100/60">Tell the coordinator how you’d like to help.</p>
          </div>
          <Link to="/participate">
            <Button variant="outline" size="lg" data-testid="home-participate-cta">
              <HandHeart className="h-5 w-5" /> Participate
            </Button>
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}
