import { z } from "zod";
import { route, body } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { cancelLeave, reviewLeave } from "@/lib/server/services/leave";

const schema = z.object({ action: z.enum(["approve", "reject", "cancel"]), comment: z.string().max(300).default("") });

export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const actor = await authenticate(req);
  const input = await body(req, schema);
  if (input.action === "cancel") return cancelLeave(actor, id);
  return reviewLeave(actor, id, { approve: input.action === "approve", comment: input.comment });
});
