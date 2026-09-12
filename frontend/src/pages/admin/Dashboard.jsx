import React, { useEffect, useState, useMemo } from "react";
import { TrendingUp, RefreshCw, PieChart as PieIcon } from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
} from "recharts";
import api from "../../lib/api";
import { Card, CardBody, Stat, Tabs, Spinner, Button } from "../../components/ui";
import { formatPaise } from "../../lib/utils";

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
  ivory: "#E8DFD0",
};

const TOWER_PALETTE = [
  COLORS.vermilion, COLORS.gold, COLORS.emerald, COLORS.sky,
  COLORS.violet, COLORS.amber, COLORS.rose, "#0F766E",
  "#C2410C", "#4338CA", "#BE185D", COLORS.slate,
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
    <div className="flex h-56 items-center justify-center text-sm text-brown-800/45">{label}</div>
  );
}

function Donut({ data, innerRadius = 58, outerRadius = 88 }) {
  const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0);
  if (!total) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={260}>
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
  );
}

function SolidPie({ data }) {
  const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0);
  if (!total) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="48%"
          outerRadius={95}
          paddingAngle={1.5}
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
          height={48}
          formatter={(value) => <span className="text-xs text-brown-800/70">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export default function Dashboard() {
  const [tab, setTab] = useState("collection");
  const [col, setCol] = useState(null);
  const [fin, setFin] = useState(null);
  const [aud, setAud] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.allSettled([
      api.get("/dashboards/collection").then((r) => setCol(r.data)),
      api.get("/dashboards/financial").then((r) => setFin(r.data)),
      api.get("/dashboards/audit").then((r) => setAud(r.data)),
    ]).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const statusPie = useMemo(() => {
    if (!col) return [];
    const paid = Number(col.paid) || 0;
    const unpaid = Math.max((Number(col.eligible) || 0) - paid, 0);
    return [
      { name: "Paid", value: paid, color: COLORS.emerald, valueFmt: `${paid} households` },
      { name: "Unpaid (eligible)", value: unpaid, color: COLORS.vermilion, valueFmt: `${unpaid} households` },
    ].filter((d) => d.value > 0);
  }, [col]);

  const towerRegPie = useMemo(() => {
    if (!col?.by_tower) return [];
    return col.by_tower
      .filter((t) => (t.registered || 0) > 0)
      .map((t, i) => ({
        name: t.tower,
        value: t.registered,
        color: TOWER_PALETTE[i % TOWER_PALETTE.length],
        valueFmt: `${t.registered} registered`,
        extra: `${t.paid || 0} paid`,
      }));
  }, [col]);

  const towerPaidPie = useMemo(() => {
    if (!col?.by_tower) return [];
    const paidRows = col.by_tower.filter((t) => (t.paid || 0) > 0);
    if (!paidRows.length) return [];
    return paidRows.map((t, i) => ({
      name: t.tower,
      value: t.paid,
      color: TOWER_PALETTE[i % TOWER_PALETTE.length],
      valueFmt: `${t.paid} paid`,
      extra: `${t.registered || 0} registered`,
    }));
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

  const exceptionsPie = useMemo(() => {
    if (!col?.exceptions) return [];
    const rows = [
      { name: "Duplicate payments", value: col.exceptions.duplicate_payments || 0, color: COLORS.amber },
      { name: "Refunds open", value: col.exceptions.refunds_open || 0, color: COLORS.rose },
      { name: "Recon required", value: col.exceptions.reconciliation_required || 0, color: COLORS.violet },
      {
        name: "Clear",
        value: (
          !(col.exceptions.duplicate_payments || col.exceptions.refunds_open || col.exceptions.reconciliation_required)
            ? 1 : 0
        ),
        color: COLORS.emerald,
        valueFmt: "No open exceptions",
      },
    ].filter((d) => d.value > 0);
    return rows;
  }, [col]);

  const towerBar = useMemo(() => {
    if (!col?.by_tower) return [];
    return col.by_tower.map((t) => ({
      tower: String(t.tower || "").replace(/^Tower\s+/i, "T"),
      paid: t.paid || 0,
      unpaid: Math.max((t.registered || 0) - (t.paid || 0), 0),
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
      { name: "Gateway clearing", value: Number(fin.gateway_clearing) || 0, color: COLORS.sky },
    ]
      .filter((d) => d.value > 0)
      .map((d) => ({ ...d, valueFmt: formatPaise(d.value) }));
  }, [fin]);

  const auditPie = useMemo(() => {
    if (!aud) return [];
    const rows = [
      { name: "Unreconciled", value: aud.unreconciled_items || 0, color: COLORS.amber },
      { name: "Dup invoices", value: aud.duplicate_invoices || 0, color: COLORS.rose },
      { name: "Dup payments", value: aud.duplicate_payments || 0, color: COLORS.vermilion },
      { name: "Manual overrides", value: aud.manual_overrides || 0, color: COLORS.violet },
      { name: "Refunds pending", value: aud.refunds_pending || 0, color: COLORS.gold },
      { name: "Missing evidence", value: aud.missing_evidence || 0, color: COLORS.slate },
    ].filter((d) => d.value > 0);
    if (!rows.length) {
      return [{ name: "All clear", value: 1, color: COLORS.emerald, valueFmt: "No audit flags" }];
    }
    return rows;
  }, [aud]);

  return (
    <div data-testid="admin-dashboard">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-4xl">Committee Dashboards</h1>
          <p className="text-sm text-brown-800/50">One source of truth — receipts, ledger and reports reconcile.</p>
        </div>
        <Button variant="subtle" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /> Refresh</Button>
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[
        { value: "collection", label: "Collection" },
        { value: "financial", label: "Financial" },
        { value: "audit", label: "Audit / Control" },
      ]} />

      {loading && <div className="flex justify-center py-16"><Spinner className="text-vermilion-500" /></div>}

      {!loading && tab === "collection" && col && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Stat label="Eligible households" value={col.eligible} sub="configurable" />
            <Stat label="Paid" value={col.paid} accent="text-emerald-700" />
            <Stat label="Collection rate" value={`${col.collection_rate_pct}%`} accent="text-vermilion-600" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Base subscription" value={formatPaise(col.base_total)} />
            <Stat label="Voluntary donations" value={formatPaise(col.donation_total)} />
            <Stat label="Grand total collected" value={formatPaise(col.grand_total)} accent="text-emerald-700" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardBody>
              <h3 className="mb-1 font-display text-xl flex items-center gap-2">
                <PieIcon className="h-5 w-5 text-vermilion-500" /> Collection status
              </h3>
              <p className="mb-2 text-xs text-brown-800/50">Paid vs unpaid against eligible households</p>
              <Donut data={statusPie} />
            </CardBody></Card>

            <Card><CardBody>
              <h3 className="mb-1 font-display text-xl">Payment methods</h3>
              <p className="mb-2 text-xs text-brown-800/50">Share of collected amount by method</p>
              <Donut data={methodPie} />
            </CardBody></Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardBody>
              <h3 className="mb-1 font-display text-xl flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-vermilion-500" /> Registration by tower
              </h3>
              <p className="mb-2 text-xs text-brown-800/50">Households registered per tower</p>
              <SolidPie data={towerRegPie} />
            </CardBody></Card>

            <Card><CardBody>
              <h3 className="mb-1 font-display text-xl">Paid by tower</h3>
              <p className="mb-2 text-xs text-brown-800/50">Issued receipts by tower</p>
              {towerPaidPie.length ? <SolidPie data={towerPaidPie} /> : <EmptyChart label="No paid households yet" />}
            </CardBody></Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardBody>
              <h3 className="mb-1 font-display text-xl">Paid vs unpaid by tower</h3>
              <p className="mb-2 text-xs text-brown-800/50">Stacked counts per tower</p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={towerBar} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8DFD0" />
                  <XAxis dataKey="tower" tick={{ fontSize: 11, fill: "#6B5B4F" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#6B5B4F" }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: "1px solid #E8DFD0", fontSize: 12 }}
                  />
                  <Legend formatter={(v) => <span className="text-xs text-brown-800/70">{v}</span>} />
                  <Bar dataKey="paid" stackId="a" fill={COLORS.emerald} name="Paid" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="unpaid" stackId="a" fill={COLORS.vermilion} name="Unpaid" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardBody></Card>

            <Card><CardBody>
              <h3 className="mb-1 font-display text-xl">Exceptions</h3>
              <p className="mb-2 text-xs text-brown-800/50">Open control flags</p>
              <Donut data={exceptionsPie} innerRadius={50} outerRadius={80} />
            </CardBody></Card>
          </div>

          {dailyArea.length > 0 && (
            <Card><CardBody>
              <h3 className="mb-1 font-display text-xl">Daily collection trend</h3>
              <p className="mb-2 text-xs text-brown-800/50">Amount collected by day (₹)</p>
              <ResponsiveContainer width="100%" height={280}>
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
            </CardBody></Card>
          )}
        </div>
      )}

      {!loading && tab === "financial" && fin && (
        <div className="space-y-5" data-testid="financial-dashboard">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Opening bank" value={formatPaise(fin.opening_bank)} />
            <Stat label="Verified receipts" value={formatPaise(fin.verified_receipts)} accent="text-emerald-700" />
            <Stat label="Total payments" value={formatPaise(fin.total_payments)} accent="text-vermilion-600" />
            <Stat label="Current balance" value={formatPaise(fin.current_balance)} />
            <Stat label="Bank balance" value={formatPaise(fin.bank_balance)} />
            <Stat label="Cash on hand" value={formatPaise(fin.cash_balance)} />
            <Stat label="Gateway clearing" value={formatPaise(fin.gateway_clearing)} sub="captured, not yet settled" />
            <Stat label="Advances outstanding" value={formatPaise(fin.advances_outstanding)} />
            <Stat label="Payables" value={formatPaise(fin.payables)} />
          </div>
          <Card><CardBody>
            <h3 className="mb-1 font-display text-xl">Cash position mix</h3>
            <p className="mb-2 text-xs text-brown-800/50">Bank · cash · gateway clearing</p>
            <div className="mx-auto max-w-md">
              <Donut data={finPie} />
              {!finPie.length && <EmptyChart label="No balances posted yet" />}
            </div>
          </CardBody></Card>
        </div>
      )}

      {!loading && tab === "audit" && aud && (
        <div className="space-y-5" data-testid="audit-dashboard">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Unreconciled items" value={aud.unreconciled_items} accent="text-amber-600" />
            <Stat label="Duplicate invoices" value={aud.duplicate_invoices} />
            <Stat label="Duplicate payments" value={aud.duplicate_payments} />
            <Stat label="Manual overrides" value={aud.manual_overrides} />
            <Stat label="Post-close entries" value={aud.post_close_entries} />
            <Stat label="Bank-detail changes" value={aud.bank_detail_changes} />
            <Stat label="Stale advances" value={aud.stale_advances} />
            <Stat label="Refunds pending" value={aud.refunds_pending} accent="text-amber-600" />
            <Stat label="Journals missing evidence" value={aud.missing_evidence} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardBody>
              <h3 className="mb-1 font-display text-xl">Audit flags</h3>
              <Donut data={auditPie} />
            </CardBody></Card>
            <Card><CardBody>
              <h3 className="mb-3 font-display text-xl">Segregation-of-duty conflicts</h3>
              {(!aud.sod_conflicts || aud.sod_conflicts.length === 0) ? (
                <div className="text-sm text-emerald-700">No toxic role combinations detected.</div>
              ) : (
                <ul className="space-y-2 text-sm">
                  {aud.sod_conflicts.map((s, i) => (
                    <li key={i} className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                      <b>{s.user}</b>
                      <ul className="mt-1 list-disc pl-5 text-amber-800">{s.conflicts.map((c, j) => <li key={j}>{c.description}</li>)}</ul>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody></Card>
          </div>
        </div>
      )}
    </div>
  );
}
