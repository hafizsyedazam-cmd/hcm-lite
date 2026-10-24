// Wipes ALL HCM Lite data (every Firestore collection and every Firebase Auth user)
// so the app starts again from first-run setup, e.g. before judging.
//
// Usage:  node scripts/reset-db.mjs --yes
// Reads the Admin SDK key from FIREBASE_SERVICE_ACCOUNT_PATH (default ./service-account.json).
import { readFileSync } from "fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "./service-account.json";
const key = JSON.parse(readFileSync(keyPath, "utf8"));

if (!process.argv.includes("--yes")) {
  console.log(`This deletes every document and every login in Firebase project "${key.project_id}".`);
  console.log("Run again with --yes to confirm.");
  process.exit(1);
}

const app = initializeApp({ credential: cert(key) });
const db = getFirestore(app);
const auth = getAuth(app);

for (const col of await db.listCollections()) {
  await db.recursiveDelete(col);
  console.log(`deleted collection ${col.id}`);
}

let removed = 0;
let page;
do {
  page = await auth.listUsers(1000, page?.pageToken);
  if (page.users.length) {
    await auth.deleteUsers(page.users.map((u) => u.uid));
    removed += page.users.length;
  }
} while (page.pageToken);
console.log(`deleted ${removed} logins`);
console.log(`Project ${key.project_id} is empty. Open the app to run first-run setup.`);
