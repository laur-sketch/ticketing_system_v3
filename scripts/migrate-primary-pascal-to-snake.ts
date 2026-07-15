#!/usr/bin/env npx tsx
/**
 * One-time migration: legacy PascalCase PostgreSQL tables/columns → snake_case Prisma schema.
 *
 * Targets DATABASE_URL_PRIMARY (e.g. ticketing_system_v3-DEMO).
 *
 * Usage:
 *   npx tsx scripts/migrate-primary-pascal-to-snake.ts --confirm
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client/primary";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const LEGACY_TABLES: Record<string, string> = {
  AccountActionRequest: "account_action_requests",
  Agent: "agents",
  EscalationTrigger: "escalation_triggers",
  HelpdeskCsvTicket: "helpdesk_csv_tickets",
  KpiMaintenance: "kpi_maintenance",
  KpiMaintenancePeriodSnapshot: "kpi_maintenance_period_snapshots",
  PortalAccount: "portal_accounts",
  SlaPolicy: "sla_policies",
  TaskActivity: "task_activities",
  TaskItem: "task_items",
  Team: "teams",
  Ticket: "tickets",
  TicketActivity: "ticket_activities",
  TicketFeedback: "ticket_feedbacks",
  TicketMessage: "ticket_messages",
};

type SqlClient = Pick<PrismaClient, "$queryRaw" | "$executeRawUnsafe">;

function camelToSnake(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

async function tableExists(db: SqlClient, table: string): Promise<boolean> {
  const rows = await db.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${table}
    ) AS exists
  `;
  return rows[0]?.exists === true;
}

async function legacyColumns(db: SqlClient, table: string): Promise<string[]> {
  const rows = await db.$queryRaw<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}
    ORDER BY ordinal_position
  `;
  return rows.map((r) => r.column_name);
}

async function renameColumns(db: SqlClient, table: string) {
  const columns = await legacyColumns(db, table);
  for (const column of columns) {
    const target = camelToSnake(column);
    if (target === column) continue;
    const sql = `ALTER TABLE ${quoteIdent(table)} RENAME COLUMN ${quoteIdent(column)} TO ${quoteIdent(target)}`;
    await db.$executeRawUnsafe(sql);
    console.log(`  ${table}.${column} → ${target}`);
  }
}

async function renameTable(db: SqlClient, from: string, to: string) {
  const sql = `ALTER TABLE ${quoteIdent(from)} RENAME TO ${quoteIdent(to)}`;
  await db.$executeRawUnsafe(sql);
  console.log(`Table ${from} → ${to}`);
}

async function applyFinalizeSql(db: SqlClient) {
  const sql = readFileSync(
    join(ROOT, "scripts", "migrate-primary-snake-case-finalize.sql"),
    "utf8",
  );
  for (const statement of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
    await db.$executeRawUnsafe(statement);
  }
}

async function migrateLegacySchema(db: SqlClient) {
  for (const legacyTable of Object.keys(LEGACY_TABLES)) {
    if (!(await tableExists(db, legacyTable))) continue;
    console.log(`Renaming columns on ${legacyTable}…`);
    await renameColumns(db, legacyTable);
  }

  for (const [legacyTable, targetTable] of Object.entries(LEGACY_TABLES)) {
    if (!(await tableExists(db, legacyTable))) continue;
    await renameTable(db, legacyTable, targetTable);
  }
}

async function main() {
  if (!process.argv.includes("--confirm")) {
    console.error("Refusing without --confirm. This renames primary PostgreSQL tables/columns.");
    console.error("  npx tsx scripts/migrate-primary-pascal-to-snake.ts --confirm");
    process.exit(1);
  }

  const db = new PrismaClient();
  await db.$connect();

  try {
    const migrated = await tableExists(db, "tickets");
    if (migrated) {
      console.log("Primary DB already uses snake_case tables (tickets exists). Skipping rename pass.");
    } else {
      console.log("Migrating legacy PascalCase schema to snake_case…");
      await migrateLegacySchema(db);
      console.log("Rename pass complete.");
    }

    console.log("\nAdding missing columns and indexes…");
    await applyFinalizeSql(db);

    console.log("\nSeeding UNSET priority SLA/trigger rows…");
    try {
      execSync("npx tsx scripts/ensure-unset-priority-data.ts", { stdio: "inherit" });
    } catch (e) {
      console.warn("ensure-unset-priority-data skipped:", e);
    }

    const counts = await Promise.all([
      db.$queryRaw<{ c: bigint }[]>`SELECT COUNT(*)::bigint AS c FROM tickets`,
      db.$queryRaw<{ c: bigint }[]>`SELECT COUNT(*)::bigint AS c FROM portal_accounts`,
      db.$queryRaw<{ c: bigint }[]>`SELECT COUNT(*)::bigint AS c FROM kpi_maintenance`,
      db.$queryRaw<{ c: bigint }[]>`SELECT COUNT(*)::bigint AS c FROM kpi_maintenance_period_snapshots`,
    ]);

    console.log("\nMigration complete. Row counts:");
    console.log(`  tickets: ${counts[0][0]?.c ?? 0}`);
    console.log(`  portal_accounts: ${counts[1][0]?.c ?? 0}`);
    console.log(`  kpi_maintenance: ${counts[2][0]?.c ?? 0}`);
    console.log(`  kpi_maintenance_period_snapshots: ${counts[3][0]?.c ?? 0}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
