import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  resolveAcaAuthority,
  approvingSeatCountForPath,
  ACA_ALL_EXECOM_SEAT_COUNT,
  ACA_FOUR_EXECOM_SEAT_COUNT,
  ACA_AUTHORITY_MATRIX,
} from "../../src/lib/aca-authority-matrix";
import {
  completeAcaApprovalStep,
  defaultAcaApprovalMeta,
  isAcaProcedureGreenLit,
  acaExeComSeatAgentIds,
  acaLevelRequiresFeedback,
  acaLevelShowsInExeComTable,
  acaLevelShowsInHorizontalApproval,
  isAcaBoardVisibleToAgent,
} from "../../src/lib/aca-approval";

describe("ACA authority matrix thresholds (Annex III Rev Feb 2026)", () => {
  it("marks office supplies at or below 3000 as no ACA required", () => {
    const r = resolveAcaAuthority({
      category: "Office Supplies",
      natureOfRequest: "Office supplies",
      estimatedCost: 3000,
    });
    assert.equal(r.ok, true);
    assert.equal(r.requiresAca, false);
  });

  it("resolves office supplies 3001–5000 to AP_3 with RA_1 (PDF AP 3 column)", () => {
    const r = resolveAcaAuthority({
      category: "Office Supplies",
      natureOfRequest: "Office supplies",
      estimatedCost: 4000,
    });
    assert.equal(r.ok, true);
    assert.equal(r.requiresAca, true);
    assert.equal(r.recommendingLevel, "RA_1");
    assert.equal(r.approvingPath, "AP_3");
    assert.equal(r.approvingSeatCount, 1);
  });

  it("resolves office supplies above 5000 to 4 ExeComs", () => {
    const r = resolveAcaAuthority({
      category: "Office Supplies",
      natureOfRequest: "Office supplies",
      estimatedCost: 5000.01,
    });
    assert.equal(r.ok, true);
    assert.equal(r.approvingPath, "FOUR_EXECOMS");
    assert.equal(r.approvingSeatCount, ACA_FOUR_EXECOM_SEAT_COUNT);
  });

  it("never assigns AP_1 as an approving path in the seeded matrix", () => {
    for (const row of ACA_AUTHORITY_MATRIX) {
      for (const band of row.bands) {
        assert.notEqual(band.approvingPath, "AP_1", `${row.category} / ${row.natureOfRequest}`);
      }
    }
  });

  it("resolves international travel to 4 ExeComs (PDF column)", () => {
    const r = resolveAcaAuthority({
      category: "Travel and Meals",
      natureOfRequest: "International",
      estimatedCost: 1,
    });
    assert.equal(r.ok, true);
    assert.equal(r.requiresAca, true);
    assert.equal(r.approvingPath, "FOUR_EXECOMS");
    assert.equal(r.approvingSeatCount, ACA_FOUR_EXECOM_SEAT_COUNT);
  });

  it("resolves local travel to 4 ExeComs regardless of amount", () => {
    const r = resolveAcaAuthority({
      category: "Travel and Meals",
      natureOfRequest: "Local",
      estimatedCost: 1,
    });
    assert.equal(r.ok, true);
    assert.equal(r.approvingPath, "FOUR_EXECOMS");
  });

  it("resolves opening new store to All ExeCom", () => {
    const r = resolveAcaAuthority({
      category: "Store & Service Operations",
      natureOfRequest: "Opening New Store",
      estimatedCost: 1,
    });
    assert.equal(r.ok, true);
    assert.equal(r.approvingPath, "ALL_EXECOM");
    assert.equal(r.recommendingLevel, "RA_2");
  });

  it("resolves delivery vehicle bands to 4 ExeComs then All ExeCom", () => {
    const low = resolveAcaAuthority({
      category: "CAPEX - Vehicle",
      natureOfRequest: "Delivery Vehicle",
      estimatedCost: 250000,
    });
    assert.equal(low.approvingPath, "FOUR_EXECOMS");
    const high = resolveAcaAuthority({
      category: "CAPEX - Vehicle",
      natureOfRequest: "Delivery Vehicle",
      estimatedCost: 500000.01,
    });
    assert.equal(high.approvingPath, "ALL_EXECOM");
  });

  it("exposes FOUR_EXECOMS and ALL_EXECOM seat count constants", () => {
    assert.equal(approvingSeatCountForPath("FOUR_EXECOMS"), ACA_FOUR_EXECOM_SEAT_COUNT);
    assert.equal(approvingSeatCountForPath("ALL_EXECOM"), ACA_ALL_EXECOM_SEAT_COUNT);
  });

  it("allows All ExeCom with RA_2 / RA_3 when the PDF places the band there", () => {
    const opening = resolveAcaAuthority({
      category: "Store & Service Operations",
      natureOfRequest: "Opening New Store",
      estimatedCost: 1,
    });
    assert.equal(opening.recommendingLevel, "RA_2");
    assert.equal(opening.approvingPath, "ALL_EXECOM");

    const trip = resolveAcaAuthority({
      category: "Store & Service Operations",
      natureOfRequest: "Trip incentive",
      estimatedCost: 1,
    });
    assert.equal(trip.recommendingLevel, "RA_3");
    assert.equal(trip.approvingPath, "ALL_EXECOM");
  });

  it("keeps every matrix band non-empty and ordered by path rank when amount-based", () => {
    const rank: Record<string, number> = {
      AP_1: 1,
      AP_2: 2,
      AP_3: 3,
      AP_4: 4,
      FOUR_EXECOMS: 5,
      ALL_EXECOM: 6,
    };
    for (const row of ACA_AUTHORITY_MATRIX) {
      assert.ok(row.bands.length > 0, `${row.category} / ${row.natureOfRequest}`);
      const amountBands = row.bands.filter((b) => !b.regardlessOfAmount);
      for (let i = 1; i < amountBands.length; i++) {
        assert.ok(
          rank[amountBands[i]!.approvingPath]! >= rank[amountBands[i - 1]!.approvingPath]!,
          `${row.category} / ${row.natureOfRequest}`,
        );
      }
    }
  });
});

describe("ACA approval chain advance", () => {
  it("advances through Recommended By → Finance → Approver to DONE", () => {
    const resolution = resolveAcaAuthority({
      category: "Office Supplies",
      natureOfRequest: "Office supplies",
      estimatedCost: 4000,
    });
    assert.equal(resolution.ok, true);
    assert.equal(resolution.requiresAca, true);

    let meta = defaultAcaApprovalMeta({
      resolution,
      submittedByAgentId: "prep",
      recommendedByAgentId: "ra",
      financeManagerAgentId: "fin",
      approvingAgentIds: ["ap"],
    });
    assert.equal(meta.proceduralStep, "RECOMMENDED_BY");
    assert.equal(isAcaProcedureGreenLit(meta), false);

    meta = completeAcaApprovalStep(meta);
    assert.equal(meta.proceduralStep, "FINANCE_MANAGER");

    meta = completeAcaApprovalStep(meta);
    assert.equal(meta.proceduralStep, "APPROVER_1");

    meta = completeAcaApprovalStep(meta, { comment: "Cleared" });
    assert.equal(meta.proceduralStep, "DONE");
    assert.equal(isAcaProcedureGreenLit(meta), true);
    const approver = meta.levels.find((l) => l.key === "APPROVER_1");
    assert.equal(approver?.comment, "Cleared");
  });

  it("builds five ExeCom seats for All ExeCom path", () => {
    const resolution = resolveAcaAuthority({
      category: "Store & Service Operations",
      natureOfRequest: "Opening New Store",
      estimatedCost: 1,
    });
    assert.equal(resolution.approvingPath, "ALL_EXECOM");
    assert.equal(resolution.approvingSeatCount, 5);
    const seatIds = Array.from({ length: ACA_ALL_EXECOM_SEAT_COUNT }, (_, i) => `e${i + 1}`);
    const meta = defaultAcaApprovalMeta({
      resolution,
      submittedByAgentId: "prep",
      recommendedByAgentId: "ra",
      financeManagerAgentId: "fin",
      approvingAgentIds: seatIds,
    });
    const approverLevels = meta.levels.filter((l) => l.key.startsWith("APPROVER_"));
    assert.equal(approverLevels.length, ACA_ALL_EXECOM_SEAT_COUNT);
  });

  it("builds four ExeCom seats for international travel", () => {
    const resolution = resolveAcaAuthority({
      category: "Travel and Meals",
      natureOfRequest: "International",
      estimatedCost: 100000,
    });
    assert.equal(resolution.approvingPath, "FOUR_EXECOMS");
    const seatIds = Array.from({ length: ACA_FOUR_EXECOM_SEAT_COUNT }, (_, i) => `e${i + 1}`);
    const meta = defaultAcaApprovalMeta({
      resolution,
      submittedByAgentId: "prep",
      recommendedByAgentId: "ra",
      financeManagerAgentId: "fin",
      approvingAgentIds: seatIds,
    });
    const approverLevels = meta.levels.filter((l) => l.key.startsWith("APPROVER_"));
    assert.equal(approverLevels.length, ACA_FOUR_EXECOM_SEAT_COUNT);
  });

  it("requires feedback only for AP_4 / 4 ExeComs / All ExeCom seats", () => {
    assert.equal(acaLevelRequiresFeedback("AP_4"), true);
    assert.equal(acaLevelRequiresFeedback("FOUR_EXECOMS"), true);
    assert.equal(acaLevelRequiresFeedback("ALL_EXECOM"), true);
    assert.equal(acaLevelRequiresFeedback("AP_3"), false);
    assert.equal(acaLevelRequiresFeedback("FINANCE"), false);
  });

  it("puts AP_2 and AP_3 in the horizontal approval row, not the ExeCom table", () => {
    assert.equal(acaLevelShowsInHorizontalApproval("AP_2", "APPROVER_1"), true);
    assert.equal(acaLevelShowsInHorizontalApproval("AP_3", "APPROVER_1"), true);
    assert.equal(acaLevelShowsInExeComTable("AP_2"), false);
    assert.equal(acaLevelShowsInExeComTable("AP_3"), false);
    assert.equal(acaLevelShowsInExeComTable("AP_4"), true);
  });

  it("keeps AP_4 / 4 ExeComs / All ExeCom out of procedural steps", () => {
    assert.equal(acaLevelShowsInHorizontalApproval("AP_4", "APPROVER_1"), false);
    assert.equal(acaLevelShowsInHorizontalApproval("FOUR_EXECOMS", "APPROVER_1"), false);
    assert.equal(acaLevelShowsInHorizontalApproval("ALL_EXECOM", "APPROVER_1"), false);
    assert.equal(acaLevelShowsInHorizontalApproval("RA_1", "RECOMMENDED_BY"), true);
    assert.equal(acaLevelShowsInHorizontalApproval("FINANCE", "FINANCE_MANAGER"), true);
    assert.equal(acaLevelShowsInExeComTable("AP_4"), true);
    assert.equal(acaLevelShowsInExeComTable("FOUR_EXECOMS"), true);
    assert.equal(acaLevelShowsInExeComTable("ALL_EXECOM"), true);
  });

  it("shows AP_4 / 4 ExeComs / All ExeCom seats on every listed seat holder's board", () => {
    const resolution = resolveAcaAuthority({
      category: "Travel and Meals",
      natureOfRequest: "International",
      estimatedCost: 100000,
    });
    assert.equal(resolution.approvingPath, "FOUR_EXECOMS");
    const meta = defaultAcaApprovalMeta({
      resolution,
      submittedByAgentId: "prep",
      recommendedByAgentId: "ra",
      financeManagerAgentId: "fin",
      approvingAgentIds: ["e1", "e2", "e3", "e4"],
    });
    // Still on Recommended By — ExeCom seats already board-visible.
    assert.equal(meta.proceduralStep, "RECOMMENDED_BY");
    assert.equal(isAcaBoardVisibleToAgent(meta, "e1"), true);
    assert.equal(isAcaBoardVisibleToAgent(meta, "e3"), true);
    assert.equal(isAcaBoardVisibleToAgent(meta, "ra"), true);
    assert.equal(isAcaBoardVisibleToAgent(meta, "fin"), false);
    assert.deepEqual([...acaExeComSeatAgentIds(meta)].sort(), ["e1", "e2", "e3", "e4"]);
  });
});
