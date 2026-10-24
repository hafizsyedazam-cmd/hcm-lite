import { route, body } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { createHrUser, hrUserSchema, listUsers } from "@/lib/server/services/org";

export const GET = route(async (req) => listUsers(await authenticate(req, { roles: ["admin"] })));

export const POST = route(async (req) => {
  const actor = await authenticate(req, { roles: ["admin"] });
  return createHrUser(actor, await body(req, hrUserSchema));
});
