import React, { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import {
  FootfallDayChart,
  FootfallPrizeLadder,
  FootfallShareButton,
} from "../../components/Footfall";
import { formatDateIST } from "../../lib/utils";

export default function PublicReport() {
  const [data, setData] = useState(null);
  const [footfall, setFootfall] = useState(null);
  useEffect(() => {
    api.get("/public-report").then((r) => setData(r.data)).catch(() => {});
    api.get("/footfall").then((r) => setFootfall(r.data)).catch(() => {});
  }, []);

  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl px-5 py-16">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-8 w-8 text-gold-400" />
          <h1 className="font-display text-5xl text-ivory-100">Public Transparency</h1>
        </div>
        <p className="mt-2 text-ivory-100/70">A committee-approved, privacy-safe summary. It never includes resident names, mobile numbers or flat-level payment status.</p>

        <section className="mt-10 rounded-2xl border border-gold-500/25 bg-ivory-100 p-6 text-brown-900 shadow-sm" data-testid="transparency-footfall">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-vermilion-500">Digital pandal meter</p>
              <h2 className="mt-1 font-display text-3xl">Live visit counter</h2>
            </div>
            <FootfallShareButton />
          </div>
          <p className="mt-3 text-sm text-brown-800/70">
            Every page visit since launch counts. Hit milestones to unlock festive prizes for lucky pandal entries.
            {footfall?.inception_date ? ` From ${footfall.inception_date}.` : ""}
          </p>
          {footfall ? (
            <>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {[
                  ["Today", footfall.today_label || footfall.today],
                  ["Last 7 days", footfall.last7_label || footfall.last7],
                  ["All-time", footfall.total_label || footfall.total],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-xl border border-brown-800/10 bg-white p-4">
                    <div className="text-[10px] uppercase tracking-wider text-brown-800/50">{l}</div>
                    <div className="mt-1 font-display text-2xl tabular-nums">{v}</div>
                  </div>
                ))}
              </div>
              {footfall.next_prize ? (
                <p className="mt-4 text-sm text-brown-800/70">
                  Next prize at <span className="font-semibold tabular-nums text-vermilion-600">{footfall.next_prize.at_label}</span>
                  {" — "}
                  <span className="font-semibold">{footfall.next_prize.title}</span>: {footfall.next_prize.prize}
                </p>
              ) : null}
              <FootfallPrizeLadder className="mt-5" prizes={footfall.prizes} total={footfall.total} prizeNote={footfall.prize_note} />
              <h3 className="mb-3 mt-8 font-display text-xl">Daily visits</h3>
              <FootfallDayChart series={footfall.series || []} />
            </>
          ) : (
            <p className="mt-4 text-sm text-brown-800/50">Loading visit meter…</p>
          )}
        </section>

        {!data?.published && (
          <div className="mt-10 rounded-2xl border border-gold-500/25 bg-brown-700/40 p-8 text-center text-ivory-100/70" data-testid="transparency-empty">
            The public transparency report has not been published yet. It will appear here after the committee approves it.
          </div>
        )}

        {data?.published && (
          <div className="mt-8 space-y-4" data-testid="transparency-report">
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ["Subscription collected", data.report.subscription_total],
                ["Voluntary donations", data.report.donation_total],
                ["Sponsorship (cash)", data.report.sponsor_total],
                ["Closing balance", data.report.closing_balance],
              ].map(([l, v]) => (
                <div key={l} className="rounded-xl border border-gold-500/25 bg-ivory-100 p-5 text-brown-900">
                  <div className="text-xs uppercase tracking-wider text-brown-800/50">{l}</div>
                  <div className="mt-1 font-display text-3xl">{v}</div>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-gold-500/25 bg-ivory-100 p-5 text-brown-900">
              <div className="mb-2 text-xs uppercase tracking-wider text-brown-800/50">Major expense categories</div>
              <ul className="divide-y divide-brown-800/10">
                {Object.entries(data.report.expenses_by_category || {}).map(([k, v]) => (
                  <li key={k} className="flex justify-between py-2 text-sm"><span>{k}</span><span className="font-semibold">{v}</span></li>
                ))}
              </ul>
            </div>
            {data.report.note && <p className="text-sm text-ivory-100/70">Committee note: {data.report.note}</p>}
            <p className="text-xs text-ivory-100/40">Published {formatDateIST(data.report.published_at)}</p>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
