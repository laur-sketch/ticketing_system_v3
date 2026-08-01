const { PrismaClient } = require("@prisma/client/primary");

async function main() {
  const p = new PrismaClient();
  try {
    await p.$executeRawUnsafe(
      `ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "payment_approval_meta" JSONB`,
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
