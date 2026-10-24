import { route, body } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { chat, chatSchema } from "@/lib/server/services/ai";

export const POST = route(async (req) => {
  const actor = await authenticate(req);
  return chat(actor, await body(req, chatSchema));
});
