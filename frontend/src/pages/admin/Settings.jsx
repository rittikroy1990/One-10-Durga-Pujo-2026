import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Save, Users2, AlertTriangle } from "lucide-react";
import api from "../../lib/api";
import { Card, CardBody, Table, THead, TR, TH, TD, Button, Tabs, Label, Input, StatusBadge, Spinner } from "../../components/ui";

export default function Settings() {
  const [tab, setTab] = useState("general");
  return (
    <div data-testid="settings-page">
      <h1 className="mb-1 font-display text-4xl">Settings & Access</h1>
      <p className="mb-4 text-sm text-brown-800/50">Configurable annual cycle. Items marked NOT APPROVED FOR PRODUCTION require EOC confirmation.</p>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "general", label: "Configuration" }, { value: "users", label: "Users & Roles" }]} />
      {tab === "general" && <General />}
      {tab === "users" && <UsersRoles />}
    </div>
  );
}

function General() {
  const [s, setS] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.get("/admin/settings").then((r) => { setS(r.data); setLoading(false); }); }, []);
  const setOrg = (k, v) => setS({ ...s, organisation: { ...s.organisation, [k]: v } });
  const setCamp = (k, v) => setS({ ...s, campaign: { ...s.campaign, [k]: v } });

  const save = async () => {
    try {
      await api.put("/admin/settings", { organisation: s.organisation, campaign: s.campaign, eligibility: s.eligibility });
      toast.success("Settings saved");
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not save"); }
  };

  if (loading || !s) return <Spinner className="text-vermilion-500" />;
  return (
    <Card><CardBody>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label>Contact email</Label><Input value={s.organisation.contact_email || ""} onChange={(e) => setOrg("contact_email", e.target.value)} data-testid="set-email" /></div>
        <div><Label>Contact phone</Label><Input value={s.organisation.contact_phone || ""} onChange={(e) => setOrg("contact_phone", e.target.value)} /></div>
        <div><Label>Authorised signatory</Label><Input value={s.organisation.authorised_signatory || ""} onChange={(e) => setOrg("authorised_signatory", e.target.value)} /></div>
        <div><Label>Venue</Label><Input value={s.campaign.venue || ""} onChange={(e) => setCamp("venue", e.target.value)} /></div>
        <div className="sm:col-span-2"><Label>Important notice</Label><Input value={s.campaign.important_notice || ""} onChange={(e) => setCamp("important_notice", e.target.value)} /></div>
        <div><Label>Eligible occupied households</Label><Input type="number" value={s.eligibility.eligible_occupied_households} onChange={(e) => setS({ ...s, eligibility: { ...s.eligibility, eligible_occupied_households: Number(e.target.value) } })} data-testid="set-eligible" /></div>
      </div>
      <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
        <div className="flex items-center gap-1 font-semibold"><AlertTriangle className="h-4 w-4" /> Items requiring committee/legal confirmation</div>
        <ul className="mt-1 list-disc pl-5">{(s.policy_checklist || []).map((p, i) => <li key={i}>{p}</li>)}</ul>
      </div>
      <Button variant="admin" className="mt-4" onClick={save} data-testid="settings-save-btn"><Save className="h-4 w-4" /> Save configuration</Button>
    </CardBody></Card>
  );
}

function UsersRoles() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.allSettled([
      api.get("/users").then((r) => setUsers(r.data.items || [])),
      api.get("/auth/roles").then((r) => setRoles(r.data.roles || [])),
    ]).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const toggle = async (u, roleKey) => {
    const has = (u.roles || []).includes(roleKey);
    const next = has ? u.roles.filter((x) => x !== roleKey) : [...(u.roles || []), roleKey];
    try {
      const r = await api.put(`/users/${u.user_id}/roles`, { roles: next });
      toast.success("Roles updated");
      if (r.data.sod_conflicts?.length) toast.warning("Segregation-of-duty conflict detected");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not update"); }
  };

  if (loading) return <Spinner className="text-vermilion-500" />;
  return (
    <Card><CardBody>
      <h3 className="mb-3 font-display text-xl flex items-center gap-2"><Users2 className="h-5 w-5" /> Users & role assignment</h3>
      <div className="space-y-3">
        {users.map((u) => (
          <div key={u.user_id} className="rounded-lg border border-brown-800/10 p-3" data-testid={`user-${u.email}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold">{u.name || u.email}</div>
                <div className="text-xs text-brown-800/50">{u.email}</div>
              </div>
              {u.sod_conflicts?.length > 0 && <StatusBadge status="exception" />}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {roles.map((r) => {
                const active = (u.roles || []).includes(r.key);
                return (
                  <button key={r.key} onClick={() => toggle(u, r.key)} title={r.description}
                    data-testid={`role-${u.email}-${r.key}`}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${active ? "border-vermilion-500 bg-vermilion-500/10 text-vermilion-600" : "border-brown-800/15 text-brown-800/50 hover:bg-ivory-300"}`}>
                    {r.key}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </CardBody></Card>
  );
}
