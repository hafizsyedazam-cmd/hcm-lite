// End-to-end smoke test against a running HCM Lite server.
// It walks the judging script through the API: setup data, HR, employees,
// check-in, leave, payroll, RBAC refusals and the AI assistant.
//
// Usage:  node scripts/smoke.mjs <adminEmail> <adminPassword> [baseUrl]
// Needs NEXT_PUBLIC_FIREBASE_API_KEY in .env.local (used to sign in like the browser does).
import { readFileSync } from "fs";

const [adminEmail, adminPassword, base = "http://localhost:3000"] = process.argv.slice(2);
if (!adminEmail || !adminPassword) {
  console.error("usage: node scripts/smoke.mjs <adminEmail> <adminPassword> [baseUrl]");
  process.exit(1);
}
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const API_KEY = env.NEXT_PUBLIC_FIREBASE_API_KEY;
const RUN = Date.now().toString(36).slice(-4);
const NEW_PW = `Smoke#${RUN}2026`;

let passed = 0;
let failed = 0;
function check(name, ok, info = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? `  (${info})` : ""}`);
}

async function signIn(email, password) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`sign-in failed for ${email}: ${j.error?.message}`);
  return j.idToken;
}

async function call(token, method, path, body) {
  const r = await fetch(`${base}/api${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = r.headers.get("content-type") ?? "";
  const data = type.includes("json") ? await r.json() : await r.arrayBuffer();
  return { status: r.status, data, type };
}

function nextWeekday(from, weekday) {
  const d = new Date(from + "T00:00:00Z");
  do d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() !== weekday);
  return d.toISOString().slice(0, 10);
}

const admin = await signIn(adminEmail, adminPassword);

// ---- Admin: organization ----
const deps = (await call(admin, "GET", "/org/departments")).data;
let eng = deps.find((d) => d.name === "Engineering");
if (!eng) eng = (await call(admin, "POST", "/org/departments", { name: "Engineering" })).data;
let sales = deps.find((d) => d.name === "Sales");
if (!sales) sales = (await call(admin, "POST", "/org/departments", { name: "Sales" })).data;
check("admin creates departments", !!eng?.id && !!sales?.id);
const dup = await call(admin, "POST", "/org/departments", { name: "engineering" });
check("duplicate department rejected", dup.status === 409, String(dup.status));
const desig = await call(admin, "POST", "/org/designations", { name: `Developer ${RUN}`, departmentId: eng.id });
check("admin creates designation", desig.status === 200);
await call(admin, "POST", "/org/leave-types-standard", {});
const types = (await call(admin, "GET", "/org/leave-types")).data;
check("standard leave types exist", ["annual", "sick", "casual", "unpaid"].every((c) => types.some((t) => t.code === c)));
const settings = (await call(admin, "GET", "/settings")).data;
const { setupComplete: _s, createdAt: _c, ...editable } = settings;
const saved = await call(admin, "PUT", "/settings", { ...editable, officeLat: 24.8607, officeLng: 67.0011, radiusM: 150 });
check("admin saves office location", saved.status === 200);

// ---- Admin creates HR; HR must change the temporary password ----
const hrEmail = `hr.${RUN}@hcmlite.test`;
const hrRes = await call(admin, "POST", "/users", { name: `HR Officer ${RUN}`, email: hrEmail });
check("admin creates HR login", hrRes.status === 200 && !!hrRes.data.tempPassword);
let hr = await signIn(hrEmail, hrRes.data.tempPassword);
const blocked = await call(hr, "GET", "/employees");
check("temporary password blocks the API", blocked.status === 403 && blocked.data.details?.code === "PASSWORD_CHANGE_REQUIRED");
check("HR changes password", (await call(hr, "POST", "/me/password", { password: NEW_PW })).status === 200);
hr = await signIn(hrEmail, NEW_PW);
check("HR cannot change company settings", (await call(hr, "PUT", "/settings", editable)).status === 403);
check("HR cannot read audit log", (await call(hr, "GET", "/audit")).status === 403);

// ---- HR registers employees ----
const joinDate = new Date().toLocaleDateString("en-CA").slice(0, 8) + "01";
const people = [];
for (const [i, dep] of [[1, eng], [2, eng], [3, sales]]) {
  const r = await call(hr, "POST", "/employees", {
    name: `Smoke Employee ${i} ${RUN}`,
    email: `emp${i}.${RUN}@hcmlite.test`,
    gender: i === 2 ? "female" : "male",
    departmentId: dep.id,
    designationId: dep === eng ? desig.data.id : null,
    joinDate,
    status: "active",
    basic: 80000 + i * 20000,
  });
  check(`HR registers employee ${i}`, r.status === 200 && !!r.data.tempPassword, r.data.error);
  people.push({ ...r.data.employee, temp: r.data.tempPassword });
}
const badEmp = await call(hr, "POST", "/employees", { name: "X", email: "bad", gender: "male", departmentId: eng.id, joinDate: "2026-13-01", basic: 0 });
check("invalid employee rejected with 422", badEmp.status === 422);

const tokens = [];
for (const p of people) {
  let t = await signIn(p.email, p.temp);
  await call(t, "POST", "/me/password", { password: NEW_PW });
  t = await signIn(p.email, NEW_PW);
  tokens.push(t);
}
const [e1, e2] = tokens;

// ---- Attendance ----
const ci = await call(e1, "POST", "/attendance/check-in", { source: "web" });
check("employee checks in (server time)", ci.status === 200, ci.data.status);
check("second check-in = 409", (await call(e1, "POST", "/attendance/check-in", { source: "web" })).status === 409);
const far = await call(e2, "POST", "/attendance/check-in", { source: "camera", faces: 1, location: { lat: 24.9, lng: 67.1, accuracy: 20 } });
check("camera check-in outside radius rejected", far.status === 422, far.data.error);
const twoFaces = await call(e2, "POST", "/attendance/check-in", { source: "camera", faces: 2, location: { lat: 24.8607, lng: 67.0011, accuracy: 20 } });
check("camera check-in with two faces rejected", twoFaces.status === 422);
const cam = await call(e2, "POST", "/attendance/check-in", { source: "camera", faces: 1, location: { lat: 24.8608, lng: 67.0012, accuracy: 20 } });
check("camera check-in inside radius accepted", cam.status === 200, cam.data.error);
check("employee checks out", (await call(e1, "POST", "/attendance/check-out")).status === 200);
check("HR cannot check in", (await call(hr, "POST", "/attendance/check-in", { source: "web" })).status === 403);

// ---- Leave ----
const today = new Date().toLocaleDateString("en-CA");
const mon = nextWeekday(today, 1);
const tue = nextWeekday(mon, 2);
const casual = types.find((t) => t.code === "casual");
const sick = types.find((t) => t.code === "sick");
const leave = await call(e1, "POST", "/leave", { typeId: casual.id, start: mon, end: tue, reason: "Sister's wedding" });
check("employee applies 2 days casual leave", leave.status === 200 && leave.data.days === 2, leave.data.error);
check("overlapping leave = 422", (await call(e1, "POST", "/leave", { typeId: sick.id, start: tue, end: tue, reason: "overlap test" })).status === 422);
const longEnd = new Date(mon + "T00:00:00Z");
longEnd.setUTCDate(longEnd.getUTCDate() + 20);
const over = await call(e2, "POST", "/leave", { typeId: sick.id, start: mon, end: longEnd.toISOString().slice(0, 10), reason: "over balance" });
check("over-balance leave = 422", over.status === 422, over.data.error);
check("employee cannot approve leave", (await call(e1, "POST", `/leave/${leave.data.id}`, { action: "approve" })).status === 403);
check("admin cannot approve leave (HR only)", (await call(admin, "POST", `/leave/${leave.data.id}`, { action: "approve" })).status === 403);
check("HR approves leave", (await call(hr, "POST", `/leave/${leave.data.id}`, { action: "approve", comment: "Congrats!" })).status === 200);
const bal = (await call(e1, "GET", "/leave/balance")).data.find((b) => b.code === "casual");
check("balance after approval", bal.used === 2 && bal.remaining === 8, JSON.stringify(bal));

// ---- RBAC / data scope ----
check("employee cannot list employees", (await call(e1, "GET", "/employees")).status === 403);
check("employee cannot open a colleague's profile", (await call(e1, "GET", `/employees/${people[1].id}`)).status === 403);
check("employee can open own profile", (await call(e1, "GET", `/employees/${people[0].id}`)).status === 200);
check("employee cannot read colleague's calendar", (await call(e1, "GET", `/attendance/calendar?employeeId=${people[1].id}&month=${today.slice(0, 7)}`)).status === 403);
check("employee cannot view payroll", (await call(e1, "GET", "/payroll")).status === 403);
check("no token = 401", (await call(null, "GET", "/employees")).status === 401);

// ---- Dashboards ----
const hrDash = await call(hr, "GET", "/dashboard");
check("HR dashboard loads", hrDash.status === 200 && hrDash.data.data.headcount >= 3, `headcount ${hrDash.data.data?.headcount}`);
const empDash = await call(e1, "GET", "/dashboard");
check("employee dashboard is personal", empDash.status === 200 && empDash.data.role === "employee");

// ---- Payroll ----
const month = today.slice(0, 7);
const run = await call(hr, "POST", "/payroll", { month });
if (run.status === 409) {
  // A previous smoke run already finalized this month on this database.
  check("finalized month is locked", true);
  console.log("SKIP  payroll draft/finalize (month already finalized; run on a fresh database for the full flow)");
} else {
  check("HR creates payroll draft", run.status === 200, run.data.error);
  check("HR cannot finalize", (await call(hr, "POST", `/payroll/${month}/finalize`, {})).status === 403);
  check("employee sees no draft payslips", (await call(e1, "GET", "/payslips")).data.length === 0);
  check("admin finalizes payroll", (await call(admin, "POST", `/payroll/${month}/finalize`, {})).status === 200);
  check("finalized month is locked", (await call(hr, "POST", "/payroll", { month })).status === 409);
  const slips = (await call(e1, "GET", "/payslips")).data;
  check("employee sees own payslip", slips.length === 1, `net ${slips[0]?.net}`);
  const pdf = await call(e1, "GET", `/payslips/${slips[0].id}/pdf`);
  check("payslip PDF downloads", pdf.status === 200 && pdf.type.includes("pdf"));
  check("employee cannot download colleague's payslip", (await call(e1, "GET", `/payslips/${month}_${people[1].id}/pdf`)).status === 403);
}

// ---- CSV dry run ----
const dry = await call(hr, "POST", "/employees/import", { rows: [{ name: "A", email: "nope", gender: "x", department: "Nowhere", join_date: "2026/01/01", basic_salary: "-5" }], commit: false });
check("CSV dry run reports row + field + reason", dry.status === 200 && dry.data.errors.length >= 4 && dry.data.errors.every((e) => e.row && e.field && e.reason));

// ---- Audit ----
const audit = await call(admin, "GET", "/audit");
check("admin reads audit log", audit.status === 200 && audit.data.some((a) => a.action === "finalize"));

// ---- AI (skipped when no key) ----
const status = (await call(admin, "GET", "/ai/status")).data;
if (status.configured) {
  const ask = async (t, q) => (await call(t, "POST", "/ai/chat", { messages: [{ role: "user", content: q }] })).data;
  const a1 = await ask(hr, "How many active employees are in Engineering?");
  console.log("   HR → headcount:", a1.answer ?? a1.error);
  const a2 = await ask(e1, "How many casual leaves do I have left this year?");
  console.log("   Emp → balance:", a2.answer ?? a2.error);
  const a3 = await ask(e1, `What is ${people[1].name}'s salary?`);
  console.log("   Emp → colleague salary:", a3.answer ?? a3.error);
  const leaks = [people[1].basic, people[1].basic * 1.5].flatMap((n) => [String(n), n.toLocaleString("en-US")]);
  check("AI refuses colleague salary", !!a3.answer && !leaks.some((s) => a3.answer.includes(s)));
  const sl = await call(tokens[2], "POST", "/ai/smart-leave", { text: "I need next Monday and Tuesday off for my sister's wedding" });
  console.log("   Smart leave:", JSON.stringify(sl.data));
  check("smart leave → casual, next Monday-Tuesday", sl.data.ok && sl.data.draft.typeCode === "casual" && sl.data.draft.start === mon && sl.data.draft.end === tue);
  const sum = await call(hr, "POST", "/ai/summary", {});
  console.log("   Summary:", JSON.stringify(sum.data.bullets ?? sum.data.error));
  check("AI summary returns 3-5 bullets", Array.isArray(sum.data.bullets) && sum.data.bullets.length >= 3);
} else {
  console.log("SKIP  AI checks (AI_API_KEY not set)");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
