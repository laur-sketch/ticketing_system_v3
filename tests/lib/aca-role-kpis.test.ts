import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { parseAcaApprovalMeta } from "../../src/lib/aca-approval";
import { mergePersonnelRequestMetrics } from "../../src/lib/task-personnel-metrics";
import type { PersonnelCombinedMetricCard } from "../../src/lib/task-personnel-metrics";

describe("ACA Submitted KPI attribution inputs", () => {
  it("exposes SUBMITTED_BY agent from ACA meta", () => {
    const meta = parseAcaApprovalMeta({
      proceduralStep: "RECOMMENDED_BY",
      levels: [
        {
          key: "SUBMITTED_BY",
          label: "SUBMITTED BY",
          roleCode: "SUBMITTER",
          agentId: "sub-1",
          approvedAt: "2026-08-01T00:00:00.000Z",
        },
        {
          key: "RECOMMENDED_BY",
          label: "RECOMMENDED BY",
          roleCode: "RA_1",
          agentId: "rec-1",
        },
      ],
      matrixSnapshot: {
        ok: true,
        requiresAca: true,
        category: "x",
        natureOfRequest: "y",
        estimatedCost: 1,
        recommendingLevel: "RA_1",
        recommendingLabel: "RA 1",
        approvingPath: "AP_1",
        approvingLabel: "AP 1",
        approvingSeatCount: 1,
        guidance: "",
        remarks: null,
        error: null,
      },
    });
    assert.ok(meta);
    const submitted = meta!.levels.find((l) => l.key === "SUBMITTED_BY");
    assert.equal(submitted?.agentId, "sub-1");
    assert.ok(submitted?.approvedAt);
  });

  it("folds ACA Submitted into personnel Requests rollup", () => {
    const row: PersonnelCombinedMetricCard = {
      id: "a1",
      name: "Tester",
      role: "Assignee",
      tickets: null,
      rfpRequestor: null,
      rfpAccounting: null,
      rfpFinance: null,
      irsCanvass: null,
      ftrPrepared: null,
      acaSubmitted: { closed: 2, pending: 1, efficiency: 67 },
      tasks: null,
    };
    const requests = mergePersonnelRequestMetrics(row);
    assert.ok(requests);
    assert.equal(requests!.closed, 2);
    assert.equal(requests!.pending, 1);
    assert.equal(requests!.efficiency, 67);
  });
});
