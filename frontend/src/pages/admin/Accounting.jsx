import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Undo2, RefreshCw } from "lucide-react";
import api from "../../lib/api";
import { Card, CardBody, Table, THead, TR, TH, TD, StatusBadge, Button, Tabs, Spinner } from "../../components/ui";
import { formatPaise, formatDateIST } from "../../lib/utils";

export default function Accounting() {
  const [tab, setTab] = useState("trial");
  const [tb, setTb] = useState(null);
  const [journals, setJournals] = useState([]);
  const [chart, setChart] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.allSettled([
      api.get("/accounting/trial-balance").then((r) => setTb(r.data)),
      api.get("/accounting/journals").then((r) => setJournals(r.data.items || [])),
      api.get("/accounting/chart").then((r) => setChart(r.data.items || [])),
    ]).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const reverse = async (jid) => {
    const reason = window.prompt("Reason for reversal?");
    if (!reason) return;
    try { await api.post(`/accounting/journals/${jid}/reverse`, { reason }); toast.success("Reversal posted"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Could not reverse"); }
  };

  return (
    <div data-testid="accounting-page">
      <h1 className="mb-1 font-display text-4xl">Accounting Ledger</h1>
      <p className="mb-4 text-sm text-brown-800/50">Double-entry. Posted journals are immutable — corrections use reversals only.</p>
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: "trial", label: "Trial Balance" },
        { value: "journals", label: "Journals" },
        { value: "chart", label: "Chart of Accounts" },
      ]} />
      {loading && <Spinner className="text-vermilion-500" />}

      {!loading && tab === "trial" && tb && (
        <Card><CardBody>
          <div className="mb-3 flex justify-end"><Button variant="subtle" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /></Button></div>
          <Table><THead><TR><TH>Code</TH><TH>Account</TH><TH>Type</TH><TH right>Debit</TH><TH right>Credit</TH><TH right>Balance</TH></TR></THead>
            <tbody>{tb.items.map((r) => (
              <TR key={r.code}><TD>{r.code}</TD><TD>{r.name}</TD><TD className="capitalize">{r.type}</TD>
                <TD right>{formatPaise(r.debit)}</TD><TD right>{formatPaise(r.credit)}</TD><TD right>{formatPaise(r.balance)}</TD></TR>
            ))}</tbody></Table>
          <div className="mt-3 flex justify-end gap-8 border-t border-brown-800/10 pt-3 text-sm font-semibold">
            <span>Total Debit: <span className="tabular-nums">{formatPaise(tb.total_debit)}</span></span>
            <span>Total Credit: <span className="tabular-nums">{formatPaise(tb.total_credit)}</span></span>
            <StatusBadge status={tb.total_debit === tb.total_credit ? "verified" : "failed"} />
          </div>
        </CardBody></Card>
      )}

      {!loading && tab === "journals" && (
        <Card><CardBody>
          <Table><THead><TR><TH>Journal</TH><TH>Date</TH><TH>Source</TH><TH>Narration</TH><TH right>Debit</TH><TH right>Credit</TH><TH></TH></TR></THead>
            <tbody>{journals.map((j) => (
              <TR key={j.id}><TD>{j.journal_no}</TD><TD>{formatDateIST(j.posted_at)}</TD><TD>{j.source_type}</TD>
                <TD className="max-w-[240px] truncate">{j.narration}{j.reversal_of && <span className="ml-1 text-xs text-amber-600">(reversal)</span>}{j.reversed_by && <span className="ml-1 text-xs text-brown-800/40">(reversed)</span>}</TD>
                <TD right>{formatPaise(j.total_debit)}</TD><TD right>{formatPaise(j.total_credit)}</TD>
                <TD>{!j.reversed_by && !j.reversal_of && <Button variant="subtle" size="sm" onClick={() => reverse(j.id)} data-testid={`reverse-${j.journal_no}`}><Undo2 className="h-3.5 w-3.5" /></Button>}</TD></TR>
            ))}</tbody></Table>
        </CardBody></Card>
      )}

      {!loading && tab === "chart" && (
        <Card><CardBody>
          <Table><THead><TR><TH>Code</TH><TH>Account</TH><TH>Type</TH></TR></THead>
            <tbody>{chart.map((a) => <TR key={a.code}><TD>{a.code}</TD><TD>{a.name}</TD><TD className="capitalize">{a.type}</TD></TR>)}</tbody></Table>
        </CardBody></Card>
      )}
    </div>
  );
}
