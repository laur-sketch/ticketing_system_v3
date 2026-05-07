/**
 * One-off health check: counts + samples + public table list.
 * Usage: npx tsx scripts/db-runcheck.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$connect();
  console.log("Connected OK (DATABASE_URL from .env)\n");

  const [agents, kpis, tasks, tickets, portalAccounts] = await Promise.all([
    prisma.agent.count(),
    prisma.kpiMaintenance.count(),
    prisma.taskItem.count(),
    prisma.ticket.count(),
    prisma.portalAccount.count(),
  ]);

  console.log("--- Row counts ---");
  console.log(
    JSON.stringify(
      {
        Agent: agents,
        KpiMaintenance: kpis,
        TaskItem: tasks,
        Ticket: tickets,
        PortalAccount: portalAccounts,
      },
      null,
      2,
    ),
  );

  const tables = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  console.log("\n--- Public tables (PostgreSQL) ---");
  console.log(tables.map((t) => t.table_name).join(", "));

  const kpiCols = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'KpiMaintenance'
    ORDER BY ordinal_position
  `;
  console.log("\n--- KpiMaintenance columns ---");
  console.log(kpiCols.length ? kpiCols.map((c) => c.column_name).join(", ") : "(table missing or different name)");

  const taskCols = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'TaskItem'
    ORDER BY ordinal_position
  `;
  console.log("\n--- TaskItem columns ---");
  console.log(taskCols.length ? taskCols.map((c) => c.column_name).join(", ") : "(table missing or different name)");

  const kpiSample = await prisma.kpiMaintenance.findMany({
    take: 8,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      assignedAgentId: true,
      periodCycleStartAt: true,
      lastFullCompletionAt: true,
      createdAt: true,
    },
  });
  console.log("\n--- Newest KpiMaintenance rows (sample) ---");
  console.log(JSON.stringify(kpiSample, null, 2));

  const taskSample = await prisma.taskItem.findMany({
    take: 8,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      assignedAgentId: true,
      createdBy: true,
      status: true,
      createdAt: true,
    },
  });
  console.log("\n--- Newest TaskItem rows (sample) ---");
  console.log(JSON.stringify(taskSample, null, 2));

  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error("DB check failed:", e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
