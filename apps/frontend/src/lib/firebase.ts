import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { firebasePublicConfig, isFirebaseClientConfigured } from "./config";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

export { isFirebaseClientConfigured };

export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseClientConfigured()) {
    return null;
  }

  if (!app) {
    app = initializeApp({
      apiKey: firebasePublicConfig.apiKey,
      authDomain: firebasePublicConfig.authDomain,
      projectId: firebasePublicConfig.projectId,
      storageBucket: firebasePublicConfig.storageBucket,
      messagingSenderId: firebasePublicConfig.messagingSenderId,
      appId: firebasePublicConfig.appId,
    });
  }

  return app;
}

export function getFirebaseAuth(): Auth | null {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) {
    return null;
  }

  if (!auth) {
    auth = getAuth(firebaseApp);
  }

  return auth;
}
