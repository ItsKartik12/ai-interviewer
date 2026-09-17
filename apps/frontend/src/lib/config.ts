function readPublicEnv(name: string): string | undefined {
  if (name === "PUBLIC_BACKEND_URL") {
    const staticVal =
      (typeof process !== "undefined" && (process.env.PUBLIC_BACKEND_URL || process.env.BUN_PUBLIC_BACKEND_URL)) ||
      (typeof import.meta !== "undefined" && ((import.meta as any).env?.PUBLIC_BACKEND_URL || (import.meta as any).env?.BUN_PUBLIC_BACKEND_URL));
    if (typeof staticVal === "string" && staticVal.trim().length > 0) {
      return staticVal.trim();
    }
  }

  const env =
    typeof process !== "undefined"
      ? process.env
      : typeof Bun !== "undefined"
        ? Bun.env
        : undefined;
  const value = env?.[name] ?? env?.[name.replace(/^PUBLIC_/, "BUN_PUBLIC_")];
  return value && typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/** API origin from PUBLIC_BACKEND_URL. Trailing slashes are stripped. */
export const BACKEND_URL = (
  readPublicEnv("PUBLIC_BACKEND_URL") ?? "http://localhost:3001"
).replace(/\/$/, "");

/** API origin from PUBLIC_BACKEND_URL. Trailing slashes are stripped. */


