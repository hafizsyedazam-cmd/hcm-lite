import { route, body } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { smartLeave, smartLeaveSchema } from "@/lib/server/services/ai";

export const POST = route(async (req) => {
  const actor = await authenticate(req, { roles: ["employee"] });
  const { text } = await body(req, smartLeaveSchema);
  return smartLeave(actor, text);
});
