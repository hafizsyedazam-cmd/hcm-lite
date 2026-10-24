"use client";
import { useState } from "react";
import { toast } from "sonner";
import { IconDownload, IconEdit, IconMail, IconMapPin, IconPhone } from "@tabler/icons-react";
import { useAuth } from "@/components/AuthProvider";
import { EmployeeForm, type EmployeeInput } from "@/components/employees/EmployeeForm";
import { AttendanceCalendar } from "@/components/attendance/AttendanceCalendar";
import { Avatar, Card, EmptyState, ErrorState, Modal, PageHeader, PageLoading, StatusBadge, money } from "@/components/ui";
import { api, download, errorMessage, useApi } from "@/lib/client/api";
import { prettyDate, prettyMonth } from "@/lib/shared/dates";
import type { Department, Designation, Employee, LeaveBalance, LeaveRequest, Payslip } from "@/lib/shared/types";

type View = Employee & {
  departmentName: string;
  designationName: string;
  salary?: { basic: number; hra: number; medical: number; gross: number };
  loginActive: boolean;
  payslips: Payslip[];
};

export function Employee360({ id }: { id: string }) {
  const { me } = useAuth();
  const { data: e, error, loading, reload } = useApi<View>(`/employees/${id}`);
  const { data: balances } = useApi<LeaveBalance[]>(`/leave/balance?employeeId=${id}`);
  const { data: leaves } = useApi<LeaveRequest[]>(`/leave?employeeId=${id}`);
  const { data: departments } = useApi<Department[]>("/org/departments");
  const { data: designations } = useApi<Designation[]>("/org/designations");
  const [form, setForm] = useState<EmployeeInput | null>(null);
  const [saving, setSaving] = useState(false);

  if (loading && !e) return <PageLoading />;
  if (error || !e) return <div className="card"><ErrorState message={error ?? "Not found"} onRetry={reload} /></div>;

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const { code: _c, email: _e, ...payload } = form;
      void _c;
      void _e;
      await api(`/employees/${id}`, { method: "PUT", body: payload });
      toast.success("Employee updated");
      setForm(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const edit = () =>
    setForm({
      code: e.code,
      name: e.name,
      email: e.email,
      phone: e.phone,
      address: e.address,
      gender: e.gender,
      departmentId: e.departmentId,
      designationId: e.designationId,
      joinDate: e.joinDate,
      status: e.status,
      basic: e.basic,
      exitDate: e.exitDate,
    });

  return (
    <>
      <PageHeader
        title="Employee 360"
        crumbs={["People", "Employees", e.name]}
        actions={
          me?.role === "hr" && (
            <button className="btn btn-primary" onClick={edit}>
              <IconEdit size={16} /> Edit details & salary
            </button>
          )
        }
      />
      <div className="row">
        <div className="col-xl-4">
          <div className="card">
            <div className="card-body text-center">
              <Avatar name={e.name} size="xl" />
              <h4 className="mt-3 mb-1">{e.name}</h4>
              <div className="fs-13 mb-2">
                {e.designationName} · {e.departmentName}
              </div>
              <div className="d-flex justify-content-center gap-2 mb-3">
                <span className="badge-soft s-primary no-dot">{e.code}</span>
                <StatusBadge status={e.status} />
                {!e.loginActive && <StatusBadge status="inactive" label="Login off" />}
              </div>
              <div className="text-start fs-13 d-flex flex-column gap-2">
                <div className="d-flex gap-2 align-items-center"><IconMail size={16} /> {e.email}</div>
                <div className="d-flex gap-2 align-items-center"><IconPhone size={16} /> {e.phone || "—"}</div>
                <div className="d-flex gap-2 align-items-center"><IconMapPin size={16} /> {e.address || "—"}</div>
              </div>
              <hr />
              <div className="row text-start fs-13 g-2">
                <div className="col-6">Joined<div className="text-body-strong">{prettyDate(e.joinDate)}</div></div>
                <div className="col-6">Gender<div className="text-body-strong text-capitalize">{e.gender}</div></div>
                {e.exitDate && <div className="col-6">Exit date<div className="text-body-strong">{prettyDate(e.exitDate)}</div></div>}
              </div>
            </div>
          </div>
          {e.salary && (
            <Card title="Salary structure">
              {[
                ["Basic", e.salary.basic],
                ["House rent (40%)", e.salary.hra],
                ["Medical (10%)", e.salary.medical],
              ].map(([k, v]) => (
                <div className="d-flex justify-content-between fs-13 py-1" key={k as string}>
                  <span>{k}</span>
                  <span className="text-body-strong">{money(v as number)}</span>
                </div>
              ))}
              <hr />
              <div className="d-flex justify-content-between">
                <strong className="text-heading">Gross</strong>
                <strong className="text-primary">{money(e.salary.gross)}</strong>
              </div>
            </Card>
          )}
          <Card title="Leave balance">
            {!balances?.length && <EmptyState title="No leave types" />}
            {balances?.map((b) => (
              <div className="mb-3" key={b.typeId}>
                <div className="d-flex justify-content-between fs-13 mb-1">
                  <span className="text-body-strong">{b.name}</span>
                  <span>{b.quota == null ? `${b.used} used` : `${b.remaining}/${b.quota} left`}</span>
                </div>
                {b.quota != null && (
                  <div className="progress">
                    <div className="progress-bar" style={{ width: `${b.quota ? Math.min(100, (b.used / b.quota) * 100) : 0}%` }} />
                  </div>
                )}
              </div>
            ))}
          </Card>
        </div>
        <div className="col-xl-8">
          <AttendanceCalendar employeeId={id} />
          <Card title="Leave history" bodyClass="p-0">
            {!leaves?.length ? (
              <EmptyState title="No leave requests" />
            ) : (
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Dates</th>
                      <th>Days</th>
                      <th>Reason</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaves.map((l) => (
                      <tr key={l.id}>
                        <td className="t-strong">{l.typeName}</td>
                        <td>{prettyDate(l.start)} – {prettyDate(l.end)}</td>
                        <td>{l.days}</td>
                        <td>{l.reason}</td>
                        <td><StatusBadge status={l.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <Card title="Payslips" bodyClass="p-0">
            {!e.payslips.length ? (
              <EmptyState title="No payslips yet" />
            ) : (
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Gross</th>
                      <th>Deductions</th>
                      <th>Tax</th>
                      <th>Net</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {e.payslips.map((p) => (
                      <tr key={p.id}>
                        <td className="t-strong">{prettyMonth(p.month)}</td>
                        <td>{money(p.earnedGross)}</td>
                        <td>{money(p.deduction)}</td>
                        <td>{money(p.tax)}</td>
                        <td className="t-strong">{money(p.net)}</td>
                        <td><StatusBadge status={p.runStatus} /></td>
                        <td className="text-end">
                          <button className="btn btn-outline-light btn-sm" onClick={() => download(`/payslips/${p.id}/pdf`, `payslip-${p.month}-${e.code}.pdf`).catch((err) => toast.error(errorMessage(err)))} aria-label="Download payslip">
                            <IconDownload size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>

      <Modal
        open={!!form}
        size="lg"
        title={`Edit ${e.name}`}
        onClose={() => setForm(null)}
        footer={
          <>
            <button className="btn btn-outline-light" onClick={() => setForm(null)}>Cancel</button>
            <button className="btn btn-primary" form="edit-form" disabled={saving}>{saving ? "Saving..." : "Save changes"}</button>
          </>
        }
      >
        {form && (
          <form id="edit-form" onSubmit={save}>
            <EmployeeForm value={form} onChange={setForm} departments={departments ?? []} designations={designations ?? []} editing />
          </form>
        )}
      </Modal>
    </>
  );
}
