import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePaymentApprovalMeta } from "../../src/lib/request-for-payment-approval";

describe("RFP role KPI attribution inputs", () => {
  it("parses accounting and finance completion stamps separately", () => {
    const meta = parsePaymentApprovalMeta({
      preparedByAgentId: "p1",
      notedByAgentId: "n1",
      approvedByAgentId: "a1",
      accountingAgentId: "acct-1",
      financeAgentId: "fin-1",
      proceduralStep: "DONE",
      completed: {
        PREPARED_BY: "2026-07-01T01:00:00.000Z",
        NOTED_BY: "2026-07-01T02:00:00.000Z",
        APPROVED_BY: "2026-07-01T03:00:00.000Z",
        RECEIVED_BY_ACCOUNTING: "2026-07-02T04:00:00.000Z",
        RECEIVED_BY_FINANCE: "2026-07-03T05:00:00.000Z",
      },
    });
    assert.ok(meta);
    assert.equal(meta!.accountingAgentId, "acct-1");
    assert.equal(meta!.financeAgentId, "fin-1");
    assert.equal(meta!.completed.APPROVED_BY_ACCOUNTING, "2026-07-02T04:00:00.000Z");
    assert.equal(meta!.completed.APPROVED_BY_FINANCE, "2026-07-03T05:00:00.000Z");
    assert.notEqual(
      meta!.completed.APPROVED_BY_ACCOUNTING,
      meta!.completed.APPROVED_BY_FINANCE,
    );
  });

  it("identifies pending accounting vs finance procedural steps", () => {
    const accountingPending = parsePaymentApprovalMeta({
      accountingAgentId: "acct-1",
      financeAgentId: null,
      proceduralStep: "RECEIVED_BY_ACCOUNTING",
      completed: { APPROVED_BY: "2026-07-01T00:00:00.000Z" },
    });
    const financePending = parsePaymentApprovalMeta({
      accountingAgentId: "acct-1",
      financeAgentId: "fin-1",
      proceduralStep: "RECEIVED_BY_FINANCE",
      completed: {
        APPROVED_BY: "2026-07-01T00:00:00.000Z",
        RECEIVED_BY_ACCOUNTING: "2026-07-02T00:00:00.000Z",
      },
    });
    assert.equal(accountingPending?.proceduralStep, "APPROVED_BY_ACCOUNTING");
    assert.equal(financePending?.proceduralStep, "APPROVED_BY_FINANCE");
  });
});
