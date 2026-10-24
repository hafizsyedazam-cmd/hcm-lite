import { route } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { todayRecord } from "@/lib/server/services/attendance";

export const GET = route(async (req) => todayRecord(await authenticate(req, { roles: ["employee"] })));
