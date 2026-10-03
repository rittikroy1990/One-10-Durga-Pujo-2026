import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { RefreshCw, Download, Upload, Settings2, Ticket, Search } from "lucide-react";
import api from "../../lib/api";
import {
  Card, CardBody, Table, THead, TR, TH, TD, Button, StatusBadge, Spinner,
  Input, Label, Dialog,
} from "../../components/ui";
import ExportCsvButton from "../../components/ExportCsvButton";
import { formatDateIST } from "../../lib/utils";

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
      const base = qty > 1 ? `${label} × ${qty}` : label;
      return free ? `${base} (${free} free)` : base;
    })
    .join("; ");
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

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((r) => [r.name, r.mobile, r.tower_name, r.flat_number, r.voucher_no, r.coupon_no, r.id]
      .some((v) => String(v || "").toLowerCase().includes(needle)));
  }, [items, q]);

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
          .map((l) => `• ${l.day_label} ${l.meal_label}${l.diet_label ? ` (${l.diet_label})` : ""}: ${l.heads}`)
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
          Summary counts live on Control Tower.
        </p>
      </div>

      <Card data-testid="food-list-card"><CardBody>
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          <div className="relative mr-auto w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-brown-800/40" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, flat, voucher or coupon no"
              className="pl-8"
              data-testid="food-admin-search"
            />
          </div>
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
                  <TH>Meals</TH>
                  <TH>Payment</TH>
                  <TH>Voucher</TH>
                  <TH>Coupons</TH>
                  <TH>Subscribed at</TH>
                </TR>
              </THead>
              <tbody>
                {shown.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-medium">{r.name}</TD>
                    <TD>{r.mobile}</TD>
                    <TD>
                      {r.tower_name}
                      {r.flat_number ? `, ${r.flat_number}` : ""}
                    </TD>
                    <TD right>{r.family_members || 1}</TD>
                    <TD className="max-w-xs text-xs text-brown-800/75">
                      <div className="font-semibold text-brown-900">{r.selection_count || 0} selected</div>
                      <div className="mt-0.5 leading-snug">{selectionSummary(r)}</div>
                    </TD>
                    <TD>
                      <StatusBadge status={paymentLabel(r.payment_status)} />
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
                      ) : r.paid_in_full ? (
                        <Button variant="admin" size="sm" disabled={busyId === r.id} onClick={() => issueCoupons(r)} data-testid={`food-issue-coupons-${r.id}`}>
                          <Ticket className="h-3.5 w-3.5" /> {busyId === r.id ? "Saving…" : "Mark coupons given"}
                        </Button>
                      ) : (
                        <span className="text-brown-800/45">—</span>
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
