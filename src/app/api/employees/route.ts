import { route, body, query } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { employeeSchema, registerEmployee, searchEmployees } from "@/lib/server/services/employees";

export const GET = route(async (req) => {
  const actor = await authenticate(req, { roles: ["admin", "hr"] });
  const q = query(req);
  return searchEmployees(actor, {
    q: q.get("q") ?? undefined,
    departmentId: q.get("departmentId") ?? undefined,
    designationId: q.get("designationId") ?? undefined,
    status: q.get("status") ?? undefined,
    page: Number(q.get("page") ?? 1),
    pageSize: Number(q.get("pageSize") ?? 10),
  });
});

export const POST = route(async (req) => {
  const actor = await authenticate(req, { roles: ["hr"] });
  return registerEmployee(actor, await body(req, employeeSchema));
});
