const { PrismaClient } = require("@prisma/client/primary");

async function main() {
  const p = new PrismaClient();
  try {
    await p.$executeRawUnsafe(
      "ALTER TABLE travel_orders ADD COLUMN IF NOT EXISTS rejected_by_agent_id TEXT",
    );
    await p.$executeRawUnsafe(
      "ALTER TABLE travel_orders ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ(3)",
    );
    await p.$executeRawUnsafe(
      "ALTER TABLE travel_orders ADD COLUMN IF NOT EXISTS rejected_at_level INTEGER",
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
