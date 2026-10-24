"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { IconCheck, IconX } from "@tabler/icons-react";
import { useAuth } from "@/components/AuthProvider";
import { AttendanceCalendar } from "@/components/attendance/AttendanceCalendar";
import { CheckInWidget } from "@/components/attendance/CheckInWidget";
import { Avatar, Card, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, StatusBadge } from "@/components/ui";
import { api, errorMessage, useApi } from "@/lib/client/api";
import { prettyDate, prettyDateTime, prettyTime } from "@/lib/shared/dates";
import type { AttendanceRecord, CorrectionRequest, Department, DayStatus, CompanySettings } from "@/lib/shared/types";

export default function AttendancePage() {
  const { me } = useAuth();
  if (!me) return null;
  return me.role === "employee" ? <MyAttendance /> : <StaffAttendance canReview={me.role === "hr"} />;
}

// ---------- Employee ----------

function MyAttendance() {
  const { data: today, reload: reloadToday } = useApi<{ date: string; record: AttendanceRecord | null }>("/attendance/today");
  const { data: settings } = useApi<CompanySettings>("/settings");
  const [calKey, setCalKey] = useState(0);
  const [correction, setCorrection] = useState<{ date: string; checkIn: string; checkOut: string; reason: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const corrections = useApi<CorrectionRequest[]>("/attendance/corrections");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correction) return;
    setSaving(true);
    try {
      await api("/attendance/corrections", { body: correction });
      toast.success("Correction sent to HR");
      setCorrection(null);
      corrections.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const openCorrection = (date: string) => setCorrection({ date, checkIn: settings?.officeStart ?? "09:00", checkOut: settings?.officeEnd ?? "18:00", reason: "" });

  return (
    <>
      <PageHeader
        title="My Attendance"
        crumbs={["People", "My Attendance"]}
        actions={
          <button className="btn btn-outline-light" onClick={() => openCorrection(new Date().toLocaleDateString("en-CA"))}>
            Request correction
          </button>
        }
      />
      <div className="row">
        <div className="col-xl-4">
          {today && settings ? (
            <CheckInWidget
              date={today.date}
              record={today.record}
              officeStart={settings.officeStart}
              officeEnd={settings.officeEnd}
              camera={{ enabled: settings.officeLat != null && settings.officeLng != null, radiusM: settings.radiusM }}
              onChange={() => {
                reloadToday();
                setCalKey((k) => k + 1);
              }}
            />
          ) : (
            <div className="card card-body">
              <Loading />
            </div>
          )}
          <Card title="My correction requests" bodyClass="py-2">
            {corrections.data?.length === 0 && <EmptyState title="No requests" text="Click a day in the calendar to fix a wrong or missing record." />}
            {corrections.data?.map((c) => (
              <div className="list-row" key={c.id}>
                <div className="flex-grow-1">
                  <div className="text-body-strong fs-13">{prettyDate(c.date)} · {c.checkIn}–{c.checkOut}</div>
                  <div className="fs-12">{c.reason}</div>
                  {c.comment && <div className="fs-12 text-primary">HR: {c.comment}</div>}
                </div>
                <StatusBadge status={c.status} />
              </div>
            ))}
          </Card>
        </div>
        <div className="col-xl-8">
          <AttendanceCalendar key={calKey} onPickDay={openCorrection} />
          <div className="fs-13">
            Rules: late after {settings ? settings.officeStart : "09:00"} + {settings?.graceMinutes ?? 15} min grace · half day under {settings?.halfDayHours ?? 5} h · a working day without a record or approved leave is absent.
          </div>
        </div>
      </div>

      <Modal
        open={!!correction}
        title="Request attendance correction"
        onClose={() => setCorrection(null)}
        footer={
          <>
            <button className="btn btn-outline-light" onClick={() => setCorrection(null)}>Cancel</button>
            <button className="btn btn-primary" form="corr-form" disabled={saving}>{saving ? "Sending..." : "Send to HR"}</button>
          </>
        }
      >
        {correction && (
          <form id="corr-form" onSubmit={submit} className="row">
            <Field label="Date" className="col-12">
              <input type="date" className="form-control" value={correction.date} max={new Date().toLocaleDateString("en-CA")} onChange={(e) => setCorrection({ ...correction, date: e.target.value })} required />
            </Field>
            <Field label="Actual check-in" className="col-6">
              <input type="time" className="form-control" value={correction.checkIn} onChange={(e) => setCorrection({ ...correction, checkIn: e.target.value })} required />
            </Field>
            <Field label="Actual check-out" className="col-6">
              <input type="time" className="form-control" value={correction.checkOut} onChange={(e) => setCorrection({ ...correction, checkOut: e.target.value })} required />
            </Field>
            <Field label="Reason" className="col-12">
              <textarea className="form-control" rows={3} value={correction.reason} onChange={(e) => setCorrection({ ...correction, reason: e.target.value })} required minLength={5} placeholder="e.g. Forgot to check out, left at 6 pm" />
            </Field>
          </form>
        )}
      </Modal>
    </>
  );
}

// ---------- HR / Admin ----------

interface Board {
  date: string;
  items: { employee: { id: string; name: string; code: string; departmentId: string }; status: DayStatus; record: AttendanceRecord | null; leaveType?: string }[];
  counts: Record<string, number>;
}

function StaffAttendance({ canReview }: { canReview: boolean }) {
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get("tab") === "corrections" ? "corrections" : "board";
  return (
    <>
      <PageHeader title="Attendance" crumbs={["People", "Attendance"]} />
      <div className="nav-tabs-c">
        <button className={tab === "board" ? "active" : ""} onClick={() => router.replace("/attendance")}>
          Daily board
        </button>
        <button className={tab === "corrections" ? "active" : ""} onClick={() => router.replace("/attendance?tab=corrections")}>
          Correction requests
        </button>
      </div>
      {tab === "board" ? <DailyBoard /> : <Corrections canReview={canReview} />}
    </>
  );
}

function DailyBoard() {
  const [date, setDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [departmentId, setDepartmentId] = useState("");
  const { data: departments } = useApi<Department[]>("/org/departments");
  const { data, error, loading, reload } = useApi<Board>(`/attendance/board?date=${date}&departmentId=${departmentId}`);
  const deptName = (id: string) => departments?.find((d) => d.id === id)?.name ?? "—";
  const tiles: [string, string][] = [
    ["present", "Present"],
    ["late", "Late"],
    ["half_day", "Half day"],
    ["missing_checkout", "Missing checkout"],
    ["absent", "Absent / not in"],
    ["on_leave", "On leave"],
  ];

  return (
    <>
      <div className="row">
        {tiles.map(([k, label]) => (
          <div className="col-xl-2 col-md-4 col-6" key={k}>
            <div className="card kpi">
              <div className="kpi-label">{label}</div>
              <div className="kpi-value">{data?.counts[k] ?? 0}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="card-header">
          <h5>Daily attendance board</h5>
          <div className="d-flex gap-2 flex-wrap">
            <input type="date" className="form-control" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
            <select className="form-select" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} aria-label="Department">
              <option value="">All departments</option>
              {departments?.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>
        {loading && !data ? (
          <div className="card-body"><Loading rows={6} /></div>
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data?.items.length ? (
          <EmptyState title="No employees on this date" />
        ) : (
          <div className="table-responsive">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Check in</th>
                  <th>Check out</th>
                  <th>Hours</th>
                  <th>Source</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.employee.id}>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <Avatar name={i.employee.name} />
                        <div>
                          <Link href={`/employees/${i.employee.id}`} className="t-strong text-body-strong">{i.employee.name}</Link>
                          <div className="fs-12">{i.employee.code}</div>
                        </div>
                      </div>
                    </td>
                    <td>{deptName(i.employee.departmentId)}</td>
                    <td>
                      {prettyTime(i.record?.checkIn)}
                      {i.record?.isLate && <span className="text-danger fs-12"> +{i.record.lateMinutes}m</span>}
                    </td>
                    <td>{prettyTime(i.record?.checkOut)}</td>
                    <td>{i.record?.hours ?? "—"}</td>
                    <td className="text-capitalize">{i.record?.source ?? "—"}</td>
                    <td><StatusBadge status={i.status} label={i.status === "on_leave" && i.leaveType ? `On ${i.leaveType} leave` : undefined} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function Corrections({ canReview }: { canReview: boolean }) {
  const [status, setStatus] = useState("pending");
  const { data, error, loading, reload } = useApi<CorrectionRequest[]>(`/attendance/corrections?status=${status}`);
  const [review, setReview] = useState<{ c: CorrectionRequest; approve: boolean; comment: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!review) return;
    setSaving(true);
    try {
      await api(`/attendance/corrections/${review.c.id}`, { body: { approve: review.approve, comment: review.comment } });
      toast.success(review.approve ? "Correction approved; attendance updated" : "Correction rejected");
      setReview(null);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h5>Attendance corrections</h5>
        <select className="form-select" style={{ width: 160 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </select>
      </div>
      {loading && !data ? (
        <div className="card-body"><Loading /></div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data?.length ? (
        <EmptyState title="No correction requests" />
      ) : (
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Date</th>
                <th>Requested times</th>
                <th>Reason</th>
                <th>Requested</th>
                <th>Status</th>
                {canReview && <th />}
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id}>
                  <td className="t-strong">{c.employeeName}</td>
                  <td>{prettyDate(c.date)}</td>
                  <td>{c.checkIn} – {c.checkOut}</td>
                  <td>{c.reason}</td>
                  <td className="fs-12">{prettyDateTime(c.createdAt)}</td>
                  <td>
                    <StatusBadge status={c.status} />
                    {c.comment && <div className="fs-12">{c.comment}</div>}
                  </td>
                  {canReview && (
                    <td className="text-end text-nowrap">
                      {c.status === "pending" && (
                        <>
                          <button className="btn btn-soft-success btn-sm me-1" onClick={() => setReview({ c, approve: true, comment: "" })} aria-label="Approve"><IconCheck size={15} /></button>
                          <button className="btn btn-soft-danger btn-sm" onClick={() => setReview({ c, approve: false, comment: "" })} aria-label="Reject"><IconX size={15} /></button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal
        open={!!review}
        title={review?.approve ? "Approve correction" : "Reject correction"}
        onClose={() => setReview(null)}
        footer={
          <>
            <button className="btn btn-outline-light" onClick={() => setReview(null)}>Cancel</button>
            <button className={`btn ${review?.approve ? "btn-primary" : "btn-danger"}`} onClick={submit} disabled={saving}>{saving ? "Saving..." : review?.approve ? "Approve" : "Reject"}</button>
          </>
        }
      >
        {review && (
          <>
            <p className="fs-13">
              {review.c.employeeName} · {prettyDate(review.c.date)} · {review.c.checkIn}–{review.c.checkOut}
              {review.approve && " — the attendance record will be replaced with these times."}
            </p>
            <Field label="Comment">
              <textarea className="form-control" rows={2} value={review.comment} onChange={(e) => setReview({ ...review, comment: e.target.value })} />
            </Field>
          </>
        )}
      </Modal>
    </div>
  );
}
