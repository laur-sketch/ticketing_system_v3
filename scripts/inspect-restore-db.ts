import { PrismaClient as PrismaClientPrimary } from "@prisma/client/primary";
import pg from "pg";

const RESTORE_DB =
  process.env.RESTORE_SOURCE_URL ??
  "postgresql://postgres:postgres@localhost:5432/ticket_system_v3_restore?schema=public";

const prisma = new PrismaClientPrimary();

async function count(client: pg.Client, table: string) {
  const r = await client.query(`SELECT COUNT(*)::int AS c FROM public."${table}"`);
  return r.rows[0]?.c ?? 0;
}

async function main() {
  const client = new pg.Client({ connectionString: RESTORE_DB });
  await client.connect();

  const ticketCount = await count(client, "Ticket");
  const agentCount = await count(client, "Agent");
  const portalCount = await count(client, "PortalAccount");
  console.log({ ticketCount, agentCount, portalCount });

  const sample = await client.query(`SELECT * FROM public."Ticket" ORDER BY "createdAt" DESC LIMIT 2`);
  console.log("Ticket columns:", Object.keys(sample.rows[0] ?? {}));

  await client.end();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
