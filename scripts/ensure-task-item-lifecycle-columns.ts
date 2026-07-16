import { prismaPrimary } from "../src/lib/prisma";

async function main() {
  await prismaPrimary.$executeRawUnsafe(
    `ALTER TABLE task_items ADD COLUMN IF NOT EXISTS started_at TIMESTAMP(3)`,
  );
  await prismaPrimary.$executeRawUnsafe(
    `ALTER TABLE task_items ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP(3)`,
  );
  await prismaPrimary.$executeRawUnsafe(
    `ALTER TABLE task_items ADD COLUMN IF NOT EXISTS delay_penalty_amount INTEGER`,
  );
  await prismaPrimary.$executeRawUnsafe(
    `ALTER TABLE task_items ADD COLUMN IF NOT EXISTS delay_penalty_accrued INTEGER NOT NULL DEFAULT 0`,
  );
  console.log("task_items lifecycle/penalty columns ensured");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prismaPrimary.$disconnect());
