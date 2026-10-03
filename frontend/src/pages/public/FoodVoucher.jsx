import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2, ShieldCheck, ShieldX, FileText, Ticket, Clock } from "lucide-react";
import api, { API } from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { Button } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { formatPaise, formatDateIST } from "../../lib/utils";

function shortDate(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", weekday: "short" });
}

export default function FoodVoucher() {
  const { token } = useParams();
  const { user } = useAuth() || {};
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get(`/food/voucher/${token}`).then((r) => setData(r.data)).catch(() => setError(true));
  }, [token]);

  const pdfHref = `${API}/food/voucher/${token}/pdf`;

  return (
    <PublicLayout>
      <div className="mx-auto max-w-2xl px-5 py-12" data-testid="food-voucher-page">
        <div className="rounded-3xl border-2 border-gold-500/50 bg-ivory-100 p-1 card-glow">
          <div className="rounded-[20px] border border-gold-500/30 p-6 text-brown-900 sm:p-8">
            {!data && !error && <Loader2 className="mx-auto h-10 w-10 animate-spin text-gold-500" />}
            {error && (
              <div className="text-center">
                <ShieldX className="mx-auto h-14 w-14 text-vermilion-500" />
                <h1 className="mt-3 font-display text-3xl">Voucher not found</h1>
                <p className="text-brown-800/60">This voucher link is invalid.</p>
              </div>
            )}
            {data && data.voided && (
              <div className="text-center" data-testid="food-voucher-void">
                <ShieldX className="mx-auto h-14 w-14 text-vermilion-500" />
                <h1 className="mt-3 font-display text-3xl">Voucher not valid</h1>
                <p className="mt-1 text-brown-800/70">
                  Voucher <b>{data.voucher_no}</b> is no longer valid because its payment was cancelled or is incomplete.
                  Do not issue or serve food against it. Contact the committee.
                </p>
              </div>
            )}
            {data && !data.eligible && !data.voided && (
              <div className="text-center" data-testid="food-voucher-pending">
                <Clock className="mx-auto h-14 w-14 text-gold-500" />
                <h1 className="mt-3 font-display text-3xl">Voucher not ready yet</h1>
                <p className="mt-1 text-brown-800/70">
                  The food voucher is available once the full amount is paid.
                  {data.amount_due_paise ? <> Balance due: <b>{formatPaise(data.amount_due_paise)}</b>.</> : null}
                </p>
              </div>
            )}
            {data && data.eligible && (
              <div data-testid="food-voucher-result">
                <div className="text-center">
                  <div className="text-xs uppercase tracking-[0.3em] text-gold-600">One 10 Durgotsav 2026</div>
                  <h1 className="mt-1 font-display text-4xl">Food Voucher</h1>
                  <div className="mt-1 font-semibold tracking-wide">{data.voucher_no}</div>
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-1.5 text-sm font-semibold text-emerald-800">
                    <ShieldCheck className="h-4 w-4" /> {data.status_label}
                  </div>
                </div>

                <dl className="mt-6 grid grid-cols-2 gap-y-2 text-sm">
                  <dt className="text-brown-800/50">Name</dt>
                  <dd className="text-right font-semibold">{data.name}</dd>
                  <dt className="text-brown-800/50">Tower / Flat</dt>
                  <dd className="text-right font-semibold">{data.tower_name}, Flat {data.flat_number}</dd>
                  <dt className="text-brown-800/50">Mobile</dt>
                  <dd className="text-right font-semibold">{data.mobile_masked}</dd>
                  <dt className="text-brown-800/50">Amount paid</dt>
                  <dd className="text-right font-semibold">{formatPaise(data.amount_paid_paise)}</dd>
                </dl>

                <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                  {[["Total heads", data.totals.heads], ["Free", data.totals.free], ["Paid", data.totals.paid]].map(([label, n]) => (
                    <div key={label} className="rounded-xl border border-sun-400/30 bg-white py-2.5">
                      <div className="font-display text-2xl">{n}</div>
                      <div className="text-[11px] uppercase tracking-wide text-brown-800/50">{label}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 space-y-3">
                  {data.days.map((d) => (
                    <div key={d.day_code} className="rounded-xl border border-sun-400/30 bg-white p-3">
                      <div className="flex items-baseline justify-between">
                        <div className="font-display text-xl">{d.day_label}</div>
                        <div className="text-xs text-brown-800/55">{shortDate(d.date)} · {d.heads} heads</div>
                      </div>
                      <ul className="mt-1.5 divide-y divide-sun-400/20 text-sm">
                        {data.lines.filter((l) => l.day_code === d.day_code).map((l) => (
                          <li key={`${l.meal_code}-${l.item}`} className="flex items-center justify-between gap-3 py-1.5">
                            <span>
                              <span className="font-medium">{l.meal_label}</span>
                              <span className="text-brown-800/55"> · {l.item}{l.diet_label ? ` · ${l.diet_label}` : ""}</span>
                            </span>
                            <span className="shrink-0 text-right tabular-nums">
                              <b>{l.heads}</b>
                              {l.free ? <span className="ml-1 text-xs text-emerald-700">({l.free} free)</span> : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                {data.receipts.length ? (
                  <p className="mt-4 text-xs text-brown-800/60">
                    Receipts: {data.receipts.map((r) => `${r.receipt_no} (${formatPaise(r.amount_paise)})`).join(", ")}
                  </p>
                ) : null}

                <div className={`mt-4 flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm ${data.coupon ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"}`} data-testid="food-voucher-coupon-status">
                  <Ticket className="mt-0.5 h-4 w-4 shrink-0" />
                  {data.coupon
                    ? <span>Coupons already given on {formatDateIST(data.coupon.issued_at)} ({data.coupon.slips} coupons, ref {data.coupon.coupon_no}). Do not give again.</span>
                    : <span>Download or print this voucher and show it to a committee member to collect your food coupons.</span>}
                </div>

                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  <a href={pdfHref} target="_blank" rel="noreferrer">
                    <Button variant="primary" data-testid="food-voucher-download"><FileText className="h-4 w-4" /> Download voucher</Button>
                  </a>
                  {user ? (
                    <Link to={`/admin/food?q=${encodeURIComponent(data.voucher_no || "")}`}>
                      <Button variant="subtle" data-testid="food-voucher-admin-link"><Ticket className="h-4 w-4" /> Mark coupons given (committee)</Button>
                    </Link>
                  ) : null}
                </div>
                <p className="mt-4 text-center text-xs text-brown-800/45">No take-aways for breakfast and Ashtami lunch.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
