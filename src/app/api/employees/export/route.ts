import { route } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { exportCsv } from "@/lib/server/services/employees";

export const GET = route(async (req) => {
  const csv = await exportCsv(await authenticate(req, { roles: ["admin", "hr"] }));
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="employees.csv"' },
  });
});
