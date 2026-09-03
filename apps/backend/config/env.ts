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
  return getEnv("FRONTEND_URL") ?? "http://localhost:3000";
}

export function getPort(): number {
  const port = Number(getEnv("PORT") ?? "3001");
  return Number.isFinite(port) ? port : 3001;
}
