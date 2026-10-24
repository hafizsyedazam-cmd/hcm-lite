"use client";
import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { IconAlertTriangle, IconChevronLeft, IconChevronRight, IconHome, IconInbox, IconX } from "@tabler/icons-react";

// ---------- Layout pieces ----------

export function PageHeader({ title, crumbs = [], actions }: { title: string; crumbs?: string[]; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h2>{title}</h2>
        <div className="crumbs">
          <IconHome size={14} />
          {crumbs.map((c, i) => (
            <span key={c} className={i === crumbs.length - 1 ? "current" : ""}>
              <span className="mx-1">›</span>
              {c}
            </span>
          ))}
        </div>
      </div>
      {actions && <div className="d-flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = "", bodyClass = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <div className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-header">
          {typeof title === "string" ? <h5>{title}</h5> : title}
          {actions && <div className="d-flex align-items-center gap-2 flex-wrap">{actions}</div>}
        </div>
      )}
      <div className={`card-body ${bodyClass}`}>{children}</div>
    </div>
  );
}

export type KpiColor = "primary" | "secondary" | "info" | "pink" | "purple" | "danger" | "success" | "dark";

export function Kpi({ icon, color, label, value, foot, href }: { icon: ReactNode; color: KpiColor; label: string; value: ReactNode; foot?: ReactNode; href?: string }) {
  return (
    <div className="card kpi" data-color={color}>
      <div className="kpi-top">
        <div className="min-w-0">
          <div className="kpi-label">{label}</div>
          <div className="kpi-value">{value}</div>
        </div>
        <span className="kpi-icon">{icon}</span>
      </div>
      {(foot || href) && <div className="kpi-foot">{href ? <Link href={href}>{foot ?? "View all"} →</Link> : foot}</div>}
    </div>
  );
}

// ---------- Feedback states ----------

export function Spinner({ size = 34 }: { size?: number }) {
  return <div className="spinner-c" style={{ width: size, height: size }} role="status" aria-label="Loading" />;
}

export function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="d-flex flex-column gap-2" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 18, width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function PageLoading() {
  return (
    <div className="row">
      {[0, 1, 2, 3].map((i) => (
        <div className="col-xl-3 col-sm-6" key={i}>
          <div className="card kpi">
            <div className="skeleton mb-3" style={{ width: 36, height: 36, borderRadius: "50%" }} />
            <div className="skeleton mb-2" style={{ width: "60%", height: 12 }} />
            <div className="skeleton" style={{ width: "40%", height: 22 }} />
          </div>
        </div>
      ))}
      <div className="col-12">
        <div className="card card-body">
          <Loading rows={6} />
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ title, text, action, icon }: { title: string; text?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon ?? <IconInbox size={26} />}</div>
      <h6 className="mb-1">{title}</h6>
      {text && <p className="mb-3 fs-13">{text}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-icon" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
        <IconAlertTriangle size={26} />
      </div>
      <h6 className="mb-1">Could not load this</h6>
      <p className="mb-3 fs-13">{message}</p>
      {onRetry && (
        <button className="btn btn-outline-light btn-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

// ---------- Modal ----------

export function Modal({ open, title, onClose, children, footer, size }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: "lg" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop-c" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal-c ${size ?? ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h5>{title}</h5>
          <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={onClose} aria-label="Close">
            <IconX size={16} />
          </button>
        </div>
        <div className="modal-body-c">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Small bits ----------

const AVATAR_COLORS = ["#f26522", "#0c4b5e", "#1b84ff", "#fd3995", "#ab47bc", "#03c95a", "#3b7080", "#e70d0d"];

export function Avatar({ name, size }: { name: string; size?: "lg" | "xl" }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("");
  const color = AVATAR_COLORS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return (
    <span className={`avatar ${size ? `avatar-${size}` : ""}`} style={{ background: color }}>
      {initials || "?"}
    </span>
  );
}

const STATUS_STYLE: Record<string, [string, string]> = {
  present: ["s-success", "Present"],
  late: ["s-warning", "Late"],
  half_day: ["s-info", "Half day"],
  missing_checkout: ["s-purple", "Missing checkout"],
  absent: ["s-danger", "Absent"],
  on_leave: ["s-primary", "On leave"],
  weekend: ["s-muted", "Weekend"],
  holiday: ["s-muted", "Holiday"],
  upcoming: ["s-muted", "—"],
  not_joined: ["s-muted", "—"],
  pending: ["s-warning", "Pending"],
  approved: ["s-success", "Approved"],
  rejected: ["s-danger", "Rejected"],
  cancelled: ["s-muted", "Cancelled"],
  draft: ["s-warning", "Draft"],
  finalized: ["s-success", "Finalized"],
  active: ["s-success", "Active"],
  probation: ["s-info", "Probation"],
  exited: ["s-muted", "Exited"],
  inactive: ["s-danger", "Inactive"],
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const [cls, text] = STATUS_STYLE[status] ?? ["s-muted", status];
  return <span className={`badge-soft ${cls}`}>{label ?? text}</span>;
}

export function RoleBadge({ role }: { role: string }) {
  const cls = role === "admin" ? "s-danger" : role === "hr" ? "s-info" : "s-primary";
  return <span className={`badge-soft no-dot ${cls}`}>{role === "hr" ? "HR" : role[0].toUpperCase() + role.slice(1)}</span>;
}

export function Pagination({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  return (
    <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 px-3 py-3">
      <span className="fs-13">
        Page {page} of {pages} · {total} record{total === 1 ? "" : "s"}
      </span>
      <div className="d-flex gap-1">
        <button className="btn btn-outline-light btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <IconChevronLeft size={14} />
        </button>
        <button className="btn btn-outline-light btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <IconChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

export function money(n: number | null | undefined, currency = "PKR") {
  if (n == null) return "—";
  return `${currency} ${Math.round(n).toLocaleString("en-US")}`;
}

export function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <div className={`mb-3 ${className}`}>
      <label className="form-label">{label}</label>
      {children}
      {hint && <div className="form-text fs-12">{hint}</div>}
    </div>
  );
}

export function AiLabel() {
  return <span className="ai-label">✦ AI-generated</span>;
}
