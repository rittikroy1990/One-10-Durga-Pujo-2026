import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Printer, MapPin, ExternalLink } from "lucide-react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { Button } from "../../components/ui";

const CARD_FILES = [
  { file: "01-cover-subscribe.png", title: "Cover · Subscribe", titleBn: "কভার · চাঁদা" },
  { file: "02-sasthi-saptami.png", title: "Sasthi & Saptami", titleBn: "ষষ্ঠী ও সপ্তমী" },
  { file: "03-ashtami-sandhi.png", title: "Ashtami & Sandhi", titleBn: "অষ্টমী ও সন্ধিপুজো" },
  { file: "04-navami-dashami.png", title: "Navami & Dashami", titleBn: "নবমী ও দশমী" },
];

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
        <p className="text-xs uppercase tracking-[0.3em] text-gold-400">Door-to-door campaign</p>
        <h1 className="mt-2 font-display text-5xl text-ivory-100">পুজো নির্ঘণ্ট কার্ড</h1>
        <p className="mt-3 max-w-2xl text-ivory-100/70">
          Complete Nirghonto for One10 Durgotsav 2026 — print A5 or share on WhatsApp while collecting subscriptions.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ivory-100/65">
          {datesLabel && <span className="text-gold-400">{datesLabel}</span>}
          {venue && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-vermilion-400" /> {venue}
            </span>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-3 print:hidden">
          <Link to="/subscribe">
            <Button variant="primary" size="sm" data-testid="nirghanto-subscribe-link">
              Subscribe &amp; Pay <ExternalLink className="h-4 w-4" />
            </Button>
          </Link>
          <Link to="/events">
            <Button variant="outline" size="sm" data-testid="nirghanto-events-link">Programme</Button>
          </Link>
          <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="print-cards-btn">
            <Printer className="h-4 w-4" /> Print all
          </Button>
        </div>

        {meta?.note_bn && (
          <p className="mt-5 rounded-xl border border-gold-500/25 bg-brown-700/40 px-4 py-3 text-sm text-ivory-100/75">
            {meta.note_bn}
          </p>
        )}

        {/* Equal-height aligned card gallery */}
        <div
          className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-2"
          data-testid="campaign-card-grid"
        >
          {CARD_FILES.map((c, i) => (
            <figure
              key={c.file}
              className="flex h-full flex-col overflow-hidden rounded-2xl border border-gold-500/25 bg-brown-900/50"
            >
              <div className="flex aspect-[5/7] w-full items-center justify-center bg-[#140e0c] p-3">
                <img
                  src={`/campaign-cards/${c.file}`}
                  alt={`${c.titleBn} — One10 Durgotsav 2026 Nirghonto card ${i + 1}`}
                  className="h-full w-full object-contain object-center"
                  data-testid={`card-img-${i + 1}`}
                />
              </div>
              <figcaption className="mt-auto flex items-center justify-between gap-3 border-t border-gold-500/15 px-4 py-3 text-sm text-ivory-100/70 print:hidden">
                <span>
                  <span className="font-semibold text-ivory-100">{i + 1}/4</span>
                  <span className="mx-1.5 text-ivory-100/30">|</span>
                  {c.titleBn}
                </span>
                <a
                  href={`/campaign-cards/${c.file}`}
                  download={c.file}
                  className="inline-flex items-center gap-1.5 text-gold-400 hover:underline"
                  data-testid={`download-${c.file}`}
                >
                  <Download className="h-4 w-4" /> PNG
                </a>
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
