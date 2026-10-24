import { z } from "zod";
import { route, body } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { reviewCorrection } from "@/lib/server/services/attendance";

const schema = z.object({ approve: z.boolean(), comment: z.string().max(300).default("") });

export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const actor = await authenticate(req, { roles: ["hr"] });
  return reviewCorrection(actor, id, await body(req, schema));
});
