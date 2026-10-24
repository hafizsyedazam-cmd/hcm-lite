import { route } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { deleteAnnouncement } from "@/lib/server/services/comms";

export const DELETE = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await deleteAnnouncement(await authenticate(req, { roles: ["admin", "hr"] }), id);
  return { ok: true };
});
