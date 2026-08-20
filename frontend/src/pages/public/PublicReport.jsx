import React, { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { formatDateIST } from "../../lib/utils";

export default function PublicReport() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/public-report").then((r) => setData(r.data)); }, []);

  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl px-5 py-16">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-8 w-8 text-gold-400" />
          <h1 className="font-display text-5xl text-ivory-100">Public Transparency</h1>
        </div>
        <p className="mt-2 text-ivory-100/70">A committee-approved, privacy-safe summary. It never includes resident names, mobile numbers or flat-level payment status.</p>

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
