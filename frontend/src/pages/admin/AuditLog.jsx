import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { ShieldCheck, FileDown, RefreshCw } from "lucide-react";
import api from "../../lib/api";
import { Card, CardBody, Table, THead, TR, TH, TD, Button, Input, Spinner, StatusBadge } from "../../components/ui";
import { formatDateIST } from "../../lib/utils";

export default function AuditLog() {
  const [events, setEvents] = useState([]);
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(true);
  const [chain, setChain] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/audit/events?action=${encodeURIComponent(action)}&limit=300`)
      .then((r) => setEvents(r.data.items || [])).catch(() => {}).finally(() => setLoading(false));
  }, [action]);
  useEffect(load, [load]);

  const verify = async () => {
    try { const r = await api.get("/audit/verify-chain"); setChain(r.data); toast[r.data.intact ? "success" : "error"](r.data.intact ? "Audit chain intact" : "Audit chain broken!"); }
    catch { toast.error("Could not verify"); }
  };
  const exportCsv = async () => {
    try {
      const r = await api.get("/audit/export", { responseType: "blob" });
      const url = URL.createObjectURL(r.data); const a = document.createElement("a"); a.href = url; a.download = "audit_log.csv"; a.click(); URL.revokeObjectURL(url);
    } catch { toast.error("Export failed"); }
  };

  return (
    <div data-testid="audit-page">
      <h1 className="mb-1 font-display text-4xl">Audit Trail</h1>
      <p className="mb-4 text-sm text-brown-800/50">Append-only, hash-chained events. Ordinary admins cannot edit or delete records.</p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input placeholder="Filter by action (e.g. receipt, refund)" value={action} onChange={(e) => setAction(e.target.value)} className="max-w-xs" data-testid="audit-filter" />
        <Button variant="subtle" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        <Button variant="admin" size="sm" onClick={verify} data-testid="verify-chain-btn"><ShieldCheck className="h-4 w-4" /> Verify chain</Button>
        <Button variant="subtle" size="sm" onClick={exportCsv} data-testid="audit-export-btn"><FileDown className="h-4 w-4" /> Export CSV</Button>
        {chain && <StatusBadge status={chain.intact ? "verified" : "failed"} className="ml-1" />}
      </div>
      <Card><CardBody>
        {loading ? <Spinner className="text-vermilion-500" /> : (
          <Table><THead><TR><TH>#</TH><TH>Time</TH><TH>Actor</TH><TH>Action</TH><TH>Entity</TH><TH>Reason</TH></TR></THead>
            <tbody>{events.map((e) => (
              <TR key={e.seq}><TD>{e.seq}</TD><TD>{formatDateIST(e.created_at)}</TD>
                <TD className="text-xs">{e.actor_role || e.actor_id}</TD><TD className="font-mono text-xs">{e.action}</TD>
                <TD className="text-xs">{e.entity_type}{e.post_close && <span className="ml-1 text-amber-600">post-close</span>}</TD>
                <TD className="max-w-[200px] truncate text-xs">{e.reason}</TD></TR>
            ))}</tbody></Table>
        )}
      </CardBody></Card>
    </div>
  );
}
