const { PrismaClient } = require("@prisma/client/primary");

async function main() {
  const p = new PrismaClient();
  try {
    await p.$executeRawUnsafe(
      'ALTER TABLE "travel_order_locations" ADD COLUMN IF NOT EXISTS "started_at" TIMESTAMPTZ(3)',
    );
    await p.$executeRawUnsafe(
      'ALTER TABLE "travel_order_locations" ADD COLUMN IF NOT EXISTS "started_latitude" DOUBLE PRECISION',
    );
    await p.$executeRawUnsafe(
      'ALTER TABLE "travel_order_locations" ADD COLUMN IF NOT EXISTS "started_longitude" DOUBLE PRECISION',
    );
    await p.$executeRawUnsafe(
      'ALTER TABLE "travel_order_locations" ADD COLUMN IF NOT EXISTS "ended_at" TIMESTAMPTZ(3)',
    );
    await p.$executeRawUnsafe(
      'ALTER TABLE "travel_order_locations" ADD COLUMN IF NOT EXISTS "ended_latitude" DOUBLE PRECISION',
    );
    await p.$executeRawUnsafe(
      'ALTER TABLE "travel_order_locations" ADD COLUMN IF NOT EXISTS "ended_longitude" DOUBLE PRECISION',
    );
    await p.$executeRawUnsafe(`
      UPDATE "travel_order_locations"
      SET
        "ended_at" = COALESCE("ended_at", "checked_at"),
        "ended_latitude" = COALESCE("ended_latitude", "latitude"),
        "ended_longitude" = COALESCE("ended_longitude", "longitude")
      WHERE "checked_at" IS NOT NULL
         OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL)
    `);
    console.log("ok");
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
