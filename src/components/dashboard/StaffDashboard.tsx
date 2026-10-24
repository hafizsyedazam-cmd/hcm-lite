"use client";
import Link from "next/link";
import { useState } from "react";
import {
  IconBuildingSkyscraper,
  IconCalendarCheck,
  IconCalendarStats,
  IconUserPlus,
  IconCalendarOff,
  IconCash,
  IconChecklist,
  IconClockExclamation,
  IconPercentage,
  IconTrendingDown,
  IconUserCheck,
  IconUsers,
  IconUserX,
  IconWallet,
} from "@tabler/icons-react";
import { useAuth } from "../AuthProvider";
import { Chart } from "../Chart";
import { Avatar, EmptyState, ErrorState, Kpi, PageHeader, PageLoading, money } from "../ui";
import { AiSummary } from "./AiSummary";
import { DashboardFilters, toQuery, type FilterValue } from "./Filters";
import { useApi } from "@/lib/client/api";
import { prettyDate, prettyDateTime, prettyMonth } from "@/lib/shared/dates";
import type { CompanyMetrics } from "@/lib/server/services/analytics";
import type { Announcement, AuditEntry, Role } from "@/lib/shared/types";

interface Response {
  role: Role;
  data: CompanyMetrics;
  announcements: Announcement[];
  auditFeed: AuditEntry[];
}

function defaultFilters(): FilterValue {
  const today = new Date().toLocaleDateString("en-CA"); // local YYYY-MM-DD
  return { from: `${today.slice(0, 7)}-01`, to: today, departmentId: "" };
}

export function StaffDashboard({ role }: { role: "admin" | "hr" }) {
  const { me } = useAuth();
  const [filters, setFilters] = useState<FilterValue>(defaultFilters);
  const { data, error, loading, reload } = useApi<Response>(`/dashboard?${toQuery(filters)}`);
  const m = data?.data;
  const isAdmin = role === "admin";

  return (
    <>
      <PageHeader title={isAdmin ? "Admin Dashboard" : "HR Dashboard"} crumbs={["Dashboard", isAdmin ? "Admin Dashboard" : "HR Dashboard"]} actions={<DashboardFilters value={filters} onChange={setFilters} />} />

      <section className="hero">
        <div className="hero-top">
          <div>
            <span className="hero-date">
              <IconCalendarStats size={14} /> {m ? `${prettyDate(m.filters.from)} – ${prettyDate(m.filters.to)} · ${m.filters.department}` : "Loading overview..."}
            </span>
            <h3>Welcome back, {me?.name.split(" ")[0]} 👋</h3>
            {m ? (
              <p>
                You have <Link href="/leave">{m.pendingApprovals.leave} pending leave request{m.pendingApprovals.leave === 1 ? "" : "s"}</Link> and{" "}
                <Link href="/attendance?tab=corrections">
                  {m.pendingApprovals.corrections} attendance correction{m.pendingApprovals.corrections === 1 ? "" : "s"}
                </Link>{" "}
                waiting. Here is how {me?.companyName} is doing today.
              </p>
            ) : (
              <p>Pulling the latest numbers from your HR data...</p>
            )}
          </div>
          <div className="hero-actions">
            {isAdmin ? (
              <>
                <Link href="/organization" className="btn-hero ghost">
                  <IconBuildingSkyscraper size={16} /> Organization
                </Link>
                <Link href="/users" className="btn-hero">
                  <IconUserPlus size={16} /> Create HR login
                </Link>
              </>
            ) : (
              <>
                <Link href="/attendance" className="btn-hero ghost">
                  <IconCalendarCheck size={16} /> Attendance board
                </Link>
                <Link href="/employees?new=1" className="btn-hero">
                  <IconUserPlus size={16} /> Register employee
                </Link>
              </>
            )}
          </div>
        </div>
        {m && (
          <div className="hero-stats">
            <div className="hero-stat">
              <b>{m.headcount}</b>Active employees
            </div>
            <div className="hero-stat">
              <b>{m.today.present}</b>Present today
            </div>
            <div className="hero-stat">
              <b>{m.today.onLeave}</b>On leave today
            </div>
            <div className="hero-stat">
              <b>{m.attendance.rate}%</b>Attendance rate
            </div>
          </div>
        )}
      </section>

      {loading && !m && <PageLoading />}
      {error && !m && (
        <div className="card">
          <ErrorState message={error} onRetry={reload} />
        </div>
      )}
      {m && (isAdmin ? <AdminBody m={m} audit={data!.auditFeed} filters={filters} /> : <HrBody m={m} filters={filters} />)}
      {m && data!.announcements.length > 0 && <Announcements list={data!.announcements} />}
    </>
  );
}

function HrBody({ m, filters }: { m: CompanyMetrics; filters: FilterValue }) {
  const trend = m.attendance.trend;
  return (
    <>
      <div className="row">
        <div className="col-xl-3 col-sm-6">
          <Kpi icon={<IconUsers size={18} />} color="primary" label="Headcount" value={m.headcount} foot={`${m.probation} on probation`} />
        </div>
        <div className="col-xl-3 col-sm-6">
          <Kpi icon={<IconUserCheck size={18} />} color="success" label="Present today" value={m.today.present} foot={`${m.today.notCheckedIn} not checked in`} />
        </div>
        <div className="col-xl-3 col-sm-6">
          <Kpi icon={<IconCalendarOff size={18} />} color="info" label="On leave today" value={m.today.onLeave} href="/leave" foot="View leave" />
        </div>
        <div className="col-xl-3 col-sm-6">
          <Kpi icon={<IconClockExclamation size={18} />} color="pink" label="Late today" value={m.today.late} href="/attendance" foot="Attendance board" />
        </div>
        <div className="col-xl-3 col-sm-6">
          <Kpi icon={<IconChecklist size={18} />} color="secondary" label="Pending approvals" value={m.pendingApprovals.total} href="/leave" foot={`${m.pendingApprovals.leave} leave · ${m.pendingApprovals.corrections} corrections`} />
        </div>
        <div className="col-xl-3 col-sm-6">
          <Kpi icon={<IconPercentage size={18} />} color="purple" label="Attendance rate" value={`${m.attendance.rate}%`} foot="for selected range" />
        </div>
        <div className="col-xl-3 col-sm-6">
          <Kpi icon={<IconClockExclamation size={18} />} color="danger" label="Late %" value={`${m.attendance.latePercent}%`} foot={`${m.attendance.lateCount} late arrivals`} />
        </div>
        <div className="col-xl-3 col-sm-6">
          <Kpi icon={<IconUserX size={18} />} color="dark" label="Absenteeism" value={`${m.attendance.absenteeism}%`} foot={`${m.attendance.counts.absent} absent days`} />
        </div>
      </div>

      <div className="row">
        <div className="col-xl-8">
          <div className="card flex-fill">
            <div className="card-header">
              <h5>Attendance trend</h5>
              <span className="fs-13">daily attendance rate %</span>
            </div>
            <div className="card-body">
              {trend.length ? (
                <Chart
                  type="area"
                  height={280}
                  series={[{ name: "Attendance %", data: trend.map((t) => t.rate) }]}
                  options={{
                    xaxis: { categories: trend.map((t) => prettyDate(t.date).slice(0, 6)) },
                    yaxis: { min: 0, max: 100 },
                    fill: { type: "gradient", gradient: { opacityFrom: 0.35, opacityTo: 0.02 } },
                  }}
                />
              ) : (
                <EmptyState title="No attendance yet" text="The trend appears once employees start checking in." />
              )}
            </div>
          </div>
        </div>
        <div className="col-xl-4">
          <AiSummary filters={filters} />
          <TopLate m={m} />
        </div>
      </div>

      <div className="row">
        <div className="col-xl-6">
          <div className="card flex-fill">
            <div className="card-header">
              <h5>Absenteeism by department</h5>
            </div>
            <div className="card-body">
              {m.attendance.absenteeismByDept.length ? (
                <Chart
                  type="bar"
                  series={[{ name: "Absenteeism %", data: m.attendance.absenteeismByDept.map((d) => d.rate) }]}
                  options={{ xaxis: { categories: m.attendance.absenteeismByDept.map((d) => d.department) }, plotOptions: { bar: { horizontal: true, barHeight: "50%" } } }}
                />
              ) : (
                <EmptyState title="No data yet" />
              )}
            </div>
          </div>
        </div>
        <div className="col-xl-6">
          <LeaveByType m={m} />
        </div>
      </div>
      <OnLeaveToday m={m} />
    </>
  );
}

function AdminBody({ m, audit, filters }: { m: CompanyMetrics; audit: AuditEntry[]; filters: FilterValue }) {
  const tenure = Object.entries(m.tenure);
  return (
    <>
      <div className="row">
        <div className="col-xl-3 col-sm-6">
          <Kpi icon={<IconUsers size={18} />} color="primary" label="Headcount" value={m.headcount} href="/employees" foot="View employees" />
        </div>
        <div className="col-xl-3 col-sm-6">
          <Kpi icon={<IconTrendingDown size={18} />} color="secondary" label="Attrition YTD" value={`${m.attritionYtd}%`} foot={`${m.exits} exit${m.exits === 1 ? "" : "s"} in range`} />
        </div>
        <div className="col-xl-3 col-sm-6">
          <Kpi
            icon={<IconCash size={18} />}
            color="info"
            label="Payroll cost"
            value={money(m.payroll.cost.gross)}
            href="/payroll"
            foot={m.payroll.cost.month ? `${prettyMonth(m.payroll.cost.month)} · ${m.payroll.cost.status}` : "No payroll run yet"}
          />
        </div>
        <div className="col-xl-3 col-sm-6">
          <Kpi icon={<IconWallet size={18} />} color="pink" label="Average salary (gross)" value={money(m.payroll.avgSalary)} foot="active employees" />
        </div>
      </div>

      <div className="row">
        <div className="col-xl-4">
          <div className="card flex-fill">
            <div className="card-header">
              <h5>Headcount by department</h5>
            </div>
            <div className="card-body">
              {m.headcountByDept.some((d) => d.count) ? (
                <Chart
                  type="bar"
                  height={280}
                  series={[{ name: "Employees", data: m.headcountByDept.map((d) => d.count) }]}
                  options={{ xaxis: { categories: m.headcountByDept.map((d) => d.department) }, plotOptions: { bar: { horizontal: true, barHeight: "45%" } } }}
                />
              ) : (
                <EmptyState title="No employees yet" text="HR registers employees after you add departments." />
              )}
            </div>
          </div>
        </div>
        <div className="col-xl-4">
          <div className="card flex-fill">
            <div className="card-header">
              <h5>Payroll cost by department</h5>
              {m.payroll.cost.month && <span className="fs-13">{prettyMonth(m.payroll.cost.month)}</span>}
            </div>
            <div className="card-body">
              {m.payroll.byDept.length ? (
                <Chart type="donut" height={280} series={m.payroll.byDept.map((d) => d.gross)} options={{ labels: m.payroll.byDept.map((d) => d.department) }} />
              ) : (
                <EmptyState title="No payroll yet" text="HR creates the monthly draft; you finalize it." />
              )}
            </div>
          </div>
        </div>
        <div className="col-xl-4">
          <AiSummary filters={filters} />
        </div>
      </div>

      <div className="row">
        <div className="col-xl-4">
          <div className="card flex-fill">
            <div className="card-header">
              <h5>Gender</h5>
            </div>
            <div className="card-body">
              {m.headcount ? (
                <Chart type="pie" height={250} series={[m.gender.male, m.gender.female, m.gender.other]} options={{ labels: ["Male", "Female", "Other"] }} />
              ) : (
                <EmptyState title="No employees yet" />
              )}
            </div>
          </div>
        </div>
        <div className="col-xl-4">
          <div className="card flex-fill">
            <div className="card-header">
              <h5>Tenure</h5>
            </div>
            <div className="card-body">
              {m.headcount ? (
                <Chart type="bar" height={250} series={[{ name: "Employees", data: tenure.map(([, v]) => v) }]} options={{ xaxis: { categories: tenure.map(([k]) => k) } }} />
              ) : (
                <EmptyState title="No employees yet" />
              )}
            </div>
          </div>
        </div>
        <div className="col-xl-4">
          <div className="card flex-fill">
            <div className="card-header">
              <h5>Audit feed</h5>
              <Link href="/audit" className="btn btn-outline-light btn-sm">
                View all
              </Link>
            </div>
            <div className="card-body py-2">
              {audit.length === 0 && <EmptyState title="No activity yet" />}
              {audit.map((a) => (
                <div className="list-row" key={a.id}>
                  <Avatar name={a.actorName} />
                  <div className="min-w-0">
                    <div className="text-body-strong fs-13 text-truncate">
                      {a.actorName} · <span className="text-primary">{a.action.replace("_", " ")}</span> {a.entity.replace("_", " ")}
                    </div>
                    <div className="fs-12">{prettyDateTime(a.at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="row">
        <div className="col-xl-6">
          <div className="card flex-fill">
            <div className="card-header">
              <h5>Average gross salary by department</h5>
            </div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Department</th>
                      <th>Employees</th>
                      <th className="text-end">Avg gross</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.payroll.avgSalaryByDept.length === 0 && (
                      <tr>
                        <td colSpan={3} className="text-center py-4">
                          No salaries yet
                        </td>
                      </tr>
                    )}
                    {m.payroll.avgSalaryByDept.map((d) => (
                      <tr key={d.department}>
                        <td className="t-strong">{d.department}</td>
                        <td>{d.count}</td>
                        <td className="text-end">{money(d.avgGross)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
        <div className="col-xl-6">
          <div className="card flex-fill">
            <div className="card-header">
              <h5>Attendance overview</h5>
              <span className="fs-13">{m.attendance.rate}% attendance rate</span>
            </div>
            <div className="card-body">
              {m.attendance.trend.length ? (
                <Chart
                  type="bar"
                  height={250}
                  series={[
                    { name: "Present", data: m.attendance.trend.map((t) => t.present) },
                    { name: "Absent", data: m.attendance.trend.map((t) => t.absent) },
                    { name: "On leave", data: m.attendance.trend.map((t) => t.onLeave) },
                  ]}
                  options={{ chart: { stacked: true }, colors: ["#03c95a", "#e70d0d", "#1b84ff"], xaxis: { categories: m.attendance.trend.map((t) => prettyDate(t.date).slice(0, 6)) } }}
                />
              ) : (
                <EmptyState title="No attendance yet" />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function TopLate({ m }: { m: CompanyMetrics }) {
  return (
    <div className="card">
      <div className="card-header">
        <h5>Top late-comers</h5>
      </div>
      <div className="card-body py-2">
        {m.attendance.topLate.length === 0 && <EmptyState title="No late arrivals" text="Nobody was late in this range." />}
        {m.attendance.topLate.map((t) => (
          <div className="list-row" key={t.employeeId}>
            <Avatar name={t.name} />
            <div className="flex-grow-1 min-w-0">
              <Link href={`/employees/${t.employeeId}`} className="text-body-strong fw-medium">
                {t.name}
              </Link>
              <div className="fs-12">
                {t.code} · {t.department}
              </div>
            </div>
            <span className="badge-soft s-danger no-dot">{t.lateCount}× late</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LeaveByType({ m }: { m: CompanyMetrics }) {
  const types = m.leave.byType;
  return (
    <div className="card flex-fill">
      <div className="card-header">
        <h5>Leave by type</h5>
        <span className="fs-13">{m.leave.approvedDays} approved days</span>
      </div>
      <div className="card-body">
        {types.length === 0 ? (
          <EmptyState title="No leave types" text="Admin adds leave types in Organization Setup." />
        ) : types.every((t) => t.days === 0) ? (
          <EmptyState title="No approved leave in this range" />
        ) : (
          <Chart type="donut" series={types.map((t) => t.days)} options={{ labels: types.map((t) => t.type) }} />
        )}
        {types.length > 0 && (
          <div className="row g-2 mt-1">
            {types.map((t) => (
              <div className="col-6 fs-13" key={t.code}>
                <span className="text-body-strong">{t.type}</span>: {t.days} day{t.days === 1 ? "" : "s"}
                {t.utilization != null && <span className="text-muted"> · {t.utilization}% used</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OnLeaveToday({ m }: { m: CompanyMetrics }) {
  return (
    <div className="card">
      <div className="card-header">
        <h5>Who is on leave today</h5>
        <span className="fs-13">{prettyDate(m.today.date)}</span>
      </div>
      <div className="card-body">
        {m.today.onLeaveList.length === 0 ? (
          <p className="mb-0 fs-13">Nobody is on leave today.</p>
        ) : (
          <div className="d-flex flex-wrap gap-3">
            {m.today.onLeaveList.map((p) => (
              <div className="d-flex align-items-center gap-2" key={p.name}>
                <Avatar name={p.name} />
                <div>
                  <div className="text-body-strong fs-13">{p.name}</div>
                  <div className="fs-12 text-capitalize">{p.type} leave</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Announcements({ list }: { list: Announcement[] }) {
  return (
    <div className="card">
      <div className="card-header">
        <h5>Announcements</h5>
        <Link href="/announcements" className="btn btn-outline-light btn-sm">
          View all
        </Link>
      </div>
      <div className="card-body py-2">
        {list.slice(0, 3).map((a) => (
          <div className="list-row align-items-start" key={a.id}>
            <Avatar name={a.createdByName} />
            <div>
              <div className="text-body-strong fw-medium">{a.title}</div>
              <div className="fs-13">{a.body.length > 160 ? a.body.slice(0, 160) + "…" : a.body}</div>
              <div className="fs-12 mt-1">
                {a.createdByName} · {prettyDateTime(a.createdAt)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
