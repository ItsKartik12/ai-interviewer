/**
 * Resolves the backend API origin across every runtime we build for:
 *
 * - Vite (Vercel / local): `import.meta.env` with vars prefixed VITE_ or PUBLIC_
 *   (see vite.config.ts `envPrefix`).
 * - Bun dev server (`bun src/index.ts`): `process.env` loaded from .env with
 *   PUBLIC_* exposure (see bunfig.toml `env = "PUBLIC_*"`).
 *
 * Precedence:
 *   PUBLIC_BACKEND_URL > VITE_BACKEND_URL > (dev) http://localhost:3001
 *   > (production) same origin as the deployed site.
 *
 * Set exactly ONE of these in Vercel project env vars, e.g.
 *   PUBLIC_BACKEND_URL=https://<your-backend>.onrender.com
 */
type EnvLike = Record<string, string | undefined>;

function getImportMetaEnv(): EnvLike | undefined {
  try {
    const metaEnv = (import.meta as unknown as { env?: EnvLike }).env;
    if (metaEnv && typeof metaEnv === "object") return metaEnv;
  } catch {
    /* import.meta unavailable */
  }
  return undefined;
}

function getProcessEnv(): EnvLike | undefined {
  try {
    if (typeof process !== "undefined" && process.env) return process.env;
  } catch {
    /* process unavailable in browser */
  }
  return undefined;
}

function readFirstEnv(names: string[]): string | undefined {
  const sources = [getImportMetaEnv(), getProcessEnv()];
  for (const source of sources) {
    if (!source) continue;
    for (const name of names) {
      const value = source[name];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
  }
  return undefined;
}

function isDevBuild(): boolean {
  const metaEnv = getImportMetaEnv();
  if (metaEnv && typeof metaEnv.DEV === "boolean") return metaEnv.DEV;
  // Bun dev server has no import.meta.env — treat anything not explicitly
  // production as development so API calls target localhost:3001 locally.
  try {
    if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") {
      return false;
    }
  } catch {
    /* process unavailable in browser */
  }
  return true;
}

function resolveBackendUrl(): string {
  const configured = readFirstEnv(["PUBLIC_BACKEND_URL", "VITE_BACKEND_URL"]);
  if (configured) return configured.replace(/\/+$/, "");

  // Local development default (matches apps/backend default PORT).
  if (isDevBuild()) return "http://localhost:3001";

  // Production build without an explicit backend URL: assume the backend is
  // served from the same origin (reverse-proxy / single-domain deployment).
  try {
    if (typeof window !== "undefined" && window.location?.origin) {
      console.warn(
        "[config] PUBLIC_BACKEND_URL is not set — falling back to same-origin API. " +
          "Set PUBLIC_BACKEND_URL (or VITE_BACKEND_URL) in your hosting dashboard if the backend lives on another domain.",
      );
      return window.location.origin;
    }
  } catch {
    /* window unavailable (SSR) */
  }

  return "http://localhost:3001";
}

/** API origin for the deployed/local backend. Trailing slashes stripped. */
export const BACKEND_URL = resolveBackendUrl();
