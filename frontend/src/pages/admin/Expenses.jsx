import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Receipt, Plus, RefreshCw, Upload, Download, ExternalLink, Ban } from "lucide-react";
import api from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import {
  Card, CardBody, Table, THead, TR, TH, TD, StatusBadge, Button, Dialog,
  Label, Input, Select, Spinner,
} from "../../components/ui";
import { formatPaise, formatDateIST } from "../../lib/utils";
import ExportCsvButton from "../../components/ExportCsvButton";

function mediaUrl(path) {
  if (!path) return "";
  if (path.startsWith("http") || path.startsWith("/")) return path;
  return `/${path}`;
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function canWriteExpenses(user) {
  const perms = new Set(user?.permissions || []);
  return perms.has("expense:create") || perms.has("expense:approve") || perms.has("accounting:post");
}

export default function Expenses() {
  const { user } = useAuth();
  const writeOk = canWriteExpenses(user);
  const importRef = useRef(null);
  const billRef = useRef(null);

  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [status, setStatus] = useState("");
  const [accountCode, setAccountCode] = useState("");
  const [paidFrom, setPaidFrom] = useState("");
  const [voiding, setVoiding] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bill, setBill] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [form, setForm] = useState({
    date: todayISO(),
    payee: "",
    purpose: "",
    account_code: "5900",
    amount_rupees: "",
    paid_from: "bank",
    payment_mode: "upi",
    utr: "",
    notes: "",
  });

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    if (status) params.status = status;
    if (accountCode) params.account_code = accountCode;
    if (paidFrom) params.paid_from = paidFrom;
    api.get("/admin/expenses", { params })
      .then((r) => {
        setItems(r.data.items || []);
        setSummary(r.data.summary || null);
      })
      .catch(() => toast.error("Could not load expenses"))
      .finally(() => setLoading(false));
  }, [status, accountCode, paidFrom]);

  useEffect(() => {
    api.get("/admin/expenses/categories")
      .then((r) => {
        const list = r.data.items || [];
        setCategories(list);
        if (list.length && !list.find((c) => c.code === form.account_code)) {
          setForm((f) => ({ ...f, account_code: list[0].code }));
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(load, [load]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const downloadSample = async () => {
    setDownloading(true);
    try {
      const r = await api.get("/admin/expenses/template", { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "one10_expense_template.xlsx";
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
    if (!writeOk) {
      toast.error("You do not have permission to import expenses.");
      return;
    }
    setUploading(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/admin/expenses/import", fd);
      setImportResult(r.data);
      toast.success(r.data.message || "Import complete");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Import failed");
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!writeOk) {
      toast.error("You do not have permission to record expenses.");
      return;
    }
    const amt = Number(form.amount_rupees);
    if (!form.payee.trim()) return toast.error("Payee is required");
    if (!form.purpose.trim()) return toast.error("Purpose is required");
    if (Number.isNaN(amt) || amt <= 0) return toast.error("Enter a valid amount");
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (bill) fd.append("bill", bill);
      const r = await api.post("/admin/expenses", fd);
      toast.success(`Expense recorded · ${r.data.voucher_no || "paid"}`);
      setForm({
        date: todayISO(),
        payee: "",
        purpose: "",
        account_code: form.account_code,
        amount_rupees: "",
        paid_from: "bank",
        payment_mode: "upi",
        utr: "",
        notes: "",
      });
      setBill(null);
      setOpen(false);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not record expense");
    } finally {
      setBusy(false);
    }
  };

  const voidExpense = async (row) => {
    if (!writeOk) return;
    if (!window.confirm(`Void expense ${row.voucher_no || row.id}? This reverses the ledger and restores balance.`)) return;
    setVoiding(row.id);
    try {
      await api.post(`/admin/expenses/${row.id}/void`, { reason: "Voided from Expenses admin" });
      toast.success("Expense voided");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not void expense");
    } finally {
      setVoiding("");
    }
  };

  const exportCols = [
    { key: "date", label: "Date" },
    { key: "voucher_no", label: "Voucher" },
    { key: "payee", label: "Payee" },
    { key: "purpose", label: "Purpose" },
    { key: "account_name", label: "Category", exportValue: (r) => r.account_name || r.account_code },
    { key: "amount_paise", label: "Amount (₹)", exportValue: (r) => (Number(r.amount_paise || 0) / 100).toFixed(2) },
    { key: "paid_from", label: "Paid from" },
    { key: "payment_mode", label: "Mode" },
    { key: "utr", label: "UTR" },
    { key: "status", label: "Status" },
  ];

  const byCat = useMemo(() => summary?.by_category || [], [summary]);

  return (
    <div data-testid="expenses-page" className="space-y-5">
      <div>
        <h1 className="mb-1 font-display text-4xl">Expenses</h1>
        <p className="text-sm text-brown-800/50">
          Paid spends with bills. Download the sample Excel, fill it, upload to update the database — or record one at a time.
        </p>
      </div>

      {summary && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card><CardBody className="p-4">
            <div className="text-[10px] uppercase tracking-wider text-brown-800/45">Paid total</div>
            <div className="mt-1 font-display text-2xl text-vermilion-600">{formatPaise(summary.paid_total_paise)}</div>
          </CardBody></Card>
          <Card><CardBody className="p-4">
            <div className="text-[10px] uppercase tracking-wider text-brown-800/45">Paid expenses</div>
            <div className="mt-1 font-display text-2xl">{summary.count_paid}</div>
          </CardBody></Card>
          <Card><CardBody className="p-4">
            <div className="text-[10px] uppercase tracking-wider text-brown-800/45">Top category</div>
            <div className="mt-1 truncate font-display text-lg">
              {byCat[0] ? `${byCat[0].name} · ${formatPaise(byCat[0].amount_paise)}` : "—"}
            </div>
          </CardBody></Card>
        </div>
      )}

      <Card data-testid="expense-list-card"><CardBody>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label>Status</Label>
              <Select value={status} onChange={(e) => setStatus(e.target.value)} className="min-w-[120px]">
                <option value="">All</option>
                <option value="paid">Paid</option>
                <option value="voided">Voided</option>
              </Select>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={accountCode} onChange={(e) => setAccountCode(e.target.value)} className="min-w-[160px]">
                <option value="">All</option>
                {categories.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Paid from</Label>
              <Select value={paidFrom} onChange={(e) => setPaidFrom(e.target.value)} className="min-w-[120px]">
                <option value="">All</option>
                <option value="bank">Bank</option>
                <option value="cash">Cash</option>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="subtle" size="sm" disabled={downloading} onClick={downloadSample} data-testid="expense-template-download">
              <Download className="h-4 w-4" /> {downloading ? "…" : "Download sample"}
            </Button>
            <input
              ref={importRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={onUpload}
              data-testid="expense-import-input"
            />
            <Button
              variant="subtle"
              size="sm"
              disabled={uploading || !writeOk}
              onClick={() => importRef.current?.click()}
              data-testid="expense-import-upload"
            >
              <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : "Upload filled"}
            </Button>
            <ExportCsvButton filename="expenses.csv" columns={exportCols} items={items} data-testid="expenses-export-csv" />
            <Button variant="subtle" size="sm" onClick={load} aria-label="Refresh"><RefreshCw className="h-4 w-4" /></Button>
            <Button
              variant="admin"
              size="sm"
              disabled={!writeOk}
              onClick={() => setOpen(true)}
              data-testid="expense-record-btn"
            >
              <Plus className="h-4 w-4" /> Record expense
            </Button>
          </div>
        </div>

        {importResult && (
          <div className="mb-3 rounded-lg border border-sun-400/30 bg-sun-50/60 px-3 py-2 text-sm text-brown-800/80" data-testid="expense-import-result">
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

        {!writeOk && (
          <p className="mb-3 text-sm text-amber-800">
            View only — treasurers / convenors can record, import and void expenses.
          </p>
        )}

        {loading ? <Spinner className="text-vermilion-500" /> : (
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Voucher</TH>
                <TH>Payee</TH>
                <TH>Category</TH>
                <TH right>Amount</TH>
                <TH>From</TH>
                <TH>Status</TH>
                <TH>Bill</TH>
                <TH>Actions</TH>
              </TR>
            </THead>
            <tbody>
              {items.length === 0 && (
                <TR><TD colSpan={9} className="text-center text-brown-800/45">No expenses yet.</TD></TR>
              )}
              {items.map((row) => (
                <TR key={row.id} data-testid={`expense-row-${row.id}`}>
                  <TD>{row.date || formatDateIST(row.created_at)}</TD>
                  <TD className="font-mono text-xs">{row.voucher_no || "—"}</TD>
                  <TD>
                    <div className="font-medium">{row.payee || row.claimant_name || "—"}</div>
                    <div className="line-clamp-1 text-xs text-brown-800/45">{row.purpose}</div>
                  </TD>
                  <TD>{row.account_name || row.account_code}</TD>
                  <TD right>{formatPaise(row.amount_paise)}</TD>
                  <TD className="capitalize">{row.paid_from || "—"}</TD>
                  <TD><StatusBadge status={row.status} /></TD>
                  <TD>
                    {row.bill_url ? (
                      <a href={mediaUrl(row.bill_url)} target="_blank" rel="noreferrer" className="inline-flex text-vermilion-600" data-testid={`expense-bill-${row.id}`}>
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : "—"}
                  </TD>
                  <TD>
                    {writeOk && row.status === "paid" && (
                      <Button
                        variant="subtle"
                        size="sm"
                        disabled={voiding === row.id}
                        onClick={() => voidExpense(row)}
                        data-testid={`expense-void-${row.id}`}
                      >
                        <Ban className="h-3.5 w-3.5" /> {voiding === row.id ? "…" : "Void"}
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </CardBody></Card>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Record paid expense"
        size="lg"
        footer={(
          <>
            <Button variant="subtle" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="admin" onClick={submit} disabled={busy || !writeOk} data-testid="expense-submit-btn">
              <Receipt className="h-4 w-4" /> {busy ? "Saving…" : "Record expense"}
            </Button>
          </>
        )}
      >
        <p className="mb-3 text-sm text-brown-800/55">
          Saves as paid immediately — reduces bank or cash on Control Tower.
        </p>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" data-testid="expense-record-form">
          <div>
            <Label required>Date</Label>
            <Input type="date" value={form.date} onChange={set("date")} data-testid="expense-date" />
          </div>
          <div>
            <Label required>Amount (₹)</Label>
            <Input type="number" min={0} step="0.01" value={form.amount_rupees} onChange={set("amount_rupees")} placeholder="0" data-testid="expense-amount" />
          </div>
          <div className="sm:col-span-2">
            <Label required>Payee</Label>
            <Input value={form.payee} onChange={set("payee")} placeholder="Vendor or person paid" data-testid="expense-payee" />
          </div>
          <div className="sm:col-span-2">
            <Label required>Purpose</Label>
            <Input value={form.purpose} onChange={set("purpose")} placeholder="What was this for?" data-testid="expense-purpose" />
          </div>
          <div>
            <Label required>Category</Label>
            <Select value={form.account_code} onChange={set("account_code")} data-testid="expense-category">
              {categories.map((c) => (
                <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label required>Paid from</Label>
            <Select value={form.paid_from} onChange={set("paid_from")} data-testid="expense-paid-from">
              <option value="bank">Bank</option>
              <option value="cash">Cash on hand</option>
            </Select>
          </div>
          <div>
            <Label required>Payment mode</Label>
            <Select value={form.payment_mode} onChange={set("payment_mode")} data-testid="expense-payment-mode">
              <option value="upi">UPI</option>
              <option value="neft">NEFT / IMPS</option>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
            </Select>
          </div>
          <div>
            <Label>UTR / reference</Label>
            <Input value={form.utr} onChange={set("utr")} placeholder="Optional for bank/UPI" data-testid="expense-utr" />
          </div>
          <div className="sm:col-span-2">
            <Label>Bill / receipt</Label>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <Button type="button" variant="subtle" size="sm" onClick={() => billRef.current?.click()}>
                <Upload className="h-4 w-4" /> {bill ? "Change file" : "Upload bill"}
              </Button>
              <input
                ref={billRef}
                type="file"
                accept="image/*,.pdf,application/pdf"
                className="hidden"
                data-testid="expense-bill-input"
                onChange={(e) => setBill(e.target.files?.[0] || null)}
              />
              {bill ? (
                <span className="text-xs text-brown-800/60">{bill.name}</span>
              ) : (
                <span className="text-xs text-amber-800/80">Recommended — attach invoice or payment screenshot</span>
              )}
            </div>
          </div>
          <div className="sm:col-span-2">
            <Label>Notes</Label>
            <Input value={form.notes} onChange={set("notes")} placeholder="Internal note (optional)" data-testid="expense-notes" />
          </div>
        </form>
      </Dialog>
    </div>
  );
}
