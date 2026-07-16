/** Canonical upstream database names stored on merged_* rows (`source_database`). */
export const MERGED_SOURCE_DATABASE = {
  HRIS: "hris-dev",
  HRIS_DEMO: "hrisdemo",
  TICKETING: "ticketing_system",
  TICKETING_DEMO: "ticketing_system_v3-DEMO",
} as const;

export type MergedSourceDatabase =
  (typeof MERGED_SOURCE_DATABASE)[keyof typeof MERGED_SOURCE_DATABASE];

/** Common HRIS ETL provenance tags seen in merged_users.source_database. */
export const HRIS_SOURCE_DATABASE_TAGS = [
  MERGED_SOURCE_DATABASE.HRIS,
  MERGED_SOURCE_DATABASE.HRIS_DEMO,
] as const;

/**
 * HRIS row filter for merged_users.
 * Prefer HRIS_MERGE_SOURCE_TAG / HRIS_MERGE_SOURCE_DB when set; otherwise accept
 * both `hris-dev` and `hrisdemo` so Personnel works against mergeddatabase-dev
 * and demo merges without an empty roster.
 */
export function resolveHrisSourceTags(): string[] {
  const explicit =
    process.env.HRIS_MERGE_SOURCE_TAG?.trim() || process.env.HRIS_MERGE_SOURCE_DB?.trim();
  if (explicit) return [explicit];
  return [...HRIS_SOURCE_DATABASE_TAGS];
}

/** Single primary HRIS tag (first of resolveHrisSourceTags) for writes / defaults. */
export function resolveHrisSourceTag(): string {
  return resolveHrisSourceTags()[0] ?? MERGED_SOURCE_DATABASE.HRIS;
}

/** MySQL schema name from DATABASE_URL_SECONDARY (e.g. mergeddatabase-dev). */
export function resolveSecondaryDatabaseName(): string {
  const url =
    process.env.DATABASE_URL_SECONDARY?.trim() ||
    process.env.DATABASE_URL_SECONDARY_SYNC?.trim() ||
    "";
  if (!url) return "mergeddatabase-dev";
  try {
    const pathname = new URL(url).pathname.replace(/^\//, "");
    return pathname || "mergeddatabase-dev";
  } catch {
    return "mergeddatabase-dev";
  }
}
