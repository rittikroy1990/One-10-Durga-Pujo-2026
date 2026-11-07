import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  RefreshCw, Download, Upload, Search, Wallet, Settings2, ExternalLink, Leaf,
} from "lucide-react";
import api from "../../lib/api";
import {
  Card, CardBody, Table, THead, TR, TH, TD, Button, StatusBadge, Spinner,
  Input, Label, Dialog,
} from "../../components/ui";
import ExportCsvButton from "../../components/ExportCsvButton";
import { formatDateIST, formatPaise } from "../../lib/utils";

const paymentLabel = (s) => {
  const v = String(s || "").toLowerCase();
  if (v === "paid") return "Paid";
  if (v === "complimentary") return "Complimentary";
  if (v === "partially_paid") return "Partial";
  if (v === "pending") return "Pending";
  if (v === "not_open") return "Not open";
  if (v === "cancelled") return "Cancelled";
  if (v === "expired") return "Expired";
  return v ? v.replace(/_/g, " ") : "—";
};

const CSV_COLUMNS = [
  { key: "ref", label: "Ref" },
  { key: "name", label: "Name" },
  { key: "mobile", label: "Mobile" },
  { key: "household", label: "Household", exportValue: (r) => `${r.tower_name || ""}, ${r.flat_number || ""}` },
  { key: "diet_label", label: "Plate", exportValue: (r) => r.diet_label || r.diet || "" },
  { key: "plate_qty", label: "Qty" },
  { key: "total", label: "Total (₹)", exportValue: (r) => ((r.total_amount_paise || 0) / 100).toFixed(2) },
  { key: "due", label: "Due (₹)", exportValue: (r) => ((r.amount_due_paise || 0) / 100).toFixed(2) },
  { key: "payment_status", label: "Payment" },
  { key: "created_at", label: "Ordered", exportValue: (r) => formatDateIST(r.created_at) },
];

export default function BijayaFoodAdmin() {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [q, setQ] = useState("");
  const [dietFilter, setDietFilter] = useState("");
  const [payFilter, setPayFilter] = useState("");
  const [pageEnabled, setPageEnabled] = useState(true);
  const [paymentEnabled, setPaymentEnabled] = useState(true);
  const [amountPaise, setAmountPaise] = useState(66000);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [recording, setRecording] = useState(null);
  const [recordForm, setRecordForm] = useState({ utr: "", amount: "", bank: false });
  const [recordBusy, setRecordBusy] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/admin/bijaya-food")
      .then((r) => {
        setItems(r.data.items || []);
        setSummary(r.data.summary || null);
        setPageEnabled(!!r.data.page_enabled);
        setPaymentEnabled(!!r.data.payment_enabled);
        setAmountPaise(Number(r.data.amount_paise) || 66000);
      })
      .catch(() => toast.error("Could not load Bijaya food orders"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/^#/, "");
    return items.filter((r) => {
      if (dietFilter && (r.diet || "") !== dietFilter) return false;
      if (payFilter === "paid" && !(r.paid_in_full || ["paid", "complimentary"].includes(r.payment_status))) return false;
      if (payFilter === "unpaid" && (r.paid_in_full || ["paid", "complimentary", "cancelled", "expired"].includes(r.payment_status))) return false;
      if (!needle) return true;
      return [r.name, r.mobile, r.tower_name, r.flat_number, r.voucher_no, r.id, r.ref, r.diet_label]
        .some((v) => String(v || "").toLowerCase().includes(needle));
    });
  }, [items, q, dietFilter, payFilter]);

  const downloadTemplate = async () => {
    setDownloading(true);
    try {
      const r = await api.get("/admin/bijaya-food/template", { responseType: "blob", params: { include_data: true } });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "bijaya_food_template.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Template downloaded");
    } catch {
      toast.error("Could not download template");
    } finally {
      setDownloading(false);
    }
  };

  const downloadExport = async () => {
    try {
      const r = await api.get("/admin/bijaya-food/export", { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "bijaya_food_orders.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Orders exported");
    } catch {
      toast.error("Could not export");
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
      const r = await api.post("/admin/bijaya-food/import", fd);
      setImportResult(r.data);
      toast.success(r.data.message || "Import done");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Import failed");
    } finally {
      setUploading(false);
    }
  };

  const savePage = async (patch) => {
    setSettingsBusy(true);
    try {
      const r = await api.put("/admin/bijaya-food/page", patch);
      setPageEnabled(!!r.data.page_enabled);
      setPaymentEnabled(!!r.data.payment_enabled);
      setAmountPaise(Number(r.data.amount_paise) || 66000);
      toast.success("Bijaya food settings saved");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not save settings");
    } finally {
      setSettingsBusy(false);
    }
  };

  const openRecord = (r) => {
    setRecording(r);
    setRecordForm({ utr: "", amount: String(Math.round((r.amount_due_paise || 0) / 100)), bank: false });
  };

  const submitRecord = async () => {
    if (!recording) return;
    const amount = Number(recordForm.amount);
    if (recordForm.utr.replace(/[^0-9a-z]/gi, "").length < 6) return toast.error("Enter the UTR from the screenshot");
    if (!(amount > 0)) return toast.error("Enter the amount shown on the screenshot");
    if (amount * 100 > (recording.amount_due_paise || 0)) {
      return toast.error(`More than the ${formatPaise(recording.amount_due_paise)} due`);
    }
    setRecordBusy(true);
    try {
      const res = await api.post(`/admin/food-subscriptions/${recording.id}/record-payment`, {
        utr: recordForm.utr,
        amount_rupees: amount,
        bank_verified: recordForm.bank,
      });
      toast.success(res.data.partial
        ? `Receipt ${res.data.receipt_no} — ${formatPaise(res.data.amount_due_after_paise)} still due`
        : `Receipt ${res.data.receipt_no} issued`);
      setRecording(null);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not record payment");
    } finally {
      setRecordBusy(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="bijaya-food-admin">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-brown-900">Bijaya Sammilani Food</h1>
          <p className="mt-1 max-w-2xl text-sm text-brown-800/65">
            Veg / non-veg plates at the same price. Download the CSV template, fill offline, upload — or record UPI payments from screenshots.
          </p>
          <p className="mt-1 text-xs text-brown-800/50">
            Public page: <a href="/food" target="_blank" rel="noreferrer" className="font-semibold text-vermilion-600 underline">/food</a>
            {" · "}
            <Link to="/admin/food" className="font-semibold text-vermilion-600 underline">Durga food subscriptions</Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="subtle" size="sm" onClick={load} data-testid="bijaya-refresh">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button variant="subtle" size="sm" onClick={downloadTemplate} disabled={downloading} data-testid="bijaya-template-download">
            <Download className="h-4 w-4" /> {downloading ? "…" : "Download template"}
          </Button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onUpload} data-testid="bijaya-template-file" />
          <Button variant="subtle" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()} data-testid="bijaya-template-upload">
            <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : "Upload filled"}
          </Button>
          <Button variant="subtle" size="sm" onClick={downloadExport} data-testid="bijaya-export-server">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <ExportCsvButton filename="bijaya_food_filtered.csv" columns={CSV_COLUMNS} items={shown} data-testid="bijaya-export-filtered" />
        </div>
      </div>

      {importResult ? (
        <div className="rounded-xl border border-sun-400/30 bg-sun-50 px-4 py-3 text-sm text-brown-900" data-testid="bijaya-import-result">
          {importResult.message}
          {!!(importResult.errors || []).length && (
            <ul className="mt-2 list-disc pl-5 text-xs text-brown-800/70">
              {importResult.errors.slice(0, 5).map((e) => (
                <li key={`${e.row}-${e.error}`}>Row {e.row}: {e.error}</li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardBody className="p-4">
          <div className="text-[10px] uppercase tracking-wide text-brown-800/45">Orders</div>
          <div className="font-display text-3xl text-brown-900">{summary?.orders ?? "—"}</div>
        </CardBody></Card>
        <Card><CardBody className="p-4">
          <div className="text-[10px] uppercase tracking-wide text-brown-800/45">Plates</div>
          <div className="font-display text-3xl text-brown-900">{summary?.plates ?? "—"}</div>
          <div className="mt-1 text-xs text-brown-800/55">
            Veg {summary?.veg_plates ?? 0} · Non-veg {summary?.nonveg_plates ?? 0}
          </div>
        </CardBody></Card>
        <Card><CardBody className="p-4">
          <div className="text-[10px] uppercase tracking-wide text-brown-800/45">Paid</div>
          <div className="font-display text-3xl text-emerald-700">{formatPaise(summary?.paid_paise || 0)}</div>
          <div className="mt-1 text-xs text-brown-800/55">{summary?.paid_count ?? 0} orders</div>
        </CardBody></Card>
        <Card><CardBody className="p-4">
          <div className="text-[10px] uppercase tracking-wide text-brown-800/45">Still due</div>
          <div className="font-display text-3xl text-vermilion-600">{formatPaise(summary?.due_paise || 0)}</div>
          <div className="mt-1 text-xs text-brown-800/55">{summary?.unpaid_count ?? 0} orders</div>
        </CardBody></Card>
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-center gap-3 p-4">
          <Settings2 className="h-4 w-4 text-vermilion-500" />
          <span className="text-sm font-semibold text-brown-900">Public page</span>
          <Button
            variant={pageEnabled ? "primary" : "subtle"}
            size="sm"
            disabled={settingsBusy}
            onClick={() => savePage({ page_enabled: !pageEnabled })}
            data-testid="bijaya-toggle-page"
          >
            {pageEnabled ? "Open" : "Closed"}
          </Button>
          <Button
            variant={paymentEnabled ? "primary" : "subtle"}
            size="sm"
            disabled={settingsBusy}
            onClick={() => savePage({ payment_enabled: !paymentEnabled })}
            data-testid="bijaya-toggle-payment"
          >
            Payment {paymentEnabled ? "on" : "off"}
          </Button>
          <span className="text-sm text-brown-800/60">Per plate {formatPaise(amountPaise)}</span>
          <a href="/food" target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-vermilion-600">
            Open public page <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brown-800/40" />
              <Input
                className="pl-9"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, mobile, flat, ref…"
                data-testid="bijaya-search"
              />
            </div>
            <select
              className="min-h-10 rounded-xl border border-sun-400/35 bg-white px-3 text-sm"
              value={dietFilter}
              onChange={(e) => setDietFilter(e.target.value)}
              data-testid="bijaya-filter-diet"
            >
              <option value="">All plates</option>
              <option value="veg">Veg</option>
              <option value="non_veg">Non-veg</option>
            </select>
            <select
              className="min-h-10 rounded-xl border border-sun-400/35 bg-white px-3 text-sm"
              value={payFilter}
              onChange={(e) => setPayFilter(e.target.value)}
              data-testid="bijaya-filter-pay"
            >
              <option value="">All payments</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </div>

          {loading ? (
            <div className="grid place-items-center py-16"><Spinner className="text-vermilion-500" /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Ref</TH>
                    <TH>Name</TH>
                    <TH>Flat</TH>
                    <TH>Plate</TH>
                    <TH className="text-right">Amount</TH>
                    <TH>Payment</TH>
                    <TH>Ordered</TH>
                    <TH />
                  </TR>
                </THead>
                <tbody>
                  {shown.map((r) => (
                    <TR key={r.id} data-testid={`bijaya-row-${r.ref}`}>
                      <TD className="font-semibold tabular-nums">#{r.ref}</TD>
                      <TD>
                        <div className="font-medium text-brown-900">{r.name}</div>
                        <div className="text-xs tabular-nums text-brown-800/55">{r.mobile}</div>
                      </TD>
                      <TD className="text-sm">{r.tower_name}, {r.flat_number}</TD>
                      <TD>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          r.diet === "veg" ? "bg-emerald-50 text-emerald-800" : "bg-vermilion-50 text-vermilion-700"
                        }`}>
                          {r.diet === "veg" ? <Leaf className="h-3 w-3" /> : null}
                          {r.diet_label || r.diet || "—"} × {r.plate_qty || 0}
                        </span>
                      </TD>
                      <TD className="text-right">
                        <div className="font-semibold tabular-nums">{formatPaise(r.total_amount_paise)}</div>
                        {r.amount_due_paise > 0 ? (
                          <div className="text-[10px] text-vermilion-600">Due {formatPaise(r.amount_due_paise)}</div>
                        ) : null}
                      </TD>
                      <TD><StatusBadge status={paymentLabel(r.payment_status)} /></TD>
                      <TD className="whitespace-nowrap text-xs text-brown-800/60">{formatDateIST(r.created_at)}</TD>
                      <TD className="text-right">
                        {["pending", "partially_paid"].includes(r.payment_status) && r.intent_id ? (
                          <Button variant="subtle" size="sm" onClick={() => openRecord(r)} data-testid={`bijaya-record-${r.ref}`}>
                            <Wallet className="h-3.5 w-3.5" /> Record pay
                          </Button>
                        ) : null}
                      </TD>
                    </TR>
                  ))}
                  {!shown.length ? (
                    <TR>
                      <TD colSpan={8} className="py-10 text-center text-sm text-brown-800/50">No Bijaya food orders match.</TD>
                    </TR>
                  ) : null}
                </tbody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>

      <Dialog open={!!recording} onClose={() => setRecording(null)} title="Record Bijaya payment">
        {recording ? (
          <div className="space-y-3" data-testid="bijaya-record-dialog">
            <p className="text-sm text-brown-800/70">
              #{recording.ref} · {recording.name} · {recording.diet_label} × {recording.plate_qty} · due {formatPaise(recording.amount_due_paise)}
            </p>
            <div>
              <Label required>UTR / UPI reference</Label>
              <Input value={recordForm.utr} onChange={(e) => setRecordForm({ ...recordForm, utr: e.target.value })} placeholder="From payment screenshot" data-testid="bijaya-record-utr" />
            </div>
            <div>
              <Label required>Amount (₹)</Label>
              <Input value={recordForm.amount} onChange={(e) => setRecordForm({ ...recordForm, amount: e.target.value })} inputMode="decimal" data-testid="bijaya-record-amount" />
            </div>
            <label className="flex items-start gap-2 text-sm text-brown-900">
              <input type="checkbox" className="mt-1" checked={recordForm.bank} onChange={(e) => setRecordForm({ ...recordForm, bank: e.target.checked })} />
              <span>I checked this UTR in the bank statement.</span>
            </label>
            <Button variant="primary" className="w-full" disabled={recordBusy} onClick={submitRecord} data-testid="bijaya-record-submit">
              {recordBusy ? "Saving…" : "Issue receipt"}
            </Button>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
