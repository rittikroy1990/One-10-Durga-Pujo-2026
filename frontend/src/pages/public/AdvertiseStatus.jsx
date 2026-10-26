import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, Clock, ExternalLink, Loader2, PauseCircle, RefreshCw, XCircle } from "lucide-react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { Button } from "../../components/ui";
import { formatDateIST, formatPaise } from "../../lib/utils";

const STATES = {
  draft: { label: "Draft — not submitted yet", tone: "bg-sun-50 text-brown-900", icon: Clock,
    text: "Upload your creative and payment proof, then submit." },
  submitted: { label: "Submitted", tone: "bg-sky-50 text-brown-900", icon: Clock,
    text: "The committee will check your creative and payment. Please do not pay again." },
  in_review: { label: "In review", tone: "bg-sky-50 text-brown-900", icon: Clock,
    text: "A committee member is reviewing your ad now." },
  changes_requested: { label: "Changes requested", tone: "bg-sun-100 text-brown-900", icon: RefreshCw,
    text: "Please fix the points below and resubmit. No extra payment needed." },
  rejected: { label: "Not approved", tone: "bg-vermilion-500/10 text-vermilion-600", icon: XCircle, text: "" },
  published: { label: "Live", tone: "bg-emerald-50 text-emerald-900", icon: CheckCircle2,
    text: "Your ad is live on one10events.in." },
  paused: { label: "Paused by the committee", tone: "bg-sun-50 text-brown-900", icon: PauseCircle,
    text: "Your ad is temporarily hidden. The committee will contact you." },
  archived: { label: "Ended", tone: "bg-ivory-200 text-brown-900", icon: CheckCircle2, text: "This ad is no longer running." },
};

const REFUND = {
  eligible: "You are eligible for a full refund. The committee will return the amount to the paying account.",
  refunded: "Your refund has been sent.",
};

export default function AdvertiseStatus() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get(`/ads/status/${token}`).then((r) => setData(r.data)).catch(() => setError("We couldn't find this application. Check the link."));
  }, [token]);

  const st = data ? STATES[data.status] || STATES.submitted : null;
  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl px-5 py-12" data-testid="ad-status-page">
        <Link to="/promote" className="text-sm text-brown-800/70 hover:text-vermilion-600">← Promote your business</Link>
        <h1 className="mt-3 font-display text-4xl text-brown-900">Application status</h1>
        {!data && !error && <Loader2 className="mt-10 h-8 w-8 animate-spin text-vermilion-500" />}
        {error && <p className="mt-6 text-vermilion-600">{error}</p>}
        {data && (
          <div className="mt-6 space-y-5">
            <div className={`flex items-start gap-3 rounded-2xl p-5 ${st.tone}`} data-testid="ad-status-badge">
              <st.icon className="mt-0.5 h-6 w-6 shrink-0" />
              <div>
                <div className="font-display text-2xl">{st.label}</div>
                {st.text && <p className="mt-1 text-sm opacity-80">{st.text}</p>}
                {data.status === "published" && data.live_until && (
                  <p className="mt-1 text-sm opacity-80">Running until {formatDateIST(data.live_until)}.</p>
                )}
              </div>
            </div>

            {data.review_notes && ["changes_requested", "rejected", "paused"].includes(data.status) && (
              <div className="rounded-xl border border-gold-500/40 bg-white px-4 py-3 text-sm text-brown-900">
                <span className="font-semibold">Committee notes: </span>{data.review_notes}
              </div>
            )}
            {REFUND[data.refund_status] && <p className="text-sm text-brown-800/75">{REFUND[data.refund_status]}</p>}

            <div className="flex flex-wrap gap-3">
              {(data.status === "draft" || data.can_resubmit) && (
                <Link to={`/promote/apply?token=${encodeURIComponent(token)}`}>
                  <Button variant="primary" data-testid="ad-resubmit-btn">{data.status === "draft" ? "Continue application" : "Update & resubmit"}</Button>
                </Link>
              )}
              {data.status === "published" && data.slug && data.package_code !== "neighbourhood_card" && (
                <Link to={`/local-businesses/${data.slug}`}><Button variant="outline"><ExternalLink className="h-4 w-4" /> View your page</Button></Link>
              )}
              {data.status === "published" && (
                <Link to="/local-businesses"><Button variant="outline">See the directory</Button></Link>
              )}
            </div>
            {data.can_renew && (
              <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-brown-900" data-testid="ad-renew">
                Want to keep running? Renewal is 20% off your package — message the committee on the contact page to renew.
                <Link to="/contact" className="ml-1 font-semibold text-vermilion-600 hover:underline">Contact</Link>
              </div>
            )}
            {data.status === "rejected" && !data.can_resubmit && (
              <p className="text-sm text-brown-800/60">This application has used its one resubmit.</p>
            )}

            <dl className="grid gap-3 rounded-2xl border border-sun-400/30 bg-white p-5 text-sm shadow-sm sm:grid-cols-2">
              <div><dt className="text-brown-800/50">Business</dt><dd className="font-semibold">{data.business_name}</dd></div>
              <div><dt className="text-brown-800/50">Package</dt><dd className="font-semibold">{data.package_name} · {formatPaise(data.amount_paise)}</dd></div>
              <div><dt className="text-brown-800/50">Payment UTR</dt><dd>{data.subscriber_free ? "Free for subscribers" : data.payment_waived ? "Waived by the committee" : data.payment_utr || "—"}</dd></div>
              <div><dt className="text-brown-800/50">Submitted</dt><dd>{data.submitted_at ? formatDateIST(data.submitted_at) : "—"}</dd></div>
              <div className="sm:col-span-2"><dt className="text-brown-800/50">Headline</dt><dd>{data.headline}</dd></div>
              {data.status === "published" && (
                <div><dt className="text-brown-800/50">Clicks so far</dt><dd className="font-semibold">{data.click_count}</dd></div>
              )}
            </dl>
            {!!data.media?.length && (
              <div className="flex flex-wrap gap-3">
                {data.media.filter((m) => m.kind !== "video").map((m) => (
                  <a key={m.doc_id} href={m.url} target="_blank" rel="noreferrer" className="block w-32 overflow-hidden rounded-lg border border-sun-400/30 bg-white">
                    <img src={m.url} alt={m.kind} className="aspect-square w-full object-contain" />
                    <div className="px-2 py-1 text-[11px] capitalize text-brown-800/60">{m.kind.replace("_", " ")}</div>
                  </a>
                ))}
              </div>
            )}
            <p className="text-xs text-brown-800/50">Keep this link private — anyone with it can see and edit your application.</p>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
