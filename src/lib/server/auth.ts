import "server-only";
import { randomInt } from "crypto";
import { adminAuth, db } from "./firebase-admin";
import { ApiError, forbidden } from "./http";
import type { Role, UserDoc } from "@/lib/shared/types";

export interface Actor {
  uid: string;
  email: string;
  name: string;
  role: Role;
  employeeId: string | null;
}

interface Options {
  roles?: Role[];
  /** Allow users who still have to change their temporary password. */
  allowPasswordChange?: boolean;
}

/**
 * Verifies the Firebase ID token (a signed JWT) and loads the user's role.
 * Every API route calls this, so access is decided on the server for every request.
 */
export async function authenticate(req: Request, opts: Options = {}): Promise<Actor> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) throw new ApiError(401, "Please sign in");
  let uid: string;
  try {
    // Signature and expiry are checked locally; deactivated accounts are stopped by the `active` flag below.
    const decoded = await adminAuth().verifyIdToken(header.slice(7));
    uid = decoded.uid;
  } catch {
    throw new ApiError(401, "Your session has expired, please sign in again");
  }
  const snap = await db().collection("users").doc(uid).get();
  if (!snap.exists) throw forbidden("This account is not registered in HCM Lite");
  const user = snap.data() as UserDoc;
  if (!user.active) throw forbidden("This account has been deactivated");
  if (user.mustChangePassword && !opts.allowPasswordChange) {
    throw new ApiError(403, "Please change your temporary password first", { code: "PASSWORD_CHANGE_REQUIRED" });
  }
  if (opts.roles && !opts.roles.includes(user.role)) throw forbidden();
  return { uid, email: user.email, name: user.name, role: user.role, employeeId: user.employeeId };
}

/** Employees may only touch rows with their own employee_id. */
export function assertOwnOrStaff(actor: Actor, employeeId: string) {
  if (actor.role === "employee" && actor.employeeId !== employeeId) throw forbidden();
}

/** Readable temporary password, e.g. "Hcm-4821-kpz". */
export function tempPassword(): string {
  const letters = "abcdefghjkmnpqrstuvwxyz";
  const pick = () => letters[randomInt(letters.length)];
  return `Hcm-${randomInt(1000, 9999)}-${pick()}${pick()}${pick()}`;
}

export async function createLogin(input: { email: string; name: string; role: Role; employeeId: string | null; password: string; mustChangePassword: boolean }) {
  let uid: string;
  try {
    const user = await adminAuth().createUser({ email: input.email, password: input.password, displayName: input.name });
    uid = user.uid;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "auth/email-already-exists") throw new ApiError(409, `A login with ${input.email} already exists`);
    if (code === "auth/invalid-email") throw new ApiError(422, "Email address is not valid");
    if (code === "auth/invalid-password") throw new ApiError(422, "Password must be at least 6 characters");
    throw e;
  }
  const doc: UserDoc = {
    uid,
    email: input.email,
    name: input.name,
    role: input.role,
    employeeId: input.employeeId,
    active: true,
    mustChangePassword: input.mustChangePassword,
    createdAt: new Date().toISOString(),
  };
  await db().collection("users").doc(uid).set(doc);
  await adminAuth().setCustomUserClaims(uid, { role: input.role });
  return doc;
}
