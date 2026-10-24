import { route } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { db } from "@/lib/server/firebase-admin";
import { getSettings } from "@/lib/server/services/org";
import type { Me } from "@/lib/shared/types";

export const GET = route(async (req): Promise<Me> => {
  const actor = await authenticate(req, { allowPasswordChange: true });
  const [user, settings] = await Promise.all([db().collection("users").doc(actor.uid).get(), getSettings()]);
  return { ...actor, mustChangePassword: !!user.data()?.mustChangePassword, companyName: settings?.companyName ?? "HCM Lite" };
});
