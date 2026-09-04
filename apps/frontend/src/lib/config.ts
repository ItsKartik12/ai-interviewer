function readPublicEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

/** API origin from PUBLIC_BACKEND_URL. Trailing slashes are stripped. */
export const BACKEND_URL = (readPublicEnv("PUBLIC_BACKEND_URL") ?? "http://localhost:3001").replace(
  /\/$/,
  "",
);

export const firebasePublicConfig = {
  apiKey: readPublicEnv("PUBLIC_FIREBASE_API_KEY"),
  authDomain: readPublicEnv("PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: readPublicEnv("PUBLIC_FIREBASE_PROJECT_ID"),
  storageBucket: readPublicEnv("PUBLIC_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: readPublicEnv("PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId: readPublicEnv("PUBLIC_FIREBASE_APP_ID"),
};

export function isFirebaseClientConfigured(): boolean {
  return Boolean(
    firebasePublicConfig.apiKey &&
      firebasePublicConfig.authDomain &&
      firebasePublicConfig.projectId &&
      firebasePublicConfig.appId,
  );
}
