import { PrismaClient as PrismaClientSecondary } from "@prisma/client/secondary";
import { ensureMergedPortalWorkTables } from "./ensure-merged-task-kpi-tables";

function sqlId(name: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return `\`${name}\``;
}

/** Ensure all mergedatabase consolidation tables exist (HRIS + tasks/KPIs + mappings). */
export async function ensureMergedConsolidationSchema(
  db: PrismaClientSecondary,
  targetDb: string,
  sourceTag: string,
) {
  await ensureMergedPortalWorkTables(db, targetDb, sourceTag);
  const target = sqlId(targetDb);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ${target}.external_user_mappings (
      id                      VARCHAR(191) NOT NULL,
      external_source         VARCHAR(64) NOT NULL,
      external_user_id        BIGINT UNSIGNED NOT NULL,
      merged_source_user_id   BIGINT UNSIGNED NOT NULL,
      legacy_username         VARCHAR(255) NULL,
      legacy_email            VARCHAR(255) NULL,
      portal_account_id       VARCHAR(191) NULL,
      last_synced_at          TIMESTAMP NULL,
      created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY external_user_mappings_source_user_key (external_source, external_user_id),
      KEY idx_external_user_mappings_merged (merged_source_user_id),
      KEY idx_external_user_mappings_portal (portal_account_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ${target}.merged_username_aliases (
      id                      VARCHAR(191) NOT NULL,
      source_user_id          BIGINT UNSIGNED NOT NULL,
      username                VARCHAR(255) NOT NULL,
      source                  VARCHAR(32) NOT NULL DEFAULT 'hris',
      created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY merged_username_aliases_username_key (username),
      KEY idx_merged_username_aliases_user (source_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}
