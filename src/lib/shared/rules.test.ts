import { describe, expect, it } from "vitest";
import { annualTax, attendanceRate, classifyCheckIn, classifyCheckOut, computePayslip, dayStatus, distanceMeters, emptyCounts, salaryBreakdown } from "./rules";
import { localParts, monthRange, workingDaysBetween } from "./dates";

const office = { officeStart: "09:00", graceMinutes: 15 };

describe("attendance rules", () => {
  it("is on time up to 09:15 and late after", () => {
    expect(classifyCheckIn(9 * 60 + 15, office).isLate).toBe(false);
    expect(classifyCheckIn(9 * 60 + 16, office)).toEqual({ status: "late", isLate: true, lateMinutes: 16 });
  });

  it("marks under 5 hours as half day", () => {
    expect(classifyCheckOut(540, 540 + 4 * 60 + 59, false, 5).status).toBe("half_day");
    expect(classifyCheckOut(540, 540 + 5 * 60, false, 5).status).toBe("present");
    expect(classifyCheckOut(560, 560 + 8 * 60, true, 5)).toEqual({ hours: 8, status: "late" });
  });

  it("derives the day status", () => {
    const base = { today: "2026-10-21", onLeave: false, isWeekend: false, isHoliday: false, joinDate: "2026-10-01", exitDate: null };
    expect(dayStatus({ ...base, date: "2026-10-20" })).toBe("absent");
    expect(dayStatus({ ...base, date: "2026-10-20", onLeave: true })).toBe("on_leave");
    expect(dayStatus({ ...base, date: "2026-10-20", record: { status: "present", checkOut: null } })).toBe("missing_checkout");
    expect(dayStatus({ ...base, date: "2026-10-21", record: { status: "late", checkOut: null } })).toBe("late");
    expect(dayStatus({ ...base, date: "2026-10-18", isWeekend: true })).toBe("weekend");
    expect(dayStatus({ ...base, date: "2026-10-25" })).toBe("upcoming");
    expect(dayStatus({ ...base, date: "2026-09-30" })).toBe("not_joined");
  });

  it("computes attendance rate with half days as 0.5 and leave excluded", () => {
    const c = { ...emptyCounts(), present: 6, late: 1, half_day: 2, absent: 1, on_leave: 2 };
    // (6 + 1 + 0.5 * 2) / (12 - 2) = 80 %
    expect(attendanceRate(c)).toBe(80);
  });

  it("measures distance with Haversine", () => {
    expect(distanceMeters(24.8607, 67.0011, 24.8607, 67.0011)).toBe(0);
    const d = distanceMeters(24.8607, 67.0011, 24.8616, 67.0011);
    expect(d).toBeGreaterThan(95);
    expect(d).toBeLessThan(105);
  });
});

describe("leave working days", () => {
  it("skips weekends and holidays", () => {
    const days = workingDaysBetween("2026-10-23", "2026-10-27", [6, 0], new Set(["2026-10-27"]));
    expect(days).toEqual(["2026-10-23", "2026-10-26"]);
  });
});

describe("payroll rules", () => {
  it("gross is 1.5 × basic with HRA 40 % and medical 10 %", () => {
    expect(salaryBreakdown(100000)).toEqual({ basic: 100000, hra: 40000, medical: 10000, gross: 150000 });
  });

  it("applies the tax slab on gross × 12", () => {
    expect(annualTax(600000)).toBe(0);
    expect(annualTax(1200000)).toBe(30000);
    expect(annualTax(1800000)).toBe(120000);
    expect(annualTax(3000000)).toBe(360000);
    expect(annualTax(4000000)).toBe(650000);
  });

  it("deducts absent, unpaid and half days per working day", () => {
    const p = computePayslip({ basic: 100000, monthWorkingDays: 20, payableDays: 20, absentDays: 1, unpaidDays: 1, halfDays: 2, lateCount: 0, latePenalty: false });
    expect(p.perDay).toBe(7500);
    expect(p.deduction).toBe(22500); // (1 + 1 + 0.5 × 2) × 7 500
    expect(p.tax).toBe(Math.round(annualTax(1800000) / 12));
    expect(p.net).toBe(150000 - 22500 - 10000);
  });

  it("prorates joiners and applies the late penalty bonus rule", () => {
    const p = computePayslip({ basic: 100000, monthWorkingDays: 20, payableDays: 10, absentDays: 0, unpaidDays: 0, halfDays: 0, lateCount: 7, latePenalty: true });
    expect(p.earnedGross).toBe(75000);
    expect(p.latePenaltyDays).toBe(1); // 7 lates → 2 × 0.5 day
    expect(p.deduction).toBe(7500);
  });
});

describe("dates", () => {
  it("gives local date and minutes in the company time zone", () => {
    const parts = localParts(new Date("2026-10-24T20:30:00Z"), "Asia/Karachi");
    expect(parts).toEqual({ date: "2026-10-25", minutes: 90, time: "01:30" });
  });

  it("gives month ranges", () => {
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
});
