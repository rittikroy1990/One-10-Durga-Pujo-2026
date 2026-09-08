import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Printer, MapPin, ExternalLink, FileText } from "lucide-react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { Button } from "../../components/ui";

const CARD_FILES = [
  {
    id: "cover",
    png: "01-cover-subscribe.png",
    pdf: "01-cover-subscribe.pdf",
    title: "Cover · Subscribe",
    titleBn: "কভার · চাঁদা",
  },
  {
    id: "sasthi",
    png: "02-sasthi-saptami.png",
    pdf: "02-sasthi-saptami.pdf",
    title: "Sasthi & Saptami",
    titleBn: "ষষ্ঠী ও সপ্তমী",
  },
  {
    id: "ashtami",
    png: "03-ashtami-sandhi.png",
    pdf: "03-ashtami-sandhi.pdf",
    title: "Ashtami & Sandhi",
    titleBn: "অষ্টমী ও সন্ধিপুজো",
  },
  {
    id: "navami",
    png: "04-navami-dashami.png",
    pdf: "04-navami-dashami.pdf",
    title: "Navami & Dashami",
    titleBn: "নবমী ও দশমী",
  },
];

const ALL_PDF = "one10-durgotsav-2026-nirghonto-cards.pdf";

export default function Nirghanto() {
  const [meta, setMeta] = useState(null);
  const [programme, setProgramme] = useState([]);
  const [venue, setVenue] = useState("");
  const [datesLabel, setDatesLabel] = useState("");

  useEffect(() => {
    api.get("/events").then((r) => {
      setProgramme(r.data.programme || []);
      setMeta(r.data.nirghanto || null);
      setVenue(r.data.venue || "");
      setDatesLabel(r.data.dates_label || "");
    }).catch(() => {});
  }, []);

  return (
    <PublicLayout>
      <div className="mx-auto max-w-6xl px-5 py-14">
        <p className="text-xs uppercase tracking-[0.3em] text-gold-400">Door-to-door campaign · one10events.in</p>
        <h1 className="mt-2 font-display text-5xl text-ivory-100">পুজো নির্ঘণ্ট কার্ড</h1>
        <p className="mt-3 max-w-2xl text-ivory-100/70">
          Complete Nirghonto for One10 Durgotsav 2026 — download A5 PDFs for printing, or PNG for WhatsApp.
        </p>
        <p className="mt-2 text-sm text-gold-400">
          <a href="https://one10events.in/nirghanto" className="underline hover:text-ivory-100">https://one10events.in/nirghanto</a>
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ivory-100/65">
          {datesLabel && <span className="text-gold-400">{datesLabel}</span>}
          {venue && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-vermilion-400" /> {venue}
            </span>
          )}
        </div>

        {/* Primary download actions */}
        <div className="mt-6 rounded-2xl border border-gold-500/30 bg-brown-700/40 p-5 print:hidden" data-testid="pdf-download-panel">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl text-ivory-100">Download PDFs</h2>
              <p className="mt-1 text-sm text-ivory-100/65">A5 print-ready · প্রাচীন পঞ্জিকা · Thakurmasai confirmed</p>
            </div>
            <a href={`/campaign-cards/${ALL_PDF}`} download={ALL_PDF}>
              <Button variant="primary" size="sm" data-testid="download-all-pdf-btn">
                <FileText className="h-4 w-4" /> Download all 4 (PDF)
              </Button>
            </a>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {CARD_FILES.map((c, i) => (
              <a
                key={c.id}
                href={`/campaign-cards/${c.pdf}`}
                download={c.pdf}
                className="flex items-center justify-between gap-3 rounded-xl border border-gold-500/20 bg-brown-900/40 px-4 py-3 text-sm text-ivory-100 transition-colors hover:border-gold-500/50 hover:bg-brown-800/60"
                data-testid={`download-pdf-${c.id}`}
              >
                <span>
                  <span className="font-semibold text-gold-400">{i + 1}.</span> {c.titleBn}
                  <span className="ml-2 text-ivory-100/45">{c.title}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-vermilion-400">
                  <Download className="h-3.5 w-3.5" /> PDF
                </span>
              </a>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/subscribe">
              <Button variant="outline" size="sm" data-testid="nirghanto-subscribe-link">
                Subscribe &amp; Pay <ExternalLink className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/events">
              <Button variant="outline" size="sm" data-testid="nirghanto-events-link">Programme</Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="print-cards-btn">
              <Printer className="h-4 w-4" /> Print page
            </Button>
          </div>
        </div>

        {meta?.note_bn && (
          <p className="mt-5 rounded-xl border border-gold-500/25 bg-brown-700/40 px-4 py-3 text-sm text-ivory-100/75">
            {meta.note_bn}
          </p>
        )}

        <div
          className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2"
          data-testid="campaign-card-grid"
        >
          {CARD_FILES.map((c, i) => (
            <figure
              key={c.id}
              className="flex h-full flex-col overflow-hidden rounded-2xl border border-gold-500/25 bg-brown-900/50"
            >
              <div className="flex aspect-[5/7] w-full items-center justify-center bg-[#140e0c] p-3">
                <img
                  src={`/campaign-cards/${c.png}`}
                  alt={`${c.titleBn} — One10 Durgotsav 2026 Nirghonto card ${i + 1}`}
                  className="h-full w-full object-contain object-center"
                  data-testid={`card-img-${i + 1}`}
                />
              </div>
              <figcaption className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-gold-500/15 px-4 py-3 text-sm text-ivory-100/70 print:hidden">
                <span>
                  <span className="font-semibold text-ivory-100">{i + 1}/4</span>
                  <span className="mx-1.5 text-ivory-100/30">|</span>
                  {c.titleBn}
                </span>
                <span className="flex items-center gap-3">
                  <a
                    href={`/campaign-cards/${c.pdf}`}
                    download={c.pdf}
                    className="inline-flex items-center gap-1.5 font-semibold text-vermilion-400 hover:underline"
                    data-testid={`card-pdf-${c.id}`}
                  >
                    <FileText className="h-4 w-4" /> PDF
                  </a>
                  <a
                    href={`/campaign-cards/${c.png}`}
                    download={c.png}
                    className="inline-flex items-center gap-1.5 text-gold-400 hover:underline"
                    data-testid={`card-png-${c.id}`}
                  >
                    <Download className="h-4 w-4" /> PNG
                  </a>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>

        {programme.length > 0 && (
          <section className="mt-16 print:hidden">
            <h2 className="font-display text-3xl text-ivory-100">Day-by-day timings</h2>
            <p className="mt-1 text-sm text-ivory-100/60">Primary: {meta?.primary_label || "প্রাচীন পঞ্জিকা"}</p>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {programme.map((day) => (
                <article
                  key={day.id}
                  className="rounded-2xl border border-gold-500/20 bg-brown-700/40 p-5"
                  data-testid={`nirghanto-${day.id}`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-display text-2xl text-ivory-100">
                      {day.title_bn || day.title}
                    </h3>
                    <div className="text-sm text-gold-400">
                      {day.day} {day.month_label} · {day.weekday}
                    </div>
                  </div>
                  <div className="mt-1 text-sm text-ivory-100/55">
                    {day.tithi}
                    {day.bengali_date ? ` · ${day.bengali_date}` : ""}
                  </div>
                  {day.nirghanto && (
                    <ul className="mt-3 space-y-1.5 text-sm text-ivory-100/75">
                      {(day.nirghanto.highlights || []).map((h) => (
                        <li key={h}>• {h}</li>
                      ))}
                      {day.nirghanto.sandhi_start && (
                        <li className="font-semibold text-vermilion-400">
                          • সন্ধিপুজো {day.nirghanto.sandhi_start} – {day.nirghanto.sandhi_end}
                        </li>
                      )}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </PublicLayout>
  );
}
