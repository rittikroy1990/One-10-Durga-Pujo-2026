import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Handshake, Building2, Users, Megaphone, Mail, Phone, Landmark } from "lucide-react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { Button } from "../../components/ui";
import { formatPaise } from "../../lib/utils";

function PackageCard({ pkg }) {
  const price = pkg.amount_label || (pkg.amount_paise != null ? formatPaise(pkg.amount_paise) : "—");
  return (
    <div className="rounded-2xl border border-gold-500/25 bg-brown-800/50 p-5" data-testid={`sponsor-pkg-${pkg.code}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-2xl text-ivory-100">{pkg.name}</h3>
        <div className="shrink-0 font-display text-xl text-gold-400">{price}</div>
      </div>
      <ul className="mt-3 space-y-1.5 text-sm text-ivory-100/70">
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
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    api.get("/config").then((r) => setCfg(r.data)).catch(() => {});
  }, []);

  const sp = cfg?.sponsorship || {};
  const org = cfg?.organisation || {};
  const bank = org.bank_account || {};
  const gallery = sp.gallery || [];

  return (
    <PublicLayout>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src="/images/campaign/hero-cover.jpg" alt="" className="h-full w-full object-cover opacity-35" />
          <div className="absolute inset-0 bg-gradient-to-b from-brown-900/80 via-brown-800/90 to-brown-800" />
        </div>
        <div className="relative mx-auto max-w-7xl px-5 py-20 md:py-28">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <p className="text-xs uppercase tracking-[0.3em] text-gold-400">One10 Durga Puja 2026</p>
            <h1 className="mt-2 font-display text-5xl text-ivory-100 sm:text-6xl">Sponsorship</h1>
            <p className="mt-4 max-w-2xl text-lg text-ivory-100/75">
              {sp.tagline || "Partner with culture. Connect with community. Create lasting recall."}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={`mailto:${org.contact_email || "one10eventgroup@gmail.com"}`}>
                <Button variant="primary" size="lg">
                  Discuss partnership <ArrowRight className="h-5 w-5" />
                </Button>
              </a>
              <Link to="/subscribe">
                <Button variant="outline" size="lg">Household subscribe</Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: Building2, t: "1000+ apartments", d: "Premium community in Action Area 1, Newtown" },
            { icon: Users, t: "3,000–5,000+ reach", d: "Residents, families, guests across multi-day celebrations" },
            { icon: Megaphone, t: "High brand recall", d: "Stage, gate, digital and on-ground touchpoints" },
          ].map((x) => (
            <div key={x.t} className="rounded-2xl border border-gold-500/20 bg-brown-900/40 p-5">
              <x.icon className="h-6 w-6 text-gold-400" />
              <h3 className="mt-3 font-display text-2xl text-ivory-100">{x.t}</h3>
              <p className="mt-1 text-sm text-ivory-100/65">{x.d}</p>
            </div>
          ))}
        </div>
      </section>

      {gallery.length > 0 && (
        <section className="border-y border-gold-500/15 bg-brown-900/30 py-10">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-3 px-5 md:grid-cols-4">
            {gallery.slice(0, 8).map((src) => (
              <img key={src} src={src} alt="" className="aspect-[4/3] w-full rounded-xl object-cover opacity-90" />
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-5 py-16">
        <div className="mb-8 flex items-center gap-2">
          <Handshake className="h-6 w-6 text-vermilion-500" />
          <h2 className="font-display text-4xl text-ivory-100">Premium partnerships</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {(sp.premium || []).map((p) => <PackageCard key={p.code} pkg={p} />)}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-8">
        <h2 className="font-display text-4xl text-ivory-100">Activation & engagement</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(sp.activation || []).map((p) => <PackageCard key={p.code} pkg={p} />)}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-8">
        <h2 className="font-display text-4xl text-ivory-100">Venue branding & visibility</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(sp.venue || []).map((p) => <PackageCard key={p.code} pkg={p} />)}
        </div>
      </section>

      {(sp.souvenir_ads || []).length > 0 && (
        <section className="mx-auto max-w-7xl px-5 py-8">
          <h2 className="font-display text-4xl text-ivory-100">Souvenir advertisements</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sp.souvenir_ads.map((a) => (
              <div key={a.code} className="flex items-center justify-between rounded-xl border border-gold-500/20 bg-brown-800/40 px-4 py-3">
                <span className="text-sm text-ivory-100/85">{a.name}</span>
                <span className="font-display text-lg text-gold-400">{formatPaise(a.amount_paise)}</span>
              </div>
            ))}
          </div>
          <p className="mt-8 text-sm text-ivory-100/55">Custom sponsorship options can be curated to suit your brand objectives.</p>
        </section>
      )}

      <section className="border-t border-gold-500/15 bg-brown-900">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 md:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl text-ivory-100">Contact the Committee</h2>
            <div className="mt-4 space-y-3 text-ivory-100/80">
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
              <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-gold-400" /> {org.contact_email}</div>
              <div className="flex items-start gap-2"><Phone className="h-4 w-4 mt-0.5 text-gold-400" /> {org.contact_phone}</div>
              {sp.social?.facebook && (
                <a className="text-sm text-gold-400 hover:underline" href={sp.social.facebook} target="_blank" rel="noreferrer">
                  One10 Unified Celebrations on Facebook
                </a>
              )}
            </div>
          </div>
          <div>
            <h2 className="font-display text-3xl text-ivory-100">Bank details</h2>
            <div className="mt-4 rounded-xl border border-gold-500/25 bg-brown-800/50 p-5 text-sm text-ivory-100/80">
              <div className="flex items-center gap-2 text-gold-400"><Landmark className="h-4 w-4" /> {bank.bank || "Bank"}</div>
              <div className="mt-2 font-semibold text-ivory-100">{bank.account_name}</div>
              <div className="mt-1">A/c No. {bank.account_number}</div>
              <div>IFSC {bank.ifsc}</div>
              {org.pan && <div className="mt-2 text-ivory-100/55">PAN {org.pan}</div>}
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
