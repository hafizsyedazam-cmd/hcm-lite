import "server-only";
import { z } from "zod";
import { adminAuth, db, nowIso, rows } from "../firebase-admin";
import { ApiError, conflict, forbidden, notFound, unprocessable } from "../http";
import { createLogin, tempPassword, type Actor } from "../auth";
import { cached, invalidate } from "../cache";
import { audit } from "./comms";
import { DEFAULT_SETTINGS, DEFAULT_LEAVE_TYPES } from "@/lib/shared/rules";
import { isIsoDate } from "@/lib/shared/dates";
import type { CompanySettings, Department, Designation, Holiday, LeaveType, UserDoc } from "@/lib/shared/types";

const settingsRef = () => db().collection("settings").doc("company");

// ---------- First-run setup ----------

/** Always reads the database (used by first-run setup). */
export async function readSettings(): Promise<CompanySettings | null> {
  const snap = await settingsRef().get();
  return snap.exists ? { ...DEFAULT_SETTINGS, ...(snap.data() as Partial<CompanySettings>) } : null;
}

export function getSettings(): Promise<CompanySettings | null> {
  return cached("settings", readSettings);
}

export async function requireSettings(): Promise<CompanySettings> {
  const s = await getSettings();
  if (!s?.setupComplete) throw new ApiError(409, "The company has not been set up yet");
  return s;
}

export function envAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  return email && password ? { email, password } : null;
}

export const setupSchema = z.object({
  companyName: z.string().trim().min(2).max(80),
  adminName: z.string().trim().min(2).max(60),
  adminEmail: z.email().optional(),
  adminPassword: z.string().min(8, "must be at least 8 characters").optional(),
  timezone: z.string().optional(),
});

export async function runSetup(input: z.infer<typeof setupSchema>) {
  const existing = await readSettings();
  if (existing?.setupComplete) throw conflict("Setup is already complete");
  const fromEnv = envAdmin();
  const email = fromEnv?.email ?? input.adminEmail;
  const password = fromEnv?.password ?? input.adminPassword;
  if (!email || !password) throw unprocessable("Admin email and password are required");

  // Claim the settings document first so two setups can never race.
  const settings: CompanySettings = {
    ...DEFAULT_SETTINGS,
    companyName: input.companyName,
    timezone: input.timezone || DEFAULT_SETTINGS.timezone,
    setupComplete: false,
    createdAt: nowIso(),
  };
  try {
    await settingsRef().create(settings);
  } catch {
    const again = await readSettings();
    if (again?.setupComplete) throw conflict("Setup is already complete");
    await settingsRef().set(settings);
  }
  const admin = await createLogin({ email, name: input.adminName, role: "admin", employeeId: null, password, mustChangePassword: false });
  await settingsRef().update({ setupComplete: true });
  invalidate("settings");
  await audit({ uid: admin.uid, email, name: admin.name, role: "admin", employeeId: null }, "setup", "company", "company", null, {
    companyName: input.companyName,
    admin: email,
  });
  return { ok: true, email };
}

// ---------- Company settings (Admin) ----------

export const settingsSchema = z.object({
  companyName: z.string().trim().min(2).max(80),
  officeStart: z.string().regex(/^\d{2}:\d{2}$/),
  officeEnd: z.string().regex(/^\d{2}:\d{2}$/),
  graceMinutes: z.number().int().min(0).max(180),
  halfDayHours: z.number().min(1).max(12),
  weekend: z.array(z.number().int().min(0).max(6)).max(6),
  timezone: z.string().min(3),
  officeLat: z.number().min(-90).max(90).nullable(),
  officeLng: z.number().min(-180).max(180).nullable(),
  radiusM: z.number().int().min(20).max(5000),
  latePenalty: z.boolean(),
  currency: z.string().min(1).max(5),
});

export async function updateSettings(actor: Actor, input: z.infer<typeof settingsSchema>) {
  if (actor.role !== "admin") throw forbidden();
  try {
    new Intl.DateTimeFormat("en", { timeZone: input.timezone });
  } catch {
    throw unprocessable("Unknown time zone");
  }
  const before = await requireSettings();
  await settingsRef().update(input);
  invalidate("settings");
  await audit(actor, "update", "settings", "company", before, input);
  return { ...before, ...input };
}

// ---------- Simple lookup collections ----------

export function listDepartments() {
  return cached("departments", async () => rows<Department>(await db().collection("departments").get()).sort((a, b) => a.name.localeCompare(b.name)));
}
export function listDesignations() {
  return cached("designations", async () => rows<Designation>(await db().collection("designations").get()).sort((a, b) => a.name.localeCompare(b.name)));
}
export function listLeaveTypes() {
  const order = ["annual", "sick", "casual", "unpaid"];
  const rank = (code: string) => (order.includes(code) ? order.indexOf(code) : order.length);
  return cached("leaveTypes", async () =>
    rows<LeaveType>(await db().collection("leaveTypes").get()).sort((a, b) => rank(a.code) - rank(b.code) || a.name.localeCompare(b.name)),
  );
}
export function listHolidays() {
  return cached("holidays", async () => rows<Holiday>(await db().collection("holidays").get()).sort((a, b) => a.date.localeCompare(b.date)));
}
export async function holidaySet(): Promise<Set<string>> {
  return new Set((await listHolidays()).map((h) => h.date));
}

const nameSchema = z.object({ name: z.string().trim().min(2).max(60) });
export const departmentSchema = nameSchema;
export const designationSchema = nameSchema.extend({ departmentId: z.string().nullable().optional() });
export const leaveTypeSchema = z.object({
  name: z.string().trim().min(2).max(40),
  code: z.string().trim().toLowerCase().regex(/^[a-z_]{3,20}$/, "use 3-20 lowercase letters"),
  quota: z.number().int().min(0).max(365).nullable(),
  paid: z.boolean(),
});
export const holidaySchema = z.object({
  name: z.string().trim().min(2).max(60),
  date: z.string().refine(isIsoDate, "must be a date (YYYY-MM-DD)"),
});

type Kind = "departments" | "designations" | "leaveTypes" | "holidays";
const ENTITY: Record<Kind, string> = {
  departments: "department",
  designations: "designation",
  leaveTypes: "leave_type",
  holidays: "holiday",
};

async function assertUnique(kind: Kind, field: string, value: string, exceptId?: string) {
  const all = rows<Record<string, unknown> & { id: string }>(await db().collection(kind).get());
  const clash = all.find((r) => String(r[field]).toLowerCase() === value.toLowerCase() && r.id !== exceptId);
  if (clash) throw conflict(`${ENTITY[kind].replace("_", " ")} "${value}" already exists`);
}

export async function createLookup(actor: Actor, kind: Kind, data: Record<string, unknown>) {
  if (actor.role !== "admin") throw forbidden();
  if (kind === "leaveTypes") await assertUnique(kind, "code", String(data.code));
  else if (kind === "holidays") await assertUnique(kind, "date", String(data.date));
  else await assertUnique(kind, "name", String(data.name));
  const doc = { ...data, createdAt: nowIso() };
  const ref = await db().collection(kind).add(doc);
  invalidate(kind);
  await audit(actor, "create", ENTITY[kind], ref.id, null, doc);
  return { id: ref.id, ...doc };
}

export async function updateLookup(actor: Actor, kind: Kind, id: string, data: Record<string, unknown>) {
  if (actor.role !== "admin") throw forbidden();
  const ref = db().collection(kind).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw notFound();
  if (kind === "leaveTypes") await assertUnique(kind, "code", String(data.code), id);
  else if (kind === "holidays") await assertUnique(kind, "date", String(data.date), id);
  else await assertUnique(kind, "name", String(data.name), id);
  await ref.update(data);
  invalidate(kind);
  await audit(actor, "update", ENTITY[kind], id, snap.data(), data);
  return { id, ...snap.data(), ...data };
}

export async function deleteLookup(actor: Actor, kind: Kind, id: string) {
  if (actor.role !== "admin") throw forbidden();
  const ref = db().collection(kind).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw notFound();
  if (kind === "departments" || kind === "designations") {
    const field = kind === "departments" ? "departmentId" : "designationId";
    const used = await db().collection("employees").where(field, "==", id).limit(1).get();
    if (!used.empty) throw conflict(`This ${ENTITY[kind]} still has employees`);
  }
  if (kind === "leaveTypes") {
    const used = await db().collection("leaveRequests").where("typeId", "==", id).limit(1).get();
    if (!used.empty) throw conflict("This leave type is already used by leave requests");
  }
  await ref.delete();
  invalidate(kind);
  await audit(actor, "delete", ENTITY[kind], id, snap.data(), null);
}

/** Admin shortcut: create the four leave types from the brief (annual 14, sick 8, casual 10, unpaid). */
export async function addStandardLeaveTypes(actor: Actor) {
  if (actor.role !== "admin") throw forbidden();
  const existing = await listLeaveTypes();
  const created = [];
  for (const t of DEFAULT_LEAVE_TYPES) {
    if (existing.some((e) => e.code === t.code)) continue;
    created.push(await createLookup(actor, "leaveTypes", t));
  }
  return created;
}

// ---------- Logins (Admin) ----------

export async function listUsers(actor: Actor) {
  if (actor.role !== "admin") throw forbidden();
  return rows<UserDoc & { id: string }>(await db().collection("users").get()).sort(
    (a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name),
  );
}

export const hrUserSchema = z.object({ name: z.string().trim().min(2).max(60), email: z.email() });

export async function createHrUser(actor: Actor, input: z.infer<typeof hrUserSchema>) {
  if (actor.role !== "admin") throw forbidden();
  const password = tempPassword();
  const user = await createLogin({ email: input.email.toLowerCase(), name: input.name, role: "hr", employeeId: null, password, mustChangePassword: true });
  await audit(actor, "create", "user", user.uid, null, { name: user.name, email: user.email, role: "hr" });
  return { user, tempPassword: password };
}

export async function setUserActive(actor: Actor, uid: string, active: boolean) {
  if (actor.role !== "admin") throw forbidden();
  if (uid === actor.uid) throw unprocessable("You cannot deactivate your own account");
  const ref = db().collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw notFound();
  const before = snap.data() as UserDoc;
  if (before.role === "admin") throw forbidden("Admin accounts cannot be deactivated here");
  await ref.update({ active });
  await adminAuth().updateUser(uid, { disabled: !active });
  if (!active) await adminAuth().revokeRefreshTokens(uid);
  await audit(actor, active ? "activate" : "deactivate", "user", uid, { active: before.active }, { active });
}

export async function resetUserPassword(actor: Actor, uid: string) {
  if (actor.role !== "admin") throw forbidden();
  const ref = db().collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw notFound();
  const password = tempPassword();
  await adminAuth().updateUser(uid, { password });
  await adminAuth().revokeRefreshTokens(uid);
  await ref.update({ mustChangePassword: true });
  await audit(actor, "reset_password", "user", uid, null, { mustChangePassword: true });
  return { tempPassword: password };
}

export async function changeOwnPassword(actor: Actor, password: string) {
  if (password.length < 8) throw unprocessable("Password must be at least 8 characters");
  if (/^Hcm-\d{4}-[a-z]{3}$/.test(password)) throw unprocessable("Choose a new password, not the temporary one");
  await adminAuth().updateUser(actor.uid, { password });
  await db().collection("users").doc(actor.uid).update({ mustChangePassword: false });
  await audit(actor, "change_password", "user", actor.uid);
}
