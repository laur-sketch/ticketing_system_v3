/**
 * One-time: set PortalAccount.headPrivileges for staff whose roster team matched legacy “head” teams.
 * Run after: npx prisma db push (PortalAccount.headPrivileges exists).
 * Usage: npx tsx scripts/migrate-legacy-head-teams-to-account-role.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LEGACY_HEAD_TEAMS = new Set(["it head", "infrastructure head", "design head"]);

async function main() {
  const agents = await prisma.agent.findMany({ include: { team: true } });
  let n = 0;
  for (const a of agents) {
    const t = a.team?.name?.trim().toLowerCase() ?? "";
    if (!LEGACY_HEAD_TEAMS.has(t)) continue;
    const r = await prisma.portalAccount.updateMany({
      where: {
        email: { equals: a.email, mode: "insensitive" },
        role: { in: ["Personnel", "Agent"] },
      },
      data: { headPrivileges: true },
    });
    n += r.count;
  }
  console.log(`Updated ${n} portal account row(s) with headPrivileges from legacy head team roster matches.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
