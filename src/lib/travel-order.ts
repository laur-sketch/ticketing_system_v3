import { point } from "@turf/helpers";
import type { TaskScreenshotMetaItem } from "@/lib/task-screenshot-meta";

export type TravelOrderAttachment = TaskScreenshotMetaItem;

/** Client/server DTO for one travel-order location pin. */
export type TravelOrderLocationDraft = {
  /** Client temp id before persist (optional after save). */
  clientKey: string;
  id?: string;
  label: string;
  latitude: number | null;
  longitude: number | null;
  remarks: string;
  /** Pending File objects chosen in the form (not yet uploaded). */
  pendingFiles?: File[];
  /** Already-stored attachment meta from the server. */
  attachments: TaskScreenshotMetaItem[];
};

/** Create-time draft for one sequential approval level (single assignee). */
export type TravelOrderApprovalLevelDraft = {
  level: number;
  agentId: string;
  /**
   * When true (only allowed with 3+ levels), approving this level completes the
   * whole hierarchy early. Optional levels also do not block later required levels.
   */
  optional?: boolean;
};

export type TravelOrderDraft = {
  orderRequest: string;
  /** Flat designated approvers (used when approvalLevels is empty). */
  approvedByAgentIds: string[];
  /** Hierarchical chain; empty = flat multi-approver mode. */
  approvalLevels: TravelOrderApprovalLevelDraft[];
  confirmationByAgentId: string;
  /** Co-travelers in addition to the creator (creator is always included server-side). */
  additionalTravelerAgentIds: string[];
  /** Selected vehicle option value. */
  vehicle: string;
  locations: TravelOrderLocationDraft[];
};

/** Preset vehicle choices for Travel Order requests. */
export const TRAVEL_ORDER_VEHICLE_OPTIONS = [
  { value: "COMPANY_VAN", label: "Company van" },
  { value: "COMPANY_CAR", label: "Company car" },
  { value: "SERVICE_VEHICLE", label: "Service vehicle" },
  { value: "MOTORCYCLE", label: "Motorcycle" },
  { value: "PERSONAL_VEHICLE", label: "Personal vehicle" },
  { value: "RENTAL", label: "Rental vehicle" },
  { value: "PUBLIC_TRANSPORT", label: "Public transport" },
  { value: "OTHER", label: "Other" },
] as const;

export type TravelOrderVehicleValue = (typeof TRAVEL_ORDER_VEHICLE_OPTIONS)[number]["value"];

export function travelOrderVehicleLabel(value: string | null | undefined): string {
  if (!value?.trim()) return "—";
  const found = TRAVEL_ORDER_VEHICLE_OPTIONS.find((o) => o.value === value.trim());
  return found?.label ?? value.trim();
}

export function isValidTravelOrderVehicle(value: string): value is TravelOrderVehicleValue {
  return TRAVEL_ORDER_VEHICLE_OPTIONS.some((o) => o.value === value);
}

export type TravelOrderAgentRef = { id: string; name: string; email: string };

/** Persisted / API approval level with status. */
export type TravelOrderApprovalLevelDto = {
  level: number;
  agentId: string | null;
  agent: TravelOrderAgentRef | null;
  approvedAt: string | null;
  approvedByAgentId: string | null;
  approvedByAgent: TravelOrderAgentRef | null;
  /** Optional levels can early-complete the chain and do not block later required levels. */
  optional?: boolean;
};

export type TravelOrderLocationDto = {
  id: string;
  label: string;
  /** @deprecated Prefer endedLatitude / endedLongitude — kept for map/legacy. */
  latitude: number | null;
  longitude: number | null;
  /** @deprecated Prefer endedAt — kept for KPI/legacy. */
  checkedAt: string | null;
  startedAt: string | null;
  startedLatitude: number | null;
  startedLongitude: number | null;
  endedAt: string | null;
  endedLatitude: number | null;
  endedLongitude: number | null;
  remarks: string | null;
  attachments: TaskScreenshotMetaItem[];
  sortOrder: number;
};

export type TravelOrderLocationVisitStatus = "pending" | "in_progress" | "completed";

export function travelOrderLocationVisitStatus(
  loc: Pick<
    TravelOrderLocationDto,
    "startedAt" | "endedAt" | "checkedAt"
  >,
): TravelOrderLocationVisitStatus {
  if (loc.endedAt || loc.checkedAt) return "completed";
  if (loc.startedAt) return "in_progress";
  return "pending";
}

export function travelOrderLocationVisitStatusLabel(
  status: TravelOrderLocationVisitStatus,
): string {
  if (status === "completed") return "Completed";
  if (status === "in_progress") return "In Progress";
  return "Not started";
}

export type TravelOrderDto = {
  id: string;
  kpiMaintenanceId: string;
  orderRequest: string;
  status: string;
  /** Primary/first approver (legacy). */
  approvedByAgentId: string | null;
  approvedByAgent: TravelOrderAgentRef | null;
  /** All designated approvers. */
  approvedByAgentIds: string[];
  approvedByAgents: TravelOrderAgentRef[];
  /** Ordered hierarchical approval chain (empty = flat mode). */
  approvalLevels: TravelOrderApprovalLevelDto[];
  confirmationByAgentId: string | null;
  confirmationByAgent: TravelOrderAgentRef | null;
  createdByAgentId?: string | null;
  createdByAgent?: TravelOrderAgentRef | null;
  companyTeamId?: string | null;
  travelerAgentIds?: string[];
  travelers?: TravelOrderAgentRef[];
  /** Selected vehicle option value (e.g. COMPANY_VAN). */
  vehicle?: string | null;
  /** Why the order was declined (when status is REJECTED). */
  rejectionReason?: string | null;
  rejectedByAgentId?: string | null;
  rejectedByAgent?: TravelOrderAgentRef | null;
  rejectedAt?: string | null;
  /** Approval level that declined; null when declined at confirmation. */
  rejectedAtLevel?: number | null;
  /** Recorded Field Assignment KPI % after Submit as Done; null until submitted. */
  kpiPercent: number | null;
  kpiSubmittedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  locations: TravelOrderLocationDto[];
  kpiTitle?: string | null;
  kpiMainTask?: string | null;
};

export const TRAVEL_ORDER_STATUS = {
  SUBMITTED: "SUBMITTED",
  APPROVED: "APPROVED",
  CONFIRMED: "CONFIRMED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
} as const;

export function isTravelOrderApproved(status: string): boolean {
  return status === TRAVEL_ORDER_STATUS.APPROVED || status === TRAVEL_ORDER_STATUS.CONFIRMED;
}

export function isTravelOrderRunning(status: string): boolean {
  return status === TRAVEL_ORDER_STATUS.APPROVED;
}

export function emptyTravelLocation(partial?: Partial<TravelOrderLocationDraft>): TravelOrderLocationDraft {
  return {
    clientKey: partial?.clientKey ?? crypto.randomUUID(),
    id: partial?.id,
    label: partial?.label ?? "",
    latitude: partial?.latitude ?? null,
    longitude: partial?.longitude ?? null,
    remarks: partial?.remarks ?? "",
    pendingFiles: partial?.pendingFiles ?? [],
    attachments: partial?.attachments ?? [],
  };
}

export function emptyTravelOrderDraft(): TravelOrderDraft {
  return {
    orderRequest: "",
    approvedByAgentIds: [],
    approvalLevels: [],
    confirmationByAgentId: "",
    additionalTravelerAgentIds: [],
    vehicle: "",
    locations: [emptyTravelLocation()],
  };
}

export function buildEmptyApprovalLevels(count: number): TravelOrderApprovalLevelDraft[] {
  const n = Math.max(0, Math.min(20, Math.floor(count)));
  return Array.from({ length: n }, (_, i) => ({
    level: i + 1,
    agentId: "",
    optional: false,
  }));
}

/** Optional levels are only configurable when the chain has 3+ steps. */
export function approvalLevelsAllowOptional(levelCount: number): boolean {
  return levelCount >= 3;
}

export function isValidLatLng(lat: unknown, lng: unknown): lat is number {
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return false;
  }
  // Turf point construction validates GeoJSON position shape.
  try {
    point([lng, lat]);
    return true;
  } catch {
    return false;
  }
}

export function validateTravelOrderDraft(draft: TravelOrderDraft): string | null {
  if (!draft.orderRequest.trim()) {
    return "Order request details are required.";
  }
  if (draft.locations.length === 0) {
    return "Add at least one location.";
  }
  for (let i = 0; i < draft.locations.length; i++) {
    const loc = draft.locations[i]!;
    if (!loc.label.trim()) {
      return `Location ${i + 1}: enter a location name or address.`;
    }
  }
  if (draft.approvalLevels.length > 0) {
    for (const lvl of draft.approvalLevels) {
      if (!lvl.agentId.trim()) {
        return `Assign an approver for Level ${lvl.level}.`;
      }
    }
  } else if (draft.approvedByAgentIds.length === 0) {
    return "Select at least one person who will approve this travel order.";
  }
  if (!draft.confirmationByAgentId.trim()) {
    return "Select who will confirm this travel order.";
  }
  if (!draft.vehicle.trim()) {
    return "Select a vehicle for this travel order.";
  }
  return null;
}

export function parseApprovedByAgentIds(raw: unknown, fallbackId?: string | null): string[] {
  const out: string[] = [];
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (typeof row === "string" && row.trim()) out.push(row.trim());
    }
  }
  if (out.length === 0 && typeof fallbackId === "string" && fallbackId.trim()) {
    out.push(fallbackId.trim());
  }
  return [...new Set(out)];
}

export function parseTravelerAgentIds(
  raw: unknown,
  creatorAgentId?: string | null,
): string[] {
  const out = parseApprovedByAgentIds(raw);
  if (typeof creatorAgentId === "string" && creatorAgentId.trim()) {
    out.unshift(creatorAgentId.trim());
  }
  return [...new Set(out)];
}

/** Build traveler list: creator first, then additional co-travelers. */
export function normalizeTravelerAgentIds(input: {
  createdByAgentId: string;
  additionalTravelerAgentIds?: string[];
}): string[] {
  const creator = input.createdByAgentId.trim();
  const extra = (input.additionalTravelerAgentIds ?? [])
    .map((id) => id.trim())
    .filter((id) => id && id !== creator);
  return [...new Set([creator, ...extra].filter(Boolean))];
}

/** Stored JSON row before agent hydration. */
export type TravelOrderApprovalLevelStored = {
  level: number;
  agentId: string | null;
  approvedAt: string | null;
  approvedByAgentId: string | null;
  optional?: boolean;
};

type ApprovalLevelLike = {
  level: number;
  agentId?: string | null;
  approvedAt?: string | null;
  approvedByAgentId?: string | null;
  optional?: boolean;
};

export function isApprovalLevelOptional(level: ApprovalLevelLike | null | undefined): boolean {
  return Boolean(level?.optional);
}

export function parseApprovalLevels(raw: unknown): TravelOrderApprovalLevelStored[] {
  if (!Array.isArray(raw)) return [];
  const out: TravelOrderApprovalLevelStored[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const level =
      typeof r.level === "number" && Number.isFinite(r.level) ? Math.floor(r.level) : NaN;
    if (!Number.isFinite(level) || level < 1) continue;
    const agentId =
      typeof r.agentId === "string" && r.agentId.trim() ? r.agentId.trim() : null;
    const approvedByAgentId =
      typeof r.approvedByAgentId === "string" && r.approvedByAgentId.trim()
        ? r.approvedByAgentId.trim()
        : null;
    const approvedAt =
      typeof r.approvedAt === "string" && r.approvedAt.trim() ? r.approvedAt.trim() : null;
    const optional = r.optional === true;
    out.push({ level, agentId, approvedAt, approvedByAgentId, optional });
  }
  return out.sort((a, b) => a.level - b.level);
}

export function normalizeApprovalLevelsForStore(
  levels: Array<{ level?: number; agentId?: string | null; optional?: boolean }>,
): TravelOrderApprovalLevelStored[] {
  const normalized = levels
    .map((row, index) => ({
      level:
        typeof row.level === "number" && Number.isFinite(row.level)
          ? Math.floor(row.level)
          : index + 1,
      agentId: typeof row.agentId === "string" && row.agentId.trim() ? row.agentId.trim() : null,
      approvedAt: null as string | null,
      approvedByAgentId: null as string | null,
      optional: row.optional === true,
    }))
    .filter((row) => row.level >= 1)
    .sort((a, b) => a.level - b.level);
  const allowOptional = approvalLevelsAllowOptional(normalized.length);
  return normalized.map((row) => ({
    ...row,
    optional: allowOptional && row.optional,
  }));
}

export function agentIdsFromApprovalLevels(
  levels: Array<{ agentId?: string | null }>,
): string[] {
  return [
    ...new Set(
      levels
        .map((l) => (typeof l.agentId === "string" ? l.agentId.trim() : ""))
        .filter(Boolean),
    ),
  ];
}

export function hasHierarchicalApprovals(
  levels: Array<{ level?: number }> | null | undefined,
): boolean {
  return Array.isArray(levels) && levels.length > 0;
}

function sortApprovalLevels<T extends ApprovalLevelLike>(levels: T[]): T[] {
  return [...levels].sort((a, b) => a.level - b.level);
}

/**
 * A level is unlocked when every *required* level before it is approved.
 * Optional levels ahead of it do not block.
 */
export function isApprovalLevelUnlocked(
  levels: ApprovalLevelLike[],
  levelNumber: number,
): boolean {
  const sorted = sortApprovalLevels(levels);
  const target = sorted.find((l) => l.level === levelNumber);
  if (!target) return false;
  return sorted
    .filter((l) => l.level < levelNumber && !isApprovalLevelOptional(l))
    .every((l) => Boolean(l.approvedAt));
}

/** Incomplete levels the workflow is currently waiting on (may be more than one). */
export function getUnlockedIncompleteLevels<T extends ApprovalLevelLike>(levels: T[]): T[] {
  if (!levels.length) return [];
  if (isApprovalHierarchySatisfied(levels)) return [];
  return sortApprovalLevels(levels).filter(
    (l) => !l.approvedAt && isApprovalLevelUnlocked(levels, l.level),
  );
}

/** First unlocked incomplete level (for "waiting on Level N" labels). */
export function getCurrentApprovalLevel(
  levels: TravelOrderApprovalLevelStored[] | TravelOrderApprovalLevelDto[],
): TravelOrderApprovalLevelStored | TravelOrderApprovalLevelDto | null {
  const unlocked = getUnlockedIncompleteLevels(levels);
  return unlocked[0] ?? null;
}

/**
 * Hierarchy is complete when:
 * - any optional level has approved (early complete), or
 * - every required level has approved (optional leftovers may be skipped).
 * If every level is optional, at least one approval is required.
 */
export function isApprovalHierarchySatisfied(
  levels: TravelOrderApprovalLevelStored[] | TravelOrderApprovalLevelDto[],
): boolean {
  if (levels.length === 0) return false;
  const sorted = sortApprovalLevels(levels);
  if (sorted.some((l) => isApprovalLevelOptional(l) && Boolean(l.approvedAt))) {
    return true;
  }
  const required = sorted.filter((l) => !isApprovalLevelOptional(l));
  if (required.length === 0) {
    return sorted.some((l) => Boolean(l.approvedAt));
  }
  return required.every((l) => Boolean(l.approvedAt));
}

/** @deprecated Prefer isApprovalHierarchySatisfied — kept for call sites. */
export function allApprovalLevelsComplete(
  levels: TravelOrderApprovalLevelStored[] | TravelOrderApprovalLevelDto[],
): boolean {
  return isApprovalHierarchySatisfied(levels);
}

/** Level the operator should act on (their unlocked incomplete assignment, else current). */
export function getOperatorActionableApprovalLevel(
  levels: TravelOrderApprovalLevelStored[] | TravelOrderApprovalLevelDto[],
  operatorAgentId: string | null | undefined,
  opts?: { canAssignWork?: boolean },
): TravelOrderApprovalLevelStored | TravelOrderApprovalLevelDto | null {
  const unlocked = getUnlockedIncompleteLevels(levels);
  if (!unlocked.length) return null;
  if (operatorAgentId) {
    const mine = unlocked.find((l) => l.agentId === operatorAgentId);
    if (mine) return mine;
  }
  if (opts?.canAssignWork) return unlocked[0] ?? null;
  return null;
}

export function isDesignatedApprover(
  operatorAgentId: string | null | undefined,
  order: {
    approvedByAgentId?: string | null;
    approvedByAgentIds?: string[] | null;
    approvalLevels?: Array<{ agentId?: string | null }> | null;
  },
): boolean {
  if (!operatorAgentId) return false;
  if (hasHierarchicalApprovals(order.approvalLevels)) {
    return (order.approvalLevels ?? []).some(
      (l) => typeof l.agentId === "string" && l.agentId === operatorAgentId,
    );
  }
  const ids = parseApprovedByAgentIds(order.approvedByAgentIds, order.approvedByAgentId);
  return ids.includes(operatorAgentId);
}

/** Whether the operator may approve an unlocked pending level (or flat approve). */
export function canApproveTravelOrderNow(
  operatorAgentId: string | null | undefined,
  order: {
    status?: string;
    approvedByAgentId?: string | null;
    approvedByAgentIds?: string[] | null;
    approvalLevels?: TravelOrderApprovalLevelStored[] | TravelOrderApprovalLevelDto[] | null;
  },
  opts?: { canAssignWork?: boolean },
): boolean {
  if (order.status !== TRAVEL_ORDER_STATUS.SUBMITTED) return false;
  if (opts?.canAssignWork) return true;
  if (!operatorAgentId) return false;
  const levels = order.approvalLevels ?? [];
  if (hasHierarchicalApprovals(levels)) {
    return getOperatorActionableApprovalLevel(levels, operatorAgentId) != null;
  }
  return isDesignatedApprover(operatorAgentId, order);
}

/** Current-level approver (or admin) may reject a submitted travel order. */
export function canRejectTravelOrderNow(
  operatorAgentId: string | null | undefined,
  order: {
    status?: string;
    approvedByAgentId?: string | null;
    approvedByAgentIds?: string[] | null;
    approvalLevels?: TravelOrderApprovalLevelStored[] | TravelOrderApprovalLevelDto[] | null;
  },
  opts?: { canAssignWork?: boolean },
): boolean {
  return canApproveTravelOrderNow(operatorAgentId, order, opts);
}

/** Designated confirmer (or admin) may confirm or decline confirmation on a running order. */
export function canConfirmTravelOrderNow(
  operatorAgentId: string | null | undefined,
  order: {
    status?: string;
    confirmationByAgentId?: string | null;
  },
  opts?: { canAssignWork?: boolean },
): boolean {
  if (order.status !== TRAVEL_ORDER_STATUS.APPROVED) return false;
  if (!order.confirmationByAgentId) return false;
  if (opts?.canAssignWork) return true;
  return Boolean(operatorAgentId && operatorAgentId === order.confirmationByAgentId);
}

/** Creator may cancel before the order is confirmed, rejected, or already cancelled. */
export function canCancelTravelOrderNow(
  operatorAgentId: string | null | undefined,
  order: {
    status?: string;
    createdByAgentId?: string | null;
  },
): boolean {
  if (!operatorAgentId || !order.createdByAgentId) return false;
  if (operatorAgentId !== order.createdByAgentId) return false;
  return (
    order.status === TRAVEL_ORDER_STATUS.SUBMITTED ||
    order.status === TRAVEL_ORDER_STATUS.APPROVED
  );
}

export function parseTravelOrderAttachments(raw: unknown): TaskScreenshotMetaItem[] {
  if (!Array.isArray(raw)) return [];
  const out: TaskScreenshotMetaItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const storedFileName = typeof r.storedFileName === "string" ? r.storedFileName.trim() : "";
    if (!storedFileName) continue;
    out.push({
      storedFileName,
      originalName: typeof r.originalName === "string" ? r.originalName : storedFileName,
      mimeType:
        r.mimeType === "image/png" || r.mimeType === "image/jpeg" ? r.mimeType : "image/jpeg",
      size: typeof r.size === "number" && Number.isFinite(r.size) ? r.size : 0,
      uploadedAt: typeof r.uploadedAt === "string" ? r.uploadedAt : new Date().toISOString(),
    });
  }
  return out;
}
