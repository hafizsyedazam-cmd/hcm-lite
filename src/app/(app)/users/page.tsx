"use client";
import { useState } from "react";
import { toast } from "sonner";
import { IconKey, IconPlus, IconUserCheck, IconUserOff } from "@tabler/icons-react";
import { useAuth } from "@/components/AuthProvider";
import { CredentialsNotice } from "@/components/CredentialsNotice";
import { Avatar, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, RoleBadge, StatusBadge } from "@/components/ui";
import { api, errorMessage, useApi } from "@/lib/client/api";
import { prettyDate } from "@/lib/shared/dates";
import type { UserDoc } from "@/lib/shared/types";

export default function UsersPage() {
  const { me } = useAuth();
  const { data, error, loading, reload } = useApi<UserDoc[]>("/users");
  const [role, setRole] = useState("");
  const [form, setForm] = useState<{ name: string; email: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [creds, setCreds] = useState<{ name: string; email: string; password: string } | null>(null);

  const createHr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const res = await api<{ user: UserDoc; tempPassword: string }>("/users", { body: form });
      setForm(null);
      setCreds({ name: res.user.name, email: res.user.email, password: res.tempPassword });
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (u: UserDoc) => {
    if (!confirm(`${u.active ? "Deactivate" : "Activate"} ${u.name}'s login?`)) return;
    try {
      await api(`/users/${u.uid}`, { method: "PATCH", body: { active: !u.active } });
      toast.success(u.active ? "Login deactivated" : "Login activated");
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const reset = async (u: UserDoc) => {
    if (!confirm(`Reset ${u.name}'s password? They will get a new temporary password.`)) return;
    try {
      const res = await api<{ tempPassword: string }>(`/users/${u.uid}/reset`, { body: {} });
      setCreds({ name: u.name, email: u.email, password: res.tempPassword });
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const list = data?.filter((u) => !role || u.role === role) ?? [];

  return (
    <>
      <PageHeader
        title="Users & Logins"
        crumbs={["Organization", "Users & Logins"]}
        actions={
          <button className="btn btn-primary" onClick={() => setForm({ name: "", email: "" })}>
            <IconPlus size={16} /> Create HR login
          </button>
        }
      />
      <div className="card">
        <div className="card-header">
          <h5>All logins</h5>
          <select className="form-select" style={{ width: 160 }} value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
            <option value="">All roles</option>
            <option value="admin">Admin</option>
            <option value="hr">HR</option>
            <option value="employee">Employee</option>
          </select>
        </div>
        {loading && !data ? (
          <div className="card-body"><Loading /></div>
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !list.length ? (
          <EmptyState title="No logins" />
        ) : (
          <div className="table-responsive">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((u) => (
                  <tr key={u.uid}>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <Avatar name={u.name} />
                        <div>
                          <div className="t-strong">{u.name}</div>
                          <div className="fs-12">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><RoleBadge role={u.role} /></td>
                    <td>{prettyDate(u.createdAt)}</td>
                    <td>
                      <StatusBadge status={u.active ? "active" : "inactive"} />
                      {u.mustChangePassword && <div className="fs-12 text-warning">Temporary password</div>}
                    </td>
                    <td className="text-end text-nowrap">
                      {u.role !== "admin" && u.uid !== me?.uid && (
                        <>
                          <button className="btn btn-outline-light btn-sm me-1" onClick={() => reset(u)} title="Reset password">
                            <IconKey size={15} />
                          </button>
                          <button className={`btn btn-sm ${u.active ? "btn-soft-danger" : "btn-soft-success"}`} onClick={() => toggle(u)} title={u.active ? "Deactivate" : "Activate"}>
                            {u.active ? <IconUserOff size={15} /> : <IconUserCheck size={15} />}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={!!form}
        title="Create HR login"
        onClose={() => setForm(null)}
        footer={
          <>
            <button className="btn btn-outline-light" onClick={() => setForm(null)}>Cancel</button>
            <button className="btn btn-primary" form="hr-form" disabled={saving}>{saving ? "Creating..." : "Create login"}</button>
          </>
        }
      >
        {form && (
          <form id="hr-form" onSubmit={createHr}>
            <Field label="Full name">
              <input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} autoFocus />
            </Field>
            <Field label="Email" hint="A temporary password is generated; they set their own on first sign-in.">
              <input type="email" className="form-control" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </Field>
          </form>
        )}
      </Modal>
      <CredentialsNotice data={creds} onClose={() => setCreds(null)} />
    </>
  );
}
