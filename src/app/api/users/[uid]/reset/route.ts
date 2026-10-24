import { route } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { resetUserPassword } from "@/lib/server/services/org";

export const POST = route(async (req, ctx: { params: Promise<{ uid: string }> }) => {
  const { uid } = await ctx.params;
  const actor = await authenticate(req, { roles: ["admin"] });
  return resetUserPassword(actor, uid);
});
