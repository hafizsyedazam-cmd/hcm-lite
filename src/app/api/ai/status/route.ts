import { route } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { aiStatus } from "@/lib/server/services/ai";

export const GET = route(async (req) => {
  await authenticate(req);
  return aiStatus();
});
