import React, { useEffect, useState } from "react";
import { MapPin, CalendarDays } from "lucide-react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";

export default function Events() {
  const [events, setEvents] = useState([]);
  const [venue, setVenue] = useState("");
  const [anns, setAnns] = useState([]);

  useEffect(() => {
    api.get("/events").then((r) => { setEvents(r.data.items || []); setVenue(r.data.venue || ""); });
    api.get("/announcements").then((r) => setAnns(r.data.items || []));
  }, []);

  return (
    <PublicLayout>
      <div className="mx-auto max-w-5xl px-5 py-14">
        <h1 className="font-display text-5xl text-ivory-100">Programme & Venue</h1>
        <div className="mt-3 flex items-center gap-2 text-ivory-100/70">
          <MapPin className="h-5 w-5 text-vermilion-400" /> {venue}
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <div key={e.id} className="rounded-2xl border border-gold-500/25 bg-brown-700/50 p-5" data-testid={`event-${e.cost_centre}`}>
              <CalendarDays className="h-6 w-6 text-gold-400" />
              <h3 className="mt-2 font-display text-2xl text-ivory-100">{e.name}</h3>
              <div className="mt-1 text-sm text-ivory-100/60">Dates: {e.dates || "To be confirmed"}</div>
            </div>
          ))}
        </div>

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
