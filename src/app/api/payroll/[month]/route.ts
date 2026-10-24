import { route } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { getRun } from "@/lib/server/services/payroll";

export const GET = route(async (req, ctx: { params: Promise<{ month: string }> }) => {
  const { month } = await ctx.params;
  return getRun(await authenticate(req, { roles: ["admin", "hr"] }), month);
});
