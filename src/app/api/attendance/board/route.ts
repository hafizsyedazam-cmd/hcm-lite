import { route, query } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { dailyBoard } from "@/lib/server/services/attendance";

export const GET = route(async (req) => {
  const actor = await authenticate(req, { roles: ["admin", "hr"] });
  const q = query(req);
  return dailyBoard(actor, q.get("date") ?? "", q.get("departmentId") || undefined);
});
