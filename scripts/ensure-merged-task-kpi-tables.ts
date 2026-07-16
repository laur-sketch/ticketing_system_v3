import { PrismaClient as PrismaClientSecondary } from "@prisma/client/secondary";

function sqlId(name: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return `\`${name}\``;
}

export function parseMysqlDatabaseName(url: string): string | null {
  try {
    const pathname = new URL(url).pathname.replace(/^\//, "");
    return pathname || null;
  } catch {
    return null;
  }
}

export function bootstrapMysqlUrl(url: string): string {
  const parsed = new URL(url);
  parsed.pathname = "/mysql";
  return parsed.toString();
}

async function ensureColumn(
  db: PrismaClientSecondary,
  targetDb: string,
  table: string,
  column: string,
  definition: string,
) {
  const rows = await db.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    targetDb,
    table,
    column,
  );
  if (Number(rows[0]?.c ?? 0) > 0) return;
  const target = sqlId(targetDb);
  const tbl = sqlId(table);
  const col = sqlId(column);
  await db.$executeRawUnsafe(`ALTER TABLE ${target}.${tbl} ADD COLUMN ${col} ${definition}`);
}

/** Ensure Task/KPI merged tables exist on the target MySQL database. */
export async function ensureMergedPortalWorkTables(
  db: PrismaClientSecondary,
  targetDb: string,
  sourceTag: string,
) {
  await ensureMergedTaskKpiTables(db, targetDb, sourceTag);

  const target = sqlId(targetDb);

  // Tickets live only in primary PostgreSQL — remove legacy mirror table if present.
  await db.$executeRawUnsafe(`DROP TABLE IF EXISTS ${target}.merged_tickets`);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ${target}.merged_kpi_user_averages (
      source_user_id            BIGINT UNSIGNED NOT NULL,
      source_database           VARCHAR(64) NOT NULL DEFAULT '${sourceTag}',
      portal_account_id         VARCHAR(191) NULL,
      agent_email               VARCHAR(255) NULL,
      display_name              VARCHAR(255) NOT NULL,
      kpi_count                 INT NOT NULL DEFAULT 0,
      snapshot_count            INT NOT NULL DEFAULT 0,
      total_items               INT NOT NULL DEFAULT 0,
      done_items                INT NOT NULL DEFAULT 0,
      overall_percent           INT NOT NULL DEFAULT 0,
      average_percent           INT NOT NULL DEFAULT 0,
      task_efficiency           INT NULL,
      ticket_efficiency         INT NULL,
      overall_efficiency        INT NULL,
      first_period_key          VARCHAR(255) NULL,
      last_period_key           VARCHAR(255) NULL,
      computed_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (source_user_id),
      KEY idx_merged_kpi_avg_source_db (source_database),
      KEY idx_merged_kpi_avg_overall (overall_percent),
      KEY idx_merged_kpi_avg_overall_eff (overall_efficiency)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Efficiency columns (Insights parity): task checklist %, ticket %, combined overall %.
  await ensureColumn(
    db,
    targetDb,
    "merged_kpi_user_averages",
    "task_efficiency",
    "INT NULL AFTER average_percent",
  );
  await ensureColumn(
    db,
    targetDb,
    "merged_kpi_user_averages",
    "ticket_efficiency",
    "INT NULL AFTER task_efficiency",
  );
  await ensureColumn(
    db,
    targetDb,
    "merged_kpi_user_averages",
    "overall_efficiency",
    "INT NULL AFTER ticket_efficiency",
  );

  const portalColumns: Array<[string, string, string]> = [
    [
      "merged_kpi_maintenance",
      "assigned_agent_email",
      "VARCHAR(255) NULL AFTER assigned_agent_id",
    ],
    [
      "merged_kpi_maintenance",
      "assigned_portal_account_id",
      "VARCHAR(191) NULL AFTER assigned_agent_email",
    ],
    [
      "merged_kpi_maintenance",
      "assigned_merged_source_user_id",
      "BIGINT UNSIGNED NULL AFTER assigned_portal_account_id",
    ],
    [
      "merged_kpi_maintenance",
      "created_by_merged_source_user_id",
      "BIGINT UNSIGNED NULL AFTER created_by",
    ],
    [
      "merged_kpi_maintenance",
      "created_by_portal_account_id",
      "VARCHAR(191) NULL AFTER created_by_merged_source_user_id",
    ],
    [
      "merged_task_items",
      "assigned_agent_email",
      "VARCHAR(255) NULL AFTER assigned_agent_id",
    ],
    [
      "merged_task_items",
      "assigned_portal_account_id",
      "VARCHAR(191) NULL AFTER assigned_agent_email",
    ],
    [
      "merged_task_items",
      "assigned_merged_source_user_id",
      "BIGINT UNSIGNED NULL AFTER assigned_portal_account_id",
    ],
    [
      "merged_task_items",
      "created_by_merged_source_user_id",
      "BIGINT UNSIGNED NULL AFTER created_by",
    ],
    [
      "merged_task_items",
      "created_by_portal_account_id",
      "VARCHAR(191) NULL AFTER created_by_merged_source_user_id",
    ],
    [
      "merged_task_activities",
      "author_merged_source_user_id",
      "BIGINT UNSIGNED NULL AFTER author",
    ],
    [
      "merged_task_activities",
      "author_portal_account_id",
      "VARCHAR(191) NULL AFTER author_merged_source_user_id",
    ],
  ];

  for (const [table, column, definition] of portalColumns) {
    await ensureColumn(db, targetDb, table, column, definition);
  }

  await ensureUserEfficiencyBreakdownTables(db, targetDb);
}

/** Persistent user×period overall-efficiency rollups + task drill-down. */
export async function ensureUserEfficiencyBreakdownTables(
  db: PrismaClientSecondary,
  targetDb: string,
) {
  const target = sqlId(targetDb);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ${target}.merged_user_efficiency_breakdowns (
      id                              VARCHAR(191) NOT NULL,
      source_user_id                  BIGINT UNSIGNED NOT NULL,
      portal_account_id               VARCHAR(191) NULL,
      display_name                    VARCHAR(255) NOT NULL,
      period_key                      VARCHAR(32) NOT NULL,
      frequency                       VARCHAR(20) NOT NULL,
      period_start_at                 DATETIME(3) NOT NULL,
      period_end_at                   DATETIME(3) NOT NULL,
      overall_efficiency              DECIMAL(6,2) NOT NULL,
      task_efficiency                 DECIMAL(6,2) NULL,
      ticket_efficiency               DECIMAL(6,2) NULL,
      total_tasks                     INT NOT NULL DEFAULT 0,
      completed_tasks                 INT NOT NULL DEFAULT 0,
      delayed_tasks                   INT NOT NULL DEFAULT 0,
      tickets_closed                  INT NOT NULL DEFAULT 0,
      tickets_pending                 INT NOT NULL DEFAULT 0,
      on_time_completion_rate         DECIMAL(6,2) NULL,
      average_task_completion_hours   DECIMAL(10,2) NULL,
      efficiency_score                DECIMAL(8,2) NULL,
      source_database                 VARCHAR(64) NOT NULL DEFAULT 'ticketing_system',
      computed_at                     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at                      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE KEY uq_user_eff_breakdown_period (source_user_id, period_key, frequency),
      KEY idx_user_eff_breakdown_user (source_user_id),
      KEY idx_user_eff_breakdown_period (period_key),
      KEY idx_user_eff_breakdown_freq (frequency),
      KEY idx_user_eff_breakdown_overall (overall_efficiency),
      CONSTRAINT fk_user_eff_breakdown_user
        FOREIGN KEY (source_user_id) REFERENCES ${target}.merged_users (source_user_id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Pre-existing installs: add the ticket-count columns in place.
  const ticketCols = await db.$queryRawUnsafe<Array<{ n: bigint | number }>>(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'merged_user_efficiency_breakdowns'
       AND COLUMN_NAME = 'tickets_closed'`,
    targetDb,
  );
  if (Number(ticketCols[0]?.n ?? 0) === 0) {
    await db.$executeRawUnsafe(`
      ALTER TABLE ${target}.merged_user_efficiency_breakdowns
        ADD COLUMN tickets_closed INT NOT NULL DEFAULT 0 AFTER delayed_tasks,
        ADD COLUMN tickets_pending INT NOT NULL DEFAULT 0 AFTER tickets_closed
    `);
  }

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ${target}.merged_user_efficiency_task_details (
      id                          VARCHAR(191) NOT NULL,
      breakdown_id                VARCHAR(191) NOT NULL,
      task_id                     VARCHAR(191) NULL,
      task_source                 VARCHAR(32) NOT NULL DEFAULT 'TASK_ITEM',
      task_title                  VARCHAR(512) NOT NULL,
      status                      VARCHAR(20) NOT NULL,
      due_at                      DATETIME(3) NULL,
      completed_at                DATETIME(3) NULL,
      efficiency_contribution     DECIMAL(8,2) NULL,
      notes                       TEXT NULL,
      created_at                  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      KEY idx_user_eff_task_breakdown (breakdown_id),
      KEY idx_user_eff_task_task (task_id),
      CONSTRAINT fk_user_eff_task_breakdown
        FOREIGN KEY (breakdown_id) REFERENCES ${target}.merged_user_efficiency_breakdowns (id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

/** @deprecated Use ensureMergedPortalWorkTables */
export async function ensureMergedTaskKpiTables(
  db: PrismaClientSecondary,
  targetDb: string,
  sourceTag: string,
) {
  const target = sqlId(targetDb);

  await db.$executeRawUnsafe(`
    CREATE DATABASE IF NOT EXISTS ${target}
      CHARACTER SET utf8mb4
      COLLATE utf8mb4_unicode_ci
  `);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ${target}.merged_kpi_maintenance (
      source_id                 VARCHAR(191) NOT NULL,
      title                     TEXT NOT NULL,
      main_task                 TEXT NULL,
      is_recurring              TINYINT(1) NOT NULL DEFAULT 1,
      non_recurring_start_at    DATETIME(3) NULL,
      non_recurring_end_at      DATETIME(3) NULL,
      frequency                 VARCHAR(20) NOT NULL,
      sub_kpis                  JSON NOT NULL,
      assigned_agent_id         VARCHAR(191) NULL,
      assigned_role             VARCHAR(255) NULL,
      recurrence_weekday        INT NULL,
      recurrence_month_day      INT NULL,
      period_cycle_start_at     DATETIME(3) NULL,
      last_full_completion_at   DATETIME(3) NULL,
      period_key                VARCHAR(255) NULL,
      rolled_over_incomplete    TINYINT(1) NOT NULL DEFAULT 0,
      it_project_name           VARCHAR(255) NULL,
      it_project_phase          VARCHAR(255) NULL,
      scoped_company_team_id    VARCHAR(191) NULL,
      created_by                VARCHAR(191) NOT NULL,
      created_by_role           VARCHAR(255) NOT NULL,
      created_at                DATETIME(3) NOT NULL,
      updated_at                DATETIME(3) NOT NULL,
      source_database           VARCHAR(64) NOT NULL DEFAULT '${sourceTag}',
      merged_at                 TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (source_id),
      KEY idx_merged_kpi_freq (frequency),
      KEY idx_merged_kpi_agent (assigned_agent_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ${target}.merged_kpi_period_snapshots (
      source_id                 VARCHAR(191) NOT NULL,
      kpi_maintenance_id        VARCHAR(191) NOT NULL,
      period_key                VARCHAR(255) NOT NULL,
      frequency                 VARCHAR(20) NOT NULL,
      time_zone                 VARCHAR(100) NOT NULL,
      total                     INT NOT NULL,
      done                      INT NOT NULL,
      missing                   INT NOT NULL,
      percent                   INT NOT NULL,
      fully_complete            TINYINT(1) NOT NULL DEFAULT 0,
      contributor_progress      JSON NULL,
      captured_at               DATETIME(3) NOT NULL,
      source_database           VARCHAR(64) NOT NULL DEFAULT '${sourceTag}',
      merged_at                 TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (source_id),
      KEY idx_merged_kpi_snap_kpi (kpi_maintenance_id),
      KEY idx_merged_kpi_snap_period (period_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ${target}.merged_task_items (
      source_id                 VARCHAR(191) NOT NULL,
      title                     TEXT NOT NULL,
      description               TEXT NULL,
      status                    VARCHAR(20) NOT NULL,
      assigned_agent_id         VARCHAR(191) NULL,
      priority                  VARCHAR(50) NULL,
      due_at                    DATETIME(3) NULL,
      created_by                VARCHAR(191) NOT NULL,
      created_by_role           VARCHAR(255) NOT NULL,
      created_at                DATETIME(3) NOT NULL,
      updated_at                DATETIME(3) NOT NULL,
      source_database           VARCHAR(64) NOT NULL DEFAULT '${sourceTag}',
      merged_at                 TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (source_id),
      KEY idx_merged_task_status (status),
      KEY idx_merged_task_agent (assigned_agent_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ${target}.merged_task_activities (
      source_id                 VARCHAR(191) NOT NULL,
      task_id                   VARCHAR(191) NOT NULL,
      author                    VARCHAR(255) NOT NULL,
      action                    VARCHAR(255) NOT NULL,
      detail                    TEXT NULL,
      created_at                DATETIME(3) NOT NULL,
      source_database           VARCHAR(64) NOT NULL DEFAULT '${sourceTag}',
      merged_at                 TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (source_id),
      KEY idx_merged_task_act_task (task_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}
