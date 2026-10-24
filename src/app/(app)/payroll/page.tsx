"use client";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { IconEye, IconLock, IconPlayerPlay } from "@tabler/icons-react";
import { useAuth } from "@/components/AuthProvider";
import { Card, EmptyState, ErrorState, Loading, PageHeader, StatusBadge, money } from "@/components/ui";
import { api, errorMessage, useApi } from "@/lib/client/api";
import { prettyDateTime, prettyMonth } from "@/lib/shared/dates";
import type { PayrollRun } from "@/lib/shared/types";

export default function PayrollPage() {
  const { me } = useAuth();
  const { data, error, loading, reload } = useApi<PayrollRun[]>("/payroll");
  const [month, setMonth] = useState(() => new Date().toLocaleDateString("en-CA").slice(0, 7));
  const [busy, setBusy] = useState(false);
  const isHr = me?.role === "hr";
  const isAdmin = me?.role === "admin";

  const generate = async () => {
    setBusy(true);
    try {
      const res = await api<{ count: number }>("/payroll", { body: { month } });
      toast.success(`Draft ready for ${prettyMonth(month)}: ${res.count} payslips`);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const finalize = async (run: PayrollRun) => {
    if (!confirm(`Finalize payroll for ${prettyMonth(run.month)}? It will be locked and employees can download their payslips.`)) return;
    try {
      await api(`/payroll/${run.month}/finalize`, { body: {} });
      toast.success(`${prettyMonth(run.month)} finalized and locked`);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader title="Payroll" crumbs={["People", "Payroll"]} />
      {isHr && (
        <Card title="Run monthly payroll">
          <div className="d-flex flex-wrap gap-2 align-items-end">
            <div>
              <label className="form-label">Month</label>
              <input type="month" className="form-control" value={month} max={new Date().toLocaleDateString("en-CA").slice(0, 7)} onChange={(e) => setMonth(e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={generate} disabled={busy || !month} style={{ minHeight: 38 }}>
              <IconPlayerPlay size={16} /> {busy ? "Calculating..." : "Create / refresh draft"}
            </button>
          </div>
          <p className="fs-13 mt-3 mb-0">
            Gross = 1.5 × basic · per day = gross ÷ working days · deductions for absent days, unpaid leave and 0.5 × half days · joiners and leavers are prorated · tax slab on gross × 12. Admin finalizes and locks the month.
          </p>
        </Card>
      )}
      {isAdmin && <div className="alert alert-info fs-13">HR prepares each month&apos;s draft. Review it, then finalize: a finalized month is locked and cannot be edited.</div>}

      <div className="card">
        <div className="card-header">
          <h5>Payroll runs</h5>
        </div>
        {loading && !data ? (
          <div className="card-body"><Loading /></div>
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data?.length ? (
          <EmptyState title="No payroll runs yet" text={isHr ? "Pick a month and create the draft." : "HR has not created a payroll draft yet."} />
        ) : (
          <div className="table-responsive">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Employees</th>
                  <th>Working days</th>
                  <th>Gross</th>
                  <th>Deductions</th>
                  <th>Tax</th>
                  <th>Net</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.id}>
                    <td className="t-strong">{prettyMonth(r.month)}</td>
                    <td>{r.totals.employees}</td>
                    <td>{r.workingDays}</td>
                    <td>{money(r.totals.gross)}</td>
                    <td>{money(r.totals.deductions)}</td>
                    <td>{money(r.totals.tax)}</td>
                    <td className="t-strong">{money(r.totals.net)}</td>
                    <td>
                      <StatusBadge status={r.status} />
                      <div className="fs-12">{r.status === "finalized" ? `by ${r.finalizedBy} · ${prettyDateTime(r.finalizedAt)}` : `by ${r.createdBy} · ${prettyDateTime(r.updatedAt)}`}</div>
                    </td>
                    <td className="text-end text-nowrap">
                      <Link href={`/payroll/${r.month}`} className="btn btn-outline-light btn-sm me-1" aria-label="View payslips">
                        <IconEye size={15} />
                      </Link>
                      {isAdmin && r.status === "draft" && (
                        <button className="btn btn-primary btn-sm" onClick={() => finalize(r)}>
                          <IconLock size={15} /> Finalize
                        </button>
                      )}
                    </td>
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
