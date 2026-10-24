import { route } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { myPayslips } from "@/lib/server/services/payroll";

export const GET = route(async (req) => myPayslips(await authenticate(req, { roles: ["employee"] })));
