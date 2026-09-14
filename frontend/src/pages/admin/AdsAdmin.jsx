import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Eye, Loader2, Megaphone, XCircle } from "lucide-react";
import api, { API } from "../../lib/api";
import { Button, Input, Select, Textarea } from "../../components/ui";
import { formatPaise, formatDateIST } from "../../lib/utils";

export default function AdsAdmin() {
  const [status, setStatus] = useState("submitted");
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await api.get("/ads/admin/queue", { params: status ? { status } : {} });
    setItems(data.items || []);
  };

  useEffect(() => { load().catch(() => toast.error("Could not load ads queue")); }, [status]);

  const openDetail = async (id) => {
    const { data } = await api.get(`/ads/admin/${id}`);
    setSelected(data);
    setNotes(data.review_notes || "");
  };

  const act = async (action) => {
    if (!selected) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/ads/admin/${selected.id}/review`, {
        action,
        notes,
        payment_verified: true,
      });
      setSelected(data.ad);
      toast.success(`Marked ${action}`);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="ads-admin-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-brown-900">Business ads</h1>
          <p className="text-sm text-brown-800/60">Review paid local-business advertisements before they go live.</p>
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} data-testid="ads-admin-status-filter">
          <option value="submitted">Submitted</option>
          <option value="in_review">In review</option>
          <option value="changes_requested">Changes requested</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="published">Published</option>
          <option value="">All active</option>
        </Select>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-2 space-y-3">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => openDetail(item.id)}
              className={`w-full rounded-xl border p-4 text-left transition ${selected?.id === item.id ? "border-vermilion-500 bg-vermilion-50" : "border-brown-800/10 bg-white hover:border-brown-800/25"}`}
              data-testid={`ads-queue-item-${item.id}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-brown-900">{item.business_name}</div>
                <span className="text-[11px] uppercase tracking-wide text-brown-800/50">{item.status}</span>
              </div>
              <div className="mt-1 text-sm text-brown-800/65">{item.package_name} · {formatPaise(item.amount_paise)}</div>
              <div className="mt-1 text-xs text-brown-800/45">{formatDateIST(item.submitted_at || item.updated_at)}</div>
            </button>
          ))}
          {!items.length && (
            <div className="rounded-xl border border-dashed border-brown-800/15 bg-white p-8 text-center text-brown-800/50">
              <Megaphone className="mx-auto h-8 w-8 opacity-40" />
              <p className="mt-2 text-sm">No ads in this queue.</p>
            </div>
          )}
        </div>

        <div className="lg:col-span-3 rounded-2xl border border-brown-800/10 bg-white p-5">
          {!selected ? (
            <p className="text-sm text-brown-800/55">Select an application to review.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-2xl text-brown-900">{selected.business_name}</h2>
                <p className="text-sm text-brown-800/60">{selected.headline}</p>
              </div>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-brown-800/45">Contact</dt><dd>{selected.contact_name} · {selected.mobile}</dd></div>
                <div><dt className="text-brown-800/45">Location</dt><dd>{selected.location_scope} {selected.tower_or_area ? `· ${selected.tower_or_area}` : ""}</dd></div>
                <div><dt className="text-brown-800/45">Package</dt><dd>{selected.package_name} · {formatPaise(selected.amount_paise)}</dd></div>
                <div><dt className="text-brown-800/45">Payment UTR</dt><dd>{selected.payment_utr || "—"}</dd></div>
                <div className="sm:col-span-2"><dt className="text-brown-800/45">Write-up</dt><dd className="whitespace-pre-wrap">{selected.writeup}</dd></div>
                <div className="sm:col-span-2"><dt className="text-brown-800/45">Link</dt><dd>{selected.link_type}: {selected.link_url || "—"}</dd></div>
              </dl>

              <div className="flex flex-wrap gap-3">
                {(selected.media || []).map((m) => (
                  <a key={m.doc_id} href={`${API}/ads/media/${m.doc_id}?token=${encodeURIComponent(selected.status_token || "")}`} target="_blank" rel="noreferrer" className="rounded-lg border border-brown-800/10 px-3 py-2 text-xs font-semibold text-brown-800 hover:bg-ivory-100">
                    {m.kind}: {m.filename}
                  </a>
                ))}
                {selected.payment_proof_doc_id && (
                  <a href={`${API}/ads/media/${selected.payment_proof_doc_id}?token=${encodeURIComponent(selected.status_token || "")}`} target="_blank" rel="noreferrer" className="rounded-lg border border-brown-800/10 px-3 py-2 text-xs font-semibold text-brown-800 hover:bg-ivory-100">
                    Payment proof
                  </a>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-brown-800">Review notes</label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} data-testid="ads-review-notes" />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="subtle" disabled={busy} onClick={() => act("start_review")}><Eye className="h-4 w-4" /> Start review</Button>
                <Button variant="primary" disabled={busy} onClick={() => act("approve")} data-testid="ads-approve-btn"><CheckCircle2 className="h-4 w-4" /> Approve</Button>
                <Button variant="gold" disabled={busy} onClick={() => act("publish")} data-testid="ads-publish-btn">Publish</Button>
                <Button variant="subtle" disabled={busy} onClick={() => act("request_changes")}>Request changes</Button>
                <Button variant="danger" disabled={busy} onClick={() => act("reject")} data-testid="ads-reject-btn"><XCircle className="h-4 w-4" /> Reject</Button>
                <Button variant="ghost" disabled={busy} onClick={() => act("archive")}>Archive</Button>
                {busy && <Loader2 className="h-5 w-5 animate-spin text-vermilion-500" />}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
