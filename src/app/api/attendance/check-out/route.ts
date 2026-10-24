import { route } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { checkOut } from "@/lib/server/services/attendance";

export const POST = route(async (req) => checkOut(await authenticate(req, { roles: ["employee"] })));
