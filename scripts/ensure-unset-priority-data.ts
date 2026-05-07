/**
 * After `prisma db push`, SLA/Escalation rows for UNSET are not auto-seeded.
 * Run: npx tsx scripts/ensure-unset-priority-data.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.slaPolicy.upsert({
    where: { priority: "UNSET" },
    create: { priority: "UNSET", firstResponseHours: 24, resolutionHours: 72 },
    update: {},
  });
  try {
    await prisma.escalationTrigger.upsert({
      where: { priority: "UNSET" },
      create: {
        priority: "UNSET",
        enabled: false,
        notifyAdmin: false,
        notifyTarget: "NONE",
      },
      update: {},
    });
  } catch (e) {
    console.warn("EscalationTrigger (optional):", e);
  }
  console.log("UNSET priority SLA/trigger ensured.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
