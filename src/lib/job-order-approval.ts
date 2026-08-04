/** Sequential approval workflow for Job Order requests. */

import { formatNeedsToBeProceduralLabel } from "@/lib/procedural-status-label";

/**
 * Active procedural chain (PREPARED BY is intake-only, not a procedural step).
 * Assignees may be chosen from any company.
 */
export const JOB_ORDER_APPROVAL_STEPS = [
  "NOTED_BY",
  "APPROVED_BY",
  "APPROVED_BY_2",
] as const;

export type JobOrderApprovalStep = (typeof JOB_ORDER_APPROVAL_STEPS)[number];

export type JobOrderProceduralStep = JobOrderApprovalStep | "DONE";

export type JobOrderApprovalAssignees = {
  /** Intake “Submitted By” person — not part of the procedural chain. */
  preparedByAgentId: string | null;
  notedByAgentId: string | null;
  approvedByAgentId: string | null;
  /** Second Approved By seat (same display label; General roster). */
  approvedBy2AgentId: string | null;
};

export type JobOrderApprovalMeta = JobOrderApprovalAssignees & {
  proceduralStep: JobOrderProceduralStep;
  /** ISO timestamps when each step was completed. */
  completed: Partial<Record<JobOrderApprovalStep, string>>;
};

export const JOB_ORDER_APPROVAL_STEP_LABELS: Record<JobOrderApprovalStep, string> = {
  NOTED_BY: "NOTED BY",
  APPROVED_BY: "APPROVED BY",
  APPROVED_BY_2: "APPROVED BY",
};

/** Form / ticket-control labels. */
export const JOB_ORDER_APPROVAL_FIELD_LABELS: Record<keyof JobOrderApprovalAssignees, string> = {
  preparedByAgentId: "Submitted By",
  notedByAgentId: "Noted By",
  approvedByAgentId: "Approved By",
  approvedBy2AgentId: "Approved By",
};

const LEGACY_STEP_ALIASES: Record<string, JobOrderProceduralStep> = {
  PREPARED_BY: "NOTED_BY",
};

function normalizeProceduralStep(raw: unknown): JobOrderProceduralStep {
  if (raw === "DONE") return "DONE";
  if (typeof raw !== "string") return "NOTED_BY";
  if (isJobOrderApprovalStep(raw)) return raw;
  return LEGACY_STEP_ALIASES[raw] ?? "NOTED_BY";
}

export function defaultJobOrderApprovalMeta(): JobOrderApprovalMeta {
  return {
    preparedByAgentId: null,
    notedByAgentId: null,
    approvedByAgentId: null,
    approvedBy2AgentId: null,
    proceduralStep: "NOTED_BY",
    completed: {},
  };
}

export function isJobOrderApprovalStep(value: unknown): value is JobOrderApprovalStep {
  return typeof value === "string" && (JOB_ORDER_APPROVAL_STEPS as readonly string[]).includes(value);
}

export function parseJobOrderApprovalMeta(raw: unknown): JobOrderApprovalMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const completed: JobOrderApprovalMeta["completed"] = {};
  if (o.completed && typeof o.completed === "object") {
    for (const key of JOB_ORDER_APPROVAL_STEPS) {
      const v = (o.completed as Record<string, unknown>)[key];
      if (typeof v === "string" && v.trim()) completed[key] = v.trim();
    }
  }
  return {
    preparedByAgentId: typeof o.preparedByAgentId === "string" ? o.preparedByAgentId : null,
    notedByAgentId: typeof o.notedByAgentId === "string" ? o.notedByAgentId : null,
    approvedByAgentId: typeof o.approvedByAgentId === "string" ? o.approvedByAgentId : null,
    approvedBy2AgentId: typeof o.approvedBy2AgentId === "string" ? o.approvedBy2AgentId : null,
    proceduralStep: normalizeProceduralStep(o.proceduralStep),
    completed,
  };
}

export function jobOrderProceduralStatusLabel(
  step: JobOrderProceduralStep | null | undefined,
): string | null {
  if (!step || step === "DONE") return null;
  return formatNeedsToBeProceduralLabel(JOB_ORDER_APPROVAL_STEP_LABELS[step]);
}

/** True when Noted By and both Approved By seats are complete (green-lit). */
export function isJobOrderProcedureGreenLit(
  meta: JobOrderApprovalMeta | null | undefined,
): boolean {
  return meta?.proceduralStep === "DONE";
}

export function jobOrderAssigneeFieldForStep(
  step: JobOrderApprovalStep,
): keyof JobOrderApprovalAssignees {
  switch (step) {
    case "NOTED_BY":
      return "notedByAgentId";
    case "APPROVED_BY":
      return "approvedByAgentId";
    case "APPROVED_BY_2":
      return "approvedBy2AgentId";
  }
}

export function jobOrderAssigneeIdForStep(
  meta: JobOrderApprovalMeta,
  step: JobOrderApprovalStep,
): string | null {
  return meta[jobOrderAssigneeFieldForStep(step)];
}

/** Board assignee who should own the request for the current procedural step. */
export function currentJobOrderStepBoardAssigneeId(meta: JobOrderApprovalMeta): string | null {
  if (meta.proceduralStep === "DONE") return null;
  return jobOrderAssigneeIdForStep(meta, meta.proceduralStep);
}

export function nextJobOrderApprovalStep(step: JobOrderProceduralStep): JobOrderProceduralStep {
  if (step === "DONE") return "DONE";
  const idx = JOB_ORDER_APPROVAL_STEPS.indexOf(step);
  if (idx < 0) return "NOTED_BY";
  if (idx >= JOB_ORDER_APPROVAL_STEPS.length - 1) return "DONE";
  return JOB_ORDER_APPROVAL_STEPS[idx + 1]!;
}

/** Only the ticket’s Assignment Board assignee may complete the current procedural step. */
export function canCompleteJobOrderApprovalStep(opts: {
  meta: JobOrderApprovalMeta;
  actorAgentId: string | null;
  ticketAssignedAgentId: string | null;
}): { ok: true } | { ok: false; error: string } {
  const { meta, actorAgentId, ticketAssignedAgentId } = opts;
  if (meta.proceduralStep === "DONE") {
    return { ok: false, error: "All job order approval steps are already complete." };
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

export function completeJobOrderApprovalStep(meta: JobOrderApprovalMeta): JobOrderApprovalMeta {
  if (meta.proceduralStep === "DONE") return meta;
  const step = meta.proceduralStep;
  return {
    ...meta,
    proceduralStep: nextJobOrderApprovalStep(step),
    completed: {
      ...meta.completed,
      [step]: new Date().toISOString(),
    },
  };
}

export function applyJobOrderApprovalAssignees(
  meta: JobOrderApprovalMeta,
  assignees: Partial<JobOrderApprovalAssignees>,
): JobOrderApprovalMeta {
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
    approvedBy2AgentId:
      assignees.approvedBy2AgentId !== undefined
        ? assignees.approvedBy2AgentId
        : meta.approvedBy2AgentId,
  };
}

/**
 * Stamp the request creator as Prepared By (intake only).
 * Does not advance the procedural chain — that starts at Noted By.
 */
export function stampJobOrderCreatorAsPreparedBy(
  meta: JobOrderApprovalMeta,
  creatorAgentId: string,
): JobOrderApprovalMeta {
  return applyJobOrderApprovalAssignees(meta, {
    preparedByAgentId: creatorAgentId,
  });
}
