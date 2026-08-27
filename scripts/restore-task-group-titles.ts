/**
 * Rollback for `rename-tasks-to-main-task-label.ts` — restores the original
 * task-group titles on the 11 tasks that were renamed.
 *
 * Matches by task id (not by current title) so it stays accurate even if a
 * title was changed again since the rename. It only restores a title when the
 * row's current title still equals the renamed value, and it respects the
 * (title, mainTask) unique constraint.
 *
 * Run (dry run):  npx tsx scripts/restore-task-group-titles.ts
 * Run (apply):    npx tsx scripts/restore-task-group-titles.ts --apply
 */
import { PrismaClient } from "@prisma/client/primary";

const prisma = new PrismaClient();

/** id -> { renamed: string; original: string } for every task renamed on 2026-08-12. */
const RESTORE_MAP: Record<string, { renamed: string; original: string }> = {
  cmp80d0540005ogrytzrx12ri: {
    renamed: "SYSTEM DATABASE BACKUP",
    original: "DATA BACKUP",
  },
  cmrzrn4lb0011tcqrb42utbsd: {
    renamed: "EAZYGAS",
    original: "EAZYGAS TASKS",
  },
  cmrslmrsb0001btiyw705t5ni: {
    renamed: "SALES",
    original: "FRONTDESK",
  },
  cmryg4jjr00efcsebsoele2a5: {
    renamed: "INTERVIEW PROCESSING",
    original: "HR ASSISTANT",
  },
  cmryfmr7y00edcseb0skoz5v3: {
    renamed: "OTHER TASKS",
    original: "HR ASSISTANT",
  },
  cmrzz09ja0034tcqr9469kayj: {
    renamed: "AREA 1",
    original: "MCHISI LPG (AREA 1)",
  },
  cmrzpiptr0009qz7n3ioc2bzb: {
    renamed: "AREA 2",
    original: "MCHISI LPG (AREA 2)",
  },
  cmrzpkuty000bqz7n7sbcd6vg: {
    renamed: "AREA 3-A",
    original: "MCHISI LPG (AREA 3-A)",
  },
  cmrzpmux9000dqz7ni59tu0pi: {
    renamed: "AREA 3-B",
    original: "MCHISI LPG (AREA 3-B)",
  },
  cmpf7ley50001nbsksyduoiwc: {
    renamed: "SERVER,NETWORK,FIREWALL, ERP-SYSTEM,TICKETING,HRIS",
    original: "MONITORING",
  },
  cmp80dr8p0007ogryqvecs89o: {
    renamed: "SYSTEM PATCHES AND BUG FIXES",
    original: "SYSTEM MAINTENANCE",
  },
};

async function main() {
  const apply = process.argv.includes("--apply");

  const ids = Object.keys(RESTORE_MAP);
  const rows = await prisma.kpiMaintenance.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true, mainTask: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));

  const toRestore: Array<{ id: string; from: string; to: string }> = [];
  const alreadyOriginal: string[] = [];
  const missing: string[] = [];
  const titleChanged: Array<{ id: string; current: string; expected: string }> = [];

  for (const id of ids) {
    const expected = RESTORE_MAP[id]!;
    const row = byId.get(id);
    if (!row) {
      missing.push(id);
      continue;
    }
    const current = row.title.trim();
    if (current.toUpperCase() === expected.original.toUpperCase()) {
      alreadyOriginal.push(id);
      continue;
    }
    if (current.toUpperCase() !== expected.renamed.toUpperCase()) {
      // Title was changed again since the rename — do not clobber it.
      titleChanged.push({ id, current, expected: expected.renamed });
      continue;
    }
    toRestore.push({ id, from: current, to: expected.original });
  }

  console.log(`Tasks tracked for rollback: ${ids.length}`);
  console.log(`To restore: ${toRestore.length}`);
  console.log(`Already original: ${alreadyOriginal.length}`);
  console.log(`Missing row: ${missing.length}`);
  console.log(`Skipped (title changed since rename): ${titleChanged.length}`);
  console.log("");
  for (const c of toRestore) {
    console.log(`  ${c.id}\n    "${c.from}"  ->  "${c.to}"`);
  }
  if (titleChanged.length > 0) {
    console.log("");
    for (const c of titleChanged) {
      console.log(`  SKIP ${c.id}: current "${c.current}" != renamed "${c.expected}"`);
    }
  }

  if (toRestore.length === 0) {
    console.log("\nNothing to restore.");
    return;
  }

  if (!apply) {
    console.log("\nDry run only — pass --apply to write the changes.");
    return;
  }

  // Respect @@unique([title, mainTask]): no two rows may end up with the same
  // (title, mainTask) pair (case-insensitively).
  const seen = new Set<string>();
  const collisionTitles = new Set<string>();
  for (const c of toRestore) {
    const row = byId.get(c.id)!;
    const key = `${c.to.trim().toUpperCase()}||${(row.mainTask ?? "").trim().toUpperCase()}`;
    if (seen.has(key)) collisionTitles.add(c.to);
    seen.add(key);
  }
  if (collisionTitles.size > 0) {
    console.log(
      `\nAborting: restore would violate the (title, mainTask) uniqueness constraint on: ${[...collisionTitles].join(", ")}`,
    );
    process.exit(1);
  }

  for (const c of toRestore) {
    await prisma.kpiMaintenance.update({ where: { id: c.id }, data: { title: c.to } });
    console.log(`Restored "${c.from}" -> "${c.to}" (${c.id})`);
  }
  console.log(`\nDone: restored ${toRestore.length} tasks.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
