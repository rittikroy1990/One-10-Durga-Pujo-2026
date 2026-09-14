import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Receipt, Plus, RefreshCw, Upload, ExternalLink, Ban } from "lucide-react";
import api from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import {
  Card, CardBody, Table, THead, TR, TH, TD, StatusBadge, Button, Tabs,
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
  return perms.has("expense:approve") || perms.has("accounting:post");
}

export default function Expenses() {
  const { user } = useAuth();
  const [tab, setTab] = useState("record");
  const writeOk = canWriteExpenses(user);

  return (
    <div data-testid="expenses-page">
      <h1 className="mb-1 font-display text-4xl">Expenses</h1>
      <p className="mb-4 text-sm text-brown-800/50">
        Record spends with bills. Totals feed Control Tower cash position.
      </p>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "record", label: "Record" },
          { value: "list", label: "All" },
          { value: "summary", label: "By category" },
        ]}
      />
      {tab === "record" && <RecordExpense writeOk={writeOk} onRecorded={() => setTab("list")} />}
      {tab === "list" && <ExpenseList writeOk={writeOk} />}
      {tab === "summary" && <ExpenseSummary />}
    </div>
  );
}

function RecordExpense({ writeOk, onRecorded }) {
  const [categories, setCategories] = useState([]);
  const [busy, setBusy] = useState(false);
  const [bill, setBill] = useState(null);
  const fileRef = useRef(null);
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

  useEffect(() => {
    api.get("/admin/expenses/categories")
      .then((r) => {
        const items = r.data.items || [];
        setCategories(items);
        if (items.length && !items.find((c) => c.code === form.account_code)) {
          setForm((f) => ({ ...f, account_code: items[0].code }));
        }
      })
      .catch(() => toast.error("Could not load expense categories"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!writeOk) {
      toast.error("You do not have permission to record expenses.");
      return;
    }
    const amt = Number(form.amount_rupees);
    if (!form.payee.trim()) {
      toast.error("Payee is required");
      return;
    }
    if (!form.purpose.trim()) {
      toast.error("Purpose is required");
      return;
    }
    if (Number.isNaN(amt) || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
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
      onRecorded?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not record expense");
    } finally {
      setBusy(false);
    }
  };

  if (!writeOk) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-amber-800">
            Only treasurers / convenors can record expenses. You can still view All and By category.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card data-testid="expense-record-card">
      <CardBody>
        <div className="mb-4 flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-vermilion-500/10 text-vermilion-600">
            <Plus className="h-5 w-5" />
          </span>
          <div>
            <div className="font-display text-xl text-brown-900">Record paid expense</div>
            <p className="text-sm text-brown-800/55">
              Saves as paid immediately — reduces bank or cash on Control Tower.
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label required>Date</Label>
            <Input type="date" value={form.date} onChange={set("date")} data-testid="expense-date" />
          </div>
          <div>
            <Label required>Amount (₹)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.amount_rupees}
              onChange={set("amount_rupees")}
              placeholder="0"
              data-testid="expense-amount"
            />
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
              <Button type="button" variant="subtle" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4" /> {bill ? "Change file" : "Upload bill"}
              </Button>
              <input
                ref={fileRef}
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
          <div className="sm:col-span-2">
            <Button type="submit" variant="admin" disabled={busy} data-testid="expense-submit-btn">
              <Receipt className="h-4 w-4" /> {busy ? "Saving…" : "Record expense"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function ExpenseList({ writeOk }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [accountCode, setAccountCode] = useState("");
  const [paidFrom, setPaidFrom] = useState("");
  const [categories, setCategories] = useState([]);
  const [voiding, setVoiding] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    if (status) params.status = status;
    if (accountCode) params.account_code = accountCode;
    if (paidFrom) params.paid_from = paidFrom;
    api.get("/admin/expenses", { params })
      .then((r) => setItems(r.data.items || []))
      .catch(() => toast.error("Could not load expenses"))
      .finally(() => setLoading(false));
  }, [status, accountCode, paidFrom]);

  useEffect(() => {
    api.get("/admin/expenses/categories").then((r) => setCategories(r.data.items || [])).catch(() => {});
  }, []);
  useEffect(load, [load]);

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

  return (
    <Card data-testid="expense-list-card">
      <CardBody>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <div>
            <Label>Status</Label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="min-w-[120px]">
              <option value="">All</option>
              <option value="paid">Paid</option>
              <option value="voided">Voided</option>
              <option value="submitted">Submitted</option>
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
          <Button variant="subtle" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
          <ExportCsvButton filename="expenses.csv" columns={exportCols} items={items} data-testid="expenses-export-csv" />
        </div>

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
                    <div className="text-xs text-brown-800/45 line-clamp-1">{row.purpose}</div>
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
      </CardBody>
    </Card>
  );
}

function ExpenseSummary() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/admin/expenses")
      .then((r) => setSummary(r.data.summary || null))
      .catch(() => toast.error("Could not load summary"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const byCat = useMemo(() => summary?.by_category || [], [summary]);
  const byFrom = useMemo(() => summary?.by_paid_from || [], [summary]);

  return (
    <div className="space-y-4" data-testid="expense-summary">
      <div className="flex justify-end">
        <Button variant="subtle" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
      </div>
      {loading || !summary ? (
        <Spinner className="text-vermilion-500" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card><CardBody>
              <div className="text-[10px] uppercase tracking-wider text-brown-800/45">Paid total</div>
              <div className="mt-1 font-display text-3xl text-vermilion-600">{formatPaise(summary.paid_total_paise)}</div>
            </CardBody></Card>
            <Card><CardBody>
              <div className="text-[10px] uppercase tracking-wider text-brown-800/45">Paid expenses</div>
              <div className="mt-1 font-display text-3xl">{summary.count_paid}</div>
            </CardBody></Card>
            <Card><CardBody>
              <div className="text-[10px] uppercase tracking-wider text-brown-800/45">All records</div>
              <div className="mt-1 font-display text-3xl">{summary.count_all}</div>
            </CardBody></Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardBody>
              <h3 className="mb-3 font-display text-xl">By category</h3>
              {!byCat.length ? (
                <p className="text-sm text-brown-800/45">No paid expenses yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {byCat.map((row) => (
                    <li key={row.account_code} className="flex items-center justify-between gap-2 border-b border-sun-400/20 pb-2">
                      <span>{row.name} <span className="text-xs text-brown-800/40">({row.account_code})</span></span>
                      <span className="font-medium tabular-nums">{formatPaise(row.amount_paise)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody></Card>
            <Card><CardBody>
              <h3 className="mb-3 font-display text-xl">By paid from</h3>
              {!byFrom.length ? (
                <p className="text-sm text-brown-800/45">No paid expenses yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {byFrom.map((row) => (
                    <li key={row.paid_from} className="flex items-center justify-between gap-2 border-b border-sun-400/20 pb-2">
                      <span className="capitalize">{row.paid_from}</span>
                      <span className="font-medium tabular-nums">{formatPaise(row.amount_paise)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 text-xs text-brown-800/50">
                Closing cash position on Control Tower updates when expenses are paid or voided.
              </p>
            </CardBody></Card>
          </div>
        </>
      )}
    </div>
  );
}
