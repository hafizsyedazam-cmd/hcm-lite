import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { db, nowIso, rows } from "../firebase-admin";
import { conflict, forbidden, notFound, unprocessable } from "../http";
import type { Actor } from "../auth";
import { audit, notify } from "./comms";
import { holidaySet, listDepartments, listDesignations, requireSettings } from "./org";
import { allEmployees, getEmployee } from "./employees";
import { buildGrid } from "./attendance";
import { localParts, monthRange, prettyMonth, workingDaysBetween } from "@/lib/shared/dates";
import { computePayslip } from "@/lib/shared/rules";
import type { Employee, PayrollRun, Payslip } from "@/lib/shared/types";

const runs = () => db().collection("payrollRuns");
const slips = () => db().collection("payslips");
const MONTH = /^\d{4}-\d{2}$/;

/** Employees on the books for at least one day of the month with a salary set. */
function inMonth(e: Employee, from: string, to: string) {
  return e.basic > 0 && e.joinDate <= to && (!e.exitDate || e.exitDate >= from);
}

export async function listRuns(actor: Actor) {
  if (actor.role === "employee") throw forbidden();
  return rows<PayrollRun>(await runs().get()).sort((a, b) => b.month.localeCompare(a.month));
}

export async function getRun(actor: Actor, month: string) {
  if (actor.role === "employee") throw forbidden();
  const snap = await runs().doc(month).get();
  if (!snap.exists) throw notFound("No payroll run for this month yet");
  const [list, departments, designations] = await Promise.all([
    rows<Payslip>(await slips().where("month", "==", month).get()),
    listDepartments(),
    listDesignations(),
  ]);
  return {
    run: { id: snap.id, ...snap.data() } as PayrollRun,
    payslips: list
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((p) => ({
        ...p,
        departmentName: departments.find((d) => d.id === p.departmentId)?.name ?? "—",
        designationName: designations.find((d) => d.id === p.designationId)?.name ?? "—",
      })),
  };
}

/**
 * HR creates (or re-creates) the monthly draft. Absent days are counted up to
 * today only; days still ahead in the month are treated as payable.
 */
export async function generateDraft(actor: Actor, month: string) {
  if (actor.role !== "hr") throw forbidden("Only HR prepares the payroll draft");
  if (!MONTH.test(month)) throw unprocessable("month must be YYYY-MM");
  const s = await requireSettings();
  const today = localParts(new Date(), s.timezone).date;
  if (month > today.slice(0, 7)) throw unprocessable("Payroll cannot be run for a future month");
  const existing = await runs().doc(month).get();
  if (existing.exists && existing.data()?.status === "finalized") throw conflict("This month is finalized and locked");

  const { from, to } = monthRange(month);
  const holidays = await holidaySet();
  const monthDays = workingDaysBetween(from, to, s.weekend, holidays);
  const employees = (await allEmployees()).filter((e) => inMonth(e, from, to));
  if (employees.length === 0) throw unprocessable("No employees with a salary in this month");
  const { grid } = await buildGrid(employees, from, to);

  const createdAt = nowIso();
  const list: Payslip[] = employees.map((e) => {
    const days = grid.get(e.id)!;
    const employed = days.filter((d) => d.status !== "not_joined" && monthDays.includes(d.date));
    const counted = employed.filter((d) => d.date <= today);
    const absentDays = counted.filter((d) => d.status === "absent").length;
    const unpaidDays = counted.filter((d) => d.status === "on_leave" && d.leaveType === "unpaid").length;
    const halfDays = counted.filter((d) => d.status === "half_day").length;
    const lateCount = days.filter((d) => d.record?.isLate).length;
    const calc = computePayslip({
      basic: e.basic,
      monthWorkingDays: monthDays.length,
      payableDays: employed.length,
      absentDays,
      unpaidDays,
      halfDays,
      lateCount,
      latePenalty: s.latePenalty,
    });
    return {
      id: `${month}_${e.id}`,
      month,
      runStatus: "draft",
      employeeId: e.id,
      employeeName: e.name,
      code: e.code,
      departmentId: e.departmentId,
      designationId: e.designationId,
      workingDays: monthDays.length,
      payableDays: employed.length,
      absentDays,
      unpaidDays,
      halfDays,
      lateCount,
      ...calc,
      createdAt,
    };
  });

  const totals = list.reduce(
    (t, p) => ({
      employees: t.employees + 1,
      gross: t.gross + p.earnedGross,
      deductions: t.deductions + p.deduction,
      tax: t.tax + p.tax,
      net: t.net + p.net,
    }),
    { employees: 0, gross: 0, deductions: 0, tax: 0, net: 0 },
  );
  const run: Omit<PayrollRun, "id"> = {
    month,
    status: "draft",
    workingDays: monthDays.length,
    totals,
    createdBy: actor.name,
    createdAt: existing.exists ? (existing.data()?.createdAt as string) : createdAt,
    updatedAt: createdAt,
    finalizedBy: null,
    finalizedAt: null,
  };

  const old = await slips().where("month", "==", month).get();
  const batch = db().batch();
  old.docs.forEach((d) => batch.delete(d.ref));
  list.forEach((p) => batch.set(slips().doc(p.id), p));
  batch.set(runs().doc(month), run);
  await batch.commit();
  await audit(actor, existing.exists ? "regenerate" : "create", "payroll_run", month, existing.data() ?? null, { ...run, payslips: list.length });
  return { run: { id: month, ...run }, count: list.length };
}

/** Only Admin finalizes; a finalized run can never be edited again. */
export async function finalizeRun(actor: Actor, month: string) {
  if (actor.role !== "admin") throw forbidden("Only Admin can finalize payroll");
  const ref = runs().doc(month);
  const result = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound("No payroll draft for this month");
    if (snap.data()?.status === "finalized") throw conflict("This month is already finalized");
    const patch = { status: "finalized", finalizedBy: actor.name, finalizedAt: nowIso() };
    tx.update(ref, patch);
    return { before: snap.data(), patch };
  });
  const list = rows<Payslip>(await slips().where("month", "==", month).get());
  const batch = db().batch();
  list.forEach((p) => batch.update(slips().doc(p.id), { runStatus: "finalized" }));
  await batch.commit();
  await audit(actor, "finalize", "payroll_run", month, { status: result.before?.status }, result.patch);
  const employees = await allEmployees();
  await Promise.all(
    list.map((p) => {
      const e = employees.find((x) => x.id === p.employeeId);
      return e ? notify(e.uid, "Payslip ready", `Your payslip for ${prettyMonth(month)} is ready to download`, "/payslips") : null;
    }),
  );
  return { month, ...result.patch };
}

export async function myPayslips(actor: Actor) {
  if (!actor.employeeId) throw forbidden("Only employees have payslips");
  const list = rows<Payslip>(await slips().where("employeeId", "==", actor.employeeId).get());
  return list.filter((p) => p.runStatus === "finalized").sort((a, b) => b.month.localeCompare(a.month));
}

export async function getPayslip(actor: Actor, id: string): Promise<Payslip> {
  const snap = await slips().doc(id).get();
  if (!snap.exists) throw notFound("Payslip not found");
  const p = { id, ...snap.data() } as Payslip;
  if (actor.role === "employee" && (p.employeeId !== actor.employeeId || p.runStatus !== "finalized")) throw forbidden();
  return p;
}

export async function payslipPdf(actor: Actor, id: string): Promise<Uint8Array> {
  const p = await getPayslip(actor, id);
  const [s, e, departments, designations] = await Promise.all([requireSettings(), getEmployee(p.employeeId), listDepartments(), listDesignations()]);
  const money = (n: number) => `${s.currency} ${Math.round(n).toLocaleString("en-US")}`;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const orange = rgb(0.95, 0.4, 0.13);
  const dark = rgb(0.07, 0.09, 0.15);
  const grey = rgb(0.42, 0.45, 0.5);
  const text = (t: string, x: number, y: number, size = 10, f = font, color = dark) => page.drawText(t, { x, y, size, font: f, color });

  page.drawRectangle({ x: 0, y: 772, width: 595, height: 70, color: orange });
  text(s.companyName, 40, 805, 20, bold, rgb(1, 1, 1));
  text(`Payslip · ${prettyMonth(p.month)}`, 40, 785, 11, font, rgb(1, 1, 1));
  if (p.runStatus !== "finalized") text("DRAFT", 480, 795, 18, bold, rgb(1, 1, 1));

  let y = 740;
  const info: [string, string][] = [
    ["Employee", `${e.name} (${e.code})`],
    ["Department", departments.find((d) => d.id === p.departmentId)?.name ?? "—"],
    ["Designation", designations.find((d) => d.id === p.designationId)?.name ?? "—"],
    ["Working days", `${p.workingDays} (payable ${p.payableDays})`],
  ];
  info.forEach(([k, v]) => {
    text(k, 40, y, 10, font, grey);
    text(v, 160, y, 10, bold);
    y -= 18;
  });

  const table = (title: string, lines: [string, string][], startY: number) => {
    let ty = startY;
    page.drawRectangle({ x: 40, y: ty - 6, width: 515, height: 22, color: rgb(0.93, 0.93, 0.93) });
    text(title, 48, ty, 11, bold);
    ty -= 24;
    lines.forEach(([k, v]) => {
      text(k, 48, ty);
      text(v, 555 - font.widthOfTextAtSize(v, 10) - 8, ty);
      page.drawLine({ start: { x: 40, y: ty - 6 }, end: { x: 555, y: ty - 6 }, thickness: 0.5, color: rgb(0.9, 0.9, 0.9) });
      ty -= 22;
    });
    return ty;
  };

  y = table(
    "Earnings",
    [
      ["Basic salary", money(p.basic)],
      ["House rent allowance (40%)", money(p.hra)],
      ["Medical allowance (10%)", money(p.medical)],
      ["Gross salary (1.5 x basic)", money(p.gross)],
      ["Earned gross (prorated)", money(p.earnedGross)],
    ],
    y - 20,
  );
  y = table(
    "Deductions",
    [
      [`Absent days (${p.absentDays})`, money(p.perDay * p.absentDays)],
      [`Unpaid leave days (${p.unpaidDays})`, money(p.perDay * p.unpaidDays)],
      [`Half days (${p.halfDays} x 0.5)`, money(p.perDay * 0.5 * p.halfDays)],
      ...(p.latePenaltyDays ? ([[`Late penalty (${p.lateCount} lates)`, money(p.perDay * p.latePenaltyDays)]] as [string, string][]) : []),
      ["Total attendance deductions", money(p.deduction)],
      ["Income tax (slab on gross x 12, monthly)", money(p.tax)],
    ],
    y - 16,
  );
  page.drawRectangle({ x: 40, y: y - 20, width: 515, height: 34, color: dark });
  text("NET PAY", 52, y - 8, 13, bold, rgb(1, 1, 1));
  const net = money(p.net);
  text(net, 555 - bold.widthOfTextAtSize(net, 14) - 12, y - 8, 14, bold, rgb(1, 1, 1));
  text(`Per-day rate ${money(p.perDay)} = gross / ${p.workingDays} working days. Generated by HCM Lite.`, 40, 60, 8, font, grey);
  return pdf.save();
}
