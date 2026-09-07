import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Save, Users2, AlertTriangle, CalendarRange, CheckCircle2 } from "lucide-react";
import api from "../../lib/api";
import { Card, CardBody, Button, Tabs, Label, Input, StatusBadge, Spinner, Textarea } from "../../components/ui";
import { formatPaise } from "../../lib/utils";

export default function Settings() {
  const [tab, setTab] = useState("general");
  return (
    <div data-testid="settings-page">
      <h1 className="mb-1 font-display text-4xl">Settings & Campaigns</h1>
      <p className="mb-4 text-sm text-brown-800/50">
        One 10 Events platform configuration. Items marked NOT APPROVED FOR PRODUCTION require EOC confirmation.
      </p>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "general", label: "Organisation" },
          { value: "campaigns", label: "Campaigns" },
          { value: "users", label: "Users & Roles" },
        ]}
      />
      {tab === "general" && <General />}
      {tab === "campaigns" && <Campaigns />}
      {tab === "users" && <UsersRoles />}
    </div>
  );
}

function General() {
  const [s, setS] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/admin/settings").then((r) => {
      setS(r.data);
      setLoading(false);
    });
  }, []);
  const setOrg = (k, v) => setS({ ...s, organisation: { ...s.organisation, [k]: v } });
  const setCamp = (k, v) => setS({ ...s, campaign: { ...s.campaign, [k]: v } });
  const setPlatform = (k, v) => setS({ ...s, platform: { ...(s.platform || {}), [k]: v } });

  const save = async () => {
    try {
      await api.put("/admin/settings", {
        platform: s.platform,
        organisation: s.organisation,
        campaign: s.campaign,
        eligibility: s.eligibility,
      });
      toast.success("Settings saved");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not save");
    }
  };

  if (loading || !s) return <Spinner className="text-vermilion-500" />;
  return (
    <Card>
      <CardBody>
        <h3 className="mb-3 font-display text-xl">Platform</h3>
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Platform name</Label>
            <Input value={s.platform?.name || ""} onChange={(e) => setPlatform("name", e.target.value)} data-testid="set-platform-name" />
          </div>
          <div>
            <Label>Short name</Label>
            <Input value={s.platform?.short_name || ""} onChange={(e) => setPlatform("short_name", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Tagline</Label>
            <Input value={s.platform?.tagline || ""} onChange={(e) => setPlatform("tagline", e.target.value)} />
          </div>
        </div>

        <h3 className="mb-3 font-display text-xl">Organisation (from MoA)</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Legal / organiser name</Label>
            <Input value={s.organisation.organiser || ""} onChange={(e) => setOrg("organiser", e.target.value)} data-testid="set-organiser" />
          </div>
          <div className="sm:col-span-2">
            <Label>Legal status</Label>
            <Input value={s.organisation.legal_status || ""} onChange={(e) => setOrg("legal_status", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Address</Label>
            <Input value={s.organisation.address || ""} onChange={(e) => setOrg("address", e.target.value)} />
          </div>
          <div>
            <Label>PAN</Label>
            <Input value={s.organisation.pan || ""} onChange={(e) => setOrg("pan", e.target.value.toUpperCase())} data-testid="set-pan" />
          </div>
          <div>
            <Label>Date of formation</Label>
            <Input value={s.organisation.date_of_formation || ""} onChange={(e) => setOrg("date_of_formation", e.target.value)} placeholder="YYYY-MM-DD" />
          </div>
          <div>
            <Label>Contact email</Label>
            <Input value={s.organisation.contact_email || ""} onChange={(e) => setOrg("contact_email", e.target.value)} data-testid="set-email" />
          </div>
          <div>
            <Label>Contact phone</Label>
            <Input value={s.organisation.contact_phone || ""} onChange={(e) => setOrg("contact_phone", e.target.value)} />
          </div>
          <div>
            <Label>Authorised signatory (receipts)</Label>
            <Input value={s.organisation.authorised_signatory || ""} onChange={(e) => setOrg("authorised_signatory", e.target.value)} />
          </div>
          <div>
            <Label>Active campaign venue</Label>
            <Input value={s.campaign.venue || ""} onChange={(e) => setCamp("venue", e.target.value)} />
          </div>
          <div>
            <Label>Eligible occupied households</Label>
            <Input
              type="number"
              value={s.eligibility.eligible_occupied_households}
              onChange={(e) => setS({ ...s, eligibility: { ...s.eligibility, eligible_occupied_households: Number(e.target.value) } })}
              data-testid="set-eligible"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Important notice</Label>
            <Input value={s.campaign.important_notice || ""} onChange={(e) => setCamp("important_notice", e.target.value)} />
          </div>
        </div>
        {(s.organisation.office_bearers || []).length > 0 && (
          <div className="mt-4 rounded-lg border border-brown-800/10 bg-ivory-200/50 p-3 text-xs">
            <div className="mb-2 font-semibold">Office bearers (MoA) — shown on Contact</div>
            <ul className="grid gap-1 sm:grid-cols-2">
              {s.organisation.office_bearers.map((b) => (
                <li key={`${b.designation}-${b.name}`}>{b.name} — {b.designation}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
          <div className="flex items-center gap-1 font-semibold">
            <AlertTriangle className="h-4 w-4" /> Items requiring committee/legal confirmation
          </div>
          <ul className="mt-1 list-disc pl-5">
            {(s.policy_checklist || []).map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
        <Button variant="admin" className="mt-4" onClick={save} data-testid="settings-save-btn">
          <Save className="h-4 w-4" /> Save configuration
        </Button>
      </CardBody>
    </Card>
  );
}

function Campaigns() {
  const [items, setItems] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    kind: "event",
    summary: "",
    theme_line: "",
    venue: "",
    base_amount_rupees: "",
    receipt_prefix: "",
    is_published: false,
  });

  const load = useCallback(() => {
    setLoading(true);
    api
      .get("/admin/campaigns")
      .then((r) => {
        setItems(r.data.items || []);
        setActiveId(r.data.active_cycle_id || "");
      })
      .catch((e) => toast.error(e?.response?.data?.detail || "Could not load campaigns"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const activate = async (id) => {
    try {
      await api.post(`/admin/campaigns/${id}/activate`);
      toast.success("Campaign activated — public subscribe now uses this cycle");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not activate");
    }
  };

  const togglePublish = async (c) => {
    try {
      await api.put(`/admin/campaigns/${c.id}`, { is_published: !c.is_published });
      toast.success(c.is_published ? "Unpublished" : "Published on public site");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not update");
    }
  };

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post("/admin/campaigns", form);
      toast.success("Campaign created");
      setForm({
        name: "",
        slug: "",
        kind: "event",
        summary: "",
        theme_line: "",
        venue: "",
        base_amount_rupees: "",
        receipt_prefix: "",
        is_published: false,
      });
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not create campaign");
    }
  };

  if (loading) return <Spinner className="text-vermilion-500" />;

  return (
    <div className="space-y-6" data-testid="campaigns-admin">
      <Card>
        <CardBody>
          <h3 className="mb-1 flex items-center gap-2 font-display text-xl">
            <CalendarRange className="h-5 w-5" /> Campaign cycles
          </h3>
          <p className="mb-4 text-sm text-brown-800/50">
            Activate one campaign at a time for subscriptions and receipts. Publish to show it on the public site.
          </p>
          <div className="space-y-3">
            {items.map((c) => {
              const sub = c.subscription || {};
              const camp = c.campaign || {};
              const isActive = c.id === activeId || c.is_current;
              return (
                <div key={c.id} className="rounded-lg border border-brown-800/10 p-4" data-testid={`campaign-row-${c.slug}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-2xl">{camp.title || c.name}</span>
                        {isActive && <StatusBadge status="active" />}
                        {c.is_published ? <StatusBadge status="verified" /> : <StatusBadge status="pending" />}
                        {c.is_locked && <StatusBadge status="locked" />}
                      </div>
                      <div className="mt-1 text-xs text-brown-800/50">
                        {c.slug} · {c.kind} · {c.id}
                      </div>
                      <p className="mt-2 text-sm text-brown-800/70">{c.summary || camp.theme_line}</p>
                      <div className="mt-2 text-sm font-semibold tabular-nums">
                        Base: {sub.base_amount_paise ? formatPaise(sub.base_amount_paise) : "₹0.00 (draft)"}
                        {c.receipt?.prefix ? ` · Receipt ${c.receipt.prefix}` : ""}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="subtle" size="sm" onClick={() => togglePublish(c)} data-testid={`campaign-publish-${c.slug}`}>
                        {c.is_published ? "Unpublish" : "Publish"}
                      </Button>
                      {!isActive && !c.is_locked && (
                        <Button variant="admin" size="sm" onClick={() => activate(c.id)} data-testid={`campaign-activate-${c.slug}`}>
                          <CheckCircle2 className="h-4 w-4" /> Activate
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h3 className="mb-3 font-display text-xl">Create campaign</h3>
          <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Name</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, slug: form.slug || e.target.value.toLowerCase().replace(/\s+/g, "-") })} data-testid="campaign-name" />
            </div>
            <div>
              <Label>Slug</Label>
              <Input required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })} data-testid="campaign-slug" />
            </div>
            <div>
              <Label>Kind</Label>
              <Input value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} placeholder="durgotsav / kali / diwali_milan" />
            </div>
            <div>
              <Label>Base amount (₹)</Label>
              <Input type="number" min="0" step="1" value={form.base_amount_rupees} onChange={(e) => setForm({ ...form, base_amount_rupees: e.target.value })} data-testid="campaign-base" />
            </div>
            <div>
              <Label>Receipt prefix</Label>
              <Input value={form.receipt_prefix} onChange={(e) => setForm({ ...form, receipt_prefix: e.target.value })} placeholder="ONE10-XX26" />
            </div>
            <div>
              <Label>Venue</Label>
              <Input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Theme line</Label>
              <Input value={form.theme_line} onChange={(e) => setForm({ ...form, theme_line: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Summary</Label>
              <Textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} rows={2} />
            </div>
            <div className="sm:col-span-2">
              <Button variant="admin" type="submit" data-testid="campaign-create-btn">
                Create campaign
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
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
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not update");
    }
  };

  if (loading) return <Spinner className="text-vermilion-500" />;
  return (
    <Card>
      <CardBody>
        <h3 className="mb-3 flex items-center gap-2 font-display text-xl">
          <Users2 className="h-5 w-5" /> Users & role assignment
        </h3>
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
                    <button
                      key={r.key}
                      onClick={() => toggle(u, r.key)}
                      title={r.description}
                      data-testid={`role-${u.email}-${r.key}`}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                        active ? "border-vermilion-500 bg-vermilion-500/10 text-vermilion-600" : "border-brown-800/15 text-brown-800/50 hover:bg-ivory-300"
                      }`}
                    >
                      {r.key}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
