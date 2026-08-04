import { ACA_AUTHORITY_MATRIX } from "../src/lib/aca-authority-matrix";

const rankRA: Record<string, number> = { RA_1: 1, RA_2: 2, RA_3: 3, RA_4: 4, EXECOM: 4 };
const rankAP: Record<string, number> = {
  AP_1: 1,
  AP_2: 2,
  AP_3: 3,
  AP_4: 4,
  FOUR_EXECOMS: 5,
  ALL_EXECOM: 6,
};

console.log("=== FOUR_EXECOMS / ALL_EXECOM (PDF column placements) ===");
for (const r of ACA_AUTHORITY_MATRIX) {
  for (const b of r.bands) {
    if (b.approvingPath !== "FOUR_EXECOMS" && b.approvingPath !== "ALL_EXECOM") continue;
    const any = b.regardlessOfAmount
      ? "regardless"
      : `${b.minInclusive}..${b.maxInclusive}`;
    console.log(
      `${r.recommendingApprover} → ${b.approvingPath} | ${r.category} | ${r.natureOfRequest} | ${any}`,
    );
  }
}

console.log("\n=== AP strictly below RA (info only — PDF may place AP above RA) ===");
let weak = 0;
for (const r of ACA_AUTHORITY_MATRIX) {
  const ra = rankRA[r.recommendingApprover]!;
  for (const b of r.bands) {
    const ap = rankAP[b.approvingPath]!;
    if (ap < ra) {
      weak += 1;
      console.log(
        `NOTE ${r.recommendingApprover} → ${b.approvingPath} | ${r.category} | ${r.natureOfRequest}`,
      );
    }
  }
}
if (!weak) console.log("none");

console.log("\n=== Spot-check key PDF rows ===");
const checks: Array<{ cat: string; nature: string; path: string; any?: boolean }> = [
  { cat: "Office Supplies", nature: "Office supplies", path: "AP_3" },
  { cat: "Travel and Meals", nature: "Local", path: "FOUR_EXECOMS", any: true },
  { cat: "Travel and Meals", nature: "International", path: "FOUR_EXECOMS", any: true },
  { cat: "Store & Service Operations", nature: "Opening New Store", path: "ALL_EXECOM", any: true },
  { cat: "CAPEX - Vehicle", nature: "Motorcycle Plan Service Vehicle", path: "FOUR_EXECOMS", any: true },
  { cat: "ICT Requirements", nature: "Barcode Equipment", path: "FOUR_EXECOMS" },
];
let failed = 0;
for (const c of checks) {
  const row = ACA_AUTHORITY_MATRIX.find(
    (r) => r.category === c.cat && r.natureOfRequest === c.nature,
  );
  if (!row) {
    console.log(`MISSING ${c.cat} / ${c.nature}`);
    failed += 1;
    continue;
  }
  const hit = row.bands.some(
    (b) =>
      b.approvingPath === c.path &&
      (c.any == null || Boolean(b.regardlessOfAmount) === c.any),
  );
  console.log(`${hit ? "OK" : "BAD"} ${c.nature} → ${c.path}`);
  if (!hit) failed += 1;
}

console.log(`\n=== Summary: ${ACA_AUTHORITY_MATRIX.length} rows, spot-check failures=${failed} ===`);
if (failed) process.exitCode = 1;
