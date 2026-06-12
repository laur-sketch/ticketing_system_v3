import { COMPANY_ROSTER, rosterTeamNameFilter, sortByRosterOrder } from "@/lib/company-roster";
import { prisma } from "@/lib/prisma";

const LEGACY_ACI_APMC_NAME = "ACI/APMC";
/** Legacy CSV / sample-data label; canonical roster name is MCONPINCO. */
const LEGACY_MCHISI_NAME = "MCHISI";

/** One-time split: combined ACI/APMC queue → APMC + roster ACI. */
async function migrateLegacyAciApmcTeam(): Promise<void> {
  const legacy = await prisma.team.findFirst({
    where: { name: LEGACY_ACI_APMC_NAME },
    select: { id: true },
  });
  if (!legacy) return;

  let apmc = await prisma.team.findFirst({ where: { name: "APMC" }, select: { id: true } });
  if (!apmc) {
    apmc = await prisma.team.update({
      where: { id: legacy.id },
      data: { name: "APMC" },
      select: { id: true },
    });
  } else if (apmc.id !== legacy.id) {
    await reassignTeamReferences(legacy.id, apmc.id);
    await prisma.team.delete({ where: { id: legacy.id } });
  }

  const aci = await prisma.team.findFirst({ where: { name: "ACI" }, select: { id: true } });
  if (!aci) {
    await prisma.team.create({ data: { name: "ACI" } });
  }
}

async function reassignTeamReferences(fromTeamId: string, toTeamId: string): Promise<void> {
  if (fromTeamId === toTeamId) return;
  await prisma.portalAccount.updateMany({
    where: { companyId: fromTeamId },
    data: { companyId: toTeamId },
  });
  await prisma.portalAccount.updateMany({
    where: { staffDesignatedCompanyId: fromTeamId },
    data: { staffDesignatedCompanyId: toTeamId },
  });
  await prisma.ticket.updateMany({
    where: { teamId: fromTeamId },
    data: { teamId: toTeamId },
  });
  await prisma.agent.updateMany({
    where: { teamId: fromTeamId },
    data: { teamId: toTeamId },
  });
}

/** One-time: legacy MCHISI queue label → roster MCONPINCO. */
async function migrateLegacyMchisiTeam(): Promise<void> {
  const legacy = await prisma.team.findFirst({
    where: { name: LEGACY_MCHISI_NAME },
    select: { id: true },
  });
  if (!legacy) return;

  const canonical = await prisma.team.findFirst({
    where: { name: "MCONPINCO" },
    select: { id: true },
  });
  if (!canonical) {
    await prisma.team.update({
      where: { id: legacy.id },
      data: { name: "MCONPINCO" },
    });
    return;
  }
  if (canonical.id !== legacy.id) {
    await reassignTeamReferences(legacy.id, canonical.id);
    await prisma.team.delete({ where: { id: legacy.id } });
  }
}

/** Merge duplicate Team rows that share a roster company name (e.g. two MCONPINCO). */
async function dedupeRosterTeamsByName(): Promise<void> {
  for (const name of COMPANY_ROSTER) {
    const teams = await prisma.team.findMany({
      where: { name },
      select: {
        id: true,
        _count: {
          select: {
            tickets: true,
            customerPortalAccounts: true,
            staffDesignatedPortalAccounts: true,
            agents: true,
          },
        },
      },
    });
    if (teams.length <= 1) continue;

    const score = (t: (typeof teams)[number]) =>
      t._count.tickets +
      t._count.customerPortalAccounts +
      t._count.staffDesignatedPortalAccounts +
      t._count.agents;

    const [keeper, ...dupes] = [...teams].sort((a, b) => score(b) - score(a));
    for (const d of dupes) {
      await reassignTeamReferences(d.id, keeper.id);
      await prisma.team.delete({ where: { id: d.id } });
    }
  }
}

/** Ensure every roster SBU exists as a Team row (idempotent). */
export async function ensureRosterTeamsInDb(): Promise<void> {
  await migrateLegacyAciApmcTeam();
  await migrateLegacyMchisiTeam();

  for (const name of COMPANY_ROSTER) {
    const existing = await prisma.team.findFirst({
      where: { name },
      select: { id: true },
    });
    if (!existing) {
      await prisma.team.create({ data: { name } });
    }
  }

  await dedupeRosterTeamsByName();
}

export async function listRosterTeamsForSignup(): Promise<Array<{ id: string; name: string }>> {
  await ensureRosterTeamsInDb();
  const teams = await prisma.team.findMany({
    where: rosterTeamNameFilter(),
    select: { id: true, name: true },
  });
  return sortByRosterOrder(teams);
}
