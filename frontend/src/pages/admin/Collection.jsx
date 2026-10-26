import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { toast } from "sonner";
import {
  FileText, Check, Plus, RefreshCw, Download, Upload, ShieldCheck, ArrowUpDown, ArrowUp, ArrowDown, X,
} from "lucide-react";
import api, { API } from "../../lib/api";
import { loadFlats, prefetchFlats } from "../../lib/flats";
import { useAuth } from "../../context/AuthContext";
import { Card, CardBody, Table, THead, TR, TH, TD, StatusBadge, Button, Dialog, Label, Input, Select, Spinner } from "../../components/ui";
import { formatPaise } from "../../lib/utils";
import ExportCsvButton from "../../components/ExportCsvButton";

const RECEIPT_KINDS = [
  { value: "subscription", label: "Puja subscription", badge: "bg-sky-100 text-sky-800" },
  { value: "food_subscription", label: "Food", badge: "bg-emerald-100 text-emerald-800" },
  { value: "donation", label: "Donation", badge: "bg-amber-100 text-amber-800" },
  { value: "sponsorship", label: "Sponsorship", badge: "bg-violet-100 text-violet-800" },
];
const kindMeta = (kind) => RECEIPT_KINDS.find((k) => k.value === kind)
  || { value: kind || "other", label: (kind || "Other").replace(/_/g, " "), badge: "bg-brown-800/10 text-brown-800" };
const isLive = (r) => r.status === "issued" || r.status === "partially_refunded";

const householdLabel = (r) => [r.tower_name, r.flat_number].filter(Boolean).join(" · ");
const utrOf = (r) => r.payment_id || r.masked_ref || "";

const SORTERS = {
  receipt_no: (r) => r.receipt_no || "",
  kind: (r) => kindMeta(r.kind).label,
  payer_name: (r) => (r.payer_name || "").toLowerCase(),
  household: (r) => (/^tower\s/i.test(r.tower_name || "") ? householdLabel(r) : ""),
  contact_mobile: (r) => r.contact_mobile || "",
  total_amount: (r) => Number(r.total_amount || 0),
  utr: utrOf,
  status: (r) => receiptVerifyLabel(r),
};

function compareValues(a, b) {
  if (a === b) return 0;
  if (a === "" || a == null) return 1;
  if (b === "" || b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function amountMatches(rupees, expr) {
  const m = String(expr || "").replace(/[₹,\s]/g, "").match(/^(>=|<=|>|<|=)?(\d+(?:\.\d+)?)$/);
  if (!m) return true;
  const n = Number(m[2]);
  switch (m[1]) {
    case ">": return rupees > n;
    case "<": return rupees < n;
    case ">=": return rupees >= n;
    case "<=": return rupees <= n;
    default: return rupees === n;
  }
}

const textMatches = (value, needle) => {
  const hay = String(value || "").toLowerCase();
  return String(needle || "").toLowerCase().split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
};

const EMPTY_FILTERS = { receipt_no: "", payer_name: "", household: "", mobile: "", total: "", utr: "", status: "" };

function SortTH({ label, sortKey, sort, onSort, right }) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TH right={right}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 uppercase ${active ? "text-vermilion-600" : "hover:text-vermilion-600"}`}
        data-testid={`collection-sort-${sortKey}`}
      >
        {label}
        <Icon className={`h-3 w-3 ${active ? "" : "opacity-40"}`} />
      </button>
    </TH>
  );
}

const filterInput = "w-full min-w-[5rem] rounded-md border border-brown-800/15 bg-white px-2 py-1 text-xs font-normal normal-case tracking-normal text-brown-900 focus:border-vermilion-500 focus:outline-none";

const FOOD_HELPDESK_MESSAGE = [
  "Namaskar,",
  "",
  "As you have subscribed to One 10 Durgotsav 2026, we are reaching out to you regarding the food subscription.",
  "",
  "If you are facing any difficulty in purchasing the food voucher, please come to the *T1 Banquet* — we have set up a *Food Helpdesk* to assist you. You can select your food there, pay the amount and collect your food voucher.",
  "",
  "You can also order online anytime: https://one10events.in/food",
  "",
  "— EOC, One 10 Durgotsav 2026",
].join("\n");

const whatsappLink = (mobile) => `https://wa.me/91${mobile}?text=${encodeURIComponent(FOOD_HELPDESK_MESSAGE)}`;

function WhatsAppIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35zM12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.31l-.34-.2-3.57.93.95-3.48-.22-.36a9.42 9.42 0 0 1-1.44-5.02c0-5.2 4.23-9.43 9.44-9.43 2.52 0 4.89.98 6.67 2.77a9.37 9.37 0 0 1 2.76 6.67c0 5.2-4.23 9.43-9.44 9.43zm8.03-17.46A11.3 11.3 0 0 0 12.05.7C5.79.7.7 5.79.7 12.04c0 2 .52 3.95 1.52 5.67L.6 23.3l5.73-1.5a11.33 11.33 0 0 0 5.42 1.38h.01c6.25 0 11.34-5.09 11.34-11.34 0-3.03-1.18-5.88-3.32-8.02z" />
    </svg>
  );
}

function receiptVerifyLabel(r) {
  if (r?.refund_status) return r.refund_status;
  if (r?.status && r.status !== "issued" && r.status !== "partially_refunded") return r.status;
  return r?.bank_verified ? "bank verified" : "not bank verified";
}

export default function Collection() {
  const { user } = useAuth();
  const perms = new Set(user?.permissions || []);
  const canBankVerify = perms.has("receipts:manage") || perms.has("payments:manage");
  const { items, loading, load, setItems } = useList("/admin/receipts");
  const fileRef = useRef(null);
  const [towers, setTowers] = useState([]);
  const [flats, setFlats] = useState([]);
  const [mode, setMode] = useState("cash");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [verifying, setVerifying] = useState("");
  const [importResult, setImportResult] = useState(null);
  const [queues, setQueues] = useState(null);
  const [kind, setKind] = useState("");
  const [colFilter, setColFilter] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState({ key: "", dir: "asc" });
  const [f, setF] = useState({
    tower_id: "",
    flat_id: "",
    name: "",
    mobile: "",
    occupancy_type: "owner_resident",
    family_members: 1,
    donation_rupees: 0,
    utr: "",
    cheque_no: "",
    bank: "",
    handover_batch: "",
  });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const loadQueues = useCallback(() => {
    api.get("/manual/queues").then((r) => setQueues(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    api.get("/towers").then((r) => { setTowers(r.data.items || []); prefetchFlats(r.data.items); });
    loadQueues();
  }, [loadQueues]);

  useEffect(() => {
    if (!f.tower_id) {
      setFlats([]);
      return;
    }
    loadFlats(f.tower_id).then(setFlats).catch(() => setFlats([]));
  }, [f.tower_id]);

  const refresh = () => {
    load();
    loadQueues();
  };

  const markBankVerified = async (row) => {
    if (!row?.id) return;
    if (!window.confirm(`Mark ${row.receipt_no} as bank verified?\nConfirm only after matching UTR ${row.payment_id || row.masked_ref || ""} on the bank statement.`)) {
      return;
    }
    setVerifying(row.id);
    try {
      const r = await api.post(`/admin/receipts/${row.id}/bank-verify`);
      const updated = r.data.receipt || { ...row, bank_verified: true };
      setItems((prev) => prev.map((x) => (x.id === row.id ? { ...x, ...updated, bank_verified: true } : x)));
      toast.success(r.data.already ? "Already bank verified" : `Bank verified — ${row.receipt_no}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not mark bank verified");
    } finally {
      setVerifying("");
    }
  };

  const downloadSample = async () => {
    setDownloading(true);
    try {
      const r = await api.get("/admin/collection/template", { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "one10_subscription_payment_template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Sample template downloaded — replace the example rows and upload");
    } catch {
      toast.error("Could not download template");
    } finally {
      setDownloading(false);
    }
  };

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/admin/collection/import", fd);
      setImportResult(r.data);
      toast.success(r.data.message || "Import complete");
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Import failed");
    } finally {
      setUploading(false);
    }
  };

  const create = async () => {
    setBusy(true);
    try {
      const ep = mode === "cash" ? "/manual/cash" : mode === "bank" ? "/manual/bank-transfer" : "/manual/cheque";
      await api.post(ep, f);
      toast.success(`${mode} collection recorded (pending checker approval)`);
      setOpen(false);
      refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not record.");
    } finally {
      setBusy(false);
    }
  };

  const act = async (endpoint, body) => {
    try {
      await api.post(endpoint, body || { bank_statement_matched: true });
      toast.success("Approved — receipt issued");
      refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Action failed");
    }
  };

  const kindSummary = useMemo(() => {
    const out = { "": { count: 0, amount: 0 } };
    for (const r of items) {
      const s = (out[r.kind] = out[r.kind] || { count: 0, amount: 0 });
      s.count += 1;
      out[""].count += 1;
      if (isLive(r)) {
        s.amount += Number(r.total_amount || 0);
        out[""].amount += Number(r.total_amount || 0);
      }
    }
    return out;
  }, [items]);
  const kindChips = [
    { value: "", label: "All collections" },
    ...RECEIPT_KINDS,
    ...Object.keys(kindSummary).filter((k) => k && !RECEIPT_KINDS.some((x) => x.value === k)).map(kindMeta),
  ];
  const statusOptions = useMemo(() => [...new Set(items.map(receiptVerifyLabel))].sort(), [items]);
  const filtersActive = !!kind || Object.values(colFilter).some(Boolean);
  const setCol = (k, v) => setColFilter((f) => ({ ...f, [k]: v }));
  const onSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "total_amount" ? "desc" : "asc" }));

  const shown = useMemo(() => {
    const f = colFilter;
    const rows = items.filter((r) => {
      if (kind && r.kind !== kind) return false;
      if (f.receipt_no && !textMatches(r.receipt_no, f.receipt_no)) return false;
      if (f.payer_name && !textMatches(r.payer_name, f.payer_name)) return false;
      if (f.household && !textMatches(householdLabel(r), f.household)) return false;
      if (f.mobile === "has" && !r.contact_mobile) return false;
      if (f.mobile === "missing" && r.contact_mobile) return false;
      if (f.total && !amountMatches(Number(r.total_amount || 0) / 100, f.total)) return false;
      if (f.utr && !textMatches(utrOf(r), f.utr)) return false;
      if (f.status && receiptVerifyLabel(r) !== f.status) return false;
      return true;
    });
    if (!sort.key) return rows;
    const get = SORTERS[sort.key];
    const dir = sort.dir === "desc" ? -1 : 1;
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va === "" || vb === "") return compareValues(va, vb);
      return dir * compareValues(va, vb);
    });
  }, [items, kind, colFilter, sort]);

  const exportCols = [
    { key: "receipt_no", label: "Receipt no" },
    { key: "kind", label: "Type", exportValue: (r) => kindMeta(r.kind).label },
    { key: "payer_name", label: "Payer" },
    { key: "tower_name", label: "Tower" },
    { key: "flat_number", label: "Flat" },
    { key: "contact_mobile", label: "Mobile" },
    { key: "contact_mobile_source", label: "Mobile source" },
    { key: "total_amount", label: "Total (₹)", exportValue: (r) => (Number(r.total_amount || 0) / 100).toFixed(2) },
    { key: "method", label: "Method", exportValue: (r) => (r.method || "").replace(/_/g, " ") },
    { key: "status", label: "Status", exportValue: (r) => receiptVerifyLabel(r) },
    { key: "payment_id", label: "UTR / ref" },
    { key: "issued_at", label: "Issued at", exportValue: (r) => r.issued_at || r.created_at || "" },
  ];

  return (
    <div data-testid="collection-page" className="space-y-5">
      <div>
        <h1 className="mb-1 font-display text-4xl">Collection</h1>
        <p className="text-sm text-brown-800/50">
          Issued receipts. Excel uploads are bank verified. Screenshot receipts stay “not bank verified” until a treasurer confirms the UTR on the statement.
        </p>
      </div>

      <Card><CardBody>
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="subtle"
            size="sm"
            disabled={downloading}
            onClick={downloadSample}
            data-testid="collection-template-download"
          >
            <Download className="h-4 w-4" /> {downloading ? "…" : "Download sample"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={onUpload}
            data-testid="collection-import-input"
          />
          <Button
            variant="subtle"
            size="sm"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            data-testid="collection-import-upload"
          >
            <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : "Upload filled"}
          </Button>
          <ExportCsvButton filename={`receipts${kind ? `_${kind}` : ""}.csv`} columns={exportCols} items={shown} data-testid="receipts-export-csv" />
          <Button variant="subtle" size="sm" onClick={refresh} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="admin" size="sm" onClick={() => setOpen(true)} data-testid="manual-new-btn">
            <Plus className="h-4 w-4" /> Record cash
          </Button>
        </div>

        {importResult && (
          <div
            className="mb-3 rounded-lg border border-sun-400/30 bg-sun-50/60 px-3 py-2 text-sm text-brown-800/80"
            data-testid="collection-import-result"
          >
            {importResult.message}
            {!!(importResult.errors || []).length && (
              <ul className="mt-1 list-disc pl-5 text-xs text-vermilion-700">
                {(importResult.errors || []).slice(0, 5).map((e, i) => (
                  <li key={i}>{e.reason || e.message || JSON.stringify(e)}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mb-3 flex flex-wrap gap-2" data-testid="collection-kind-filter">
          {kindChips.map((k) => {
            const s = kindSummary[k.value] || { count: 0, amount: 0 };
            const active = kind === k.value;
            return (
              <button
                key={k.value || "all"}
                type="button"
                onClick={() => setKind(k.value)}
                className={`rounded-xl border px-3 py-2 text-left transition ${
                  active ? "border-brown-900 bg-brown-900 text-ivory-100" : "border-brown-800/15 bg-white text-brown-900 hover:border-brown-800/40"
                }`}
                data-testid={`collection-kind-${k.value || "all"}`}
              >
                <div className="text-xs font-semibold">{k.label} <span className="opacity-60">· {s.count}</span></div>
                <div className={`font-display text-lg leading-tight ${active ? "text-ivory-100" : "text-vermilion-600"}`}>{formatPaise(s.amount)}</div>
              </button>
            );
          })}
        </div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-brown-800/50">
          <span>Amounts are issued receipts only — voided receipts are listed but not added.</span>
          <span className="flex items-center gap-2" data-testid="collection-showing">
            Showing {shown.length} of {items.length}
            {shown.length !== items.length ? (
              <> · <b className="text-brown-900">{formatPaise(shown.filter(isLive).reduce((n, r) => n + Number(r.total_amount || 0), 0))}</b></>
            ) : null}
            {filtersActive || sort.key ? (
              <button
                type="button"
                onClick={() => { setKind(""); setColFilter(EMPTY_FILTERS); setSort({ key: "", dir: "asc" }); }}
                className="inline-flex items-center gap-0.5 font-semibold text-vermilion-600 hover:underline"
                data-testid="collection-clear-filters"
              >
                <X className="h-3 w-3" /> Clear filters &amp; sort
              </button>
            ) : null}
          </span>
        </div>

        {loading ? (
          <Spinner className="text-vermilion-500" />
        ) : (
          <Table>
            <THead>
              <TR>
                <SortTH label="Receipt No" sortKey="receipt_no" sort={sort} onSort={onSort} />
                <SortTH label="Type" sortKey="kind" sort={sort} onSort={onSort} />
                <SortTH label="Payer" sortKey="payer_name" sort={sort} onSort={onSort} />
                <SortTH label="Household" sortKey="household" sort={sort} onSort={onSort} />
                <SortTH label="Mobile" sortKey="contact_mobile" sort={sort} onSort={onSort} />
                <SortTH label="Total" sortKey="total_amount" sort={sort} onSort={onSort} right />
                <SortTH label="UTR" sortKey="utr" sort={sort} onSort={onSort} />
                <SortTH label="Status" sortKey="status" sort={sort} onSort={onSort} />
                <TH>PDF</TH>
                {canBankVerify ? <TH>Verify</TH> : null}
              </TR>
              <tr className="border-t border-brown-800/10 bg-ivory-200" data-testid="collection-filter-row">
                <th className="px-2 py-1.5">
                  <input className={filterInput} value={colFilter.receipt_no} onChange={(e) => setCol("receipt_no", e.target.value)} placeholder="Filter" data-testid="collection-filter-receipt" />
                </th>
                <th className="px-2 py-1.5">
                  <select className={filterInput} value={kind} onChange={(e) => setKind(e.target.value)} data-testid="collection-filter-kind">
                    <option value="">All</option>
                    {kindChips.filter((k) => k.value).map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </select>
                </th>
                <th className="px-2 py-1.5">
                  <input className={filterInput} value={colFilter.payer_name} onChange={(e) => setCol("payer_name", e.target.value)} placeholder="Name" data-testid="collection-filter-payer" />
                </th>
                <th className="px-2 py-1.5">
                  <input className={filterInput} value={colFilter.household} onChange={(e) => setCol("household", e.target.value)} placeholder="e.g. 3 13C" data-testid="collection-filter-household" />
                </th>
                <th className="px-2 py-1.5">
                  <select className={filterInput} value={colFilter.mobile} onChange={(e) => setCol("mobile", e.target.value)} data-testid="collection-filter-mobile">
                    <option value="">All</option>
                    <option value="has">Has number</option>
                    <option value="missing">Missing</option>
                  </select>
                </th>
                <th className="px-2 py-1.5">
                  <input className={`${filterInput} text-right`} value={colFilter.total} onChange={(e) => setCol("total", e.target.value)} placeholder=">3000" title="3500, >3000, <1000, >=5000" data-testid="collection-filter-total" />
                </th>
                <th className="px-2 py-1.5">
                  <input className={filterInput} value={colFilter.utr} onChange={(e) => setCol("utr", e.target.value)} placeholder="UTR" data-testid="collection-filter-utr" />
                </th>
                <th className="px-2 py-1.5">
                  <select className={filterInput} value={colFilter.status} onChange={(e) => setCol("status", e.target.value)} data-testid="collection-filter-status">
                    <option value="">All</option>
                    {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </th>
                <th />
                {canBankVerify ? <th /> : null}
              </tr>
            </THead>
            <tbody>
              {shown.map((r) => (
                <TR key={r.id}>
                  <TD>{r.receipt_no}</TD>
                  <TD>
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${kindMeta(r.kind).badge}`}>
                      {kindMeta(r.kind).label}
                    </span>
                  </TD>
                  <TD>{r.payer_name}</TD>
                  <TD className="text-xs text-brown-800/70">
                    {[r.tower_name, r.flat_number].filter(Boolean).join(" · ") || "—"}
                  </TD>
                  <TD className="whitespace-nowrap text-xs" data-testid={`receipt-mobile-${r.id}`}>
                    {r.contact_mobile ? (
                      <>
                        <a href={`tel:+91${r.contact_mobile}`} className="font-mono text-brown-900 hover:text-vermilion-600">
                          {r.contact_mobile}
                        </a>
                        <a
                          href={whatsappLink(r.contact_mobile)}
                          target="_blank"
                          rel="noreferrer"
                          title="Send the food helpdesk message on WhatsApp"
                          aria-label={`WhatsApp ${r.payer_name || r.contact_mobile}`}
                          className="ml-1.5 inline-flex align-middle text-[#25D366] hover:text-[#128C7E]"
                          data-testid={`receipt-whatsapp-${r.id}`}
                        >
                          <WhatsAppIcon className="h-4 w-4" />
                        </a>
                        {r.contact_mobile_source && r.contact_mobile_source !== "receipt" ? (
                          <div className="text-[10px] text-brown-800/45">from {r.contact_mobile_source}</div>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-brown-800/40">—</span>
                    )}
                  </TD>
                  <TD right>{formatPaise(r.total_amount)}</TD>
                  <TD className="font-mono text-xs">{r.payment_id || r.masked_ref || "—"}</TD>
                  <TD><StatusBadge status={receiptVerifyLabel(r)} /></TD>
                  <TD>
                    <a
                      href={`${API}/receipt/pdf/${r.verify_token}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-vermilion-600"
                      aria-label={`Download PDF for ${r.receipt_no}`}
                    >
                      <FileText className="h-4 w-4" />
                    </a>
                  </TD>
                  {canBankVerify ? (
                    <TD>
                      {!r.bank_verified && (r.status === "issued" || r.status === "partially_refunded") ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={verifying === r.id}
                          onClick={() => markBankVerified(r)}
                          data-testid={`bank-verify-${r.id}`}
                          title="Confirm UTR on bank statement"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          {verifying === r.id ? "…" : "Bank verified"}
                        </Button>
                      ) : r.bank_verified ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                          <Check className="h-3.5 w-3.5" /> Done
                        </span>
                      ) : (
                        "—"
                      )}
                    </TD>
                  ) : null}
                </TR>
              ))}
              {!shown.length ? (
                <tr>
                  <td colSpan={canBankVerify ? 10 : 9} className="px-4 py-8 text-center text-sm text-brown-800/45">
                    No receipts match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        )}
      </CardBody></Card>

      {queues && (
        <div className="grid gap-4 lg:grid-cols-3">
          <QueueCard
            title="Cash — pending acceptance"
            testid="queue-cash"
            rows={queues.cash_pending}
            render={(c) => (
              <QueueRow
                key={c.id}
                label={`${formatPaise(c.amount_paise)} · ${c.collector_name}`}
                onAct={() => act(`/manual/cash/${c.id}/accept`)}
                actLabel="Accept"
              />
            )}
          />
          <QueueCard
            title="Bank transfer — pending match"
            testid="queue-bank"
            rows={queues.bank_transfer_pending}
            render={(c) => (
              <QueueRow
                key={c.id}
                label={`${formatPaise(c.amount_paise)} · UTR ${c.utr}`}
                onAct={() => act(`/manual/bank-transfer/${c.id}/approve`, { bank_statement_matched: true })}
                actLabel="Approve"
              />
            )}
          />
          <QueueCard
            title="Cheque — pending clearing"
            testid="queue-cheque"
            rows={queues.cheque_pending}
            render={(c) => (
              <QueueRow
                key={c.id}
                label={`${formatPaise(c.amount_paise)} · ${c.cheque_no}`}
                onAct={() => act(`/manual/cheque/${c.id}/clear`)}
                actLabel="Mark cleared"
              />
            )}
          />
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Record cash / manual collection"
        footer={(
          <>
            <Button variant="subtle" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="admin" onClick={create} disabled={busy} data-testid="manual-create-submit">
              {busy ? "Saving…" : "Record"}
            </Button>
          </>
        )}
      >
        <p className="mb-3 text-sm text-brown-800/55">
          Cash, bank transfer and cheque need a different person to approve. The receipt is issued only after approval.
        </p>
        <div className="mb-3 inline-flex rounded-md border border-brown-800/15 p-1">
          {["cash", "bank", "cheque"].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              data-testid={`manual-mode-${m}`}
              className={`rounded px-3 py-1.5 text-sm capitalize ${mode === m ? "bg-brown-800 text-ivory-100" : "text-brown-800/60"}`}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Tower</Label>
            <Select
              data-testid="manual-tower"
              value={f.tower_id}
              onChange={(e) => { set("tower_id", e.target.value); set("flat_id", ""); }}
            >
              <option value="">Select</option>
              {towers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Flat</Label>
            <Select data-testid="manual-flat" value={f.flat_id} onChange={(e) => set("flat_id", e.target.value)}>
              <option value="">Select</option>
              {flats.map((x) => <option key={x.id} value={x.id}>{x.number}</option>)}
            </Select>
          </div>
          <div>
            <Label>Name</Label>
            <Input data-testid="manual-name" value={f.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <Label>Mobile</Label>
            <Input
              data-testid="manual-mobile"
              value={f.mobile}
              onChange={(e) => set("mobile", e.target.value.replace(/\D/g, "").slice(0, 10))}
            />
          </div>
          <div>
            <Label>Donation (₹)</Label>
            <Input type="number" value={f.donation_rupees} onChange={(e) => set("donation_rupees", e.target.value)} />
          </div>
          {mode === "cash" && (
            <div>
              <Label>Handover batch</Label>
              <Input value={f.handover_batch} onChange={(e) => set("handover_batch", e.target.value)} />
            </div>
          )}
          {mode === "bank" && (
            <div>
              <Label>UTR / Reference</Label>
              <Input data-testid="manual-utr" value={f.utr} onChange={(e) => set("utr", e.target.value)} />
            </div>
          )}
          {mode === "cheque" && (
            <>
              <div>
                <Label>Cheque no</Label>
                <Input value={f.cheque_no} onChange={(e) => set("cheque_no", e.target.value)} />
              </div>
              <div>
                <Label>Bank</Label>
                <Input value={f.bank} onChange={(e) => set("bank", e.target.value)} />
              </div>
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
}

function useList(endpoint, key = "items") {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    api.get(endpoint).then((r) => setItems(r.data[key] || [])).catch(() => {}).finally(() => setLoading(false));
  }, [endpoint, key]);
  useEffect(load, [load]);
  return { items, loading, load, setItems };
}

function QueueCard({ title, rows, render, testid }) {
  return (
    <Card data-testid={testid}><CardBody>
      <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-brown-800/60">{title}</h4>
      {(!rows || rows.length === 0)
        ? <div className="text-sm text-brown-800/40">Empty</div>
        : <div className="space-y-2">{rows.map(render)}</div>}
    </CardBody></Card>
  );
}

function QueueRow({ label, onAct, actLabel }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-brown-800/10 px-3 py-2 text-sm">
      <span>{label}</span>
      <Button variant="admin" size="sm" onClick={onAct}><Check className="h-3.5 w-3.5" /> {actLabel}</Button>
    </div>
  );
}
