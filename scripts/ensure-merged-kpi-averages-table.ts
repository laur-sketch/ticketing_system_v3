/**
 * Ensure merged Task/KPI tables (including merged_kpi_user_averages) exist.
 * Usage: npx tsx scripts/ensure-merged-kpi-averages-table.ts
 */
import { PrismaClient as PrismaClientSecondary } from "@prisma/client/secondary";
import {
  bootstrapMysqlUrl,
  ensureMergedPortalWorkTables,
  parseMysqlDatabaseName,
} from "./ensure-merged-task-kpi-tables";

async function main() {
  const writeUrl =
    process.env.DATABASE_URL_SECONDARY_SYNC?.trim() ||
    process.env.DATABASE_URL_SECONDARY?.trim();
  if (!writeUrl) {
    throw new Error("DATABASE_URL_SECONDARY (or _SYNC) is required");
  }

  const targetDb = parseMysqlDatabaseName(writeUrl) ?? "mergeddatabase-dev";
  const sourceTag =
    process.env.TICKETING_MERGE_SOURCE_TAG?.trim() ||
    process.env.HRIS_MERGE_SOURCE_TAG?.trim() ||
    "ticketing_system";

  const bootstrap = new PrismaClientSecondary({
    datasources: { db: { url: bootstrapMysqlUrl(writeUrl) } },
  });

  try {
    await bootstrap.$connect();
    await ensureMergedPortalWorkTables(bootstrap, targetDb, sourceTag);

    const rows = await bootstrap.$queryRawUnsafe<Array<{ c: bigint }>>(
      `SELECT COUNT(*) AS c FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      targetDb,
      "merged_kpi_user_averages",
    );

    console.log(
      JSON.stringify(
        {
          targetDb,
          sourceTag,
          merged_kpi_user_averages: Number(rows[0]?.c ?? 0) > 0,
        },
        null,
        2,
      ),
    );
  } finally {
    await bootstrap.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
