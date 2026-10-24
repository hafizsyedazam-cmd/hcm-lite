import { route, query } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { companyMetrics, employeeDashboard, resolveFilters } from "@/lib/server/services/analytics";
import { listAnnouncements, listAudit } from "@/lib/server/services/comms";

export const GET = route(async (req) => {
  const actor = await authenticate(req);
  if (actor.role === "employee") return { role: "employee", data: await employeeDashboard(actor) };
  const q = query(req);
  const filters = await resolveFilters({ from: q.get("from") ?? undefined, to: q.get("to") ?? undefined, departmentId: q.get("departmentId") ?? undefined });
  const [metrics, announcements, auditFeed] = await Promise.all([
    companyMetrics(actor, filters),
    listAnnouncements(5),
    actor.role === "admin" ? listAudit(actor, { limit: 8 }) : Promise.resolve([]),
  ]);
  return { role: actor.role, data: metrics, announcements, auditFeed };
});
