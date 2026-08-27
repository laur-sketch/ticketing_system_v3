/**
 * Rename every KpiMaintenance task so its stored `title` becomes its main task
 * label (the `mainTask` value that task cards already display).
 *
 * Reserved pillar titles (IT PROJECT IMPLEMENTATION, JOB ORDER REQUEST, etc.)
 * are skipped so pillar detection keeps working.
 *
 * Run (dry run):  npx tsx scripts/rename-tasks-to-main-task-label.ts
 * Run (apply):    npx tsx scripts/rename-tasks-to-main-task-label.ts --apply
 */
import { PrismaClient } from "@prisma/client/primary";

const prisma = new PrismaClient();

/** Titles that must be preserved because system logic keys off them. */
const RESERVED_TITLES = new Set([
  "IT PROJECT IMPLEMENTATION",
  "JOB ORDER REQUEST",
  "HELPDESK SUPPORT",
  "USER SUPPORT",
]);

async function main() {
  const apply = process.argv.includes("--apply");

  const rows = await prisma.kpiMaintenance.findMany({
    select: { id: true, title: true, mainTask: true, itProjectName: true },
    orderBy: { title: "asc" },
  });

  const changes: Array<{ id: string; from: string; to: string }> = [];
  const skippedReserved: Array<{ id: string; title: string }> = [];
  const skippedNoLabel: Array<{ id: string; title: string }> = [];

  for (const row of rows) {
    const label = (row.mainTask ?? "").trim() || (row.itProjectName ?? "").trim() || "";
    const upperTitle = row.title.trim().toUpperCase();
    if (!label) {
      skippedNoLabel.push({ id: row.id, title: row.title });
      continue;
    }
    if (RESERVED_TITLES.has(upperTitle)) {
      skippedReserved.push({ id: row.id, title: row.title });
      continue;
    }
    if (upperTitle === label.toUpperCase()) continue; // already named by its main task label
    changes.push({ id: row.id, from: row.title, to: label });
  }

  console.log(`Total tasks: ${rows.length}`);
  console.log(`To rename: ${changes.length}`);
  console.log(`Skipped (reserved pillar title): ${skippedReserved.length}`);
  console.log(`Skipped (no main task label): ${skippedNoLabel.length}`);
  console.log("");
  for (const c of changes) {
    console.log(`  ${c.id}\n    "${c.from}"  ->  "${c.to}"`);
  }

  if (changes.length === 0) {
    console.log("\nNothing to do.");
    return;
  }

  if (!apply) {
    console.log("\nDry run only — pass --apply to write the changes.");
    return;
  }

  // Respect @@unique([title, mainTask]): after renaming, no two rows may share
  // the same (title, mainTask) pair (case-insensitively).
  const seen = new Set<string>();
  const collisionTitles = new Set<string>();
  for (const c of changes) {
    const row = rows.find((r) => r.id === c.id)!;
    const key = `${c.to.trim().toUpperCase()}||${(row.mainTask ?? "").trim().toUpperCase()}`;
    if (seen.has(key)) collisionTitles.add(c.to);
    seen.add(key);
  }
  if (collisionTitles.size > 0) {
    console.log(
      `\nAborting: rename would violate the (title, mainTask) uniqueness constraint on: ${[...collisionTitles].join(", ")}`,
    );
    process.exit(1);
  }

  for (const c of changes) {
    await prisma.kpiMaintenance.update({ where: { id: c.id }, data: { title: c.to } });
    console.log(`Renamed "${c.from}" -> "${c.to}" (${c.id})`);
  }
  console.log(`\nDone: renamed ${changes.length} tasks.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
