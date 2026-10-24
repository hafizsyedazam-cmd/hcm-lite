"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { IconCheck, IconPlus, IconSparkles, IconX } from "@tabler/icons-react";
import { useAuth } from "@/components/AuthProvider";
import { AiLabel, Avatar, Card, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, StatusBadge } from "@/components/ui";
import { api, errorMessage, useApi } from "@/lib/client/api";
import { prettyDate, prettyDateTime } from "@/lib/shared/dates";
import type { LeaveBalance, LeaveRequest, LeaveType } from "@/lib/shared/types";

export default function LeavePage() {
  const { me } = useAuth();
  if (!me) return null;
  return me.role === "employee" ? <MyLeave /> : <LeaveInbox canReview={me.role === "hr"} />;
}

// ---------- Employee ----------

interface Draft {
  typeId: string;
  start: string;
  end: string;
  reason: string;
  source: "form" | "ai";
}

function MyLeave() {
  const params = useSearchParams();
  const balances = useApi<LeaveBalance[]>("/leave/balance");
  const history = useApi<LeaveRequest[]>("/leave");
  const { data: types } = useApi<LeaveType[]>("/org/leave-types");
  const today = new Date().toLocaleDateString("en-CA");
  const blank = (): Draft => ({ typeId: "", start: today, end: today, reason: "", source: "form" });
  const [form, setForm] = useState<Draft | null>(params.get("apply") ? blank() : null);
  const [smartText, setSmartText] = useState("");
  const [smartBusy, setSmartBusy] = useState(false);
  const [smartNote, setSmartNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const smart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (smartText.trim().length < 5) return;
    setSmartBusy(true);
    setSmartNote(null);
    try {
      const res = await api<{ ok: true; draft: { typeId: string; start: string; end: string; reason: string } } | { ok: false; message: string }>("/ai/smart-leave", { body: { text: smartText } });
      if (res.ok) {
        setForm({ ...res.draft, source: "ai" });
        setSmartNote("AI filled this form from your sentence. Check it, then confirm.");
      } else {
        setForm(blank());
        setSmartNote(res.message);
      }
    } catch (err) {
      // Any AI failure falls back to the normal form.
      setForm(blank());
      setSmartNote(`${errorMessage(err)} Please fill in the form.`);
    } finally {
      setSmartBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const res = await api<LeaveRequest>("/leave", { body: form });
      toast.success(`Leave request sent: ${res.days} working day${res.days === 1 ? "" : "s"}`);
      setForm(null);
      setSmartText("");
      setSmartNote(null);
      balances.reload();
      history.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (l: LeaveRequest) => {
    if (!confirm(`Cancel your ${l.typeName.toLowerCase()} from ${prettyDate(l.start)}?`)) return;
    try {
      await api(`/leave/${l.id}`, { body: { action: "cancel" } });
      toast.success("Leave cancelled");
      balances.reload();
      history.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title="My Leave"
        crumbs={["People", "My Leave"]}
        actions={
          <button className="btn btn-primary" onClick={() => { setSmartNote(null); setForm(blank()); }}>
            <IconPlus size={16} /> Apply for leave
          </button>
        }
      />
      <div className="row">
        {balances.data?.map((b) => (
          <div className="col-xl-3 col-sm-6" key={b.typeId}>
            <div className="card kpi">
              <div className="kpi-label">{b.name}</div>
              <div className="kpi-value">{b.quota == null ? "∞" : b.remaining}</div>
              <div className="kpi-foot">
                {b.quota == null ? `${b.used} used · unlimited` : `${b.used} used of ${b.quota}`}
                {b.pending > 0 && <span className="text-warning"> · {b.pending} pending</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <h5 className="d-flex align-items-center gap-2">
            <IconSparkles size={18} className="text-primary" /> Smart leave
          </h5>
          <span className="fs-13">Type your request in plain words (English or Roman Urdu)</span>
        </div>
        <div className="card-body">
          <form className="d-flex gap-2 flex-wrap" onSubmit={smart}>
            <input
              className="form-control flex-grow-1"
              style={{ minWidth: 240, flexBasis: 300 }}
              placeholder="e.g. I need next Monday and Tuesday off for my sister's wedding"
              value={smartText}
              onChange={(e) => setSmartText(e.target.value)}
              maxLength={500}
              aria-label="Describe your leave"
            />
            <button className="btn btn-primary" disabled={smartBusy || smartText.trim().length < 5}>
              {smartBusy ? "Reading..." : "Fill the form"}
            </button>
          </form>
        </div>
      </div>

      <Card title="Leave history" bodyClass="p-0">
        {history.loading && !history.data ? (
          <div className="p-3"><Loading /></div>
        ) : history.error ? (
          <ErrorState message={history.error} onRetry={history.reload} />
        ) : !history.data?.length ? (
          <EmptyState title="No leave requests yet" text="Use smart leave above or the Apply button." />
        ) : (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Days</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {history.data.map((l) => (
                  <tr key={l.id}>
                    <td className="t-strong">
                      {l.typeName}
                      {l.source === "ai" && <span className="badge-soft s-primary no-dot ms-1">AI</span>}
                    </td>
                    <td>{prettyDate(l.start)}</td>
                    <td>{prettyDate(l.end)}</td>
                    <td>{l.days}</td>
                    <td>{l.reason}</td>
                    <td>
                      <StatusBadge status={l.status} />
                      {l.comment && <div className="fs-12 mt-1">HR: {l.comment}</div>}
                    </td>
                    <td className="text-end">
                      {(l.status === "pending" || (l.status === "approved" && l.start > today)) && (
                        <button className="btn btn-outline-light btn-sm" onClick={() => cancel(l)}>
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={!!form}
        title={form?.source === "ai" ? "Confirm your leave request" : "Apply for leave"}
        onClose={() => setForm(null)}
        footer={
          <>
            <button className="btn btn-outline-light" onClick={() => setForm(null)}>Cancel</button>
            <button className="btn btn-primary" form="leave-form" disabled={saving}>{saving ? "Sending..." : "Confirm & submit"}</button>
          </>
        }
      >
        {form && (
          <form id="leave-form" onSubmit={submit} className="row">
            {smartNote && (
              <div className="col-12">
                <div className={form.source === "ai" ? "ai-summary mb-3 fs-13" : "alert alert-warning fs-13"}>
                  {form.source === "ai" && <AiLabel />}
                  <div>{smartNote}</div>
                </div>
              </div>
            )}
            <Field label="Leave type" className="col-12">
              <select className="form-select" value={form.typeId} onChange={(e) => setForm({ ...form, typeId: e.target.value })} required>
                <option value="">Select type</option>
                {types?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.quota == null ? "(unlimited)" : `(${balances.data?.find((b) => b.typeId === t.id)?.remaining ?? t.quota} left)`}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="From" className="col-6">
              <input type="date" className="form-control" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value, end: e.target.value > form.end ? e.target.value : form.end })} required />
            </Field>
            <Field label="To" className="col-6">
              <input type="date" className="form-control" value={form.end} min={form.start} onChange={(e) => setForm({ ...form, end: e.target.value })} required />
            </Field>
            <Field label="Reason" className="col-12" hint="Only working days are counted; weekends and public holidays are skipped.">
              <textarea className="form-control" rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required minLength={3} />
            </Field>
          </form>
        )}
      </Modal>
    </>
  );
}

// ---------- HR / Admin ----------

function LeaveInbox({ canReview }: { canReview: boolean }) {
  const [status, setStatus] = useState(canReview ? "pending" : "all");
  const { data, error, loading, reload } = useApi<LeaveRequest[]>(`/leave?status=${status}`);
  const [review, setReview] = useState<{ l: LeaveRequest; approve: boolean; comment: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!review) return;
    setSaving(true);
    try {
      await api(`/leave/${review.l.id}`, { body: { action: review.approve ? "approve" : "reject", comment: review.comment } });
      toast.success(review.approve ? "Leave approved" : "Leave rejected");
      setReview(null);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title={canReview ? "Leave Requests" : "Leave Records"} crumbs={["People", "Leave"]} />
      <div className="card">
        <div className="card-header">
          <h5>{canReview ? "Approval inbox" : "All leave requests"}</h5>
          <select className="form-select" style={{ width: 160 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
            <option value="all">All</option>
          </select>
        </div>
        {loading && !data ? (
          <div className="card-body"><Loading rows={5} /></div>
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data?.length ? (
          <EmptyState title={status === "pending" ? "No pending requests" : "No leave requests"} text={status === "pending" ? "You're all caught up." : undefined} />
        ) : (
          <div className="table-responsive">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Type</th>
                  <th>Dates</th>
                  <th>Days</th>
                  <th>Reason</th>
                  <th>Applied</th>
                  <th>Status</th>
                  {canReview && <th />}
                </tr>
              </thead>
              <tbody>
                {data.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <Avatar name={l.employeeName} />
                        <span className="t-strong">{l.employeeName}</span>
                      </div>
                    </td>
                    <td>
                      {l.typeName}
                      {l.source === "ai" && <span className="badge-soft s-primary no-dot ms-1">AI</span>}
                    </td>
                    <td>{prettyDate(l.start)} – {prettyDate(l.end)}</td>
                    <td>{l.days}</td>
                    <td style={{ maxWidth: 220 }}>{l.reason}</td>
                    <td className="fs-12">{prettyDateTime(l.createdAt)}</td>
                    <td>
                      <StatusBadge status={l.status} />
                      {l.comment && <div className="fs-12 mt-1">{l.comment}</div>}
                    </td>
                    {canReview && (
                      <td className="text-end text-nowrap">
                        {l.status === "pending" && (
                          <>
                            <button className="btn btn-soft-success btn-sm me-1" onClick={() => setReview({ l, approve: true, comment: "" })}>
                              <IconCheck size={15} /> Approve
                            </button>
                            <button className="btn btn-soft-danger btn-sm" onClick={() => setReview({ l, approve: false, comment: "" })} aria-label="Reject">
                              <IconX size={15} />
                            </button>
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
      </div>
      <Modal
        open={!!review}
        title={review?.approve ? "Approve leave" : "Reject leave"}
        onClose={() => setReview(null)}
        footer={
          <>
            <button className="btn btn-outline-light" onClick={() => setReview(null)}>Cancel</button>
            <button className={`btn ${review?.approve ? "btn-primary" : "btn-danger"}`} onClick={submit} disabled={saving}>
              {saving ? "Saving..." : review?.approve ? "Approve" : "Reject"}
            </button>
          </>
        }
      >
        {review && (
          <>
            <p className="fs-13">
              <strong className="text-body-strong">{review.l.employeeName}</strong> · {review.l.typeName} · {prettyDate(review.l.start)} – {prettyDate(review.l.end)} ({review.l.days} day{review.l.days === 1 ? "" : "s"})
            </p>
            <Field label={review.approve ? "Comment (optional)" : "Reason for rejecting"}>
              <textarea className="form-control" rows={2} value={review.comment} onChange={(e) => setReview({ ...review, comment: e.target.value })} required={!review.approve} />
            </Field>
          </>
        )}
      </Modal>
    </>
  );
}
