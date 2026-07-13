/** Canonical upstream database names stored on merged_* rows. */
export const MERGED_SOURCE_DATABASE = {
  HRIS: "hris-dev",
  TICKETING: "ticketing_system",
} as const;

export type MergedSourceDatabase =
  (typeof MERGED_SOURCE_DATABASE)[keyof typeof MERGED_SOURCE_DATABASE];
