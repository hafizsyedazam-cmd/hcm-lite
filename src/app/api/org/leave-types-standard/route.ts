import { route } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { addStandardLeaveTypes } from "@/lib/server/services/org";

export const POST = route(async (req) => {
  const actor = await authenticate(req, { roles: ["admin"] });
  return addStandardLeaveTypes(actor);
});
