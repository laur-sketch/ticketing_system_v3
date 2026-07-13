/**
 * Normalize display name for loose matching (trim, lowercase, collapse whitespace).
 * Pure helper with no server/prisma dependency so it is safe to import in client components.
 */
export function normalizePersonName(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, " ");
}
