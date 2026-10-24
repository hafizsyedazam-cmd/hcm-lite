import { route } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { listNotifications } from "@/lib/server/services/comms";

export const GET = route(async (req) => listNotifications(await authenticate(req)));
