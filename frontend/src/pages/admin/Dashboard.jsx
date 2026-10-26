import React, { useEffect, useState, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import {
  RefreshCw, PieChart as PieIcon, Wallet, UtensilsCrossed, Receipt, ImageDown, Share2, BookCheck,
  Landmark, ClipboardList, HeartHandshake,
} from "lucide-react";
import { toast } from "sonner";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  ComposedChart, Area, Line, ReferenceArea,
} from "recharts";
import api from "../../lib/api";
import { Card, CardBody, Stat, Spinner, Button } from "../../components/ui";
import { formatPaise } from "../../lib/utils";
import { FootfallDayChart } from "../../components/Footfall";
import {
  TOWER_COLORS,
  buildControlTowerPngBlob,
  shareOrDownloadPng,
} from "../../lib/controlTowerReport";

const COLORS = {
  vermilion: "#D9381E",
  gold: "#B5952F",
  emerald: "#047857",
  amber: "#D97706",
  brown: "#1F1412",
  sky: "#0EA5E9",
  violet: "#7C3AED",
  rose: "#E11D48",
  slate: "#64748B",
  teal: "#0F766E",
  pink: "#DB2777",
  blue: "#2563EB",
};

const METHOD_COLORS = {
  upi_qr: COLORS.emerald,
  cashfree: COLORS.sky,
  razorpay: COLORS.violet,
  cash: COLORS.gold,
  bank_transfer: COLORS.amber,
  cheque: COLORS.rose,
  other: COLORS.slate,
};

function methodLabel(m) {
  return String(m || "other").replace(/_/g, " ");
}

function isFoodPaid(status) {
  return ["paid", "captured", "settled"].includes(String(status || "").toLowerCase());
}

function isTower12(name) {
  const s = String(name || "").trim().toLowerCase();
  return s === "tower 12" || s === "t12" || s === "tower_12";
}

function towerShort(name) {
  return String(name || "").replace(/^Tower\s+/i, "T");
}

function towerSortKey(name) {
  const digits = String(name || "").replace(/\D/g, "");
  return digits ? Number(digits) : 999;
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const raw = p.payload || {};
  const value = raw.valueFmt || p.value;
  return (
    <div className="rounded-lg border border-brown-800/10 bg-white px-3 py-2 text-xs shadow-md">
      <div className="font-semibold text-brown-900">{raw.name || p.name}</div>
      <div className="mt-0.5 tabular-nums text-brown-800/70">{value}</div>
      {raw.extra ? <div className="mt-0.5 text-brown-800/50">{raw.extra}</div> : null}
    </div>
  );
}

function EmptyChart({ label = "No data yet" }) {
  return (
    <div className="flex h-52 items-center justify-center text-sm text-brown-800/45">{label}</div>
  );
}

function RingChart({ data, innerRadius = 52, outerRadius = 82, height = 240 }) {
  const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0);
  if (!total) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          paddingAngle={2}
          stroke="#FDFBF7"
          strokeWidth={2}
        >
          {data.map((d, i) => (
            <Cell key={d.name || i} fill={d.color || TOWER_COLORS[i % TOWER_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
        <Legend
          verticalAlign="bottom"
          height={36}
          formatter={(value) => <span className="text-xs text-brown-800/70">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

function Donut(props) {
  return <RingChart {...props} />;
}

function SolidPie({ data, outerRadius = 88, height = 240 }) {
  return <RingChart data={data} innerRadius={0} outerRadius={outerRadius} height={height} />;
}

function SectionTitle({ icon: Icon, title, to, linkLabel }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-2">
      <h2 className="flex items-center gap-2 font-display text-2xl text-brown-900">
        {Icon ? <Icon className="h-5 w-5 text-vermilion-500" /> : null}
        {title}
      </h2>
      {to ? (
        <Link to={to} className="text-xs font-semibold text-vermilion-600 hover:underline">
          {linkLabel || "Open →"}
        </Link>
      ) : null}
    </div>
  );
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function signedPaise(paise, plus = "") {
  const n = Number(paise) || 0;
  return `${n < 0 ? "−" : plus}${formatPaise(Math.abs(n))}`;
}

function lakhs(rupees) {
  const n = Number(rupees) || 0;
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(n % 100000 ? 1 : 0)}L`;
  if (Math.abs(n) >= 1000) return `₹${Math.round(n / 1000)}k`;
  return `₹${n}`;
}

const AXIS_TICK = { fontSize: 11, fill: "#6B5B4F" };
const TOOLTIP_STYLE = { borderRadius: 8, border: "1px solid #E8DFD0", fontSize: 12 };

const STREAMS = [
  { key: "subscription", name: "Subscription", color: COLORS.emerald },
  { key: "donation", name: "Donations", color: COLORS.gold },
  { key: "sponsorship", name: "Sponsorship", color: COLORS.violet },
  { key: "food", name: "Food", color: COLORS.sky },
];

const COMMITMENT_COLORS = {
  "Pandal & decoration": COLORS.vermilion,
  "Lighting & electrical": COLORS.amber,
  "Artists & cultural": COLORS.violet,
  Sound: COLORS.blue,
  "Idol & rituals": COLORS.gold,
  "Food & bhog": COLORS.emerald,
  "Kali Puja & Bijoya": COLORS.pink,
  Other: COLORS.slate,
};

function BalanceHistory({ check }) {
  const data = useMemo(() => {
    const bank = Object.fromEntries((check.bank_series || []).map((p) => [p.date, p.balance / 100]));
    const cashBook = Object.fromEntries((check.cash_series || []).map((p) => [p.date, p.balance / 100]));
    const dates = [...new Set([...Object.keys(bank), ...Object.keys(cashBook)])].sort();
    let icici = null;
    let cash = null;
    return dates.map((d) => {
      icici = bank[d] ?? icici;
      cash = cashBook[d] ?? cash;
      return { date: d, icici, cash };
    });
  }, [check]);
  const sv = check.statement_verified;
  if (!data.length) return <EmptyChart label="No balance history" />;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="iciciFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS.emerald} stopOpacity={0.35} />
            <stop offset="100%" stopColor={COLORS.emerald} stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#E8DFD0" />
        {sv && (
          <ReferenceArea
            x1={data.find((r) => r.date >= sv.from)?.date}
            x2={[...data].reverse().find((r) => r.date <= sv.to)?.date}
            fill={COLORS.sky}
            fillOpacity={0.08}
            label={{ value: "Checked against bank statement", position: "insideTop", fontSize: 10, fill: "#0369A1" }}
          />
        )}
        <XAxis dataKey="date" tickFormatter={fmtDate} tick={AXIS_TICK} minTickGap={24} />
        <YAxis tickFormatter={lakhs} tick={AXIS_TICK} width={52} />
        <Tooltip
          labelFormatter={fmtDate}
          formatter={(v, n) => [v == null ? "—" : formatPaise(Math.round(v * 100)), n]}
          contentStyle={TOOLTIP_STYLE}
        />
        <Legend formatter={(value) => <span className="text-xs text-brown-800/70">{value}</span>} />
        <Area type="stepAfter" dataKey="icici" name="ICICI balance" stroke={COLORS.emerald} fill="url(#iciciFill)" strokeWidth={2.5} connectNulls />
        <Line type="stepAfter" dataKey="cash" name="Cash in hand" stroke={COLORS.gold} strokeWidth={2.5} dot={false} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function Commitments({ rows }) {
  const groups = useMemo(() => {
    const g = {};
    for (const r of rows || []) {
      const k = r.group || "Other";
      g[k] = g[k] || { group: k, paid: 0, due: 0, committed: 0, vendors: 0 };
      g[k].paid += r.paid / 100;
      g[k].due += r.due / 100;
      g[k].committed += r.committed / 100;
      g[k].vendors += 1;
    }
    return Object.values(g).sort((a, b) => b.committed - a.committed);
  }, [rows]);
  if (!groups.length) return <EmptyChart label="No commitments recorded" />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, groups.length * 34 + 40)}>
      <BarChart data={groups} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E8DFD0" horizontal={false} />
        <XAxis type="number" tickFormatter={lakhs} tick={AXIS_TICK} />
        <YAxis type="category" dataKey="group" tick={AXIS_TICK} width={128} />
        <Tooltip
          formatter={(v, n) => [formatPaise(Math.round(v * 100)), n]}
          contentStyle={TOOLTIP_STYLE}
        />
        <Legend formatter={(value) => <span className="text-xs text-brown-800/70">{value}</span>} />
        <Bar dataKey="paid" name="Paid" stackId="c" fill={COLORS.emerald} />
        <Bar dataKey="due" name="Still due" stackId="c" fill={COLORS.slate} fillOpacity={0.35} radius={[0, 6, 6, 0]}>
          {groups.map((g) => <Cell key={g.group} fill={COMMITMENT_COLORS[g.group] || COLORS.slate} fillOpacity={0.35} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function Pledges({ pledges }) {
  if (!pledges) return <EmptyChart label="No donor tracker" />;
  const pct = pledges.proposed ? Math.min(100, Math.round((pledges.received / pledges.proposed) * 100)) : 0;
  return (
    <div>
      <div className="flex items-end justify-between text-sm">
        <div>
          <div className="font-display text-2xl tabular-nums text-emerald-700">{formatPaise(pledges.received)}</div>
          <div className="text-xs text-brown-800/50">received of {formatPaise(pledges.proposed)} pledged</div>
        </div>
        <div className="text-right text-xs text-brown-800/60">
          {pledges.paid_in_full} of {pledges.donors} donors paid in full
        </div>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-amber-100">
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-right text-xs tabular-nums text-brown-800/50">{pct}%</div>
      {pledges.pending?.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-brown-800/45">Still to come</div>
          <ul className="divide-y divide-brown-800/10 text-sm">
            {pledges.pending.map((p) => (
              <li key={p.name} className="flex items-center justify-between gap-2 py-1.5">
                <span className="truncate">
                  {p.name}
                  {p.flat ? <span className="ml-1 text-xs text-brown-800/45">{p.flat}</span> : null}
                </span>
                <span className="whitespace-nowrap tabular-nums text-amber-700">
                  {formatPaise(p.proposed - p.received)}
                  {p.received > 0 ? <span className="ml-1 text-xs text-brown-800/45">(part paid)</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function LedgerCheck({ check }) {
  const fundsRow = check.rows.find((r) => r.key === "total_funds");
  return (
    <Card className="overflow-hidden bg-gradient-to-br from-amber-50/60 via-white to-white" data-testid="ledger-check">
      <CardBody>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 font-display text-2xl text-brown-900">
              <BookCheck className="h-5 w-5 text-vermilion-500" /> Treasurer ledger check
            </h2>
            <p className="text-xs text-brown-800/50">
              Treasurer's ledger (bank to {fmtDate(check.as_of_bank)}) is the source of truth · compared with the live portal
            </p>
          </div>
          <div className="text-right text-sm">
            <div className="text-brown-800/50">Net after dues (ledger)</div>
            <div className={`font-display text-2xl tabular-nums ${check.net_after_dues < 0 ? "text-vermilion-600" : "text-emerald-700"}`}>
              {signedPaise(check.net_after_dues)}
            </div>
            <div className="text-xs text-brown-800/50">
              {formatPaise(fundsRow?.ledger)} funds − {formatPaise(check.expenses_due)} expenses still due
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-brown-800/45">
                <th className="py-1.5 pr-3 font-medium"> </th>
                <th className="py-1.5 pr-3 text-right font-medium">Ledger</th>
                <th className="py-1.5 pr-3 text-right font-medium">Portal now</th>
                <th className="py-1.5 pr-3 text-right font-medium">Difference</th>
                <th className="py-1.5 font-medium">Why</th>
              </tr>
            </thead>
            <tbody>
              {check.rows.map((r) => (
                <tr key={r.key} className={`border-t border-brown-800/10 ${r.key === "total_funds" ? "font-semibold" : ""}`}>
                  <td className="whitespace-nowrap py-2 pr-3">{r.label}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{formatPaise(r.ledger)}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{formatPaise(r.portal)}</td>
                  <td className={`whitespace-nowrap py-2 pr-3 text-right tabular-nums ${r.difference === 0 ? "text-emerald-700" : "text-amber-700"}`}>
                    {r.difference === 0 ? "✓ matches" : signedPaise(r.difference, "+")}
                  </td>
                  <td className="py-2 text-xs font-normal text-brown-800/60">{r.difference === 0 ? "" : r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {check.open_items?.length > 0 && (
          <div className="mt-4 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-800">Open with the treasurer</div>
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-brown-800/80">
              {check.open_items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export default function Dashboard() {
  const [col, setCol] = useState(null);
  const [fin, setFin] = useState(null);
  const [aud, setAud] = useState(null);
  const [foot, setFoot] = useState(null);
  const [food, setFood] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const reportBusy = useRef(false);

  const load = () => {
    setLoading(true);
    Promise.allSettled([
      api.get("/dashboards/collection").then((r) => setCol(r.data)),
      api.get("/dashboards/financial").then((r) => setFin(r.data)),
      api.get("/dashboards/audit").then((r) => setAud(r.data)).catch(() => setAud(null)),
      api.get("/admin/footfall").then((r) => setFoot(r.data)),
      api.get("/admin/food-subscriptions").then((r) => setFood(r.data)),
    ]).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const paidMixPie = useMemo(() => {
    if (!col) return [];
    const counts = col.counts || {};
    return [
      { name: "Subscription", value: Number(col.base_total) || 0, color: COLORS.emerald, extra: `${counts.subscriptions ?? "—"} households` },
      { name: "Donations", value: Number(col.donation_total) || 0, color: COLORS.gold, extra: `${counts.donations ?? "—"} donation receipts + extra with subscriptions` },
      { name: "Sponsorship", value: Number(col.sponsorship_total) || 0, color: COLORS.violet, extra: `${counts.sponsors ?? "—"} sponsors` },
      { name: "Food (YES Bank)", value: Number(col.food_total) || 0, color: COLORS.sky, extra: `${counts.food_subscriptions ?? "—"} paid food subscriptions` },
    ]
      .filter((d) => d.value > 0)
      .map((d) => ({ ...d, valueFmt: formatPaise(d.value) }));
  }, [col]);

  const subHeadsPie = useMemo(() => {
    const colors = [COLORS.vermilion, COLORS.pink, COLORS.amber];
    return (col?.subscription_heads || [])
      .filter((h) => Number(h.amount) > 0)
      .map((h, i) => ({ name: h.label, value: Number(h.amount), color: colors[i % colors.length], valueFmt: formatPaise(h.amount) }));
  }, [col]);

  const methodPie = useMemo(() => {
    if (!col?.method_totals) return [];
    return Object.entries(col.method_totals)
      .filter(([, v]) => Number(v) > 0)
      .map(([m, v]) => ({
        name: methodLabel(m),
        value: Number(v),
        color: METHOD_COLORS[m] || COLORS.slate,
        valueFmt: formatPaise(v),
      }));
  }, [col]);

  const towersClean = useMemo(() => {
    if (!col?.by_tower) return [];
    return [...col.by_tower]
      .filter((t) => !isTower12(t.tower) && t.tower_id !== "tower_12")
      .sort((a, b) => towerSortKey(a.tower) - towerSortKey(b.tower));
  }, [col]);

  // Homes → pie; amount → bar (same towers, different metrics — no chart-type duplicate)
  const towerPaidPie = useMemo(() => {
    return towersClean
      .filter((t) => (Number(t.paid) || 0) > 0)
      .map((t, i) => ({
        name: towerShort(t.tower),
        value: Number(t.paid) || 0,
        color: TOWER_COLORS[i % TOWER_COLORS.length],
        valueFmt: `${t.paid} households`,
        extra: formatPaise(t.amount || 0),
      }));
  }, [towersClean]);

  const towerAmountBar = useMemo(() => {
    return towersClean
      .filter((t) => (Number(t.amount) || 0) > 0)
      .map((t, i) => ({
        tower: towerShort(t.tower),
        amountRupees: Math.round((Number(t.amount) || 0) / 100),
        amountPaise: Number(t.amount) || 0,
        subscription: Math.round((Number(t.subscription) || 0) / 100),
        donation: Math.round((Number(t.donation) || 0) / 100),
        homes: Number(t.paid) || 0,
        registered: Number(t.registered) || 0,
        towerColor: TOWER_COLORS[i % TOWER_COLORS.length],
      }));
  }, [towersClean]);

  const towerAmountSlices = useMemo(
    () =>
      towerAmountBar.map((t) => ({
        name: t.tower,
        value: t.amountPaise,
        color: t.towerColor,
        valueFmt: formatPaise(t.amountPaise),
      })),
    [towerAmountBar],
  );

  const dailyArea = useMemo(() => {
    if (!col?.daily?.length) return [];
    let running = 0;
    return col.daily.map((d) => {
      const row = { date: d.date };
      for (const s of STREAMS) row[s.key] = (Number(d[s.key]) || 0) / 100;
      running += (Number(d.amount) || 0) / 100;
      row.cumulative = running;
      return row;
    });
  }, [col]);

  const finPie = useMemo(() => {
    if (!fin) return [];
    return [
      { name: "ICICI", value: Number(fin.icici_balance ?? fin.bank_balance) || 0, color: COLORS.emerald },
      { name: "YES Bank", value: Number(fin.yes_balance) || 0, color: COLORS.blue },
      { name: "Cash", value: Number(fin.cash_balance) || 0, color: COLORS.gold },
      { name: "With members", value: Number(fin.held_by_members) || 0, color: COLORS.rose },
      { name: "Gateway", value: Number(fin.gateway_clearing) || 0, color: COLORS.sky },
    ]
      .filter((d) => d.value > 0)
      .map((d) => ({ ...d, valueFmt: formatPaise(d.value) }));
  }, [fin]);

  const expensePie = useMemo(() => {
    const rows = fin?.expenses_by_head || [];
    return rows
      .filter((r) => Number(r.amount) > 0)
      .map((r, i) => ({
        name: r.name || r.code || "Other",
        value: Number(r.amount) || 0,
        color: TOWER_COLORS[i % TOWER_COLORS.length],
        valueFmt: formatPaise(r.amount),
      }));
  }, [fin]);

  const foodStats = useMemo(() => {
    const items = food?.items || [];
    let paidCount = 0;
    let unpaidCount = 0;
    let paidPaise = 0;
    let residualPaise = 0;
    let meals = 0;
    for (const row of items) {
      const amt = Number(row.total_amount_paise) || 0;
      meals += Number(row.selection_count) || 0;
      if (isFoodPaid(row.payment_status)) {
        paidCount += 1;
        paidPaise += amt;
      } else {
        unpaidCount += 1;
        residualPaise += amt;
      }
    }
    return {
      total: items.length,
      paidCount,
      unpaidCount,
      paidPaise,
      residualPaise,
      meals,
      pageEnabled: !!food?.page_enabled,
      communityClosed: !!food?.community_closed,
      paymentEnabled: !!food?.payment_enabled,
    };
  }, [food]);

  const foodPie = useMemo(() => {
    const rows = [
      { name: "Paid", value: foodStats.paidCount || foodStats.paidPaise, color: COLORS.emerald, valueFmt: foodStats.paidPaise ? formatPaise(foodStats.paidPaise) : `${foodStats.paidCount} orders` },
      { name: "Unpaid", value: foodStats.unpaidCount || foodStats.residualPaise, color: COLORS.slate, valueFmt: `${foodStats.unpaidCount} orders` },
    ].filter((d) => d.value > 0);
    return rows;
  }, [foodStats]);

  const auditFlags = aud
    ? (aud.unreconciled_items || 0)
      + (aud.duplicate_payments || 0)
      + (aud.refunds_pending || 0)
      + (aud.missing_evidence || 0)
    : 0;

  const fundsPaise = (Number(fin?.bank_balance) || 0) + (Number(fin?.cash_balance) || 0);
  const ledgerCheck = fin?.ledger_check || null;

  const generateReport = async () => {
    if (reportBusy.current || loading || !col) return;
    reportBusy.current = true;
    setExporting(true);
    try {
      const blob = await buildControlTowerPngBlob({
        collected: formatPaise(col?.grand_total),
        paidHouseholds: col?.paid ?? "—",
        expenses: formatPaise(fin?.expenses_paid),
        netBalance: formatPaise(fundsPaise),
        foodOrders: String(foodStats.total ?? 0),
        towerSlices: towerAmountSlices,
        methodSlices: methodPie,
        towerHomes: towerPaidPie,
      });
      const stamp = new Date().toISOString().slice(0, 10);
      const filename = `one10-control-tower-${stamp}.png`;
      const mode = await shareOrDownloadPng(blob, filename);
      if (mode === "shared") toast.success("Report shared");
      else if (mode === "downloaded") toast.success("PNG downloaded — share it on WhatsApp");
    } catch (err) {
      console.error(err);
      toast.error("Could not generate report PNG");
    } finally {
      setExporting(false);
      reportBusy.current = false;
    }
  };

  return (
    <div data-testid="admin-dashboard" data-page="control-tower">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl">Control Tower</h1>
          <p className="text-sm text-brown-800/50">
            High-level view of collection, expenses, food subscriptions and cash.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={generateReport}
            disabled={loading || exporting || !col}
            data-testid="control-tower-report"
          >
            {exporting ? <Spinner className="h-4 w-4 text-white" /> : <Share2 className="h-4 w-4" />}
            {exporting ? "Building…" : "Share report PNG"}
          </Button>
          <Button variant="subtle" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      {loading && <div className="flex justify-center py-16"><Spinner className="text-vermilion-500" /></div>}

      {!loading && (
        <div className="space-y-8">
          {/* KPI strip */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <Stat
              label="Puja collections"
              value={formatPaise(col?.grand_total)}
              accent="text-emerald-700"
              sub={col?.food_total ? `+ ${formatPaise(col.food_total)} food (YES Bank)` : "Subscription + donations + sponsorship"}
            />
            <Stat
              label="Subscribed households"
              value={col?.paid ?? "—"}
              sub={col ? `${col.collection_rate_pct || 0}% of ${col.eligible} eligible` : undefined}
            />
            <Stat
              label="Expenses paid"
              value={formatPaise(fin?.expenses_paid)}
              accent="text-vermilion-600"
              sub={ledgerCheck?.expenses_due ? `${formatPaise(ledgerCheck.expenses_due)} still due to vendors` : undefined}
            />
            <Stat
              label="Funds in hand"
              value={formatPaise(fundsPaise)}
              accent="text-emerald-800"
              sub="ICICI + YES Bank + cash"
            />
            <Stat label="Food orders" value={foodStats.total} sub={`${foodStats.meals} meal lines`} />
          </div>

          {ledgerCheck && <LedgerCheck check={ledgerCheck} />}

          {ledgerCheck && (
            <section>
              <SectionTitle icon={Landmark} title="Treasurer's books" to="/admin/reconciliation" linkLabel="Reconciliation →" />
              <Card className="overflow-hidden bg-gradient-to-br from-emerald-50/60 via-white to-sky-50/30">
                <CardBody>
                  <h3 className="mb-1 font-display text-lg">ICICI balance and cash in hand</h3>
                  <p className="mb-2 text-xs text-brown-800/50">
                    Running balances from the treasurer's ledger, {fmtDate(ledgerCheck.bank_series?.[0]?.date)} to {fmtDate(ledgerCheck.as_of_bank)}
                    {ledgerCheck.statement_verified
                      ? ` · ${fmtDate(ledgerCheck.statement_verified.from)}–${fmtDate(ledgerCheck.statement_verified.to)} matched line by line to the ICICI statement (${ledgerCheck.statement_verified.rows} entries)`
                      : ""}
                  </p>
                  <BalanceHistory check={ledgerCheck} />
                </CardBody>
              </Card>
              <div className="mt-4 grid gap-4 lg:grid-cols-5">
                <Card className="overflow-hidden bg-gradient-to-br from-rose-50/50 via-white to-white lg:col-span-3">
                  <CardBody>
                    <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                      <div>
                        <h3 className="flex items-center gap-2 font-display text-lg">
                          <ClipboardList className="h-4 w-4 text-vermilion-500" /> Vendor commitments
                        </h3>
                        <p className="text-xs text-brown-800/50">Expense ledger: agreed amounts, paid vs still due, by head</p>
                      </div>
                      <div className="flex gap-4 text-right text-xs">
                        <div><div className="text-brown-800/45">Committed</div><div className="font-semibold tabular-nums">{formatPaise(ledgerCheck.expenses_committed)}</div></div>
                        <div><div className="text-brown-800/45">Paid</div><div className="font-semibold tabular-nums text-emerald-700">{formatPaise(ledgerCheck.rows.find((r) => r.key === "expenses_paid")?.ledger)}</div></div>
                        <div><div className="text-brown-800/45">Due</div><div className="font-semibold tabular-nums text-vermilion-600">{formatPaise(ledgerCheck.expenses_due)}</div></div>
                      </div>
                    </div>
                    <Commitments rows={ledgerCheck.commitments} />
                  </CardBody>
                </Card>
                <Card className="overflow-hidden bg-gradient-to-br from-amber-50/60 via-white to-white lg:col-span-2">
                  <CardBody>
                    <h3 className="mb-1 flex items-center gap-2 font-display text-lg">
                      <HeartHandshake className="h-4 w-4 text-gold-600" /> Donor pledges
                    </h3>
                    <p className="mb-3 text-xs text-brown-800/50">Donations tracker: pledged vs received</p>
                    <Pledges pledges={ledgerCheck.pledges} />
                  </CardBody>
                </Card>
              </div>
            </section>
          )}

          {/* Collection */}
          <section>
            <SectionTitle icon={Wallet} title="Collection" to="/admin/collection" linkLabel="Collection →" />
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="overflow-hidden bg-gradient-to-br from-emerald-50/80 via-white to-white">
                <CardBody>
                  <h3 className="mb-1 flex items-center gap-2 font-display text-lg">
                    <PieIcon className="h-4 w-4 text-emerald-600" /> Collected mix
                  </h3>
                  <p className="mb-1 text-xs text-brown-800/50">Where the money came from · food is kept separate (YES Bank)</p>
                  {paidMixPie.length ? <Donut data={paidMixPie} /> : <EmptyChart label="No collections yet" />}
                </CardBody>
              </Card>
              <Card className="overflow-hidden bg-gradient-to-br from-sky-50/70 via-white to-white">
                <CardBody>
                  <h3 className="mb-1 font-display text-lg">Payment methods</h3>
                  <p className="mb-1 text-xs text-brown-800/50">Share of puja collections</p>
                  {methodPie.length ? <Donut data={methodPie} /> : <EmptyChart label="No method data" />}
                </CardBody>
              </Card>
              <Card className="overflow-hidden bg-gradient-to-br from-violet-50/70 via-white to-rose-50/30">
                <CardBody>
                  <h3 className="mb-1 font-display text-lg">Subscribed homes by tower</h3>
                  <p className="mb-1 text-xs text-brown-800/50">Households with a subscription receipt · Towers 1–11</p>
                  {towerPaidPie.length ? (
                    <SolidPie data={towerPaidPie} />
                  ) : (
                    <EmptyChart label="No paid households yet" />
                  )}
                </CardBody>
              </Card>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <Card className="overflow-hidden bg-gradient-to-br from-amber-50/50 via-white to-white lg:col-span-2">
                <CardBody>
                  <h3 className="mb-1 font-display text-lg">Collected ₹ by tower</h3>
                  <p className="mb-1 text-xs text-brown-800/50">Resident subscriptions and donations · Towers 1–11</p>
                  {towerAmountBar.length ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={towerAmountBar} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E8DFD0" />
                        <XAxis dataKey="tower" tick={AXIS_TICK} />
                        <YAxis tickFormatter={lakhs} tick={AXIS_TICK} width={52} />
                        <Tooltip
                          labelFormatter={(t, items) => {
                            const p = items?.[0]?.payload;
                            return p ? `${t} · ${p.homes} of ${p.registered} homes subscribed · ${formatPaise(p.amountPaise)}` : t;
                          }}
                          formatter={(v, n) => [formatPaise(Math.round(v * 100)), n]}
                          contentStyle={TOOLTIP_STYLE}
                        />
                        <Legend formatter={(value) => <span className="text-xs text-brown-800/70">{value}</span>} />
                        <Bar dataKey="subscription" name="Subscription" stackId="t" fill={COLORS.emerald} />
                        <Bar dataKey="donation" name="Donations" stackId="t" fill={COLORS.gold} radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart label="No tower amounts yet" />
                  )}
                </CardBody>
              </Card>
              <Card className="overflow-hidden bg-gradient-to-br from-rose-50/50 via-white to-white">
                <CardBody>
                  <h3 className="mb-1 font-display text-lg">Subscription by puja</h3>
                  <p className="mb-1 text-xs text-brown-800/50">How the ₹3,500 subscriptions are split</p>
                  {subHeadsPie.length ? <Donut data={subHeadsPie} height={280} /> : <EmptyChart label="No subscriptions yet" />}
                </CardBody>
              </Card>
            </div>

            <Card className="mt-4 overflow-hidden bg-gradient-to-b from-vermilion-500/5 to-white">
              <CardBody>
                <h3 className="mb-1 font-display text-lg">Collections by payment date</h3>
                <p className="mb-2 text-xs text-brown-800/50">
                  Dated by when the money reached the bank or cash book (not when the receipt was issued) · line shows the running puja total
                </p>
                {dailyArea.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={dailyArea} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E8DFD0" />
                      <XAxis dataKey="date" tickFormatter={fmtDate} tick={AXIS_TICK} minTickGap={16} />
                      <YAxis yAxisId="day" tickFormatter={lakhs} tick={AXIS_TICK} width={52} />
                      <YAxis yAxisId="total" orientation="right" tickFormatter={lakhs} tick={AXIS_TICK} width={52} />
                      <Tooltip
                        labelFormatter={fmtDate}
                        formatter={(v, n) => [formatPaise(Math.round(v * 100)), n]}
                        contentStyle={TOOLTIP_STYLE}
                      />
                      <Legend formatter={(value) => <span className="text-xs text-brown-800/70">{value}</span>} />
                      {STREAMS.map((s) => (
                        <Bar key={s.key} yAxisId="day" dataKey={s.key} name={s.name} stackId="d" fill={s.color} />
                      ))}
                      <Line yAxisId="total" type="monotone" dataKey="cumulative" name="Running total (puja)" stroke={COLORS.vermilion} strokeWidth={2.5} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart label="No daily collections yet" />
                )}
              </CardBody>
            </Card>
          </section>

          {/* Expenses + Food */}
          <div className="grid gap-8 lg:grid-cols-2">
            <section>
              <SectionTitle icon={Receipt} title="Expenses" to="/admin/expenses" linkLabel="Expenses →" />
              <div className="mb-3 grid grid-cols-2 gap-3">
                <Stat label="Paid so far" value={formatPaise(fin?.expenses_paid)} accent="text-vermilion-600" />
                <Stat
                  label="Still due (ledger)"
                  value={ledgerCheck?.expenses_due != null ? formatPaise(ledgerCheck.expenses_due) : "—"}
                  accent="text-amber-700"
                  sub={ledgerCheck?.expenses_committed ? `of ${formatPaise(ledgerCheck.expenses_committed)} committed` : undefined}
                />
              </div>
              <Card className="overflow-hidden bg-gradient-to-br from-rose-50/60 to-white">
                <CardBody>
                  <h3 className="mb-1 font-display text-lg">Paid by head</h3>
                  <p className="mb-1 text-xs text-brown-800/50">From the books (posted journals), incl. Khuti Puja and bank charges</p>
                  {expensePie.length ? <Donut data={expensePie} /> : <EmptyChart label="No paid expenses yet" />}
                </CardBody>
              </Card>
            </section>

            <section>
              <SectionTitle icon={UtensilsCrossed} title="Food subscriptions" to="/admin/food" linkLabel="Food →" />
              <div className="mb-3 grid grid-cols-3 gap-3">
                <Stat label="Subscriptions" value={foodStats.total} sub={`${foodStats.meals} meal lines`} />
                <Stat
                  label="Paid"
                  value={foodStats.paidCount}
                  accent="text-emerald-700"
                  sub={foodStats.paymentEnabled ? "Payment open" : "Payment not open yet"}
                />
                <Stat
                  label="Not paid"
                  value={foodStats.unpaidCount}
                  accent="text-amber-700"
                />
              </div>
              <Card className="overflow-hidden bg-gradient-to-br from-amber-50/70 to-white">
                <CardBody>
                  <h3 className="mb-1 font-display text-lg">Order status</h3>
                  <p className="mb-1 text-xs text-brown-800/50">
                    Food page {!foodStats.pageEnabled ? "coming soon" : foodStats.communityClosed ? "closed to the community (committee only)" : "open"}
                  </p>
                  {foodPie.length ? <Donut data={foodPie} /> : <EmptyChart label="No food orders yet" />}
                </CardBody>
              </Card>
            </section>
          </div>

          {/* Cash + Footfall + Audit */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="overflow-hidden bg-gradient-to-br from-emerald-50/80 to-sky-50/40">
              <CardBody>
                <h3 className="mb-1 font-display text-lg">Bank &amp; cash on hand</h3>
                <p className="mb-1 text-xs text-brown-800/50">Portal ledger balances</p>
                <div className="mb-2 grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-brown-800/45">ICICI</span><div className="font-semibold tabular-nums">{formatPaise(fin?.icici_balance ?? fin?.bank_balance)}</div></div>
                  <div><span className="text-brown-800/45">YES Bank (food)</span><div className="font-semibold tabular-nums">{formatPaise(fin?.yes_balance)}</div></div>
                  <div><span className="text-brown-800/45">Cash</span><div className="font-semibold tabular-nums">{formatPaise(fin?.cash_balance)}</div></div>
                  <div><span className="text-brown-800/45">With members</span><div className="font-semibold tabular-nums">{formatPaise(fin?.held_by_members)}</div></div>
                </div>
                {Number(fin?.unidentified_deposits) > 0 && (
                  <p className="mb-1 text-xs text-amber-700">
                    {formatPaise(fin.unidentified_deposits)} of ICICI deposits not yet matched to a payer
                  </p>
                )}
                {finPie.length ? <Donut data={finPie} innerRadius={44} outerRadius={72} /> : <EmptyChart label="No balances yet" />}
              </CardBody>
            </Card>

            <Card className="lg:col-span-2"><CardBody>
              <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg">Digital pandal meter</h3>
                  <p className="text-xs text-brown-800/50">
                    Today {foot?.today_label || foot?.today || "—"} · All-time {foot?.total_label || foot?.total || "—"}
                  </p>
                </div>
                <Link to="/transparency" className="text-xs font-semibold text-vermilion-600 hover:underline">Public meter →</Link>
              </div>
              {foot?.series?.length ? (
                <FootfallDayChart series={foot.series} />
              ) : (
                <EmptyChart label="No footfall data yet" />
              )}
            </CardBody></Card>
          </div>

          <Card><CardBody>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-lg">Control flags</h3>
                <p className="text-xs text-brown-800/50">
                  {auditFlags === 0
                    ? "No open audit flags."
                    : `${auditFlags} open flag${auditFlags === 1 ? "" : "s"} needing attention.`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-sun-50 px-3 py-1 ring-1 ring-sun-400/30">
                  Unreconciled {aud?.unreconciled_items ?? "—"}
                </span>
                <span className="rounded-full bg-sun-50 px-3 py-1 ring-1 ring-sun-400/30">
                  Dup payments {aud?.duplicate_payments ?? "—"}
                </span>
                <span className="rounded-full bg-sun-50 px-3 py-1 ring-1 ring-sun-400/30">
                  Refunds {aud?.refunds_pending ?? "—"}
                </span>
                <Link to="/admin/audit" className="rounded-full bg-vermilion-500/10 px-3 py-1 font-semibold text-vermilion-700 ring-1 ring-vermilion-500/20 hover:bg-vermilion-500/15">
                  Audit →
                </Link>
                <button
                  type="button"
                  onClick={generateReport}
                  disabled={exporting || !col}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-600/10 px-3 py-1 font-semibold text-emerald-800 ring-1 ring-emerald-600/20 hover:bg-emerald-600/15 disabled:opacity-50"
                >
                  <ImageDown className="h-3.5 w-3.5" /> WhatsApp PNG
                </button>
              </div>
            </div>
          </CardBody></Card>
        </div>
      )}
    </div>
  );
}
