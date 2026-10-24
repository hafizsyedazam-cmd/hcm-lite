import { route, body, notFound } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { deleteLookup, updateLookup } from "@/lib/server/services/org";
import { KINDS, isKind, schemaFor } from "../../kinds";

type Ctx = { params: Promise<{ kind: string; id: string }> };

export const PUT = route(async (req, ctx: Ctx) => {
  const { kind, id } = await ctx.params;
  if (!isKind(kind)) throw notFound();
  const actor = await authenticate(req, { roles: ["admin"] });
  return updateLookup(actor, KINDS[kind], id, await body(req, schemaFor(kind)));
});

export const DELETE = route(async (req, ctx: Ctx) => {
  const { kind, id } = await ctx.params;
  if (!isKind(kind)) throw notFound();
  const actor = await authenticate(req, { roles: ["admin"] });
  await deleteLookup(actor, KINDS[kind], id);
  return { ok: true };
});
