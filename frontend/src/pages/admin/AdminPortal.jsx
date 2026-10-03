import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Plus, KeyRound, Ban, CheckCircle2 } from "lucide-react";
import api from "../../lib/api";
import {
  Card, CardBody, Table, THead, TR, TH, TD, Button, StatusBadge, Spinner,
  Dialog, Label, Input,
} from "../../components/ui";

const PRIMARY_ROLES = [
  "system_admin",
  "convenor",
  "treasurer",
  "collector",
  "committee_member",
  "auditor",
  "coordinator",
];

export default function AdminPortal() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    designation: "",
    login_id: "",
    password: "one10",
    is_signatory: false,
    roles: ["committee_member"],
  });
  const [newPassword, setNewPassword] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get("/users"),
      api.get("/auth/roles"),
    ])
      .then(([u, r]) => {
        setUsers(u.data.items || []);
        setRoles(r.data.roles || []);
      })
      .catch((e) => toast.error(e?.response?.data?.detail || "Could not load users"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const roleKeys = roles.length
    ? [...PRIMARY_ROLES, ...roles.map((r) => r.key).filter((k) => !PRIMARY_ROLES.includes(k))]
    : PRIMARY_ROLES;

  const toggleRole = async (u, roleKey) => {
    const has = (u.roles || []).includes(roleKey);
    const next = has ? u.roles.filter((x) => x !== roleKey) : [...(u.roles || []), roleKey];
    try {
      const r = await api.put(`/users/${u.user_id}/roles`, { roles: next });
      toast.success("Roles updated");
      setUsers((prev) => prev.map((x) => (
        x.user_id === u.user_id
          ? { ...x, roles: r.data.roles, sod_conflicts: r.data.sod_conflicts }
          : x
      )));
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not update roles");
    }
  };

  const toggleSignatory = async (u) => {
    try {
      const r = await api.put(`/users/${u.user_id}`, { is_signatory: !u.is_signatory });
      setUsers((prev) => prev.map((x) => (x.user_id === u.user_id ? { ...x, ...r.data.user } : x)));
      toast.success(r.data.user.is_signatory ? "Marked signatory" : "Signatory removed");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not update");
    }
  };

  const toggleActive = async (u) => {
    try {
      const r = await api.put(`/users/${u.user_id}`, { is_active: !u.is_active });
      setUsers((prev) => prev.map((x) => (x.user_id === u.user_id ? { ...x, ...r.data.user } : x)));
      toast.success(r.data.user.is_active ? "User activated" : "User deactivated");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not update");
    }
  };

  const createUser = async () => {
    if (!form.name.trim() || !form.login_id.trim()) {
      toast.error("Name and login ID required");
      return;
    }
    setBusy(true);
    try {
      await api.post("/users", form);
      toast.success(`Created ${form.login_id}`);
      setCreateOpen(false);
      setForm({
        name: "",
        designation: "",
        login_id: "",
        password: "one10",
        is_signatory: false,
        roles: ["committee_member"],
      });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not create user");
    } finally {
      setBusy(false);
    }
  };

  const setPassword = async () => {
    if (!pwOpen) return;
    if ((newPassword || "").length < 4) {
      toast.error("Password must be at least 4 characters");
      return;
    }
    setBusy(true);
    try {
      await api.post(`/users/${pwOpen.user_id}/password`, { password: newPassword });
      toast.success(`Password set for ${pwOpen.login_id || pwOpen.name}`);
      setPwOpen(null);
      setNewPassword("");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not set password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="admin-portal-page" className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 flex items-center gap-2 font-display text-4xl">
            <ShieldCheck className="h-8 w-8 text-vermilion-500" /> Admin Portal
          </h1>
          <p className="text-sm text-brown-800/50">
            Platform IAM — committee members, login IDs, roles, signatory flags and passwords.
            Only visible to system admin.
          </p>
        </div>
        <Button variant="admin" size="sm" onClick={() => setCreateOpen(true)} data-testid="admin-create-user-btn">
          <Plus className="h-4 w-4" /> Add member
        </Button>
      </div>

      <Card><CardBody>
        {loading ? (
          <Spinner className="text-vermilion-500" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Login ID</TH>
                  <TH>Designation</TH>
                  <TH>Signatory</TH>
                  <TH>Roles</TH>
                  <TH>Status</TH>
                  <TH>Actions</TH>
                </TR>
              </THead>
              <tbody>
                {users.map((u) => (
                  <TR key={u.user_id} data-testid={`iam-row-${u.login_id || u.user_id}`}>
                    <TD className="font-medium">{u.name}</TD>
                    <TD className="font-mono text-sm">{u.login_id || "—"}</TD>
                    <TD>{u.designation || "—"}</TD>
                    <TD>
                      <button
                        type="button"
                        onClick={() => toggleSignatory(u)}
                        className={`rounded-md px-2 py-1 text-xs font-semibold ${
                          u.is_signatory
                            ? "bg-emerald-50 text-emerald-800"
                            : "bg-brown-800/5 text-brown-800/50"
                        }`}
                        data-testid={`iam-signatory-${u.login_id}`}
                      >
                        {u.is_signatory ? "Yes" : "No"}
                      </button>
                    </TD>
                    <TD>
                      <div className="flex max-w-md flex-wrap gap-1">
                        {roleKeys.filter((k) => ["system_admin", "convenor", "treasurer", "collector", "committee_member", "auditor", "coordinator"].includes(k) || (u.roles || []).includes(k)).map((rk) => {
                          const on = (u.roles || []).includes(rk);
                          return (
                            <button
                              key={rk}
                              type="button"
                              onClick={() => toggleRole(u, rk)}
                              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                on ? "bg-vermilion-500/15 text-vermilion-700" : "bg-brown-800/5 text-brown-800/40"
                              }`}
                            >
                              {rk}
                            </button>
                          );
                        })}
                      </div>
                      {(u.sod_conflicts || []).length > 0 && (
                        <div className="mt-1 text-[10px] text-amber-700">
                          SoD: {(u.sod_conflicts || []).map((c) => (
                            typeof c === "string" ? c : (c.description || `${c.permission_a} + ${c.permission_b}`)
                          )).join("; ")}
                        </div>
                      )}
                    </TD>
                    <TD>
                      <StatusBadge status={u.is_active === false ? "inactive" : "active"} />
                    </TD>
                    <TD>
                      <div className="flex gap-1">
                        <Button
                          variant="subtle"
                          size="sm"
                          title="Set / reset login password"
                          aria-label={`Set password for ${u.login_id || u.name}`}
                          onClick={() => { setPwOpen(u); setNewPassword(""); }}
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="subtle"
                          size="sm"
                          title={u.is_active === false ? "Activate this login" : "Deactivate this login (blocks sign-in)"}
                          aria-label={u.is_active === false ? "Activate user" : "Deactivate user"}
                          onClick={() => toggleActive(u)}
                        >
                          {u.is_active === false ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </CardBody></Card>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add committee member"
        footer={(
          <>
            <Button variant="subtle" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="admin" onClick={createUser} disabled={busy} data-testid="admin-create-submit">
              {busy ? "Saving…" : "Create"}
            </Button>
          </>
        )}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="iam-create-name" />
          </div>
          <div>
            <Label>Designation</Label>
            <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
          </div>
          <div>
            <Label>Login ID</Label>
            <Input
              value={form.login_id}
              onChange={(e) => setForm({ ...form, login_id: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "") })}
              data-testid="iam-create-login"
            />
          </div>
          <div>
            <Label>Password</Label>
            <Input
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              data-testid="iam-create-password"
            />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={!!form.is_signatory}
              onChange={(e) => setForm({ ...form, is_signatory: e.target.checked })}
            />
            Bank / receipt signatory
          </label>
        </div>
      </Dialog>

      <Dialog
        open={!!pwOpen}
        onClose={() => setPwOpen(null)}
        title={`Set password — ${pwOpen?.login_id || ""}`}
        footer={(
          <>
            <Button variant="subtle" onClick={() => setPwOpen(null)}>Cancel</Button>
            <Button variant="admin" onClick={setPassword} disabled={busy} data-testid="iam-password-submit">
              {busy ? "Saving…" : "Update password"}
            </Button>
          </>
        )}
      >
        <Label>New password</Label>
        <Input
          type="text"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          data-testid="iam-password-input"
        />
      </Dialog>
    </div>
  );
}
