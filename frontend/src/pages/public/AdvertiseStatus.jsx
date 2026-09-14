import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { Button } from "../../components/ui";
import { formatPaise } from "../../lib/utils";

const STATUS_COPY = {
  draft: "Draft — finish upload and submit.",
  submitted: "Submitted — waiting for committee review.",
  in_review: "In review by the committee.",
  changes_requested: "Changes requested — you can update this same application once.",
    approved: "Approved — waiting to be published on the website.",
  rejected: "Rejected — you may resubmit once with updated creative/payment if allowed.",
  published: "Live on the website.",
  archived: "Archived.",
};

export default function AdvertiseStatus() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const { data: d } = await api.get(`/ads/status/${token}`);
      setData(d);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not load status.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { load(); }, [token]);

  return (
    <PublicLayout>
      <div className="mx-auto max-w-2xl px-5 py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-vermilion-600">Application status</p>
        <h1 className="mt-2 font-display text-4xl text-brown-900">{data?.business_name || "Your advertisement"}</h1>
        {!data && busy && <Loader2 className="mt-8 h-6 w-6 animate-spin text-vermilion-500" />}
        {data && (
          <div className="mt-8 space-y-4 rounded-2xl border border-brown-800/10 bg-white p-6">
            <div className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-800">
              {data.status}
            </div>
            <p className="text-brown-800/75">{STATUS_COPY[data.status] || data.status}</p>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-brown-800/50">Package</dt><dd className="font-semibold">{data.package_name} · {formatPaise(data.amount_paise)}</dd></div>
              <div><dt className="text-brown-800/50">Resubmits used</dt><dd className="font-semibold">{data.resubmit_used || 0} / {data.resubmits_allowed || 1}</dd></div>
              {data.review_notes ? <div className="sm:col-span-2"><dt className="text-brown-800/50">Committee note</dt><dd>{data.review_notes}</dd></div> : null}
            </dl>
            <div className="flex flex-wrap gap-3">
              <Button variant="subtle" onClick={load} disabled={busy}><RefreshCw className="h-4 w-4" /> Refresh</Button>
              {data.published && data.slug ? (
                <Link to={`/local-businesses/${data.slug}`}><Button variant="primary">View live page</Button></Link>
              ) : null}
              {data.can_resubmit ? (
                <Link to={`/advertise/apply?resubmit=${token}`}><Button variant="primary">Update & resubmit</Button></Link>
              ) : null}
              <Link to="/advertise"><Button variant="ghost">Advertise home</Button></Link>
            </div>
            <p className="text-xs text-brown-800/50">Keep this page bookmarked. Status token is private to your application.</p>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
