import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Upload, Link2, RefreshCw } from "lucide-react";
import api from "../../lib/api";
import { Card, CardBody, Table, THead, TR, TH, TD, StatusBadge, Button, Tabs, Stat, Label, Input, Spinner } from "../../components/ui";
import { formatPaise } from "../../lib/utils";

export default function Reconciliation() {
  const [tab, setTab] = useState("overview");
  const [balances, setBalances] = useState([]);
  const [dash, setDash] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [lines, setLines] = useState([]);
  const [file, setFile] = useState(null);
  const [map, setMap] = useState({ amount_col: "amount", date_col: "date", ref_col: "ref", type_col: "type" });

  const load = useCallback(() => {
    api.get("/recon/balances").then((r) => setBalances(r.data.items || []));
    api.get("/recon/dashboard").then((r) => setDash(r.data));
    api.get("/recon/suggestions").then((r) => setSuggestions(r.data.items || []));
    api.get("/recon/lines").then((r) => setLines(r.data.items || []));
  }, []);
  useEffect(load, [load]);

  const doImport = async () => {
    if (!file) return toast.error("Choose a CSV/XLSX file");
    const fd = new FormData();
    fd.append("file", file);
    Object.entries(map).forEach(([k, v]) => fd.append(k, v));
    fd.append("bank_account_id", "bank_main");
    try {
      const r = await api.post("/recon/import", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`Imported ${r.data.lines} lines`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Import failed"); }
  };

  const match = async (s) => {
    try {
      await api.post("/recon/match", { line_id: s.line_id, receipt_id: s.receipt_id, confidence: s.confidence, human_approved: true });
      toast.success("Matched"); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Match failed"); }
  };

  return (
    <div data-testid="reconciliation-page">
      <h1 className="mb-1 font-display text-4xl">Bank & Gateway Reconciliation</h1>
      <p className="mb-4 text-sm text-brown-800/50">Opening + receipts − payments = closing. Nothing is guessed — suggested matches need human approval.</p>
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: "overview", label: "Overview" },
        { value: "import", label: "Import Statement" },
        { value: "match", label: "Suggestions" },
        { value: "lines", label: "Statement Lines" },
      ]} />

      {tab === "overview" && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            {balances.map((b) => <Stat key={b.code} label={b.account} value={b.closing_display} sub={`movement ${formatPaise(b.movement)}`} />)}
          </div>
          {dash && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Duplicate payments", dash.duplicate_payments],
                ["Amount mismatch", dash.amount_mismatch],
                ["Stale pending orders", dash.stale_pending_orders],
                ["Refunds processing", dash.refunds_processing],
                ["Cash not deposited", dash.cash_not_deposited],
                ["Cheques pending", dash.cheques_pending],
                ["Unidentified bank credits", dash.bank_credits_unidentified],
              ].map(([l, v]) => <Stat key={l} label={l} value={Array.isArray(v) ? v.length : v} accent={(Array.isArray(v) ? v.length : v) > 0 ? "text-amber-600" : "text-emerald-700"} />)}
            </div>
          )}
        </div>
      )}

      {tab === "import" && (
        <Card><CardBody>
          <h3 className="mb-3 font-display text-xl">Import bank statement (CSV / XLSX)</h3>
          <p className="mb-3 text-sm text-brown-800/50">Map your columns by name (from the header row) or 0-based index. Original file & hash are preserved.</p>
          <input type="file" accept=".csv,.xlsx,.xls" data-testid="recon-file" onChange={(e) => setFile(e.target.files[0])} className="mb-4 block text-sm" />
          <div className="grid gap-3 sm:grid-cols-4">
            {["amount_col", "date_col", "ref_col", "type_col"].map((k) => (
              <div key={k}><Label>{k.replace("_col", "")}</Label><Input data-testid={`recon-${k}`} value={map[k]} onChange={(e) => setMap({ ...map, [k]: e.target.value })} /></div>
            ))}
          </div>
          <Button variant="admin" className="mt-4" onClick={doImport} data-testid="recon-import-btn"><Upload className="h-4 w-4" /> Import</Button>
        </CardBody></Card>
      )}

      {tab === "match" && (
        <Card><CardBody>
          <div className="mb-3 flex justify-end"><Button variant="subtle" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /></Button></div>
          {suggestions.length === 0 ? <div className="py-8 text-center text-sm text-brown-800/50">No suggestions.</div> : (
            <Table><THead><TR><TH>Receipt</TH><TH right>Amount</TH><TH>Bank Ref</TH><TH>Confidence</TH><TH>State</TH><TH>Action</TH></TR></THead>
              <tbody>{suggestions.map((s, i) => (
                <TR key={i}><TD>{s.receipt_no}</TD><TD right>{formatPaise(s.amount)}</TD><TD>{s.bank_ref}</TD>
                  <TD>{Math.round(s.confidence * 100)}%</TD><TD><StatusBadge status={s.state} /></TD>
                  <TD><Button variant="admin" size="sm" onClick={() => match(s)} data-testid={`match-${i}`}><Link2 className="h-3.5 w-3.5" /> Match</Button></TD></TR>
              ))}</tbody></Table>
          )}
        </CardBody></Card>
      )}

      {tab === "lines" && (
        <Card><CardBody>
          {lines.length === 0 ? <div className="py-8 text-center text-sm text-brown-800/50">No statement lines imported.</div> : (
            <Table><THead><TR><TH>Date</TH><TH right>Amount</TH><TH>Ref</TH><TH>Type</TH><TH>Matched</TH></TR></THead>
              <tbody>{lines.map((l) => (
                <TR key={l.id}><TD>{l.date}</TD><TD right>{formatPaise(l.amount_paise)}</TD><TD>{l.ref}</TD><TD>{l.type}</TD>
                  <TD><StatusBadge status={l.matched ? "approved" : "pending"} /></TD></TR>
              ))}</tbody></Table>
          )}
        </CardBody></Card>
      )}
    </div>
  );
}
