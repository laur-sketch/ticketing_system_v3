const { PrismaClient } = require("@prisma/client/primary");

async function main() {
  const p = new PrismaClient();
  try {
    await p.$executeRawUnsafe(
      `ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "request_type" TEXT NOT NULL DEFAULT 'ISSUE_CONCERN_TICKET'`,
    );
    await p.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "tickets_request_type_idx" ON "tickets"("request_type")`,
    );
    console.log("ok");
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
