/** Canonical upstream database names stored on merged_* rows. */
export const MERGED_SOURCE_DATABASE = {
  HRIS: "hris-dev",
  HRIS_DEMO: "hrisdemo",
  TICKETING: "ticketing_system",
  TICKETING_DEMO: "ticketing_system_v3-DEMO",
} as const;

export type MergedSourceDatabase =
  (typeof MERGED_SOURCE_DATABASE)[keyof typeof MERGED_SOURCE_DATABASE];
