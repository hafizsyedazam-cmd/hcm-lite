"use client";
import { toast } from "sonner";
import { IconDownload } from "@tabler/icons-react";
import { EmptyState, ErrorState, Loading, PageHeader, money } from "@/components/ui";
import { download, errorMessage, useApi } from "@/lib/client/api";
import { prettyMonth } from "@/lib/shared/dates";
import type { Payslip } from "@/lib/shared/types";

export default function PayslipsPage() {
  const { data, error, loading, reload } = useApi<Payslip[]>("/payslips");
  return (
    <>
      <PageHeader title="My Payslips" crumbs={["People", "My Payslips"]} />
      <div className="card">
        <div className="card-header">
          <h5>Payslips</h5>
          <span className="fs-13">Available after Admin finalizes the month</span>
        </div>
        {loading && !data ? (
          <div className="card-body"><Loading /></div>
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data?.length ? (
          <EmptyState title="No payslips yet" text="Your payslip will appear here once the month's payroll is finalized." />
        ) : (
          <div className="table-responsive">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Gross</th>
                  <th>Absent / unpaid / half days</th>
                  <th>Deductions</th>
                  <th>Tax</th>
                  <th>Net pay</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.id}>
                    <td className="t-strong">{prettyMonth(p.month)}</td>
                    <td>{money(p.earnedGross)}</td>
                    <td>{p.absentDays} / {p.unpaidDays} / {p.halfDays}</td>
                    <td>{money(p.deduction)}</td>
                    <td>{money(p.tax)}</td>
                    <td className="t-strong text-primary">{money(p.net)}</td>
                    <td className="text-end">
                      <button className="btn btn-primary btn-sm" onClick={() => download(`/payslips/${p.id}/pdf`, `payslip-${p.month}.pdf`).catch((e) => toast.error(errorMessage(e)))}>
                        <IconDownload size={15} /> PDF
                      </button>
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
