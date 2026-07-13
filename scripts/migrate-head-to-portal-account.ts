/**
 * Copies legacy Agent.accountRole = HEAD → PortalAccount.headPrivileges (raw SQL so this runs even after
 * Agent.accountRole is removed from Prisma schema, as long as the DB column still exists).
 * Run once before dropping the Agent.accountRole column from the database.
 * Usage: npx tsx scripts/migrate-head-to-portal-account.ts
 */
import { PrismaClient } from "@prisma/client/primary";

const prisma = new PrismaClient();

async function main() {
  const heads = await prisma.$queryRaw<Array<{ email: string }>>`
    SELECT email FROM "Agent" WHERE "accountRole" = 'HEAD'
  `;
  let n = 0;
  for (const a of heads) {
    const r = await prisma.portalAccount.updateMany({
      where: { email: { equals: a.email, mode: "insensitive" } },
      data: { headPrivileges: true },
    });
    n += r.count;
  }
  console.log(`Updated ${n} portal row(s) with headPrivileges from ${heads.length} head agent row(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
