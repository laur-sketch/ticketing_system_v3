/**
 * Read-only diagnostic: compare the Workforce ListView roster
 * (loadPersonnelAccountsPayload) and the Activity on-duty snapshot
 * (loadOnDutySnapshot) per person to surface role / company / population
 * mismatches that would make the shared filters return different results.
 *
 * Run: npx tsx scripts/diag-workforce-filter-parity.ts
 */
import { loadPersonnelAccountsPayload } from "../src/lib/personnel-accounts-data";
import { loadOnDutySnapshot } from "../src/lib/load-on-duty-snapshot";
import { normalizePortalRole } from "../src/lib/staff-role";

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
}

async function main() {
  const roster = await loadPersonnelAccountsPayload({ role: "SuperAdmin", email: null });
  // The loader caps pageSize at 48 — iterate every page to collect the full set.
  const allDuty: Awaited<ReturnType<typeof loadOnDutySnapshot>>["agents"] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const snap = await loadOnDutySnapshot({ page, pageSize: 48 });
    allDuty.push(...snap.agents);
    totalPages = snap.totalPages;
    page += 1;
  } while (page <= totalPages);
  const duty = { agents: allDuty } as Awaited<ReturnType<typeof loadOnDutySnapshot>>;

  console.log(
    `ListView personnel: ${roster.personnel.length}  |  Activity agents: ${duty.agents.length}`,
  );

  const dutyByName = new Map<string, (typeof duty.agents)[number]>();
  for (const a of duty.agents) dutyByName.set(norm(a.name), a);

  const rosterByName = new Map<string, (typeof roster.personnel)[number]>();
  for (const r of roster.personnel) rosterByName.set(norm(r.name), r);

  console.log("\n=== People ONLY in ListView (not in Activity) ===");
  for (const r of roster.personnel) {
    if (!dutyByName.has(norm(r.name))) {
      console.log(`  ${r.name} | role=${r.staffRole} | company=${r.teamName} | id=${r.mergedSourceUserId}`);
    }
  }

  console.log("\n=== People ONLY in Activity (not in ListView) ===");
  for (const a of duty.agents) {
    if (!rosterByName.has(norm(a.name))) {
      console.log(`  ${a.name} | role=${a.role} | company=${a.companyName}`);
    }
  }

  console.log("\n=== Role mismatch (same person, different derived role) ===");
  for (const r of roster.personnel) {
    const a = dutyByName.get(norm(r.name));
    if (!a) continue;
    const rRole = normalizePortalRole(r.staffRole) ?? r.staffRole;
    const aRole = normalizePortalRole(a.role) ?? a.role;
    if (rRole !== aRole) {
      console.log(`  ${r.name}: ListView=${r.staffRole} -> ${rRole} | Activity=${a.role} -> ${aRole}`);
    }
  }

  console.log("\n=== Company mismatch (same person, different company label) ===");
  for (const r of roster.personnel) {
    const a = dutyByName.get(norm(r.name));
    if (!a) continue;
    if (r.teamName.trim().toLowerCase() !== a.companyName.trim().toLowerCase()) {
      console.log(`  ${r.name}: ListView="${r.teamName}" | Activity="${a.companyName}"`);
    }
  }
}

main()
  .then(() => {
    console.log("\nDone.");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
