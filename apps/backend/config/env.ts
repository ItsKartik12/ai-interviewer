export function getEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export function isFirebaseConfigured(): boolean {
  return Boolean(
    getEnv("FIREBASE_PROJECT_ID") &&
      getEnv("FIREBASE_CLIENT_EMAIL") &&
      getEnv("FIREBASE_PRIVATE_KEY"),
  );
}

export function isGeminiConfigured(): boolean {
  return Boolean(getEnv("GEMINI_API_KEY"));
}

export function getFrontendUrl(): string {
  const raw = getEnv("FRONTEND_URL") ?? "http://localhost:3000";
  return raw.replace(/\/$/, "");
}

export function getAllowedFrontendOrigins(): string[] {
  const raw = getEnv("FRONTEND_URL") ?? "http://localhost:3000";
  return raw
    .split(",")
    .map((url) => url.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export function getPort(): number {
  const port = Number(getEnv("PORT") ?? "3001");
  // Guard against invalid values (0, NaN) — e.g. an inherited empty PORT env var.
  return Number.isFinite(port) && port > 0 ? port : 3001;
}

/** Logs which optional integrations are present. Does not print secret values. */
export function logServiceConfiguration(): void {
  console.log(
    `[config] firebase=${isFirebaseConfigured() ? "configured" : "missing"} gemini=${isGeminiConfigured() ? "configured" : "missing"} port=${getPort()} frontend=${getFrontendUrl()}`,
  );
}
