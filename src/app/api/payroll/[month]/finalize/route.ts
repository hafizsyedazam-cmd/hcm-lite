import { route } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { finalizeRun } from "@/lib/server/services/payroll";

export const POST = route(async (req, ctx: { params: Promise<{ month: string }> }) => {
  const { month } = await ctx.params;
  return finalizeRun(await authenticate(req, { roles: ["admin"] }), month);
});
