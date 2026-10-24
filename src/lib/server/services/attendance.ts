import "server-only";
import { z } from "zod";
import { db, nowIso, rows } from "../firebase-admin";
import { conflict, forbidden, notFound, unprocessable } from "../http";
import type { Actor } from "../auth";
import { audit, notify, notifyRole } from "./comms";
import { holidaySet, requireSettings } from "./org";
import { allEmployees, getEmployee } from "./employees";
import { approvedLeaveDays, leaveDayMap } from "./leave";
import { eachDay, isIsoDate, localParts, monthRange, toMinutes } from "@/lib/shared/dates";
import { classifyCheckIn, classifyCheckOut, dayStatus, distanceMeters } from "@/lib/shared/rules";
import type { AttendanceRecord, CompanySettings, CorrectionRequest, DayStatus, Employee, LeaveRequest } from "@/lib/shared/types";

const col = () => db().collection("attendance");
const recordId = (employeeId: string, date: string) => `${employeeId}_${date}`;

export const checkInSchema = z.object({
  source: z.enum(["web", "camera"]).default("web"),
  location: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      accuracy: z.number().min(0),
    })
    .nullable()
    .optional(),
  faces: z.number().int().min(0).optional(),
});

/** Camera check-in: exactly one face, GPS accuracy ≤ 100 m, inside the office radius. The server decides. */
function verifyCamera(s: CompanySettings, input: z.infer<typeof checkInSchema>) {
  if (input.faces !== 1) {
    throw unprocessable(input.faces === 0 ? "No face detected. Look at the camera and try again." : "More than one face detected. Only you should be in the frame.");
  }
  if (!input.location) throw unprocessable("Location is required for camera attendance");
  if (input.location.accuracy > 100) throw unprocessable(`GPS accuracy is ${Math.round(input.location.accuracy)} m; it must be 100 m or better`);
  if (s.officeLat == null || s.officeLng == null) throw unprocessable("Admin has not set the office location yet");
  const distanceM = distanceMeters(input.location.lat, input.location.lng, s.officeLat, s.officeLng);
  if (distanceM > s.radiusM) throw unprocessable(`You are ${distanceM} m from the office; check-in is allowed within ${s.radiusM} m`);
  return { ...input.location, distanceM };
}

export async function checkIn(actor: Actor, input: z.infer<typeof checkInSchema>) {
  if (actor.role !== "employee" || !actor.employeeId) throw forbidden("Only employees check in");
  const s = await requireSettings();
  const now = new Date();
  const local = localParts(now, s.timezone);
  const employee = await getEmployee(actor.employeeId);
  if (local.date < employee.joinDate) throw unprocessable("You can check in from your joining date");
  const location = input.source === "camera" ? verifyCamera(s, input) : null;
  const rule = classifyCheckIn(local.minutes, s);
  const record: Omit<AttendanceRecord, "id"> = {
    employeeId: actor.employeeId,
    date: local.date,
    checkIn: now.toISOString(),
    checkOut: null,
    checkInMin: local.minutes,
    checkOutMin: null,
    status: rule.status,
    isLate: rule.isLate,
    lateMinutes: rule.lateMinutes,
    hours: null,
    source: input.source,
    location,
    rules: { officeStart: s.officeStart, graceMinutes: s.graceMinutes, halfDayHours: s.halfDayHours },
  };
  try {
    // One record per employee per day: the document id makes a second check-in fail.
    await col().doc(recordId(actor.employeeId, local.date)).create(record);
  } catch (e) {
    if ((e as { code?: number }).code === 6) throw conflict("You have already checked in today");
    throw e;
  }
  return { id: recordId(actor.employeeId, local.date), ...record };
}

export async function checkOut(actor: Actor) {
  if (actor.role !== "employee" || !actor.employeeId) throw forbidden("Only employees check out");
  const s = await requireSettings();
  const now = new Date();
  const local = localParts(now, s.timezone);
  const ref = col().doc(recordId(actor.employeeId, local.date));
  const snap = await ref.get();
  if (!snap.exists) throw unprocessable("You have not checked in today");
  const rec = snap.data() as AttendanceRecord;
  if (rec.checkOut) throw conflict("You have already checked out today");
  // Uses the half-day rule saved with the record: settings apply to new records only.
  const result = classifyCheckOut(rec.checkInMin, local.minutes, rec.isLate, rec.rules.halfDayHours);
  const patch = { checkOut: now.toISOString(), checkOutMin: local.minutes, hours: result.hours, status: result.status };
  await ref.update(patch);
  return { ...rec, ...patch, id: ref.id };
}

export async function todayRecord(actor: Actor) {
  if (!actor.employeeId) return null;
  const s = await requireSettings();
  const local = localParts(new Date(), s.timezone);
  const snap = await col().doc(recordId(actor.employeeId, local.date)).get();
  return { date: local.date, record: snap.exists ? ({ id: snap.id, ...snap.data() } as AttendanceRecord) : null };
}

/** All attendance records between two dates (inclusive). */
export async function recordsBetween(from: string, to: string): Promise<AttendanceRecord[]> {
  const snap = await col().where("date", ">=", from).where("date", "<=", to).get();
  return rows<AttendanceRecord>(snap);
}

export interface DayRow {
  date: string;
  status: DayStatus;
  record: AttendanceRecord | null;
  leaveType?: string;
}

/**
 * Builds the day-by-day status grid used by the calendar, the board, the
 * dashboards, payroll and the AI tools, so all of them agree.
 */
export async function buildGrid(
  employees: Employee[],
  from: string,
  to: string,
  preloaded: { settings?: CompanySettings; holidays?: Set<string>; approvedLeaves?: LeaveRequest[] } = {},
) {
  const [s, records, holidays, leaves] = await Promise.all([
    preloaded.settings ?? requireSettings(),
    recordsBetween(from, to),
    preloaded.holidays ?? holidaySet(),
    preloaded.approvedLeaves ? leaveDayMap(preloaded.approvedLeaves, from, to) : approvedLeaveDays(from, to),
  ]);
  const today = localParts(new Date(), s.timezone).date;
  const recMap = new Map(records.map((r) => [recordId(r.employeeId, r.date), r]));
  const days = eachDay(from, to);
  const grid = new Map<string, DayRow[]>();
  for (const e of employees) {
    grid.set(
      e.id,
      days.map((date) => {
        const record = recMap.get(recordId(e.id, date)) ?? null;
        const leave = leaves.get(recordId(e.id, date));
        const status = dayStatus({
          date,
          today,
          record,
          onLeave: !!leave,
          isWeekend: s.weekend.includes(new Date(date + "T00:00:00Z").getUTCDay()),
          isHoliday: holidays.has(date),
          joinDate: e.joinDate,
          exitDate: e.exitDate,
        });
        return { date, status, record, leaveType: leave?.typeCode };
      }),
    );
  }
  return { grid, today, settings: s, holidays };
}

export async function myCalendar(actor: Actor, month: string) {
  if (!actor.employeeId) throw forbidden("Only employees have an attendance calendar");
  return employeeCalendar(actor, actor.employeeId, month);
}

export async function employeeCalendar(actor: Actor, employeeId: string, month: string) {
  if (actor.role === "employee" && actor.employeeId !== employeeId) throw forbidden();
  if (!/^\d{4}-\d{2}$/.test(month)) throw unprocessable("month must be YYYY-MM");
  const e = await getEmployee(employeeId);
  const { from, to } = monthRange(month);
  const { grid, today } = await buildGrid([e], from, to);
  const days = grid.get(e.id)!;
  const summary: Record<string, number> = {};
  days.forEach((d) => (summary[d.status] = (summary[d.status] ?? 0) + 1));
  const lateCount = days.filter((d) => d.record?.isLate).length;
  const hours = days.reduce((sum, d) => sum + (d.record?.hours ?? 0), 0);
  return { month, today, days, summary, lateCount, hours: Math.round(hours * 10) / 10 };
}

/** HR / Admin daily attendance board. */
export async function dailyBoard(actor: Actor, date: string, departmentId?: string) {
  if (actor.role === "employee") throw forbidden();
  if (!isIsoDate(date)) throw unprocessable("date must be YYYY-MM-DD");
  const employees = (await allEmployees()).filter(
    (e) => (!departmentId || e.departmentId === departmentId) && e.joinDate <= date && (!e.exitDate || e.exitDate >= date),
  );
  const { grid } = await buildGrid(employees, date, date);
  const items = employees
    .map((e) => ({ employee: { id: e.id, name: e.name, code: e.code, departmentId: e.departmentId }, ...grid.get(e.id)![0] }))
    .sort((a, b) => a.employee.code.localeCompare(b.employee.code));
  const counts: Record<string, number> = {};
  items.forEach((i) => (counts[i.status] = (counts[i.status] ?? 0) + 1));
  return { date, items, counts };
}

// ---------- Corrections ----------

export const correctionSchema = z.object({
  date: z.string().refine(isIsoDate, "must be YYYY-MM-DD"),
  checkIn: z.string().regex(/^\d{2}:\d{2}$/, "use HH:MM"),
  checkOut: z.string().regex(/^\d{2}:\d{2}$/, "use HH:MM"),
  reason: z.string().trim().min(5, "please explain in a few words").max(300),
});

export async function requestCorrection(actor: Actor, input: z.infer<typeof correctionSchema>) {
  if (actor.role !== "employee" || !actor.employeeId) throw forbidden();
  const s = await requireSettings();
  const today = localParts(new Date(), s.timezone).date;
  if (input.date > today) throw unprocessable("date: cannot correct a future day");
  if (toMinutes(input.checkOut) <= toMinutes(input.checkIn)) throw unprocessable("checkOut: must be after check-in");
  const e = await getEmployee(actor.employeeId);
  if (input.date < e.joinDate) throw unprocessable("date: before your joining date");
  const existing = rows<CorrectionRequest>(await db().collection("corrections").where("employeeId", "==", actor.employeeId).get());
  if (existing.some((c) => c.date === input.date && c.status === "pending")) throw conflict("You already have a pending correction for this date");
  const doc: Omit<CorrectionRequest, "id"> = {
    employeeId: actor.employeeId,
    employeeName: e.name,
    ...input,
    status: "pending",
    comment: "",
    reviewedBy: null,
    reviewedAt: null,
    createdAt: nowIso(),
  };
  const ref = await db().collection("corrections").add(doc);
  await notifyRole("hr", "Attendance correction request", `${e.name} asked to correct ${input.date}`, "/attendance?tab=corrections");
  return { id: ref.id, ...doc };
}

export async function listCorrections(actor: Actor, status?: string) {
  const q = actor.role === "employee" ? db().collection("corrections").where("employeeId", "==", actor.employeeId) : db().collection("corrections");
  const list = rows<CorrectionRequest>(await q.get());
  return list.filter((c) => !status || status === "all" || c.status === status).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function reviewCorrection(actor: Actor, id: string, input: { approve: boolean; comment: string }) {
  if (actor.role !== "hr") throw forbidden("Only HR approves attendance corrections");
  const ref = db().collection("corrections").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw notFound();
  const c = { id, ...snap.data() } as CorrectionRequest;
  if (c.status !== "pending") throw conflict("This request has already been reviewed");
  const s = await requireSettings();
  if (input.approve) {
    const inMin = toMinutes(c.checkIn);
    const outMin = toMinutes(c.checkOut);
    const first = classifyCheckIn(inMin, s);
    const second = classifyCheckOut(inMin, outMin, first.isLate, s.halfDayHours);
    const recRef = col().doc(recordId(c.employeeId, c.date));
    const before = (await recRef.get()).data() ?? null;
    const stamp = (min: number) => zonedIso(c.date, min, s.timezone);
    const record: Omit<AttendanceRecord, "id"> = {
      employeeId: c.employeeId,
      date: c.date,
      checkIn: stamp(inMin),
      checkOut: stamp(outMin),
      checkInMin: inMin,
      checkOutMin: outMin,
      status: second.status,
      isLate: first.isLate,
      lateMinutes: first.lateMinutes,
      hours: second.hours,
      source: "correction",
      location: null,
      rules: { officeStart: s.officeStart, graceMinutes: s.graceMinutes, halfDayHours: s.halfDayHours },
    };
    await recRef.set(record);
    await audit(actor, "correct", "attendance", recRef.id, before, record);
  }
  const patch = { status: input.approve ? "approved" : "rejected", comment: input.comment, reviewedBy: actor.name, reviewedAt: nowIso() };
  await ref.update(patch);
  await audit(actor, input.approve ? "approve" : "reject", "attendance_correction", id, { status: "pending" }, patch);
  const emp = await getEmployee(c.employeeId);
  await notify(emp.uid, `Correction ${patch.status}`, `Your correction for ${c.date} was ${patch.status}${input.comment ? `: ${input.comment}` : ""}`, "/attendance");
  return { ...c, ...patch };
}

/** Converts a local date + minutes in a time zone to an ISO timestamp. */
function zonedIso(date: string, minutes: number, timeZone: string): string {
  const guess = new Date(`${date}T00:00:00Z`).getTime() + minutes * 60000;
  // Find the zone offset at that moment and shift.
  const local = localParts(new Date(guess), timeZone);
  const localMs = Date.parse(`${local.date}T${local.time}:00Z`);
  const offset = localMs - guess;
  return new Date(guess - offset).toISOString();
}
