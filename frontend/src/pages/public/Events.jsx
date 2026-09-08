import React, { useEffect, useState } from "react";
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
    });
    api.get("/announcements").then((r) => setAnns(r.data.items || []));
  }, []);

  return (
    <PublicLayout>
      <div className="mx-auto max-w-5xl px-5 py-14">
        <p className="text-xs uppercase tracking-[0.3em] text-gold-400">Durgotsav 2026</p>
        <h1 className="mt-2 font-display text-5xl text-ivory-100">Programme & Venue</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-ivory-100/70">
          {venue && (
            <span className="inline-flex items-center gap-2">
              <MapPin className="h-5 w-5 text-vermilion-400" /> {venue}
            </span>
          )}
          {datesLabel && (
            <span className="inline-flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-gold-400" /> {datesLabel}
            </span>
          )}
        </div>

        {programme.length > 0 && (
          <section className="mt-10" data-testid="ritual-calendar">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-3xl text-ivory-100">Ritual calendar</h2>
                <p className="mt-1 text-sm text-ivory-100/60">
                  Sasthi through Dashami — day-by-day as confirmed for One10.
                </p>
              </div>
              {programmeSource && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-500/30 bg-brown-900/40 px-3 py-1 text-xs text-gold-400">
                  <Sparkles className="h-3.5 w-3.5" /> {programmeSource}
                </span>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {programme.map((day, i) => (
                <motion.div
                  key={day.id}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05, duration: 0.45 }}
                  className="rounded-2xl border border-gold-500/25 bg-brown-700/50 p-5"
                  data-testid={`programme-${day.id}`}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-4xl leading-none text-gold-400">{day.day}</span>
                    <span className="text-sm uppercase tracking-wider text-ivory-100/55">{day.month_label}</span>
                  </div>
                  <div className="mt-1 text-xs uppercase tracking-[0.2em] text-ivory-100/45">{day.weekday}</div>
                  <h3 className="mt-3 font-display text-2xl text-ivory-100">{day.title || day.tithi}</h3>
                  {day.title && day.title !== day.tithi && (
                    <div className="mt-1 text-sm text-ivory-100/60">{day.tithi}</div>
                  )}
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {events.length > 0 && (
          <section className="mt-14">
            <h2 className="font-display text-3xl text-ivory-100">Season events</h2>
            <p className="mt-1 text-sm text-ivory-100/60">Subscription covers the full One10 festive season.</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((e) => (
                <div key={e.id} className="rounded-2xl border border-gold-500/25 bg-brown-700/50 p-5" data-testid={`event-${e.cost_centre}`}>
                  <CalendarDays className="h-6 w-6 text-gold-400" />
                  <h3 className="mt-2 font-display text-2xl text-ivory-100">{e.name}</h3>
                  <div className="mt-1 text-sm text-ivory-100/60">Dates: {e.dates || "To be confirmed"}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {anns.length > 0 && (
          <div className="mt-12">
            <h2 className="font-display text-3xl text-ivory-100">Announcements</h2>
            <ul className="mt-4 space-y-3">
              {anns.map((a) => (
                <li key={a.id} className="rounded-xl border border-gold-500/20 bg-brown-700/40 p-4">
                  <div className="font-semibold text-ivory-100">{a.title}</div>
                  <div className="text-sm text-ivory-100/65">{a.body}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
