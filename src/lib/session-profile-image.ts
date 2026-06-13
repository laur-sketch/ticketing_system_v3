/** Short URL stored in JWT/session for uploaded profile photos (served by GET /api/me/profile-image). */
export const SESSION_PROFILE_IMAGE_ROUTE = "/api/me/profile-image";

/** Keep session/JWT cookies small — never embed base64 data URLs in auth tokens. */
export function compactSessionPicture(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("data:")) return SESSION_PROFILE_IMAGE_ROUTE;
  if (trimmed === SESSION_PROFILE_IMAGE_ROUTE) return trimmed;
  if (trimmed.length > 2048) return undefined;
  return trimmed;
}

export function parseProfileImageDataUrl(dataUrl: string): { mime: string; bytes: Buffer } | null {
  const match = dataUrl.match(/^data:(image\/(?:png|jpe?g|webp));base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;
  try {
    return { mime: match[1].toLowerCase(), bytes: Buffer.from(match[2], "base64") };
  } catch {
    return null;
  }
}
