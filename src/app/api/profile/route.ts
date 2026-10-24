import { route, body } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { selfUpdateSchema, updateSelf } from "@/lib/server/services/employees";

export const PUT = route(async (req) => {
  const actor = await authenticate(req, { roles: ["employee"] });
  return updateSelf(actor, await body(req, selfUpdateSchema));
});
