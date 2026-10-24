"use client";
import Link from "next/link";
import { IconCalendarEvent, IconClockExclamation, IconClockHour4, IconDownload, IconFileInvoice, IconPercentage } from "@tabler/icons-react";
import { toast } from "sonner";
import { useAuth } from "../AuthProvider";
import { Chart } from "../Chart";
import { ChatBox } from "../ai/AiChat";
import { CheckInWidget } from "../attendance/CheckInWidget";
import { Avatar, EmptyState, ErrorState, Kpi, PageHeader, PageLoading, StatusBadge, money } from "../ui";
import { download, errorMessage, useApi } from "@/lib/client/api";
import { prettyDate, prettyDateTime, prettyMonth } from "@/lib/shared/dates";
import type { employeeDashboard } from "@/lib/server/services/analytics";

type Data = Awaited<ReturnType<typeof employeeDashboard>>;

export function EmployeeDashboard() {
  const { me } = useAuth();
  const { data: res, error, loading, reload } = useApi<{ role: "employee"; data: Data }>("/dashboard");
  const d = res?.data;

  if (loading && !d) return <PageLoading />;
  if (error || !d) {
    return (
      <div className="card">
        <ErrorState message={error ?? "No data"} onRetry={reload} />
      </div>
    );
  }

  const hoursPct = Math.min(100, Math.round((d.hoursThisWeek / d.targetHours) * 100));
  const balances = d.balances.filter((b) => b.quota != null);

  return (
    <>
      <PageHeader title="My Dashboard" crumbs={["Dashboard", "Employee"]} />

      <div className="card welcome-card">
        <div className="d-flex align-items-center gap-3">
          <Avatar name={me?.name ?? ""} size="lg" />
          <div>
            <h4 className="mb-1">Hello, {me?.name.split(" ")[0]} 👋</h4>
            <p className="mb-0 fs-13">
              {d.employee.code} · joined {prettyDate(d.employee.joinDate)} · {d.today.record ? "you are checked in today" : "don't forget to check in"}
            </p>
          </div>
        </div>
        <Link href="/leave?apply=1" className="btn btn-primary">
          <IconCalendarEvent size={16} /> Apply for leave
        </Link>
      </div>

      <div className="row">
        <div className="col-xl-4 col-lg-6">
          <CheckInWidget date={d.today.date} record={d.today.record} officeStart={d.officeHours.start} officeEnd={d.officeHours.end} camera={d.camera} onChange={reload} />
        </div>
        <div className="col-xl-8 col-lg-6">
          <div className="row">
            <div className="col-sm-6">
              <Kpi icon={<IconClockHour4 size={18} />} color="primary" label="Hours this week" value={`${d.hoursThisWeek} / ${d.targetHours} h`} foot={<div className="progress mt-1"><div className="progress-bar" style={{ width: `${hoursPct}%` }} /></div>} />
            </div>
            <div className="col-sm-6">
              <Kpi icon={<IconClockExclamation size={18} />} color="pink" label="Late this month" value={d.lateThisMonth} href="/attendance" foot="My attendance" />
            </div>
            <div className="col-sm-6">
              <Kpi icon={<IconPercentage size={18} />} color="secondary" label="Attendance rate (month)" value={`${d.attendanceRateThisMonth}%`} foot={`${d.monthCounts.absent} absent · ${d.monthCounts.on_leave} on leave`} />
            </div>
            <div className="col-sm-6">
              <Kpi
                icon={<IconFileInvoice size={18} />}
                color="info"
                label="Last payslip (net)"
                value={d.lastPayslip ? money(d.lastPayslip.net) : "—"}
                foot={d.lastPayslip ? prettyMonth(d.lastPayslip.month) : "No payslip yet"}
                href={d.lastPayslip ? "/payslips" : undefined}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="row">
        <div className="col-xl-4">
          <div className="card flex-fill">
            <div className="card-header">
              <h5>Leave balance</h5>
              <Link href="/leave" className="btn btn-outline-light btn-sm">
                My leave
              </Link>
            </div>
            <div className="card-body">
              {balances.length === 0 ? (
                <EmptyState title="No leave types yet" />
              ) : (
                <>
                  <Chart
                    type="radialBar"
                    height={230}
                    series={balances.map((b) => (b.quota ? Math.round(((b.remaining ?? 0) / b.quota) * 100) : 0))}
                    options={{
                      labels: balances.map((b) => b.name),
                      plotOptions: { radialBar: { hollow: { size: "30%" }, dataLabels: { name: { fontSize: "12px" }, value: { fontSize: "14px" }, total: { show: true, label: "Days left", formatter: () => String(balances.reduce((s, b) => s + (b.remaining ?? 0), 0)) } } } },
                    }}
                  />
                  {d.balances.map((b) => (
                    <div className="d-flex justify-content-between fs-13 py-1" key={b.typeId}>
                      <span className="text-body-strong">{b.name}</span>
                      <span>
                        {b.quota == null ? `${b.used} used · unlimited` : `${b.remaining} of ${b.quota} left`}
                        {b.pending > 0 && <span className="text-warning"> · {b.pending} pending</span>}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
        <div className="col-xl-4">
          <div className="card flex-fill">
            <div className="card-header">
              <h5>This week</h5>
            </div>
            <div className="card-body">
              {d.weekDays.map((w) => (
                <div className="list-row" key={w.date}>
                  <div className="flex-grow-1">
                    <div className="text-body-strong fs-13">{prettyDate(w.date)}</div>
                    <div className="fs-12">{w.hours ? `${w.hours} h` : "—"}</div>
                  </div>
                  <StatusBadge status={w.status} />
                </div>
              ))}
              {d.upcomingLeave.length > 0 && (
                <>
                  <h6 className="mt-3 mb-2 fs-13">Upcoming leave</h6>
                  {d.upcomingLeave.map((l) => (
                    <div className="d-flex justify-content-between fs-13 py-1" key={l.id}>
                      <span>
                        {l.typeName}: {prettyDate(l.start)} – {prettyDate(l.end)}
                      </span>
                      <StatusBadge status={l.status} />
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
        <div className="col-xl-4">
          <div className="card flex-fill">
            <div className="card-header">
              <h5>Last payslip</h5>
            </div>
            <div className="card-body">
              {!d.lastPayslip ? (
                <EmptyState title="No payslip yet" text="Payslips appear here after Admin finalizes the month." />
              ) : (
                <>
                  <div className="fs-13 mb-2">{prettyMonth(d.lastPayslip.month)}</div>
                  {[
                    ["Gross", d.lastPayslip.earnedGross],
                    ["Deductions", -d.lastPayslip.deduction],
                    ["Tax", -d.lastPayslip.tax],
                  ].map(([k, v]) => (
                    <div className="d-flex justify-content-between fs-13 py-1" key={k as string}>
                      <span>{k}</span>
                      <span className="text-body-strong">{money(v as number)}</span>
                    </div>
                  ))}
                  <hr />
                  <div className="d-flex justify-content-between mb-3">
                    <strong className="text-heading">Net pay</strong>
                    <strong className="text-primary">{money(d.lastPayslip.net)}</strong>
                  </div>
                  <button
                    className="btn btn-outline-light w-100"
                    onClick={() => download(`/payslips/${d.lastPayslip!.id}/pdf`, `payslip-${d.lastPayslip!.month}.pdf`).catch((e) => toast.error(errorMessage(e)))}
                  >
                    <IconDownload size={16} /> Download PDF
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="row">
        <div className="col-xl-6">
          <div className="card flex-fill">
            <div className="card-header">
              <h5>Announcements</h5>
            </div>
            <div className="card-body py-2">
              {d.announcements.length === 0 && <EmptyState title="No announcements" />}
              {d.announcements.map((a) => (
                <div className="list-row align-items-start" key={a.id}>
                  <Avatar name={a.createdByName} />
                  <div>
                    <div className="text-body-strong fw-medium">{a.title}</div>
                    <div className="fs-13">{a.body}</div>
                    <div className="fs-12 mt-1">{prettyDateTime(a.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="col-xl-6">
          <div className="card flex-fill overflow-hidden">
            <div className="card-header">
              <h5>Ask my assistant</h5>
            </div>
            <div className="d-flex flex-column" style={{ height: 360 }}>
              <ChatBox />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
