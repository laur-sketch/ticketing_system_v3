/**
 * Open-redirect safe internal path for ?returnTo= — only same-site absolute paths.
 */
export function safeReturnToParam(raw: string | string[] | undefined, fallback = "/agent"): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || typeof v !== "string") return fallback;
  let decoded = v;
  try {
    decoded = decodeURIComponent(v.trim());
  } catch {
    return fallback;
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return fallback;
  return decoded;
}
