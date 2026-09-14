import React, { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { FootfallDayChart, FootfallShareButton } from "../../components/Footfall";

export default function PublicReport() {
  const [footfall, setFootfall] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/footfall").then((r) => setFootfall(r.data)).catch(() => {});
    api.get("/public-report").then((r) => setData(r.data)).catch(() => {});
  }, []);

  const nextLabel =
    footfall?.next_milestone_label ||
    (footfall?.next_prize
      ? `${footfall.next_prize.at_label} — ${footfall.next_prize.title}`
      : null);

  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl px-5 py-14 sm:py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <BarChart3 className="h-7 w-7 text-vermilion-500" />
              <h1 className="font-display text-4xl text-brown-900 sm:text-5xl">
                Digital Pandal Meter
              </h1>
            </div>
            {nextLabel ? (
              <p className="mt-2 text-sm text-brown-800/65">
                Next milestone: <span className="font-semibold text-vermilion-600">{nextLabel}</span>
              </p>
            ) : null}
          </div>
          <FootfallShareButton />
        </div>

        <section
          className="mt-8 rounded-2xl border border-sun-400/30 bg-white p-5 shadow-sm sm:p-6"
          data-testid="pandal-meter"
        >
          {footfall ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["Today", footfall.today_label || footfall.today],
                  ["Last 7 days", footfall.last7_label || footfall.last7],
                  ["All-time", footfall.total_label || footfall.total],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-sun-400/25 bg-sun-50/60 px-4 py-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-brown-800/45">
                      {label}
                    </div>
                    <div className="mt-1 font-display text-2xl tabular-nums text-brown-900 sm:text-3xl">
                      {value ?? "—"}
                    </div>
                  </div>
                ))}
              </div>

              <h2 className="mb-3 mt-7 text-sm font-semibold text-brown-900">Visits by day</h2>
              <FootfallDayChart series={footfall.series || []} />
            </>
          ) : (
            <p className="text-sm text-brown-800/50">Loading meter…</p>
          )}
        </section>

        {data?.published ? (
          <section className="mt-8 space-y-4" data-testid="pandal-finance">
            <h2 className="font-display text-2xl text-brown-900">Finance snapshot</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Subscription collected", data.report.subscription_total],
                ["Voluntary donations", data.report.donation_total],
                ["Sponsorship (cash)", data.report.sponsor_total],
                ["Closing balance", data.report.closing_balance],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-sun-400/25 bg-white p-4 text-brown-900 shadow-sm">
                  <div className="text-[10px] uppercase tracking-wider text-brown-800/50">{label}</div>
                  <div className="mt-1 font-display text-2xl">{value}</div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </PublicLayout>
  );
}
