import { z } from "zod";
import { route, body } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { markRead } from "@/lib/server/services/comms";

export const POST = route(async (req) => {
  const actor = await authenticate(req);
  const { id } = await body(req, z.object({ id: z.string().min(1) }));
  await markRead(actor, id);
  return { ok: true };
});
