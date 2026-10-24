import { route, body } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { requireSettings, settingsSchema, updateSettings } from "@/lib/server/services/org";

export const GET = route(async (req) => {
  await authenticate(req);
  return requireSettings();
});

export const PUT = route(async (req) => {
  const actor = await authenticate(req, { roles: ["admin"] });
  return updateSettings(actor, await body(req, settingsSchema));
});
