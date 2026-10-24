import "server-only";
import { readFileSync } from "fs";
import path from "path";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore, type QuerySnapshot } from "firebase-admin/firestore";

let app: App | undefined;
let firestore: Firestore | undefined;

function credential() {
  if (process.env.FIREBASE_PRIVATE_KEY) {
    return cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    });
  }
  const file = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (file) {
    return cert(JSON.parse(readFileSync(path.resolve(/*turbopackIgnore: true*/ process.cwd(), file), "utf8")));
  }
  throw new Error(
    "Firebase Admin credentials are missing. Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY.",
  );
}

function adminApp(): App {
  if (app) return app;
  app = getApps()[0] ?? initializeApp({ credential: credential() });
  return app;
}

export function db(): Firestore {
  if (firestore) return firestore;
  firestore = getFirestore(adminApp());
  try {
    firestore.settings({ ignoreUndefinedProperties: true });
  } catch {
    // Already configured: in dev, hot reload re-runs this module while the Firestore instance lives on.
  }
  return firestore;
}

export function adminAuth() {
  return getAuth(adminApp());
}

export const nowIso = () => new Date().toISOString();

/** Map a query snapshot to plain objects with their document id. */
export function rows<T>(snap: QuerySnapshot): T[] {
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}
