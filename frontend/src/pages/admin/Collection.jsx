import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { FileText, Check, Plus, RefreshCw, Undo2 } from "lucide-react";
import api, { API } from "../../lib/api";
import { Card, CardBody, Table, THead, TR, TH, TD, StatusBadge, Button, Tabs, Dialog, Label, Input, Select, Spinner } from "../../components/ui";
import { formatPaise } from "../../lib/utils";
import ExportCsvButton from "../../components/ExportCsvButton";

export default function Collection() {
  const [tab, setTab] = useState("receipts");
  return (
    <div data-testid="collection-page">
      <h1 className="mb-1 font-display text-4xl">Collection</h1>
      <p className="mb-4 text-sm text-brown-800/50">Households, receipts, cash/manual entry and refunds.</p>
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: "households", label: "Households" },
        { value: "receipts", label: "Receipts" },
        { value: "manual", label: "Cash & manual" },
        { value: "refunds", label: "Refunds" },
      ]} />
      {tab === "households" && <Households />}
      {tab === "receipts" && <Receipts />}
      {tab === "manual" && <Manual />}
      {tab === "refunds" && <Refunds />}
    </div>
  );
}

function useList(endpoint, key = "items") {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    api.get(endpoint).then((r) => setItems(r.data[key] || [])).catch(() => {}).finally(() => setLoading(false));
  }, [endpoint, key]);
  useEffect(load, [load]);
  return { items, loading, load, setItems };
}

function Households() {
  const { items, loading, load } = useList("/admin/households");
  const clearHousehold = async (h) => {
    if (!window.confirm(`Clear subscription for ${h.tower_name} ${h.flat_number}? Existing receipts will be voided and the flat can pay again.`)) return;
    try {
      const r = await api.post(`/admin/households/${h.id}/clear-subscription`, {
        reason: "Cleared to allow a fresh subscription payment.",
      });
      toast.success(`Cleared — ${r.data.receipts_voided || 0} receipt(s) voided`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not clear household.");
    }
  };
  const exportCols = [
    { key: "tower_name", label: "Tower" },
    { key: "flat_number", label: "Flat" },
    { key: "primary_name", label: "Primary contact" },
    { key: "occupancy_type", label: "Occupancy", exportValue: (h) => (h.occupancy_type || "").replace(/_/g, " ") },
    { key: "family_members", label: "Members" },
    { key: "paid", label: "Status", exportValue: (h) => (h.paid ? "paid" : "pending") },
  ];
  return (
    <Card><CardBody>
      <div className="mb-3 flex justify-end gap-2">
        <ExportCsvButton filename="households.csv" columns={exportCols} items={items} data-testid="households-export-csv" />
        <Button variant="subtle" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
      </div>
      {loading ? <Spinner className="text-vermilion-500" /> : (
        <Table><THead><TR><TH>Tower</TH><TH>Flat</TH><TH>Primary Contact</TH><TH>Occupancy</TH><TH right>Members</TH><TH>Status</TH><TH>Actions</TH></TR></THead>
          <tbody>{items.map((h) => (
            <TR key={h.id}><TD>{h.tower_name}</TD><TD>{h.flat_number}</TD><TD>{h.primary_name}</TD>
              <TD className="capitalize">{(h.occupancy_type || "").replace(/_/g, " ")}</TD><TD right>{h.family_members}</TD>
              <TD><StatusBadge status={h.paid ? "paid" : "pending"} /></TD>
              <TD>
                <Button variant="subtle" size="sm" onClick={() => clearHousehold(h)} data-testid={`clear-hh-${h.id}`}>
                  <Undo2 className="h-3.5 w-3.5" /> Clear
                </Button>
              </TD></TR>
          ))}</tbody></Table>
      )}
    </CardBody></Card>
  );
}

function Receipts() {
  const { items, loading, load } = useList("/admin/receipts");
  const exportCols = [
    { key: "receipt_no", label: "Receipt no" },
    { key: "payer_name", label: "Payer" },
    { key: "tower_name", label: "Tower" },
    { key: "flat_number", label: "Flat" },
    { key: "total_amount", label: "Total (₹)", exportValue: (r) => (Number(r.total_amount || 0) / 100).toFixed(2) },
    { key: "method", label: "Method", exportValue: (r) => (r.method || "").replace(/_/g, " ") },
    { key: "status", label: "Status", exportValue: (r) => r.refund_status || r.status },
    { key: "issued_at", label: "Issued at", exportValue: (r) => r.issued_at || r.created_at || "" },
  ];
  return (
    <Card><CardBody>
      <div className="mb-3 flex justify-end gap-2">
        <ExportCsvButton filename="receipts.csv" columns={exportCols} items={items} data-testid="receipts-export-csv" />
        <Button variant="subtle" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
      </div>
      {loading ? <Spinner className="text-vermilion-500" /> : (
        <Table><THead><TR><TH>Receipt No</TH><TH>Payer</TH><TH>Household</TH><TH right>Total</TH><TH>Method</TH><TH>Status</TH><TH>PDF</TH></TR></THead>
          <tbody>{items.map((r) => (
            <TR key={r.id}><TD>{r.receipt_no}</TD><TD>{r.payer_name}</TD><TD>{r.tower_name}, {r.flat_number}</TD>
              <TD right>{formatPaise(r.total_amount)}</TD><TD className="capitalize">{(r.method || "").replace(/_/g, " ")}</TD>
              <TD><StatusBadge status={r.refund_status || r.status} /></TD>
              <TD><a href={`${API}/receipt/pdf/${r.verify_token}`} target="_blank" rel="noreferrer" className="text-vermilion-600"><FileText className="h-4 w-4" /></a></TD></TR>
          ))}</tbody></Table>
      )}
    </CardBody></Card>
  );
}

function Manual() {
  const [towers, setTowers] = useState([]);
  const [flats, setFlats] = useState([]);
  const [mode, setMode] = useState("cash");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ tower_id: "", flat_id: "", name: "", mobile: "", occupancy_type: "owner_resident", family_members: 1, donation_rupees: 0, utr: "", cheque_no: "", bank: "", handover_batch: "" });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const [queues, setQueues] = useState(null);

  const loadQueues = useCallback(() => { api.get("/manual/queues").then((r) => setQueues(r.data)).catch(() => {}); }, []);
  useEffect(() => { api.get("/towers").then((r) => setTowers(r.data.items || [])); loadQueues(); }, [loadQueues]);
  useEffect(() => { if (f.tower_id) api.get(`/towers/${f.tower_id}/flats`).then((r) => setFlats(r.data.items || [])); }, [f.tower_id]);

  const create = async () => {
    setBusy(true);
    try {
      const ep = mode === "cash" ? "/manual/cash" : mode === "bank" ? "/manual/bank-transfer" : "/manual/cheque";
      await api.post(ep, f);
      toast.success(`${mode} collection recorded (pending checker approval)`);
      setOpen(false); loadQueues();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not record."); }
    finally { setBusy(false); }
  };

  const act = async (endpoint, body) => {
    try { await api.post(endpoint, body || { bank_statement_matched: true }); toast.success("Approved — receipt issued"); loadQueues(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Action failed"); }
  };

  return (
    <div className="space-y-5">
      <Card><CardBody>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-xl">Record a manual collection</h3>
            <p className="mt-1 text-sm text-brown-800/50">Cash, bank transfer and cheque require a different person to approve (maker-checker). Receipts are issued only on approval.</p>
          </div>
          <div className="flex gap-2">
            <ExportCsvButton
              filename="manual-queues.csv"
              columns={[
                { key: "queue", label: "Queue" },
                { key: "amount_paise", label: "Amount (₹)", exportValue: (r) => (Number(r.amount_paise || 0) / 100).toFixed(2) },
                { key: "collector_name", label: "Collector / payer", exportValue: (r) => r.collector_name || r.name || "" },
                { key: "utr", label: "UTR" },
                { key: "cheque_no", label: "Cheque no" },
                { key: "tower_name", label: "Tower" },
                { key: "flat_number", label: "Flat" },
                { key: "status", label: "Status" },
                { key: "created_at", label: "Created", exportValue: (r) => r.created_at || "" },
              ]}
              items={[
                ...((queues?.cash_pending || []).map((r) => ({ ...r, queue: "cash_pending" }))),
                ...((queues?.bank_transfer_pending || []).map((r) => ({ ...r, queue: "bank_transfer_pending" }))),
                ...((queues?.cheque_pending || []).map((r) => ({ ...r, queue: "cheque_pending" }))),
              ]}
              data-testid="manual-export-csv"
            />
            <Button variant="admin" size="sm" onClick={() => setOpen(true)} data-testid="manual-new-btn"><Plus className="h-4 w-4" /> New</Button>
          </div>
        </div>
      </CardBody></Card>

      {queues && (
        <div className="grid gap-4 lg:grid-cols-3">
          <QueueCard title="Cash — pending acceptance" testid="queue-cash" rows={queues.cash_pending}
            render={(c) => <QueueRow key={c.id} label={`${formatPaise(c.amount_paise)} · ${c.collector_name}`}
              onAct={() => act(`/manual/cash/${c.id}/accept`)} actLabel="Accept" />} />
          <QueueCard title="Bank transfer — pending match" testid="queue-bank" rows={queues.bank_transfer_pending}
            render={(c) => <QueueRow key={c.id} label={`${formatPaise(c.amount_paise)} · UTR ${c.utr}`}
              onAct={() => act(`/manual/bank-transfer/${c.id}/approve`, { bank_statement_matched: true })} actLabel="Approve" />} />
          <QueueCard title="Cheque — pending clearing" testid="queue-cheque" rows={queues.cheque_pending}
            render={(c) => <QueueRow key={c.id} label={`${formatPaise(c.amount_paise)} · ${c.cheque_no}`}
              onAct={() => act(`/manual/cheque/${c.id}/clear`)} actLabel="Mark cleared" />} />
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="New manual collection"
        footer={<><Button variant="subtle" onClick={() => setOpen(false)}>Cancel</Button><Button variant="admin" onClick={create} disabled={busy} data-testid="manual-create-submit">{busy ? "Saving…" : "Record"}</Button></>}>
        <div className="mb-3 inline-flex rounded-md border border-brown-800/15 p-1">
          {["cash", "bank", "cheque"].map((m) => (
            <button key={m} onClick={() => setMode(m)} data-testid={`manual-mode-${m}`} className={`rounded px-3 py-1.5 text-sm capitalize ${mode === m ? "bg-brown-800 text-ivory-100" : "text-brown-800/60"}`}>{m}</button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Tower</Label><Select data-testid="manual-tower" value={f.tower_id} onChange={(e) => { set("tower_id", e.target.value); set("flat_id", ""); }}><option value="">Select</option>{towers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></div>
          <div><Label>Flat</Label><Select data-testid="manual-flat" value={f.flat_id} onChange={(e) => set("flat_id", e.target.value)}><option value="">Select</option>{flats.map((x) => <option key={x.id} value={x.id}>{x.number}</option>)}</Select></div>
          <div><Label>Name</Label><Input data-testid="manual-name" value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div><Label>Mobile</Label><Input data-testid="manual-mobile" value={f.mobile} onChange={(e) => set("mobile", e.target.value.replace(/\D/g, "").slice(0, 10))} /></div>
          <div><Label>Donation (₹)</Label><Input type="number" value={f.donation_rupees} onChange={(e) => set("donation_rupees", e.target.value)} /></div>
          {mode === "cash" && <div><Label>Handover batch</Label><Input value={f.handover_batch} onChange={(e) => set("handover_batch", e.target.value)} /></div>}
          {mode === "bank" && <div><Label>UTR / Reference</Label><Input data-testid="manual-utr" value={f.utr} onChange={(e) => set("utr", e.target.value)} /></div>}
          {mode === "cheque" && <><div><Label>Cheque no</Label><Input value={f.cheque_no} onChange={(e) => set("cheque_no", e.target.value)} /></div><div><Label>Bank</Label><Input value={f.bank} onChange={(e) => set("bank", e.target.value)} /></div></>}
        </div>
      </Dialog>
    </div>
  );
}

function QueueCard({ title, rows, render, testid }) {
  return (
    <Card data-testid={testid}><CardBody>
      <h4 className="mb-2 font-semibold text-sm uppercase tracking-wide text-brown-800/60">{title}</h4>
      {(!rows || rows.length === 0) ? <div className="text-sm text-brown-800/40">Empty</div> : <div className="space-y-2">{rows.map(render)}</div>}
    </CardBody></Card>
  );
}
function QueueRow({ label, onAct, actLabel }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-brown-800/10 px-3 py-2 text-sm">
      <span>{label}</span>
      <Button variant="admin" size="sm" onClick={onAct}><Check className="h-3.5 w-3.5" /> {actLabel}</Button>
    </div>
  );
}

function Refunds() {
  const { items, loading, load } = useList("/admin/receipts");
  const { items: refunds, load: loadRefunds } = useList("/reports/refund_register", "rows");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const request = async () => {
    try {
      await api.post("/refunds", { receipt_id: sel.id, amount_paise: Math.round(Number(amount) * 100), reason });
      toast.success("Refund requested (awaiting convenor approval)"); setOpen(false); loadRefunds();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not request refund"); }
  };
  return (
    <div className="space-y-5">
      <Card><CardBody>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-xl">Request a refund</h3>
          <div className="flex gap-2">
            <ExportCsvButton
              filename="refund-candidates.csv"
              columns={[
                { key: "receipt_no", label: "Receipt no" },
                { key: "payer_name", label: "Payer" },
                { key: "tower_name", label: "Tower" },
                { key: "flat_number", label: "Flat" },
                { key: "total_amount", label: "Total (₹)", exportValue: (r) => (Number(r.total_amount || 0) / 100).toFixed(2) },
                { key: "status", label: "Status", exportValue: (r) => r.refund_status || r.status },
              ]}
              items={items}
              data-testid="refunds-export-csv"
            />
            <ExportCsvButton
              filename="refund-register.csv"
              columns={[
                { key: "credit_note_no", label: "Credit note", exportValue: (r) => r.credit_note_no || r.id || "" },
                { key: "receipt_no", label: "Receipt no" },
                { key: "amount_paise", label: "Amount (₹)", exportValue: (r) => (Number(r.amount_paise || r.amount || 0) / 100).toFixed(2) },
                { key: "status", label: "Status" },
                { key: "reason", label: "Reason" },
                { key: "created_at", label: "Created", exportValue: (r) => r.created_at || "" },
              ]}
              items={refunds}
              label="Export register"
              data-testid="refund-register-export-csv"
            />
            <Button variant="subtle" size="sm" onClick={() => { load(); loadRefunds(); }}><RefreshCw className="h-4 w-4" /></Button>
          </div>
        </div>
        {loading ? <Spinner className="text-vermilion-500" /> : (
          <Table><THead><TR><TH>Receipt</TH><TH right>Total</TH><TH>Action</TH></TR></THead>
            <tbody>{items.slice(0, 25).map((r) => (
              <TR key={r.id}><TD>{r.receipt_no}</TD><TD right>{formatPaise(r.total_amount)}</TD>
                <TD><Button variant="subtle" size="sm" data-testid={`refund-${r.receipt_no}`} onClick={() => { setSel(r); setAmount((r.total_amount / 100).toString()); setOpen(true); }}><Undo2 className="h-3.5 w-3.5" /> Refund</Button></TD></TR>
            ))}</tbody></Table>
        )}
      </CardBody></Card>

      <Dialog open={open} onClose={() => setOpen(false)} title={`Refund ${sel?.receipt_no || ""}`}
        footer={<><Button variant="subtle" onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger" onClick={request} data-testid="refund-request-submit">Request refund</Button></>}>
        <Label>Amount (₹)</Label><Input type="number" data-testid="refund-amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <div className="mt-3"><Label>Reason</Label><Input data-testid="refund-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <p className="mt-2 text-xs text-brown-800/50">A linked credit note and reversal ledger entries are generated on approval. Refund is tracked until the provider confirms completion.</p>
      </Dialog>
    </div>
  );
}
