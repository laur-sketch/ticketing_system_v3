/** Sequential approval workflow for Request for Payment. */

import { formatNeedsToBeProceduralLabel } from "@/lib/procedural-status-label";

export const PAYMENT_APPROVAL_STEPS = [
  "PREPARED_BY",
  "NOTED_BY",
  "APPROVED_BY",
  "RECEIVED_BY_ACCOUNTING",
  "RECEIVED_BY_FINANCE",
] as const;

export type PaymentApprovalStep = (typeof PAYMENT_APPROVAL_STEPS)[number];

export type PaymentProceduralStep = PaymentApprovalStep | "DONE";

export type PaymentApprovalAssignees = {
  preparedByAgentId: string | null;
  notedByAgentId: string | null;
  approvedByAgentId: string | null;
  accountingAgentId: string | null;
  financeAgentId: string | null;
};

export type PaymentApprovalMeta = PaymentApprovalAssignees & {
  proceduralStep: PaymentProceduralStep;
  /** ISO timestamps when each step was completed. */
  completed: Partial<Record<PaymentApprovalStep, string>>;
};

export const PAYMENT_APPROVAL_STEP_LABELS: Record<PaymentApprovalStep, string> = {
  PREPARED_BY: "PREPARED BY",
  NOTED_BY: "NOTED BY",
  APPROVED_BY: "APPROVED BY",
  RECEIVED_BY_ACCOUNTING: "RECEIVED BY ACCOUNTING",
  RECEIVED_BY_FINANCE: "RECEIVED BY FINANCE",
};

export const PAYMENT_APPROVAL_FIELD_LABELS: Record<keyof PaymentApprovalAssignees, string> = {
  preparedByAgentId: "Prepared By",
  notedByAgentId: "Noted By",
  approvedByAgentId: "Approved By",
  accountingAgentId: "Received By (Accounting)",
  financeAgentId: "Received By (Finance)",
};

export function defaultPaymentApprovalMeta(): PaymentApprovalMeta {
  return {
    preparedByAgentId: null,
    notedByAgentId: null,
    approvedByAgentId: null,
    accountingAgentId: null,
    financeAgentId: null,
    proceduralStep: "PREPARED_BY",
    completed: {},
  };
}

export function isPaymentApprovalStep(value: unknown): value is PaymentApprovalStep {
  return typeof value === "string" && (PAYMENT_APPROVAL_STEPS as readonly string[]).includes(value);
}

export function parsePaymentApprovalMeta(raw: unknown): PaymentApprovalMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const step =
    o.proceduralStep === "DONE"
      ? "DONE"
      : isPaymentApprovalStep(o.proceduralStep)
        ? o.proceduralStep
        : "PREPARED_BY";
  const completed: PaymentApprovalMeta["completed"] = {};
  if (o.completed && typeof o.completed === "object") {
    for (const key of PAYMENT_APPROVAL_STEPS) {
      const v = (o.completed as Record<string, unknown>)[key];
      if (typeof v === "string" && v.trim()) completed[key] = v.trim();
    }
  }
  return {
    preparedByAgentId: typeof o.preparedByAgentId === "string" ? o.preparedByAgentId : null,
    notedByAgentId: typeof o.notedByAgentId === "string" ? o.notedByAgentId : null,
    approvedByAgentId: typeof o.approvedByAgentId === "string" ? o.approvedByAgentId : null,
    accountingAgentId: typeof o.accountingAgentId === "string" ? o.accountingAgentId : null,
    financeAgentId: typeof o.financeAgentId === "string" ? o.financeAgentId : null,
    proceduralStep: step,
    completed,
  };
}

export function paymentProceduralStatusLabel(
  step: PaymentProceduralStep | null | undefined,
): string | null {
  if (!step || step === "DONE") return null;
  return formatNeedsToBeProceduralLabel(PAYMENT_APPROVAL_STEP_LABELS[step]);
}

export function assigneeFieldForStep(
  step: PaymentApprovalStep,
): keyof PaymentApprovalAssignees {
  switch (step) {
    case "PREPARED_BY":
      return "preparedByAgentId";
    case "NOTED_BY":
      return "notedByAgentId";
    case "APPROVED_BY":
      return "approvedByAgentId";
    case "RECEIVED_BY_ACCOUNTING":
      return "accountingAgentId";
    case "RECEIVED_BY_FINANCE":
      return "financeAgentId";
  }
}

export function assigneeIdForStep(
  meta: PaymentApprovalMeta,
  step: PaymentApprovalStep,
): string | null {
  return meta[assigneeFieldForStep(step)];
}

/** Board assignee who should own the request for the current procedural step (Request Board). */
export function currentPaymentStepBoardAssigneeId(
  meta: PaymentApprovalMeta,
): string | null {
  if (meta.proceduralStep === "DONE") return null;
  return assigneeIdForStep(meta, meta.proceduralStep);
}

/** Agent ids already assigned to any RFP approval role on this request. */
export function paymentApprovalParticipantIds(meta: PaymentApprovalMeta): Set<string> {
  const ids = new Set<string>();
  for (const step of PAYMENT_APPROVAL_STEPS) {
    const id = assigneeIdForStep(meta, step);
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * One person may hold only one approval role on a single Request for Payment.
 * Re-selecting the same person for the same step is allowed.
 */
export function canAssignPaymentApprover(opts: {
  meta: PaymentApprovalMeta;
  agentId: string;
  forStep: PaymentApprovalStep;
}): { ok: true } | { ok: false; error: string } {
  const { meta, agentId, forStep } = opts;
  if (!agentId.trim()) {
    return { ok: false, error: "Select a company user for this approval step." };
  }
  const currentForStep = assigneeIdForStep(meta, forStep);
  if (currentForStep === agentId) return { ok: true };

  for (const step of PAYMENT_APPROVAL_STEPS) {
    if (step === forStep) continue;
    const existing = assigneeIdForStep(meta, step);
    if (existing === agentId) {
      return {
        ok: false,
        error: `This user already has a role on this request (${PAYMENT_APPROVAL_STEP_LABELS[step]}). Each person may only approve once.`,
      };
    }
  }
  return { ok: true };
}

export function nextPaymentApprovalStep(
  step: PaymentProceduralStep,
): PaymentProceduralStep {
  if (step === "DONE") return "DONE";
  const idx = PAYMENT_APPROVAL_STEPS.indexOf(step);
  if (idx < 0) return "PREPARED_BY";
  if (idx >= PAYMENT_APPROVAL_STEPS.length - 1) return "DONE";
  return PAYMENT_APPROVAL_STEPS[idx + 1]!;
}

/** Only the ticket’s Assignment Board assignee may complete the current procedural step. */
export function canCompletePaymentApprovalStep(opts: {
  meta: PaymentApprovalMeta;
  actorAgentId: string | null;
  ticketAssignedAgentId: string | null;
}): { ok: true } | { ok: false; error: string } {
  const { meta, actorAgentId, ticketAssignedAgentId } = opts;
  if (meta.proceduralStep === "DONE") {
    return { ok: false, error: "All payment approval steps are already complete." };
  }
  if (!ticketAssignedAgentId) {
    return {
      ok: false,
      error: "Assign this request on the Assignment Board before completing the approval step.",
    };
  }
  if (!actorAgentId || actorAgentId !== ticketAssignedAgentId) {
    return {
      ok: false,
      error: "Only the assigned personnel can complete this approval step.",
    };
  }
  return { ok: true };
}

export function completePaymentApprovalStep(meta: PaymentApprovalMeta): PaymentApprovalMeta {
  if (meta.proceduralStep === "DONE") return meta;
  const step = meta.proceduralStep;
  return {
    ...meta,
    proceduralStep: nextPaymentApprovalStep(step),
    completed: {
      ...meta.completed,
      [step]: new Date().toISOString(),
    },
  };
}

export function applyPaymentApprovalAssignees(
  meta: PaymentApprovalMeta,
  assignees: Partial<PaymentApprovalAssignees>,
): PaymentApprovalMeta {
  return {
    ...meta,
    preparedByAgentId:
      assignees.preparedByAgentId !== undefined
        ? assignees.preparedByAgentId
        : meta.preparedByAgentId,
    notedByAgentId:
      assignees.notedByAgentId !== undefined ? assignees.notedByAgentId : meta.notedByAgentId,
    approvedByAgentId:
      assignees.approvedByAgentId !== undefined
        ? assignees.approvedByAgentId
        : meta.approvedByAgentId,
    accountingAgentId:
      assignees.accountingAgentId !== undefined
        ? assignees.accountingAgentId
        : meta.accountingAgentId,
    financeAgentId:
      assignees.financeAgentId !== undefined ? assignees.financeAgentId : meta.financeAgentId,
  };
}

/**
 * When an RFP is first assigned while awaiting Prepared By, record the assignee
 * under PREPARED BY and advance to NOTED BY (prepare is fulfilled by that assignment).
 */
export function stampPaymentAssigneeAsPreparedBy(
  meta: PaymentApprovalMeta,
  assigneeAgentId: string,
): PaymentApprovalMeta {
  const withAssignee = applyPaymentApprovalAssignees(meta, {
    preparedByAgentId: assigneeAgentId,
  });
  if (withAssignee.completed.PREPARED_BY) {
    return withAssignee;
  }
  if (withAssignee.proceduralStep !== "PREPARED_BY") {
    return {
      ...withAssignee,
      completed: {
        ...withAssignee.completed,
        PREPARED_BY: withAssignee.completed.PREPARED_BY ?? new Date().toISOString(),
      },
    };
  }
  return {
    ...withAssignee,
    proceduralStep: "NOTED_BY",
    completed: {
      ...withAssignee.completed,
      PREPARED_BY: new Date().toISOString(),
    },
  };
}
