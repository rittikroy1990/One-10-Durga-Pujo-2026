import React, { useEffect, useState } from "react";
import { TrendingUp, Wallet, ShieldAlert, RefreshCw } from "lucide-react";
import api from "../../lib/api";
import { Card, CardBody, Stat, Tabs, StatusBadge, Spinner, Button } from "../../components/ui";
import { formatPaise } from "../../lib/utils";

function Bar({ value, max, label, right }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className="mb-2">
      <div className="mb-0.5 flex justify-between text-xs text-brown-800/60"><span>{label}</span><span className="tabular-nums">{right}</span></div>
      <div className="h-2 rounded-full bg-ivory-300"><div className="h-2 rounded-full bg-vermilion-500" style={{ width: `${pct}%` }} /></div>
    </div>
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

  const maxTower = Math.max(1, ...(col?.by_tower || []).map((t) => t.registered || 0));
  const maxDaily = Math.max(1, ...(col?.daily || []).map((d) => d.amount || 0));

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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Eligible households" value={col.eligible} sub="configurable" />
            <Stat label="Registered" value={col.registered} />
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
              <h3 className="mb-3 font-display text-xl flex items-center gap-2"><TrendingUp className="h-5 w-5 text-vermilion-500" /> Registration by tower</h3>
              {(col.by_tower || []).map((t) => <Bar key={t.tower} label={t.tower} value={t.registered} max={maxTower} right={`${t.paid}/${t.registered} paid`} />)}
            </CardBody></Card>
            <Card><CardBody>
              <h3 className="mb-3 font-display text-xl">Payment methods & exceptions</h3>
              <div className="space-y-1.5 text-sm">
                {Object.entries(col.method_totals || {}).map(([m, v]) => (
                  <div key={m} className="flex justify-between border-b border-brown-800/5 py-1"><span className="capitalize">{m.replace(/_/g, " ")}</span><span className="font-semibold tabular-nums">{formatPaise(v)}</span></div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-3 text-sm">
                <span>Duplicate: <b>{col.exceptions?.duplicate_payments}</b></span>
                <span>Refunds open: <b>{col.exceptions?.refunds_open}</b></span>
                <span>Reconciliation required: <b>{col.exceptions?.reconciliation_required}</b></span>
              </div>
            </CardBody></Card>
          </div>
          {(col.daily || []).length > 0 && (
            <Card><CardBody>
              <h3 className="mb-3 font-display text-xl">Daily collection trend</h3>
              {col.daily.map((d) => <Bar key={d.date} label={d.date} value={d.amount} max={maxDaily} right={formatPaise(d.amount)} />)}
            </CardBody></Card>
          )}
        </div>
      )}

      {!loading && tab === "financial" && fin && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="financial-dashboard">
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
          <Card><CardBody>
            <h3 className="mb-3 font-display text-xl flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-vermilion-500" /> Segregation-of-duty conflicts</h3>
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
      )}
    </div>
  );
}
