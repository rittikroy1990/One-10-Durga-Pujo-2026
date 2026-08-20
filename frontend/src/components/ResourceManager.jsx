import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw } from "lucide-react";
import api from "../lib/api";
import { Button, Card, CardBody, Table, THead, TR, TH, TD, Dialog, Label, Input, Select, Textarea, Spinner } from "./ui";

export default function ResourceManager({ title, subtitle, listEndpoint, columns, createFields = [],
  createEndpoint, transformCreate, testid = "resource", extraActions, dataKey = "items" }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(listEndpoint);
      setItems(r.data[dataKey] || r.data.items || []);
    } catch {
      toast.error(`Could not load ${title}`);
    } finally {
      setLoading(false);
    }
  }, [listEndpoint, title, dataKey]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    setBusy(true);
    try {
      const payload = transformCreate ? transformCreate(form) : form;
      await api.post(createEndpoint, payload);
      toast.success(`${title} created`);
      setOpen(false);
      setForm({});
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || `Could not create ${title}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardBody>
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-2xl">{title}</h2>
            {subtitle && <p className="text-sm text-brown-800/50">{subtitle}</p>}
          </div>
          <div className="flex gap-2">
            <Button variant="subtle" size="sm" onClick={load} data-testid={`${testid}-refresh`}><RefreshCw className="h-4 w-4" /></Button>
            {createEndpoint && (
              <Button variant="admin" size="sm" onClick={() => setOpen(true)} data-testid={`${testid}-new-btn`}><Plus className="h-4 w-4" /> New</Button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-10"><Spinner className="text-vermilion-500" /></div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-brown-800/15 py-10 text-center text-sm text-brown-800/50">No records yet.</div>
        ) : (
          <Table>
            <THead>
              <TR>
                {columns.map((c) => <TH key={c.key} right={c.right}>{c.label}</TH>)}
                {extraActions && <TH>Actions</TH>}
              </TR>
            </THead>
            <tbody>
              {items.map((row, i) => (
                <TR key={row.id || i}>
                  {columns.map((c) => (
                    <TD key={c.key} right={c.right}>{c.render ? c.render(row) : (row[c.key] ?? "—")}</TD>
                  ))}
                  {extraActions && <TD>{extraActions(row, load)}</TD>}
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </CardBody>

      <Dialog open={open} onClose={() => setOpen(false)} title={`New ${title}`}
        footer={<><Button variant="subtle" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="admin" onClick={submit} disabled={busy} data-testid={`${testid}-create-submit`}>{busy ? "Saving…" : "Create"}</Button></>}>
        <div className="grid gap-3.5 sm:grid-cols-2">
          {createFields.map((f) => (
            <div key={f.name} className={f.full ? "sm:col-span-2" : ""}>
              <Label htmlFor={f.name}>{f.label}</Label>
              {f.type === "select" ? (
                <Select id={f.name} data-testid={`${testid}-field-${f.name}`} value={form[f.name] || ""} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}>
                  <option value="">Select…</option>
                  {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              ) : f.type === "textarea" ? (
                <Textarea id={f.name} data-testid={`${testid}-field-${f.name}`} value={form[f.name] || ""} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} />
              ) : (
                <Input id={f.name} type={f.type || "text"} data-testid={`${testid}-field-${f.name}`} value={form[f.name] || ""} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} placeholder={f.placeholder} />
              )}
            </div>
          ))}
        </div>
      </Dialog>
    </Card>
  );
}
