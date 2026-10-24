import { z } from "zod";
import { route, body } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { commitImport, dryRunImport } from "@/lib/server/services/employees";

const schema = z.object({ rows: z.array(z.record(z.string(), z.string())).max(500), commit: z.boolean().default(false) });

export const POST = route(async (req) => {
  const actor = await authenticate(req, { roles: ["hr"] });
  const input = await body(req, schema);
  if (!input.commit) {
    const report = await dryRunImport(actor, input.rows);
    return { total: report.total, validCount: report.validCount, errors: report.errors };
  }
  return commitImport(actor, input.rows);
});
