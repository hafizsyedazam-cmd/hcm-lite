"use client";
import { Field, money } from "../ui";
import { salaryBreakdown } from "@/lib/shared/rules";
import type { Department, Designation, Employee } from "@/lib/shared/types";

export type EmployeeInput = Pick<Employee, "name" | "email" | "phone" | "address" | "gender" | "departmentId" | "designationId" | "joinDate" | "basic"> & {
  code: string;
  status: Employee["status"];
  exitDate: string | null;
};

export function emptyEmployee(): EmployeeInput {
  return {
    code: "",
    name: "",
    email: "",
    phone: "",
    address: "",
    gender: "male",
    departmentId: "",
    designationId: null,
    joinDate: new Date().toLocaleDateString("en-CA"),
    status: "active",
    basic: 0,
    exitDate: null,
  };
}

/** Register / edit form. Email and code are fixed after registration. */
export function EmployeeForm({
  value,
  onChange,
  departments,
  designations,
  editing,
}: {
  value: EmployeeInput;
  onChange: (v: EmployeeInput) => void;
  departments: Department[];
  designations: Designation[];
  editing?: boolean;
}) {
  const set = <K extends keyof EmployeeInput>(k: K, v: EmployeeInput[K]) => onChange({ ...value, [k]: v });
  const salary = salaryBreakdown(value.basic || 0);
  const desigs = designations.filter((d) => !d.departmentId || d.departmentId === value.departmentId);

  return (
    <div className="row">
      <Field label="Full name" className="col-md-6">
        <input className="form-control" value={value.name} onChange={(e) => set("name", e.target.value)} required minLength={2} />
      </Field>
      <Field label="Email (login)" className="col-md-6" hint={editing ? "Email cannot be changed." : "Their login is created with this email."}>
        <input type="email" className="form-control" value={value.email} onChange={(e) => set("email", e.target.value)} required disabled={editing} />
      </Field>
      <Field label="Employee code" className="col-md-4" hint={editing ? undefined : "Leave empty to auto-generate (EMP-001)."}>
        <input className="form-control" value={value.code} onChange={(e) => set("code", e.target.value)} disabled={editing} maxLength={20} />
      </Field>
      <Field label="Phone" className="col-md-4">
        <input className="form-control" value={value.phone} onChange={(e) => set("phone", e.target.value)} maxLength={30} />
      </Field>
      <Field label="Gender" className="col-md-4">
        <select className="form-select" value={value.gender} onChange={(e) => set("gender", e.target.value as EmployeeInput["gender"])}>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </select>
      </Field>
      <Field label="Department" className="col-md-6">
        <select className="form-select" value={value.departmentId} onChange={(e) => onChange({ ...value, departmentId: e.target.value, designationId: null })} required>
          <option value="">Select department</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Designation" className="col-md-6">
        <select className="form-select" value={value.designationId ?? ""} onChange={(e) => set("designationId", e.target.value || null)}>
          <option value="">—</option>
          {desigs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Joining date" className="col-md-4">
        <input type="date" className="form-control" value={value.joinDate} onChange={(e) => set("joinDate", e.target.value)} required />
      </Field>
      <Field label="Status" className="col-md-4">
        <select className="form-select" value={value.status} onChange={(e) => set("status", e.target.value as EmployeeInput["status"])}>
          <option value="active">Active</option>
          <option value="probation">Probation</option>
          {editing && <option value="exited">Exited</option>}
        </select>
      </Field>
      {value.status === "exited" ? (
        <Field label="Exit date" className="col-md-4">
          <input type="date" className="form-control" value={value.exitDate ?? ""} onChange={(e) => set("exitDate", e.target.value || null)} required />
        </Field>
      ) : (
        <div className="col-md-4" />
      )}
      <Field label="Address" className="col-12">
        <input className="form-control" value={value.address} onChange={(e) => set("address", e.target.value)} maxLength={200} />
      </Field>
      <div className="col-12">
        <div className="p-3 rounded" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
          <div className="row align-items-end">
            <Field label="Basic salary (monthly)" className="col-md-4 mb-md-0">
              <input type="number" className="form-control" min={1} value={value.basic || ""} onChange={(e) => set("basic", Number(e.target.value))} required />
            </Field>
            <div className="col-md-8 fs-13">
              <div className="d-flex flex-wrap gap-3">
                <span>HRA 40%: <strong className="text-body-strong">{money(salary.hra)}</strong></span>
                <span>Medical 10%: <strong className="text-body-strong">{money(salary.medical)}</strong></span>
                <span>Gross (1.5×): <strong className="text-primary">{money(salary.gross)}</strong></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
