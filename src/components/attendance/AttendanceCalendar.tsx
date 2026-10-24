"use client";
import { useState } from "react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { ErrorState, Loading, StatusBadge } from "../ui";
import { useApi } from "@/lib/client/api";
import { dayOfWeek, prettyMonth, prettyTime } from "@/lib/shared/dates";
import type { DayStatus, AttendanceRecord } from "@/lib/shared/types";

interface Calendar {
  month: string;
  today: string;
  days: { date: string; status: DayStatus; record: AttendanceRecord | null; leaveType?: string }[];
  summary: Record<string, number>;
  lateCount: number;
  hours: number;
}

function shiftMonth(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

const SUMMARY = ["present", "late", "half_day", "missing_checkout", "absent", "on_leave"];

/** Month calendar with each day's status; employees see their own, staff any employee's. */
export function AttendanceCalendar({ employeeId, onPickDay }: { employeeId?: string; onPickDay?: (date: string) => void }) {
  const [month, setMonth] = useState(() => new Date().toLocaleDateString("en-CA").slice(0, 7));
  const q = new URLSearchParams({ month, ...(employeeId ? { employeeId } : {}) }).toString();
  const { data, error, loading, reload } = useApi<Calendar>(`/attendance/calendar?${q}`);
  const lead = data ? (dayOfWeek(data.days[0].date) + 6) % 7 : 0; // weeks start Monday

  return (
    <div className="card">
      <div className="card-header">
        <h5>Attendance calendar</h5>
        <div className="d-flex align-items-center gap-2">
          <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
            <IconChevronLeft size={16} />
          </button>
          <strong className="text-heading fs-13" style={{ minWidth: 110, textAlign: "center" }}>
            {prettyMonth(month)}
          </strong>
          <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">
            <IconChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="card-body">
        {loading && !data && <Loading rows={5} />}
        {error && <ErrorState message={error} onRetry={reload} />}
        {data && (
          <>
            <div className="d-flex flex-wrap gap-2 mb-3">
              {SUMMARY.map((s) => (
                <StatusBadge key={s} status={s} label={`${STATUS_LABEL[s]}: ${data.summary[s] ?? 0}`} />
              ))}
              <span className="badge-soft s-muted no-dot">{data.hours} h worked</span>
            </div>
            <div className="cal-grid">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div className="cal-head" key={d}>
                  {d}
                </div>
              ))}
              {Array.from({ length: lead }).map((_, i) => (
                <div key={`x${i}`} />
              ))}
              {data.days.map((d) => {
                const quiet = ["weekend", "holiday", "upcoming", "not_joined"].includes(d.status);
                const clickable = onPickDay && d.date <= data.today && !["not_joined", "upcoming"].includes(d.status);
                return (
                  <div
                    key={d.date}
                    className={`cal-day ${d.date === data.today ? "today" : ""} ${quiet ? "muted" : ""}`}
                    role={clickable ? "button" : undefined}
                    onClick={clickable ? () => onPickDay!(d.date) : undefined}
                    title={clickable ? "Request a correction for this day" : undefined}
                  >
                    <span className="num">{Number(d.date.slice(8))}</span>
                    {!["upcoming", "not_joined"].includes(d.status) && <StatusBadge status={d.status} label={d.status === "on_leave" && d.leaveType ? d.leaveType : undefined} />}
                    {d.record && (
                      <span className="cal-time text-muted">
                        {prettyTime(d.record.checkIn)}
                        {d.record.checkOut ? `–${prettyTime(d.record.checkOut)}` : ""}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  present: "Present",
  late: "Late",
  half_day: "Half day",
  missing_checkout: "Missing checkout",
  absent: "Absent",
  on_leave: "On leave",
};
