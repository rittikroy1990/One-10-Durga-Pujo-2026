import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Download, Upload } from "lucide-react";
import api from "../../lib/api";
import { Card, CardBody, Table, THead, TR, TH, TD, Button, StatusBadge, Spinner, Input, Label } from "../../components/ui";
import ExportCsvButton from "../../components/ExportCsvButton";
import { formatDateIST } from "../../lib/utils";

function selectionSummary(row) {
  const sels = row.selections || [];
  if (!sels.length) return "—";
  return sels
    .map((s) => {
      const qty = Number(s.quantity) || 1;
      const label = `${s.day_label || s.day_code} ${s.meal_label || s.meal_code}`;
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
      toast.success(r.data.payment_enabled ? "Prices saved — UPI QR payment open" : "Prices saved");
      loadPrices();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not save prices");
    } finally {
      setSavingPrices(false);
    }
  };

  const stats = useMemo(() => {
    const total = items.length;
    const people = items.reduce((n, r) => n + (Number(r.family_members) || 1), 0);
    const paid = items.filter((r) =>
      ["paid", "captured", "settled"].includes((r.payment_status || "").toLowerCase())
    ).length;
    const unpaid = total - paid;
    const meals = items.reduce((n, r) => n + (Number(r.selection_count) || 0), 0);
    return { total, people, paid, unpaid, meals };
  }, [items]);

  const downloadTemplate = async () => {
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
      toast.success("Template downloaded");
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
    <div data-testid="food-admin-page">
      <h1 className="mb-1 font-display text-4xl">Food subscriptions</h1>
      <p className="mb-4 text-sm text-brown-800/50">
        Download a CSV template to capture subscriptions offline, then upload it to create or update records.
      </p>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardBody className="py-4">
            <div className="text-[10px] uppercase tracking-wider text-brown-800/45">Subscriptions</div>
            <div className="mt-1 font-display text-3xl text-brown-900" data-testid="food-stat-total">
              {stats.total}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="py-4">
            <div className="text-[10px] uppercase tracking-wider text-brown-800/45">People subscribed</div>
            <div className="mt-1 font-display text-3xl text-brown-900" data-testid="food-stat-people">
              {stats.people}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="py-4">
            <div className="text-[10px] uppercase tracking-wider text-brown-800/45">Paid</div>
            <div className="mt-1 font-display text-3xl text-emerald-700" data-testid="food-stat-paid">
              {stats.paid}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="py-4">
            <div className="text-[10px] uppercase tracking-wider text-brown-800/45">Not paid yet</div>
            <div className="mt-1 font-display text-3xl text-amber-700" data-testid="food-stat-unpaid">
              {stats.unpaid}
            </div>
          </CardBody>
        </Card>
      </div>

      <Card className="mb-4">
        <CardBody>
          <div className="mb-2 font-display text-xl text-brown-900">Meal prices (UPI QR only)</div>
          <p className="mb-3 text-sm text-brown-800/60">
            Set Breakfast / Lunch / Dinner in rupees. When payment is open, residents pay via the uploaded UPI QR — no payment gateway.
          </p>
          <div className="grid gap-3 sm:grid-cols-4">
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
            <div className="flex flex-col justify-end gap-2">
              <label className="flex items-center gap-2 text-sm text-brown-800/80">
                <input
                  type="checkbox"
                  data-testid="food-payment-enabled"
                  checked={!!priceForm.payment_enabled}
                  onChange={(e) => setPriceForm((f) => ({ ...f, payment_enabled: e.target.checked }))}
                  className="h-4 w-4"
                />
                Payment open (UPI QR)
              </label>
              <Button
                variant="admin"
                size="sm"
                disabled={savingPrices}
                onClick={savePrices}
                data-testid="food-prices-save-btn"
              >
                {savingPrices ? "Saving…" : "Save prices"}
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card className="mb-4">
        <CardBody>
          <div className="mb-2 font-display text-xl text-brown-900">Capture template</div>
          <p className="mb-3 text-sm text-brown-800/60">
            Meal columns use <b>Y</b> for selected and blank for not selected. Keep the <b>id</b> column when updating
            existing rows. New rows can leave <b>id</b> empty — matched by mobile if already registered.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="admin"
              size="sm"
              disabled={downloading}
              onClick={downloadTemplate}
              data-testid="food-template-download-btn"
            >
              <Download className="h-4 w-4" /> {downloading ? "Preparing…" : "Download template"}
            </Button>
            <Button
              variant="admin"
              size="sm"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              data-testid="food-template-upload-btn"
            >
              <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : "Upload filled template"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={onUpload}
              data-testid="food-template-file-input"
            />
          </div>
          {importResult && (
            <div
              className="mt-3 rounded-lg border border-sun-400/30 bg-sun-50/60 px-3 py-2 text-sm text-brown-800/80"
              data-testid="food-import-result"
            >
              {importResult.message}
              {!!(importResult.errors || []).length && (
                <ul className="mt-1 list-disc pl-5 text-xs text-amber-800">
                  {importResult.errors.slice(0, 5).map((e) => (
                    <li key={`${e.row}-${e.error}`}>
                      Row {e.row}: {e.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-brown-800/55">{stats.meals} meal slots selected across all flats</div>
            <div className="flex gap-2">
              <ExportCsvButton
                filename="food_subscriptions.csv"
                columns={COLS}
                items={items}
                data-testid="food-export-btn"
              />
              <Button variant="subtle" size="sm" onClick={load}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {loading ? (
            <Spinner className="text-vermilion-500" />
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-sm text-brown-800/45">
              No food subscriptions yet. Download the blank template to start capturing.
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
        </CardBody>
      </Card>
    </div>
  );
}
