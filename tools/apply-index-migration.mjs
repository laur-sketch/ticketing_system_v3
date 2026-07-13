import fs from "node:fs/promises";
import { PrismaClient } from "@prisma/client/primary";

const prisma = new PrismaClient();
const file = "prisma/migrations/20260428104105_add_api_performance_indexes/migration.sql";

function statementsFromSql(sql) {
  const normalized = sql.replace(/\u0000/g, "").replace(/^\uFEFF/, "");
  const noComments = normalized
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  return noComments
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

try {
  const sql = await fs.readFile(file, "utf8");
  const statements = statementsFromSql(sql);
  let applied = 0;
  let skipped = 0;

  for (const stmt of statements) {
    const withGuard = stmt.replace(/^CREATE INDEX\s+/i, "CREATE INDEX IF NOT EXISTS ");
    try {
      await prisma.$executeRawUnsafe(withGuard);
      applied += 1;
      console.log(`applied: ${withGuard.split("\n")[0]}`);
    } catch (err) {
      skipped += 1;
      console.warn(`skipped: ${withGuard.split("\n")[0]}`);
      console.warn(err instanceof Error ? err.message : String(err));
    }
  }

  console.log(`done. applied=${applied} skipped=${skipped}`);
} finally {
  await prisma.$disconnect();
}
