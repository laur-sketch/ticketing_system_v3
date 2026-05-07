import { prisma } from "@/lib/prisma";
import { rosterTeamNameFilter, sortByRosterOrder } from "@/lib/company-roster";

/**
 * Maps customer free-text "Request to Company/SBU" to a roster Team row.
 * Falls back to the customer's assigned company queue when no roster name matches.
 */
export async function resolveCustomerRequestTeam(params: {
  requestText: string;
  fallbackTeamId: string | null;
}): Promise<{ team: { id: string; name: string }; matched: boolean } | null> {
  const raw = params.requestText.trim();
  if (!raw) return null;

  const teams = sortByRosterOrder(
    await prisma.team.findMany({
      where: rosterTeamNameFilter(),
      select: { id: true, name: true },
    }),
  );

  const lower = raw.toLowerCase();

  const exact = teams.find((t) => t.name.toLowerCase() === lower);
  if (exact) return { team: exact, matched: true };

  for (const t of teams) {
    const tn = t.name.toLowerCase();
    if (lower.includes(tn)) return { team: t, matched: true };
  }

  for (const t of teams) {
    const tn = t.name.toLowerCase();
    if (tn.includes(lower) && lower.length >= 2) return { team: t, matched: true };
  }

  if (params.fallbackTeamId) {
    const fb = teams.find((t) => t.id === params.fallbackTeamId);
    if (fb) return { team: fb, matched: false };
  }

  return null;
}
