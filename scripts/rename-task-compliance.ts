/**
 * One-off data fix: rename the Task Board card "TASK COMPLIANCE" -> "TAX COMPLIANCE".
 * Targets kpi_maintenance row cmsmmxbs6002bm8ftavacfyx0 (title + mainTask).
 * Run: npx tsx scripts/rename-task-compliance.ts [--apply]
 * Without --apply it only prints what would change.
 */
import { PrismaClient } from "@prisma/client/primary";

const prisma = new PrismaClient();
const CARD_ID = "cmsmmxbs6002bm8ftavacfyx0";
const FROM = "TASK COMPLIANCE";
const TO = "TAX COMPLIANCE";
const apply = process.argv.includes("--apply");

async function main() {
  const card = await prisma.kpiMaintenance.findUnique({ where: { id: CARD_ID } });
  if (!card) {
    console.error(`Card ${CARD_ID} not found. Aborting.`);
    process.exit(1);
  }
  if (card.title !== FROM || card.mainTask !== FROM) {
    console.error(
      `Unexpected current state: title=${JSON.stringify(card.title)} mainTask=${JSON.stringify(card.mainTask)}. Aborting.`,
    );
    process.exit(1);
  }

  const conflict = await prisma.kpiMaintenance.findFirst({
    where: { title: TO, mainTask: TO },
  });
  if (conflict) {
    console.error(`A card titled "${TO}" already exists (${conflict.id}). Aborting.`);
    process.exit(1);
  }

  console.log(`Would rename card ${CARD_ID}: "${FROM}" -> "${TO}"`);
  if (!apply) {
    console.log("Dry run — pass --apply to commit.");
    return;
  }

  await prisma.kpiMaintenance.update({
    where: { id: CARD_ID },
    data: { title: TO, mainTask: TO },
  });
  console.log("Done. Card renamed to", TO);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
