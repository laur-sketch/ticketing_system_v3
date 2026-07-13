#!/usr/bin/env npx tsx
/**
 * Builds mergeddatabase-dev on MySQL by pulling:
 *  - hris-dev.users + companies
 *  - hris-dev.attendance_logs (clock_in with time_in_clicked_at)
 *  - ticketing_system Task/KPI tables (PostgreSQL)
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TMP = join(ROOT, "scripts", ".merge-tmp");

const MYSQL_BIN = "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe";
const PSQL_BIN = [
  "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe",
  "C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe",
].find((p) => existsSync(p));

const MYSQL = {
  host: "localhost",
  port: 3306,
  user: "root",
  password: "root",
};

const PG = {
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "postgres",
  database: "ticketing_system",
};

function runMysql(args: string[], input?: string) {
  return execFileSync(MYSQL_BIN, args, {
    input,
    env: { ...process.env, MYSQL_PWD: MYSQL.password },
    stdio: ["pipe", "pipe", "pipe"],
    encoding: "utf8",
  });
}

function runPsql(sql: string) {
  if (!PSQL_BIN) throw new Error("psql.exe not found");
  return execFileSync(
    PSQL_BIN,
    ["-U", PG.user, "-h", PG.host, "-p", String(PG.port), "-d", PG.database, "-At", "-c", sql],
    { env: { ...process.env, PGPASSWORD: PG.password }, encoding: "utf8" },
  );
}

function esc(value: string | null | undefined): string {
  if (value == null) return "NULL";
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

function escJson(value: unknown): string {
  if (value == null) return "NULL";
  return esc(JSON.stringify(value));
}

function escBool(value: boolean | null | undefined): string {
  if (value == null) return "NULL";
  return value ? "1" : "0";
}

function escDate(value: string | null | undefined): string {
  if (value == null || value === "") return "NULL";
  return esc(value);
}

function mysqlBaseArgs(db?: string) {
  return ["-u", MYSQL.user, "-h", MYSQL.host, "-P", String(MYSQL.port), ...(db ? [db] : [])];
}

function main() {
  if (!existsSync(MYSQL_BIN)) throw new Error(`mysql not found at ${MYSQL_BIN}`);
  if (!PSQL_BIN) throw new Error("psql not found");

  mkdirSync(TMP, { recursive: true });

  console.log("Creating mergeddatabase-dev and loading HRIS data...");
  const hrisSql = readFileSync(join(ROOT, "scripts", "merge-database-setup.sql"), "utf8");
  runMysql(mysqlBaseArgs(), hrisSql);

  const pgTablesSql = readFileSync(join(ROOT, "scripts", "merge-database-pg-tables.sql"), "utf8");
  runMysql(mysqlBaseArgs("mergeddatabase-dev"), pgTablesSql);

  console.log("Pulling Task/KPI data from ticketing_system (PostgreSQL)...");
  runMysql(mysqlBaseArgs("mergeddatabase-dev"), [
    "TRUNCATE merged_kpi_maintenance;",
    "TRUNCATE merged_kpi_period_snapshots;",
    "TRUNCATE merged_task_items;",
    "TRUNCATE merged_task_activities;",
  ].join("\n"));

  const kpiRows = runPsql(`
    SELECT row_to_json(t) FROM (
      SELECT id, title, "mainTask", "isRecurring", "nonRecurringStartAt", "nonRecurringEndAt",
             frequency::text, "subKpis", "assignedAgentId", "assignedRole", "recurrenceWeekday",
             "recurrenceMonthDay", "periodCycleStartAt", "lastFullCompletionAt", "periodKey",
             "rolledOverIncomplete", "itProjectName", "itProjectPhase", "scopedCompanyTeamId",
             "createdBy", "createdByRole", "createdAt", "updatedAt"
      FROM "KpiMaintenance"
    ) t;
  `).trim().split("\n").filter(Boolean);

  const kpiInserts: string[] = [];
  for (const line of kpiRows) {
    const r = JSON.parse(line) as Record<string, unknown>;
    kpiInserts.push(`INSERT INTO merged_kpi_maintenance (
      source_id, title, main_task, is_recurring, non_recurring_start_at, non_recurring_end_at,
      frequency, sub_kpis, assigned_agent_id, assigned_role, recurrence_weekday, recurrence_month_day,
      period_cycle_start_at, last_full_completion_at, period_key, rolled_over_incomplete,
      it_project_name, it_project_phase, scoped_company_team_id, created_by, created_by_role,
      created_at, updated_at
    ) VALUES (
      ${esc(String(r.id))}, ${esc(String(r.title))}, ${esc(r.mainTask as string | null)}, ${escBool(r.isRecurring as boolean)},
      ${escDate(r.nonRecurringStartAt as string | null)}, ${escDate(r.nonRecurringEndAt as string | null)},
      ${esc(String(r.frequency))}, ${escJson(r.subKpis)}, ${esc(r.assignedAgentId as string | null)}, ${esc(r.assignedRole as string | null)},
      ${r.recurrenceWeekday ?? "NULL"}, ${r.recurrenceMonthDay ?? "NULL"},
      ${escDate(r.periodCycleStartAt as string | null)}, ${escDate(r.lastFullCompletionAt as string | null)},
      ${esc(r.periodKey as string | null)}, ${escBool(r.rolledOverIncomplete as boolean)},
      ${esc(r.itProjectName as string | null)}, ${esc(r.itProjectPhase as string | null)}, ${esc(r.scopedCompanyTeamId as string | null)},
      ${esc(String(r.createdBy))}, ${esc(String(r.createdByRole))},
      ${escDate(r.createdAt as string)}, ${escDate(r.updatedAt as string)}
    );`);
  }

  const snapRows = runPsql(`
    SELECT row_to_json(t) FROM (
      SELECT id, "kpiMaintenanceId", "periodKey", frequency::text, "timeZone", total, done, missing,
             percent, "fullyComplete", "contributorProgress", "capturedAt"
      FROM "KpiMaintenancePeriodSnapshot"
    ) t;
  `).trim().split("\n").filter(Boolean);

  const snapInserts: string[] = [];
  for (const line of snapRows) {
    const r = JSON.parse(line) as Record<string, unknown>;
    snapInserts.push(`INSERT INTO merged_kpi_period_snapshots (
      source_id, kpi_maintenance_id, period_key, frequency, time_zone, total, done, missing,
      percent, fully_complete, contributor_progress, captured_at
    ) VALUES (
      ${esc(String(r.id))}, ${esc(String(r.kpiMaintenanceId))}, ${esc(String(r.periodKey))}, ${esc(String(r.frequency))},
      ${esc(String(r.timeZone))}, ${Number(r.total)}, ${Number(r.done)}, ${Number(r.missing)}, ${Number(r.percent)},
      ${escBool(r.fullyComplete as boolean)}, ${escJson(r.contributorProgress)}, ${escDate(r.capturedAt as string)}
    );`);
  }

  const taskRows = runPsql(`
    SELECT row_to_json(t) FROM (
      SELECT id, title, description, status::text, "assignedAgentId", priority, "dueAt",
             "createdBy", "createdByRole", "createdAt", "updatedAt"
      FROM "TaskItem"
    ) t;
  `).trim().split("\n").filter(Boolean);

  const taskInserts: string[] = [];
  for (const line of taskRows) {
    const r = JSON.parse(line) as Record<string, unknown>;
    taskInserts.push(`INSERT INTO merged_task_items (
      source_id, title, description, status, assigned_agent_id, priority, due_at,
      created_by, created_by_role, created_at, updated_at
    ) VALUES (
      ${esc(String(r.id))}, ${esc(String(r.title))}, ${esc(r.description as string | null)}, ${esc(String(r.status))},
      ${esc(r.assignedAgentId as string | null)}, ${esc(r.priority as string | null)}, ${escDate(r.dueAt as string | null)},
      ${esc(String(r.createdBy))}, ${esc(String(r.createdByRole))}, ${escDate(r.createdAt as string)}, ${escDate(r.updatedAt as string)}
    );`);
  }

  const actRows = runPsql(`
    SELECT row_to_json(t) FROM (
      SELECT id, "taskId", author, action, detail, "createdAt"
      FROM "TaskActivity"
    ) t;
  `).trim().split("\n").filter(Boolean);

  const actInserts: string[] = [];
  for (const line of actRows) {
    const r = JSON.parse(line) as Record<string, unknown>;
    actInserts.push(`INSERT INTO merged_task_activities (
      source_id, task_id, author, action, detail, created_at
    ) VALUES (
      ${esc(String(r.id))}, ${esc(String(r.taskId))}, ${esc(String(r.author))}, ${esc(String(r.action))},
      ${esc(r.detail as string | null)}, ${escDate(r.createdAt as string)}
    );`);
  }

  const allPgSql = [...kpiInserts, ...snapInserts, ...taskInserts, ...actInserts].join("\n");
  if (allPgSql) {
    const pgImportFile = join(TMP, "pg-import.sql");
    writeFileSync(pgImportFile, allPgSql, "utf8");
    runMysql(mysqlBaseArgs("mergeddatabase-dev"), readFileSync(pgImportFile, "utf8"));
  }

  const summary = runMysql(mysqlBaseArgs("mergeddatabase-dev"), `
    SELECT 'merged_users' AS tbl, COUNT(*) AS row_count FROM merged_users
    UNION ALL SELECT 'merged_attendance_clock_in', COUNT(*) FROM merged_attendance_clock_in
    UNION ALL SELECT 'merged_kpi_maintenance', COUNT(*) FROM merged_kpi_maintenance
    UNION ALL SELECT 'merged_kpi_period_snapshots', COUNT(*) FROM merged_kpi_period_snapshots
    UNION ALL SELECT 'merged_task_items', COUNT(*) FROM merged_task_items
    UNION ALL SELECT 'merged_task_activities', COUNT(*) FROM merged_task_activities;
  `);

  console.log("\nmergeddatabase-dev ready:\n");
  console.log(summary);
}

main();
