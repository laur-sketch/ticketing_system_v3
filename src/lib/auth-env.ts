/**
 * NextAuth (v4, self-hosted) uses `process.env.NEXTAUTH_URL` for OAuth `redirect_uri`.
 * It must match an entry in Google Cloud Console → OAuth client → Authorized redirect URIs
 * (character-for-character: scheme, host, path; no trailing slash on the origin).
 */
function trimEnv(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v && v.length > 0 ? v : undefined;
}

let applied = false;

export function ensureNextAuthUrlFromEnv(): void {
  if (applied) return;
  applied = true;

  let base = trimEnv(process.env.NEXTAUTH_URL) ?? trimEnv(process.env.APP_BASE_URL);
  if (!base) return;

  while (base.endsWith("/")) {
    base = base.slice(0, -1);
  }

  process.env.NEXTAUTH_URL = base;
}

ensureNextAuthUrlFromEnv();
