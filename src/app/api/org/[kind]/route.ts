import { route, body, notFound } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { createLookup, listDepartments, listDesignations, listHolidays, listLeaveTypes } from "@/lib/server/services/org";
import { KINDS, isKind, schemaFor } from "../kinds";

const LISTS = { departments: listDepartments, designations: listDesignations, "leave-types": listLeaveTypes, holidays: listHolidays };

type Ctx = { params: Promise<{ kind: string }> };

export const GET = route(async (req, ctx: Ctx) => {
  const { kind } = await ctx.params;
  if (!isKind(kind)) throw notFound();
  await authenticate(req);
  return LISTS[kind]();
});

export const POST = route(async (req, ctx: Ctx) => {
  const { kind } = await ctx.params;
  if (!isKind(kind)) throw notFound();
  const actor = await authenticate(req, { roles: ["admin"] });
  return createLookup(actor, KINDS[kind], await body(req, schemaFor(kind)));
});
