import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Download, Upload, Settings2 } from "lucide-react";
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
      return qty > 1 ? `${label} × ${qty}` : label;
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
    breakfast: "60",
    lunch: "300",
    dinner: "300",
    payment_enabled: false,
  });
  const fileRef = useRef(null);

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
          breakfast: map.breakfast || "60",
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
                  <TH>Subscribed at</TH>
                </TR>
              </THead>
              <tbody>
                {items.map((r) => (
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
