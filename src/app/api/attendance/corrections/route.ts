import { route, body, query } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { correctionSchema, listCorrections, requestCorrection } from "@/lib/server/services/attendance";

export const GET = route(async (req) => listCorrections(await authenticate(req), query(req).get("status") ?? undefined));

export const POST = route(async (req) => {
  const actor = await authenticate(req, { roles: ["employee"] });
  return requestCorrection(actor, await body(req, correctionSchema));
});
