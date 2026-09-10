import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { ShieldCheck, FileDown, RefreshCw, Search } from "lucide-react";
import api from "../../lib/api";
import { Card, CardBody, Table, THead, TR, TH, TD, Button, Input, Spinner, StatusBadge } from "../../components/ui";
import { formatDateIST } from "../../lib/utils";

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AuditLog() {
  const [events, setEvents] = useState([]);
  const [action, setAction] = useState("");
  const [entityId, setEntityId] = useState("");
  const [txnKey, setTxnKey] = useState("");
  const [trail, setTrail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [trailBusy, setTrailBusy] = useState(false);
  const [chain, setChain] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (action) qs.set("action", action);
    if (entityId) qs.set("entity_id", entityId);
    qs.set("limit", "300");
    api.get(`/audit/events?${qs.toString()}`)
      .then((r) => setEvents(r.data.items || [])).catch(() => {}).finally(() => setLoading(false));
  }, [action, entityId]);
  useEffect(load, [load]);

  const verify = async () => {
    try {
      const r = await api.get("/audit/verify-chain");
      setChain(r.data);
      toast[r.data.intact ? "success" : "error"](r.data.intact ? "Audit chain intact" : "Audit chain broken!");
    } catch { toast.error("Could not verify"); }
  };

  const exportCsv = async () => {
    try {
      const r = await api.get("/audit/export", { responseType: "blob" });
      downloadBlob(r.data, "audit_log.csv");
    } catch { toast.error("Export failed"); }
  };

  const loadTrail = async () => {
    const key = txnKey.trim();
    if (!key) return toast.error("Enter a receipt no. / intent / order / payment id");
    setTrailBusy(true);
    try {
      const r = await api.get(`/audit/transaction/${encodeURIComponent(key)}`);
      setTrail(r.data);
      if (!(r.data.events || []).length) toast.message("Transaction found, but no audit events matched yet.");
    } catch (e) {
      setTrail(null);
      toast.error(e?.response?.data?.detail || "Transaction trail not found");
    } finally {
      setTrailBusy(false);
    }
  };

  const exportTrail = async (key) => {
    const k = (key || txnKey).trim();
    if (!k) return toast.error("Enter a transaction reference first");
    try {
      const r = await api.get(`/audit/transaction/${encodeURIComponent(k)}/export`, { responseType: "blob" });
      const safe = k.replace(/[^\w.-]+/g, "_").slice(0, 48);
      downloadBlob(r.data, `transaction_audit_${safe}.csv`);
      toast.success("Transaction audit CSV downloaded");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not download transaction audit");
    }
  };

  const ctx = trail?.context || {};

  return (
    <div data-testid="audit-page">
      <h1 className="mb-1 font-display text-4xl">Audit Trail</h1>
      <p className="mb-4 text-sm text-brown-800/50">
        Append-only, hash-chained events. Look up one payment and download its timestamped trail.
      </p>

      <Card className="mb-4">
        <CardBody>
          <div className="font-display text-xl text-brown-900">Transaction audit</div>
          <p className="mt-1 text-sm text-brown-800/55">
            Search by receipt number (e.g. ONE10-DP26-000003), intent id, payment order id, or provider order id.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input
              placeholder="Receipt no. / intent / order id"
              value={txnKey}
              onChange={(e) => setTxnKey(e.target.value)}
              className="max-w-md"
              data-testid="txn-audit-key"
              onKeyDown={(e) => { if (e.key === "Enter") loadTrail(); }}
            />
            <Button variant="admin" size="sm" onClick={loadTrail} disabled={trailBusy} data-testid="txn-audit-search">
              {trailBusy ? <Spinner className="h-4 w-4 text-white" /> : <Search className="h-4 w-4" />}
              View trail
            </Button>
            <Button variant="subtle" size="sm" onClick={() => exportTrail()} data-testid="txn-audit-export">
              <FileDown className="h-4 w-4" /> Download CSV
            </Button>
          </div>

          {trail && (
            <div className="mt-4 space-y-3" data-testid="txn-audit-result">
              <div className="grid gap-2 rounded-xl border border-sun-400/25 bg-sun-50/60 p-3 text-xs text-brown-800/80 sm:grid-cols-2">
                <div><span className="text-brown-800/45">Receipt</span> · {ctx.receipt_no || "—"}</div>
                <div><span className="text-brown-800/45">Issued</span> · {ctx.issued_at ? formatDateIST(ctx.issued_at) : "—"}</div>
                <div><span className="text-brown-800/45">Intent</span> · <span className="font-mono">{ctx.intent_id || "—"}</span></div>
                <div><span className="text-brown-800/45">Method / provider</span> · {(ctx.method || ctx.provider || "—")}</div>
                <div><span className="text-brown-800/45">Order</span> · <span className="font-mono">{ctx.provider_order_id || ctx.payment_order_id || "—"}</span></div>
                <div><span className="text-brown-800/45">Events</span> · {trail.count}</div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <TR>
                      <TH>#</TH><TH>Time</TH><TH>Actor</TH><TH>Action</TH><TH>Entity</TH><TH>Entity ID</TH><TH>Reason</TH>
                    </TR>
                  </THead>
                  <tbody>
                    {(trail.events || []).map((e) => (
                      <TR key={`${e.seq}-${e.action}`}>
                        <TD>{e.seq}</TD>
                        <TD className="whitespace-nowrap text-xs">{formatDateIST(e.created_at)}</TD>
                        <TD className="text-xs">{e.actor_role || e.actor_id}</TD>
                        <TD className="font-mono text-xs">{e.action}</TD>
                        <TD className="text-xs">{e.entity_type}</TD>
                        <TD className="max-w-[140px] truncate font-mono text-[11px]">{e.entity_id}</TD>
                        <TD className="max-w-[180px] truncate text-xs">{e.reason}</TD>
                      </TR>
                    ))}
                    {!(trail.events || []).length && (
                      <TR><TD colSpan={7} className="text-sm text-brown-800/50">No matching audit events.</TD></TR>
                    )}
                  </tbody>
                </Table>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input placeholder="Filter by action (e.g. receipt, refund)" value={action} onChange={(e) => setAction(e.target.value)} className="max-w-xs" data-testid="audit-filter" />
        <Input placeholder="Entity id" value={entityId} onChange={(e) => setEntityId(e.target.value)} className="max-w-xs" data-testid="audit-entity-filter" />
        <Button variant="subtle" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        <Button variant="admin" size="sm" onClick={verify} data-testid="verify-chain-btn"><ShieldCheck className="h-4 w-4" /> Verify chain</Button>
        <Button variant="subtle" size="sm" onClick={exportCsv} data-testid="audit-export-btn"><FileDown className="h-4 w-4" /> Export all CSV</Button>
        {chain && <StatusBadge status={chain.intact ? "verified" : "failed"} className="ml-1" />}
      </div>
      <Card><CardBody>
        {loading ? <Spinner className="text-vermilion-500" /> : (
          <Table><THead><TR><TH>#</TH><TH>Time</TH><TH>Actor</TH><TH>Action</TH><TH>Entity</TH><TH>Entity ID</TH><TH>Reason</TH></TR></THead>
            <tbody>{events.map((e) => (
              <TR key={e.seq}><TD>{e.seq}</TD><TD>{formatDateIST(e.created_at)}</TD>
                <TD className="text-xs">{e.actor_role || e.actor_id}</TD><TD className="font-mono text-xs">{e.action}</TD>
                <TD className="text-xs">{e.entity_type}{e.post_close && <span className="ml-1 text-amber-600">post-close</span>}</TD>
                <TD className="max-w-[140px] truncate font-mono text-[11px]">{e.entity_id}</TD>
                <TD className="max-w-[200px] truncate text-xs">{e.reason}</TD></TR>
            ))}</tbody></Table>
        )}
      </CardBody></Card>
    </div>
  );
}
