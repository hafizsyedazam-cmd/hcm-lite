import { route, query } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { listAudit } from "@/lib/server/services/comms";

// Read only. The audit log has no update or delete endpoint.
export const GET = route(async (req) => {
  const actor = await authenticate(req, { roles: ["admin"] });
  const q = query(req);
  return listAudit(actor, { entity: q.get("entity") || undefined, limit: Number(q.get("limit") ?? 200) });
});
