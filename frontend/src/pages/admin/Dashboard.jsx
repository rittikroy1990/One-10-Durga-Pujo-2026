import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, PieChart as PieIcon, Wallet, UtensilsCrossed, Receipt } from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
} from "recharts";
import api from "../../lib/api";
import { Card, CardBody, Stat, Spinner, Button } from "../../components/ui";
import { formatPaise } from "../../lib/utils";
import { FootfallDayChart } from "../../components/Footfall";

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
};

const TOWER_PALETTE = [
  COLORS.vermilion, COLORS.gold, COLORS.emerald, COLORS.sky,
  COLORS.violet, COLORS.amber, COLORS.rose, "#0F766E",
];

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
    <div className="flex h-[240px] w-full items-center justify-center text-sm text-brown-800/45">{label}</div>
  );
}

function Donut({ data, innerRadius = 52, outerRadius = 82 }) {
  const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0);
  if (!total) return <EmptyChart />;
  return (
    <div className="h-[240px] w-full">
    <ResponsiveContainer width="100%" height="100%">
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
            <Cell key={d.name || i} fill={d.color || TOWER_PALETTE[i % TOWER_PALETTE.length]} />
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
    </div>
  );
}

function SectionTitle({ icon: Icon, title, to, linkLabel }) {
  return (
    <div className="flex min-h-[2rem] items-end justify-between gap-2">
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

export default function Dashboard() {
  const [col, setCol] = useState(null);
  const [fin, setFin] = useState(null);
  const [aud, setAud] = useState(null);
  const [foot, setFoot] = useState(null);
  const [exp, setExp] = useState(null);
  const [food, setFood] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.allSettled([
      api.get("/dashboards/collection").then((r) => setCol(r.data)),
      api.get("/dashboards/financial").then((r) => setFin(r.data)),
      api.get("/dashboards/audit").then((r) => setAud(r.data)).catch(() => setAud(null)),
      api.get("/admin/footfall").then((r) => setFoot(r.data)),
      api.get("/admin/expenses").then((r) => setExp(r.data.summary || null)),
      api.get("/admin/food-subscriptions").then((r) => setFood(r.data)),
    ]).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const paidMixPie = useMemo(() => {
    if (!col) return [];
    return [
      { name: "Subscription", value: Number(col.base_total) || 0, color: COLORS.emerald },
      { name: "Donations", value: Number(col.donation_total) || 0, color: COLORS.gold },
    ]
      .filter((d) => d.value > 0)
      .map((d) => ({ ...d, valueFmt: formatPaise(d.value) }));
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

  const towerBar = useMemo(() => {
    if (!col?.by_tower) return [];
    return col.by_tower
      .filter((t) => (t.paid || 0) > 0 || (t.registered || 0) > 0)
      .map((t) => ({
        tower: String(t.tower || "").replace(/^Tower\s+/i, "T"),
        paid: t.paid || 0,
        registered: t.registered || 0,
      }));
  }, [col]);

  const dailyArea = useMemo(() => {
    if (!col?.daily?.length) return [];
    return col.daily.map((d) => ({
      date: d.date,
      amount: (Number(d.amount) || 0) / 100,
      amountPaise: d.amount,
    }));
  }, [col]);

  const finPie = useMemo(() => {
    if (!fin) return [];
    return [
      { name: "Bank", value: Number(fin.bank_balance) || 0, color: COLORS.emerald },
      { name: "Cash", value: Number(fin.cash_balance) || 0, color: COLORS.gold },
      { name: "Gateway", value: Number(fin.gateway_clearing) || 0, color: COLORS.sky },
    ]
      .filter((d) => d.value > 0)
      .map((d) => ({ ...d, valueFmt: formatPaise(d.value) }));
  }, [fin]);

  const expensePie = useMemo(() => {
    const rows = exp?.by_category || [];
    return rows
      .filter((r) => Number(r.amount_paise) > 0)
      .map((r, i) => ({
        name: r.name || r.account_code || "Other",
        value: Number(r.amount_paise) || 0,
        color: TOWER_PALETTE[i % TOWER_PALETTE.length],
        valueFmt: formatPaise(r.amount_paise),
      }));
  }, [exp]);

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

  return (
    <div data-testid="admin-dashboard" data-page="control-tower">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl">Control Tower</h1>
          <p className="text-sm text-brown-800/50">
            High-level view of collection, expenses, food subscriptions and cash.
          </p>
        </div>
        <Button variant="subtle" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /> Refresh</Button>
      </div>

      {loading && <div className="flex justify-center py-16"><Spinner className="text-vermilion-500" /></div>}

      {!loading && (
        <div className="space-y-8">
          {/* KPI strip */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <Stat label="Collected" value={formatPaise(col?.grand_total)} accent="text-emerald-700" />
            <Stat label="Paid households" value={col?.paid ?? "—"} sub={col ? `${col.collection_rate_pct || 0}% of eligible` : undefined} />
            <Stat label="Expenses paid" value={formatPaise(exp?.paid_total_paise)} accent="text-vermilion-600" />
            <Stat label="Cash position" value={formatPaise(fin?.current_balance)} />
            <Stat label="Food orders" value={foodStats.total} sub={`${foodStats.meals} meal lines`} />
          </div>

          {/* Collection */}
          <section>
            <SectionTitle icon={Wallet} title="Collection" to="/admin/collection" linkLabel="Collection →" />
            <div className="grid items-stretch gap-4 lg:grid-cols-3">
              <Card className="flex h-full flex-col"><CardBody className="flex h-full flex-col">
                <h3 className="mb-1 flex items-center gap-2 font-display text-lg">
                  <PieIcon className="h-4 w-4 text-vermilion-500" /> Collected mix
                </h3>
                <p className="mb-1 text-xs text-brown-800/50">Subscription vs donations</p>
                {paidMixPie.length ? <Donut data={paidMixPie} /> : <EmptyChart label="No collections yet" />}
              </CardBody></Card>
              <Card className="flex h-full flex-col"><CardBody className="flex h-full flex-col">
                <h3 className="mb-1 font-display text-lg">Payment methods</h3>
                <p className="mb-1 text-xs text-brown-800/50">Share of collected amount</p>
                {methodPie.length ? <Donut data={methodPie} /> : <EmptyChart label="No method data" />}
              </CardBody></Card>
              <Card className="flex h-full flex-col"><CardBody className="flex h-full flex-col">
                <h3 className="mb-1 font-display text-lg">Paid by tower</h3>
                <p className="mb-1 text-xs text-brown-800/50">Households with receipts</p>
                {towerBar.length ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={towerBar} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E8DFD0" />
                      <XAxis dataKey="tower" tick={{ fontSize: 11, fill: "#6B5B4F" }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#6B5B4F" }} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E8DFD0", fontSize: 12 }} />
                      <Bar dataKey="paid" fill={COLORS.emerald} name="Paid" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart label="No paid households yet" />
                )}
              </CardBody></Card>
            </div>
            <Card className="mt-4"><CardBody>
              <h3 className="mb-1 font-display text-lg">Daily collection trend</h3>
              <p className="mb-2 text-xs text-brown-800/50">Amount collected by day (₹)</p>
              {dailyArea.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={dailyArea} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="collectFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLORS.vermilion} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={COLORS.vermilion} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8DFD0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6B5B4F" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#6B5B4F" }} />
                    <Tooltip
                      formatter={(v, _n, item) => [formatPaise(item?.payload?.amountPaise ?? Math.round(v * 100)), "Collected"]}
                      contentStyle={{ borderRadius: 8, border: "1px solid #E8DFD0", fontSize: 12 }}
                    />
                    <Area type="monotone" dataKey="amount" stroke={COLORS.vermilion} fill="url(#collectFill)" strokeWidth={2} name="Collected" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart label="No daily collections yet" />
              )}
            </CardBody></Card>
          </section>

          {/* Expenses + Food — equal columns, equal card heights */}
          <div className="grid items-stretch gap-6 lg:grid-cols-2">
            <section className="flex h-full min-w-0 flex-col gap-3">
              <SectionTitle icon={Receipt} title="Expenses" to="/admin/expenses" linkLabel="Expenses →" />
              <div className="grid grid-cols-2 items-stretch gap-3">
                <Stat className="min-w-0" label="Paid total" value={formatPaise(exp?.paid_total_paise)} accent="text-vermilion-600" />
                <Stat className="min-w-0" label="Paid records" value={exp?.count_paid ?? "—"} />
              </div>
              <Card className="flex min-h-[300px] flex-1 flex-col">
                <CardBody className="flex flex-1 flex-col p-5">
                  <h3 className="mb-1 font-display text-lg">By category</h3>
                  <p className="mb-1 text-xs text-brown-800/50">Paid expenses mix</p>
                  <div className="mt-auto flex min-h-[240px] flex-1 items-center justify-center">
                    {expensePie.length ? <Donut data={expensePie} /> : <EmptyChart label="No paid expenses yet" />}
                  </div>
                </CardBody>
              </Card>
            </section>

            <section className="flex h-full min-w-0 flex-col gap-3">
              <SectionTitle icon={UtensilsCrossed} title="Food subscriptions" to="/admin/food" linkLabel="Food →" />
              <div className="grid grid-cols-2 items-stretch gap-3">
                <Stat className="min-w-0" label="Orders" value={foodStats.total} sub={`${foodStats.meals} meal lines`} />
                <Stat
                  className="min-w-0"
                  label="Paid orders"
                  value={foodStats.paidCount}
                  accent="text-emerald-700"
                  sub={foodStats.paymentEnabled ? "Payment open" : "Payment not open yet"}
                />
              </div>
              <Card className="flex min-h-[300px] flex-1 flex-col">
                <CardBody className="flex flex-1 flex-col p-5">
                  <h3 className="mb-1 font-display text-lg">Order status</h3>
                  <p className="mb-1 text-xs text-brown-800/50">
                    Food page {foodStats.pageEnabled ? "open" : "coming soon"}
                  </p>
                  <div className="mt-auto flex min-h-[240px] flex-1 items-center justify-center">
                    {foodPie.length ? <Donut data={foodPie} /> : <EmptyChart label="No food orders yet" />}
                  </div>
                </CardBody>
              </Card>
            </section>
          </div>

          {/* Cash + Footfall — equal two-column row */}
          <div className="grid items-stretch gap-6 lg:grid-cols-2">
            <Card className="flex h-full min-w-0 flex-col">
              <CardBody className="flex flex-1 flex-col p-5">
                <h3 className="mb-1 font-display text-lg">Cash position</h3>
                <p className="mb-1 text-xs text-brown-800/50">Bank · cash · gateway</p>
                <div className="mb-2 grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-brown-800/45">Bank</span><div className="font-semibold tabular-nums">{formatPaise(fin?.bank_balance)}</div></div>
                  <div><span className="text-brown-800/45">Cash</span><div className="font-semibold tabular-nums">{formatPaise(fin?.cash_balance)}</div></div>
                </div>
                <div className="mt-auto flex min-h-[240px] flex-1 items-center justify-center">
                  {finPie.length ? <Donut data={finPie} innerRadius={44} outerRadius={72} /> : <EmptyChart label="No balances yet" />}
                </div>
              </CardBody>
            </Card>

            <Card className="flex h-full min-w-0 flex-col">
              <CardBody className="flex flex-1 flex-col p-5">
                <div className="mb-2 flex min-h-[2.75rem] flex-wrap items-end justify-between gap-2">
                  <div>
                    <h3 className="font-display text-lg">Digital pandal meter</h3>
                    <p className="text-xs text-brown-800/50">
                      Today {foot?.today_label || foot?.today || "—"} · All-time {foot?.total_label || foot?.total || "—"}
                    </p>
                  </div>
                  <Link to="/transparency" className="text-xs font-semibold text-vermilion-600 hover:underline">Public meter →</Link>
                </div>
                <div className="mt-auto flex min-h-[240px] flex-1 items-start justify-center overflow-auto">
                  {foot?.series?.length ? (
                    <div className="w-full self-stretch">
                      <FootfallDayChart series={foot.series} />
                    </div>
                  ) : (
                    <EmptyChart label="No footfall data yet" />
                  )}
                </div>
              </CardBody>
            </Card>
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
              </div>
            </div>
          </CardBody></Card>
        </div>
      )}
    </div>
  );
}
