import React, { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { FileText, Check, Plus, RefreshCw, Download, Upload, ShieldCheck } from "lucide-react";
import api, { API } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Card, CardBody, Table, THead, TR, TH, TD, StatusBadge, Button, Dialog, Label, Input, Select, Spinner } from "../../components/ui";
import { formatPaise } from "../../lib/utils";
import ExportCsvButton from "../../components/ExportCsvButton";

function receiptVerifyLabel(r) {
  if (r?.refund_status) return r.refund_status;
  if (r?.status && r.status !== "issued" && r.status !== "partially_refunded") return r.status;
  return r?.bank_verified ? "bank verified" : "not bank verified";
}

export default function Collection() {
  const { user } = useAuth();
  const perms = new Set(user?.permissions || []);
  const canBankVerify = perms.has("receipts:manage") || perms.has("payments:manage");
  const { items, loading, load, setItems } = useList("/admin/receipts");
  const fileRef = useRef(null);
  const [towers, setTowers] = useState([]);
  const [flats, setFlats] = useState([]);
  const [mode, setMode] = useState("cash");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [verifying, setVerifying] = useState("");
  const [importResult, setImportResult] = useState(null);
  const [queues, setQueues] = useState(null);
  const [f, setF] = useState({
    tower_id: "",
    flat_id: "",
    name: "",
    mobile: "",
    occupancy_type: "owner_resident",
    family_members: 1,
    donation_rupees: 0,
    utr: "",
    cheque_no: "",
    bank: "",
    handover_batch: "",
  });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const loadQueues = useCallback(() => {
    api.get("/manual/queues").then((r) => setQueues(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    api.get("/towers").then((r) => setTowers(r.data.items || []));
    loadQueues();
  }, [loadQueues]);

  useEffect(() => {
    if (!f.tower_id) {
      setFlats([]);
      return;
    }
    api.get(`/towers/${f.tower_id}/flats`).then((r) => setFlats(r.data.items || [])).catch(() => setFlats([]));
  }, [f.tower_id]);

  const refresh = () => {
    load();
    loadQueues();
  };

  const markBankVerified = async (row) => {
    if (!row?.id) return;
    if (!window.confirm(`Mark ${row.receipt_no} as bank verified?\nConfirm only after matching UTR ${row.payment_id || row.masked_ref || ""} on the bank statement.`)) {
      return;
    }
    setVerifying(row.id);
    try {
      const r = await api.post(`/admin/receipts/${row.id}/bank-verify`);
      const updated = r.data.receipt || { ...row, bank_verified: true };
      setItems((prev) => prev.map((x) => (x.id === row.id ? { ...x, ...updated, bank_verified: true } : x)));
      toast.success(r.data.already ? "Already bank verified" : `Bank verified — ${row.receipt_no}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not mark bank verified");
    } finally {
      setVerifying("");
    }
  };

  const downloadSample = async () => {
    setDownloading(true);
    try {
      const r = await api.get("/admin/collection/template", { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "one10_subscription_payment_template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Sample template downloaded — replace the example rows and upload");
    } catch {
      toast.error("Could not download template");
    } finally {
      setDownloading(false);
    }
  };

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/admin/collection/import", fd);
      setImportResult(r.data);
      toast.success(r.data.message || "Import complete");
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Import failed");
    } finally {
      setUploading(false);
    }
  };

  const create = async () => {
    setBusy(true);
    try {
      const ep = mode === "cash" ? "/manual/cash" : mode === "bank" ? "/manual/bank-transfer" : "/manual/cheque";
      await api.post(ep, f);
      toast.success(`${mode} collection recorded (pending checker approval)`);
      setOpen(false);
      refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not record.");
    } finally {
      setBusy(false);
    }
  };

  const act = async (endpoint, body) => {
    try {
      await api.post(endpoint, body || { bank_statement_matched: true });
      toast.success("Approved — receipt issued");
      refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Action failed");
    }
  };

  const exportCols = [
    { key: "receipt_no", label: "Receipt no" },
    { key: "payer_name", label: "Payer" },
    { key: "tower_name", label: "Tower" },
    { key: "flat_number", label: "Flat" },
    { key: "total_amount", label: "Total (₹)", exportValue: (r) => (Number(r.total_amount || 0) / 100).toFixed(2) },
    { key: "method", label: "Method", exportValue: (r) => (r.method || "").replace(/_/g, " ") },
    { key: "status", label: "Status", exportValue: (r) => receiptVerifyLabel(r) },
    { key: "payment_id", label: "UTR / ref" },
    { key: "issued_at", label: "Issued at", exportValue: (r) => r.issued_at || r.created_at || "" },
  ];

  return (
    <div data-testid="collection-page" className="space-y-5">
      <div>
        <h1 className="mb-1 font-display text-4xl">Collection</h1>
        <p className="text-sm text-brown-800/50">
          Issued receipts. Excel uploads are bank verified. Screenshot receipts stay “not bank verified” until a treasurer confirms the UTR on the statement.
        </p>
      </div>

      <Card><CardBody>
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="subtle"
            size="sm"
            disabled={downloading}
            onClick={downloadSample}
            data-testid="collection-template-download"
          >
            <Download className="h-4 w-4" /> {downloading ? "…" : "Download sample"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={onUpload}
            data-testid="collection-import-input"
          />
          <Button
            variant="subtle"
            size="sm"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            data-testid="collection-import-upload"
          >
            <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : "Upload filled"}
          </Button>
          <ExportCsvButton filename="receipts.csv" columns={exportCols} items={items} data-testid="receipts-export-csv" />
          <Button variant="subtle" size="sm" onClick={refresh} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="admin" size="sm" onClick={() => setOpen(true)} data-testid="manual-new-btn">
            <Plus className="h-4 w-4" /> Record cash
          </Button>
        </div>

        {importResult && (
          <div
            className="mb-3 rounded-lg border border-sun-400/30 bg-sun-50/60 px-3 py-2 text-sm text-brown-800/80"
            data-testid="collection-import-result"
          >
            {importResult.message}
            {!!(importResult.errors || []).length && (
              <ul className="mt-1 list-disc pl-5 text-xs text-vermilion-700">
                {(importResult.errors || []).slice(0, 5).map((e, i) => (
                  <li key={i}>{e.reason || e.message || JSON.stringify(e)}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {loading ? (
          <Spinner className="text-vermilion-500" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Receipt No</TH>
                <TH>Payer</TH>
                <TH>Household</TH>
                <TH right>Total</TH>
                <TH>UTR</TH>
                <TH>Status</TH>
                <TH>PDF</TH>
                {canBankVerify ? <TH>Verify</TH> : null}
              </TR>
            </THead>
            <tbody>
              {items.map((r) => (
                <TR key={r.id}>
                  <TD>{r.receipt_no}</TD>
                  <TD>{r.payer_name}</TD>
                  <TD className="text-xs text-brown-800/70">
                    {[r.tower_name, r.flat_number].filter(Boolean).join(" · ") || "—"}
                  </TD>
                  <TD right>{formatPaise(r.total_amount)}</TD>
                  <TD className="font-mono text-xs">{r.payment_id || r.masked_ref || "—"}</TD>
                  <TD><StatusBadge status={receiptVerifyLabel(r)} /></TD>
                  <TD>
                    <a
                      href={`${API}/receipt/pdf/${r.verify_token}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-vermilion-600"
                      aria-label={`Download PDF for ${r.receipt_no}`}
                    >
                      <FileText className="h-4 w-4" />
                    </a>
                  </TD>
                  {canBankVerify ? (
                    <TD>
                      {!r.bank_verified && (r.status === "issued" || r.status === "partially_refunded") ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={verifying === r.id}
                          onClick={() => markBankVerified(r)}
                          data-testid={`bank-verify-${r.id}`}
                          title="Confirm UTR on bank statement"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          {verifying === r.id ? "…" : "Bank verified"}
                        </Button>
                      ) : r.bank_verified ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                          <Check className="h-3.5 w-3.5" /> Done
                        </span>
                      ) : (
                        "—"
                      )}
                    </TD>
                  ) : null}
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </CardBody></Card>

      {queues && (
        <div className="grid gap-4 lg:grid-cols-3">
          <QueueCard
            title="Cash — pending acceptance"
            testid="queue-cash"
            rows={queues.cash_pending}
            render={(c) => (
              <QueueRow
                key={c.id}
                label={`${formatPaise(c.amount_paise)} · ${c.collector_name}`}
                onAct={() => act(`/manual/cash/${c.id}/accept`)}
                actLabel="Accept"
              />
            )}
          />
          <QueueCard
            title="Bank transfer — pending match"
            testid="queue-bank"
            rows={queues.bank_transfer_pending}
            render={(c) => (
              <QueueRow
                key={c.id}
                label={`${formatPaise(c.amount_paise)} · UTR ${c.utr}`}
                onAct={() => act(`/manual/bank-transfer/${c.id}/approve`, { bank_statement_matched: true })}
                actLabel="Approve"
              />
            )}
          />
          <QueueCard
            title="Cheque — pending clearing"
            testid="queue-cheque"
            rows={queues.cheque_pending}
            render={(c) => (
              <QueueRow
                key={c.id}
                label={`${formatPaise(c.amount_paise)} · ${c.cheque_no}`}
                onAct={() => act(`/manual/cheque/${c.id}/clear`)}
                actLabel="Mark cleared"
              />
            )}
          />
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Record cash / manual collection"
        footer={(
          <>
            <Button variant="subtle" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="admin" onClick={create} disabled={busy} data-testid="manual-create-submit">
              {busy ? "Saving…" : "Record"}
            </Button>
          </>
        )}
      >
        <p className="mb-3 text-sm text-brown-800/55">
          Cash, bank transfer and cheque need a different person to approve. The receipt is issued only after approval.
        </p>
        <div className="mb-3 inline-flex rounded-md border border-brown-800/15 p-1">
          {["cash", "bank", "cheque"].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              data-testid={`manual-mode-${m}`}
              className={`rounded px-3 py-1.5 text-sm capitalize ${mode === m ? "bg-brown-800 text-ivory-100" : "text-brown-800/60"}`}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Tower</Label>
            <Select
              data-testid="manual-tower"
              value={f.tower_id}
              onChange={(e) => { set("tower_id", e.target.value); set("flat_id", ""); }}
            >
              <option value="">Select</option>
              {towers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Flat</Label>
            <Select data-testid="manual-flat" value={f.flat_id} onChange={(e) => set("flat_id", e.target.value)}>
              <option value="">Select</option>
              {flats.map((x) => <option key={x.id} value={x.id}>{x.number}</option>)}
            </Select>
          </div>
          <div>
            <Label>Name</Label>
            <Input data-testid="manual-name" value={f.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <Label>Mobile</Label>
            <Input
              data-testid="manual-mobile"
              value={f.mobile}
              onChange={(e) => set("mobile", e.target.value.replace(/\D/g, "").slice(0, 10))}
            />
          </div>
          <div>
            <Label>Donation (₹)</Label>
            <Input type="number" value={f.donation_rupees} onChange={(e) => set("donation_rupees", e.target.value)} />
          </div>
          {mode === "cash" && (
            <div>
              <Label>Handover batch</Label>
              <Input value={f.handover_batch} onChange={(e) => set("handover_batch", e.target.value)} />
            </div>
          )}
          {mode === "bank" && (
            <div>
              <Label>UTR / Reference</Label>
              <Input data-testid="manual-utr" value={f.utr} onChange={(e) => set("utr", e.target.value)} />
            </div>
          )}
          {mode === "cheque" && (
            <>
              <div>
                <Label>Cheque no</Label>
                <Input value={f.cheque_no} onChange={(e) => set("cheque_no", e.target.value)} />
              </div>
              <div>
                <Label>Bank</Label>
                <Input value={f.bank} onChange={(e) => set("bank", e.target.value)} />
              </div>
            </>
          )}
        </div>
      </Dialog>
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

function QueueCard({ title, rows, render, testid }) {
  return (
    <Card data-testid={testid}><CardBody>
      <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-brown-800/60">{title}</h4>
      {(!rows || rows.length === 0)
        ? <div className="text-sm text-brown-800/40">Empty</div>
        : <div className="space-y-2">{rows.map(render)}</div>}
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
