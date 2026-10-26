import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw, AlertTriangle, Info } from "lucide-react";
import api from "../../lib/api";
import {
  Card, CardBody, Table, THead, TR, TH, TD, Button, Spinner, Input, Select, Textarea, Label, Stat, Dialog, StatusBadge,
} from "../../components/ui";
import ExportCsvButton from "../../components/ExportCsvButton";
import { formatDateIST, formatPaise } from "../../lib/utils";

const MEAL_COLS = [
  { code: "breakfast", label: "Breakfast" },
  { code: "breakfast_packet", label: "Breakfast packet" },
  { code: "lunch", label: "Lunch" },
  { code: "dinner", label: "Dinner" },
];
const EMPTY_FORM = { vendor_name: "", vendor_type: "", contact_mobile: "", purpose: "" };
const errText = (e, fallback) => e?.response?.data?.detail || fallback;
const shortDate = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
};
const linesText = (row) => (row.lines || [])
  .map((l) => `${l.day_label} ${l.meal_label} ${l.diet === "non_veg" ? "non-veg" : "veg"} × ${l.heads}`)
  .join("; ");

export default function VendorMeals() {
  const [data, setData] = useState(null);
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [qty, setQty] = useState({});
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.get("/admin/vendor-meals"), api.get("/admin/food-menu-items")])
      .then(([v, m]) => {
        setData(v.data);
        setMenu((m.data.items || []).filter((i) => i.active));
      })
      .catch(() => toast.error("Could not load vendor meals"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const days = useMemo(() => {
    const out = {};
    for (const item of menu) {
      const d = (out[item.menu_date] = out[item.menu_date] || { date: item.menu_date, label: item.day_label, cells: {} });
      (d.cells[item.category] = d.cells[item.category] || []).push(item);
    }
    for (const d of Object.values(out)) {
      for (const list of Object.values(d.cells)) list.sort((a, b) => (a.diet === "non_veg") - (b.diet === "non_veg"));
    }
    return Object.values(out).sort((a, b) => a.date.localeCompare(b.date));
  }, [menu]);

  const picked = useMemo(() => menu
    .map((i) => ({ item: i, quantity: Number(qty[i.id] || 0) }))
    .filter((x) => x.quantity > 0), [menu, qty]);
  const pickedPlates = picked.reduce((n, x) => n + x.quantity, 0);
  const pickedValue = picked.reduce((n, x) => n + x.quantity * (x.item.amount_paise || 0), 0);

  const items = data?.items || [];
  const shown = showCancelled ? items : items.filter((r) => r.status === "active");
  const totals = data?.totals || {};
  const canEdit = !!data?.can_edit;

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setQty({});
    setAdding(true);
  };

  const save = async () => {
    if (!form.vendor_name.trim()) return toast.error("Enter the vendor's name");
    if (!form.vendor_type) return toast.error("Choose the vendor type");
    if (form.purpose.trim().length < 3) return toast.error("Say why these meals are given");
    if (!picked.length) return toast.error("Add at least one meal");
    setSaving(true);
    try {
      const r = await api.post("/admin/vendor-meals", {
        ...form,
        selections: picked.map((x) => ({ item_id: x.item.id, quantity: x.quantity })),
      });
      toast.success(`${r.data.item.ref} added · ${r.data.item.plates} plates`);
      setAdding(false);
      load();
    } catch (e) {
      toast.error(errText(e, "Could not add vendor meals"));
    } finally {
      setSaving(false);
    }
  };

  const cancel = async () => {
    if (cancelReason.trim().length < 3) return toast.error("Give a reason for cancelling");
    setSaving(true);
    try {
      await api.post(`/admin/vendor-meals/${cancelling.id}/cancel`, { reason: cancelReason.trim() });
      toast.success(`${cancelling.ref} cancelled`);
      setCancelling(null);
      setCancelReason("");
      load();
    } catch (e) {
      toast.error(errText(e, "Could not cancel"));
    } finally {
      setSaving(false);
    }
  };

  const csv = useMemo(() => items.map((r) => ({
    ...r,
    meals: linesText(r),
    value: (r.value_paise || 0) / 100,
    created_at: formatDateIST(r.created_at),
    cancelled_at: r.cancelled_at ? formatDateIST(r.cancelled_at) : "",
  })), [items]);

  return (
    <div data-testid="vendor-meals-page" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="mb-1 font-display text-4xl">Vendor meals</h1>
          <p className="text-sm text-brown-800/50">
            Plates the committee gives to vendors: dhakis, priests, decorators, security and others.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="subtle" size="sm" onClick={load} aria-label="Refresh"><RefreshCw className="h-4 w-4" /></Button>
          {canEdit ? (
            <Button onClick={openAdd} data-testid="vendor-meals-add"><Plus className="h-4 w-4" /> Add vendor meals</Button>
          ) : null}
        </div>
      </div>

      <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" data-testid="vendor-meals-audit-note">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <div className="font-semibold">Audit note: these meals are a committee cost</div>
          <p className="mt-0.5 text-amber-900/80">
            Nobody pays for vendor plates, so the caterer bills them to the committee. They are valued at menu price,
            counted in the kitchen headcount on Food reports, and every entry records who added it, when and why.
            Entries are never deleted. A wrong entry is cancelled with a reason, and both steps stay in the audit log.
          </p>
        </div>
      </div>

      {loading && !data ? <Spinner className="text-vermilion-500" /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Vendor plates" value={totals.plates || 0} sub={`${totals.entries || 0} active entr${totals.entries === 1 ? "y" : "ies"}`} />
            <Stat label="Cost to committee" value={formatPaise(totals.value_paise || 0)} accent="text-vermilion-600" sub="At menu price" />
            <Stat label="Cancelled entries" value={totals.cancelled || 0} sub="Kept for the audit trail" />
          </div>

          <Card><CardBody>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm text-brown-800/80">
                <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} data-testid="vendor-meals-show-cancelled" />
                Show cancelled entries
              </label>
              <ExportCsvButton
                filename="vendor_meals.csv"
                items={csv}
                columns={[
                  { key: "ref", label: "Ref" }, { key: "vendor_name", label: "Vendor" }, { key: "vendor_type_label", label: "Type" },
                  { key: "contact_mobile", label: "Mobile" }, { key: "purpose", label: "Why" }, { key: "meals", label: "Meals" },
                  { key: "plates", label: "Plates" }, { key: "value", label: "Value ₹" }, { key: "status", label: "Status" },
                  { key: "created_by_name", label: "Added by" }, { key: "created_at", label: "Added at" },
                  { key: "cancelled_by_name", label: "Cancelled by" }, { key: "cancelled_at", label: "Cancelled at" },
                  { key: "cancel_reason", label: "Cancel reason" },
                ]}
                data-testid="vendor-meals-csv"
              />
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>Ref</TH>
                  <TH>Vendor</TH>
                  <TH>Meals</TH>
                  <TH right>Plates</TH>
                  <TH right>Value</TH>
                  <TH>Added by</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <tbody>
                {shown.length ? shown.map((r) => (
                  <TR key={r.id} className={r.status === "active" ? "" : "opacity-60"}>
                    <TD className="whitespace-nowrap font-medium tabular-nums">{r.ref}</TD>
                    <TD className="text-xs">
                      <div className="text-sm font-medium text-brown-900">{r.vendor_name}</div>
                      <div className="text-brown-800/60">{r.vendor_type_label}{r.contact_mobile ? ` · ${r.contact_mobile}` : ""}</div>
                      <div className="mt-0.5 text-brown-800/60">{r.purpose}</div>
                    </TD>
                    <TD className="text-xs">
                      {(r.days || []).map((d) => (
                        <div key={d.day_code} className="whitespace-nowrap">
                          <span className="font-medium">{d.day_label}</span>
                          {": "}
                          {d.meals.map((m) => `${m.meal_label} ${m.heads}`).join(", ")}
                        </div>
                      ))}
                    </TD>
                    <TD right className="font-semibold">{r.plates}</TD>
                    <TD right>{formatPaise(r.value_paise || 0)}</TD>
                    <TD className="whitespace-nowrap text-xs">
                      <div>{r.created_by_name || "—"}</div>
                      <div className="text-brown-800/50">{formatDateIST(r.created_at)}</div>
                    </TD>
                    <TD className="text-xs">
                      {r.status === "active" ? (
                        canEdit ? (
                          <button type="button" className="font-semibold text-vermilion-600 hover:underline"
                            onClick={() => { setCancelling(r); setCancelReason(""); }} data-testid={`vendor-meals-cancel-${r.id}`}>
                            Cancel
                          </button>
                        ) : <StatusBadge status="active" />
                      ) : (
                        <div>
                          <StatusBadge status="cancelled" />
                          <div className="mt-1 text-brown-800/60">{r.cancelled_by_name} · {formatDateIST(r.cancelled_at)}</div>
                          <div className="text-brown-800/60">{r.cancel_reason}</div>
                        </div>
                      )}
                    </TD>
                  </TR>
                )) : (
                  <TR><TD className="py-6 text-center text-brown-800/50" colSpan={7}>
                    {items.length ? "No active entries. Tick “Show cancelled entries” to see the rest." : "No vendor meals added yet."}
                  </TD></TR>
                )}
              </tbody>
            </Table>
          </CardBody></Card>
        </>
      )}

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Add vendor meals"
        size="lg"
        footer={(
          <>
            <span className="mr-auto self-center text-sm text-brown-800/70" data-testid="vendor-meals-form-total">
              {pickedPlates} plate{pickedPlates === 1 ? "" : "s"} · {formatPaise(pickedValue)} cost to committee
            </span>
            <Button variant="subtle" onClick={() => setAdding(false)}>Close</Button>
            <Button onClick={save} disabled={saving} data-testid="vendor-meals-save">{saving ? "Saving…" : "Add"}</Button>
          </>
        )}
      >
        <div className="space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label required>Vendor name</Label>
              <Input value={form.vendor_name} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })}
                placeholder="e.g. Haren Dhaki team" data-testid="vendor-meals-name" />
            </div>
            <div>
              <Label required>Type</Label>
              <Select value={form.vendor_type} onChange={(e) => setForm({ ...form, vendor_type: e.target.value })} data-testid="vendor-meals-type">
                <option value="">Choose…</option>
                {(data?.types || []).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </div>
            <div>
              <Label>Contact mobile</Label>
              <Input value={form.contact_mobile} onChange={(e) => setForm({ ...form, contact_mobile: e.target.value })}
                placeholder="Optional" inputMode="numeric" data-testid="vendor-meals-mobile" />
            </div>
            <div className="sm:col-span-2">
              <Label required>Why are these meals given?</Label>
              <Textarea rows={2} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                placeholder="e.g. 4 dhakis on duty Saptami to Dashami, lunch and dinner as agreed in the contract"
                data-testid="vendor-meals-purpose" />
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center gap-1 text-xs text-brown-800/60">
              <Info className="h-3.5 w-3.5" /> Enter the number of plates per meal. Prices are today's menu prices.
            </div>
            <div className="overflow-x-auto rounded-lg border border-brown-800/10">
              <table className="w-full text-xs">
                <thead className="bg-ivory-300 text-brown-800">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold uppercase tracking-wide">Day</th>
                    {MEAL_COLS.map((mc) => <th key={mc.code} className="px-2 py-2 text-left font-semibold uppercase tracking-wide">{mc.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={d.date} className="border-t border-brown-800/10 align-top">
                      <td className="whitespace-nowrap px-2 py-2 font-medium">{shortDate(d.date)}</td>
                      {MEAL_COLS.map((mc) => (
                        <td key={mc.code} className="px-2 py-2">
                          {(d.cells[mc.code] || []).map((item) => (
                            <label key={item.id} className="mb-1 flex items-center gap-1.5 whitespace-nowrap" title={item.name}>
                              <input
                                type="number"
                                min="0"
                                max="50"
                                value={qty[item.id] || ""}
                                onChange={(e) => setQty({ ...qty, [item.id]: Math.max(0, Math.min(50, parseInt(e.target.value, 10) || 0)) })}
                                className="w-14 rounded border border-brown-800/20 px-1.5 py-1 text-right tabular-nums"
                                data-testid={`vendor-meals-qty-${item.id}`}
                              />
                              <span className={item.diet === "non_veg" ? "text-vermilion-600" : "text-emerald-700"}>
                                {item.diet === "non_veg" ? "Non-veg" : "Veg"}
                              </span>
                              <span className="text-brown-800/50">{item.amount_label}</span>
                            </label>
                          ))}
                          {!(d.cells[mc.code] || []).length ? <span className="text-brown-800/30">—</span> : null}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        title={`Cancel ${cancelling?.ref || ""}`}
        size="sm"
        footer={(
          <>
            <Button variant="subtle" onClick={() => setCancelling(null)}>Keep it</Button>
            <Button onClick={cancel} disabled={saving} data-testid="vendor-meals-cancel-confirm">{saving ? "Cancelling…" : "Cancel entry"}</Button>
          </>
        )}
      >
        {cancelling ? (
          <div className="space-y-3 text-sm">
            <p className="text-brown-800/70">
              {cancelling.vendor_name}: {cancelling.plates} plates, {formatPaise(cancelling.value_paise || 0)}.
              The entry stays on record as cancelled and leaves the kitchen headcount.
            </p>
            <div>
              <Label required>Reason</Label>
              <Textarea rows={2} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Entered twice by mistake" data-testid="vendor-meals-cancel-reason" />
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
