import React from "react";
import { Link } from "react-router-dom";
import { FileText, Wallet, Clock } from "lucide-react";
import { API } from "../lib/api";
import { Button } from "./ui";
import { formatPaise, formatDateIST } from "../lib/utils";

const STATE_TONE = {
  ready: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  part_paid: "bg-amber-50 text-amber-900 ring-amber-500/30",
  awaiting: "bg-amber-50 text-amber-900 ring-amber-500/30",
  under_review: "bg-sky-50 text-sky-900 ring-sky-500/25",
  problem: "bg-red-50 text-vermilion-600 ring-red-300",
  not_open: "bg-slate-100 text-slate-700 ring-slate-300",
  cancelled: "bg-slate-100 text-slate-500 ring-slate-300",
  expired: "bg-slate-100 text-slate-500 ring-slate-300",
};

export default function FoodOrdersList({ orders, compact = false }) {
  if (!orders?.length) return null;
  return (
    <div className="space-y-3" data-testid="food-orders-list">
      {orders.map((o) => {
        const closed = o.state === "cancelled" || o.state === "expired";
        return (
          <div
            key={o.id}
            className={`rounded-xl border border-sun-400/30 bg-white p-3.5 text-sm ${closed ? "opacity-60" : ""}`}
            data-testid={`food-order-${o.ref}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-brown-900">
                Order {o.ref} <span className="font-normal text-brown-800/55">· {formatDateIST(o.created_at)}</span>
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${STATE_TONE[o.state] || STATE_TONE.not_open}`}>
                {o.state_label}
              </span>
            </div>
            {!compact || !closed ? (
              <p className="mt-1.5 text-xs leading-relaxed text-brown-800/75">
                {o.lines.map((l, i) => (
                  <span key={i}>
                    {i ? " · " : ""}
                    {l.day_label} {l.meal_label}{l.diet_label ? ` (${l.diet_label})` : ""} ×{l.heads}
                    {l.free ? <span className="text-emerald-700"> ({l.free} complimentary)</span> : null}
                  </span>
                ))}
              </p>
            ) : null}
            {!closed && o.total_amount_paise > 0 ? (
              <p className="mt-1 text-xs text-brown-800/60">
                Paid {formatPaise(o.amount_paid_paise)} of {formatPaise(o.total_amount_paise)}
                {o.amount_due_paise > 0 ? <> · <b className="text-vermilion-600">{formatPaise(o.amount_due_paise)} due</b></> : null}
              </p>
            ) : null}

            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {o.voucher_token ? (
                <a href={`${API}/food/voucher/${o.voucher_token}/pdf`} target="_blank" rel="noreferrer">
                  <Button variant="primary" size="sm" data-testid={`food-order-voucher-${o.ref}`}>
                    <FileText className="h-3.5 w-3.5" /> Download voucher
                  </Button>
                </a>
              ) : null}
              {o.status_token && (o.state === "awaiting" || o.state === "part_paid") ? (
                <Link to={`/payment/status?token=${encodeURIComponent(o.status_token)}`}>
                  <Button variant="primary" size="sm" data-testid={`food-order-pay-${o.ref}`}>
                    <Wallet className="h-3.5 w-3.5" />
                    {o.state === "part_paid" ? `Pay balance ${formatPaise(o.amount_due_paise)}` : `Pay ${formatPaise(o.amount_due_paise)}`}
                  </Button>
                </Link>
              ) : null}
              {o.status_token && o.state === "under_review" ? (
                <Link to={`/payment/status?token=${encodeURIComponent(o.status_token)}`}>
                  <Button variant="subtle" size="sm"><Clock className="h-3.5 w-3.5" /> View payment status</Button>
                </Link>
              ) : null}
              {o.coupons_given ? <span className="text-xs font-medium text-emerald-700">✓ Coupons collected</span> : null}
            </div>
            {o.state === "part_paid" ? (
              <p className="mt-2 text-[11px] text-brown-800/50">
                Pay the balance to get this order&apos;s food voucher.
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
