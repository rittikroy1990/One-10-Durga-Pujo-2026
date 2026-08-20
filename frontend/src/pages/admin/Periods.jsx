import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Lock, Unlock, Megaphone } from "lucide-react";
import api from "../../lib/api";
import { Card, CardBody, Table, THead, TR, TH, TD, Button, StatusBadge, Label, Input, Select, Spinner } from "../../components/ui";
import { formatDateIST } from "../../lib/utils";

export default function Periods() {
  const [checklist, setChecklist] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [label, setLabel] = useState("Month 1");
  const [scope, setScope] = useState("monthly");
  const [pub, setPub] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.allSettled([
      api.get("/periods/checklist").then((r) => setChecklist(r.data.checklist || [])),
      api.get("/periods").then((r) => setPeriods(r.data.items || [])),
    ]).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const prepare = async () => {
    try { await api.post("/periods/close", { label, scope }); toast.success("Close prepared"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Could not prepare"); }
  };
  const approve = async (id) => {
    try { await api.post(`/periods/${id}/approve`, { carry_forward_reason: "Reviewed and carried forward" }, { headers: { "X-Reauth": "true" } }); toast.success("Period locked"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Could not lock"); }
  };
  const reopen = async (id) => {
    const reason = window.prompt("Reason to reopen?");
    if (!reason) return;
    try { await api.post(`/periods/${id}/reopen`, { reason, approvals: ["convenor", "treasurer"] }); toast.success("Reopened"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Could not reopen"); }
  };
  const genReport = async () => {
    try { const r = await api.post("/public-report/generate", {}); setPub(r.data); toast.success("Report generated (unpublished)"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Could not generate"); }
  };
  const publish = async () => {
    try { await api.post(`/public-report/${pub.id}/publish`, {}); toast.success("Published to public transparency page"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Could not publish"); }
  };

  return (
    <div data-testid="periods-page">
      <h1 className="mb-1 font-display text-4xl">Period Close & Transparency</h1>
      <p className="mb-4 text-sm text-brown-800/50">Close blocks until unresolved items are explained. Reopen needs a reason and two approvals.</p>
      {loading && <Spinner className="text-vermilion-500" />}

      {!loading && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card><CardBody>
            <h3 className="mb-3 font-display text-xl">Close checklist</h3>
            <ul className="space-y-2 text-sm">
              {checklist.map((c, i) => (
                <li key={i} className="flex items-center justify-between rounded-lg border border-brown-800/10 px-3 py-2">
                  <span>{c.item}</span>
                  <span className="flex items-center gap-2 text-xs">{String(c.value)} {c.pass ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-vermilion-500" />}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div><Label>Label</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} data-testid="period-label" /></div>
              <div><Label>Scope</Label><Select value={scope} onChange={(e) => setScope(e.target.value)} data-testid="period-scope"><option value="monthly">Monthly</option><option value="phase">Phase</option><option value="final">Final cycle</option></Select></div>
            </div>
            <Button variant="admin" className="mt-3 w-full" onClick={prepare} data-testid="period-prepare-btn"><Lock className="h-4 w-4" /> Prepare close</Button>
          </CardBody></Card>

          <Card><CardBody>
            <h3 className="mb-3 font-display text-xl flex items-center gap-2"><Megaphone className="h-5 w-5 text-vermilion-500" /> Public transparency report</h3>
            <p className="mb-3 text-sm text-brown-800/50">Aggregate, privacy-safe. No resident names or flat-level payment status.</p>
            <div className="flex gap-2">
              <Button variant="subtle" onClick={genReport} data-testid="pub-generate-btn">Generate</Button>
              <Button variant="admin" onClick={publish} disabled={!pub} data-testid="pub-publish-btn">Publish</Button>
            </div>
            {pub && <div className="mt-3 rounded-lg border border-brown-800/10 p-3 text-xs text-brown-800/60">Generated report {pub.id} — review then publish.</div>}
          </CardBody></Card>
        </div>
      )}

      {!loading && (
        <Card className="mt-5"><CardBody>
          <h3 className="mb-3 font-display text-xl">Period closes</h3>
          <Table><THead><TR><TH>Label</TH><TH>Scope</TH><TH>Prepared</TH><TH>Status</TH><TH>Unresolved</TH><TH>Actions</TH></TR></THead>
            <tbody>{periods.map((p) => (
              <TR key={p.id}><TD>{p.label}</TD><TD>{p.scope}</TD><TD>{formatDateIST(p.created_at)}</TD>
                <TD><StatusBadge status={p.status} /></TD><TD>{(p.unresolved || []).length}</TD>
                <TD className="flex gap-2">
                  {p.status === "prepared" && <Button variant="admin" size="sm" onClick={() => approve(p.id)} data-testid={`period-approve-${p.id}`}><Lock className="h-3.5 w-3.5" /> Lock</Button>}
                  {p.status === "locked" && <Button variant="subtle" size="sm" onClick={() => reopen(p.id)}><Unlock className="h-3.5 w-3.5" /> Reopen</Button>}
                </TD></TR>
            ))}</tbody></Table>
        </CardBody></Card>
      )}
    </div>
  );
}
