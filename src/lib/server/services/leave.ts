import "server-only";
import { z } from "zod";
import { db, nowIso, rows } from "../firebase-admin";
import { conflict, forbidden, notFound, unprocessable } from "../http";
import type { Actor } from "../auth";
import { audit, notify, notifyRole } from "./comms";
import { holidaySet, listLeaveTypes, requireSettings } from "./org";
import { getEmployee } from "./employees";
import { isIsoDate, localParts, workingDaysBetween } from "@/lib/shared/dates";
import type { LeaveBalance, LeaveRequest, LeaveType } from "@/lib/shared/types";

const col = () => db().collection("leaveRequests");

export const applySchema = z.object({
  typeId: z.string().min(1, "choose a leave type"),
  start: z.string().refine(isIsoDate, "must be YYYY-MM-DD"),
  end: z.string().refine(isIsoDate, "must be YYYY-MM-DD"),
  reason: z.string().trim().min(3, "please add a short reason").max(300),
  source: z.enum(["form", "ai"]).default("form"),
});

export async function leavesOf(employeeId: string): Promise<LeaveRequest[]> {
  return rows<LeaveRequest>(await col().where("employeeId", "==", employeeId).get());
}

/** Map of `${employeeId}_${date}` → approved leave covering that working day. */
export async function approvedLeaveDays(from: string, to: string) {
  return leaveDayMap(rows<LeaveRequest>(await col().where("status", "==", "approved").get()), from, to);
}

export function leaveDayMap(approved: LeaveRequest[], from: string, to: string) {
  const map = new Map<string, LeaveRequest>();
  for (const l of approved) {
    if (l.status !== "approved") continue;
    if (l.end < from || l.start > to) continue;
    for (const d of l.dates) if (d >= from && d <= to) map.set(`${l.employeeId}_${d}`, l);
  }
  return map;
}

export async function balancesFor(employeeId: string, year: string, types?: LeaveType[]): Promise<LeaveBalance[]> {
  const [leaveTypes, leaves] = await Promise.all([types ? Promise.resolve(types) : listLeaveTypes(), leavesOf(employeeId)]);
  return leaveTypes.map((t) => {
    const inYear = leaves.filter((l) => l.typeId === t.id && l.start.startsWith(year));
    const used = inYear.filter((l) => l.status === "approved").reduce((s, l) => s + l.days, 0);
    const pending = inYear.filter((l) => l.status === "pending").reduce((s, l) => s + l.days, 0);
    return {
      typeId: t.id,
      code: t.code,
      name: t.name,
      quota: t.quota,
      used,
      pending,
      remaining: t.quota == null ? null : t.quota - used,
      paid: t.paid,
    };
  });
}

export async function myBalances(actor: Actor, year?: string) {
  if (!actor.employeeId) throw forbidden("Only employees have leave balances");
  const s = await requireSettings();
  return balancesFor(actor.employeeId, year ?? localParts(new Date(), s.timezone).date.slice(0, 4));
}

/** Overlap or over-balance = 422. Only working days count. */
async function validateRequest(employeeId: string, input: { typeId: string; start: string; end: string }, ignoreId?: string) {
  if (input.end < input.start) throw unprocessable("end: must be on or after the start date");
  if (input.start.slice(0, 4) !== input.end.slice(0, 4)) throw unprocessable("Please split leave that crosses into a new year");
  const [types, holidays, s, employee, leaves] = await Promise.all([
    listLeaveTypes(),
    holidaySet(),
    requireSettings(),
    getEmployee(employeeId),
    leavesOf(employeeId),
  ]);
  const type = types.find((t) => t.id === input.typeId);
  if (!type) throw unprocessable("typeId: unknown leave type");
  if (input.start < employee.joinDate) throw unprocessable("start: before the joining date");
  const dates = workingDaysBetween(input.start, input.end, s.weekend, holidays);
  if (dates.length === 0) throw unprocessable("The selected dates are weekends or public holidays; no working days to take off");
  const active = leaves.filter((l) => l.id !== ignoreId && (l.status === "pending" || l.status === "approved"));
  const clash = active.find((l) => l.start <= input.end && l.end >= input.start);
  if (clash) throw unprocessable(`Overlaps with your ${clash.status} ${clash.typeName.toLowerCase()} (${clash.start} to ${clash.end})`);
  if (type.quota != null) {
    const year = input.start.slice(0, 4);
    const committed = active.filter((l) => l.typeId === type.id && l.start.startsWith(year)).reduce((sum, l) => sum + l.days, 0);
    const left = type.quota - committed;
    if (dates.length > left) {
      throw unprocessable(`Not enough ${type.name.toLowerCase()} balance: ${dates.length} day(s) requested, ${Math.max(0, left)} left (including pending requests)`);
    }
  }
  return { type, dates, employee };
}

export async function applyLeave(actor: Actor, input: z.infer<typeof applySchema>) {
  if (actor.role !== "employee" || !actor.employeeId) throw forbidden("Only employees apply for leave");
  const { type, dates, employee } = await validateRequest(actor.employeeId, input);
  const doc: Omit<LeaveRequest, "id"> = {
    employeeId: actor.employeeId,
    employeeName: employee.name,
    departmentId: employee.departmentId,
    typeId: type.id,
    typeCode: type.code,
    typeName: type.name,
    start: input.start,
    end: input.end,
    days: dates.length,
    dates,
    reason: input.reason,
    status: "pending",
    comment: "",
    reviewedBy: null,
    reviewedAt: null,
    source: input.source,
    createdAt: nowIso(),
  };
  const ref = await col().add(doc);
  await audit(actor, "create", "leave_request", ref.id, null, doc);
  await notifyRole("hr", "New leave request", `${employee.name} applied for ${doc.days} day(s) of ${type.name.toLowerCase()}`, "/leave");
  return { id: ref.id, ...doc };
}

export async function cancelLeave(actor: Actor, id: string) {
  const ref = col().doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw notFound();
  const l = { id, ...snap.data() } as LeaveRequest;
  if (actor.role !== "employee" || l.employeeId !== actor.employeeId) throw forbidden();
  const s = await requireSettings();
  const today = localParts(new Date(), s.timezone).date;
  if (l.status === "approved" && l.start <= today) throw unprocessable("Leave that has already started cannot be cancelled; ask HR");
  if (l.status !== "pending" && l.status !== "approved") throw conflict(`This request is already ${l.status}`);
  await ref.update({ status: "cancelled" });
  await audit(actor, "cancel", "leave_request", id, { status: l.status }, { status: "cancelled" });
  return { ...l, status: "cancelled" };
}

export async function reviewLeave(actor: Actor, id: string, input: { approve: boolean; comment: string }) {
  if (actor.role !== "hr") throw forbidden("Only HR approves leave");
  const ref = col().doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw notFound();
  const l = { id, ...snap.data() } as LeaveRequest;
  if (l.status !== "pending") throw conflict(`This request is already ${l.status}`);
  if (input.approve) await validateRequest(l.employeeId, l, l.id); // balances may have changed since it was filed
  if (!input.approve && !input.comment.trim()) throw unprocessable("comment: please give a reason when rejecting");
  const patch = { status: input.approve ? "approved" : "rejected", comment: input.comment.trim(), reviewedBy: actor.name, reviewedAt: nowIso() } as const;
  await ref.update(patch);
  await audit(actor, input.approve ? "approve" : "reject", "leave_request", id, { status: "pending" }, patch);
  const employee = await getEmployee(l.employeeId);
  await notify(
    employee.uid,
    `Leave ${patch.status}`,
    `Your ${l.typeName.toLowerCase()} (${l.start} to ${l.end}) was ${patch.status}${patch.comment ? `: ${patch.comment}` : ""}`,
    "/leave",
  );
  return { ...l, ...patch };
}

export async function listLeaves(actor: Actor, filters: { status?: string; employeeId?: string }) {
  let list: LeaveRequest[];
  if (actor.role === "employee") {
    list = await leavesOf(actor.employeeId!);
  } else if (filters.employeeId) {
    list = await leavesOf(filters.employeeId);
  } else {
    list = rows<LeaveRequest>(await col().get());
  }
  if (filters.status && filters.status !== "all") list = list.filter((l) => l.status === filters.status);
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
