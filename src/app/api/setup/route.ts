import { route, body } from "@/lib/server/http";
import { envAdmin, readSettings, runSetup, setupSchema } from "@/lib/server/services/org";

// Public: tells the app whether the first-run screen should be shown.
export const GET = route(async () => {
  const s = await readSettings();
  return { setupComplete: !!s?.setupComplete, companyName: s?.companyName ?? null, adminFromEnv: !!envAdmin() };
});

export const POST = route(async (req) => runSetup(await body(req, setupSchema)));
