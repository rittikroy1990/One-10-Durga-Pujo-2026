import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle, Archive, CheckCircle2, Download, ExternalLink, Eye, Loader2, Megaphone,
  PauseCircle, PlayCircle, RotateCcw, XCircle,
} from "lucide-react";
import api from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Button, Input, Select, Textarea } from "../../components/ui";
import { exportRowsCsv, formatDateIST, formatPaise } from "../../lib/utils";

const TABS = [
  { key: "", label: "Pending review" },
  { key: "changes_requested", label: "Changes requested" },
  { key: "published", label: "Live" },
  { key: "paused", label: "Paused" },
  { key: "rejected", label: "Rejected" },
  { key: "draft", label: "Drafts" },
  { key: "archived", label: "Archived" },
  { key: "all", label: "All" },
];

const STATUS_TONE = {
  draft: "bg-ivory-300 text-brown-800",
  submitted: "bg-sky-100 text-brown-900",
  in_review: "bg-sky-200 text-brown-900",
  changes_requested: "bg-sun-200 text-brown-900",
  rejected: "bg-vermilion-500/15 text-vermilion-600",
  published: "bg-emerald-100 text-emerald-800",
  paused: "bg-sun-100 text-brown-900",
  archived: "bg-ivory-300 text-brown-800/70",
};

function Pill({ status }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${STATUS_TONE[status] || "bg-ivory-300"}`}>{(status || "").replace("_", " ")}</span>;
}

const CSV_COLUMNS = [
  { key: "business_name", label: "Business" },
  { key: "status", label: "Status" },
  { key: "package_name", label: "Package" },
  { key: "addons", label: "Add-ons" },
  { key: "amount_paise", label: "Amount (Rs)", exportValue: (r) => (r.amount_paise || 0) / 100 },
  { key: "location_scope", label: "Scope" },
  { key: "category", label: "Category" },
  { key: "contact_name", label: "Contact" },
  { key: "mobile", label: "Mobile" },
  { key: "payment_utr", label: "UTR" },
  { key: "submitted_at", label: "Submitted" },
  { key: "published_at", label: "Published" },
  { key: "live_until", label: "Live until" },
  { key: "click_count", label: "Clicks" },
  { key: "refund_status", label: "Refund" },
];

export default function AdsAdmin() {
  const { user } = useAuth();
  const perms = new Set(user?.permissions || []);
  const canPublish = perms.has("ads:publish");
  const canFlag = perms.has("settings:manage");
  const [tab, setTab] = useState("");
  const [queue, setQueue] = useState({ items: [], counts: {} });
  const [selected, setSelected] = useState(null);
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [verified, setVerified] = useState(false);
  const [liveUntil, setLiveUntil] = useState("");
  const [reasons, setReasons] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await api.get("/ads/admin/queue", { params: tab ? { status: tab } : {} });
    setQueue(data);
  }, [tab]);

  useEffect(() => { load().catch(() => toast.error("Could not load the ads queue")); }, [load]);
  useEffect(() => { api.get("/ads/packages").then((r) => setReasons(r.data.reject_reasons || [])).catch(() => {}); }, []);

  const open = async (id) => {
    const { data } = await api.get(`/ads/admin/${id}`);
    setSelected(data);
    setNotes("");
    setReason("");
    setVerified(false);
    setLiveUntil("");
  };

  const act = async (action) => {
    if (!selected) return;
    if (action === "archive" && !window.confirm("Archive this ad? It will stop showing and cannot be resumed.")) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/ads/admin/${selected.id}/review`, {
        action, notes, reason, payment_verified: verified, live_until: liveUntil || undefined,
      });
      setSelected(data.ad);
      setNotes("");
      toast.success("Updated");
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleFlag = async () => {
    const next = !queue.enabled;
    const msg = next
      ? "Turn ON local business ads for the public? Apply opens and live ads appear on Home, Sponsors and the directory."
      : "Turn OFF local business ads? Placements disappear immediately and new applications are blocked.";
    if (!window.confirm(msg)) return;
    try {
      await api.put("/admin/settings", { feature_flags: { local_business_ads_enabled: next } });
      toast.success(next ? "Ads are now public" : "Ads switched off");
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not change the setting");
    }
  };

  const s = selected;
  const pending = (queue.counts?.submitted || 0) + (queue.counts?.in_review || 0);
  const media = (s?.media || []);

  return (
    <div className="space-y-6" data-testid="ads-admin-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-brown-900">Local business ads</h1>
          <p className="text-sm text-brown-800/60">Check creative and payment, then publish. Income posts to 4205 when an ad goes live.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${queue.enabled ? "bg-emerald-100 text-emerald-800" : "bg-ivory-300 text-brown-800"}`} data-testid="ads-flag-status">
            Public ads: {queue.enabled ? "ON" : "OFF"}
          </span>
          {canFlag && <Button variant="subtle" size="sm" onClick={toggleFlag} data-testid="ads-flag-toggle">{queue.enabled ? "Switch off" : "Switch on"}</Button>}
          <Link to="/promote" target="_blank"><Button variant="subtle" size="sm"><Eye className="h-4 w-4" /> Public page</Button></Link>
          <Button variant="subtle" size="sm" onClick={() => exportRowsCsv(`business-ads-${tab || "pending"}`, CSV_COLUMNS, queue.items)}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-brown-800/10 bg-white p-4"><div className="text-xs text-brown-800/55">Waiting for review</div><div className="font-display text-3xl text-brown-900">{pending}</div></div>
        <div className="rounded-xl border border-brown-800/10 bg-white p-4"><div className="text-xs text-brown-800/55">Live now</div><div className="font-display text-3xl text-brown-900">{queue.counts?.published || 0}</div></div>
        <div className="rounded-xl border border-brown-800/10 bg-white p-4"><div className="text-xs text-brown-800/55">Ad income recognised (4205)</div><div className="font-display text-3xl text-brown-900">{formatPaise(queue.recognised_paise || 0)}</div></div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const n = t.key === "" ? pending : t.key === "all" ? null : queue.counts?.[t.key];
          return (
            <button key={t.key || "pending"} type="button" onClick={() => { setTab(t.key); setSelected(null); }}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${tab === t.key ? "bg-brown-800 text-ivory-100" : "bg-white text-brown-800 ring-1 ring-brown-800/10 hover:bg-ivory-200"}`}
              data-testid={`ads-tab-${t.key || "pending"}`}>
              {t.label}{n ? ` · ${n}` : ""}
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-2">
          {queue.items.map((item) => (
            <button key={item.id} type="button" onClick={() => open(item.id)}
              className={`w-full rounded-xl border p-4 text-left transition ${s?.id === item.id ? "border-vermilion-500 bg-sun-50" : "border-brown-800/10 bg-white hover:border-brown-800/25"}`}
              data-testid={`ads-queue-item-${item.id}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-brown-900">{item.business_name}</div>
                <Pill status={item.status} />
              </div>
              <div className="mt-1 text-sm text-brown-800/65">{item.package_name} · {formatPaise(item.amount_paise)}{item.location_scope === "outside_one_ten" ? " · outside" : ""}</div>
              <div className="mt-1 text-xs text-brown-800/45">
                {formatDateIST(item.submitted_at || item.updated_at)}
                {item.status === "published" ? ` · ${item.click_count || 0} clicks` : ""}
              </div>
            </button>
          ))}
          {!queue.items.length && (
            <div className="rounded-xl border border-dashed border-brown-800/15 bg-white p-8 text-center text-brown-800/50">
              <Megaphone className="mx-auto h-8 w-8 opacity-40" />
              <p className="mt-2 text-sm">Nothing here.</p>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-brown-800/10 bg-white p-5 lg:col-span-3">
          {!s ? (
            <p className="text-sm text-brown-800/55">Select an application to review.</p>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-display text-2xl text-brown-900">{s.business_name}</h2>
                  <p className="text-sm text-brown-800/60">{s.headline}</p>
                </div>
                <Pill status={s.status} />
              </div>

              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-brown-800/45">Contact</dt><dd>{s.contact_name} · <a className="text-vermilion-600" href={`tel:${s.mobile}`}>{s.mobile}</a>{s.email ? ` · ${s.email}` : ""}</dd></div>
                <div><dt className="text-brown-800/45">Location</dt><dd>{s.location_scope === "outside_one_ten" ? "Outside One Ten" : "Inside One Ten"}{s.tower_or_area ? ` · ${s.tower_or_area}` : ""}</dd></div>
                <div><dt className="text-brown-800/45">Category</dt><dd>{s.category}</dd></div>
                <div><dt className="text-brown-800/45">Link</dt><dd className="break-all">{s.link_type === "none" ? "—" : `${s.link_label}: ${s.link_url}`}</dd></div>
                <div className="sm:col-span-2"><dt className="text-brown-800/45">Write-up</dt><dd className="whitespace-pre-wrap">{s.writeup}</dd></div>
              </dl>

              <div className="rounded-xl bg-ivory-200 p-4 text-sm">
                {(s.price_lines || []).map((l) => (
                  <div key={l.code} className="flex justify-between"><span>{l.label}</span><span>{formatPaise(l.amount_paise)}</span></div>
                ))}
                <div className="mt-1 flex justify-between border-t border-brown-800/10 pt-1 font-semibold"><span>Amount due</span><span>{formatPaise(s.amount_paise)}</span></div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span>UTR <span className="font-mono font-semibold">{s.payment_utr || "—"}</span></span>
                  {s.payment_proof_url && <a href={s.payment_proof_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-vermilion-600">Payment proof <ExternalLink className="h-3.5 w-3.5" /></a>}
                  {s.payment_verified && <span className="text-emerald-700">Verified by {s.payment_verified_by}</span>}
                  {s.subscriber_free && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Free — flat has a paid 2026 subscription</span>}
                  {s.payment_waived && <span className="rounded-full bg-sun-200 px-2 py-0.5 text-xs font-semibold text-brown-900">Payment waived by {s.payment_waived_by} · no income journal</span>}
                </div>
                {s.utr_seen_elsewhere > 0 && (
                  <p className="mt-2 inline-flex items-center gap-1 text-vermilion-600"><AlertTriangle className="h-4 w-4" /> This UTR is also on {s.utr_seen_elsewhere} other application(s).</p>
                )}
                {s.payment_amount_mismatch && <p className="mt-2 text-vermilion-600">Amount changed after payment — check the difference was paid.</p>}
                {s.journal_id && <p className="mt-2 text-xs text-brown-800/55">Income journal {s.journal_id}</p>}
              </div>

              <div>
                <div className="mb-2 text-sm font-semibold text-brown-800">Creative</div>
                {!!s.missing_media?.length && <p className="mb-2 text-sm text-vermilion-600">Missing: {s.missing_media.join(", ")}</p>}
                <div className="flex flex-wrap gap-3">
                  {media.map((m) => (
                    <a key={m.doc_id} href={m.url} target="_blank" rel="noreferrer" className="block w-40 overflow-hidden rounded-lg border border-brown-800/10 bg-ivory-100">
                      {m.kind === "video"
                        ? <video src={m.url} className="aspect-video w-full bg-black" preload="metadata" />
                        : <img src={m.url} alt={m.kind} className="aspect-video w-full object-contain" />}
                      <div className="px-2 py-1 text-[11px] text-brown-800/70">
                        {m.kind}{m.width ? ` · ${m.width}×${m.height}` : ""}{m.duration_s ? ` · ${Math.round(m.duration_s)}s` : ""}
                      </div>
                    </a>
                  ))}
                </div>
              </div>

              {s.status === "published" && (
                <div className="text-sm text-brown-800/75">
                  Live {formatDateIST(s.live_from)} → {formatDateIST(s.live_until)} · {s.click_count || 0} clicks
                  {Object.keys(s.clicks_by_surface || {}).length ? ` (${Object.entries(s.clicks_by_surface).map(([k, v]) => `${k} ${v}`).join(", ")})` : ""}
                  {s.slug && <Link to={`/local-businesses/${s.slug}`} target="_blank" className="ml-2 text-vermilion-600">Open page</Link>}
                </div>
              )}
              {s.review_notes && <p className="text-sm"><span className="text-brown-800/50">Last notes:</span> {s.review_notes}</p>}
              {s.refund_status && <p className="text-sm"><span className="text-brown-800/50">Refund:</span> {s.refund_status}{s.refund_ref ? ` · ${s.refund_ref}` : ""}</p>}

              <div className="space-y-3 border-t border-brown-800/10 pt-4">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-brown-800">Notes to the applicant</label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} data-testid="ads-review-notes" placeholder="Required for changes / refunds; shown on the applicant's status page." />
                </div>

                {["submitted", "in_review"].includes(s.status) && (
                  <>
                    {canPublish && (
                      <div className="space-y-2 rounded-xl border border-emerald-600/20 bg-emerald-50/50 p-3">
                        {s.payment_waived || !s.amount_paise ? (
                          <p className="text-sm text-brown-800/75">{s.payment_waived ? "Payment waived" : "Nothing to pay (subscriber)"} — publishing posts no income journal.</p>
                        ) : (
                          <label className="flex items-start gap-2 text-sm">
                            <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} data-testid="ads-payment-verified" />
                            I found UTR {s.payment_utr} for {formatPaise(s.amount_paise)} in the bank statement / UPI app.
                          </label>
                        )}
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="text-brown-800/60">Live until (optional)</span>
                          <Input type="date" className="w-44" value={liveUntil} onChange={(e) => setLiveUntil(e.target.value)} />
                        </div>
                        <Button variant="primary" disabled={busy || (!verified && !s.payment_waived && !!s.amount_paise)} onClick={() => act("approve_publish")} data-testid="ads-publish-btn">
                          <CheckCircle2 className="h-4 w-4" /> Approve & publish
                        </Button>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {s.status === "submitted" && <Button variant="subtle" disabled={busy} onClick={() => act("start_review")}><Eye className="h-4 w-4" /> Start review</Button>}
                      <Button variant="subtle" disabled={busy || !notes.trim()} onClick={() => act("request_changes")} data-testid="ads-request-changes-btn"><RotateCcw className="h-4 w-4" /> Request changes</Button>
                    </div>
                  </>
                )}

                {["submitted", "in_review", "changes_requested"].includes(s.status) && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={reason} onChange={(e) => setReason(e.target.value)} className="w-56" data-testid="ads-reject-reason">
                      <option value="">Rejection reason…</option>
                      {reasons.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                    </Select>
                    <Button variant="danger" disabled={busy || !reason} onClick={() => act("reject")} data-testid="ads-reject-btn"><XCircle className="h-4 w-4" /> Reject</Button>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {s.status === "published" && <Button variant="subtle" disabled={busy} onClick={() => act("pause")}><PauseCircle className="h-4 w-4" /> Pause</Button>}
                  {s.status === "paused" && <Button variant="subtle" disabled={busy} onClick={() => act("resume")}><PlayCircle className="h-4 w-4" /> Resume</Button>}
                  {s.refund_status === "eligible" && (
                    <Button variant="subtle" disabled={busy || !notes.trim()} onClick={() => act("mark_refunded")}>Mark refunded (put ref in notes)</Button>
                  )}
                  {["draft", "published", "paused", "rejected", "changes_requested"].includes(s.status) && (
                    <Button variant="ghost" disabled={busy} onClick={() => act("archive")}><Archive className="h-4 w-4" /> Archive</Button>
                  )}
                  {busy && <Loader2 className="h-5 w-5 animate-spin text-vermilion-500" />}
                </div>
              </div>

              {!!s.history?.length && (
                <details className="text-xs text-brown-800/60">
                  <summary className="cursor-pointer font-semibold">History ({s.history.length})</summary>
                  <ul className="mt-2 space-y-1">
                    {s.history.map((h, i) => (
                      <li key={i}>{formatDateIST(h.created_at)} · {h.action}{h.after?.status ? ` → ${h.after.status}` : ""}{h.after?.notes ? ` · ${h.after.notes}` : ""}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
