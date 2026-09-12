import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { MapPin, CalendarDays, Sparkles } from "lucide-react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";

export default function Events() {
  const [events, setEvents] = useState([]);
  const [venue, setVenue] = useState("");
  const [datesLabel, setDatesLabel] = useState("");
  const [programme, setProgramme] = useState([]);
  const [programmeSource, setProgrammeSource] = useState("");
  const [anns, setAnns] = useState([]);

  useEffect(() => {
    api.get("/events").then((r) => {
      setEvents(r.data.items || []);
      setVenue(r.data.venue || "");
      setDatesLabel(r.data.dates_label || "");
      setProgramme(r.data.programme || []);
      setProgrammeSource(r.data.programme_source || "");
    }).catch(() => {});
    api.get("/announcements").then((r) => setAnns(r.data.items || [])).catch(() => {});
  }, []);

  return (
    <PublicLayout>
      <div className="mx-auto max-w-5xl px-5 pb-14 pt-24 sm:pt-28">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-vermilion-500">Durgotsav 2026</p>
        <h1 className="mt-2 font-display text-4xl text-brown-900 sm:text-5xl">Programme & Venue</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-brown-800/75">
          {venue && (
            <span className="inline-flex items-center gap-2">
              <MapPin className="h-5 w-5 text-vermilion-500" /> {venue}
            </span>
          )}
          {datesLabel && (
            <span className="inline-flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-vermilion-500" /> {datesLabel}
            </span>
          )}
        </div>

        {programme.length > 0 ? (
          <section className="mt-10" data-testid="ritual-calendar">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-3xl text-brown-900">Ritual calendar</h2>
                <p className="mt-1 text-sm text-brown-800/60">
                  Sasthi through Dashami — day-by-day as confirmed for One10.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {programmeSource && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-sun-400/40 bg-sun-50 px-3 py-1 text-xs text-brown-800/70">
                    <Sparkles className="h-3.5 w-3.5 text-vermilion-500" /> {programmeSource}
                  </span>
                )}
                <Link
                  to="/nirghanto"
                  className="rounded-full border border-vermilion-500/40 bg-vermilion-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-vermilion-600 hover:bg-vermilion-500/20"
                  data-testid="link-nirghanto-cards"
                >
                  Download PDF cards
                </Link>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {programme.map((day, i) => (
                <motion.div
                  key={day.id}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05, duration: 0.45 }}
                  className="rounded-2xl border border-sun-400/35 bg-white p-5 shadow-sm"
                  data-testid={`programme-${day.id}`}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-4xl leading-none text-vermilion-500">{day.day}</span>
                    <span className="text-sm uppercase tracking-wider text-brown-800/55">{day.month_label}</span>
                  </div>
                  <div className="mt-1 text-xs uppercase tracking-[0.2em] text-brown-800/45">{day.weekday}</div>
                  <h3 className="mt-3 font-display text-2xl text-brown-900">{day.title_bn || day.title || day.tithi}</h3>
                  <div className="mt-1 text-sm text-brown-800/60">{day.tithi}{day.bengali_date ? ` · ${day.bengali_date}` : ""}</div>
                  {day.nirghanto?.highlights?.[0] && (
                    <div className="mt-2 text-xs text-brown-800/70">{day.nirghanto.highlights[0]}</div>
                  )}
                  {day.nirghanto?.sandhi_start && (
                    <div className="mt-1 text-xs font-semibold text-vermilion-600">
                      Sandhi {day.nirghanto.sandhi_start}–{day.nirghanto.sandhi_end}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </section>
        ) : (
          <div className="mt-10 rounded-2xl border border-sun-400/35 bg-white p-6 text-sm text-brown-800/70 shadow-sm">
            Programme timings will appear here once published. Meanwhile download the Nirghonto cards from{" "}
            <Link to="/nirghanto" className="font-semibold text-vermilion-600 underline">/nirghanto</Link>.
          </div>
        )}

        {events.length > 0 && (
          <section className="mt-14">
            <h2 className="font-display text-3xl text-brown-900">Season events</h2>
            <p className="mt-1 text-sm text-brown-800/60">Subscription covers the full One10 festive season.</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((e) => (
                <div key={e.id} className="rounded-2xl border border-sun-400/35 bg-white p-5 shadow-sm" data-testid={`event-${e.cost_centre}`}>
                  <CalendarDays className="h-6 w-6 text-vermilion-500" />
                  <h3 className="mt-2 font-display text-2xl text-brown-900">{e.name}</h3>
                  <div className="mt-1 text-sm text-brown-800/60">Dates: {e.dates || "To be confirmed"}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {anns.length > 0 && (
          <div className="mt-12">
            <h2 className="font-display text-3xl text-brown-900">Announcements</h2>
            <ul className="mt-4 space-y-3">
              {anns.map((a) => (
                <li key={a.id} className="rounded-xl border border-sun-400/30 bg-white p-4 shadow-sm">
                  <div className="font-semibold text-brown-900">{a.title}</div>
                  <div className="text-sm text-brown-800/65">{a.body}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
