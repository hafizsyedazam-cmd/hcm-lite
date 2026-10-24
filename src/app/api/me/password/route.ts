import { z } from "zod";
import { route, body } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { changeOwnPassword } from "@/lib/server/services/org";

export const POST = route(async (req) => {
  const actor = await authenticate(req, { allowPasswordChange: true });
  const { password } = await body(req, z.object({ password: z.string() }));
  await changeOwnPassword(actor, password);
  return { ok: true };
});
