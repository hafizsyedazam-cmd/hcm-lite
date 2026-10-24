"use client";
import { Fragment, useState } from "react";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { EmptyState, ErrorState, Loading, PageHeader, RoleBadge } from "@/components/ui";
import { useApi } from "@/lib/client/api";
import { prettyDateTime } from "@/lib/shared/dates";
import type { AuditEntry } from "@/lib/shared/types";

const ENTITIES = ["company", "settings", "user", "employee", "department", "designation", "leave_type", "holiday", "attendance", "attendance_correction", "leave_request", "payroll_run", "announcement"];

export default function AuditPage() {
  const [entity, setEntity] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const { data, error, loading, reload } = useApi<AuditEntry[]>(`/audit?entity=${entity}`);
  return (
    <>
      <PageHeader title="Audit Log" crumbs={["Communication", "Audit Log"]} />
      <div className="card">
        <div className="card-header">
          <h5>Every important action (read only)</h5>
          <select className="form-select" style={{ width: 200 }} value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Entity">
            <option value="">All entities</option>
            {ENTITIES.map((e) => (
              <option key={e} value={e}>{e.replace("_", " ")}</option>
            ))}
          </select>
        </div>
        {loading && !data ? (
          <div className="card-body"><Loading rows={6} /></div>
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data?.length ? (
          <EmptyState title="No audit entries" />
        ) : (
          <div className="table-responsive">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th />
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {data.map((a) => (
                  <Fragment key={a.id}>
                    <tr role="button" onClick={() => setOpen(open === a.id ? null : a.id)}>
                      <td>{open === a.id ? <IconChevronDown size={15} /> : <IconChevronRight size={15} />}</td>
                      <td className="text-nowrap">{prettyDateTime(a.at)}</td>
                      <td>
                        <span className="t-strong me-1">{a.actorName}</span>
                        <RoleBadge role={a.actorRole} />
                      </td>
                      <td><span className="badge-soft s-primary no-dot">{a.action.replace("_", " ")}</span></td>
                      <td>{a.entity.replace("_", " ")}</td>
                      <td className="fs-12">{a.entityId}</td>
                    </tr>
                    {open === a.id && (
                      <tr>
                        <td colSpan={6}>
                          <div className="row g-2">
                            <div className="col-md-6">
                              <div className="fs-12 fw-medium mb-1">Before</div>
                              <div className="json-box">{JSON.stringify(a.before, null, 2)}</div>
                            </div>
                            <div className="col-md-6">
                              <div className="fs-12 fw-medium mb-1">After</div>
                              <div className="json-box">{JSON.stringify(a.after, null, 2)}</div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
