import { route, body, query } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { applyLeave, applySchema, listLeaves } from "@/lib/server/services/leave";

export const GET = route(async (req) => {
  const actor = await authenticate(req);
  const q = query(req);
  return listLeaves(actor, { status: q.get("status") ?? undefined, employeeId: q.get("employeeId") ?? undefined });
});

export const POST = route(async (req) => {
  const actor = await authenticate(req, { roles: ["employee"] });
  return applyLeave(actor, await body(req, applySchema));
});
