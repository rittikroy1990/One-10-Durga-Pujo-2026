import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { RefreshCw, Download, Upload, Settings2, Ticket, Search, MessageCircle, Wallet, Info } from "lucide-react";
import api from "../../lib/api";
import {
  Card, CardBody, Table, THead, TR, TH, TD, Button, StatusBadge, Spinner,
  Input, Label, Dialog,
} from "../../components/ui";
import ExportCsvButton from "../../components/ExportCsvButton";
import { formatDateIST, formatPaise } from "../../lib/utils";

function selectionSummary(row) {
  const sels = row.selections || [];
  if (!sels.length) return "—";
  return sels
    .map((s) => {
      const qty = Number(s.quantity) || 1;
      const label = s.item_id
        ? (s.meal_label || s.name || "Item")
        : `${s.day_label || s.day_code} ${s.meal_label || s.meal_code}`;
      const free = Number(s.complimentary_qty) || 0;
      const kids = Number(s.kid_qty) || 0;
      const base = qty > 1 ? `${label} × ${qty}` : label;
      const extra = [free ? `${free} complimentary` : "", kids ? `+${kids} kid${kids === 1 ? "" : "s"} below 7` : ""].filter(Boolean);
      return extra.length ? `${base} (${extra.join(", ")})` : base;
    })
    .join("; ");
}

const titleCase = (s) => String(s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function shortMenuDate(iso) {
  const d = iso ? new Date(`${iso}T00:00:00`) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";
}

function orderDays(row) {
  const days = [];
  for (const s of row.selections || []) {
    const code = s.item_id ? (s.item_day_code || s.menu_date || "menu") : (s.day_code || "menu");
    const label = s.item_id
      ? [titleCase(s.item_day_code), shortMenuDate(s.menu_date)].filter(Boolean).join(" · ") || "Menu"
      : s.day_label || titleCase(s.day_code);
    let d = days.find((x) => x.code === code);
    if (!d) days.push((d = { code, label, lines: [] }));
    const qty = Number(s.quantity) || 1;
    const free = Number(s.complimentary_qty) || 0;
    const rate = s.amount_paise != null ? Number(s.amount_paise) : null;
    d.lines.push({
      name: s.item_id ? (s.name || s.meal_label || "Item") : (s.meal_label || titleCase(s.meal_code)),
      diet: s.diet_label || "",
      qty,
      free,
      kids: Number(s.kid_qty) || 0,
      rate,
      amount: s.line_total_paise != null ? Number(s.line_total_paise) : rate != null ? rate * (qty - free) : null,
    });
  }
  return days;
}

function OrderDetail({ row }) {
  const days = orderDays(row);
  const all = days.flatMap((d) => d.lines);
  const plates = all.reduce((n, l) => n + l.qty, 0);
  const free = all.reduce((n, l) => n + l.free, 0);
  const kids = all.reduce((n, l) => n + l.kids, 0);
  const freeValue = all.reduce((n, l) => n + (l.rate || 0) * l.free, 0);
  const total = Number(row.total_amount_paise ?? all.reduce((n, l) => n + (l.amount || 0), 0));
  const due = Number(row.amount_due_paise || 0);
  return (
    <div className="space-y-3 text-xs text-brown-900" data-testid="food-order-detail">
      <div className="text-center">
        <div className="text-[10px] uppercase tracking-[0.3em] text-gold-600">One 10 Durgotsav 2026</div>
        <div className="font-display text-xl">Order #{row.ref}</div>
        {row.voucher_no ? <div className="font-semibold tracking-wide text-brown-800/70">{row.voucher_no}</div> : null}
      </div>
      <dl className="grid grid-cols-2 gap-y-1 rounded-lg bg-ivory-200 px-3 py-2">
        <dt className="text-brown-800/55">Name</dt><dd className="text-right font-semibold">{row.name || "—"}</dd>
        <dt className="text-brown-800/55">Tower / Flat</dt><dd className="text-right font-semibold">{row.tower_name}, {row.flat_number}</dd>
        <dt className="text-brown-800/55">Mobile</dt><dd className="text-right font-semibold tabular-nums">{row.mobile || "—"}</dd>
        <dt className="text-brown-800/55">Ordered</dt><dd className="text-right">{formatDateIST(row.created_at)}</dd>
        <dt className="text-brown-800/55">Payment</dt><dd className="text-right font-semibold uppercase">{paymentLabel(row.payment_status)}</dd>
      </dl>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-brown-800/15 text-[10px] uppercase tracking-wide text-brown-800/50">
            <th className="py-1 text-left font-semibold">Item</th>
            <th className="py-1 text-right font-semibold">Qty</th>
            <th className="py-1 pl-3 text-right font-semibold">Rate</th>
            <th className="py-1 pl-3 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        {days.map((d) => (
          <tbody key={d.code}>
            <tr>
              <td colSpan={4} className="pb-0.5 pt-2 text-[11px] font-bold uppercase tracking-wide text-vermilion-600">{d.label}</td>
            </tr>
            {d.lines.map((l, i) => (
              <tr key={i} className="border-b border-sun-400/20 align-top">
                <td className="py-1 pr-2">
                  <span className="font-medium">{l.name}</span>
                  {l.diet ? <span className="text-brown-800/55"> · {l.diet}</span> : null}
                  {l.free || l.kids ? (
                    <div className="text-[10px] font-semibold text-emerald-700">
                      {[l.free ? `${l.free} complimentary` : "", l.kids ? `+${l.kids} kid plate${l.kids === 1 ? "" : "s"} below 7 · ₹0` : ""].filter(Boolean).join(" · ")}
                    </div>
                  ) : null}
                </td>
                <td className="py-1 text-right tabular-nums">{l.qty}</td>
                <td className="whitespace-nowrap py-1 pl-3 text-right tabular-nums">{l.rate != null ? formatPaise(l.rate) : "—"}</td>
                <td className="whitespace-nowrap py-1 pl-3 text-right font-semibold tabular-nums">
                  {l.amount === 0 && l.free ? <span className="text-emerald-700">Free</span> : l.amount != null ? formatPaise(l.amount) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>

      <div className="space-y-0.5 border-t border-brown-800/15 pt-2">
        <div className="flex justify-between text-brown-800/70">
          <span>{plates} plate{plates === 1 ? "" : "s"}{free ? ` · ${free} complimentary` : ""}{kids ? ` · ${kids} kid plate${kids === 1 ? "" : "s"}` : ""}</span>
          <span>Subtotal {formatPaise(total + freeValue)}</span>
        </div>
        {freeValue ? (
          <div className="flex justify-between font-semibold text-emerald-700">
            <span>Complimentary</span><span>−{formatPaise(freeValue)}</span>
          </div>
        ) : null}
        <div className="flex justify-between text-sm font-bold">
          <span>Total</span><span className="tabular-nums">{formatPaise(total)}</span>
        </div>
        {total ? (
          <div className="flex justify-between text-brown-800/70">
            <span>Paid {formatPaise(Math.max(0, total - due))}</span>
            <span className={due ? "font-semibold text-vermilion-600" : "text-emerald-700"}>{due ? `Due ${formatPaise(due)}` : "Nothing due"}</span>
          </div>
        ) : null}
        {row.receipt_no ? <div className="text-brown-800/55">Receipt {row.receipt_no}</div> : null}
      </div>
    </div>
  );
}

function paymentLabel(status) {
  const s = (status || "").toLowerCase();
  if (s === "paid" || s === "captured" || s === "settled") return "paid";
  if (s === "not_open") return "unpaid";
  return status || "unpaid";
}

const COLS = [
  { key: "name", label: "Name" },
  { key: "mobile", label: "Mobile" },
  { key: "household", label: "Household", exportValue: (r) => `${r.tower_name || ""}, ${r.flat_number || ""}` },
  { key: "family_members", label: "People" },
  { key: "selection_count", label: "Meals" },
  { key: "meals_detail", label: "Meal details", exportValue: selectionSummary },
  { key: "payment_status", label: "Payment" },
  { key: "voucher_no", label: "Voucher" },
  { key: "coupon_no", label: "Coupons" },
  { key: "status", label: "Status" },
  { key: "created_at", label: "Subscribed at", exportValue: (r) => formatDateIST(r.created_at) },
];

export default function FoodAdmin() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingPrices, setSavingPrices] = useState(false);
  const [pricesOpen, setPricesOpen] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [detail, setDetail] = useState(null);
  const [priceForm, setPriceForm] = useState({
    breakfast: "70",
    lunch: "300",
    dinner: "300",
    payment_enabled: false,
  });
  const fileRef = useRef(null);
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const [busyId, setBusyId] = useState(null);
  const [waOnly, setWaOnly] = useState(false);
  const [recording, setRecording] = useState(null);
  const [recordForm, setRecordForm] = useState({ utr: "", amount: "", bank: false });
  const [recordBusy, setRecordBusy] = useState(false);

  const waCount = useMemo(() => items.filter((r) => r.whatsapp_posted_at).length, [items]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/^#/, "");
    const base = waOnly ? items.filter((r) => r.whatsapp_posted_at) : items;
    if (!needle) return base;
    return base.filter((r) => [r.name, r.mobile, r.tower_name, r.flat_number, r.voucher_no, r.coupon_no, r.id, r.ref]
      .some((v) => String(v || "").toLowerCase().includes(needle)));
  }, [items, q, waOnly]);

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
      return toast.error(`More than the ${formatPaise(recording.amount_due_paise)} due — overpayments aren't accepted`);
    }
    setRecordBusy(true);
    try {
      const res = await api.post(`/admin/food-subscriptions/${recording.id}/record-payment`, {
        utr: recordForm.utr,
        amount_rupees: amount,
        bank_verified: recordForm.bank,
      });
      toast.success(res.data.partial
        ? `Receipt ${res.data.receipt_no} issued — ${formatPaise(res.data.amount_due_after_paise)} still due`
        : `Receipt ${res.data.receipt_no} issued — voucher ready`);
      setRecording(null);
      load();
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not record payment");
    } finally {
      setRecordBusy(false);
    }
  };

  const load = useCallback(() => {
    setLoading(true);
    api.get("/admin/food-subscriptions")
      .then((r) => setItems(r.data.items || []))
      .catch(() => toast.error("Could not load food subscriptions"))
      .finally(() => setLoading(false));
  }, []);

  const loadPrices = useCallback(() => {
    api.get("/admin/food-subscriptions/prices")
      .then((r) => {
        const map = {};
        for (const p of r.data.prices || []) {
          if (p?.code) map[p.code] = String(Math.round((Number(p.amount_paise) || 0) / 100));
        }
        setPriceForm({
          breakfast: map.breakfast || "70",
          lunch: map.lunch || "300",
          dinner: map.dinner || "300",
          payment_enabled: !!r.data.payment_enabled,
        });
      })
      .catch(() => {});
  }, []);

  useEffect(load, [load]);
  useEffect(loadPrices, [loadPrices]);

  const savePrices = async () => {
    setSavingPrices(true);
    try {
      const r = await api.put("/admin/food-subscriptions/prices", {
        prices: {
          breakfast: Number(priceForm.breakfast),
          lunch: Number(priceForm.lunch),
          dinner: Number(priceForm.dinner),
        },
        payment_enabled: !!priceForm.payment_enabled,
      });
      toast.success(r.data.payment_enabled ? "Prices saved — UPI payment open" : "Prices saved");
      setPricesOpen(false);
      loadPrices();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not save prices");
    } finally {
      setSavingPrices(false);
    }
  };

  const issueCoupons = async (r, confirmBank = false) => {
    if (!confirmBank && !window.confirm(`Mark food coupons as given to ${r.name} (${r.tower_name}, ${r.flat_number}), voucher ${r.voucher_no || ""}? This can only be done once per voucher.`)) return;
    setBusyId(r.id);
    try {
      const res = await api.post(`/admin/food-subscriptions/${r.id}/coupon`, { confirm_bank_verified: confirmBank });
      const coupon = res.data.coupon || {};
      if (res.data.already_existed) {
        toast.error(`Coupons were already given for this voucher (${coupon.coupon_no}). Do not hand out again.`);
      } else {
        const list = (coupon.lines || [])
          .map((l) => `• ${l.day_label} ${l.meal_label}${l.diet_label ? ` (${l.diet_label})` : ""}: ${l.heads}${l.kids ? ` (incl. ${l.kids} kid${l.kids === 1 ? "" : "s"} below 7)` : ""}`)
          .join("\n");
        window.alert(`Recorded ${coupon.coupon_no}. Hand over these coupons:\n\n${list}\n\nTotal: ${coupon.slip_count || 0}`);
      }
      load();
    } catch (err) {
      const d = err?.response?.data?.detail;
      if (d?.code === "bank_unverified") {
        const list = (d.receipts || [])
          .map((x) => `• ${x.receipt_no}: ₹${Math.round((x.amount_paise || 0) / 100)} · UTR ${x.utr || "—"}`)
          .join("\n");
        setBusyId(null);
        if (window.confirm(`${d.message}\n\n${list}\n\nPress OK only if you have seen these payments in the bank account. Your name is recorded.`)) {
          issueCoupons(r, true);
        }
        return;
      }
      toast.error(typeof d === "string" ? d : "Could not mark coupons as given");
    } finally {
      setBusyId(null);
    }
  };

  const cancelOrder = async (r) => {
    const paid = r.paid_in_full ? " It is fully paid — the paid amount stays on its receipts; refund it separately if needed." : "";
    const reason = window.prompt(`Cancel ${r.name}'s order (${r.tower_name}, ${r.flat_number})? Its complimentary meals go back to the flat and its voucher stops being valid.${paid}\n\nReason:`);
    if (!reason) return;
    setBusyId(r.id);
    try {
      const res = await api.post(`/admin/food-subscriptions/${r.id}/cancel`, { reason });
      const amt = res.data.amount_paid_paise || 0;
      toast.success(amt ? `Order cancelled — ₹${Math.round(amt / 100)} was paid on it; refund or adjust separately` : "Order cancelled");
      load();
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not cancel the order");
    } finally {
      setBusyId(null);
    }
  };

  const voidCoupons = async (r) => {
    const reason = window.prompt(`Undo "coupons given" (${r.coupon_no})? Only do this if the coupons were not handed over, or have been collected back.\n\nReason:`);
    if (!reason) return;
    setBusyId(r.id);
    try {
      const res = await api.post(`/admin/food-coupons/${r.coupon_id}/void`, { reason });
      toast.success(`Undone (${res.data.coupon_no}) — coupons can be marked as given again`);
      load();
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not undo");
    } finally {
      setBusyId(null);
    }
  };

  const downloadSample = async () => {
    setDownloading(true);
    try {
      const r = await api.get("/admin/food-subscriptions/template", {
        params: { include_data: true },
        responseType: "blob",
      });
      const blob = new Blob([r.data], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "food_subscriptions_template.csv";
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
      const r = await api.post("/admin/food-subscriptions/import", fd);
      setImportResult(r.data);
      toast.success(r.data.message || "Import complete");
      load();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div data-testid="food-admin-page" className="space-y-5">
      <div>
        <h1 className="mb-1 font-display text-4xl">Food subscriptions</h1>
        <p className="text-sm text-brown-800/50">
          Meal orders. Download the sample, fill it, upload to update the database — or adjust meal prices.
          Meal headcounts, per-flat totals and follow-ups are on{" "}
          <Link to="/admin/food-reports" className="font-medium text-vermilion-600 hover:underline">Food reports</Link>.
        </p>
      </div>

      <Card data-testid="food-list-card"><CardBody>
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          <div className="relative mr-auto w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-brown-800/40" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, flat, order #, voucher or coupon no"
              className="pl-8"
              data-testid="food-admin-search"
            />
          </div>
          <Button
            variant={waOnly ? "admin" : "subtle"}
            size="sm"
            onClick={() => setWaOnly((v) => !v)}
            data-testid="food-whatsapp-filter"
          >
            <MessageCircle className="h-4 w-4" /> Posted on WhatsApp ({waCount})
          </Button>
          <Button
            variant="subtle"
            size="sm"
            disabled={downloading}
            onClick={downloadSample}
            data-testid="food-template-download-btn"
          >
            <Download className="h-4 w-4" /> {downloading ? "…" : "Download sample"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={onUpload}
            data-testid="food-template-file-input"
          />
          <Button
            variant="subtle"
            size="sm"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            data-testid="food-template-upload-btn"
          >
            <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : "Upload filled"}
          </Button>
          <ExportCsvButton
            filename="food_subscriptions.csv"
            columns={COLS}
            items={items}
            data-testid="food-export-btn"
          />
          <Button variant="subtle" size="sm" onClick={load} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="admin"
            size="sm"
            onClick={() => setPricesOpen(true)}
            data-testid="food-prices-open-btn"
          >
            <Settings2 className="h-4 w-4" /> Meal prices
          </Button>
        </div>

        {importResult && (
          <div
            className="mb-3 rounded-lg border border-sun-400/30 bg-sun-50/60 px-3 py-2 text-sm text-brown-800/80"
            data-testid="food-import-result"
          >
            {importResult.message}
            {!!(importResult.errors || []).length && (
              <ul className="mt-1 list-disc pl-5 text-xs text-vermilion-700">
                {importResult.errors.slice(0, 5).map((e) => (
                  <li key={`${e.row}-${e.error}`}>
                    Row {e.row}: {e.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {loading ? (
          <Spinner className="text-vermilion-500" />
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-sm text-brown-800/45">
            No food subscriptions yet. Download the sample to start capturing.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Mobile</TH>
                  <TH>Household</TH>
                  <TH right>People</TH>
                  <TH>Order</TH>
                  <TH>Payment</TH>
                  <TH>Voucher</TH>
                  <TH>Coupons</TH>
                  <TH>Subscribed at</TH>
                </TR>
              </THead>
              <tbody>
                {shown.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-medium">
                      {r.name}
                      <div className="text-[11px] font-normal tabular-nums text-brown-800/50">#{r.ref}</div>
                    </TD>
                    <TD>{r.mobile}</TD>
                    <TD>
                      {r.tower_name}
                      {r.flat_number ? `, ${r.flat_number}` : ""}
                    </TD>
                    <TD right>{r.family_members || 1}</TD>
                    <TD>
                      <button
                        type="button"
                        onClick={() => setDetail(r)}
                        className="grid h-8 w-8 place-items-center rounded-full text-vermilion-600 ring-1 ring-vermilion-500/30 hover:bg-vermilion-50"
                        aria-label={`Order #${r.ref} details`}
                        title={`${r.selection_count || 0} selected — tap for prices and quantities`}
                        data-testid={`food-order-info-${r.id}`}
                      >
                        <Info className="h-4 w-4" />
                      </button>
                    </TD>
                    <TD>
                      <StatusBadge status={paymentLabel(r.payment_status)} />
                      {r.whatsapp_posted_at ? (
                        <div className="mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-600/20" title={`Posted ${formatDateIST(r.whatsapp_posted_at)}`}>
                          <MessageCircle className="h-3 w-3" /> Posted on WhatsApp
                        </div>
                      ) : null}
                      {["pending", "partially_paid"].includes(r.payment_status) && r.intent_id ? (
                        <div className="mt-1">
                          <Button variant="admin" size="sm" onClick={() => openRecord(r)} data-testid={`food-record-payment-${r.id}`}>
                            <Wallet className="h-3.5 w-3.5" /> Record payment
                          </Button>
                          <div className="mt-0.5 text-[11px] text-brown-800/55">{formatPaise(r.amount_due_paise)} due</div>
                        </div>
                      ) : null}
                    </TD>
                    <TD className="whitespace-nowrap text-xs">
                      {r.paid_in_full ? (
                        <Link to={`/food/voucher/${r.voucher_token}`} target="_blank" className="font-medium text-vermilion-600 hover:underline">
                          {r.voucher_no || "View voucher"}
                        </Link>
                      ) : (
                        <span className="text-brown-800/45">After full payment</span>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-xs">
                      {r.coupon_id ? (
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-emerald-700" title={r.coupon_no}>✓ Given</span>
                          <Button variant="subtle" size="sm" disabled={busyId === r.id} onClick={() => voidCoupons(r)} data-testid={`food-void-coupons-${r.id}`}>
                            Undo
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          {r.paid_in_full ? (
                            <Button variant="admin" size="sm" disabled={busyId === r.id} onClick={() => issueCoupons(r)} data-testid={`food-issue-coupons-${r.id}`}>
                              <Ticket className="h-3.5 w-3.5" /> {busyId === r.id ? "Saving…" : "Mark coupons given"}
                            </Button>
                          ) : null}
                          {["cancelled", "expired"].includes(r.payment_status) ? (
                            <span className="text-brown-800/45">—</span>
                          ) : (
                            <Button variant="subtle" size="sm" disabled={busyId === r.id} onClick={() => cancelOrder(r)} data-testid={`food-cancel-order-${r.id}`}>
                              Cancel order
                            </Button>
                          )}
                        </div>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-xs tabular-nums">{formatDateIST(r.created_at)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </CardBody></Card>

      <Dialog
        open={!!detail}
        onClose={() => setDetail(null)}
        title="Order details"
        size="sm"
        footer={<Button variant="subtle" onClick={() => setDetail(null)}>Close</Button>}
      >
        {detail ? <OrderDetail row={detail} /> : null}
      </Dialog>

      <Dialog
        open={!!recording}
        onClose={() => setRecording(null)}
        title={recording ? `Record payment · Order #${recording.ref}` : "Record payment"}
        footer={(
          <>
            <Button variant="subtle" onClick={() => setRecording(null)}>Cancel</Button>
            <Button variant="admin" onClick={submitRecord} disabled={recordBusy} data-testid="food-record-save">
              {recordBusy ? "Saving…" : "Record & issue receipt"}
            </Button>
          </>
        )}
      >
        {recording ? (
          <div className="space-y-3 text-sm">
            <p className="text-brown-800/65">
              {recording.name} · {recording.tower_name}, {recording.flat_number} — <b>{formatPaise(recording.amount_due_paise)}</b> due.
              Match the order # in the WhatsApp message, then copy the UTR and amount from the screenshot.
            </p>
            <div>
              <Label required>UTR / UPI reference</Label>
              <Input value={recordForm.utr} onChange={(e) => setRecordForm((f) => ({ ...f, utr: e.target.value }))} placeholder="12-digit UPI transaction ID" data-testid="food-record-utr" />
            </div>
            <div>
              <Label required>Amount paid ₹</Label>
              <Input type="number" min={1} step="1" value={recordForm.amount} onChange={(e) => setRecordForm((f) => ({ ...f, amount: e.target.value }))} data-testid="food-record-amount" />
              <p className="mt-1 text-xs text-brown-800/50">Never more than the amount due. A lower amount is recorded as a part payment.</p>
            </div>
            <label className="flex items-start gap-2 text-brown-800/80">
              <input type="checkbox" className="mt-1" checked={recordForm.bank} onChange={(e) => setRecordForm((f) => ({ ...f, bank: e.target.checked }))} data-testid="food-record-bank" />
              <span>I checked this UTR in the bank statement. Leave unticked if you only saw the screenshot — coupons will then wait for bank confirmation.</span>
            </label>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={pricesOpen}
        onClose={() => setPricesOpen(false)}
        title="Meal prices"
        footer={(
          <>
            <Button variant="subtle" onClick={() => setPricesOpen(false)}>Cancel</Button>
            <Button
              variant="admin"
              onClick={savePrices}
              disabled={savingPrices}
              data-testid="food-prices-save-btn"
            >
              {savingPrices ? "Saving…" : "Save prices"}
            </Button>
          </>
        )}
      >
        <p className="mb-3 text-sm text-brown-800/55">
          Breakfast / Lunch / Dinner in rupees. When payment is open, residents pay via the Food UPI QR.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Breakfast ₹</Label>
            <Input
              data-testid="food-price-breakfast"
              type="number"
              min={0}
              step="1"
              value={priceForm.breakfast}
              onChange={(e) => setPriceForm((f) => ({ ...f, breakfast: e.target.value }))}
            />
          </div>
          <div>
            <Label>Lunch ₹</Label>
            <Input
              data-testid="food-price-lunch"
              type="number"
              min={0}
              step="1"
              value={priceForm.lunch}
              onChange={(e) => setPriceForm((f) => ({ ...f, lunch: e.target.value }))}
            />
          </div>
          <div>
            <Label>Dinner ₹</Label>
            <Input
              data-testid="food-price-dinner"
              type="number"
              min={0}
              step="1"
              value={priceForm.dinner}
              onChange={(e) => setPriceForm((f) => ({ ...f, dinner: e.target.value }))}
            />
          </div>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm text-brown-800/80">
          <input
            type="checkbox"
            data-testid="food-payment-enabled"
            checked={!!priceForm.payment_enabled}
            onChange={(e) => setPriceForm((f) => ({ ...f, payment_enabled: e.target.checked }))}
            className="h-4 w-4"
          />
          Payment open (UPI QR)
        </label>
      </Dialog>
    </div>
  );
}
