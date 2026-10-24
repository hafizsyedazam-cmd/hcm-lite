"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { IconDownload, IconEye, IconFileImport, IconPlus, IconSearch } from "@tabler/icons-react";
import { useAuth } from "@/components/AuthProvider";
import { CredentialsNotice } from "@/components/CredentialsNotice";
import { EmployeeForm, emptyEmployee, type EmployeeInput } from "@/components/employees/EmployeeForm";
import { Avatar, EmptyState, ErrorState, Loading, Modal, PageHeader, Pagination, StatusBadge, money } from "@/components/ui";
import { api, download, errorMessage, useApi } from "@/lib/client/api";
import { prettyDate } from "@/lib/shared/dates";
import type { Department, Designation, Employee } from "@/lib/shared/types";

type Row = Employee & { departmentName: string; designationName: string; gross: number };
interface Page {
  items: Row[];
  total: number;
  page: number;
  pages: number;
}

export default function EmployeesPage() {
  const { me } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [departmentId, setDepartmentId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<EmployeeInput | null>(params.get("new") ? emptyEmployee() : null);
  const [saving, setSaving] = useState(false);
  const [creds, setCreds] = useState<{ name: string; email: string; password: string } | null>(null);

  const query = new URLSearchParams({ q: search, departmentId, status, page: String(page), pageSize: "10" }).toString();
  const { data, error, loading, reload } = useApi<Page>(`/employees?${query}`);
  const { data: departments } = useApi<Department[]>("/org/departments");
  const { data: designations } = useApi<Designation[]>("/org/designations");
  const isHr = me?.role === "hr";

  useEffect(() => {
    const fromHeader = params.get("q") ?? "";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with the header search box
    setQ(fromHeader);
    setSearch(fromHeader);
    setPage(1);
  }, [params]);

  const register = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const { exitDate: _exitDate, ...payload } = form;
      void _exitDate;
      const res = await api<{ employee: Employee; tempPassword: string }>("/employees", { body: payload });
      toast.success(`${res.employee.name} registered as ${res.employee.code}`);
      setForm(null);
      setCreds({ name: res.employee.name, email: res.employee.email, password: res.tempPassword });
      router.replace("/employees");
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Employees"
        crumbs={["People", "Employees"]}
        actions={
          <>
            <button className="btn btn-outline-light" onClick={() => download("/employees/export", "employees.csv").catch((e) => toast.error(errorMessage(e)))}>
              <IconDownload size={16} /> Export CSV
            </button>
            {isHr && (
              <>
                <Link href="/employees/import" className="btn btn-outline-light">
                  <IconFileImport size={16} /> Import CSV
                </Link>
                <button className="btn btn-primary" onClick={() => setForm(emptyEmployee())} disabled={!departments?.length}>
                  <IconPlus size={16} /> Register employee
                </button>
              </>
            )}
          </>
        }
      />

      {isHr && departments && departments.length === 0 && (
        <div className="alert alert-warning fs-13">Admin needs to add at least one department (Organization Setup) before you can register employees.</div>
      )}

      <div className="card">
        <div className="card-header">
          <h5>Employee directory</h5>
          <form
            className="d-flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(q);
              setPage(1);
            }}
          >
            <div className="position-relative">
              <IconSearch size={15} className="position-absolute top-50 translate-middle-y ms-2 text-muted" />
              <input className="form-control ps-4" style={{ minWidth: 200 }} placeholder="Name, code, email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
            </div>
            <select className="form-select" style={{ width: 170 }} value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setPage(1); }} aria-label="Department">
              <option value="">All departments</option>
              {departments?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <select className="form-select" style={{ width: 140 }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status">
              <option value="">Current staff</option>
              <option value="active">Active</option>
              <option value="probation">Probation</option>
              <option value="exited">Exited</option>
              <option value="all">All</option>
            </select>
            <button className="btn btn-outline-light">Search</button>
          </form>
        </div>
        {loading && !data ? (
          <div className="card-body">
            <Loading rows={6} />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : data && data.items.length === 0 ? (
          <EmptyState
            title={search || departmentId || status ? "No employees match these filters" : "No employees yet"}
            text={isHr ? "Register your first employee; this also creates their login." : "HR registers employees."}
            action={isHr && departments?.length ? <button className="btn btn-primary btn-sm" onClick={() => setForm(emptyEmployee())}>Register employee</button> : undefined}
          />
        ) : (
          data && (
            <>
              <div className="table-responsive">
                <table className="table table-hover">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Name</th>
                      <th>Department</th>
                      <th>Designation</th>
                      <th>Joined</th>
                      <th>Gross salary</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((e) => (
                      <tr key={e.id}>
                        <td className="t-strong">{e.code}</td>
                        <td>
                          <div className="d-flex align-items-center gap-2">
                            <Avatar name={e.name} />
                            <div>
                              <Link href={`/employees/${e.id}`} className="t-strong text-body-strong">
                                {e.name}
                              </Link>
                              <div className="fs-12">{e.email}</div>
                            </div>
                          </div>
                        </td>
                        <td>{e.departmentName}</td>
                        <td>{e.designationName}</td>
                        <td>{prettyDate(e.joinDate)}</td>
                        <td>{money(e.gross)}</td>
                        <td>
                          <StatusBadge status={e.status} />
                        </td>
                        <td className="text-end">
                          <Link href={`/employees/${e.id}`} className="btn btn-outline-light btn-sm" aria-label={`View ${e.name}`}>
                            <IconEye size={15} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
            </>
          )
        )}
      </div>

      <Modal
        open={!!form}
        size="lg"
        title="Register employee"
        onClose={() => setForm(null)}
        footer={
          <>
            <button className="btn btn-outline-light" onClick={() => setForm(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" form="register-form" disabled={saving}>
              {saving ? "Registering..." : "Register & create login"}
            </button>
          </>
        }
      >
        {form && (
          <form id="register-form" onSubmit={register}>
            <EmployeeForm value={form} onChange={setForm} departments={departments ?? []} designations={designations ?? []} />
          </form>
        )}
      </Modal>
      <CredentialsNotice data={creds} onClose={() => setCreds(null)} />
    </>
  );
}
