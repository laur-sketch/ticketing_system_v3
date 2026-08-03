import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  canAssignPaymentApprover,
  defaultPaymentApprovalMeta,
  applyPaymentApprovalAssignees,
  completePaymentApprovalStep,
} from "../../src/lib/request-for-payment-approval";

describe("RFP one-person-one-approval", () => {
  it("rejects assigning a prior role holder to a later step", () => {
    let meta = defaultPaymentApprovalMeta();
    meta = applyPaymentApprovalAssignees(meta, { notedByAgentId: "a1" });
    meta = completePaymentApprovalStep(meta);
    const gate = canAssignPaymentApprover({
      meta,
      agentId: "a1",
      forStep: "APPROVED_BY",
    });
    assert.equal(gate.ok, false);
    if (!gate.ok) {
      assert.match(gate.error, /only approve once/i);
    }
  });

  it("allows a new person for the next step", () => {
    let meta = defaultPaymentApprovalMeta();
    meta = applyPaymentApprovalAssignees(meta, { notedByAgentId: "a1" });
    meta = completePaymentApprovalStep(meta);
    const gate = canAssignPaymentApprover({
      meta,
      agentId: "a2",
      forStep: "APPROVED_BY",
    });
    assert.equal(gate.ok, true);
  });

  it("allows re-selecting the same person for the same step", () => {
    let meta = defaultPaymentApprovalMeta();
    meta = applyPaymentApprovalAssignees(meta, { notedByAgentId: "a2" });
    meta = { ...meta, proceduralStep: "NOTED_BY" };
    const gate = canAssignPaymentApprover({
      meta,
      agentId: "a2",
      forStep: "NOTED_BY",
    });
    assert.equal(gate.ok, true);
  });

  it("does not treat Prepared By as a procedural uniqueness conflict", () => {
    let meta = defaultPaymentApprovalMeta();
    meta = applyPaymentApprovalAssignees(meta, {
      preparedByAgentId: "a1",
      notedByAgentId: null,
    });
    const gate = canAssignPaymentApprover({
      meta,
      agentId: "a1",
      forStep: "NOTED_BY",
    });
    assert.equal(gate.ok, true);
  });
});
