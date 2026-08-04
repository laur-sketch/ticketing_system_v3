/** Dynamic sequential approval workflow for Authority to Conduct Activity. */

import { formatNeedsToBeProceduralLabel } from "@/lib/procedural-status-label";
import {
  type AcaApprovingPath,
  type AcaAuthorityResolution,
  type AcaRecommendingLevel,
  ACA_APPROVING_PATH_LABELS,
  ACA_RECOMMENDING_LABELS,
  approvingSeatCountForPath,
} from "@/lib/aca-authority-matrix";

export type AcaApprovalLevel = {
  key: string;
  label: string;
  roleCode: string;
  agentId: string | null;
  optional?: boolean;
  approvedAt?: string | null;
  comment?: string | null;
};

export type AcaApprovalMeta = {
  proceduralStep: string;
  levels: AcaApprovalLevel[];
  matrixSnapshot: AcaAuthorityResolution;
  relatedTicketIds?: string[];
  implementationDate?: string | null;
  estimatedCost?: string | null;
  budgetAmount?: string | null;
  departmentStore?: string | null;
  category?: string | null;
  natureOfRequest?: string | null;
  formCode?: string | null;
  submittedByName?: string | null;
  description?: string | null;
  objective?: string | null;
};

export function isAcaProcedureGreenLit(meta: AcaApprovalMeta | null | undefined): boolean {
  return meta?.proceduralStep === "DONE";
}

export function acaProceduralStatusLabel(meta: AcaApprovalMeta | null | undefined): string | null {
  if (!meta || meta.proceduralStep === "DONE") return null;
  const level = meta.levels.find((l) => l.key === meta.proceduralStep);
  const label = level?.label ?? meta.proceduralStep;
  return formatNeedsToBeProceduralLabel(label);
}

export function currentAcaLevel(meta: AcaApprovalMeta): AcaApprovalLevel | null {
  if (meta.proceduralStep === "DONE") return null;
  return meta.levels.find((l) => l.key === meta.proceduralStep) ?? null;
}

export function currentAcaBoardAssigneeId(meta: AcaApprovalMeta): string | null {
  return currentAcaLevel(meta)?.agentId ?? null;
}

/** AP 4 / 4 ExeComs / All ExeCom must leave feedback before marking Done. */
export function acaLevelRequiresFeedback(roleCode: string | null | undefined): boolean {
  return roleCode === "AP_4" || roleCode === "FOUR_EXECOMS" || roleCode === "ALL_EXECOM";
}

/** ExeCom table seats: AP 4, 4 ExeComs, All ExeCom. */
export function acaLevelShowsInExeComTable(roleCode: string | null | undefined): boolean {
  return acaLevelRequiresFeedback(roleCode);
}

/**
 * Horizontal procedural row: Recommended By, Validated By (Finance), and AP 1–3.
 * AP 4 / 4 ExeComs / All ExeCom never appear here — they use the ExeCom table.
 * (Submitted By is shown in the ticket header, not here.)
 */
export function acaLevelShowsInHorizontalApproval(
  roleCode: string | null | undefined,
  key?: string | null,
): boolean {
  if (key === "SUBMITTED_BY") return false;
  if (acaLevelShowsInExeComTable(roleCode)) return false;
  if (key === "RECOMMENDED_BY" || key === "FINANCE_MANAGER") return true;
  if (!roleCode) return false;
  if (roleCode === "AP_1" || roleCode === "AP_2" || roleCode === "AP_3") return true;
  if (roleCode === "FINANCE" || roleCode === "EXECOM") return true;
  if (roleCode.startsWith("RA_")) return true;
  return false;
}

/** Short labels for the procedural horizontal row. */
export function acaHorizontalApprovalLabel(level: Pick<AcaApprovalLevel, "key" | "label">): string {
  if (level.key === "RECOMMENDED_BY") {
    const detail = level.label.replace(/^RECOMMENDED BY\s*/i, "").trim();
    return detail ? `Recommended By: ${detail}` : "Recommended By:";
  }
  if (level.key === "FINANCE_MANAGER") return "Validated By: Finance Manager";
  return level.label;
}

export function acaApprovalParticipantIds(meta: AcaApprovalMeta): Set<string> {
  const ids = new Set<string>();
  for (const level of meta.levels) {
    if (level.agentId) ids.add(level.agentId);
  }
  return ids;
}

/** Agent ids listed on AP 4 / 4 ExeComs / All ExeCom approving seats. */
export function acaExeComSeatAgentIds(meta: AcaApprovalMeta): Set<string> {
  const ids = new Set<string>();
  for (const level of meta.levels) {
    if (acaLevelShowsInExeComTable(level.roleCode) && level.agentId) {
      ids.add(level.agentId);
    }
  }
  return ids;
}

/**
 * Who should see this ACA on their request board: the current procedural assignee,
 * plus every listed AP 4 / 4 ExeComs / All ExeCom seat holder.
 */
export function acaBoardVisibleAgentIds(meta: AcaApprovalMeta): Set<string> {
  const ids = new Set<string>(acaExeComSeatAgentIds(meta));
  const current = currentAcaBoardAssigneeId(meta);
  if (current) ids.add(current);
  return ids;
}

export function isAcaBoardVisibleToAgent(
  meta: AcaApprovalMeta | null | undefined,
  agentId: string | null | undefined,
): boolean {
  if (!meta || !agentId) return false;
  return acaBoardVisibleAgentIds(meta).has(agentId);
}

export function buildAcaApprovalLevels(opts: {
  resolution: AcaAuthorityResolution;
  submittedByAgentId: string | null;
  recommendedByAgentId: string;
  financeManagerAgentId: string;
  approvingAgentIds: string[];
}): AcaApprovalLevel[] {
  const { resolution, submittedByAgentId, recommendedByAgentId, financeManagerAgentId, approvingAgentIds } =
    opts;
  const ra = resolution.recommendingLevel ?? "RA_1";
  const path = resolution.approvingPath ?? "AP_1";
  const seatCount = Math.max(1, resolution.approvingSeatCount || approvingSeatCountForPath(path));
  const levels: AcaApprovalLevel[] = [
    {
      key: "SUBMITTED_BY",
      label: "SUBMITTED BY",
      roleCode: "SUBMITTER",
      agentId: submittedByAgentId,
      approvedAt: new Date().toISOString(),
    },
    {
      key: "RECOMMENDED_BY",
      label: `RECOMMENDED BY (${ACA_RECOMMENDING_LABELS[ra as AcaRecommendingLevel] ?? ra})`,
      roleCode: ra,
      agentId: recommendedByAgentId,
    },
    {
      key: "FINANCE_MANAGER",
      label: "VALIDATED BY FINANCE MANAGER",
      roleCode: "FINANCE",
      agentId: financeManagerAgentId,
    },
  ];

  const pathLabel = ACA_APPROVING_PATH_LABELS[path as AcaApprovingPath] ?? path;
  for (let i = 0; i < seatCount; i++) {
    levels.push({
      key: `APPROVER_${i + 1}`,
      label: seatCount > 1 ? `${pathLabel} · Seat ${i + 1}` : pathLabel,
      roleCode: path,
      agentId: approvingAgentIds[i] ?? null,
    });
  }
  return levels;
}

export function defaultAcaApprovalMeta(opts: {
  resolution: AcaAuthorityResolution;
  submittedByAgentId: string | null;
  recommendedByAgentId: string;
  financeManagerAgentId: string;
  approvingAgentIds: string[];
  fields?: Partial<
    Pick<
      AcaApprovalMeta,
      | "implementationDate"
      | "estimatedCost"
      | "budgetAmount"
      | "departmentStore"
      | "category"
      | "natureOfRequest"
      | "formCode"
      | "submittedByName"
      | "description"
      | "objective"
      | "relatedTicketIds"
    >
  >;
}): AcaApprovalMeta {
  const levels = buildAcaApprovalLevels(opts);
  const firstOpen = levels.find((l) => !l.approvedAt) ?? levels[0]!;
  return {
    proceduralStep: firstOpen.key,
    levels,
    matrixSnapshot: opts.resolution,
    ...opts.fields,
  };
}

export function parseAcaApprovalMeta(raw: unknown): AcaApprovalMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.levels)) return null;
  const levels: AcaApprovalLevel[] = [];
  for (const item of o.levels) {
    if (!item || typeof item !== "object") continue;
    const l = item as Record<string, unknown>;
    if (typeof l.key !== "string" || typeof l.label !== "string" || typeof l.roleCode !== "string") {
      continue;
    }
    levels.push({
      key: l.key,
      label: l.label,
      roleCode: l.roleCode,
      agentId: typeof l.agentId === "string" ? l.agentId : null,
      optional: Boolean(l.optional),
      approvedAt: typeof l.approvedAt === "string" ? l.approvedAt : null,
      comment: typeof l.comment === "string" ? l.comment : null,
    });
  }
  if (levels.length === 0) return null;
  const proceduralStep =
    typeof o.proceduralStep === "string" && o.proceduralStep.trim()
      ? o.proceduralStep.trim()
      : levels.find((l) => !l.approvedAt)?.key ?? "DONE";

  const matrixSnapshot =
    o.matrixSnapshot && typeof o.matrixSnapshot === "object"
      ? (o.matrixSnapshot as AcaAuthorityResolution)
      : ({
          ok: true,
          requiresAca: true,
          category: "",
          natureOfRequest: "",
          estimatedCost: 0,
          recommendingLevel: null,
          recommendingLabel: null,
          approvingPath: null,
          approvingLabel: null,
          approvingSeatCount: 0,
          guidance: "",
          remarks: null,
          error: null,
        } satisfies AcaAuthorityResolution);

  const relatedTicketIds = Array.isArray(o.relatedTicketIds)
    ? o.relatedTicketIds.filter((x): x is string => typeof x === "string")
    : typeof o.relatedTicketIds === "string"
      ? o.relatedTicketIds
          .split(/[,;\s]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

  return {
    proceduralStep,
    levels,
    matrixSnapshot,
    relatedTicketIds,
    implementationDate: typeof o.implementationDate === "string" ? o.implementationDate : null,
    estimatedCost: typeof o.estimatedCost === "string" ? o.estimatedCost : null,
    budgetAmount: typeof o.budgetAmount === "string" ? o.budgetAmount : null,
    departmentStore: typeof o.departmentStore === "string" ? o.departmentStore : null,
    category: typeof o.category === "string" ? o.category : null,
    natureOfRequest: typeof o.natureOfRequest === "string" ? o.natureOfRequest : null,
    formCode: typeof o.formCode === "string" ? o.formCode : null,
    submittedByName: typeof o.submittedByName === "string" ? o.submittedByName : null,
    description: typeof o.description === "string" ? o.description : null,
    objective: typeof o.objective === "string" ? o.objective : null,
  };
}

export function canCompleteAcaApprovalStep(opts: {
  meta: AcaApprovalMeta;
  actorAgentId: string | null;
  ticketAssignedAgentId: string | null;
}): { ok: true } | { ok: false; error: string } {
  const { meta, actorAgentId, ticketAssignedAgentId } = opts;
  if (meta.proceduralStep === "DONE") {
    return { ok: false, error: "All ACA approval steps are already complete." };
  }
  if (!ticketAssignedAgentId) {
    return { ok: false, error: "Assign this request before completing the approval step." };
  }
  if (!actorAgentId || actorAgentId !== ticketAssignedAgentId) {
    return { ok: false, error: "Only the assigned personnel can complete this approval step." };
  }
  const level = currentAcaLevel(meta);
  if (!level) {
    return { ok: false, error: "No current ACA approval step." };
  }
  if (level.agentId && level.agentId !== actorAgentId) {
    return {
      ok: false,
      error: `Only the ${level.label} assignee can complete this step.`,
    };
  }
  return { ok: true };
}

export function completeAcaApprovalStep(
  meta: AcaApprovalMeta,
  opts?: { comment?: string | null },
): AcaApprovalMeta {
  if (meta.proceduralStep === "DONE") return meta;
  const idx = meta.levels.findIndex((l) => l.key === meta.proceduralStep);
  if (idx < 0) return meta;
  const levels = meta.levels.map((l, i) => {
    if (i !== idx) return l;
    return {
      ...l,
      approvedAt: new Date().toISOString(),
      comment: opts?.comment?.trim() || l.comment || null,
    };
  });
  const next = levels.slice(idx + 1).find((l) => !l.approvedAt);
  return {
    ...meta,
    levels,
    proceduralStep: next?.key ?? "DONE",
  };
}
