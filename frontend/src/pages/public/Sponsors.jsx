import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, ArrowLeft, Handshake, Building2, Users, Megaphone,
  Mail, Phone, Landmark, X, Download, BookOpen,
} from "lucide-react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { Button } from "../../components/ui";
import { formatPaise } from "../../lib/utils";
import {
  PREVIOUS_SPONSORS,
  SPONSORSHIP_DECK_PAGES,
  SPONSORSHIP_DECK_PDF,
} from "../../data/previousSponsors";

function PackageCard({ pkg }) {
  const price = pkg.amount_label || (pkg.amount_paise != null ? formatPaise(pkg.amount_paise) : "—");
  return (
    <div
      className="rounded-2xl border border-sun-400/30 bg-white p-5 shadow-sm"
      data-testid={`sponsor-pkg-${pkg.code}`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-2xl text-brown-900">{pkg.name}</h3>
        <div className="shrink-0 font-display text-xl text-vermilion-600">{price}</div>
      </div>
      <ul className="mt-3 space-y-1.5 text-sm text-brown-800/75">
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

function DeckLightbox({ open, pageIndex, onClose, onPrev, onNext }) {
  const page = SPONSORSHIP_DECK_PAGES[pageIndex];
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, onPrev, onNext]);

  if (!open || !page) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-brown-900/90 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Sponsorship deck viewer"
      data-testid="sponsorship-deck-lightbox"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white sm:px-6">
        <div className="text-sm font-medium">
          Sponsorship proposal · {pageIndex + 1} / {SPONSORSHIP_DECK_PAGES.length}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={SPONSORSHIP_DECK_PDF}
            download
            className="inline-flex items-center gap-1.5 rounded-full border border-white/25 px-3 py-1.5 text-xs font-semibold hover:bg-white/10"
          >
            <Download className="h-3.5 w-3.5" /> PDF
          </a>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full border border-white/25 hover:bg-white/10"
            aria-label="Close deck"
            data-testid="deck-close-btn"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4 sm:px-10">
        <button
          type="button"
          onClick={onPrev}
          className="absolute left-2 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/90 text-brown-900 shadow sm:left-4"
          aria-label="Previous page"
          data-testid="deck-prev-btn"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <img
          src={page.src}
          alt={page.alt}
          className="max-h-[calc(100vh-7rem)] w-auto max-w-full object-contain shadow-2xl"
          data-testid="deck-page-img"
        />
        <button
          type="button"
          onClick={onNext}
          className="absolute right-2 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/90 text-brown-900 shadow sm:right-4"
          aria-label="Next page"
          data-testid="deck-next-btn"
        >
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

export default function Sponsors() {
  const [cfg, setCfg] = useState(null);
  const [deckOpen, setDeckOpen] = useState(false);
  const [deckPage, setDeckPage] = useState(0);

  useEffect(() => {
    api.get("/config").then((r) => setCfg(r.data)).catch(() => {});
  }, []);

  const openDeck = useCallback((at = 0) => {
    setDeckPage(at);
    setDeckOpen(true);
  }, []);
  const closeDeck = useCallback(() => setDeckOpen(false), []);
  const prevPage = useCallback(
    () => setDeckPage((i) => (i <= 0 ? SPONSORSHIP_DECK_PAGES.length - 1 : i - 1)),
    []
  );
  const nextPage = useCallback(
    () => setDeckPage((i) => (i >= SPONSORSHIP_DECK_PAGES.length - 1 ? 0 : i + 1)),
    []
  );

  const sp = cfg?.sponsorship || {};
  const org = cfg?.organisation || {};
  const bank = org.bank_account || {};
  const gallery = sp.gallery || [];

  return (
    <PublicLayout>
      <section className="relative overflow-hidden border-b border-sun-400/25">
        <div className="absolute inset-0">
          <img src="/images/campaign/hero-cover.jpg" alt="" className="h-full w-full object-cover opacity-30" />
          <div className="absolute inset-0 bg-gradient-to-r from-sky-50/95 via-sun-50/85 to-sky-50/50" />
          <div className="absolute inset-0 bg-gradient-to-t from-sky-50 via-transparent to-sun-50/40" />
        </div>
        <div className="relative mx-auto max-w-7xl px-5 py-20 md:py-28">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <p className="text-xs uppercase tracking-[0.3em] text-vermilion-600">One10 Durga Puja 2026</p>
            <h1 className="mt-2 font-display text-5xl text-brown-900 sm:text-6xl">Sponsorship</h1>
            <p className="mt-4 max-w-2xl text-lg text-brown-800/75">
              {sp.tagline || "Partner with culture. Connect with community. Create lasting recall."}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={`mailto:${org.contact_email || "one10eventgroup@gmail.com"}`}>
                <Button variant="primary" size="lg">
                  Discuss partnership <ArrowRight className="h-5 w-5" />
                </Button>
              </a>
              <Button
                variant="outline"
                size="lg"
                type="button"
                data-testid="hero-view-deck-btn"
                onClick={() => openDeck(0)}
              >
                <BookOpen className="h-5 w-5" /> View sponsorship deck
              </Button>
              <Link to="/donate">
                <Button variant="outline" size="lg">Donate</Button>
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
            <div key={x.t} className="rounded-2xl border border-sun-400/30 bg-white p-5 shadow-sm">
              <x.icon className="h-6 w-6 text-vermilion-500" />
              <h3 className="mt-3 font-display text-2xl text-brown-900">{x.t}</h3>
              <p className="mt-1 text-sm text-brown-800/65">{x.d}</p>
            </div>
          ))}
        </div>
      </section>

      {gallery.length > 0 && (
        <section className="border-y border-sun-400/25 bg-sun-50 py-10">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-3 px-5 md:grid-cols-4">
            {gallery.slice(0, 8).map((src) => (
              <img key={src} src={src} alt="" className="aspect-[4/3] w-full rounded-xl object-cover" />
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
              <div
                key={a.code}
                className="flex items-center justify-between rounded-xl border border-sun-400/30 bg-white px-4 py-3 shadow-sm"
              >
                <span className="text-sm text-brown-800/85">{a.name}</span>
                <span className="font-display text-lg text-vermilion-600">{formatPaise(a.amount_paise)}</span>
              </div>
            ))}
          </div>
          <p className="mt-8 text-sm text-brown-800/60">
            Custom sponsorship options can be curated to suit your brand objectives.
          </p>
        </section>
      )}

      {/* #9 Sponsorship deck */}
      <section id="deck" className="scroll-mt-24 border-y border-sun-400/25 bg-gradient-to-b from-white to-sun-50">
        <div className="mx-auto max-w-7xl px-5 py-14">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-vermilion-500">Rate card deck</p>
          <h2 className="mt-2 font-display text-4xl text-brown-900">Sponsorship proposal</h2>
          <p className="mt-2 max-w-2xl text-sm text-brown-800/65">
            Browse the 14-page partnership deck — packages, reach and brand touchpoints.
          </p>
          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center">
            <button
              type="button"
              onClick={() => openDeck(0)}
              className="group relative overflow-hidden border border-sun-400/30 bg-white text-left shadow-sm transition hover:border-vermilion-400/40"
              data-testid="deck-preview-open"
            >
              <img
                src={SPONSORSHIP_DECK_PAGES[0].src}
                alt="Sponsorship proposal cover"
                className="aspect-[3/4] w-full object-cover object-top sm:aspect-[4/3]"
              />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-brown-900/80 to-transparent px-4 py-5 text-sm font-semibold text-white">
                Open page 1 of {SPONSORSHIP_DECK_PAGES.length}
              </span>
            </button>
            <div>
              <div className="flex flex-wrap gap-3">
                <Button variant="primary" size="lg" type="button" onClick={() => openDeck(0)} data-testid="deck-browse-btn">
                  <BookOpen className="h-5 w-5" /> Browse pages
                </Button>
                <a href={SPONSORSHIP_DECK_PDF} download>
                  <Button variant="outline" size="lg" type="button" data-testid="deck-download-pdf">
                    <Download className="h-5 w-5" /> Download PDF
                  </Button>
                </a>
              </div>
              <div className="mt-6 grid grid-cols-4 gap-2 sm:grid-cols-7">
                {SPONSORSHIP_DECK_PAGES.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => openDeck(i)}
                    className="overflow-hidden border border-sun-400/25 bg-white transition hover:border-vermilion-400/50"
                    aria-label={`Open deck page ${i + 1}`}
                  >
                    <img src={p.src} alt="" className="aspect-[3/4] w-full object-cover object-top" loading="lazy" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* #8 Previous sponsors */}
      <section className="border-b border-sun-400/25 bg-sun-50/80" data-testid="previous-sponsors">
        <div className="mx-auto max-w-7xl px-5 py-14">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-vermilion-500">Past partners</p>
          <h2 className="mt-2 font-display text-4xl text-brown-900">Previous sponsors</h2>
          <p className="mt-2 max-w-xl text-sm text-brown-800/65">
            Brands and institutions that stood with One 10 Durgotsav in earlier years.
          </p>
          <div className="mt-8 grid grid-cols-2 items-center gap-x-6 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {PREVIOUS_SPONSORS.map((s) => (
              <div key={s.id} className="flex flex-col items-center gap-2 text-center" data-testid={`sponsor-logo-${s.id}`}>
                <img
                  src={s.src}
                  alt={s.name}
                  className="h-12 w-full max-w-[140px] object-contain opacity-80 transition hover:opacity-100 sm:h-14"
                  loading="lazy"
                />
                <span className="text-[11px] text-brown-800/50">{s.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-sun-400/30 bg-sun-50">
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
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-vermilion-500" /> {org.contact_email}
              </div>
              <div className="flex items-start gap-2">
                <Phone className="h-4 w-4 mt-0.5 text-vermilion-500" /> {org.contact_phone}
              </div>
              {sp.social?.facebook && (
                <a className="text-sm text-vermilion-600 hover:underline" href={sp.social.facebook} target="_blank" rel="noreferrer">
                  One10 Unified Celebrations on Facebook
                </a>
              )}
            </div>
          </div>
          <div>
            <h2 className="font-display text-3xl text-brown-900">Bank details</h2>
            <div className="mt-4 rounded-xl border border-sun-400/30 bg-white p-5 text-sm text-brown-800/80 shadow-sm">
              <div className="flex items-center gap-2 text-vermilion-600">
                <Landmark className="h-4 w-4" /> {bank.bank || "Bank"}
              </div>
              <div className="mt-2 font-semibold text-brown-900">{bank.account_name}</div>
              <div className="mt-1">A/c No. {bank.account_number}</div>
              <div>IFSC {bank.ifsc}</div>
              {org.pan && <div className="mt-2 text-brown-800/55">PAN {org.pan}</div>}
            </div>
          </div>
        </div>
      </section>

      {deckOpen && (
        <DeckLightbox
          open={deckOpen}
          pageIndex={deckPage}
          onClose={closeDeck}
          onPrev={prevPage}
          onNext={nextPage}
        />
      )}
    </PublicLayout>
  );
}
