import { COMPANY_ROSTER, rosterTeamNameFilter, sortByRosterOrder } from "@/lib/company-roster";
import { prisma } from "@/lib/prisma";

/** Ensure every roster SBU exists as a Team row (idempotent). */
export async function ensureRosterTeamsInDb(): Promise<void> {
  for (const name of COMPANY_ROSTER) {
    const existing = await prisma.team.findFirst({
      where: { name },
      select: { id: true },
    });
    if (!existing) {
      await prisma.team.create({ data: { name } });
    }
  }
}

export async function listRosterTeamsForSignup(): Promise<Array<{ id: string; name: string }>> {
  await ensureRosterTeamsInDb();
  const teams = await prisma.team.findMany({
    where: rosterTeamNameFilter(),
    select: { id: true, name: true },
  });
  return sortByRosterOrder(teams);
}
