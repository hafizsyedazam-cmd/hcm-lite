import { z } from "zod";
import { route, body } from "@/lib/server/http";
import { authenticate } from "@/lib/server/auth";
import { listAnnouncements, postAnnouncement } from "@/lib/server/services/comms";

const schema = z.object({ title: z.string().trim().min(3).max(120), body: z.string().trim().min(3).max(2000) });

export const GET = route(async (req) => {
  await authenticate(req);
  return listAnnouncements(50);
});

export const POST = route(async (req) => {
  const actor = await authenticate(req, { roles: ["admin", "hr"] });
  return postAnnouncement(actor, await body(req, schema));
});
