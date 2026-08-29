import { PrismaClient as PrismaClientSecondary } from "@prisma/client/secondary";

function sqlId(name: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return `\`${name}\``;
}

/** Ensure merged_companies exists for HRIS company logo ETL. */
export async function ensureMergedCompaniesSchema(
  db: PrismaClientSecondary,
  targetDb: string,
) {
  const target = sqlId(targetDb);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ${target}.merged_companies (
      source_company_id   BIGINT UNSIGNED NOT NULL,
      source_database     VARCHAR(64) NOT NULL DEFAULT 'hris-dev',
      name                VARCHAR(255) NOT NULL,
      logo_path           VARCHAR(255) NULL,
      logo_image          LONGTEXT NULL,
      phone               VARCHAR(64) NULL,
      email               VARCHAR(255) NULL,
      address             TEXT NULL,
      created_at          TIMESTAMP NULL,
      updated_at          TIMESTAMP NULL,
      merged_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (source_company_id),
      KEY idx_merged_companies_name (name),
      KEY idx_merged_companies_source_db (source_database)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Older installs may have the table without logo_image.
  for (const col of [
    { name: "logo_path", ddl: "VARCHAR(255) NULL AFTER name" },
    { name: "logo_image", ddl: "LONGTEXT NULL AFTER logo_path" },
    { name: "phone", ddl: "VARCHAR(64) NULL AFTER logo_image" },
    { name: "email", ddl: "VARCHAR(255) NULL AFTER phone" },
    { name: "address", ddl: "TEXT NULL AFTER email" },
  ] as const) {
    const cols = await db.$queryRawUnsafe<Array<{ Field: string }>>(
      `SHOW COLUMNS FROM ${target}.merged_companies LIKE '${col.name}'`,
    );
    if (cols.length === 0) {
      await db.$executeRawUnsafe(
        `ALTER TABLE ${target}.merged_companies ADD COLUMN ${col.name} ${col.ddl}`,
      );
    }
  }
}
