import { route, query } from "@/lib/server/http";
import { authenticate, assertOwnOrStaff } from "@/lib/server/auth";
import { balancesFor, myBalances } from "@/lib/server/services/leave";

export const GET = route(async (req) => {
  const actor = await authenticate(req);
  const q = query(req);
  const employeeId = q.get("employeeId");
  const year = q.get("year") ?? undefined;
  if (!employeeId) return myBalances(actor, year);
  assertOwnOrStaff(actor, employeeId);
  return balancesFor(employeeId, year ?? new Date().toISOString().slice(0, 4));
});
