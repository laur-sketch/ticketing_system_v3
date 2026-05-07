/** Canonical companies (queues) — display order on the Company Board. */
export const COMPANY_ROSTER = [
  "AGC",
  "ALI",
  "ACI/APMC",
  "AGOC",
  "AWIC",
  "M.CONPINCO",
  "EAZYGAZ",
  /** Triage queue for customer text that does not match a roster SBU. */
  "OUTSIDE COMPANY",
] as const;

export type CompanyRosterName = (typeof COMPANY_ROSTER)[number];

export function rosterOrderIndex(name: string): number {
  const i = (COMPANY_ROSTER as readonly string[]).indexOf(name);
  return i === -1 ? 999 : i;
}

export function sortByRosterOrder<T extends { name: string }>(teams: T[]): T[] {
  return [...teams].sort((a, b) => rosterOrderIndex(a.name) - rosterOrderIndex(b.name));
}

export function rosterTeamNameFilter(): { name: { in: string[] } } {
  return { name: { in: [...COMPANY_ROSTER] } };
}
