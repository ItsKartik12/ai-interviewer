import admin from "firebase-admin";
import { getEnv, isFirebaseConfigured } from "../config/env.ts";

let initialized = false;

export function getFirebaseAdmin(): admin.app.App | null {
  if (!isFirebaseConfigured()) {
    return null;
  }

  if (!initialized) {
    const privateKey = getEnv("FIREBASE_PRIVATE_KEY")!.replace(/\\n/g, "\n");

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: getEnv("FIREBASE_PROJECT_ID")!,
        clientEmail: getEnv("FIREBASE_CLIENT_EMAIL")!,
        privateKey,
      }),
    });

    initialized = true;
  }

  return admin.app();
}

export function getFirestore() {
  const app = getFirebaseAdmin();
  return app ? admin.firestore(app) : null;
}

export function getAuth() {
  const app = getFirebaseAdmin();
  return app ? admin.auth(app) : null;
}
