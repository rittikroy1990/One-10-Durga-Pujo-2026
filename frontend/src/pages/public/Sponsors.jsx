import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, Handshake, Building2, Users, Megaphone, Mail, Phone, Landmark, Heart,
} from "lucide-react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import BrandLogo from "../../components/BrandLogo";
import DonationFlow from "../../components/DonationFlow";
import { Button } from "../../components/ui";
import { formatPaise } from "../../lib/utils";

function PackageCard({ pkg }) {
  const price = pkg.amount_label || (pkg.amount_paise != null ? formatPaise(pkg.amount_paise) : "—");
  return (
    <div className="rounded-2xl border border-sun-400/30 bg-white p-5" data-testid={`sponsor-pkg-${pkg.code}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-2xl text-brown-900">{pkg.name}</h3>
        <div className="shrink-0 font-display text-xl text-vermilion-500">{price}</div>
      </div>
      <ul className="mt-3 space-y-1.5 text-sm text-brown-800/70">
        {(pkg.benefits || []).map((b) => (
          <li key={b} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-vermilion-500" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Sponsors() {
  const location = useLocation();
  const [cfg, setCfg] = useState(null);
  const [previous, setPrevious] = useState({ items: [], title: "", note: "" });
  const [mode, setMode] = useState("donate"); // donate | sponsorship

  useEffect(() => {
    api.get("/config").then((r) => setCfg(r.data)).catch(() => {});
    api.get("/sponsors/previous").then((r) => setPrevious(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const hash = (location.hash || "").replace("#", "").toLowerCase();
    if (hash === "sponsorship" || hash === "sponsors" || hash === "partner") setMode("sponsorship");
    else if (hash === "donate" || hash === "donation" || !hash) setMode("donate");
  }, [location.hash]);

  useEffect(() => {
    if (mode === "donate") {
      const el = document.getElementById("donate");
      if (location.hash === "#donate" && el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [mode, location.hash]);

  const sp = cfg?.sponsorship || {};
  const org = cfg?.organisation || {};
  const bank = org.bank_account || {};
  const gallery = sp.gallery || [];
  const past = previous.items || [];

  const selectMode = (next) => {
    setMode(next);
    const hash = next === "donate" ? "#donate" : "#sponsorship";
    if (window.history?.replaceState) {
      window.history.replaceState(null, "", `/sponsors${hash}`);
    }
  };

  return (
    <PublicLayout>
      <section className="relative min-h-[58vh] overflow-hidden pt-16">
        <div className="absolute inset-0">
          <img src="/images/campaign/live/live-07.jpg" alt="" className="ken-burns h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-sky-50/95 via-sun-50/80 to-sky-50/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-sky-50 via-transparent to-sun-50/50" />
        </div>
        <div className="relative mx-auto flex min-h-[58vh] max-w-7xl flex-col justify-end px-5 pb-12 md:justify-center md:pb-20">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <BrandLogo imgClassName="h-12 sm:h-14" />
              <p className="font-display text-3xl leading-none text-brown-900 sm:text-4xl">
                One 10 Durgotsav <span className="text-gradient-gold">2026</span>
              </p>
            </div>
            <p className="mt-2 text-xs uppercase tracking-[0.2em] text-vermilion-500">
              Give back · Partner with culture
            </p>
            <h1 className="mt-4 font-display text-5xl text-brown-900 sm:text-6xl lg:text-7xl">
              Donate / Sponsorship
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-brown-800/75">
              Make a voluntary donation as a One 10 resident or well-wisher — or explore brand sponsorship packages for on-ground presence.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                variant={mode === "donate" ? "primary" : "outline"}
                size="lg"
                data-testid="hub-tab-donate"
                onClick={() => selectMode("donate")}
              >
                <Heart className="h-5 w-5" /> Individual donation
              </Button>
              <Button
                variant={mode === "sponsorship" ? "primary" : "outline"}
                size="lg"
                data-testid="hub-tab-sponsorship"
                onClick={() => selectMode("sponsorship")}
              >
                <Handshake className="h-5 w-5" /> Brand sponsorship
              </Button>
              <Link to="/subscribe">
                <Button variant="outline" size="lg">Household subscribe</Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Mode switcher sticky strip */}
      <div className="sticky top-16 z-30 border-b border-sun-400/30 bg-white/90 backdrop-blur-md sm:top-20">
        <div className="mx-auto flex max-w-7xl gap-2 px-5 py-3">
          <button
            type="button"
            onClick={() => selectMode("donate")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              mode === "donate" ? "bg-vermilion-500 text-white" : "bg-sky-50 text-brown-800/70 hover:bg-sun-50"
            }`}
          >
            Donate
          </button>
          <button
            type="button"
            onClick={() => selectMode("sponsorship")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              mode === "sponsorship" ? "bg-vermilion-500 text-white" : "bg-sky-50 text-brown-800/70 hover:bg-sun-50"
            }`}
          >
            Sponsorship
          </button>
        </div>
      </div>

      {mode === "donate" && (
        <section id="donate" className="scroll-mt-32 border-b border-sun-400/25 bg-gradient-to-b from-white to-sky-50 py-12 sm:py-16" data-testid="donate-hub-section">
          <div className="mx-auto max-w-7xl px-5">
            <div className="mx-auto mb-8 max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-vermilion-500">Voluntary contribution</p>
              <h2 className="mt-2 font-display text-4xl text-brown-900 sm:text-5xl">Make a donation</h2>
              <p className="mt-3 text-brown-800/70">
                Separate from the family subscription. Residents use tower &amp; flat; others use a simpler donor form.
              </p>
            </div>
            <DonationFlow className="rounded-2xl border border-sun-400/30 bg-sky-50/40 p-4 sm:p-6" />
          </div>
        </section>
      )}

      {mode === "sponsorship" && (
        <>
          {past.length > 0 && (
            <section className="relative overflow-hidden border-b border-sun-400/25 bg-gradient-to-b from-sun-50 via-white to-sky-50 py-16 sm:py-20" data-testid="previous-sponsors">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_at_top,_rgba(245,166,35,0.18),_transparent_60%)]" />
              <div className="relative mx-auto max-w-7xl px-5">
                <div className="mx-auto max-w-3xl text-center">
                  <p className="text-[10px] uppercase tracking-[0.4em] text-vermilion-500 sm:text-xs">Past seasons</p>
                  <h2 className="mt-3 font-display text-4xl text-brown-900 sm:text-5xl md:text-6xl">
                    {previous.title || "2025 Annual Event Sponsors"}
                  </h2>
                  {previous.note && (
                    <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-brown-800/70 sm:text-base">
                      {previous.note}
                    </p>
                  )}
                </div>

                <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-7">
                  {past.map((s, i) => (
                    <motion.article
                      key={s.logo || s.name}
                      initial={{ opacity: 0, y: 18 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.2 }}
                      transition={{ duration: 0.45, delay: Math.min(i * 0.03, 0.35) }}
                      className="group relative overflow-hidden rounded-2xl border border-sun-400/35 bg-white p-5 shadow-card transition duration-300 hover:-translate-y-1 hover:border-vermilion-400/45 hover:shadow-glow sm:p-6"
                      data-testid={`prev-sponsor-${(s.name || "x").toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-vermilion-500 via-sun-400 to-sky-300 opacity-90" />
                      <div className="flex h-40 items-center justify-center sm:h-48 md:h-52">
                        {s.logo ? (
                          <img
                            src={`${s.logo}?v=4`}
                            alt={s.name || "Sponsor"}
                            className="max-h-full max-w-full object-contain transition duration-300 group-hover:scale-[1.03]"
                            loading="lazy"
                            onError={(e) => { e.currentTarget.style.display = "none"; }}
                          />
                        ) : (
                          <span className="font-display text-2xl text-brown-900">{s.name}</span>
                        )}
                      </div>
                      {s.name && (
                        <div className="mt-4 text-center">
                          <h3 className="font-display text-lg leading-snug text-brown-900 sm:text-xl">{s.name}</h3>
                          {s.years && (
                            <p className="mt-1 text-[11px] uppercase tracking-[0.22em] text-vermilion-500/80">
                              {s.years} partner
                            </p>
                          )}
                        </div>
                      )}
                    </motion.article>
                  ))}
                </div>
              </div>
            </section>
          )}

          <section id="sponsorship" className="scroll-mt-32 mx-auto max-w-7xl px-5 py-14">
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { icon: Building2, t: "1000+ apartments", d: "Premium community in Action Area 1, Newtown" },
                { icon: Users, t: "3,000–5,000+ reach", d: "Residents, families, guests across multi-day celebrations" },
                { icon: Megaphone, t: "High brand recall", d: "Stage, gate, digital and on-ground touchpoints" },
              ].map((x) => (
                <div key={x.t} className="rounded-2xl border border-sun-400/30 bg-white p-5">
                  <x.icon className="h-6 w-6 text-vermilion-500" />
                  <h3 className="mt-3 font-display text-2xl text-brown-900">{x.t}</h3>
                  <p className="mt-1 text-sm text-brown-800/65">{x.d}</p>
                </div>
              ))}
            </div>
          </section>

          {gallery.length > 0 && (
            <section className="border-y border-sun-400/25 bg-sky-50 py-10">
              <div className="mx-auto grid max-w-7xl grid-cols-2 gap-3 px-5 md:grid-cols-4">
                {gallery.filter(Boolean).map((src) => (
                  <img
                    key={src}
                    src={src}
                    alt=""
                    className="aspect-[4/3] w-full object-cover opacity-90"
                    loading="lazy"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="mx-auto max-w-7xl px-5 py-16">
            <div className="mb-8 flex items-center gap-2">
              <Handshake className="h-6 w-6 text-vermilion-500" />
              <h2 className="font-display text-4xl text-brown-900">Premium partnerships</h2>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              {(sp.premium || []).map((p) => <PackageCard key={p.code} pkg={p} />)}
            </div>
          </section>

          <section className="mx-auto max-w-7xl px-5 py-8">
            <h2 className="font-display text-4xl text-brown-900">Activation & engagement</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {(sp.activation || []).map((p) => <PackageCard key={p.code} pkg={p} />)}
            </div>
          </section>

          <section className="mx-auto max-w-7xl px-5 py-8">
            <h2 className="font-display text-4xl text-brown-900">Venue branding & visibility</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {(sp.venue || []).map((p) => <PackageCard key={p.code} pkg={p} />)}
            </div>
          </section>

          {(sp.souvenir_ads || []).length > 0 && (
            <section className="mx-auto max-w-7xl px-5 py-8">
              <h2 className="font-display text-4xl text-brown-900">Souvenir advertisements</h2>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sp.souvenir_ads.map((a) => (
                  <div key={a.code} className="flex items-center justify-between rounded-xl border border-sun-400/30 bg-white px-4 py-3">
                    <span className="text-sm text-brown-800/85">{a.name}</span>
                    <span className="font-display text-lg text-vermilion-500">{formatPaise(a.amount_paise)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-8 text-sm text-brown-800/55">Custom sponsorship options can be curated to suit your brand objectives.</p>
            </section>
          )}

          <section className="border-t border-sun-400/25 bg-sun-50">
            <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 md:grid-cols-2">
              <div>
                <h2 className="font-display text-3xl text-brown-900">Contact the Committee</h2>
                <div className="mt-4 space-y-3 text-brown-800/80">
                  {(org.primary_contact_name || org.primary_contact_role) && (
                    <div className="font-semibold text-brown-900">
                      {org.primary_contact_name}{org.primary_contact_role ? ` · ${org.primary_contact_role}` : ""}
                      {org.primary_contact_phone && (
                        <div className="font-normal text-sm text-brown-800/70">{org.primary_contact_phone}</div>
                      )}
                    </div>
                  )}
                  {(org.secondary_contact_name || org.secondary_contact_phone) && (
                    <div className="font-semibold text-brown-900">
                      {org.secondary_contact_name}{org.secondary_contact_role ? ` · ${org.secondary_contact_role}` : ""}
                      {org.secondary_contact_phone && (
                        <div className="font-normal text-sm text-brown-800/70">{org.secondary_contact_phone}</div>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-vermilion-500" /> {org.contact_email}</div>
                  <div className="flex items-start gap-2"><Phone className="h-4 w-4 mt-0.5 text-vermilion-500" /> {org.contact_phone}</div>
                  {sp.social?.facebook && (
                    <a className="text-sm text-vermilion-500 hover:underline" href={sp.social.facebook} target="_blank" rel="noreferrer">
                      One10 Unified Celebrations on Facebook
                    </a>
                  )}
                  <a href={`mailto:${org.contact_email || "one10eventgroup@gmail.com"}`}>
                    <Button variant="primary" className="mt-2">
                      Discuss partnership <ArrowRight className="h-4 w-4" />
                    </Button>
                  </a>
                </div>
              </div>
              <div>
                <h2 className="font-display text-3xl text-brown-900">Bank details</h2>
                <div className="mt-4 rounded-xl border border-sun-400/30 bg-white p-5 text-sm text-brown-800/80">
                  <div className="flex items-center gap-2 text-vermilion-500"><Landmark className="h-4 w-4" /> {bank.bank || "Bank"}</div>
                  <div className="mt-2 font-semibold text-brown-900">{bank.account_name}</div>
                  <div className="mt-1">A/c No. {bank.account_number}</div>
                  <div>IFSC {bank.ifsc}</div>
                  {org.pan && <div className="mt-2 text-brown-800/55">PAN {org.pan}</div>}
                </div>
                <p className="mt-4 text-sm text-brown-800/60">
                  Prefer a personal gift instead?{" "}
                  <button type="button" className="font-semibold text-vermilion-600 underline" onClick={() => selectMode("donate")}>
                    Switch to individual donation
                  </button>
                </p>
              </div>
            </div>
          </section>
        </>
      )}
    </PublicLayout>
  );
}
