import { route, query, badRequest } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { employeeCalendar } from "@/lib/server/services/attendance";

export const GET = route(async (req) => {
  const actor = await authenticate(req);
  const q = query(req);
  const employeeId = q.get("employeeId") || actor.employeeId;
  if (!employeeId) throw badRequest("employeeId is required");
  return employeeCalendar(actor, employeeId, q.get("month") ?? "");
});
