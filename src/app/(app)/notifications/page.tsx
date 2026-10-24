"use client";
import Link from "next/link";
import { IconBell, IconChecks } from "@tabler/icons-react";
import { EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui";
import { api, useApi } from "@/lib/client/api";
import { prettyDateTime } from "@/lib/shared/dates";
import type { AppNotification } from "@/lib/shared/types";

export default function NotificationsPage() {
  const { data, error, loading, reload } = useApi<AppNotification[]>("/notifications");
  const markAll = async () => {
    await api("/notifications/read", { body: { id: "all" } });
    reload();
  };
  return (
    <>
      <PageHeader
        title="Notifications"
        crumbs={["Communication", "Notifications"]}
        actions={
          data?.some((n) => !n.read) && (
            <button className="btn btn-outline-light" onClick={markAll}>
              <IconChecks size={16} /> Mark all read
            </button>
          )
        }
      />
      <div className="card">
        {loading && !data ? (
          <div className="card-body"><Loading /></div>
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data?.length ? (
          <EmptyState icon={<IconBell size={26} />} title="No notifications" text="Leave decisions, payslips and requests show up here." />
        ) : (
          data.map((n) => (
            <Link key={n.id} href={n.link ?? "#"} className={`notif-item ${n.read ? "" : "unread"}`} onClick={() => !n.read && api("/notifications/read", { body: { id: n.id } }).catch(() => {})}>
              <div className="d-flex justify-content-between gap-2">
                <span className="fw-medium">{n.title}</span>
                <span className="fs-12 text-muted text-nowrap">{prettyDateTime(n.createdAt)}</span>
              </div>
              <div className="fs-13 text-muted">{n.body}</div>
            </Link>
          ))
        )}
      </div>
    </>
  );
}
