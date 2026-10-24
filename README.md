# HCM Lite — AI-assisted HR system

Saylani Hackathon (24 Oct 2026) · Next.js + Firebase · Admin, HR and Employee roles · 9 modules · AI assistant with tool calling.

The system starts **empty**: the first visit runs first-run setup (company + Admin), Admin sets up the organization and creates HR logins, HR registers employees (which creates their logins), and every number on the dashboards and in AI answers comes from what people do in the app.

## Stack

| Layer | Choice |
| --- | --- |
| Web app | Next.js 16 (App Router, TypeScript), Bootstrap 5 grid + custom SmartHR-style theme, Tabler icons, ApexCharts |
| Backend | Next.js Route Handlers (`src/app/api/**`) → services with the business rules (`src/lib/server/services`) |
| Auth | Firebase Authentication (email + password). The browser sends the Firebase **ID token (JWT)** on every request; the server verifies it with the Admin SDK and loads the user's role and data scope. Passwords are hashed by Firebase (scrypt). |
| Database | Cloud Firestore, accessed **only** by the server (Admin SDK). Firestore rules deny all browser access (`firestore.rules`). |
| AI | Any OpenAI-compatible chat API with tool calling. Default: Google Gemini free tier (`gemini-3.5-flash-lite`, falls back to `gemini-3.1-flash-lite` when rate limited). |
| PDF / CSV | `pdf-lib` payslips, `papaparse` CSV import |
| Camera attendance (bonus) | MediaPipe face detector in the browser + Geolocation; server-side Haversine geofence |

## Run it locally (about 5 minutes)

Requirements: Node.js 20+ and a Firebase project.

```bash
npm install
cp .env.example .env.local      # then fill it in (see below)
npm run dev                     # http://localhost:3000
```

### 1. Firebase project

1. Create a project at <https://console.firebase.google.com>.
2. **Authentication → Get started → Email/Password → Enable.**
3. **Firestore Database → Create database** (any location; we use `asia-south1`).
4. **Project settings → Your apps → Web app (`</>`)** → copy `apiKey`, `authDomain`, `projectId`, `appId` into the `NEXT_PUBLIC_FIREBASE_*` variables.
5. **Project settings → Service accounts → Generate new private key** → save the JSON as `service-account.json` in the project root (it is git-ignored) and keep `FIREBASE_SERVICE_ACCOUNT_PATH=./service-account.json`.
6. Optional but recommended: deploy the locked-down rules: `npx firebase-tools deploy --only firestore:rules --project <your-project-id>`.

### 2. AI key

Create a free key at <https://aistudio.google.com> → *Get API key*, and set `AI_API_KEY` in `.env.local`. The key stays on the server; the browser never calls the AI provider. Any other OpenAI-compatible provider works by changing `AI_BASE_URL` and `AI_MODEL` (e.g. Groq or OpenAI).

### 3. First Admin

Open the app: a fresh install shows **first-run setup** (company name, time zone, Admin name, email, password). Alternatively set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the env file and the setup screen only asks for the company name.

### Reset to an empty database

```bash
npm run db:reset -- --yes
```

Deletes every Firestore document and every login in the configured project, so the next visit starts at first-run setup again.

## Deploy (Vercel, free)

1. Push this repo to GitHub and import it in Vercel.
2. Add the environment variables in **Vercel → Settings → Environment Variables**: the four `NEXT_PUBLIC_FIREBASE_*` values, `AI_API_KEY`, `AI_MODEL`, `AI_FALLBACK_MODEL`, and the Admin SDK key as `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (copy from the service-account JSON; paste the private key with its `\n` characters).
3. In Firebase → Authentication → Settings → **Authorized domains**, add your `*.vercel.app` domain.
4. `vercel.json` pins the functions to `bom1` (Mumbai), close to the Firestore region.

Only `.env.example` is committed — never the real AI key or service-account file.

## Tests

```bash
npm test                                   # unit tests for the business rules (Vitest)
npm run typecheck
npm run smoke -- <adminEmail> <adminPassword>   # end-to-end API walk-through against a running server
```

The smoke test follows the judging script through the API: departments and leave types, HR login with forced password change, employee registration, check-in (second check-in = 409), camera geofence rejections, leave with overlap / over-balance = 422, HR approval, role and data-scope refusals (403/401), payroll draft → Admin finalize → locked (409), payslip PDF, CSV dry-run report, audit log and the AI questions judges will ask.

## Roles and access

Access is checked on the server for every request (`src/lib/server/auth.ts`), never only by hiding buttons. The AI assistant runs its tools with the same user and the same checks.

| | Admin | HR | Employee |
| --- | --- | --- | --- |
| Company settings, departments, designations, leave types, holidays | Manage | View | — |
| HR logins; deactivate / reset any login | Manage | — | — |
| Register / edit employees (creates login), salary | View | Manage | Own profile; edit phone & address |
| Check in / out | — | — | Own (web + camera) |
| Attendance board, corrections | View | Approve | Request own |
| Leave | View all | Approve / reject with comment | Apply, cancel, balance |
| Payroll | Finalize (locks month) | Create / refresh draft | Own payslips (PDF) |
| Dashboards | Company | HR | Personal |
| Audit log | View | — | — |
| AI assistant | All company data | HR data | Own data + policy |

## Business rules (Section 3)

All rules live in pure functions in `src/lib/shared/rules.ts` (unit-tested) and are applied by the services:

- **Attendance:** server stamps the time in the company time zone; one record per employee per day (second check-in → **409**); late after 09:00 + 15 min grace; half day under 5 h; absent = working day with no record and no approved leave; missing checkout = check-in without check-out. Rules are saved with each record, so changed settings apply to new records only.
- **Leave:** working days only (weekends and public holidays skipped); quotas annual 14, sick 8, casual 10, unpaid unlimited; overlap or over-balance → **422**; HR approves with a comment.
- **Payroll:** gross = 1.5 × basic (HRA 40 %, medical 10 %); per day = gross ÷ working days; deductions = absent + unpaid + 0.5 × half days; joiners and leavers prorated; tax slab on gross × 12 (0 to 600k, 5 % to 1.2M, 30k + 15 % to 2.4M, 210k + 25 % to 3.6M, 510k + 35 % above); Admin finalizes and the month is locked.
- **Metrics (Section 7):** headcount (active + probation on the end date), attrition (exits ÷ average headcount), attendance rate `(present + late + missing_checkout + 0.5 × half_day) ÷ (working-day records − on_leave)`, late %, absenteeism per department, leave utilization per type, payroll cost and average salary by department / designation. All computed on the server, filterable by date range and department.

## AI assistant (M8)

- **Chat** (`POST /api/ai/chat`): the model picks a tool, the server runs it with the user's scope, the model writes the answer. Tools: `get_headcount`, `get_attendance_summary`, `get_late_comers`, `get_leave_summary`, `get_payroll_summary`, `search_employees` (Admin/HR) and `get_my_leave_balance`, `get_my_attendance`, `get_my_payslips` (Employee). Employees have no tool that can read another person's data, and the prompt tells the model to refuse.
- **Dashboard summary** (`POST /api/ai/summary`): the server recomputes the KPI JSON for the current filters and asks for 3–5 bullets that use only those numbers.
- **Smart leave** (`POST /api/ai/smart-leave`): "Need next Monday and Tuesday off for a wedding" → `{type, start, end, reason}` → pre-filled form the employee confirms.
- **Policy Q&A:** the Section 3 rules (with the company's actual settings) are in the system prompt; the model answers only from them.
- **Guardrails:** key only in a server env variable; JSON output validated with Zod, retried once, then the normal form; 15 s timeout with a friendly message; 20 requests per user per hour; every call logged in `aiLogs`; answers labelled *AI-generated*; replies in Roman Urdu when asked in Roman Urdu.

## Project structure

```
src/
  app/
    api/…                 REST routes (thin: authenticate → service)
    (app)/…               signed-in screens (sidebar layout)
    setup, login, change-password
  components/             UI kit, shell (sidebar/header), dashboards, attendance, AI chat
  lib/
    shared/               types, date helpers, business rules (+ tests)
    server/               firebase-admin, auth guard, http helpers, services/*
scripts/                  smoke test, database reset
firestore.rules           deny-all for browsers
```

## What is done

All 25 functionalities from the checklist:

1. First-run setup (company + Admin, or Admin from env)
2. Login, logout, change password; forced change of temporary passwords; role-based menus and dashboards
3. Company settings: office hours, grace, half day, weekend, time zone, office location + radius, late-penalty switch
4. Departments, designations, leave types with quotas, public holidays
5. HR logins; deactivate / activate / reset any login
6. HR registers employees (creates login with temporary password) and edits details and salary; exits disable the login
7. Directory with server-side search, filters and paging; Employee 360 (profile, salary, calendar, balances, leave history, payslips)
8. CSV import with dry-run report (row + field + reason) and CSV export
9. Web check-in / check-out
10. Attendance calendar (employee) and daily attendance board (HR / Admin)
11. Attendance correction request and approval
12. Apply / cancel leave, balance and history
13. Approve / reject leave with a comment
14. Salary structure per employee (basic → HRA, medical, gross)
15. Monthly payroll draft (create / refresh)
16. Admin finalize (locks the month)
17. Payslips with PDF download
18. Admin / HR / Employee dashboards with KPIs, trends, charts and date-range + department filters
19. AI chat answering from real data
20. AI dashboard summary
21. Smart leave
22. Policy Q&A
23. Announcements on all dashboards
24. In-app notifications (leave decisions, corrections, payslips, new requests)
25. Audit log with actor, action, entity, before / after JSON (append-only, Admin view)

**Bonus:** camera attendance in the web app (face detection must find exactly one face, GPS accuracy ≤ 100 m, server Haversine check against the Admin's office radius; only the result is stored, no photo) · late penalty rule (3 lates = 0.5 day) · AI understands and answers Roman Urdu · dark mode (soft slate, not pitch black) · responsive down to 375 px.

## Not done

- Native mobile app (camera attendance is in the web app instead, which works on phone browsers).
- Face matching against an enrolled face and liveness check.
- Attrition risk score and absence anomaly flags.
- PWA install.
