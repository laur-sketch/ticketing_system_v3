import { describe, expect, it } from "vitest";
import {
  defaultPaymentApprovalMeta,
  nextPaymentApprovalStep,
  parsePaymentApprovalMeta,
  paymentProceduralStatusLabel,
  stampPaymentAssigneeAsPreparedBy,
  assigneeFieldForStep,
  PAYMENT_APPROVAL_STEPS,
} from "@/lib/request-for-payment-approval";
import {
  applyRequisitionPricingDerivedFields,
  computeRequisitionPriceQuotation,
  sumRequisitionListedItemsTotal,
} from "@/lib/item-requisition";

describe("RFP PREPARED BY approval chain", () => {
  it("starts at PREPARED_BY and advances through the full chain", () => {
    expect(PAYMENT_APPROVAL_STEPS[0]).toBe("PREPARED_BY");
    expect(defaultPaymentApprovalMeta().proceduralStep).toBe("PREPARED_BY");
    expect(paymentProceduralStatusLabel("PREPARED_BY")).toBe("PREPARED BY IS MISSING");
    expect(assigneeFieldForStep("PREPARED_BY")).toBe("preparedByAgentId");

    let step = defaultPaymentApprovalMeta().proceduralStep;
    const expected = [
      "NOTED_BY",
      "APPROVED_BY",
      "RECEIVED_BY_ACCOUNTING",
      "RECEIVED_BY_FINANCE",
      "DONE",
    ] as const;
    for (const next of expected) {
      step = nextPaymentApprovalStep(step);
      expect(step).toBe(next);
    }
  });

  it("stamps Prepared By on first assignment and advances to NOTED_BY", () => {
    const stamped = stampPaymentAssigneeAsPreparedBy(defaultPaymentApprovalMeta(), "agent-1");
    expect(stamped.preparedByAgentId).toBe("agent-1");
    expect(stamped.proceduralStep).toBe("NOTED_BY");
    expect(stamped.completed.PREPARED_BY).toBeTruthy();
  });

  it("parses legacy meta without preparedByAgentId", () => {
    const parsed = parsePaymentApprovalMeta({
      notedByAgentId: "n1",
      approvedByAgentId: null,
      accountingAgentId: null,
      financeAgentId: null,
      proceduralStep: "NOTED_BY",
      completed: {},
    });
    expect(parsed?.preparedByAgentId).toBeNull();
    expect(parsed?.proceduralStep).toBe("NOTED_BY");
  });
});

describe("IRS price quotation formula", () => {
  it("computes PRICE QUOTATION = QUANTITY × UNIT PRICE", () => {
    expect(
      computeRequisitionPriceQuotation({
        quantity: "3",
        unitPrice: "25.50",
        priceQuotation: "",
        total: "",
      }),
    ).toBe("76.50");
  });

  it("applies derived fields and sums Grand Total from quotations", () => {
    const a = applyRequisitionPricingDerivedFields({
      itemNumber: "1",
      quantity: "2",
      unit: "pcs",
      particular: "Widget",
      unitPrice: "10",
    });
    const b = applyRequisitionPricingDerivedFields({
      itemNumber: "2",
      quantity: "4",
      unit: "pcs",
      particular: "Bolt",
      unitPrice: "2.5",
    });
    expect(a.priceQuotation).toBe("20.00");
    expect(b.priceQuotation).toBe("10.00");
    expect(sumRequisitionListedItemsTotal([a, b])).toBe("30.00");
  });
});
