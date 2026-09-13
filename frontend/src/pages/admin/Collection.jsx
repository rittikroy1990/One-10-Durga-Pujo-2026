import React, { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { useAuth } from "../../context/AuthContext";
import { FileText, Check, Plus, RefreshCw, Undo2, FileDown, Download, Upload } from "lucide-react";
import api, { API } from "../../lib/api";
import { Card, CardBody, Table, THead, TR, TH, TD, StatusBadge, Button, Tabs, Dialog, Label, Input, Select, Spinner } from "../../components/ui";
import { formatPaise, formatDateIST } from "../../lib/utils";
import ExportCsvButton from "../../components/ExportCsvButton";

function formatMethod(method) {
  const m = (method || "").toLowerCase();
  if (m === "upi_qr" || m === "upi") return "UPI";
  if (m === "bank_transfer") return "Bank transfer";
  if (!m) return "—";
  return m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Collection() {
  const [tab, setTab] = useState("households");
  return (
    <div data-testid="collection-page">
      <h1 className="mb-1 font-display text-4xl">Collection Control</h1>
      <p className="mb-4 text-sm text-brown-800/50">Households, verified receipts, and manual maker-checker modes.</p>
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: "households", label: "Households" },
        { value: "receipts", label: "Receipts" },
        { value: "manual", label: "Cash & Manual" },
        { value: "excel", label: "Excel import" },
      ]} />
      {tab === "households" && <Households />}
      {tab === "receipts" && <Receipts />}
      {tab === "manual" && <Manual />}
      {tab === "excel" && <ExcelImport />}
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
  return (
    <Card><CardBody>
      <div className="mb-3 flex justify-end"><Button variant="subtle" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /></Button></div>
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

  const downloadTrail = async (receiptNo) => {
    try {
      const r = await api.get(`/audit/transaction/${encodeURIComponent(receiptNo)}/export`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transaction_audit_${String(receiptNo).replace(/[^\w.-]+/g, "_")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Transaction audit downloaded");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not download audit trail");
    }
  };

  const exportCols = [
    { key: "receipt_no", label: "Receipt No" },
    { key: "issued_at", label: "Timestamp (IST)", exportValue: (r) => formatDateIST(r.issued_at) },
    { key: "payer_name", label: "Payer" },
    { key: "tower_name", label: "Tower" },
    { key: "flat_number", label: "Flat" },
    { key: "total_amount", label: "Total (₹)", exportValue: (r) => (Number(r.total_amount || 0) / 100).toFixed(2) },
    { key: "method", label: "Method" },
    { key: "status", label: "Status", exportValue: (r) => r.refund_status || r.status || "" },
  ];

  return (
    <Card><CardBody>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        <ExportCsvButton
          filename="receipts.csv"
          columns={exportCols}
          items={items}
          data-testid="receipts-export-csv"
        />
        <Button variant="subtle" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
      </div>
      {loading ? <Spinner className="text-vermilion-500" /> : (
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>Receipt No</TH>
                <TH>Timestamp</TH>
                <TH>Payer</TH>
                <TH>Household</TH>
                <TH right>Total</TH>
                <TH>Method</TH>
                <TH>Status</TH>
                <TH>PDF</TH>
                <TH>Audit</TH>
              </TR>
            </THead>
            <tbody>
              {items.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium">{r.receipt_no}</TD>
                  <TD className="whitespace-nowrap text-xs tabular-nums" data-testid={`receipt-ts-${r.receipt_no}`}>
                    {formatDateIST(r.issued_at)}
                  </TD>
                  <TD>{r.payer_name}</TD>
                  <TD>{r.tower_name}, {r.flat_number}</TD>
                  <TD right>{formatPaise(r.total_amount)}</TD>
                  <TD>{formatMethod(r.method)}</TD>
                  <TD><StatusBadge status={r.refund_status || r.status} /></TD>
                  <TD>
                    <a href={`${API}/receipt/pdf/${r.verify_token}`} target="_blank" rel="noreferrer" className="text-vermilion-600">
                      <FileText className="h-4 w-4" />
                    </a>
                  </TD>
                  <TD>
                    <Button
                      variant="subtle"
                      size="sm"
                      data-testid={`receipt-audit-${r.receipt_no}`}
                      onClick={() => downloadTrail(r.receipt_no)}
                      title="Download timestamped audit trail"
                    >
                      <FileDown className="h-4 w-4" />
                    </Button>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </CardBody></Card>
  );
}

function Manual() {
  const { user } = useAuth();
  const [towers, setTowers] = useState([]);
  const [flats, setFlats] = useState([]);
  const [mode, setMode] = useState("cash");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    kind: "donation",
    tower_id: "",
    flat_id: "",
    name: "",
    mobile: "",
    occupancy_type: "owner_resident",
    family_members: 1,
    donation_rupees: "",
    utr: "",
    cheque_no: "",
    bank: "",
  });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const [queues, setQueues] = useState(null);

  const loadQueues = useCallback(() => { api.get("/manual/queues").then((r) => setQueues(r.data)).catch(() => {}); }, []);
  useEffect(() => { api.get("/towers").then((r) => setTowers(r.data.items || [])); loadQueues(); }, [loadQueues]);
  useEffect(() => { if (f.tower_id) api.get(`/towers/${f.tower_id}/flats`).then((r) => setFlats(r.data.items || [])); }, [f.tower_id]);

  const create = async () => {
    if (!/^[6-9]\d{9}$/.test(f.mobile || "")) {
      toast.error("Enter a valid 10-digit mobile number");
      return;
    }
    if (f.kind === "donation" && !(Number(f.donation_rupees) > 0)) {
      toast.error("Enter the donation amount");
      return;
    }
    setBusy(true);
    try {
      const ep = mode === "cash" ? "/manual/cash" : mode === "bank" ? "/manual/bank-transfer" : "/manual/cheque";
      await api.post(ep, { ...f, donation_rupees: Number(f.donation_rupees || 0) });
      toast.success("Recorded — another user must Accept before a receipt is issued");
      setOpen(false); loadQueues();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not record."); }
    finally { setBusy(false); }
  };

  const act = async (endpoint, body) => {
    try { await api.post(endpoint, body || { bank_statement_matched: true }); toast.success("Done"); loadQueues(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Action failed"); }
  };

  const queueLabel = (c) => {
    const who = c.payer_name || "";
    const flat = [c.tower_name, c.flat_number].filter(Boolean).join(" ");
    const kind = c.kind === "donation" ? "Donation" : "Subscription";
    const by = c.collector_name ? ` · recorded by ${c.collector_name}` : "";
    return `${formatPaise(c.amount_paise)} · ${kind}${who ? ` · ${who}` : ""}${flat ? ` · ${flat}` : ""}${by}`;
  };

  return (
    <div className="space-y-5">
      <Card><CardBody>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl">Record a manual collection</h3>
          <Button variant="admin" size="sm" onClick={() => setOpen(true)} data-testid="manual-new-btn"><Plus className="h-4 w-4" /> New</Button>
        </div>
        <p className="mt-1 text-sm text-brown-800/50">
          Maker-checker: the person who records (shown as their name) cannot Accept their own entry.
          Another committee member must Accept before the receipt is issued.
        </p>
      </CardBody></Card>

      {queues && (
        <div className="grid gap-4 lg:grid-cols-3">
          <QueueCard title="Cash — pending acceptance" testid="queue-cash" rows={queues.cash_pending || []}
            render={(c) => {
              const isMine = user?.user_id && c.collector_id === user.user_id;
              return (
                <QueueRow
                  key={c.id}
                  label={queueLabel(c) + (isMine ? " · waiting for another admin" : "")}
                  onAct={isMine ? null : () => act(`/manual/cash/${c.id}/accept`)}
                  actLabel="Accept"
                  onCancel={() => act(`/manual/cash/${c.id}/cancel`)}
                />
              );
            }} />
          <QueueCard title="Bank transfer — pending match" testid="queue-bank" rows={queues.bank_transfer_pending || queues.bank_pending || []}
            render={(c) => {
              const isMine = user?.user_id && c.maker_id === user.user_id;
              return (
                <QueueRow key={c.id} label={`${formatPaise(c.amount_paise)} · UTR ${c.utr}` + (isMine ? " · waiting for another admin" : "")}
                  onAct={isMine ? null : () => act(`/manual/bank-transfer/${c.id}/approve`, { bank_statement_matched: true })}
                  actLabel="Approve" />
              );
            }} />
          <QueueCard title="Cheque — pending clearing" testid="queue-cheque" rows={queues.cheque_pending || []}
            render={(c) => {
              const isMine = user?.user_id && c.maker_id === user.user_id;
              return (
                <QueueRow key={c.id} label={`${formatPaise(c.amount_paise)} · ${c.cheque_no}` + (isMine ? " · waiting for another admin" : "")}
                  onAct={isMine ? null : () => act(`/manual/cheque/${c.id}/clear`)}
                  actLabel="Mark cleared" />
              );
            }} />
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="New manual collection"
        footer={<><Button variant="subtle" onClick={() => setOpen(false)}>Cancel</Button><Button variant="admin" onClick={create} disabled={busy} data-testid="manual-create-submit">{busy ? "Saving…" : "Record"}</Button></>}>
        <div className="mb-3 inline-flex rounded-md border border-brown-800/15 p-1">
          {["cash", "bank", "cheque"].map((m) => (
            <button key={m} onClick={() => setMode(m)} data-testid={`manual-mode-${m}`} className={`rounded px-3 py-1.5 text-sm capitalize ${mode === m ? "bg-brown-800 text-ivory-100" : "text-brown-800/60"}`}>{m}</button>
          ))}
        </div>
        <div className="mb-3 inline-flex rounded-md border border-brown-800/15 p-1">
          {[
            { value: "donation", label: "Donation only" },
            { value: "subscription", label: "Subscription (+ optional donation)" },
          ].map((k) => (
            <button key={k.value} type="button" onClick={() => set("kind", k.value)} data-testid={`manual-kind-${k.value}`}
              className={`rounded px-3 py-1.5 text-sm ${f.kind === k.value ? "bg-brown-800 text-ivory-100" : "text-brown-800/60"}`}>
              {k.label}
            </button>
          ))}
        </div>
        {f.kind === "subscription" ? (
          <p className="mb-3 text-xs text-brown-800/55">
            Includes the ₹3,500 subscription base. Use the amount field only for an extra donation.
            If this flat already paid subscription, it is saved as donation only.
          </p>
        ) : (
          <p className="mb-3 text-xs text-brown-800/55">
            Records only the amount you enter — no ₹3,500 subscription is added.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Tower</Label><Select data-testid="manual-tower" value={f.tower_id} onChange={(e) => { set("tower_id", e.target.value); set("flat_id", ""); }}><option value="">Select</option>{towers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></div>
          <div><Label>Flat</Label><Select data-testid="manual-flat" value={f.flat_id} onChange={(e) => set("flat_id", e.target.value)}><option value="">Select</option>{flats.map((x) => <option key={x.id} value={x.id}>{x.number}</option>)}</Select></div>
          <div><Label>Name</Label><Input data-testid="manual-name" value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div><Label required>Mobile</Label><Input data-testid="manual-mobile" value={f.mobile} onChange={(e) => set("mobile", e.target.value.replace(/\D/g, "").slice(0, 10))} /></div>
          <div>
            <Label>{f.kind === "donation" ? "Donation amount (₹)" : "Extra donation (₹, optional)"}</Label>
            <Input type="number" data-testid="manual-amount" value={f.donation_rupees} onChange={(e) => set("donation_rupees", e.target.value)} />
          </div>
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
      <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-brown-800/60">{title}</h4>
      {(!rows || rows.length === 0) ? <div className="text-sm text-brown-800/40">Empty</div> : <div className="space-y-2">{rows.map(render)}</div>}
    </CardBody></Card>
  );
}
function QueueRow({ label, onAct, actLabel, onCancel }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-brown-800/10 px-3 py-2 text-sm">
      <span className="min-w-0 flex-1">{label}</span>
      <div className="flex shrink-0 gap-2">
        {onCancel && <Button variant="subtle" size="sm" onClick={onCancel}>Cancel</Button>}
        {onAct && <Button variant="admin" size="sm" onClick={onAct}><Check className="h-3.5 w-3.5" /> {actLabel}</Button>}
      </div>
    </div>
  );
}

function ExcelImport() {
  const fileRef = useRef(null);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [result, setResult] = useState(null);

  const downloadTemplate = async () => {
    setDownloading(true);
    try {
      const r = await api.get("/admin/subscription-imports/template", { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "one10_subscription_payment_template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Template downloaded");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not download template");
    } finally {
      setDownloading(false);
    }
  };

  const uploadFile = async (file, dryRun) => {
    const fd = new FormData();
    fd.append("file", file);
    const r = await api.post(`/admin/subscription-imports/import?dry_run=${dryRun ? "true" : "false"}`, fd);
    setResult(r.data);
    return r.data;
  };

  const onUpload = async (e, dryRun) => {
    const file = e?.target?.files?.[0];
    if (e?.target) e.target.value = "";
    if (!file) return;
    if (dryRun) setPreviewing(true);
    else setUploading(true);
    setResult(null);
    try {
      const data = await uploadFile(file, dryRun);
      toast.success(data.message || (dryRun ? "Preview complete" : "Import complete"));
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Upload failed");
    } finally {
      setUploading(false);
      setPreviewing(false);
    }
  };

  const confirmImport = async () => {
    if (!window.confirm("Issue receipts for all valid rows in the selected file? Duplicate UTRs will be skipped.")) {
      return;
    }
    fileRef.current?.click();
  };

  return (
    <div className="space-y-5" data-testid="excel-import-panel">
      <Card>
        <CardBody>
          <div className="mb-2 font-display text-xl text-brown-900">UPI payment Excel import</div>
          <p className="mb-3 text-sm text-brown-800/60">
            Download the template, fill one successful UPI payment per row, then upload.
            Each valid row creates/updates the household and automatically issues a receipt.
            Re-uploading the same UTR / UPI Transaction ID is skipped.
          </p>
          <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-brown-800/65">
            <li><b>Kind</b>: <code>subscription</code> (base flat fee) or <code>donation</code></li>
            <li><b>Tower</b> number only (e.g. 6) and <b>Flat</b> (e.g. 11B)</li>
            <li><b>UTR / UPI Transaction ID</b> required and unique</li>
            <li>Delete the example rows before uploading real data</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="admin"
              size="sm"
              disabled={downloading}
              onClick={downloadTemplate}
              data-testid="subscription-template-download-btn"
            >
              <Download className="h-4 w-4" /> {downloading ? "Preparing…" : "Download template"}
            </Button>
            <Button
              variant="subtle"
              size="sm"
              disabled={previewing || uploading}
              onClick={() => {
                const input = document.getElementById("subscription-import-preview-input");
                input?.click();
              }}
              data-testid="subscription-template-preview-btn"
            >
              <FileText className="h-4 w-4" /> {previewing ? "Checking…" : "Preview (no receipts)"}
            </Button>
            <Button
              variant="admin"
              size="sm"
              disabled={uploading || previewing}
              onClick={confirmImport}
              data-testid="subscription-template-upload-btn"
            >
              <Upload className="h-4 w-4" /> {uploading ? "Importing…" : "Upload & issue receipts"}
            </Button>
            <input
              id="subscription-import-preview-input"
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="hidden"
              onChange={(e) => onUpload(e, true)}
              data-testid="subscription-template-preview-input"
            />
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="hidden"
              onChange={(e) => onUpload(e, false)}
              data-testid="subscription-template-file-input"
            />
          </div>
        </CardBody>
      </Card>

      {result && (
        <Card data-testid="subscription-import-result">
          <CardBody>
            <div className="mb-2 font-display text-xl text-brown-900">Import result</div>
            <p className="mb-3 text-sm text-brown-800/70">{result.message}</p>
            <div className="mb-4 grid gap-3 sm:grid-cols-4">
              <StatMini label={result.dry_run ? "Would issue" : "Issued"} value={(result.issued || result.would_issue || []).length} />
              <StatMini label="Skipped" value={(result.skipped || []).length} />
              <StatMini label="Errors" value={(result.errors || []).length} />
              <StatMini label="Rows read" value={result.row_count || 0} />
            </div>

            {!!(result.issued || []).length && (
              <ResultTable
                title="Receipts issued"
                rows={result.issued}
                cols={[
                  ["receipt_no", "Receipt"],
                  ["name", "Name"],
                  ["tower", "Tower"],
                  ["flat", "Flat"],
                  ["kind", "Kind"],
                  ["txn", "UTR"],
                ]}
              />
            )}
            {!!(result.would_issue || []).length && (
              <ResultTable
                title="Would issue (dry run)"
                rows={result.would_issue}
                cols={[
                  ["name", "Name"],
                  ["tower", "Tower"],
                  ["flat", "Flat"],
                  ["kind", "Kind"],
                  ["txn", "UTR"],
                ]}
              />
            )}
            {!!(result.skipped || []).length && (
              <ResultTable
                title="Skipped"
                rows={result.skipped}
                cols={[
                  ["excel_row", "Row"],
                  ["name", "Name"],
                  ["txn", "UTR"],
                  ["reason", "Reason"],
                ]}
              />
            )}
            {!!(result.errors || []).length && (
              <ResultTable
                title="Errors"
                rows={result.errors}
                cols={[
                  ["excel_row", "Row"],
                  ["name", "Name"],
                  ["tower", "Tower"],
                  ["flat", "Flat"],
                  ["reason", "Reason"],
                ]}
              />
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function StatMini({ label, value }) {
  return (
    <div className="rounded-lg border border-brown-800/10 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-brown-800/45">{label}</div>
      <div className="mt-0.5 font-display text-2xl text-brown-900">{value}</div>
    </div>
  );
}

function ResultTable({ title, rows, cols }) {
  return (
    <div className="mb-4">
      <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-brown-800/55">{title}</h4>
      <div className="overflow-x-auto">
        <Table>
          <THead>
            <TR>{cols.map(([k, label]) => <TH key={k}>{label}</TH>)}</TR>
          </THead>
          <tbody>
            {rows.slice(0, 50).map((row, idx) => (
              <TR key={`${title}-${idx}-${row.txn || row.receipt_no || idx}`}>
                {cols.map(([k]) => <TD key={k}>{row[k] ?? ""}</TD>)}
              </TR>
            ))}
          </tbody>
        </Table>
      </div>
      {rows.length > 50 && (
        <div className="mt-1 text-xs text-brown-800/45">Showing first 50 of {rows.length}</div>
      )}
    </div>
  );
}
