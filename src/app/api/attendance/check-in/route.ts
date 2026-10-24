import { route, body } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { checkIn, checkInSchema } from "@/lib/server/services/attendance";

export const POST = route(async (req) => {
  const actor = await authenticate(req, { roles: ["employee"] });
  return checkIn(actor, await body(req, checkInSchema));
});
