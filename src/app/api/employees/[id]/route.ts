import { route, body } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { employeeUpdateSchema, updateEmployee, viewEmployee } from "@/lib/server/services/employees";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  return viewEmployee(await authenticate(req), id);
});

export const PUT = route(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const actor = await authenticate(req, { roles: ["hr"] });
  return updateEmployee(actor, id, await body(req, employeeUpdateSchema));
});
