import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { RefreshCw, Search, ChevronDown, ChevronRight, MessageCircle, AlertTriangle, FileDown, ImageDown } from "lucide-react";
import api from "../../lib/api";
import {
  Card, CardBody, Table, THead, TR, TH, TD, Button, Spinner, Input, Select, Tabs, Stat, Dialog, StatusBadge,
} from "../../components/ui";
import ExportCsvButton from "../../components/ExportCsvButton";
import { formatDateIST, formatPaise } from "../../lib/utils";

const MEAL_COLS = [
  { code: "breakfast", label: "Breakfast" },
  { code: "breakfast_packet", label: "Breakfast packet" },
  { code: "lunch", label: "Lunch" },
  { code: "dinner", label: "Dinner" },
];
const HEADS = [
  { key: "breakfast", label: "Breakfast", codes: ["breakfast", "breakfast_packet"] },
  { key: "lunch", label: "Lunch", codes: ["lunch"] },
  { key: "dinner", label: "Dinner", codes: ["dinner"] },
];
const TABS = [
  { value: "meals", label: "Meal headcount" },
  { value: "flats", label: "Per flat (consolidated)" },
  { value: "money", label: "Money" },
  { value: "follow", label: "Follow-ups" },
];
const FLAT_FILTERS = [
  { value: "", label: "All flats" },
  { value: "paid", label: "Paid only" },
  { value: "paid_full", label: "Paid in full (nothing due)" },
  { value: "due", label: "Payment due" },
  { value: "dup", label: "Likely duplicate orders" },
  { value: "multi", label: "More than one order" },
  { value: "unverified", label: "Receipt not bank-verified" },
  { value: "coupons", label: "Coupons not handed over" },
];

// The caterer packs veg breakfast packets in tens, so the kitchen count is rounded up per day.
const ROUND_UP = { breakfast_packet: 10 };
const roundUp = (n, step) => (step && n > 0 ? Math.ceil(n / step) * step : n);

const flatLabel = (f) => `${f.tower_name || ""}${f.flat_number ? `, ${f.flat_number}` : ""}`;
const dietShort = (d) => (d === "non_veg" ? "Non-veg" : d === "veg" ? "Veg" : "—");
const waLink = (mobile, text) => `https://wa.me/91${mobile}?text=${encodeURIComponent(text)}`;
const realDue = (f) => f.due_paise || 0;

export default function FoodReports() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("meals");
  const [withAwaiting, setWithAwaiting] = useState(false);
  const [q, setQ] = useState("");
  const [flatFilter, setFlatFilter] = useState("");
  const [open, setOpen] = useState({});
  const [cell, setCell] = useState(null);

  const [exporting, setExporting] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/admin/food-reports")
      .then((r) => setData(r.data))
      .catch(() => toast.error("Could not load food reports"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const downloadRevenue = async (fmt) => {
    setExporting(fmt);
    const isCost = fmt === "cost";
    const mime = fmt === "png" ? "image/png" : "application/pdf";
    const filename = isCost ? "one10_food_cost_revenue.pdf" : `one10_food_revenue.${fmt}`;
    const path = isCost ? "/admin/food-reports/cost-revenue-pdf"
      : `/admin/food-reports/revenue-${fmt}`;
    try {
      const r = await api.get(path, { responseType: "blob", timeout: 90000 });
      const blob = r.data instanceof Blob ? r.data : new Blob([r.data], { type: mime });
      if (blob.type && blob.type.includes("json")) {
        const text = await blob.text();
        let detail = "Download failed";
        try { detail = JSON.parse(text)?.detail || detail; } catch { /* ignore */ }
        throw new Error(typeof detail === "string" ? detail : "Download failed");
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast.success(isCost ? "Cost vs revenue PDF downloaded"
        : fmt === "pdf" ? "Revenue PDF downloaded" : "Revenue PNG downloaded");
    } catch (err) {
      const msg = err?.message || err?.response?.statusText || "";
      toast.error(msg && msg !== "Network Error"
        ? `Download failed: ${msg}`
        : "Download failed — try Open P&L PDF / Open revenue PDF");
    } finally {
      setExporting(null);
    }
  };

  const meals = useMemo(() => data?.meals || [], [data]);
  const flats = useMemo(() => data?.flats || [], [data]);
  const count = useCallback((c, field = "heads") => (c.confirmed[field] || 0) + (c.vendor?.[field] || 0)
    + (withAwaiting ? c.awaiting[field] || 0 : 0), [withAwaiting]);

  const roundOff = useMemo(() => {
    const out = {};
    for (const m of meals) {
      const step = ROUND_UP[m.meal_code];
      if (!step || m.diet === "non_veg") continue;
      const r = (out[`${m.day_code}|${m.meal_code}`] = out[`${m.day_code}|${m.meal_code}`] || { actual: 0, unit: 0, step });
      r.actual += count(m);
      r.unit = r.unit || m.unit_paise || 0;
    }
    for (const r of Object.values(out)) {
      r.shown = roundUp(r.actual, r.step);
      r.extra = r.shown - r.actual;
    }
    return out;
  }, [meals, count]);
  const extraFor = useCallback((codes, day) => Object.entries(roundOff)
    .filter(([k]) => codes.includes(k.split("|")[1]) && (!day || k.split("|")[0] === day))
    .reduce((n, [, r]) => n + r.extra, 0), [roundOff]);
  const roundOffExtra = Object.values(roundOff).reduce((n, r) => n + r.extra, 0);
  const roundOffValue = Object.values(roundOff).reduce((n, r) => n + r.extra * r.unit, 0);

  const heads = useMemo(() => HEADS.map((h) => {
    const rows = meals.filter((m) => h.codes.includes(m.meal_code));
    const sum = (pred, field) => rows.filter(pred).reduce((n, m) => n + count(m, field), 0);
    const extra = extraFor(h.codes);
    return {
      ...h,
      extra,
      total: sum(() => true, "heads") + extra,
      veg: sum((m) => m.diet !== "non_veg", "heads") + extra,
      nonveg: sum((m) => m.diet === "non_veg", "heads"),
      kids: sum(() => true, "kids"),
      free: sum(() => true, "free"),
      vendor: rows.reduce((n, m) => n + (m.vendor?.heads || 0), 0),
      awaiting: rows.reduce((n, m) => n + (m.awaiting.heads || 0), 0),
    };
  }), [meals, count, extraFor]);

  const days = useMemo(() => {
    const out = [];
    for (const m of meals) {
      let d = out.find((x) => x.code === m.day_code);
      if (!d) {
        d = { code: m.day_code, label: m.day_label, date: m.date, weekday: m.weekday, cells: {} };
        out.push(d);
      }
      (d.cells[m.meal_code] = d.cells[m.meal_code] || []).push(m);
    }
    return out;
  }, [meals]);

  const cellFlats = useMemo(() => {
    if (!cell) return [];
    return flats
      .map((f) => {
        const lines = f.lines.filter((l) => l.day_code === cell.day && l.meal_code === cell.meal);
        const pick = (diet) => lines.filter((l) => (diet === "non_veg" ? l.diet === "non_veg" : l.diet !== "non_veg"));
        const n = (ls) => ls.reduce((s, l) => s + l.confirmed + (withAwaiting ? l.awaiting : 0), 0);
        return {
          f,
          veg: n(pick("veg")),
          nonveg: n(pick("non_veg")),
          kids: lines.reduce((s, l) => s + l.kids, 0),
          awaiting: lines.reduce((s, l) => s + l.awaiting, 0),
        };
      })
      .filter((r) => r.veg + r.nonveg > 0 || (!withAwaiting && r.awaiting > 0));
  }, [cell, flats, withAwaiting]);

  const cellVendor = cell
    ? meals.filter((m) => m.day_code === cell.day && m.meal_code === cell.meal).reduce((n, m) => n + (m.vendor?.heads || 0), 0)
    : 0;

  const shownFlats = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/^#/, "");
    return flats.filter((f) => {
      if (flatFilter === "paid" && !f.paid_paise) return false;
      if (flatFilter === "paid_full" && (!f.paid_paise || realDue(f))) return false;
      if (flatFilter === "due" && !realDue(f)) return false;
      if (flatFilter === "dup" && !f.duplicate_due_paise) return false;
      if (flatFilter === "multi" && f.order_count < 2) return false;
      if (flatFilter === "unverified" && !f.unverified_receipts) return false;
      if (flatFilter === "coupons" && !f.coupons_pending) return false;
      if (!needle) return true;
      return [flatLabel(f), f.flat_number, ...f.names, ...f.mobiles, ...f.orders.map((o) => o.ref)]
        .some((v) => String(v || "").toLowerCase().includes(needle));
    });
  }, [flats, q, flatFilter]);

  const freeQuota = useMemo(() => (data?.complimentary_rules || []).reduce((n, r) => n + (r.free || 0), 0), [data]);

  const towers = useMemo(() => {
    const out = {};
    for (const f of flats) {
      const t = (out[f.tower_name || "—"] = out[f.tower_name || "—"] || {
        tower: f.tower_name || "—", tower_id: f.tower_id, flats: 0, orders: 0, confirmed: 0, awaiting: 0, billed: 0, paid: 0, due: 0,
      });
      t.flats += 1;
      t.orders += f.order_count;
      t.confirmed += f.heads_confirmed;
      t.awaiting += f.heads_awaiting;
      t.billed += f.billed_paise;
      t.paid += f.paid_paise;
      t.due += realDue(f);
    }
    return Object.values(out).sort((a, b) => String(a.tower_id).localeCompare(String(b.tower_id), undefined, { numeric: true }));
  }, [flats]);

  const money = useMemo(() => MEAL_COLS.map((mc) => {
    const rows = meals.filter((m) => m.meal_code === mc.code);
    const s = (stage, field) => rows.reduce((n, m) => n + (m[stage][field] || 0), 0);
    return {
      ...mc,
      confirmed: s("confirmed", "amount_paise"),
      awaiting: s("awaiting", "amount_paise"),
      free: s("confirmed", "free") + s("awaiting", "free"),
      freeValue: s("confirmed", "free_value_paise") + s("awaiting", "free_value_paise"),
      paidPlates: s("confirmed", "paid_plates"),
    };
  }).filter((r) => r.confirmed || r.awaiting || r.free), [meals]);

  const follow = useMemo(() => {
    const due = [], dups = [], unverified = [], coupons = [];
    for (const f of flats) {
      for (const o of f.orders) {
        if (o.stage === "awaiting" && o.duplicate_of) dups.push({ f, o });
        else if (o.stage === "awaiting" && o.due_paise) due.push({ f, o });
        if (o.stage === "confirmed" && !o.coupons_given) coupons.push({ f, o });
        for (const r of o.receipts) if (!r.bank_verified) unverified.push({ f, o, r });
      }
    }
    due.sort((a, b) => String(a.o.created_at).localeCompare(String(b.o.created_at)));
    return { due, dups, unverified, coupons };
  }, [flats]);

  const mealCsv = useMemo(() => meals.map((m) => ({
    day: `${m.day_label} ${m.date}`,
    meal: m.meal_label,
    diet: dietShort(m.diet),
    confirmed: m.confirmed.heads,
    confirmed_kids: m.confirmed.kids,
    complimentary: m.confirmed.free,
    awaiting: m.awaiting.heads,
    vendor: m.vendor?.heads || 0,
    rounded: ROUND_UP[m.meal_code] && m.diet !== "non_veg" ? roundOff[`${m.day_code}|${m.meal_code}`]?.shown ?? "" : "",
    flats: m.confirmed.flats,
    amount: (m.confirmed.amount_paise || 0) / 100,
  })), [meals, roundOff]);

  const flatCsv = useMemo(() => shownFlats.map((f) => ({
    ...f,
    flat: flatLabel(f),
    names: f.names.join(" / "),
    mobiles: f.mobiles.join(" / "),
    orders: f.orders.map((o) => `#${o.ref} ${o.payment_status}`).join("; "),
    receipts: f.orders.flatMap((o) => o.receipts.map((r) => `${r.receipt_no} ₹${r.amount_paise / 100}`)).join("; "),
    meals: f.lines.map((l) => `${l.day_label} ${l.meal_label} ${dietShort(l.diet)} ${l.confirmed}${l.awaiting ? ` (+${l.awaiting} unpaid)` : ""}`).join("; "),
    billed: f.billed_paise / 100,
    paid: f.paid_paise / 100,
    due: realDue(f) / 100,
  })), [shownFlats]);

  const totals = data?.totals || {};
  const freeValue = money.reduce((n, r) => n + r.freeValue, 0);

  const countCell = (list, diet) => {
    const rows = (list || []).filter((m) => (diet === "non_veg" ? m.diet === "non_veg" : m.diet !== "non_veg"));
    return {
      n: rows.reduce((s, m) => s + count(m), 0),
      pending: rows.reduce((s, m) => s + (m.awaiting.heads || 0), 0),
      vendor: rows.reduce((s, m) => s + (m.vendor?.heads || 0), 0),
    };
  };

  return (
    <div data-testid="food-reports-page" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="mb-1 font-display text-4xl">Food reports</h1>
          <p className="text-sm text-brown-800/50">
            Live orders only — cancelled and expired orders are left out. "Confirmed" = paid or fully complimentary.
            {data?.generated_at ? ` Updated ${formatDateIST(data.generated_at)}.` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!!exporting}
            onClick={() => downloadRevenue("pdf")}
            data-testid="food-reports-revenue-pdf"
            title="Consolidated revenue PDF — veg breakfast packets excluded"
          >
            <FileDown className="h-4 w-4" /> {exporting === "pdf" ? "…" : "Revenue PDF"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!!exporting}
            onClick={() => downloadRevenue("png")}
            data-testid="food-reports-revenue-png"
            title="Shareable revenue PNG — veg breakfast packets excluded"
          >
            <ImageDown className="h-4 w-4" /> {exporting === "png" ? "…" : "Revenue PNG"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!!exporting}
            onClick={() => downloadRevenue("cost")}
            data-testid="food-reports-cost-revenue-pdf"
            title="Cost vs revenue PDF — complimentary plates included in vendor cost"
          >
            <FileDown className="h-4 w-4" /> {exporting === "cost" ? "…" : "Cost vs revenue"}
          </Button>
          <a
            href="/reports/one10_food_cost_revenue.pdf"
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-vermilion-600 hover:underline"
            data-testid="food-reports-cost-revenue-direct"
          >
            Open P&L PDF
          </a>
          <a
            href="/reports/one10_food_revenue.pdf"
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-vermilion-600 hover:underline"
            data-testid="food-reports-revenue-pdf-direct"
          >
            Open revenue PDF
          </a>
          <label className="flex items-center gap-2 rounded-lg border border-brown-800/10 bg-white px-3 py-1.5 text-sm text-brown-800/80">
            <input type="checkbox" checked={withAwaiting} onChange={(e) => setWithAwaiting(e.target.checked)} data-testid="food-reports-awaiting" />
            Count orders awaiting payment
          </label>
          <Button type="button" variant="subtle" size="sm" onClick={load} aria-label="Refresh"><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {loading && !data ? <Spinner className="text-vermilion-500" /> : (
        <>
          <Tabs tabs={TABS} value={tab} onChange={setTab} />

          {tab === "meals" && (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                {heads.map((h) => (
                  <Stat
                    key={h.key}
                    label={`${h.label} plates`}
                    value={h.total}
                    sub={`${h.veg} veg · ${h.nonveg} non-veg · ${h.kids} kid${h.kids === 1 ? "" : "s"} below 7 · ${h.free} complimentary${h.vendor ? ` · ${h.vendor} vendor` : ""}${h.extra ? ` · ${h.extra} packet round-off` : ""}${!withAwaiting && h.awaiting ? ` · +${h.awaiting} awaiting payment` : ""}`}
                  />
                ))}
              </div>

              <Card><CardBody>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-brown-800/60">
                    Plates per day and meal (kid plates and <Link to="/admin/vendor-meals" className="text-violet-700 hover:underline">vendor meals</Link> included).
                    Veg breakfast packets are rounded up to the next 10. Tap a number to see which flats.
                  </p>
                  <ExportCsvButton
                    filename="food_meal_headcount.csv"
                    items={mealCsv}
                    columns={[
                      { key: "day", label: "Day" }, { key: "meal", label: "Meal" }, { key: "diet", label: "Veg / Non-veg" },
                      { key: "confirmed", label: "Confirmed plates" }, { key: "confirmed_kids", label: "of which kids below 7" },
                      { key: "complimentary", label: "Complimentary" }, { key: "awaiting", label: "Awaiting payment" },
                      { key: "vendor", label: "Vendor plates (committee cost)" },
                      { key: "rounded", label: "Kitchen count after round-off" },
                      { key: "flats", label: "Flats" }, { key: "amount", label: "Amount ₹" },
                    ]}
                    data-testid="food-reports-meals-csv"
                  />
                </div>
                <Table>
                  <THead>
                    <TR>
                      <TH>Day</TH>
                      {MEAL_COLS.map((mc) => <TH key={mc.code} right>{mc.label}</TH>)}
                      <TH right>Day total</TH>
                    </TR>
                  </THead>
                  <tbody>
                    {days.map((d) => {
                      const dayTotal = Object.values(d.cells).flat().reduce((s, m) => s + count(m), 0)
                        + extraFor(Object.keys(ROUND_UP), d.code);
                      return (
                        <TR key={d.code}>
                          <TD className="whitespace-nowrap font-medium">
                            {d.label}
                            <div className="text-[11px] font-normal text-brown-800/50">{d.weekday} {d.date}</div>
                          </TD>
                          {MEAL_COLS.map((mc) => {
                            const list = d.cells[mc.code];
                            if (!list) return <TD key={mc.code} right className="text-brown-800/30">—</TD>;
                            const veg = countCell(list, "veg");
                            const nonveg = countCell(list, "non_veg");
                            const ro = roundOff[`${d.code}|${mc.code}`];
                            const extra = ro?.extra || 0;
                            return (
                              <TD key={mc.code} right>
                                <button
                                  type="button"
                                  className="text-right hover:text-vermilion-600"
                                  onClick={() => setCell({ day: d.code, meal: mc.code, title: `${d.label} ${mc.label}` })}
                                  data-testid={`food-reports-cell-${d.code}-${mc.code}`}
                                >
                                  <div className="text-lg font-bold tabular-nums">{veg.n + nonveg.n + extra}</div>
                                  {ro ? (
                                    <div className="whitespace-nowrap text-[11px] text-sky-700" data-testid={`food-reports-roundoff-${d.code}`}>
                                      {ro.actual} ordered{extra ? ` + ${extra} round-off` : ""}
                                    </div>
                                  ) : null}
                                  <div className="whitespace-nowrap text-[11px] text-brown-800/60">
                                    <span className="text-emerald-700">{veg.n + extra} veg</span>
                                    {" · "}
                                    <span className="text-vermilion-600">{nonveg.n} non-veg</span>
                                  </div>
                                  {veg.vendor + nonveg.vendor > 0 ? (
                                    <div className="text-[11px] text-violet-700">incl. {veg.vendor + nonveg.vendor} vendor</div>
                                  ) : null}
                                  {!withAwaiting && veg.pending + nonveg.pending > 0 ? (
                                    <div className="text-[11px] text-amber-700">+{veg.pending + nonveg.pending} awaiting</div>
                                  ) : null}
                                </button>
                              </TD>
                            );
                          })}
                          <TD right className="text-lg font-bold">{dayTotal}</TD>
                        </TR>
                      );
                    })}
                  </tbody>
                </Table>
              </CardBody></Card>
            </div>
          )}

          {tab === "flats" && (
            <Card><CardBody>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="relative mr-auto w-full sm:w-72">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-brown-800/40" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search flat, name, mobile or order #" className="pl-8" data-testid="food-reports-search" />
                </div>
                <Select value={flatFilter} onChange={(e) => setFlatFilter(e.target.value)} className="w-56" data-testid="food-reports-flat-filter">
                  {FLAT_FILTERS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                </Select>
                <ExportCsvButton
                  filename="food_orders_by_flat.csv"
                  items={flatCsv}
                  columns={[
                    { key: "flat", label: "Flat" }, { key: "names", label: "Names" }, { key: "mobiles", label: "Mobiles" },
                    { key: "order_count", label: "Orders" }, { key: "heads_confirmed", label: "Confirmed plates" },
                    { key: "heads_awaiting", label: "Plates awaiting payment" }, { key: "free_used", label: "Complimentary used" },
                    { key: "billed", label: "Billed ₹" }, { key: "paid", label: "Paid ₹" }, { key: "due", label: "Due ₹" },
                    { key: "orders", label: "Order refs" }, { key: "receipts", label: "Receipts" }, { key: "meals", label: "Meals" },
                  ]}
                  data-testid="food-reports-flats-csv"
                />
              </div>
              <p className="mb-2 text-xs text-brown-800/50">
                {shownFlats.length} of {flats.length} flats · every live order of a flat merged into one row. Tap a row for meals, orders and receipts.
              </p>
              <Table>
                <THead>
                  <TR>
                    <TH>Flat</TH>
                    <TH>Ordered by</TH>
                    <TH right>Orders</TH>
                    <TH right>Plates</TH>
                    <TH right>Billed</TH>
                    <TH right>Paid</TH>
                    <TH right>Due</TH>
                    <TH>Needs attention</TH>
                  </TR>
                </THead>
                <tbody>
                  {shownFlats.map((f) => {
                    const key = f.flat_id || flatLabel(f);
                    const isOpen = !!open[key];
                    const due = realDue(f);
                    return (
                      <React.Fragment key={key}>
                        <TR className="cursor-pointer">
                          <TD className="whitespace-nowrap font-medium">
                            <button type="button" className="flex items-center gap-1" onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))} data-testid={`food-reports-flat-${key}`}>
                              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              {flatLabel(f)}
                            </button>
                          </TD>
                          <TD className="text-xs">
                            <div className="font-medium text-brown-900">{f.names.join(" / ")}</div>
                            <div className="text-brown-800/55">{f.mobiles.join(" / ")}</div>
                          </TD>
                          <TD right>{f.order_count}</TD>
                          <TD right>
                            <span className="font-semibold">{f.heads_confirmed}</span>
                            {f.heads_awaiting ? <div className="text-[11px] text-amber-700">+{f.heads_awaiting} awaiting</div> : null}
                          </TD>
                          <TD right>{formatPaise(f.billed_paise)}</TD>
                          <TD right className="text-emerald-700">{formatPaise(f.paid_paise)}</TD>
                          <TD right className={due ? "font-semibold text-vermilion-600" : "text-brown-800/40"}>{due ? formatPaise(due) : "—"}</TD>
                          <TD className="text-[11px]">
                            <div className="flex flex-wrap gap-1">
                              {f.duplicate_due_paise ? <Flag tone="red">Duplicate unpaid {formatPaise(f.duplicate_due_paise)}</Flag> : null}
                              {f.awaiting_orders && f.order_count > 1 && !f.duplicate_due_paise ? <Flag tone="amber">{f.order_count} orders</Flag> : null}
                              {f.unverified_receipts ? <Flag tone="amber">{f.unverified_receipts} receipt{f.unverified_receipts === 1 ? "" : "s"} not bank-verified</Flag> : null}
                              {f.coupons_pending ? <Flag tone="slate">Coupons not given</Flag> : null}
                            </div>
                          </TD>
                        </TR>
                        {isOpen && (
                          <tr className="bg-ivory-300/40">
                            <td colSpan={8} className="px-4 py-3">
                              <FlatDetail f={f} freeQuota={freeQuota} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </Table>
            </CardBody></Card>
          )}

          {tab === "money" && (
            <div className="space-y-5">
              <p className="rounded-lg border border-brown-800/10 bg-white px-3 py-2 text-sm text-brown-800/70">
                <strong className="text-brown-800">Revenue PDF / PNG</strong> (buttons above) = rate × paid plates,
                with <em>veg breakfast packets kept out</em> (already paid). Use that for the committee share.
              </p>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Stat label="Billed (live orders)" value={formatPaise(totals.billed_paise)} sub={`${totals.orders || 0} orders · ${totals.flats || 0} flats`} />
                <Stat label="Collected" value={formatPaise(totals.paid_paise)} accent="text-emerald-700" sub="Issued receipts on these orders" />
                <Stat
                  label="Still due"
                  value={formatPaise(totals.due_paise)}
                  accent="text-vermilion-600"
                  sub={totals.duplicate_due_paise ? `Excludes ${formatPaise(totals.duplicate_due_paise)} on likely duplicate orders` : "Unpaid and part-paid orders"}
                />
                <Stat label="Complimentary given" value={formatPaise(freeValue)} sub={`${money.reduce((n, r) => n + r.free, 0)} free meals at menu price`} />
                <Stat
                  label="Packet round-off"
                  value={formatPaise(roundOffValue)}
                  accent="text-sky-700"
                  sub={`${roundOffExtra} extra veg breakfast packets to make the count a multiple of 10`}
                />
                <Link to="/admin/vendor-meals" className="block" data-testid="food-reports-vendor-cost">
                  <Stat
                    label="Vendor meals (committee cost)"
                    value={formatPaise(totals.vendor_value_paise || 0)}
                    accent="text-violet-700"
                    sub={`${totals.vendor_plates || 0} plates · ${totals.vendor_entries || 0} entries · not paid by residents`}
                  />
                </Link>
              </div>
              <Card><CardBody>
                <h2 className="mb-2 font-display text-2xl">By meal</h2>
                <Table>
                  <THead>
                    <TR><TH>Meal</TH><TH right>Paid plates</TH><TH right>Confirmed ₹</TH><TH right>Awaiting ₹</TH><TH right>Complimentary meals</TH><TH right>Complimentary value</TH></TR>
                  </THead>
                  <tbody>
                    {money.map((r) => (
                      <TR key={r.code}>
                        <TD className="font-medium">{r.label}</TD>
                        <TD right>{r.paidPlates}</TD>
                        <TD right>{formatPaise(r.confirmed)}</TD>
                        <TD right className="text-amber-700">{formatPaise(r.awaiting)}</TD>
                        <TD right>{r.free}</TD>
                        <TD right>{formatPaise(r.freeValue)}</TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </CardBody></Card>
              <Card><CardBody>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="font-display text-2xl">By tower</h2>
                  <ExportCsvButton
                    filename="food_by_tower.csv"
                    items={towers.map((t) => ({ ...t, billed: t.billed / 100, paid: t.paid / 100, due: t.due / 100 }))}
                    columns={[
                      { key: "tower", label: "Tower" }, { key: "flats", label: "Flats" }, { key: "orders", label: "Orders" },
                      { key: "confirmed", label: "Confirmed plates" }, { key: "awaiting", label: "Plates awaiting payment" },
                      { key: "billed", label: "Billed ₹" }, { key: "paid", label: "Paid ₹" }, { key: "due", label: "Due ₹" },
                    ]}
                    data-testid="food-reports-towers-csv"
                  />
                </div>
                <Table>
                  <THead>
                    <TR><TH>Tower</TH><TH right>Flats</TH><TH right>Orders</TH><TH right>Confirmed plates</TH><TH right>Awaiting</TH><TH right>Billed</TH><TH right>Paid</TH><TH right>Due</TH></TR>
                  </THead>
                  <tbody>
                    {towers.map((t) => (
                      <TR key={t.tower}>
                        <TD className="font-medium">{t.tower}</TD>
                        <TD right>{t.flats}</TD>
                        <TD right>{t.orders}</TD>
                        <TD right>{t.confirmed}</TD>
                        <TD right className="text-amber-700">{t.awaiting || "—"}</TD>
                        <TD right>{formatPaise(t.billed)}</TD>
                        <TD right className="text-emerald-700">{formatPaise(t.paid)}</TD>
                        <TD right className={t.due ? "text-vermilion-600" : ""}>{t.due ? formatPaise(t.due) : "—"}</TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </CardBody></Card>
            </div>
          )}

          {tab === "follow" && (
            <div className="space-y-5">
              <FollowCard title="Payment due" hint="Unpaid or part-paid orders, oldest first. Message the resident or record the payment on Food subscriptions." count={follow.due.length}>
                {follow.due.map(({ f, o }) => (
                  <FollowRow key={o.id} f={f} o={o}
                    right={<span className="font-semibold text-vermilion-600">{formatPaise(o.due_paise)} due</span>}
                    note={`${o.paid_paise ? `${formatPaise(o.paid_paise)} paid so far · ` : ""}${o.whatsapp_posted ? "Screenshot posted on WhatsApp · " : ""}ordered ${formatDateIST(o.created_at)}`}
                    wa={`Namaskar ${o.name || ""}, your One 10 Pujo food order #${o.ref} (${flatLabel(f)}) has ${formatPaise(o.due_paise).replace(/\.00$/, "")} pending. Please pay on the food UPI QR and share the screenshot, or reply if you'd like to change or cancel it.`}
                  />
                ))}
              </FollowCard>
              <FollowCard title="Likely duplicate unpaid orders" hint="Same meals as another order of the same flat. Usually a retry — confirm with the resident, then cancel it on Food subscriptions." count={follow.dups.length} tone="red">
                {follow.dups.map(({ f, o }) => (
                  <FollowRow key={o.id} f={f} o={o}
                    right={<span className="text-xs text-brown-800/70">Same as #{o.duplicate_of} · {formatPaise(o.due_paise)}</span>}
                    note={`ordered ${formatDateIST(o.created_at)}`}
                  />
                ))}
              </FollowCard>
              <FollowCard title="Receipts not bank-verified" hint="Issued from a payment screenshot. Treasurer: tick these off against the bank statement before coupons go out." count={follow.unverified.length}>
                {follow.unverified.map(({ f, o, r }) => (
                  <FollowRow key={r.receipt_no} f={f} o={o}
                    right={<span className="text-xs">{r.receipt_no} · {formatPaise(r.amount_paise)}</span>}
                    note={`${r.ref ? `Ref ${r.ref} · ` : ""}issued ${formatDateIST(r.issued_at)}`}
                  />
                ))}
              </FollowCard>
              <FollowCard title="Ready for coupons" hint="Paid or complimentary orders whose coupons haven't been handed over yet." count={follow.coupons.length}>
                {follow.coupons.map(({ f, o }) => (
                  <FollowRow key={o.id} f={f} o={o}
                    right={<span className="text-xs">{o.plates} plates · {o.voucher_no || "voucher pending"}</span>}
                  />
                ))}
              </FollowCard>
              <FollowCard title="Subscribed flats yet to order" hint="Paid the Puja subscription (so complimentary breakfasts and Ashtami lunch are waiting) but no food order yet." count={(data?.subscribed_not_ordered || []).length}>
                {(data?.subscribed_not_ordered || []).map((f) => (
                  <div key={f.flat_id} className="flex flex-wrap items-center justify-between gap-2 border-t border-brown-800/10 py-2 text-sm first:border-t-0">
                    <div>
                      <span className="font-medium">{flatLabel(f)}</span>
                      <span className="ml-2 text-brown-800/60">{f.name || "—"}{f.mobile ? ` · ${f.mobile}` : ""}</span>
                    </div>
                    {f.mobile ? (
                      <a className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline" target="_blank" rel="noreferrer"
                        href={waLink(f.mobile, `Namaskar ${f.name || ""}, your flat ${flatLabel(f)} has complimentary Pujo breakfasts and Ashtami lunch waiting. Book them (and any other meals) at https://one10events.in/food`)}>
                        <MessageCircle className="h-3.5 w-3.5" /> Remind
                      </a>
                    ) : null}
                  </div>
                ))}
              </FollowCard>
            </div>
          )}
        </>
      )}

      <Dialog open={!!cell} onClose={() => setCell(null)} title={cell?.title || ""} size="lg">
        {cell ? (
          <div className="space-y-2 text-sm">
            <p className="text-brown-800/60">
              {withAwaiting ? "Confirmed + awaiting payment" : "Confirmed orders"} · {cellFlats.reduce((n, r) => n + r.veg + r.nonveg, 0)} plates across {cellFlats.filter((r) => r.veg + r.nonveg).length} flats
              {cellVendor ? <span className="text-violet-700"> · plus {cellVendor} vendor plate{cellVendor === 1 ? "" : "s"} (see Vendor meals)</span> : null}
            </p>
            <Table>
              <THead><TR><TH>Flat</TH><TH>Name</TH><TH right>Veg</TH><TH right>Non-veg</TH><TH right>Kids below 7</TH></TR></THead>
              <tbody>
                {cellFlats.map(({ f, veg, nonveg, kids, awaiting }) => (
                  <TR key={f.flat_id || flatLabel(f)}>
                    <TD className="whitespace-nowrap font-medium">{flatLabel(f)}</TD>
                    <TD className="text-xs">
                      {f.names[0] || "—"}
                      {!withAwaiting && awaiting ? <span className="ml-1 text-amber-700">(+{awaiting} awaiting)</span> : null}
                    </TD>
                    <TD right>{veg || "—"}</TD>
                    <TD right>{nonveg || "—"}</TD>
                    <TD right>{kids || "—"}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <ExportCsvButton
              filename={`serving_${cell.day}_${cell.meal}.csv`}
              items={cellFlats.map(({ f, veg, nonveg, kids }) => ({ flat: flatLabel(f), name: f.names[0] || "", mobile: f.mobiles[0] || "", veg, nonveg, kids }))}
              columns={[
                { key: "flat", label: "Flat" }, { key: "name", label: "Name" }, { key: "mobile", label: "Mobile" },
                { key: "veg", label: "Veg" }, { key: "nonveg", label: "Non-veg" }, { key: "kids", label: "Kids below 7" },
              ]}
              label="Export serving list"
            />
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

function Flag({ tone, children }) {
  const styles = {
    red: "bg-red-50 text-vermilion-600 ring-red-200",
    amber: "bg-amber-50 text-amber-800 ring-amber-300",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
  };
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 font-semibold ring-1 ${styles[tone]}`}>{children}</span>;
}

function FlatDetail({ f, freeQuota }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-brown-800/60">
          Meals across all orders{f.subscribed ? ` · complimentary used ${f.free_used}/${freeQuota}` : " · flat not subscribed (no complimentary meals)"}
        </h3>
        <table className="w-full text-xs">
          <tbody>
            {f.lines.map((l) => (
              <tr key={`${l.day_code}-${l.meal_code}-${l.diet}`} className="border-t border-brown-800/10">
                <td className="py-1 pr-2">{l.day_label}</td>
                <td className="py-1 pr-2">{l.meal_label}</td>
                <td className="py-1 pr-2">{dietShort(l.diet)}</td>
                <td className="py-1 pr-2 text-right font-semibold tabular-nums">{l.confirmed || ""}</td>
                <td className="py-1 text-brown-800/60">
                  {[l.awaiting ? `+${l.awaiting} awaiting` : "", l.free ? `${l.free} free` : "", l.kids ? `${l.kids} kid${l.kids === 1 ? "" : "s"} below 7` : ""].filter(Boolean).join(" · ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-brown-800/60">Orders and payments</h3>
        <div className="space-y-2">
          {f.orders.map((o) => (
            <div key={o.id} className="rounded-lg border border-brown-800/10 bg-white p-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Link to={`/admin/food?q=${o.ref}`} className="font-semibold text-vermilion-600 hover:underline">#{o.ref}</Link>
                <StatusBadge status={o.payment_status} />
                {o.duplicate_of ? <Flag tone="red">Same meals as #{o.duplicate_of}</Flag> : null}
                <span className="ml-auto tabular-nums">{formatPaise(o.total_paise)} · {o.plates} plates</span>
              </div>
              <div className="mt-1 text-brown-800/60">
                {o.name} · {formatDateIST(o.created_at)}
                {o.voucher_no ? ` · voucher ${o.voucher_no}` : ""}
                {o.coupons_given ? ` · coupons given (${o.coupon_no})` : ""}
              </div>
              {o.receipts.map((r) => (
                <div key={r.receipt_no} className="mt-1 flex items-center gap-2">
                  <span className="tabular-nums">{r.receipt_no}</span>
                  <span className="tabular-nums">{formatPaise(r.amount_paise)}</span>
                  {r.ref ? <span className="text-brown-800/50">{r.ref}</span> : null}
                  {r.bank_verified ? <span className="text-emerald-700">bank-verified</span> : <span className="inline-flex items-center gap-0.5 text-amber-700"><AlertTriangle className="h-3 w-3" /> screenshot only</span>}
                </div>
              ))}
              {o.due_paise ? <div className="mt-1 font-semibold text-vermilion-600">{formatPaise(o.due_paise)} due</div> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FollowCard({ title, hint, count, tone, children }) {
  const [open, setOpen] = useState(count > 0 && count <= 15);
  return (
    <Card><CardBody>
      <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setOpen((v) => !v)}>
        <div>
          <h2 className="font-display text-2xl">
            {title} <span className={`ml-1 rounded-full px-2 py-0.5 align-middle text-sm font-semibold ${count ? (tone === "red" ? "bg-red-50 text-vermilion-600" : "bg-amber-50 text-amber-800") : "bg-emerald-50 text-emerald-700"}`}>{count}</span>
          </h2>
          <p className="text-xs text-brown-800/55">{hint}</p>
        </div>
        {open ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
      </button>
      {open && count ? <div className="mt-3">{children}</div> : null}
    </CardBody></Card>
  );
}

function FollowRow({ f, o, right, note, wa }) {
  const mobile = f.mobiles[0];
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-brown-800/10 py-2 text-sm first:border-t-0">
      <div>
        <span className="font-medium">{flatLabel(f)}</span>
        <Link to={`/admin/food?q=${o.ref}`} className="ml-2 text-xs font-semibold text-vermilion-600 hover:underline">#{o.ref}</Link>
        <span className="ml-2 text-brown-800/60">{o.name}{mobile ? ` · ${mobile}` : ""}</span>
        {note ? <div className="text-[11px] text-brown-800/50">{note}</div> : null}
      </div>
      <div className="flex items-center gap-3">
        {right}
        {wa && mobile ? (
          <a className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline" target="_blank" rel="noreferrer" href={waLink(mobile, wa)}>
            <MessageCircle className="h-3.5 w-3.5" /> Message
          </a>
        ) : null}
      </div>
    </div>
  );
}
