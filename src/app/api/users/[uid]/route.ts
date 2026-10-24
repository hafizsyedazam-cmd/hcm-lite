import { z } from "zod";
import { route, body } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { setUserActive } from "@/lib/server/services/org";

export const PATCH = route(async (req, ctx: { params: Promise<{ uid: string }> }) => {
  const { uid } = await ctx.params;
  const actor = await authenticate(req, { roles: ["admin"] });
  const { active } = await body(req, z.object({ active: z.boolean() }));
  await setUserActive(actor, uid, active);
  return { ok: true };
});
