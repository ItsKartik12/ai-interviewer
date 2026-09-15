function readPublicEnv(name: string): string | undefined {
  const env =
    typeof process !== "undefined"
      ? process.env
      : typeof Bun !== "undefined"
        ? Bun.env
        : undefined;
  const value = env?.[name] ?? env?.[name.replace(/^PUBLIC_/, "BUN_PUBLIC_")];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

/** API origin from PUBLIC_BACKEND_URL. Trailing slashes are stripped. */
export const BACKEND_URL = (
  readPublicEnv("PUBLIC_BACKEND_URL") ?? "http://localhost:3001"
).replace(/\/$/, "");

/** API origin from PUBLIC_BACKEND_URL. Trailing slashes are stripped. */
export const BACKEND_URL = (
  readPublicEnv("PUBLIC_BACKEND_URL") ?? "http://localhost:3001"
).replace(/\/$/, "");

