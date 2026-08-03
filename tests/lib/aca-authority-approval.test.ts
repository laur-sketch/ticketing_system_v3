import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
} from "../../src/lib/aca-approval";

describe("ACA authority matrix thresholds", () => {
  it("marks office supplies at or below 3000 as no ACA required", () => {
    const r = resolveAcaAuthority({
      category: "Office Supplies",
      natureOfRequest: "Office supplies",
      estimatedCost: 3000,
    });
    assert.equal(r.ok, true);
    assert.equal(r.requiresAca, false);
  });

  it("resolves office supplies 3001–5000 to AP_2 with RA_1 (AP_1 has no matrix conditions)", () => {
    const r = resolveAcaAuthority({
      category: "Office Supplies",
      natureOfRequest: "Office supplies",
      estimatedCost: 4000,
    });
    assert.equal(r.ok, true);
    assert.equal(r.requiresAca, true);
    assert.equal(r.recommendingLevel, "RA_1");
    assert.equal(r.approvingPath, "AP_2");
    assert.equal(r.approvingSeatCount, 1);
  });

  it("never assigns AP_1 as an approving path in the seeded matrix", () => {
    for (const row of ACA_AUTHORITY_MATRIX) {
      for (const band of row.bands) {
        assert.notEqual(band.approvingPath, "AP_1", `${row.category} / ${row.natureOfRequest}`);
      }
    }
  });

  it("resolves international travel to All ExeCom seats", () => {
    const r = resolveAcaAuthority({
      category: "Travel and Meals",
      natureOfRequest: "International",
      estimatedCost: 1,
    });
    assert.equal(r.ok, true);
    assert.equal(r.requiresAca, true);
    assert.equal(r.approvingPath, "ALL_EXECOM");
    assert.equal(r.approvingSeatCount, ACA_ALL_EXECOM_SEAT_COUNT);
  });

  it("exposes FOUR_EXECOMS seat count constant", () => {
    assert.equal(approvingSeatCountForPath("FOUR_EXECOMS"), ACA_FOUR_EXECOM_SEAT_COUNT);
    assert.equal(approvingSeatCountForPath("ALL_EXECOM"), ACA_ALL_EXECOM_SEAT_COUNT);
  });

  it("starts RA2 amount bands at AP_2 (matching RA2); never under FOUR/ALL as first band", () => {
    for (const row of ACA_AUTHORITY_MATRIX) {
      if (row.recommendingApprover !== "RA_2") continue;
      const amountBands = row.bands.filter((b) => !b.regardlessOfAmount);
      if (amountBands.length === 0) continue;
      assert.equal(
        amountBands[0]!.approvingPath,
        "AP_2",
        `${row.category} / ${row.natureOfRequest}`,
      );
      for (const band of amountBands) {
        assert.ok(
          band.approvingPath === "AP_2" ||
            band.approvingPath === "AP_3" ||
            band.approvingPath === "AP_4",
          `${row.category} / ${row.natureOfRequest} → ${band.approvingPath}`,
        );
      }
    }
  });

  it("starts RA3 amount bands at AP_3 (matching RA3)", () => {
    for (const row of ACA_AUTHORITY_MATRIX) {
      if (row.recommendingApprover !== "RA_3") continue;
      const amountBands = row.bands.filter((b) => !b.regardlessOfAmount);
      if (amountBands.length === 0) continue;
      assert.equal(
        amountBands[0]!.approvingPath,
        "AP_3",
        `${row.category} / ${row.natureOfRequest}`,
      );
    }
  });

  it("pairs All ExeCom only with RA_4 or EXECOM", () => {
    for (const row of ACA_AUTHORITY_MATRIX) {
      for (const band of row.bands) {
        if (band.approvingPath !== "ALL_EXECOM") continue;
        assert.ok(
          row.recommendingApprover === "RA_4" || row.recommendingApprover === "EXECOM",
          `${row.category} / ${row.natureOfRequest} has All ExeCom with ${row.recommendingApprover}`,
        );
      }
    }
  });

  it("pairs 4 ExeComs with RA_2 (strategic) or RA_3 Barcode high band only", () => {
    for (const row of ACA_AUTHORITY_MATRIX) {
      for (const band of row.bands) {
        if (band.approvingPath !== "FOUR_EXECOMS") continue;
        const strategicRa2 =
          row.recommendingApprover === "RA_2" && band.regardlessOfAmount;
        const barcodeHigh =
          row.natureOfRequest === "Barcode Equipment" &&
          row.recommendingApprover === "RA_3" &&
          !band.regardlessOfAmount;
        assert.ok(
          strategicRa2 || barcodeHigh,
          `${row.category} / ${row.natureOfRequest} has 4 ExeComs with ${row.recommendingApprover}`,
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

  it("builds six ExeCom seats for All ExeCom path", () => {
    const resolution = resolveAcaAuthority({
      category: "Travel and Meals",
      natureOfRequest: "International",
      estimatedCost: 100000,
    });
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
});
