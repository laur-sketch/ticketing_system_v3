/**
 * Smoke-check Activities duty snapshot against merged DB clock-ins.
 * Run: npx tsx scripts/verify-merged-duty-snapshot.ts
 */
import { loadOnDutySnapshot } from "../src/lib/load-on-duty-snapshot";
import { listMergedPersonnelDutyStatuses } from "../src/lib/merged-duty-status";

async function main() {
  const [snapshot, merged] = await Promise.all([
    loadOnDutySnapshot({ page: 1, pageSize: 48 }),
    listMergedPersonnelDutyStatuses(),
  ]);

  const onDutyMerged = merged.filter((m) => m.isOnDuty).length;
  console.log(
    JSON.stringify(
      {
        activitiesTotal: snapshot.total,
        activitiesOnDuty: snapshot.onDutyCount,
        companies: snapshot.companies,
        sample: snapshot.agents.slice(0, 8).map((a) => ({
          name: a.name,
          company: a.companyName,
          dutyStatus: a.dutyStatus,
          lastActivity: a.lastActivity,
        })),
        mergedActive: merged.length,
        mergedOnDutyToday: onDutyMerged,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
