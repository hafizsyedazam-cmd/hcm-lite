"use client";
import { useState } from "react";
import { IconFilter } from "@tabler/icons-react";
import { useApi } from "@/lib/client/api";
import type { Department } from "@/lib/shared/types";

export interface FilterValue {
  from: string;
  to: string;
  departmentId: string;
}

export function toQuery(f: FilterValue) {
  const p = new URLSearchParams();
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.departmentId) p.set("departmentId", f.departmentId);
  return p.toString();
}

/** Date range + department filter shared by the HR and Admin dashboards. */
export function DashboardFilters({ value, onChange }: { value: FilterValue; onChange: (v: FilterValue) => void }) {
  const { data: departments } = useApi<Department[]>("/org/departments");
  const [draft, setDraft] = useState(value);
  return (
    <form
      className="d-flex flex-wrap gap-2 align-items-end"
      onSubmit={(e) => {
        e.preventDefault();
        onChange(draft);
      }}
    >
      <div>
        <label className="form-label fs-12 mb-1">From</label>
        <input type="date" className="form-control form-control-sm" value={draft.from} max={draft.to} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
      </div>
      <div>
        <label className="form-label fs-12 mb-1">To</label>
        <input type="date" className="form-control form-control-sm" value={draft.to} min={draft.from} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
      </div>
      <div>
        <label className="form-label fs-12 mb-1">Department</label>
        <select className="form-select form-select-sm" value={draft.departmentId} onChange={(e) => setDraft({ ...draft, departmentId: e.target.value })}>
          <option value="">All departments</option>
          {departments?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      <button className="btn btn-outline-light" style={{ minHeight: 38 }}>
        <IconFilter size={15} /> Apply
      </button>
    </form>
  );
}
