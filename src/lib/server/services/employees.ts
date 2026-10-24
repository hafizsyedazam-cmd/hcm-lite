import "server-only";
import { z } from "zod";
import { adminAuth, db, nowIso, rows } from "../firebase-admin";
import { conflict, forbidden, notFound, unprocessable } from "../http";
import { assertOwnOrStaff, createLogin, tempPassword, type Actor } from "../auth";
import { audit } from "./comms";
import { listDepartments, listDesignations } from "./org";
import { isIsoDate } from "@/lib/shared/dates";
import { salaryBreakdown } from "@/lib/shared/rules";
import type { Department, Designation, Employee, Payslip, UserDoc } from "@/lib/shared/types";

const col = () => db().collection("employees");

export const employeeSchema = z.object({
  code: z.string().trim().max(20).optional().default(""),
  name: z.string().trim().min(2).max(80),
  email: z.email().transform((e) => e.toLowerCase()),
  phone: z.string().trim().max(30).optional().default(""),
  address: z.string().trim().max(200).optional().default(""),
  gender: z.enum(["male", "female", "other"]),
  departmentId: z.string().min(1, "department is required"),
  designationId: z.string().nullable().optional().default(null),
  joinDate: z.string().refine(isIsoDate, "must be an ISO date (YYYY-MM-DD)"),
  status: z.enum(["probation", "active"]).default("active"),
  basic: z.number().positive("salary must be greater than 0"),
});

export const employeeUpdateSchema = employeeSchema.omit({ email: true, code: true }).extend({
  status: z.enum(["probation", "active", "exited"]),
  exitDate: z.string().refine(isIsoDate, "must be an ISO date").nullable().optional().default(null),
});

export const selfUpdateSchema = z.object({
  phone: z.string().trim().max(30),
  address: z.string().trim().max(200),
});

export async function allEmployees(): Promise<Employee[]> {
  return rows<Employee>(await col().get());
}

export async function getEmployee(id: string): Promise<Employee> {
  const snap = await col().doc(id).get();
  if (!snap.exists) throw notFound("Employee not found");
  return { id: snap.id, ...snap.data() } as Employee;
}

/** Employees never see salary fields of anyone; staff see everything. */
export function publicEmployee(e: Employee, actor: Actor) {
  if (actor.role !== "employee") return { ...e, salary: salaryBreakdown(e.basic) };
  if (actor.employeeId === e.id) return { ...e, salary: salaryBreakdown(e.basic) };
  const { basic: _basic, ...rest } = e;
  void _basic;
  return rest;
}

export interface EmployeeQuery {
  q?: string;
  departmentId?: string;
  designationId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

/** Server-side search, filters and paging. */
export async function searchEmployees(actor: Actor, query: EmployeeQuery) {
  if (actor.role === "employee") throw forbidden();
  const [list, departments, designations] = await Promise.all([allEmployees(), listDepartments(), listDesignations()]);
  const q = query.q?.trim().toLowerCase();
  let filtered = list.filter((e) => {
    if (query.departmentId && e.departmentId !== query.departmentId) return false;
    if (query.designationId && e.designationId !== query.designationId) return false;
    if (query.status && query.status !== "all" && e.status !== query.status) return false;
    if (!query.status && e.status === "exited") return false;
    if (q && ![e.name, e.email, e.code, e.phone].some((v) => v?.toLowerCase().includes(q))) return false;
    return true;
  });
  filtered = filtered.sort((a, b) => a.code.localeCompare(b.code));
  const pageSize = Math.min(Math.max(query.pageSize ?? 10, 1), 100);
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(query.page ?? 1, 1), pages);
  const items = filtered.slice((page - 1) * pageSize, page * pageSize).map((e) => decorate(e, departments, designations));
  return { items, total, page, pages, pageSize };
}

export function decorate(e: Employee, departments: Department[], designations: Designation[]) {
  return {
    ...e,
    departmentName: departments.find((d) => d.id === e.departmentId)?.name ?? "—",
    designationName: designations.find((d) => d.id === e.designationId)?.name ?? "—",
    gross: salaryBreakdown(e.basic).gross,
  };
}

async function nextCode(): Promise<string> {
  const ref = db().collection("counters").doc("employeeCode");
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const next = ((snap.data()?.value as number) ?? 0) + 1;
    tx.set(ref, { value: next });
    return `EMP-${String(next).padStart(3, "0")}`;
  });
}

async function validateRefs(input: { departmentId: string; designationId?: string | null }) {
  const [deps, desigs] = await Promise.all([listDepartments(), listDesignations()]);
  if (!deps.some((d) => d.id === input.departmentId)) throw unprocessable("departmentId: unknown department");
  if (input.designationId && !desigs.some((d) => d.id === input.designationId)) throw unprocessable("designationId: unknown designation");
}

/** HR registers an employee; this also creates their login with a temporary password. */
export async function registerEmployee(actor: Actor, raw: z.input<typeof employeeSchema>) {
  if (actor.role !== "hr") throw forbidden("Only HR can register employees");
  const input = employeeSchema.parse(raw);
  await validateRefs(input);
  const list = await allEmployees();
  if (list.some((e) => e.email === input.email)) throw conflict(`An employee with ${input.email} already exists`);
  const code = input.code || (await nextCode());
  if (list.some((e) => e.code.toLowerCase() === code.toLowerCase())) throw conflict(`Employee code ${code} is already used`);

  const ref = col().doc();
  const password = tempPassword();
  const login = await createLogin({ email: input.email, name: input.name, role: "employee", employeeId: ref.id, password, mustChangePassword: true });
  const employee: Omit<Employee, "id"> = {
    code,
    name: input.name,
    email: input.email,
    phone: input.phone,
    address: input.address,
    gender: input.gender,
    departmentId: input.departmentId,
    designationId: input.designationId ?? null,
    joinDate: input.joinDate,
    exitDate: null,
    status: input.status,
    basic: input.basic,
    uid: login.uid,
    createdAt: nowIso(),
  };
  await ref.set(employee);
  await audit(actor, "create", "employee", ref.id, null, employee);
  return { employee: { id: ref.id, ...employee }, tempPassword: password };
}

export async function updateEmployee(actor: Actor, id: string, raw: z.input<typeof employeeUpdateSchema>) {
  if (actor.role !== "hr") throw forbidden("Only HR can edit employee details");
  const input = employeeUpdateSchema.parse(raw);
  await validateRefs(input);
  const before = await getEmployee(id);
  if (input.status === "exited" && !input.exitDate) throw unprocessable("exitDate: required when the employee has exited");
  if (input.exitDate && input.exitDate < input.joinDate) throw unprocessable("exitDate: cannot be before the join date");
  const patch = { ...input, exitDate: input.status === "exited" ? input.exitDate : null };
  await col().doc(id).update(patch);
  // Leavers lose their login; rejoining restores it.
  const wasExited = before.status === "exited";
  if (input.status === "exited" && !wasExited) {
    await db().collection("users").doc(before.uid).update({ active: false });
    await adminAuth().updateUser(before.uid, { disabled: true });
  } else if (input.status !== "exited" && wasExited) {
    await db().collection("users").doc(before.uid).update({ active: true });
    await adminAuth().updateUser(before.uid, { disabled: false });
  }
  if (before.name !== input.name) await db().collection("users").doc(before.uid).update({ name: input.name });
  await audit(actor, before.basic !== input.basic ? "update_salary" : "update", "employee", id, before, patch);
  return { ...before, ...patch };
}

export async function updateSelf(actor: Actor, input: z.infer<typeof selfUpdateSchema>) {
  if (!actor.employeeId) throw forbidden("Only employees have a profile to edit");
  const before = await getEmployee(actor.employeeId);
  await col().doc(actor.employeeId).update(input);
  await audit(actor, "update_profile", "employee", actor.employeeId, { phone: before.phone, address: before.address }, input);
  return { ...before, ...input };
}

export async function viewEmployee(actor: Actor, id: string) {
  assertOwnOrStaff(actor, id);
  const [e, departments, designations] = await Promise.all([getEmployee(id), listDepartments(), listDesignations()]);
  const [userSnap, slipSnap] = await Promise.all([db().collection("users").doc(e.uid).get(), db().collection("payslips").where("employeeId", "==", id).get()]);
  const user = userSnap.data() as UserDoc | undefined;
  const payslips = rows<Payslip>(slipSnap)
    .filter((p) => actor.role !== "employee" || p.runStatus === "finalized")
    .sort((a, b) => b.month.localeCompare(a.month));
  return { ...decorate(e, departments, designations), ...publicEmployee(e, actor), loginActive: user?.active ?? false, payslips };
}

// ---------- CSV import / export ----------

export interface CsvRowError {
  row: number;
  field: string;
  reason: string;
}

const CSV_FIELDS = ["code", "name", "email", "phone", "gender", "department", "designation", "join_date", "status", "basic_salary"] as const;

/** Checks every row; returns row + field + reason for each problem. Nothing is written. */
export async function dryRunImport(actor: Actor, records: Record<string, string>[]) {
  if (actor.role !== "hr") throw forbidden();
  const [existing, departments, designations] = await Promise.all([allEmployees(), listDepartments(), listDesignations()]);
  const errors: CsvRowError[] = [];
  const valid: z.input<typeof employeeSchema>[] = [];
  const seenEmail = new Set(existing.map((e) => e.email.toLowerCase()));
  const seenCode = new Set(existing.map((e) => e.code.toLowerCase()));

  records.forEach((r, i) => {
    const row = i + 2; // header is row 1
    const rowErrors: CsvRowError[] = [];
    const get = (k: string) => (r[k] ?? "").trim();
    for (const f of ["name", "email", "gender", "department", "join_date", "basic_salary"]) {
      if (!get(f)) rowErrors.push({ row, field: f, reason: "required" });
    }
    const email = get("email").toLowerCase();
    if (email && !z.email().safeParse(email).success) rowErrors.push({ row, field: "email", reason: "not a valid email" });
    if (email && seenEmail.has(email)) rowErrors.push({ row, field: "email", reason: "already exists" });
    const code = get("code");
    if (code && seenCode.has(code.toLowerCase())) rowErrors.push({ row, field: "code", reason: "already exists" });
    const gender = get("gender").toLowerCase();
    if (gender && !["male", "female", "other"].includes(gender)) rowErrors.push({ row, field: "gender", reason: "use male, female or other" });
    const dep = departments.find((d) => d.name.toLowerCase() === get("department").toLowerCase());
    if (get("department") && !dep) rowErrors.push({ row, field: "department", reason: `unknown department "${get("department")}"` });
    const desig = get("designation") ? designations.find((d) => d.name.toLowerCase() === get("designation").toLowerCase()) : null;
    if (get("designation") && !desig) rowErrors.push({ row, field: "designation", reason: `unknown designation "${get("designation")}"` });
    if (get("join_date") && !isIsoDate(get("join_date"))) rowErrors.push({ row, field: "join_date", reason: "must be an ISO date (YYYY-MM-DD)" });
    const salary = Number(get("basic_salary"));
    if (get("basic_salary") && !(salary > 0)) rowErrors.push({ row, field: "basic_salary", reason: "must be a number greater than 0" });
    const status = get("status").toLowerCase() || "active";
    if (!["active", "probation"].includes(status)) rowErrors.push({ row, field: "status", reason: "use active or probation" });

    if (rowErrors.length) {
      errors.push(...rowErrors);
      return;
    }
    if (email) seenEmail.add(email);
    if (code) seenCode.add(code.toLowerCase());
    valid.push({
      code,
      name: get("name"),
      email,
      phone: get("phone"),
      address: "",
      gender: gender as "male" | "female" | "other",
      departmentId: dep!.id,
      designationId: desig?.id ?? null,
      joinDate: get("join_date"),
      status: status as "active" | "probation",
      basic: salary,
    });
  });
  return { total: records.length, validCount: valid.length, errors, valid };
}

export async function commitImport(actor: Actor, records: Record<string, string>[]) {
  const check = await dryRunImport(actor, records);
  if (check.errors.length) throw unprocessable("Fix the errors shown in the dry run before importing", check.errors);
  const created: { code: string; name: string; email: string; tempPassword: string }[] = [];
  for (const row of check.valid) {
    const { employee, tempPassword } = await registerEmployee(actor, row);
    created.push({ code: employee.code, name: employee.name, email: employee.email, tempPassword });
  }
  await audit(actor, "import", "employee", "csv", null, { count: created.length });
  return { created };
}

export async function exportCsv(actor: Actor) {
  if (actor.role === "employee") throw forbidden();
  const [list, departments, designations] = await Promise.all([allEmployees(), listDepartments(), listDesignations()]);
  const header = [...CSV_FIELDS, "exit_date"];
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = list
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((e) =>
      [
        e.code,
        e.name,
        e.email,
        e.phone,
        e.gender,
        departments.find((d) => d.id === e.departmentId)?.name ?? "",
        designations.find((d) => d.id === e.designationId)?.name ?? "",
        e.joinDate,
        e.status,
        e.basic,
        e.exitDate ?? "",
      ]
        .map(esc)
        .join(","),
    );
  return [header.join(","), ...lines].join("\n");
}

export const CSV_TEMPLATE = CSV_FIELDS.join(",") + "\n,Ali Raza,ali@example.com,03001234567,male,Engineering,Developer,2026-10-01,active,120000\n";
