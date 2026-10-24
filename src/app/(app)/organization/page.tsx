"use client";
import { useState } from "react";
import { toast } from "sonner";
import { IconEdit, IconPlus, IconTrash, IconWand } from "@tabler/icons-react";
import { useAuth } from "@/components/AuthProvider";
import { EmptyState, ErrorState, Field, Loading, Modal, PageHeader } from "@/components/ui";
import { api, errorMessage, useApi } from "@/lib/client/api";
import { prettyDate } from "@/lib/shared/dates";
import type { Department, Designation, Holiday, LeaveType } from "@/lib/shared/types";

type Tab = "departments" | "designations" | "leave-types" | "holidays";
const TABS: [Tab, string][] = [
  ["departments", "Departments"],
  ["designations", "Designations"],
  ["leave-types", "Leave types & quotas"],
  ["holidays", "Public holidays"],
];

export default function OrganizationPage() {
  const { me } = useAuth();
  const [tab, setTab] = useState<Tab>("departments");
  const canEdit = me?.role === "admin";
  return (
    <>
      <PageHeader title="Organization Setup" crumbs={["Organization", "Setup"]} />
      {!canEdit && <div className="alert alert-info fs-13">Only Admin can change the organization setup. You can view it here.</div>}
      <div className="nav-tabs-c">
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "departments" && <Departments canEdit={canEdit} />}
      {tab === "designations" && <Designations canEdit={canEdit} />}
      {tab === "leave-types" && <LeaveTypes canEdit={canEdit} />}
      {tab === "holidays" && <Holidays canEdit={canEdit} />}
    </>
  );
}

/** Shared create / edit / delete plumbing for the four lookup lists. */
function useCrud<T extends { id: string }>(kind: Tab) {
  const list = useApi<T[]>(`/org/${kind}`);
  const [saving, setSaving] = useState(false);
  const save = async (id: string | null, body: Record<string, unknown>) => {
    setSaving(true);
    try {
      await api(id ? `/org/${kind}/${id}` : `/org/${kind}`, { method: id ? "PUT" : "POST", body });
      toast.success(id ? "Saved" : "Added");
      list.reload();
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    } finally {
      setSaving(false);
    }
  };
  const remove = async (id: string, label: string) => {
    if (!confirm(`Delete ${label}?`)) return;
    try {
      await api(`/org/${kind}/${id}`, { method: "DELETE" });
      toast.success("Deleted");
      list.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return { ...list, saving, save, remove };
}

function ListCard<T extends { id: string }>({
  title,
  crud,
  canEdit,
  onAdd,
  onEdit,
  headers,
  row,
  extra,
}: {
  title: string;
  crud: ReturnType<typeof useCrud<T>>;
  canEdit: boolean;
  onAdd: () => void;
  onEdit: (item: T) => void;
  headers: string[];
  row: (item: T) => React.ReactNode[];
  extra?: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="card-header">
        <h5>{title}</h5>
        {canEdit && (
          <div className="d-flex gap-2">
            {extra}
            <button className="btn btn-primary btn-sm" onClick={onAdd}>
              <IconPlus size={15} /> Add
            </button>
          </div>
        )}
      </div>
      {crud.loading && !crud.data ? (
        <div className="card-body"><Loading /></div>
      ) : crud.error ? (
        <ErrorState message={crud.error} onRetry={crud.reload} />
      ) : !crud.data?.length ? (
        <EmptyState title={`No ${title.toLowerCase()} yet`} />
      ) : (
        <div className="table-responsive">
          <table className="table table-hover">
            <thead>
              <tr>
                {headers.map((h) => (
                  <th key={h}>{h}</th>
                ))}
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {crud.data.map((item) => (
                <tr key={item.id}>
                  {row(item).map((cell, i) => (
                    <td key={i} className={i === 0 ? "t-strong" : ""}>
                      {cell}
                    </td>
                  ))}
                  {canEdit && <RowActions item={item} />}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  function RowActions({ item }: { item: T }) {
    return (
      <td className="text-end text-nowrap">
        <button className="btn btn-outline-light btn-sm me-1" onClick={() => onEdit(item)} aria-label="Edit">
          <IconEdit size={15} />
        </button>
        <button className="btn btn-soft-danger btn-sm" onClick={() => crud.remove(item.id, String((item as Record<string, unknown>).name ?? "this item"))} aria-label="Delete">
          <IconTrash size={15} />
        </button>
      </td>
    );
  }
}

function useEditor<F>() {
  const [state, setState] = useState<{ id: string | null; form: F } | null>(null);
  return { state, open: (id: string | null, form: F) => setState({ id, form }), close: () => setState(null), set: (form: F) => setState((s) => (s ? { ...s, form } : s)) };
}

function EditorModal({ title, open, onClose, onSave, saving, children }: { title: string; open: boolean; onClose: () => void; onSave: () => void; saving: boolean; children: React.ReactNode }) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline-light" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" form="org-form" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
        </>
      }
    >
      <form
        id="org-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        {children}
      </form>
    </Modal>
  );
}

function Departments({ canEdit }: { canEdit: boolean }) {
  const crud = useCrud<Department>("departments");
  const ed = useEditor<{ name: string }>();
  const onEdit = (d: Department) => ed.open(d.id, { name: d.name });
  return (
    <>
      <ListCard title="Departments" crud={crud} canEdit={canEdit} onEdit={onEdit} onAdd={() => ed.open(null, { name: "" })} headers={["Name", "Created"]} row={(d) => [d.name, prettyDate(d.createdAt)]} />
      <EditorModal title={ed.state?.id ? "Edit department" : "Add department"} open={!!ed.state} onClose={ed.close} saving={crud.saving} onSave={async () => ed.state && (await crud.save(ed.state.id, ed.state.form)) && ed.close()}>
        {ed.state && (
          <Field label="Department name">
            <input className="form-control" value={ed.state.form.name} onChange={(e) => ed.set({ name: e.target.value })} required minLength={2} autoFocus />
          </Field>
        )}
      </EditorModal>
    </>
  );
}

function Designations({ canEdit }: { canEdit: boolean }) {
  const crud = useCrud<Designation>("designations");
  const { data: departments } = useApi<Department[]>("/org/departments");
  const ed = useEditor<{ name: string; departmentId: string | null }>();
  const onEdit = (d: Designation) => ed.open(d.id, { name: d.name, departmentId: d.departmentId });
  return (
    <>
      <ListCard
        title="Designations"
        crud={crud}
        canEdit={canEdit}
        onEdit={onEdit}
        onAdd={() => ed.open(null, { name: "", departmentId: null })}
        headers={["Name", "Department"]}
        row={(d) => [d.name, departments?.find((x) => x.id === d.departmentId)?.name ?? "Any department"]}
      />
      <EditorModal title={ed.state?.id ? "Edit designation" : "Add designation"} open={!!ed.state} onClose={ed.close} saving={crud.saving} onSave={async () => ed.state && (await crud.save(ed.state.id, ed.state.form)) && ed.close()}>
        {ed.state && (
          <>
            <Field label="Designation">
              <input className="form-control" value={ed.state.form.name} onChange={(e) => ed.set({ ...ed.state!.form, name: e.target.value })} required minLength={2} autoFocus />
            </Field>
            <Field label="Department (optional)">
              <select className="form-select" value={ed.state.form.departmentId ?? ""} onChange={(e) => ed.set({ ...ed.state!.form, departmentId: e.target.value || null })}>
                <option value="">Any department</option>
                {departments?.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </Field>
          </>
        )}
      </EditorModal>
    </>
  );
}

function LeaveTypes({ canEdit }: { canEdit: boolean }) {
  const crud = useCrud<LeaveType>("leave-types");
  const ed = useEditor<{ name: string; code: string; quota: number | null; paid: boolean }>();
  const onEdit = (t: LeaveType) => ed.open(t.id, { name: t.name, code: t.code, quota: t.quota, paid: t.paid });
  const addStandard = async () => {
    try {
      const created = await api<unknown[]>("/org/leave-types-standard", { body: {} });
      toast.success(created.length ? `Added ${created.length} leave types` : "Standard leave types already exist");
      crud.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <>
      <ListCard
        title="Leave types"
        crud={crud}
        canEdit={canEdit}
        onEdit={onEdit}
        onAdd={() => ed.open(null, { name: "", code: "", quota: 10, paid: true })}
        extra={
          <button className="btn btn-outline-light btn-sm" onClick={addStandard} title="Annual 14, sick 8, casual 10, unpaid unlimited">
            <IconWand size={15} /> Add standard types
          </button>
        }
        headers={["Name", "Code", "Yearly quota", "Paid"]}
        row={(t) => [t.name, t.code, t.quota == null ? "Unlimited" : `${t.quota} days`, t.paid ? "Yes" : "No (deducted)"]}
      />
      <EditorModal title={ed.state?.id ? "Edit leave type" : "Add leave type"} open={!!ed.state} onClose={ed.close} saving={crud.saving} onSave={async () => ed.state && (await crud.save(ed.state.id, ed.state.form)) && ed.close()}>
        {ed.state && (
          <div className="row">
            <Field label="Name" className="col-md-7">
              <input className="form-control" value={ed.state.form.name} onChange={(e) => ed.set({ ...ed.state!.form, name: e.target.value })} required autoFocus />
            </Field>
            <Field label="Code" className="col-md-5" hint="annual, sick, casual, unpaid...">
              <input className="form-control" value={ed.state.form.code} onChange={(e) => ed.set({ ...ed.state!.form, code: e.target.value.toLowerCase() })} required pattern="[a-z_]{3,20}" />
            </Field>
            <Field label="Yearly quota (days)" className="col-md-7">
              <input type="number" className="form-control" min={0} max={365} value={ed.state.form.quota ?? ""} disabled={ed.state.form.quota == null} onChange={(e) => ed.set({ ...ed.state!.form, quota: Number(e.target.value) })} />
              <div className="form-check mt-2">
                <input className="form-check-input" type="checkbox" id="unl" checked={ed.state.form.quota == null} onChange={(e) => ed.set({ ...ed.state!.form, quota: e.target.checked ? null : 10 })} />
                <label className="form-check-label fs-13" htmlFor="unl">Unlimited</label>
              </div>
            </Field>
            <Field label="Paid?" className="col-md-5">
              <select className="form-select" value={ed.state.form.paid ? "1" : "0"} onChange={(e) => ed.set({ ...ed.state!.form, paid: e.target.value === "1" })}>
                <option value="1">Paid</option>
                <option value="0">Unpaid (deducted)</option>
              </select>
            </Field>
          </div>
        )}
      </EditorModal>
    </>
  );
}

function Holidays({ canEdit }: { canEdit: boolean }) {
  const crud = useCrud<Holiday>("holidays");
  const ed = useEditor<{ name: string; date: string }>();
  const onEdit = (h: Holiday) => ed.open(h.id, { name: h.name, date: h.date });
  return (
    <>
      <ListCard title="Public holidays" crud={crud} canEdit={canEdit} onEdit={onEdit} onAdd={() => ed.open(null, { name: "", date: "" })} headers={["Holiday", "Date"]} row={(h) => [h.name, prettyDate(h.date)]} />
      <EditorModal title={ed.state?.id ? "Edit holiday" : "Add holiday"} open={!!ed.state} onClose={ed.close} saving={crud.saving} onSave={async () => ed.state && (await crud.save(ed.state.id, ed.state.form)) && ed.close()}>
        {ed.state && (
          <div className="row">
            <Field label="Holiday name" className="col-md-7">
              <input className="form-control" value={ed.state.form.name} onChange={(e) => ed.set({ ...ed.state!.form, name: e.target.value })} required autoFocus />
            </Field>
            <Field label="Date" className="col-md-5">
              <input type="date" className="form-control" value={ed.state.form.date} onChange={(e) => ed.set({ ...ed.state!.form, date: e.target.value })} required />
            </Field>
          </div>
        )}
      </EditorModal>
    </>
  );
}
