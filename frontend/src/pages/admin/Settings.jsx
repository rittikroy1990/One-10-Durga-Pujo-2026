import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Save, AlertTriangle, ShieldCheck } from "lucide-react";
import api from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Card, CardBody, Button, Tabs, Label, Input, Spinner, StatusBadge } from "../../components/ui";

/** Office titles used by One10 EOC / typical association boards */
const DESIGNATIONS = [
  "Platform Admin",
  "President",
  "Vice President",
  "Joint Secretary",
  "Asst. Secretary",
  "Joint Treasurer",
  "Treasurer",
  "Advisor",
  "Committee Member",
];

/**
 * Portal capability columns for the access matrix.
 * Mapped from MoA-style officers + HOA research (President≈convenor, Treasurer, Secretary ops≈collector/coordinator).
 */
const MATRIX_ROLES = [
  { key: "committee_member", label: "Member", hint: "View portal data" },
  { key: "convenor", label: "Convenor", hint: "President-level approvals" },
  { key: "treasurer", label: "Treasurer", hint: "Money, Payment QRs, receipts" },
  { key: "collector", label: "Collector", hint: "Record cash / household capture" },
  { key: "coordinator", label: "Coordinator", hint: "Ops / cultural programmes" },
  { key: "auditor", label: "Auditor", hint: "Read-only oversight" },
  { key: "system_admin", label: "Platform admin", hint: "IAM — Rittik only" },
];

export default function Settings() {
  const { user } = useAuth();
  const perms = useMemo(() => new Set(user?.permissions || []), [user]);
  const canManageUsers = perms.has("users:manage");
  const [tab, setTab] = useState("general");

  const tabs = useMemo(() => {
    const list = [
      { value: "general", label: "Organisation" },
      { value: "access", label: "Access control" },
      { value: "password", label: "My password" },
    ];
    return list;
  }, []);

  return (
    <div data-testid="settings-page">
      <h1 className="mb-1 font-display text-4xl">Settings</h1>
      <p className="mb-4 text-sm text-brown-800/50">
        Organisation details, committee access, and your login password. Payment QRs stay under Payment QRs for treasurers.
      </p>
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {tab === "general" && <OrganisationForm />}
      {tab === "access" && <AccessControlMatrix canEdit={canManageUsers} />}
      {tab === "password" && <ChangeMyPassword />}
    </div>
  );
}

function ChangeMyPassword() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New password and confirmation do not match.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      toast.success("Password updated — use it next time you log in.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not change password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card data-testid="settings-change-password">
      <CardBody>
        <h2 className="font-display text-2xl text-brown-900">Change my password</h2>
        <p className="mt-1 text-sm text-brown-800/55">
          Logged in as <span className="font-semibold">{user?.login_id || user?.name}</span>.
          This updates only your login — other committee passwords stay unchanged.
        </p>
        <form onSubmit={save} className="mt-5 grid max-w-md gap-3">
          <div>
            <Label required>Current password</Label>
            <Input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              data-testid="change-pw-current"
              required
            />
          </div>
          <div>
            <Label required>New password</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              data-testid="change-pw-new"
              required
              minLength={6}
            />
          </div>
          <div>
            <Label required>Confirm new password</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              data-testid="change-pw-confirm"
              required
              minLength={6}
            />
          </div>
          <div>
            <Button type="submit" variant="admin" disabled={busy} data-testid="change-pw-submit">
              {busy ? "Saving…" : "Update password"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
function OrganisationForm() {
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
            <Input value={s.campaign?.venue || ""} onChange={(e) => setCamp("venue", e.target.value)} />
          </div>
          <div>
            <Label>Eligible occupied households</Label>
            <Input
              type="number"
              value={s.eligibility?.eligible_occupied_households ?? ""}
              onChange={(e) => setS({ ...s, eligibility: { ...s.eligibility, eligible_occupied_households: Number(e.target.value) } })}
              data-testid="set-eligible"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Important notice</Label>
            <Input value={s.campaign?.important_notice || ""} onChange={(e) => setCamp("important_notice", e.target.value)} />
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

function AccessControlMatrix({ canEdit }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [saving, setSaving] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setForbidden(false);
    api.get("/users")
      .then((r) => {
        const items = (r.data.items || [])
          .filter((u) => u.login_id || u.is_committee)
          .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
        setUsers(items);
      })
      .catch((e) => {
        if (e?.response?.status === 403) {
          setForbidden(true);
          setUsers([]);
        } else {
          toast.error(e?.response?.data?.detail || "Could not load users");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const patchUser = async (uid, body) => {
    if (!canEdit) {
      toast.error("Only platform admin can change access. Log in as rittik.");
      return;
    }
    setSaving(uid);
    try {
      const r = await api.put(`/users/${uid}`, body);
      setUsers((prev) => prev.map((u) => (u.user_id === uid ? { ...u, ...r.data.user } : u)));
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not update");
    } finally {
      setSaving("");
    }
  };

  const toggleRole = async (u, roleKey) => {
    if (!canEdit) {
      toast.error("Only platform admin can change access. Log in as rittik.");
      return;
    }
    const has = (u.roles || []).includes(roleKey);
    const next = has ? u.roles.filter((x) => x !== roleKey) : [...(u.roles || []), roleKey];
    if (!next.includes("committee_member") && roleKey !== "committee_member") {
      next.push("committee_member");
    }
    setSaving(u.user_id);
    try {
      const r = await api.put(`/users/${u.user_id}/roles`, { roles: next });
      setUsers((prev) => prev.map((x) => (
        x.user_id === u.user_id
          ? { ...x, roles: r.data.roles, sod_conflicts: r.data.sod_conflicts }
          : x
      )));
      if (r.data.sod_conflicts?.length) {
        toast.warning(`SoD note: ${r.data.sod_conflicts.join(", ")}`);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not update roles");
    } finally {
      setSaving("");
    }
  };

  if (loading) return <Spinner className="text-vermilion-500" />;

  if (forbidden) {
    return (
      <Card data-testid="access-control-forbidden">
        <CardBody className="space-y-3 py-10 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-vermilion-500" />
          <h3 className="font-display text-2xl text-brown-900">Access control</h3>
          <p className="mx-auto max-w-md text-sm text-brown-800/60">
            Committee member × role matrix is managed by the platform admin only.
            Log out and sign in as <span className="font-semibold text-brown-900">rittik</span> to edit who is Convenor, Treasurer, Collector, etc.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card data-testid="access-control-matrix">
      <CardBody>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-display text-xl text-brown-900">
              <ShieldCheck className="h-5 w-5 text-vermilion-500" /> Access control
            </h3>
            <p className="mt-1 text-sm text-brown-800/55">
              Rows are people. Set office title, signatory, and portal roles (checkboxes).
              {!canEdit && " View only — platform admin can edit."}
            </p>
          </div>
          {canEdit ? (
            <StatusBadge status="active" />
          ) : (
            <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">Read only</span>
          )}
        </div>

        <div className="mb-3 grid gap-2 text-[11px] text-brown-800/55 sm:grid-cols-2 lg:grid-cols-3">
          {MATRIX_ROLES.map((r) => (
            <div key={r.key}><span className="font-semibold text-brown-900">{r.label}</span> — {r.hint}</div>
          ))}
        </div>

        <div className="overflow-x-auto rounded-lg border border-brown-800/10">
          <table className="min-w-[960px] w-full border-collapse text-sm" data-testid="access-matrix-table">
            <thead>
              <tr className="bg-ivory-200/80 text-left text-[10px] uppercase tracking-wider text-brown-800/55">
                <th className="sticky left-0 z-10 bg-ivory-200/95 px-3 py-2.5">Name / login</th>
                <th className="px-3 py-2.5">Office</th>
                <th className="px-2 py-2.5 text-center">Signatory</th>
                {MATRIX_ROLES.map((r) => (
                  <th key={r.key} className="px-2 py-2.5 text-center" title={r.hint}>{r.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const busy = saving === u.user_id;
                return (
                  <tr
                    key={u.user_id}
                    className={`border-t border-brown-800/10 ${u.is_active === false ? "opacity-50" : ""}`}
                    data-testid={`access-row-${u.login_id || u.user_id}`}
                  >
                    <td className="sticky left-0 z-10 bg-ivory-100 px-3 py-2">
                      <div className="font-medium text-brown-900">{u.name}</div>
                      <div className="font-mono text-[11px] text-brown-800/45">{u.login_id || "—"}</div>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="w-full min-w-[9rem] rounded-md border border-brown-800/15 bg-white px-2 py-1.5 text-xs disabled:opacity-60"
                        value={u.designation || ""}
                        disabled={!canEdit || busy}
                        onChange={(e) => patchUser(u.user_id, { designation: e.target.value })}
                      >
                        <option value="">—</option>
                        {DESIGNATIONS.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                        {u.designation && !DESIGNATIONS.includes(u.designation) && (
                          <option value={u.designation}>{u.designation}</option>
                        )}
                      </select>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-vermilion-600"
                        checked={!!u.is_signatory}
                        disabled={!canEdit || busy}
                        onChange={() => patchUser(u.user_id, { is_signatory: !u.is_signatory })}
                        aria-label={`Signatory ${u.name}`}
                      />
                    </td>
                    {MATRIX_ROLES.map((r) => {
                      const on = (u.roles || []).includes(r.key);
                      return (
                        <td key={r.key} className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-vermilion-600"
                            checked={on}
                            disabled={!canEdit || busy}
                            onChange={() => toggleRole(u, r.key)}
                            aria-label={`${r.label} for ${u.name}`}
                            data-testid={`access-${u.login_id}-${r.key}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-brown-800/45">
          Typical mapping: President → Convenor + Member; Joint Treasurer → Treasurer + Member;
          Joint Secretary → Collector/Coordinator + Member. Platform admin is reserved for site ownership (you).
        </p>
      </CardBody>
    </Card>
  );
}
