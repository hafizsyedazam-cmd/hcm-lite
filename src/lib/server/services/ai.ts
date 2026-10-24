import "server-only";
import { z } from "zod";
import { db, nowIso } from "../firebase-admin";
import { ApiError, forbidden } from "../http";
import type { Actor } from "../auth";
import { listDepartments, listDesignations, listLeaveTypes, requireSettings } from "./org";
import { allEmployees, decorate } from "./employees";
import { companyMetrics, resolveFilters, type CompanyMetrics } from "./analytics";
import { employeeCalendar } from "./attendance";
import { balancesFor } from "./leave";
import { myPayslips } from "./payroll";
import { addDays, isIsoDate, localParts, WEEKDAYS } from "@/lib/shared/dates";
import type { CompanySettings, Role } from "@/lib/shared/types";

// ---------- Provider (any OpenAI-compatible chat API with tool calling) ----------

const TIMEOUT_MS = 15_000;
const LIMIT_PER_HOUR = 20;

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  roles: Role[];
  run: (actor: Actor, args: Record<string, unknown>) => Promise<unknown>;
}

function config() {
  const key = process.env.AI_API_KEY;
  if (!key) throw new ApiError(503, "The AI assistant is not configured yet (AI_API_KEY is missing). Please use the normal screens.");
  return {
    key,
    baseUrl: (process.env.AI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/$/, ""),
    model: process.env.AI_MODEL || "gemini-3.5-flash-lite",
    // Used once when the main model is rate limited (free tiers have low per-minute limits).
    fallbackModel: process.env.AI_FALLBACK_MODEL ?? "gemini-3.1-flash-lite",
  };
}

async function complete(messages: ChatMessage[], tools?: ToolDef[], json = false) {
  const { key, baseUrl, model, fallbackModel } = config();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const request = (m: string) =>
    fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: m,
        messages,
        temperature: 0.2,
        ...(tools?.length
          ? { tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })), tool_choice: "auto" }
          : {}),
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
  try {
    let res = await request(model);
    if (res.status === 429 && fallbackModel && fallbackModel !== model) res = await request(fallbackModel);
    if (!res.ok) {
      const text = await res.text();
      console.error("AI provider error", res.status, text.slice(0, 500));
      if (res.status === 429) throw new ApiError(503, "The AI service is busy right now. Please try again in a minute.");
      throw new ApiError(502, "The AI service is not available right now. Please try again later.");
    }
    const data = await res.json();
    return data.choices?.[0]?.message as ChatMessage;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new ApiError(504, "The AI took too long to answer (15 s). Please try again.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Guardrails: rate limit + logging ----------

async function checkRate(actor: Actor) {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const snap = await db().collection("aiLogs").where("uid", "==", actor.uid).get();
  const recent = snap.docs.filter((d) => (d.data().at as string) >= since).length;
  if (recent >= LIMIT_PER_HOUR) throw new ApiError(429, `You have used the AI assistant ${LIMIT_PER_HOUR} times in the last hour. Please try again later.`);
}

async function log(actor: Actor, kind: string, input: string, result: { ok: boolean; tools?: string[]; error?: string; ms: number; output?: string }) {
  await db()
    .collection("aiLogs")
    .add({ uid: actor.uid, name: actor.name, role: actor.role, kind, input: input.slice(0, 1000), output: (result.output ?? "").slice(0, 2000), ...result, at: nowIso() });
}

async function guarded<T>(actor: Actor, kind: string, input: string, fn: (tools: string[]) => Promise<T>, output: (r: T) => string): Promise<T> {
  await checkRate(actor);
  const started = Date.now();
  const tools: string[] = [];
  try {
    const result = await fn(tools);
    await log(actor, kind, input, { ok: true, tools, ms: Date.now() - started, output: output(result) });
    return result;
  } catch (e) {
    await log(actor, kind, input, { ok: false, tools, ms: Date.now() - started, error: (e as Error).message });
    throw e;
  }
}

// ---------- Policy (Section 3 rules) ----------

function policyText(s: CompanySettings, leaveTypes: { name: string; quota: number | null; paid: boolean }[]) {
  const weekend = s.weekend.map((d) => WEEKDAYS[d]).join(" and ") || "none";
  return `Company policy for ${s.companyName}:
- Office hours ${s.officeStart} to ${s.officeEnd}, time zone ${s.timezone}. Weekend: ${weekend}.
- Grace time ${s.graceMinutes} minutes: checking in after ${s.officeStart} + ${s.graceMinutes} min counts as late.
- Working less than ${s.halfDayHours} hours in a day counts as a half day.
- A working day with no attendance record and no approved leave is absent. Check-in without check-out is "missing checkout".
- One attendance record per employee per day; the server stamps the time. Mistakes are fixed with an attendance correction request that HR approves.
- Leave counts working days only (weekends and public holidays are skipped). Overlapping requests or requests above the remaining balance are rejected.
- Leave types and yearly quotas: ${leaveTypes.map((t) => `${t.name} ${t.quota == null ? "unlimited" : `${t.quota} days`}${t.paid ? "" : " (unpaid)"}`).join(", ") || "not configured yet"}.
- HR approves or rejects leave with a comment. Employees can cancel pending leave, or approved leave that has not started.
- Salary: gross = 1.5 x basic (house rent allowance 40% of basic, medical 10% of basic).
- Per-day rate = gross / working days in the month. Deductions: absent days + unpaid leave days + 0.5 x half days${s.latePenalty ? " + 0.5 day for every 3 late arrivals" : ""}. Joiners and leavers are prorated.
- Income tax (illustrative) on gross x 12: up to 600,000 = 0; up to 1,200,000 = 5% of the amount above 600,000; up to 2,400,000 = 30,000 + 15% above 1,200,000; up to 3,600,000 = 210,000 + 25% above 2,400,000; above that 510,000 + 35% above 3,600,000. Monthly tax = annual tax / 12.
- HR prepares the monthly payroll draft; only Admin can finalize it, and a finalized month is locked.
- Employees can only see their own attendance, leave and payslips. Salaries of other people are confidential.`;
}

// ---------- Tools (same services + permission checks as the REST API) ----------

const rangeParams = {
  type: "object",
  properties: {
    from: { type: "string", description: "Start date YYYY-MM-DD. Default: first day of the current month." },
    to: { type: "string", description: "End date YYYY-MM-DD. Default: today." },
    department: { type: "string", description: "Department name to filter by. Omit for all departments." },
  },
};

async function filtersFrom(args: Record<string, unknown>) {
  let departmentId: string | undefined;
  if (typeof args.department === "string" && args.department.trim()) {
    const deps = await listDepartments();
    const wanted = args.department.trim().toLowerCase();
    const dep = deps.find((d) => d.name.toLowerCase() === wanted) ?? deps.find((d) => d.name.toLowerCase().includes(wanted));
    if (!dep) return { error: `No department named "${args.department}". Departments: ${deps.map((d) => d.name).join(", ") || "none yet"}` };
    departmentId = dep.id;
  }
  return resolveFilters({
    from: typeof args.from === "string" && isIsoDate(args.from) ? args.from : undefined,
    to: typeof args.to === "string" && isIsoDate(args.to) ? args.to : undefined,
    departmentId,
  });
}

const TOOLS: ToolDef[] = [
  {
    name: "get_headcount",
    description: "Number of active employees (active + probation), optionally for one department, plus headcount by department, exits and attrition.",
    parameters: rangeParams,
    roles: ["admin", "hr"],
    run: async (actor, args) => {
      const f = await filtersFrom(args);
      if ("error" in f) return f;
      const m = await companyMetrics(actor, f);
      return { asOf: m.filters.to, department: m.filters.department, headcount: m.headcount, probation: m.probation, byDepartment: m.headcountByDept, exitsInRange: m.exits, attritionPercent: m.attrition, attritionYtdPercent: m.attritionYtd };
    },
  },
  {
    name: "get_attendance_summary",
    description: "Attendance rate, late %, absenteeism and status counts for a date range, plus today's present / late / on leave counts.",
    parameters: rangeParams,
    roles: ["admin", "hr"],
    run: async (actor, args) => {
      const f = await filtersFrom(args);
      if ("error" in f) return f;
      const m = await companyMetrics(actor, f);
      return {
        range: m.filters,
        attendanceRatePercent: m.attendance.rate,
        latePercent: m.attendance.latePercent,
        absenteeismPercent: m.attendance.absenteeism,
        counts: m.attendance.counts,
        byDepartment: m.attendance.absenteeismByDept,
        today: m.today,
      };
    },
  },
  {
    name: "get_late_comers",
    description: "Employees who came late most often in a date range (top 5), and who was late today.",
    parameters: rangeParams,
    roles: ["admin", "hr"],
    run: async (actor, args) => {
      const f = await filtersFrom(args);
      if ("error" in f) return f;
      const m = await companyMetrics(actor, f);
      return { range: m.filters, topLateComers: m.attendance.topLate, lateToday: m.today.lateNames };
    },
  },
  {
    name: "get_leave_summary",
    description: "Approved leave days by type and department in a range, who is on leave today, and pending leave approvals.",
    parameters: rangeParams,
    roles: ["admin", "hr"],
    run: async (actor, args) => {
      const f = await filtersFrom(args);
      if ("error" in f) return f;
      const m = await companyMetrics(actor, f);
      return { range: m.filters, byType: m.leave.byType, byDepartment: m.leave.byDept, onLeaveToday: m.today.onLeaveList, pendingLeaveApprovals: m.pendingApprovals.leave };
    },
  },
  {
    name: "get_payroll_summary",
    description: "Latest payroll run cost (gross and net) by department, and average gross salary by department and designation.",
    parameters: rangeParams,
    roles: ["admin", "hr"],
    run: async (actor, args) => {
      const f = await filtersFrom(args);
      if ("error" in f) return f;
      const m = await companyMetrics(actor, f);
      return m.payroll;
    },
  },
  {
    name: "search_employees",
    description: "Find employees by name, code or email, optionally in one department. Returns job details and salary.",
    parameters: { type: "object", properties: { query: { type: "string" }, department: { type: "string" } } },
    roles: ["admin", "hr"],
    run: async (_actor, args) => {
      const [list, deps, desigs] = await Promise.all([allEmployees(), listDepartments(), listDesignations()]);
      const q = String(args.query ?? "").toLowerCase();
      const dep = String(args.department ?? "").toLowerCase();
      return list
        .map((e) => decorate(e, deps, desigs))
        .filter((e) => (!q || [e.name, e.code, e.email].some((v) => v.toLowerCase().includes(q))) && (!dep || e.departmentName.toLowerCase().includes(dep)))
        .slice(0, 20)
        .map((e) => ({ name: e.name, code: e.code, department: e.departmentName, designation: e.designationName, status: e.status, joinDate: e.joinDate, exitDate: e.exitDate, basic: e.basic, gross: e.gross }));
    },
  },
  {
    name: "get_my_leave_balance",
    description: "The signed-in employee's own leave balance for this year: quota, used (approved), pending and remaining per leave type.",
    parameters: { type: "object", properties: {} },
    roles: ["employee"],
    run: async (actor) => {
      const s = await requireSettings();
      return balancesFor(actor.employeeId!, localParts(new Date(), s.timezone).date.slice(0, 4));
    },
  },
  {
    name: "get_my_attendance",
    description: "The signed-in employee's own attendance for a month: days by status, late count and hours.",
    parameters: { type: "object", properties: { month: { type: "string", description: "YYYY-MM, default current month" } } },
    roles: ["employee"],
    run: async (actor, args) => {
      const s = await requireSettings();
      const month = typeof args.month === "string" && /^\d{4}-\d{2}$/.test(args.month) ? args.month : localParts(new Date(), s.timezone).date.slice(0, 7);
      const c = await employeeCalendar(actor, actor.employeeId!, month);
      return { month, summary: c.summary, lateCount: c.lateCount, hours: c.hours };
    },
  },
  {
    name: "get_my_payslips",
    description: "The signed-in employee's own finalized payslips (gross, deductions, tax, net).",
    parameters: { type: "object", properties: {} },
    roles: ["employee"],
    run: async (actor) =>
      (await myPayslips(actor)).slice(0, 6).map((p) => ({ month: p.month, gross: p.earnedGross, deduction: p.deduction, tax: p.tax, net: p.net, absentDays: p.absentDays })),
  },
];

function toolsFor(role: Role) {
  return TOOLS.filter((t) => t.roles.includes(role));
}

async function systemPrompt(actor: Actor) {
  const [s, types] = await Promise.all([requireSettings(), listLeaveTypes()]);
  const now = localParts(new Date(), s.timezone);
  const scope =
    actor.role === "employee"
      ? `The user is an EMPLOYEE (${actor.name}). They may only see their OWN data. If they ask about another person's salary, attendance, leave or any private data, politely refuse and explain it is confidential. Never guess numbers.`
      : actor.role === "hr"
        ? `The user is HR (${actor.name}). They can see employee, attendance, leave and payroll data for the whole company.`
        : `The user is the ADMIN (${actor.name}). They can see all company data.`;
  return `You are the HCM Lite assistant for ${s.companyName}. Today is ${WEEKDAYS[new Date(now.date + "T00:00:00Z").getUTCDay()]} ${now.date}, local time ${now.time}.
${scope}
Rules:
- The database is the only source of truth. For any number or fact about people, call a tool and answer only from the tool result. If no tool can answer, say you do not have that information.
- For policy questions, answer only from the policy below; if the policy does not cover it, say you do not know.
- You cannot create, change or approve anything; tell the user which screen to use instead.
- Keep answers short and clear. Use names and numbers exactly as the tools return them.
- Language: answer in the same language as the user's latest message. English question → English answer. Only when the user writes Roman Urdu (Urdu in English letters, e.g. "meri kitni chuttiyan baqi hain") reply in simple Roman Urdu.

${policyText(s, types)}`;
}

// ---------- Public features ----------

export const chatSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }))
    .min(1)
    .max(20),
});

export async function chat(actor: Actor, input: z.infer<typeof chatSchema>) {
  const last = input.messages[input.messages.length - 1];
  if (last.role !== "user" || !last.content.trim()) throw new ApiError(422, "Please type a question");
  return guarded(
    actor,
    "chat",
    last.content,
    async (used) => {
      const tools = toolsFor(actor.role);
      const messages: ChatMessage[] = [{ role: "system", content: await systemPrompt(actor) }, ...input.messages.slice(-10)];
      for (let step = 0; step < 5; step++) {
        const reply = await complete(messages, tools);
        if (!reply) throw new ApiError(502, "The AI returned an empty answer. Please try again.");
        if (!reply.tool_calls?.length) return { answer: reply.content?.trim() || "Sorry, I could not find an answer.", tools: used };
        messages.push({ role: "assistant", content: reply.content ?? null, tool_calls: reply.tool_calls });
        for (const call of reply.tool_calls) {
          const tool = tools.find((t) => t.name === call.function.name);
          let result: unknown;
          if (!tool) {
            result = { error: "This information is not available to you." };
          } else {
            used.push(tool.name);
            try {
              result = await tool.run(actor, JSON.parse(call.function.arguments || "{}"));
            } catch (e) {
              result = { error: e instanceof ApiError ? e.message : "Tool failed" };
            }
          }
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
        }
      }
      return { answer: "Sorry, that question needed too many steps. Please ask something more specific.", tools: used };
    },
    (r) => r.answer,
  );
}

/** 3–5 insight bullets that use only the KPI numbers for the current filters. */
export async function summarize(actor: Actor, filters: { from?: string; to?: string; departmentId?: string }) {
  if (actor.role === "employee") throw forbidden();
  const f = await resolveFilters(filters);
  const m = await companyMetrics(actor, f);
  const kpis = compactKpis(m, actor.role);
  return guarded(
    actor,
    "summary",
    JSON.stringify(kpis.filters),
    async () => {
      const schema = z.object({ bullets: z.array(z.string().min(3).max(300)).min(3).max(5) });
      const messages: ChatMessage[] = [
        {
          role: "system",
          content:
            'You write short HR dashboard insights. Use ONLY the numbers in the JSON the user sends; never invent numbers or names. Return JSON: {"bullets": ["...", "..."]} with 3 to 5 bullets, each one sentence, most important first. Mention concrete numbers. If data is empty, say so plainly.',
        },
        { role: "user", content: JSON.stringify(kpis) },
      ];
      for (let attempt = 0; attempt < 2; attempt++) {
        const reply = await complete(messages, undefined, true);
        const parsed = schema.safeParse(parseJson(reply?.content));
        if (parsed.success) return { bullets: parsed.data.bullets, kpis };
      }
      throw new ApiError(502, "The AI summary could not be generated. The dashboard numbers above are still correct.");
    },
    (r) => r.bullets.join(" | "),
  );
}

function compactKpis(m: CompanyMetrics, role: Role) {
  return {
    filters: m.filters,
    headcount: m.headcount,
    probation: m.probation,
    exitsInRange: m.exits,
    attritionPercent: m.attrition,
    attritionYtdPercent: m.attritionYtd,
    attendanceRatePercent: m.attendance.rate,
    latePercent: m.attendance.latePercent,
    absenteeismPercent: m.attendance.absenteeism,
    statusCounts: m.attendance.counts,
    absenteeismByDepartment: m.attendance.absenteeismByDept,
    topLateComers: m.attendance.topLate.map((t) => ({ name: t.name, lateCount: t.lateCount })),
    today: { present: m.today.present, late: m.today.late, onLeave: m.today.onLeave, notCheckedIn: m.today.notCheckedIn },
    pendingApprovals: m.pendingApprovals,
    leaveByType: m.leave.byType,
    ...(role === "admin" || role === "hr"
      ? { payrollCost: m.payroll.cost, avgGrossSalary: m.payroll.avgSalary, headcountByDepartment: m.headcountByDept }
      : {}),
  };
}

export const smartLeaveSchema = z.object({ text: z.string().trim().min(5).max(500) });

/** "Need next Monday and Tuesday off for a wedding" → { type, start, end, reason }. The user confirms. */
export async function smartLeave(actor: Actor, text: string) {
  if (actor.role !== "employee" || !actor.employeeId) throw forbidden("Smart leave is for employees");
  const [s, types] = await Promise.all([requireSettings(), listLeaveTypes()]);
  if (!types.length) throw new ApiError(422, "Admin has not set up leave types yet");
  const now = localParts(new Date(), s.timezone);
  const calendar = Array.from({ length: 21 }, (_, i) => {
    const d = addDays(now.date, i);
    return `${WEEKDAYS[new Date(d + "T00:00:00Z").getUTCDay()]} ${d}`;
  }).join(", ");
  const codes = types.map((t) => t.code);
  const schema = z
    .object({
      type: z.string().transform((v) => v.toLowerCase().trim()),
      start: z.string().refine(isIsoDate),
      end: z.string().refine(isIsoDate),
      reason: z.string().min(2).max(300),
    })
    .refine((v) => codes.includes(v.type), "unknown type")
    .refine((v) => v.end >= v.start, "end before start");

  return guarded(
    actor,
    "smart_leave",
    text,
    async () => {
      const messages: ChatMessage[] = [
        {
          role: "system",
          content: `Convert an employee's leave request into JSON. Today is ${WEEKDAYS[new Date(now.date + "T00:00:00Z").getUTCDay()]} ${now.date}.
Next 3 weeks for reference: ${calendar}.
"Next Monday" means the first Monday after today. Leave types (use the code): ${types.map((t) => `${t.code} = ${t.name}`).join("; ")}.
Pick sick for illness, annual for vacations or long trips, casual for short personal matters such as weddings, family events or errands, unpaid only if the user asks for unpaid leave.
The user may write in English or Roman Urdu. Return ONLY JSON: {"type": "<code>", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "reason": "<short reason in English>"}.`,
        },
        { role: "user", content: text },
      ];
      for (let attempt = 0; attempt < 2; attempt++) {
        const reply = await complete(messages, undefined, true);
        const parsed = schema.safeParse(parseJson(reply?.content));
        if (parsed.success) {
          const type = types.find((t) => t.code === parsed.data.type)!;
          return { ok: true as const, draft: { typeId: type.id, typeCode: type.code, typeName: type.name, start: parsed.data.start, end: parsed.data.end, reason: parsed.data.reason } };
        }
      }
      // Validation failed twice: the screen falls back to the normal form.
      return { ok: false as const, message: "I could not understand the dates. Please fill in the form below." };
    },
    (r) => JSON.stringify(r),
  );
}

function parseJson(text: string | null | undefined): unknown {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export async function aiStatus() {
  return { configured: !!process.env.AI_API_KEY, model: process.env.AI_MODEL || "gemini-3.5-flash-lite" };
}
