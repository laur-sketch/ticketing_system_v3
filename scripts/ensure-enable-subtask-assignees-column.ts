import { prismaPrimary } from "../src/lib/prisma";

async function main() {
  await prismaPrimary.$executeRawUnsafe(
    `ALTER TABLE kpi_maintenance ADD COLUMN IF NOT EXISTS enable_subtask_assignees BOOLEAN NOT NULL DEFAULT true`,
  );
  console.log("kpi_maintenance.enable_subtask_assignees column ensured");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prismaPrimary.$disconnect());
