import { z } from "zod";
import { route, body } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { generateDraft, listRuns } from "@/lib/server/services/payroll";

export const GET = route(async (req) => listRuns(await authenticate(req, { roles: ["admin", "hr"] })));

export const POST = route(async (req) => {
  const actor = await authenticate(req, { roles: ["hr"] });
  const { month } = await body(req, z.object({ month: z.string() }));
  return generateDraft(actor, month);
});
