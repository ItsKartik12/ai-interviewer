import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

/**
 * Firebase client configuration.
 *
 * These values are safe to expose in the browser (they identify the Firebase
 * project, they do not authenticate anyone by themselves). Real secrets —
 * Firebase Admin private keys, Deepgram, Gemini — stay backend-only.
 *
 * Configure via PUBLIC_FIREBASE_* environment variables (see .env.example).
 *
 * Env resolution works across both build runtimes:
 * - Vite (Vercel/local vite dev): import.meta.env with PUBLIC_* prefix
 * - Bun dev server (`bun src/index.ts`): literal process.env.PUBLIC_FIREBASE_*
 *   references, inlined by bunfig `[serve.static] env = "PUBLIC_*"`. Bun only
 *   replaces LITERAL `process.env.FOO` references — dynamic access like
 *   `process.env[name]` is never inlined.
 * `import.meta.env` is undefined under Bun's dev server, so access is guarded.
 */
type EnvLike = Record<string, string | undefined>;

function readEnv(name: string): string | undefined {
  try {
    const metaEnv = (import.meta as unknown as { env?: EnvLike }).env;
    const fromMeta = metaEnv?.[name];
    if (typeof fromMeta === "string" && fromMeta.trim()) return fromMeta.trim();
  } catch {
    /* import.meta.env unavailable under Bun dev */
  }
  const fromProcess = readProcessEnvLiteral(name);
  if (typeof fromProcess === "string" && fromProcess.trim()) return fromProcess.trim();
  return undefined;
}

/**
 * Bun's bundler only inlines literal `process.env.FOO` references when
 * bunfig.toml sets `[serve.static] env = "PUBLIC_*"`; indirect access like
 * `process.env[name]` is never replaced. Every PUBLIC_FIREBASE_* variable
 * is therefore referenced literally below so Bun can inline its value into
 * the browser bundle.
 *
 * NOTE: no `typeof process` guard before the switch — under Bun's dev server
 * the bundler rewrites these expressions to plain string literals, so the
 * code below never touches `process` at runtime. In a plain-browser bundle
 * (no inlining, e.g. a misconfigured build) evaluating `process.env.X`
 * throws ReferenceError, which the try/catch converts to `undefined`.
 */
function readProcessEnvLiteral(name: string): string | undefined {
  try {
    switch (name) {
      case "PUBLIC_FIREBASE_API_KEY":
        return process.env.PUBLIC_FIREBASE_API_KEY;
      case "PUBLIC_FIREBASE_AUTH_DOMAIN":
        return process.env.PUBLIC_FIREBASE_AUTH_DOMAIN;
      case "PUBLIC_FIREBASE_PROJECT_ID":
        return process.env.PUBLIC_FIREBASE_PROJECT_ID;
      case "PUBLIC_FIREBASE_STORAGE_BUCKET":
        return process.env.PUBLIC_FIREBASE_STORAGE_BUCKET;
      case "PUBLIC_FIREBASE_MESSAGING_SENDER_ID":
        return process.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
      case "PUBLIC_FIREBASE_APP_ID":
        return process.env.PUBLIC_FIREBASE_APP_ID;
      default:
        return undefined;
    }
  } catch {
    /* process unavailable in browser */
    return undefined;
  }
}

const firebaseConfig = {
  apiKey: readEnv("PUBLIC_FIREBASE_API_KEY"),
  authDomain: readEnv("PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: readEnv("PUBLIC_FIREBASE_PROJECT_ID"),
  storageBucket: readEnv("PUBLIC_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: readEnv("PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId: readEnv("PUBLIC_FIREBASE_APP_ID"),
};

export function isFirebaseClientConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId,
  );
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

if (isFirebaseClientConfigured()) {
  app = getApps().length > 0 ? getApps()[0]! : initializeApp(firebaseConfig);
  auth = getAuth(app);
} else if (readEnv("NODE_ENV") !== "production") {
  console.warn(
    "[auth] PUBLIC_FIREBASE_* variables are not set — authentication is disabled. " +
      "Set them in your .env to enable sign-in.",
  );
}

export function getFirebaseAuth(): Auth | null {
  return auth;
}
