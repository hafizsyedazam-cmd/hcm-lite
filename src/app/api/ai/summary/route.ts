import { z } from "zod";
import { route, body } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { summarize } from "@/lib/server/services/ai";

const schema = z.object({ from: z.string().optional(), to: z.string().optional(), departmentId: z.string().optional() });

export const POST = route(async (req) => {
  const actor = await authenticate(req, { roles: ["admin", "hr"] });
  return summarize(actor, await body(req, schema));
});
