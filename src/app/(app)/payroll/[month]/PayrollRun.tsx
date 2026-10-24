"use client";
import Link from "next/link";
import { toast } from "sonner";
import { IconCash, IconDownload, IconLock, IconReceiptTax, IconUsers, IconWallet } from "@tabler/icons-react";
import { useAuth } from "@/components/AuthProvider";
import { ErrorState, Kpi, PageHeader, PageLoading, StatusBadge, money } from "@/components/ui";
import { api, download, errorMessage, useApi } from "@/lib/client/api";
import { prettyMonth } from "@/lib/shared/dates";
import type { PayrollRun, Payslip } from "@/lib/shared/types";

type Slip = Payslip & { departmentName: string; designationName: string };

export function PayrollRun({ month }: { month: string }) {
  const { me } = useAuth();
  const { data, error, loading, reload } = useApi<{ run: PayrollRun; payslips: Slip[] }>(`/payroll/${month}`);

  if (loading && !data) return <PageLoading />;
  if (error || !data) return <div className="card"><ErrorState message={error ?? "Not found"} onRetry={reload} /></div>;
  const { run, payslips } = data;

  const finalize = async () => {
    if (!confirm(`Finalize ${prettyMonth(month)}? This locks the month.`)) return;
    try {
      await api(`/payroll/${month}/finalize`, { body: {} });
      toast.success("Payroll finalized and locked");
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader
        title={`Payroll · ${prettyMonth(month)}`}
        crumbs={["People", "Payroll", prettyMonth(month)]}
        actions={
          <>
            <Link href="/payroll" className="btn btn-outline-light">Back</Link>
            {me?.role === "admin" && run.status === "draft" && (
              <button className="btn btn-primary" onClick={finalize}>
                <IconLock size={16} /> Finalize & lock
              </button>
            )}
          </>
        }
      />
      <div className="row">
        <div className="col-xl-3 col-sm-6"><Kpi icon={<IconUsers size={18} />} color="primary" label="Employees" value={run.totals.employees} foot={<StatusBadge status={run.status} />} /></div>
        <div className="col-xl-3 col-sm-6"><Kpi icon={<IconCash size={18} />} color="secondary" label="Gross" value={money(run.totals.gross)} foot={`${run.workingDays} working days`} /></div>
        <div className="col-xl-3 col-sm-6"><Kpi icon={<IconReceiptTax size={18} />} color="pink" label="Deductions + tax" value={money(run.totals.deductions + run.totals.tax)} foot={`tax ${money(run.totals.tax)}`} /></div>
        <div className="col-xl-3 col-sm-6"><Kpi icon={<IconWallet size={18} />} color="success" label="Net pay" value={money(run.totals.net)} /></div>
      </div>
      <div className="card">
        <div className="card-header">
          <h5>Payslips</h5>
          {run.status === "finalized" ? <span className="badge-soft s-success no-dot"><IconLock size={12} /> Locked</span> : <span className="fs-13">Draft: HR can refresh it until Admin finalizes</span>}
        </div>
        <div className="table-responsive">
          <table className="table table-hover">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Department</th>
                <th>Gross</th>
                <th>Payable days</th>
                <th>Absent</th>
                <th>Unpaid</th>
                <th>Half</th>
                <th>Deduction</th>
                <th>Tax</th>
                <th>Net</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {payslips.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/employees/${p.employeeId}`} className="t-strong text-body-strong">{p.employeeName}</Link>
                    <div className="fs-12">{p.code}</div>
                  </td>
                  <td>{p.departmentName}</td>
                  <td>
                    {money(p.earnedGross)}
                    {p.earnedGross !== p.gross && <div className="fs-12">of {money(p.gross)} (prorated)</div>}
                  </td>
                  <td>{p.payableDays}/{p.workingDays}</td>
                  <td>{p.absentDays}</td>
                  <td>{p.unpaidDays}</td>
                  <td>{p.halfDays}</td>
                  <td>{money(p.deduction)}</td>
                  <td>{money(p.tax)}</td>
                  <td className="t-strong">{money(p.net)}</td>
                  <td className="text-end">
                    <button className="btn btn-outline-light btn-sm" onClick={() => download(`/payslips/${p.id}/pdf`, `payslip-${month}-${p.code}.pdf`).catch((e) => toast.error(errorMessage(e)))} aria-label="Download PDF">
                      <IconDownload size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
