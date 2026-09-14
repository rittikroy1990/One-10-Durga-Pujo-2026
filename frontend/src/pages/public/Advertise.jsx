import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, BadgeCheck, Building2, ImagePlus, MapPin, ShieldCheck, Sparkles, Video,
} from "lucide-react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { Button } from "../../components/ui";
import { formatPaise } from "../../lib/utils";

export default function Advertise() {
  const [catalog, setCatalog] = useState(null);

  useEffect(() => {
    api.get("/ads/packages").then((r) => setCatalog(r.data)).catch(() => setCatalog(null));
  }, []);

  const packages = catalog?.packages || [];

  return (
    <PublicLayout>
      <section className="relative overflow-hidden border-b border-gold-500/20 bg-brown-900">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 20% 20%, rgba(212,175,55,0.25), transparent 55%), radial-gradient(ellipse 60% 45% at 90% 10%, rgba(192,57,43,0.2), transparent 50%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-14 sm:pt-20">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gold-400">Local business ads</p>
            <h1 className="mt-3 max-w-3xl font-display text-4xl text-ivory-100 sm:text-5xl md:text-6xl">
              Put your shop in front of One Ten families
            </h1>
            <p className="mt-4 max-w-2xl text-ivory-100/75">
              {catalog?.tagline || catalog?.campaign ||
                "Paid placements for businesses inside and outside One Ten. Upload once, committee reviews, then your ad goes live on the website."}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/advertise/apply">
                <Button variant="primary" data-testid="advertise-start-btn">
                  Submit your ad <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/local-businesses">
                <Button variant="outline">Browse live ads</Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Building2, t: "Inside + outside One Ten", d: "Tower shops and nearby neighbourhood businesses are welcome." },
            { icon: ImagePlus, t: "Write-up, images & video", d: "Upload creatives once — images up to 15 MB, short videos up to 50 MB." },
            { icon: ShieldCheck, t: "Committee review", d: "Nothing goes live until EOC approves payment and content." },
            { icon: BadgeCheck, t: "One resubmit", d: "If changes are requested, you can update the same application once." },
          ].map((item) => (
            <div key={item.t} className="rounded-2xl border border-brown-800/10 bg-ivory-100 p-5">
              <item.icon className="h-6 w-6 text-vermilion-600" />
              <h3 className="mt-3 font-display text-xl text-brown-900">{item.t}</h3>
              <p className="mt-1 text-sm text-brown-800/70">{item.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-brown-800/10 bg-ivory-50 py-14">
        <div className="mx-auto max-w-6xl px-5">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-vermilion-600">Packages</p>
          <h2 className="mt-2 font-display text-3xl text-brown-900 sm:text-4xl">Choose how you want to appear</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {packages.map((pkg, i) => (
              <div
                key={pkg.code}
                className={`rounded-2xl border p-6 ${i === packages.length - 1 ? "border-gold-500/50 bg-brown-900 text-ivory-100" : "border-brown-800/10 bg-white text-brown-900"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-2xl">{pkg.name}</h3>
                    <p className={`mt-2 text-sm ${i === packages.length - 1 ? "text-ivory-100/70" : "text-brown-800/70"}`}>{pkg.blurb}</p>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-2xl text-gold-500">{formatPaise(pkg.amount_paise)}</div>
                    <div className={`text-[11px] uppercase tracking-wider ${i === packages.length - 1 ? "text-ivory-100/50" : "text-brown-800/45"}`}>one-time</div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(pkg.placements || []).map((placement) => (
                    <span
                      key={placement}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${i === packages.length - 1 ? "bg-white/10 text-ivory-100" : "bg-sky-50 text-sky-800"}`}
                    >
                      {placement.replaceAll("_", " ")}
                    </span>
                  ))}
                </div>
                {pkg.includes_full_page && (
                  <p className={`mt-3 flex items-center gap-2 text-sm ${i === packages.length - 1 ? "text-gold-300" : "text-vermilion-700"}`}>
                    <Sparkles className="h-4 w-4" /> Includes a dedicated full-page ad
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="mt-8">
            <Link to="/advertise/apply">
              <Button variant="primary" size="lg" data-testid="advertise-choose-package-btn">
                Continue to application <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14">
        <h2 className="font-display text-3xl text-brown-900">Creative surfaces</h2>
        <p className="mt-2 max-w-2xl text-brown-800/70">Approved ads can appear across multiple website surfaces depending on the package.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            { t: "Home neighbourhood strip", d: "Rotating cards on the public home page." },
            { t: "Local Businesses directory", d: "Filterable gallery for inside / outside One Ten." },
            { t: "Full story / takeover pages", d: "Dedicated clickable pages for premium packages." },
          ].map((x) => (
            <div key={x.t} className="rounded-2xl border border-dashed border-brown-800/15 bg-white p-5">
              <Video className="h-5 w-5 text-gold-600" />
              <h3 className="mt-3 font-semibold text-brown-900">{x.t}</h3>
              <p className="mt-1 text-sm text-brown-800/65">{x.d}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 flex items-center gap-2 text-sm text-brown-800/60">
          <MapPin className="h-4 w-4" /> After approval, your CTA can open an internal page (Donate, Food, etc.) or your own https website.
        </p>
      </section>
    </PublicLayout>
  );
}
