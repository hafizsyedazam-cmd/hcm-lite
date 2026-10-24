import "server-only";
import { db, nowIso, rows } from "../firebase-admin";
import { forbidden, notFound } from "../http";
import type { Actor } from "../auth";
import type { Announcement, AppNotification, AuditEntry, Role, UserDoc } from "@/lib/shared/types";

// ---------- Audit log (append only: there is no update or delete API) ----------

export async function audit(actor: Actor, action: string, entity: string, entityId: string, before: unknown = null, after: unknown = null) {
  const entry: Omit<AuditEntry, "id"> = {
    actorUid: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    entity,
    entityId,
    before: before ?? null,
    after: after ?? null,
    at: nowIso(),
  };
  await db().collection("auditLogs").add(entry);
}

export async function listAudit(actor: Actor, opts: { entity?: string; limit?: number }) {
  if (actor.role !== "admin") throw forbidden();
  const snap = await db().collection("auditLogs").orderBy("at", "desc").limit(Math.min(opts.limit ?? 200, 500)).get();
  const list = rows<AuditEntry>(snap);
  return opts.entity ? list.filter((a) => a.entity === opts.entity) : list;
}

// ---------- Notifications ----------

export async function notify(uid: string, title: string, body: string, link: string | null = null) {
  const n: Omit<AppNotification, "id"> = { uid, title, body, link, read: false, createdAt: nowIso() };
  await db().collection("notifications").add(n);
}

export async function notifyRole(role: Role, title: string, body: string, link: string | null = null) {
  const users = rows<UserDoc & { id: string }>(await db().collection("users").where("role", "==", role).get());
  await Promise.all(users.filter((u) => u.active).map((u) => notify(u.uid, title, body, link)));
}

export async function listNotifications(actor: Actor) {
  const list = rows<AppNotification>(await db().collection("notifications").where("uid", "==", actor.uid).get());
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50);
}

export async function markRead(actor: Actor, id: string | "all") {
  if (id === "all") {
    const snap = await db().collection("notifications").where("uid", "==", actor.uid).get();
    const batch = db().batch();
    snap.docs.filter((d) => !d.data().read).forEach((d) => batch.update(d.ref, { read: true }));
    await batch.commit();
    return;
  }
  const ref = db().collection("notifications").doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.uid !== actor.uid) throw notFound();
  await ref.update({ read: true });
}

// ---------- Announcements ----------

export async function listAnnouncements(limit = 20) {
  const snap = await db().collection("announcements").orderBy("createdAt", "desc").limit(limit).get();
  return rows<Announcement>(snap);
}

export async function postAnnouncement(actor: Actor, input: { title: string; body: string }) {
  if (actor.role === "employee") throw forbidden();
  const a: Omit<Announcement, "id"> = {
    title: input.title,
    body: input.body,
    createdBy: actor.uid,
    createdByName: actor.name,
    createdByRole: actor.role,
    createdAt: nowIso(),
  };
  const ref = await db().collection("announcements").add(a);
  await audit(actor, "create", "announcement", ref.id, null, a);
  return { id: ref.id, ...a };
}

export async function deleteAnnouncement(actor: Actor, id: string) {
  if (actor.role === "employee") throw forbidden();
  const ref = db().collection("announcements").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw notFound();
  await ref.delete();
  await audit(actor, "delete", "announcement", id, snap.data(), null);
}
