// Business rules from the HCM Lite brief (Section 3). Pure functions, so the
// API services, the AI tools and the unit tests all use exactly the same logic.

import type { AttendanceRecord, CompanySettings, DayStatus } from "./types";
import { toMinutes } from "./dates";

export const DEFAULT_SETTINGS: CompanySettings = {
  companyName: "",
  officeStart: "09:00",
  officeEnd: "18:00",
  graceMinutes: 15,
  halfDayHours: 5,
  weekend: [6, 0],
  timezone: "Asia/Karachi",
  officeLat: null,
  officeLng: null,
  radiusM: 150,
  latePenalty: false,
  currency: "PKR",
  setupComplete: false,
};

export const DEFAULT_LEAVE_TYPES = [
  { name: "Annual Leave", code: "annual", quota: 14, paid: true },
  { name: "Sick Leave", code: "sick", quota: 8, paid: true },
  { name: "Casual Leave", code: "casual", quota: 10, paid: true },
  { name: "Unpaid Leave", code: "unpaid", quota: null, paid: false },
];

// ---------- Attendance ----------

/** Late after office start + grace (09:15 by default). */
export function classifyCheckIn(checkInMin: number, s: Pick<CompanySettings, "officeStart" | "graceMinutes">) {
  const start = toMinutes(s.officeStart);
  const isLate = checkInMin > start + s.graceMinutes;
  return {
    status: (isLate ? "late" : "present") as "late" | "present",
    isLate,
    lateMinutes: isLate ? checkInMin - start : 0,
  };
}

/** Half day if worked less than the half-day threshold (5 h by default). */
export function classifyCheckOut(checkInMin: number, checkOutMin: number, isLate: boolean, halfDayHours: number) {
  const hours = Math.max(0, Math.round(((checkOutMin - checkInMin) / 60) * 100) / 100);
  const status: AttendanceRecord["status"] = hours < halfDayHours ? "half_day" : isLate ? "late" : "present";
  return { hours, status };
}

/**
 * Status of one employee on one day.
 * A record wins over everything; then approved leave; then weekend/holiday;
 * a working day with nothing is absent (today included, once it has started).
 */
export function dayStatus(args: {
  date: string;
  today: string;
  record?: Pick<AttendanceRecord, "status" | "checkOut"> | null;
  onLeave: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  joinDate: string;
  exitDate: string | null;
}): DayStatus {
  const { date, today, record } = args;
  if (date < args.joinDate || (args.exitDate && date > args.exitDate)) return "not_joined";
  if (record) {
    if (!record.checkOut && date < today) return "missing_checkout";
    return record.status;
  }
  if (args.onLeave) return "on_leave";
  if (args.isHoliday) return "holiday";
  if (args.isWeekend) return "weekend";
  if (date > today) return "upcoming";
  return "absent";
}

export interface StatusCounts {
  present: number;
  late: number;
  half_day: number;
  missing_checkout: number;
  absent: number;
  on_leave: number;
}

export function emptyCounts(): StatusCounts {
  return { present: 0, late: 0, half_day: 0, missing_checkout: 0, absent: 0, on_leave: 0 };
}

export function addToCounts(c: StatusCounts, s: DayStatus) {
  if (s in c) c[s as keyof StatusCounts] += 1;
}

/** (present + late + missing_checkout + 0.5 × half_day) ÷ (working-day records − on_leave) */
export function attendanceRate(c: StatusCounts): number {
  const records = c.present + c.late + c.half_day + c.missing_checkout + c.absent + c.on_leave;
  const denom = records - c.on_leave;
  if (denom <= 0) return 0;
  return round1(((c.present + c.late + c.missing_checkout + 0.5 * c.half_day) / denom) * 100);
}

// ---------- Geofence ----------

/** Haversine distance in metres. */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

// ---------- Payroll ----------

/** Gross = 1.5 × basic (HRA 40 %, medical 10 %). */
export function salaryBreakdown(basic: number) {
  const hra = round0(basic * 0.4);
  const medical = round0(basic * 0.1);
  return { basic: round0(basic), hra, medical, gross: round0(basic) + hra + medical };
}

/** Illustrative annual tax slab from the brief, applied to gross × 12. */
export function annualTax(annual: number): number {
  if (annual <= 600_000) return 0;
  if (annual <= 1_200_000) return (annual - 600_000) * 0.05;
  if (annual <= 2_400_000) return 30_000 + (annual - 1_200_000) * 0.15;
  if (annual <= 3_600_000) return 210_000 + (annual - 2_400_000) * 0.25;
  return 510_000 + (annual - 3_600_000) * 0.35;
}

export interface PayslipInput {
  basic: number;
  monthWorkingDays: number; // company working days in the month
  payableDays: number; // working days the employee was employed (prorating joiners / leavers)
  absentDays: number;
  unpaidDays: number;
  halfDays: number;
  lateCount: number;
  latePenalty: boolean;
}

export function computePayslip(i: PayslipInput) {
  const { basic, hra, medical, gross } = salaryBreakdown(i.basic);
  const perDay = i.monthWorkingDays > 0 ? gross / i.monthWorkingDays : 0;
  const earnedGross = round0(perDay * i.payableDays);
  const latePenaltyDays = i.latePenalty ? Math.floor(i.lateCount / 3) * 0.5 : 0;
  const deductionDays = i.absentDays + i.unpaidDays + 0.5 * i.halfDays + latePenaltyDays;
  const deduction = Math.min(earnedGross, round0(perDay * deductionDays));
  const annualTaxable = earnedGross * 12;
  const tax = round0(annualTax(annualTaxable) / 12);
  const net = Math.max(0, earnedGross - deduction - tax);
  return {
    basic,
    hra,
    medical,
    gross,
    perDay: round2(perDay),
    earnedGross,
    latePenaltyDays,
    deduction,
    annualTaxable,
    tax,
    net,
  };
}

export function round0(n: number) {
  return Math.round(n);
}
export function round1(n: number) {
  return Math.round(n * 10) / 10;
}
export function round2(n: number) {
  return Math.round(n * 100) / 100;
}
