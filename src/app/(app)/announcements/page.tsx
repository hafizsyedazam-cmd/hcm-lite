"use client";
import { useState } from "react";
import { toast } from "sonner";
import { IconPlus, IconSpeakerphone, IconTrash } from "@tabler/icons-react";
import { useAuth } from "@/components/AuthProvider";
import { Avatar, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, RoleBadge } from "@/components/ui";
import { api, errorMessage, useApi } from "@/lib/client/api";
import { prettyDateTime } from "@/lib/shared/dates";
import type { Announcement } from "@/lib/shared/types";

export default function AnnouncementsPage() {
  const { me } = useAuth();
  const { data, error, loading, reload } = useApi<Announcement[]>("/announcements");
  const [form, setForm] = useState<{ title: string; body: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const canPost = me?.role === "admin" || me?.role === "hr";

  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      await api("/announcements", { body: form });
      toast.success("Announcement posted to all dashboards");
      setForm(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a: Announcement) => {
    if (!confirm(`Delete "${a.title}"?`)) return;
    try {
      await api(`/announcements/${a.id}`, { method: "DELETE" });
      toast.success("Deleted");
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title="Announcements"
        crumbs={["Communication", "Announcements"]}
        actions={
          canPost && (
            <button className="btn btn-primary" onClick={() => setForm({ title: "", body: "" })}>
              <IconPlus size={16} /> New announcement
            </button>
          )
        }
      />
      {loading && !data ? (
        <div className="card card-body"><Loading /></div>
      ) : error ? (
        <div className="card"><ErrorState message={error} onRetry={reload} /></div>
      ) : !data?.length ? (
        <div className="card">
          <EmptyState icon={<IconSpeakerphone size={26} />} title="No announcements yet" text={canPost ? "Post one; it shows on every dashboard." : undefined} />
        </div>
      ) : (
        data.map((a) => (
          <div className="card" key={a.id}>
            <div className="card-body d-flex gap-3">
              <Avatar name={a.createdByName} size="lg" />
              <div className="flex-grow-1 min-w-0">
                <div className="d-flex justify-content-between gap-2 flex-wrap">
                  <h5 className="mb-1">{a.title}</h5>
                  {canPost && (
                    <button className="btn btn-soft-danger btn-sm" onClick={() => remove(a)} aria-label="Delete announcement">
                      <IconTrash size={15} />
                    </button>
                  )}
                </div>
                <div className="fs-12 mb-2 d-flex align-items-center gap-2">
                  {a.createdByName} <RoleBadge role={a.createdByRole} /> · {prettyDateTime(a.createdAt)}
                </div>
                <p className="mb-0 text-body-strong" style={{ whiteSpace: "pre-wrap" }}>{a.body}</p>
              </div>
            </div>
          </div>
        ))
      )}
      <Modal
        open={!!form}
        title="New announcement"
        onClose={() => setForm(null)}
        footer={
          <>
            <button className="btn btn-outline-light" onClick={() => setForm(null)}>Cancel</button>
            <button className="btn btn-primary" form="ann-form" disabled={saving}>{saving ? "Posting..." : "Post"}</button>
          </>
        }
      >
        {form && (
          <form id="ann-form" onSubmit={post}>
            <Field label="Title">
              <input className="form-control" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={3} maxLength={120} autoFocus />
            </Field>
            <Field label="Message">
              <textarea className="form-control" rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required minLength={3} maxLength={2000} />
            </Field>
          </form>
        )}
      </Modal>
    </>
  );
}
