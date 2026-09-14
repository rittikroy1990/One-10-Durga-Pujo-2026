import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, Handshake, Building2, Users, Megaphone, Mail, Phone, Landmark,
  Globe2, Share2, Sparkles, CheckCircle2, FileImage,
} from "lucide-react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { Button } from "../../components/ui";
import { formatPaise } from "../../lib/utils";

const fade = {
  hidden: { opacity: 0, y: 22 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.07, duration: 0.55, ease: [0.22, 1, 0.36, 1] },
  }),
};

const ATMOSPHERE = [
  "/images/campaign/sindoor-khela.jpg",
  "/images/campaign/highlights.jpg",
  "/images/campaign/experience.jpg",
  "/images/campaign/full-16.jpg",
  "/images/campaign/full-25.jpg",
  "/images/campaign/full-13.jpg",
];

function inquireMailto(email, pkg) {
  const to = email || "one10eventgroup@gmail.com";
  const subject = encodeURIComponent(`Sponsorship inquiry — ${pkg.name} (One10 Durga Puja 2026)`);
  const body = encodeURIComponent(
    [
      `Hello One10 Events Organising Committee,`,
      ``,
      `I am interested in the following package:`,
      `• ${pkg.name}${pkg.amount_label || pkg.amount_paise != null ? ` (${pkg.amount_label || formatPaise(pkg.amount_paise)})` : ""}`,
      ``,
      `Brand / organisation:`,
      `Contact person:`,
      `Mobile:`,
      `Preferred go-live window:`,
      ``,
      `Please share next steps, logo specs and invoice details.`,
      ``,
      `Thank you.`,
    ].join("\n"),
  );
  return `mailto:${to}?subject=${subject}&body=${body}`;
}

function PackageCard({ pkg, email, accent = "default" }) {
  const price = pkg.amount_label || (pkg.amount_paise != null ? formatPaise(pkg.amount_paise) : "—");
  const border =
    accent === "digital"
      ? "border-vermilion-500/35 bg-gradient-to-br from-brown-800/80 to-brown-900/90"
      : "border-gold-500/25 bg-brown-800/50";
  return (
    <div className={`flex h-full flex-col rounded-2xl border p-5 ${border}`} data-testid={`sponsor-pkg-${pkg.code}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-2xl text-ivory-100">{pkg.name}</h3>
        <div className="shrink-0 text-right font-display text-xl text-gold-400">{price}</div>
      </div>
      <ul className="mt-3 flex-1 space-y-1.5 text-sm text-ivory-100/70">
        {(pkg.benefits || []).map((b) => (
          <li key={b} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-vermilion-500" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <a href={inquireMailto(email, pkg)} className="mt-5 block">
        <Button variant={accent === "digital" ? "primary" : "outline"} size="sm" className="w-full">
          Inquire about this package <ArrowRight className="h-4 w-4" />
        </Button>
      </a>
    </div>
  );
}

function SectionHeading({ eyebrow, title, blurb }) {
  return (
    <div className="mb-8 max-w-2xl">
      {eyebrow && <p className="text-xs uppercase tracking-[0.3em] text-gold-400">{eyebrow}</p>}
      <h2 className="mt-2 font-display text-4xl text-ivory-100 sm:text-5xl">{title}</h2>
      {blurb && <p className="mt-3 text-ivory-100/70">{blurb}</p>}
    </div>
  );
}

export default function Sponsors() {
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    api.get("/config").then((r) => setCfg(r.data)).catch(() => {});
  }, []);

  const sp = cfg?.sponsorship || {};
  const org = cfg?.organisation || {};
  const bank = org.bank_account || {};
  const gallery = (sp.gallery || []).length ? sp.gallery : ATMOSPHERE;
  const email = org.contact_email || "one10eventgroup@gmail.com";
  const digital = sp.digital || [];
  const audience = sp.audience || {};

  return (
    <PublicLayout>
      {/* Full-bleed hero — brand first */}
      <section className="relative min-h-[78vh] overflow-hidden alpona-bg grain">
        <div className="absolute inset-0">
          <motion.img
            initial={{ scale: 1.08 }}
            animate={{ scale: 1 }}
            transition={{ duration: 8, ease: "easeOut" }}
            src="/images/campaign/hero-cover.jpg"
            alt=""
            className="h-full w-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-brown-900/70 via-brown-800/85 to-brown-800" />
        </div>
        <div className="relative mx-auto flex max-w-7xl flex-col justify-end px-5 pb-20 pt-28 md:pb-28 md:pt-36">
          <motion.div initial="hidden" animate="show" className="max-w-3xl">
            <motion.p variants={fade} custom={0} className="font-display text-2xl text-gold-400 sm:text-3xl">
              One 10 Events
            </motion.p>
            <motion.h1 variants={fade} custom={1} className="mt-2 font-display text-5xl leading-[0.95] text-ivory-100 sm:text-6xl lg:text-7xl">
              Sponsor Durga Puja 2026
            </motion.h1>
            <motion.p variants={fade} custom={2} className="mt-5 max-w-xl text-lg text-ivory-100/80">
              {sp.tagline || "Partner with culture. Connect with community. Create lasting recall."}
            </motion.p>
            <motion.div variants={fade} custom={3} className="mt-9 flex flex-wrap gap-3">
              <a href="#digital-presence">
                <Button variant="primary" size="lg" data-testid="hero-digital-cta">
                  Website & social packages <ArrowRight className="h-5 w-5" />
                </Button>
              </a>
              <a href={`mailto:${email}?subject=${encodeURIComponent("Sponsorship partnership — One10 Durga Puja 2026")}`}>
                <Button variant="outline" size="lg">Discuss partnership</Button>
              </a>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Atmosphere strip */}
      <section className="relative overflow-hidden border-y border-gold-500/15 bg-brown-900">
        <div className="flex gap-3 overflow-x-auto px-5 py-4 scrollbar-none md:grid md:grid-cols-6 md:overflow-visible md:py-0 md:px-0">
          {ATMOSPHERE.map((src, i) => (
            <motion.div
              key={src}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="relative h-36 w-48 shrink-0 overflow-hidden md:h-44 md:w-auto"
            >
              <img src={src} alt="" className="h-full w-full object-cover opacity-85 transition duration-700 hover:scale-105 hover:opacity-100" />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-brown-900/50 to-transparent" />
            </motion.div>
          ))}
        </div>
      </section>

      {/* Why partner — one job */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <img src="/images/campaign/sindoor-khela.jpg" alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-brown-800/95" />
        </div>
        <div className="relative mx-auto max-w-7xl px-5 py-16">
          <SectionHeading
            eyebrow="The audience"
            title="A premium Newtown community, multi-day recall"
            blurb="Your brand meets residents and guests across rituals, stage programmes and community bonding — on-ground and online."
          />
          <div className="grid gap-8 md:grid-cols-3">
            {[
              { icon: Building2, t: `${audience.apartments || "1000+"} apartments`, d: "Action Area 1, Newtown — affluent, family-oriented households." },
              { icon: Users, t: `${audience.reach || "3,000–5,000+"} reach`, d: "Residents, families and guests across the celebration days." },
              { icon: Megaphone, t: "Stage · gate · digital", d: "High-trust touchpoints from mandap to one10events.in and social feeds." },
            ].map((x, i) => (
              <motion.div
                key={x.t}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="border-l border-gold-500/35 pl-5"
              >
                <x.icon className="h-6 w-6 text-gold-400" />
                <h3 className="mt-3 font-display text-2xl text-ivory-100">{x.t}</h3>
                <p className="mt-1.5 text-sm text-ivory-100/65">{x.d}</p>
              </motion.div>
            ))}
          </div>
          {(audience.best_suited_for || []).length > 0 && (
            <p className="mt-10 text-sm text-ivory-100/55">
              Especially suited for: {(audience.best_suited_for || []).join(" · ")}
            </p>
          )}
        </div>
      </section>

      {/* Digital presence — new rate-card cut */}
      <section id="digital-presence" className="relative scroll-mt-24 overflow-hidden border-y border-gold-500/15">
        <div className="absolute inset-0">
          <img src="/images/campaign/experience.jpg" alt="" className="h-full w-full object-cover opacity-25" />
          <div className="absolute inset-0 bg-gradient-to-br from-brown-900 via-brown-800/95 to-brown-900" />
        </div>
        <div className="relative mx-auto max-w-7xl px-5 py-16 md:py-20">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-2xl">
              <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-vermilion-400">
                <Sparkles className="h-3.5 w-3.5" /> New · Website & social cut
              </p>
              <h2 className="mt-3 font-display text-4xl text-ivory-100 sm:text-5xl">Digital presence partnerships</h2>
              <p className="mt-3 text-ivory-100/75">
                Built for brands that want measurable online recall — logo and stories on one10events.in and One10 social channels.
                These packages can be inquired and closed through the website; payment references the committee bank / UPI flow.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-ivory-100/70">
              <span className="inline-flex items-center gap-2"><Globe2 className="h-4 w-4 text-gold-400" /> Website</span>
              <span className="inline-flex items-center gap-2"><Share2 className="h-4 w-4 text-gold-400" /> Social</span>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {digital.map((p, i) => (
              <motion.div
                key={p.code}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
              >
                <PackageCard pkg={p} email={email} accent="digital" />
              </motion.div>
            ))}
          </div>

          <div className="mt-12 grid gap-6 border-t border-gold-500/20 pt-10 md:grid-cols-2">
            <div>
              <h3 className="font-display text-2xl text-ivory-100">What you receive as a digital partner</h3>
              <ul className="mt-4 space-y-2.5 text-sm text-ivory-100/75">
                {[
                  "Written deliverables checklist before go-live",
                  "Logo placement proof (screenshots + live links)",
                  "Social post calendar window shared in advance",
                  "Invoice / payment acknowledgement from the committee",
                ].map((t) => (
                  <li key={t} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-gold-500/25 bg-brown-900/60 p-6">
              <FileImage className="h-6 w-6 text-gold-400" />
              <h3 className="mt-3 font-display text-2xl text-ivory-100">Ready to book online?</h3>
              <p className="mt-2 text-sm text-ivory-100/70">
                Inquire on a package above, or contribute via Donate with a note naming your digital package —
                the committee will confirm placement and issue a receipt after payment is verified.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link to="/donate">
                  <Button variant="primary" size="sm">
                    Pay via Donate <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <a href={`mailto:${email}?subject=${encodeURIComponent("Digital Presence Partner — logo kit & invoice")}`}>
                  <Button variant="outline" size="sm">Send logo kit</Button>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Premium */}
      <section className="mx-auto max-w-7xl px-5 py-16">
        <div className="mb-2 flex items-center gap-2 text-vermilion-500">
          <Handshake className="h-6 w-6" />
          <span className="text-xs uppercase tracking-[0.3em]">On-ground prestige</span>
        </div>
        <SectionHeading title="Premium partnerships" blurb="Naming rights and flagship visibility across the celebration." />
        <div className="grid gap-5 md:grid-cols-2">
          {(sp.premium || []).map((p) => <PackageCard key={p.code} pkg={p} email={email} />)}
        </div>
      </section>

      {/* Activation with side image */}
      <section className="border-y border-gold-500/10 bg-brown-900/40">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 lg:grid-cols-[1fr_1.2fr]">
          <div className="relative min-h-[280px] overflow-hidden rounded-none lg:min-h-full">
            <img src="/images/campaign/highlights.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-brown-900/80 via-transparent to-brown-900/30" />
            <div className="absolute bottom-6 left-6 right-6">
              <p className="font-display text-3xl text-ivory-100">Activation & engagement</p>
              <p className="mt-1 text-sm text-ivory-100/70">Booths, cultural branding, health and media moments.</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(sp.activation || []).map((p) => <PackageCard key={p.code} pkg={p} email={email} />)}
          </div>
        </div>
      </section>

      {/* Venue */}
      <section className="mx-auto max-w-7xl px-5 py-16">
        <SectionHeading
          eyebrow="Footfall"
          title="Venue branding & visibility"
          blurb="Gates, driveway, mandap and standees — where every guest walks past your brand."
        />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(sp.venue || []).map((p) => <PackageCard key={p.code} pkg={p} email={email} />)}
        </div>
      </section>

      {/* Gallery mosaic */}
      <section className="overflow-hidden bg-brown-900 py-4">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-2 px-2 sm:grid-cols-4 md:gap-3 md:px-5">
          {gallery.slice(0, 8).map((src, i) => (
            <motion.img
              key={src}
              src={src}
              alt=""
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 0.92 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.04 }}
              className={`w-full object-cover ${i % 3 === 0 ? "aspect-[3/4]" : "aspect-[4/3]"}`}
            />
          ))}
        </div>
      </section>

      {(sp.souvenir_ads || []).length > 0 && (
        <section className="mx-auto max-w-7xl px-5 py-16">
          <SectionHeading
            eyebrow="Print"
            title="Souvenir advertisements"
            blurb="Lasting recall in the official Pujo souvenir — from covers to quarter pages."
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sp.souvenir_ads.map((a) => (
              <a
                key={a.code}
                href={inquireMailto(email, a)}
                className="flex items-center justify-between border border-gold-500/20 bg-brown-800/40 px-4 py-3 transition hover:border-gold-500/45"
                data-testid={`sponsor-pkg-${a.code}`}
              >
                <span className="text-sm text-ivory-100/85">{a.name}</span>
                <span className="font-display text-lg text-gold-400">{formatPaise(a.amount_paise)}</span>
              </a>
            ))}
          </div>
          <p className="mt-8 text-sm text-ivory-100/55">Custom sponsorship options can be curated to suit your brand objectives.</p>
        </section>
      )}

      {/* Contact + bank */}
      <section className="relative overflow-hidden border-t border-gold-500/15">
        <div className="absolute inset-0">
          <img src="/images/campaign/full-34.jpg" alt="" className="h-full w-full object-cover opacity-20" />
          <div className="absolute inset-0 bg-brown-900/92" />
        </div>
        <div className="relative mx-auto grid max-w-7xl gap-10 px-5 py-16 md:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl text-ivory-100 sm:text-4xl">Contact the Committee</h2>
            <p className="mt-2 text-sm text-ivory-100/65">We respond with inventory, logo specs and invoice details.</p>
            <div className="mt-6 space-y-3 text-ivory-100/80">
              {(org.primary_contact_name || org.primary_contact_role) && (
                <div className="font-semibold text-ivory-100">
                  {org.primary_contact_name}{org.primary_contact_role ? ` · ${org.primary_contact_role}` : ""}
                  {org.primary_contact_phone && (
                    <div className="font-normal text-sm text-ivory-100/70">{org.primary_contact_phone}</div>
                  )}
                </div>
              )}
              {(org.secondary_contact_name || org.secondary_contact_phone) && (
                <div className="font-semibold text-ivory-100">
                  {org.secondary_contact_name}{org.secondary_contact_role ? ` · ${org.secondary_contact_role}` : ""}
                  {org.secondary_contact_phone && (
                    <div className="font-normal text-sm text-ivory-100/70">{org.secondary_contact_phone}</div>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-gold-400" /> {email}</div>
              <div className="flex items-start gap-2"><Phone className="h-4 w-4 mt-0.5 text-gold-400" /> {org.contact_phone}</div>
              {sp.social?.facebook && (
                <a className="text-sm text-gold-400 hover:underline" href={sp.social.facebook} target="_blank" rel="noreferrer">
                  One10 Unified Celebrations on Facebook
                </a>
              )}
            </div>
          </div>
          <div>
            <h2 className="font-display text-3xl text-ivory-100 sm:text-4xl">Bank details</h2>
            <p className="mt-2 text-sm text-ivory-100/65">Use these details after package confirmation — or start via Donate with a sponsorship note.</p>
            <div className="mt-5 border border-gold-500/25 bg-brown-800/60 p-5 text-sm text-ivory-100/80">
              <div className="flex items-center gap-2 text-gold-400"><Landmark className="h-4 w-4" /> {bank.bank || "Bank"}</div>
              <div className="mt-2 font-semibold text-ivory-100">{bank.account_name}</div>
              <div className="mt-1">A/c No. {bank.account_number}</div>
              <div>IFSC {bank.ifsc}</div>
              {org.pan && <div className="mt-2 text-ivory-100/55">PAN {org.pan}</div>}
            </div>
            <div className="mt-4">
              <Link to="/donate">
                <Button variant="outline" size="sm">Contribute online <ArrowRight className="h-4 w-4" /></Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
