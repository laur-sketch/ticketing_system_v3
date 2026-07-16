/**
 * Canonicalize merged_users identities: portal-created synthetic rows
 * (source_user_id >= 9e9, source_database = portal_ticketing) that belong to a
 * real HRIS person must resolve to the HRIS row (< 9e9), which carries the
 * company/role shown on the personnel tab.
 */

export const PORTAL_SYNTHETIC_MERGED_ID_BASE = 9_000_000_000n;

export type MergedIdentityRow = {
  sourceUserId: bigint;
  name: string;
  email: string | null;
};

function personTokens(name: string): Set<string> {
  return new Set(
    name
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1),
  );
}

/**
 * Map of synthetic merged_users id (as string) → canonical HRIS source_user_id.
 * Matches by email first, then by person-name token overlap (>= 2 tokens).
 * Synthetic rows with no HRIS counterpart (e.g. shared role accounts) are omitted.
 */
export function buildCanonicalMergedIdMap(
  rows: ReadonlyArray<MergedIdentityRow>,
): Map<string, bigint> {
  const hrisRows = rows.filter((r) => r.sourceUserId < PORTAL_SYNTHETIC_MERGED_ID_BASE);
  const syntheticRows = rows.filter((r) => r.sourceUserId >= PORTAL_SYNTHETIC_MERGED_ID_BASE);
  if (hrisRows.length === 0 || syntheticRows.length === 0) return new Map();

  const hrisByEmail = new Map<string, MergedIdentityRow>();
  for (const row of hrisRows) {
    const email = row.email?.trim().toLowerCase();
    if (email && !hrisByEmail.has(email)) hrisByEmail.set(email, row);
  }

  const hrisTokens = hrisRows.map((row) => ({ row, tokens: personTokens(row.name) }));

  const out = new Map<string, bigint>();
  for (const synthetic of syntheticRows) {
    const email = synthetic.email?.trim().toLowerCase();
    const byEmail = email ? hrisByEmail.get(email) : undefined;
    if (byEmail) {
      out.set(synthetic.sourceUserId.toString(), byEmail.sourceUserId);
      continue;
    }

    const tokens = personTokens(synthetic.name);
    if (tokens.size === 0) continue;
    let best: MergedIdentityRow | null = null;
    let bestScore = 0;
    for (const candidate of hrisTokens) {
      const overlap = [...tokens].filter((t) => candidate.tokens.has(t)).length;
      if (overlap >= 2 && overlap > bestScore) {
        best = candidate.row;
        bestScore = overlap;
      }
    }
    if (best) out.set(synthetic.sourceUserId.toString(), best.sourceUserId);
  }
  return out;
}

/** Resolve an id through the canonical map (identity if not synthetic/unmatched). */
export function canonicalMergedId(
  id: bigint,
  canonicalMap: ReadonlyMap<string, bigint>,
): bigint {
  return canonicalMap.get(id.toString()) ?? id;
}
