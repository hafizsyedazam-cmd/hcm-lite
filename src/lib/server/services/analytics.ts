import "server-only";
import { db, rows } from "../firebase-admin";
import { forbidden, unprocessable } from "../http";
import type { Actor } from "../auth";
import { listAnnouncements } from "./comms";
import { holidaySet, listDepartments, listDesignations, listLeaveTypes, requireSettings } from "./org";
import { allEmployees, getEmployee } from "./employees";
import { buildGrid } from "./attendance";
import { balancesFor, leavesOf } from "./leave";
import { myPayslips } from "./payroll";
import { addDays, daysBetween, isIsoDate, localParts, startOfWeek } from "@/lib/shared/dates";
import { addToCounts, attendanceRate, emptyCounts, round1, salaryBreakdown, type StatusCounts } from "@/lib/shared/rules";
import type { CorrectionRequest, Employee, LeaveRequest, Payslip, PayrollRun } from "@/lib/shared/types";

export interface Filters {
  from: string;
  to: string;
  departmentId?: string;
}

const ATTENDED = ["present", "late", "half_day", "missing_checkout"];
const WORKING = [...ATTENDED, "absent", "on_leave"];

function activeOn(e: Employee, date: string) {
  return e.joinDate <= date && (!e.exitDate || e.exitDate >= date);
}

export async function resolveFilters(input: Partial<Filters>): Promise<Filters> {
  const s = await requireSettings();
  const today = localParts(new Date(), s.timezone).date;
  const to = input.to && isIsoDate(input.to) ? input.to : today;
  const from = input.from && isIsoDate(input.from) ? input.from : `${to.slice(0, 7)}-01`;
  if (from > to) throw unprocessable("from must be on or before to");
  if (daysBetween(from, to) > 366) throw unprocessable("Please choose a range of one year or less");
  return { from, to, departmentId: input.departmentId || undefined };
}

/** Company / HR metrics for a date range and optional department (Section 7 formulas). */
export async function companyMetrics(actor: Actor, filters: Filters) {
  if (actor.role === "employee") throw forbidden();
  // Load everything independent in one round trip; the database is the only source of truth.
  const [s, everyone, departments, designations, leaveTypes, holidays, leaveRows, pendingCorrections, runRows] = await Promise.all([
    requireSettings(),
    allEmployees(),
    listDepartments(),
    listDesignations(),
    listLeaveTypes(),
    holidaySet(),
    db().collection("leaveRequests").get(),
    db().collection("corrections").where("status", "==", "pending").get(),
    db().collection("payrollRuns").get(),
  ]);
  const today = localParts(new Date(), s.timezone).date;
  const { from, to, departmentId } = filters;
  const scoped = everyone.filter((e) => !departmentId || e.departmentId === departmentId);
  const scopedIds = new Set(scoped.map((e) => e.id));
  const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? "Unknown";
  const allLeaves = rows<LeaveRequest>(leaveRows).filter((l) => scopedIds.has(l.employeeId));
  const approved = allLeaves.filter((l) => l.status === "approved");
  const preloaded = { settings: s, holidays, approvedLeaves: approved };
  const runsList = rows<PayrollRun>(runRows).sort((a, b) => b.month.localeCompare(a.month));
  const latestRun = runsList.find((r) => r.month <= to.slice(0, 7)) ?? null;

  const rangeEnd = to < today ? to : today;
  const inRange = scoped.filter((e) => e.joinDate <= to && (!e.exitDate || e.exitDate >= from));
  const activeToday = scoped.filter((e) => activeOn(e, today));
  const [rangeGrid, todayGrid, slipRows] = await Promise.all([
    from <= rangeEnd && inRange.length ? buildGrid(inRange, from, rangeEnd, preloaded).then((g) => g.grid) : Promise.resolve(null),
    activeToday.length ? buildGrid(activeToday, today, today, preloaded).then((g) => g.grid) : Promise.resolve(null),
    latestRun ? db().collection("payslips").where("month", "==", latestRun.month).get() : Promise.resolve(null),
  ]);

  // Headcount & attrition
  const headcountAt = (date: string) => scoped.filter((e) => activeOn(e, date)).length;
  const headcount = headcountAt(to);
  const exits = scoped.filter((e) => e.exitDate && e.exitDate >= from && e.exitDate <= to).length;
  const avgHeadcount = (headcountAt(from) + headcount) / 2;
  const attrition = avgHeadcount > 0 ? round1((exits / avgHeadcount) * 100) : 0;
  const yearStart = `${to.slice(0, 4)}-01-01`;
  const exitsYtd = scoped.filter((e) => e.exitDate && e.exitDate >= yearStart && e.exitDate <= to).length;
  const avgYtd = (headcountAt(yearStart) + headcount) / 2;
  const attritionYtd = avgYtd > 0 ? round1((exitsYtd / avgYtd) * 100) : 0;

  // Attendance (only up to today)
  const counts = emptyCounts();
  const perDept = new Map<string, { counts: StatusCounts; expected: number }>();
  const perDay = new Map<string, StatusCounts>();
  const lateBy = new Map<string, number>();
  let lateFlags = 0;
  if (rangeGrid) {
    for (const e of inRange) {
      const dept = perDept.get(e.departmentId) ?? { counts: emptyCounts(), expected: 0 };
      for (const d of rangeGrid.get(e.id)!) {
        if (!WORKING.includes(d.status)) continue;
        addToCounts(counts, d.status);
        addToCounts(dept.counts, d.status);
        dept.expected += 1;
        const day = perDay.get(d.date) ?? emptyCounts();
        addToCounts(day, d.status);
        perDay.set(d.date, day);
        if (d.record?.isLate) {
          lateFlags += 1;
          lateBy.set(e.id, (lateBy.get(e.id) ?? 0) + 1);
        }
      }
      perDept.set(e.departmentId, dept);
    }
  }
  const attended = counts.present + counts.late + counts.half_day + counts.missing_checkout;
  const trend = [...perDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, c]) => ({ date, rate: attendanceRate(c), present: c.present + c.late + c.half_day + c.missing_checkout, absent: c.absent, onLeave: c.on_leave }));
  const absenteeismByDept = [...perDept.entries()].map(([id, v]) => ({
    department: deptName(id),
    absentDays: v.counts.absent,
    expectedDays: v.expected - v.counts.on_leave,
    rate: v.expected - v.counts.on_leave > 0 ? round1((v.counts.absent / (v.expected - v.counts.on_leave)) * 100) : 0,
    attendanceRate: attendanceRate(v.counts),
  }));
  const topLate = [...lateBy.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, n]) => {
      const e = scoped.find((x) => x.id === id)!;
      return { employeeId: id, name: e.name, code: e.code, department: deptName(e.departmentId), lateCount: n };
    });

  // Leave utilization: approved days in range ÷ quota, per type and department
  const daysIn = (l: LeaveRequest) => l.dates.filter((d) => d >= from && d <= to).length;
  const leaveByType = leaveTypes.map((t) => {
    const days = approved.filter((l) => l.typeId === t.id).reduce((sum, l) => sum + daysIn(l), 0);
    const pool = t.quota != null ? t.quota * headcount : null;
    return { type: t.name, code: t.code, days, quota: t.quota, utilization: pool ? round1((days / pool) * 100) : null };
  });
  const leaveByDept = departments
    .filter((d) => !departmentId || d.id === departmentId)
    .map((d) => ({ department: d.name, days: approved.filter((l) => l.departmentId === d.id).reduce((sum, l) => sum + daysIn(l), 0) }));

  // Today snapshot
  const todayCounts = emptyCounts();
  const onLeaveToday: { name: string; type: string }[] = [];
  const lateToday: string[] = [];
  for (const e of todayGrid ? activeToday : []) {
    const d = todayGrid!.get(e.id)![0];
    addToCounts(todayCounts, d.status);
    if (d.status === "on_leave") onLeaveToday.push({ name: e.name, type: d.leaveType ?? "leave" });
    if (d.record?.isLate) lateToday.push(e.name);
  }
  const pendingLeaves = allLeaves.filter((l) => l.status === "pending").length;
  const corrections = rows<CorrectionRequest>(pendingCorrections).filter((c) => scopedIds.has(c.employeeId));

  // Payroll & salaries
  let payrollByDept: { department: string; gross: number; net: number }[] = [];
  let payrollCost = { gross: 0, net: 0, month: latestRun?.month ?? null, status: latestRun?.status ?? null };
  if (latestRun && slipRows) {
    const slips = rows<Payslip>(slipRows).filter(
      (p) => !departmentId || p.departmentId === departmentId,
    );
    payrollCost = {
      gross: slips.reduce((sum, p) => sum + p.earnedGross, 0),
      net: slips.reduce((sum, p) => sum + p.net, 0),
      month: latestRun.month,
      status: latestRun.status,
    };
    const byDept = new Map<string, { gross: number; net: number }>();
    slips.forEach((p) => {
      const v = byDept.get(p.departmentId) ?? { gross: 0, net: 0 };
      v.gross += p.earnedGross;
      v.net += p.net;
      byDept.set(p.departmentId, v);
    });
    payrollByDept = [...byDept.entries()].map(([id, v]) => ({ department: deptName(id), ...v }));
  }
  const activeNow = scoped.filter((e) => activeOn(e, to));
  const avg = (list: Employee[]) => (list.length ? Math.round(list.reduce((sum, e) => sum + salaryBreakdown(e.basic).gross, 0) / list.length) : 0);
  const avgSalary = avg(activeNow);
  const avgSalaryByDept = departments
    .map((d) => ({ department: d.name, avgGross: avg(activeNow.filter((e) => e.departmentId === d.id)), count: activeNow.filter((e) => e.departmentId === d.id).length }))
    .filter((d) => d.count > 0);
  const avgSalaryByDesignation = designations
    .map((d) => ({ designation: d.name, avgGross: avg(activeNow.filter((e) => e.designationId === d.id)), count: activeNow.filter((e) => e.designationId === d.id).length }))
    .filter((d) => d.count > 0);
  const headcountByDept = departments
    .filter((d) => !departmentId || d.id === departmentId)
    .map((d) => ({ department: d.name, count: activeNow.filter((e) => e.departmentId === d.id).length }));
  const gender = { male: 0, female: 0, other: 0 };
  activeNow.forEach((e) => (gender[e.gender] += 1));
  const tenure = { "< 1 year": 0, "1-3 years": 0, "3-5 years": 0, "5+ years": 0 };
  activeNow.forEach((e) => {
    const years = daysBetween(e.joinDate, to) / 365;
    tenure[years < 1 ? "< 1 year" : years < 3 ? "1-3 years" : years < 5 ? "3-5 years" : "5+ years"] += 1;
  });

  return {
    filters: { from, to, departmentId: departmentId ?? null, department: departmentId ? deptName(departmentId) : "All departments" },
    headcount,
    probation: activeNow.filter((e) => e.status === "probation").length,
    exits,
    attrition,
    attritionYtd,
    attendance: {
      counts,
      rate: attendanceRate(counts),
      latePercent: attended > 0 ? round1((lateFlags / attended) * 100) : 0,
      lateCount: lateFlags,
      absenteeism: counts.absent + counts.present + counts.late + counts.half_day + counts.missing_checkout > 0
        ? round1((counts.absent / (counts.absent + attended)) * 100)
        : 0,
      trend,
      absenteeismByDept,
      topLate,
    },
    today: {
      date: today,
      present: todayCounts.present + todayCounts.late + todayCounts.half_day + todayCounts.missing_checkout,
      late: lateToday.length,
      lateNames: lateToday,
      onLeave: todayCounts.on_leave,
      onLeaveList: onLeaveToday,
      notCheckedIn: todayCounts.absent,
    },
    pendingApprovals: { leave: pendingLeaves, corrections: corrections.length, total: pendingLeaves + corrections.length },
    leave: { byType: leaveByType, byDept: leaveByDept, approvedDays: leaveByType.reduce((sum, t) => sum + t.days, 0) },
    payroll: { cost: payrollCost, byDept: payrollByDept, avgSalary, avgSalaryByDept, avgSalaryByDesignation },
    headcountByDept,
    gender,
    tenure,
  };
}

export type CompanyMetrics = Awaited<ReturnType<typeof companyMetrics>>;

/** Employee's own dashboard: never touches anyone else's rows. */
export async function employeeDashboard(actor: Actor) {
  if (!actor.employeeId) throw forbidden();
  const s = await requireSettings();
  const now = localParts(new Date(), s.timezone);
  const e = await getEmployee(actor.employeeId);
  const weekStart = startOfWeek(now.date);
  const monthStart = `${now.date.slice(0, 7)}-01`;
  const from = weekStart < monthStart ? weekStart : monthStart;
  const { grid } = await buildGrid([e], from, now.date);
  const days = grid.get(e.id)!;
  const week = days.filter((d) => d.date >= weekStart);
  const month = days.filter((d) => d.date >= monthStart);
  const liveHours = (d: (typeof days)[number]) => {
    if (!d.record) return 0;
    if (d.record.hours != null) return d.record.hours;
    if (d.date === now.date) return Math.max(0, (now.minutes - d.record.checkInMin) / 60);
    return 0;
  };
  const counts = emptyCounts();
  month.forEach((d) => addToCounts(counts, d.status));
  const [balances, slips, announcements, leaves] = await Promise.all([
    balancesFor(e.id, now.date.slice(0, 4)),
    myPayslips(actor),
    listAnnouncements(5),
    leavesOf(e.id),
  ]);
  const todayRow = days.find((d) => d.date === now.date);
  return {
    employee: { id: e.id, name: e.name, code: e.code, joinDate: e.joinDate },
    today: { date: now.date, time: now.time, record: todayRow?.record ?? null, status: todayRow?.status ?? null },
    officeHours: { start: s.officeStart, end: s.officeEnd, graceMinutes: s.graceMinutes },
    camera: { enabled: s.officeLat != null && s.officeLng != null, radiusM: s.radiusM },
    hoursThisWeek: round1(week.reduce((sum, d) => sum + liveHours(d), 0)),
    targetHours: 40,
    lateThisMonth: month.filter((d) => d.record?.isLate).length,
    attendanceRateThisMonth: attendanceRate(counts),
    monthCounts: counts,
    weekDays: week.map((d) => ({ date: d.date, status: d.status, hours: round1(liveHours(d)) })),
    balances,
    lastPayslip: slips[0] ?? null,
    announcements,
    upcomingLeave: leaves
      .filter((l) => (l.status === "approved" || l.status === "pending") && l.end >= now.date)
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(0, 3),
  };
}

export function defaultRange(today: string) {
  return { from: addDays(today, -29), to: today };
}
