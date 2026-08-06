import { point } from "@turf/helpers";
import type { TaskScreenshotMetaItem } from "@/lib/task-screenshot-meta";
import { isIntakeAttachmentImage } from "@/lib/ticket-intake-screenshots-meta";

/** Location visit images (JPEG/PNG only). */
export type TravelOrderAttachment = TaskScreenshotMetaItem;

/** Order-level supporting files (images + documents). */
export type TravelOrderFileAttachment = {
  storedFileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
};

/** Max order-level supporting files on create (client + server). */
export const MAX_TRAVEL_ORDER_ATTACHMENTS = 10;

export function isTravelOrderFileImage(
  item: Pick<TravelOrderFileAttachment, "mimeType" | "originalName">,
): boolean {
  return isIntakeAttachmentImage(item);
}

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
   * When true (only allowed with 3+ levels), this seat is optional: it does not
   * follow the required approval chain (always actionable), does not block later
   * required seats, and never finishes the order alone — every required APPROVED BY
   * must still approve.
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
  /** When true, show Driver + License No. fields. */
  driverPresent: boolean;
  /** Must be one of the travelers (creator or co-travelers). */
  driverAgentId: string;
  driverLicenseNo: string;
  locations: TravelOrderLocationDraft[];
  /** Optional Gate Pass (page 3). */
  gatePass: TravelOrderGatePassDraft;
};

/** Create-time / editable Gate Pass fields. */
export type TravelOrderGatePassDraft = {
  /** False when the user skips the Gate Pass page. */
  included: boolean;
  /** `datetime-local` value (YYYY-MM-DDTHH:mm) or empty. */
  estDepartureAt: string;
  estArrivalAt: string;
  actualDepartureStartedAt: string | null;
  actualDepartureStartedLatitude: number | null;
  actualDepartureStartedLongitude: number | null;
  actualDepartureEndedAt: string | null;
  actualDepartureEndedLatitude: number | null;
  actualDepartureEndedLongitude: number | null;
};

export function emptyGatePassDraft(
  partial?: Partial<TravelOrderGatePassDraft>,
): TravelOrderGatePassDraft {
  return {
    included: partial?.included ?? false,
    estDepartureAt: partial?.estDepartureAt ?? "",
    estArrivalAt: partial?.estArrivalAt ?? "",
    actualDepartureStartedAt: partial?.actualDepartureStartedAt ?? null,
    actualDepartureStartedLatitude: partial?.actualDepartureStartedLatitude ?? null,
    actualDepartureStartedLongitude: partial?.actualDepartureStartedLongitude ?? null,
    actualDepartureEndedAt: partial?.actualDepartureEndedAt ?? null,
    actualDepartureEndedLatitude: partial?.actualDepartureEndedLatitude ?? null,
    actualDepartureEndedLongitude: partial?.actualDepartureEndedLongitude ?? null,
  };
}

export function gatePassDraftHasAnyData(gp: TravelOrderGatePassDraft): boolean {
  return Boolean(
    gp.estDepartureAt.trim() ||
      gp.estArrivalAt.trim() ||
      gp.actualDepartureStartedAt ||
      gp.actualDepartureEndedAt,
  );
}

/** Validate Gate Pass only when the user opted in or entered any field. */
export function validateTravelOrderGatePass(gp: TravelOrderGatePassDraft): string | null {
  if (!gp.included && !gatePassDraftHasAnyData(gp)) return null;

  const dep = gp.estDepartureAt.trim();
  const arr = gp.estArrivalAt.trim();
  if (dep) {
    const d = Date.parse(dep);
    if (!Number.isFinite(d)) return "Est. Departure date/time is invalid.";
  }
  if (arr) {
    const a = Date.parse(arr);
    if (!Number.isFinite(a)) return "Est. Arrival date/time is invalid.";
  }
  if (dep && arr) {
    const d = Date.parse(dep);
    const a = Date.parse(arr);
    if (Number.isFinite(d) && Number.isFinite(a) && a < d) {
      return "Est. Arrival must be on or after Est. Departure.";
    }
  }
  if (gp.actualDepartureStartedAt && gp.actualDepartureEndedAt) {
    const s = Date.parse(gp.actualDepartureStartedAt);
    const e = Date.parse(gp.actualDepartureEndedAt);
    if (Number.isFinite(s) && Number.isFinite(e) && e < s) {
      return "Actual Departure End must be on or after Start.";
    }
  }
  return null;
}

/** Convert datetime-local / ISO string to Date, or null when empty/invalid. */
export function parseOptionalDateTimeInput(raw: string | null | undefined): Date | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const ms = Date.parse(raw.trim());
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
}

/** Format an ISO timestamp for `<input type="datetime-local" />`. */
export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

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
  /** Order-level supporting files (images + documents). */
  attachments?: TravelOrderFileAttachment[];
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
  driverPresent?: boolean;
  driverAgentId?: string | null;
  driverAgent?: TravelOrderAgentRef | null;
  driverLicenseNo?: string | null;
  /** Optional Gate Pass section. */
  gatePassIncluded?: boolean;
  estDepartureAt?: string | null;
  estArrivalAt?: string | null;
  actualDepartureStartedAt?: string | null;
  actualDepartureStartedLatitude?: number | null;
  actualDepartureStartedLongitude?: number | null;
  actualDepartureEndedAt?: string | null;
  actualDepartureEndedLatitude?: number | null;
  actualDepartureEndedLongitude?: number | null;
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
    driverPresent: false,
    driverAgentId: "",
    driverLicenseNo: "",
    locations: [emptyTravelLocation()],
    gatePass: emptyGatePassDraft(),
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

/** Display label for a hierarchical approval seat (UI uppercases this). */
export function travelOrderApprovedByLabel(optional?: boolean): string {
  return optional ? "Approved By: (Optional)" : "Approved By: (Required)";
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
        return `Assign an approver for ${travelOrderApprovedByLabel(lvl.optional === true)}.`;
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
  if (draft.driverPresent) {
    if (!draft.driverAgentId.trim()) {
      return "Select a driver from the travelers list.";
    }
    if (!draft.driverLicenseNo.trim()) {
      return "Enter the driver license number.";
    }
  }
  const gatePassError = validateTravelOrderGatePass(draft.gatePass);
  if (gatePassError) return gatePassError;
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
  levels: Array<{ level?: number; agentId?: string | null }> | null | undefined,
): boolean {
  return Array.isArray(levels) && levels.length > 0;
}

function sortApprovalLevels<T extends ApprovalLevelLike>(levels: T[]): T[] {
  return [...levels].sort((a, b) => a.level - b.level);
}

/**
 * Required seats unlock in order (every prior *required* seat must be approved).
 * Optional seats do not follow the chain — they are always actionable until the
 * hierarchy is satisfied.
 */
export function isApprovalLevelUnlocked(
  levels: ApprovalLevelLike[],
  levelNumber: number,
): boolean {
  const sorted = sortApprovalLevels(levels);
  const target = sorted.find((l) => l.level === levelNumber);
  if (!target) return false;
  if (isApprovalLevelOptional(target)) return true;
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
 * Hierarchy is complete when every *required* level has approved.
 * Optional seats never finish the chain early — whether they approve or not,
 * all required approvers are still needed. Leftover optional seats may be skipped
 * after the required set is done. If every level is optional, at least one
 * approval is required.
 */
export function isApprovalHierarchySatisfied(levels: ApprovalLevelLike[]): boolean {
  if (levels.length === 0) return false;
  const sorted = sortApprovalLevels(levels);
  const required = sorted.filter((l) => !isApprovalLevelOptional(l));
  if (required.length === 0) {
    return sorted.some((l) => Boolean(l.approvedAt));
  }
  return required.every((l) => Boolean(l.approvedAt));
}

/** @deprecated Prefer isApprovalHierarchySatisfied — kept for call sites. */
export function allApprovalLevelsComplete(levels: ApprovalLevelLike[]): boolean {
  return isApprovalHierarchySatisfied(levels);
}

/** Level the operator should act on (their unlocked incomplete assignment only). */
export function getOperatorActionableApprovalLevel(
  levels: TravelOrderApprovalLevelStored[] | TravelOrderApprovalLevelDto[],
  operatorAgentId: string | null | undefined,
  _opts?: { canAssignWork?: boolean },
): TravelOrderApprovalLevelStored | TravelOrderApprovalLevelDto | null {
  const unlocked = getUnlockedIncompleteLevels(levels);
  if (!unlocked.length || !operatorAgentId) return null;
  return unlocked.find((l) => l.agentId === operatorAgentId) ?? null;
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
  _opts?: { canAssignWork?: boolean },
): boolean {
  if (order.status !== TRAVEL_ORDER_STATUS.SUBMITTED) return false;
  if (!operatorAgentId) return false;
  const levels = order.approvalLevels ?? [];
  if (hasHierarchicalApprovals(levels)) {
    // Only the designated assignee for an unlocked seat may approve — no admin proxy.
    return getOperatorActionableApprovalLevel(levels, operatorAgentId) != null;
  }
  return isDesignatedApprover(operatorAgentId, order);
}

/** Current-level designated approver may reject a submitted travel order. */
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

/** Designated confirmer may confirm or decline confirmation on a running order. */
export function canConfirmTravelOrderNow(
  operatorAgentId: string | null | undefined,
  order: {
    status?: string;
    confirmationByAgentId?: string | null;
  },
  _opts?: { canAssignWork?: boolean },
): boolean {
  if (order.status !== TRAVEL_ORDER_STATUS.APPROVED) return false;
  if (!order.confirmationByAgentId) return false;
  // Only the designated confirmer — no admin proxy.
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

/** Assigned traveler (including creator) on a travel order. */
export function isTravelOrderTraveler(
  operatorAgentId: string | null | undefined,
  order: {
    travelerAgentIds?: string[] | null;
    createdByAgentId?: string | null;
  },
): boolean {
  if (!operatorAgentId) return false;
  if (order.createdByAgentId === operatorAgentId) return true;
  return (order.travelerAgentIds ?? []).includes(operatorAgentId);
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

/** Parse order-level supporting files (images + documents). */
export function parseTravelOrderFileAttachments(raw: unknown): TravelOrderFileAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: TravelOrderFileAttachment[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const storedFileName = typeof r.storedFileName === "string" ? r.storedFileName.trim() : "";
    if (!storedFileName || storedFileName.includes("..") || /[/\\]/.test(storedFileName)) {
      continue;
    }
    out.push({
      storedFileName,
      originalName:
        typeof r.originalName === "string" && r.originalName.trim()
          ? r.originalName.trim().slice(0, 200)
          : storedFileName,
      mimeType:
        typeof r.mimeType === "string" && r.mimeType.trim()
          ? r.mimeType.trim()
          : "application/octet-stream",
      size: typeof r.size === "number" && Number.isFinite(r.size) ? r.size : 0,
      uploadedAt: typeof r.uploadedAt === "string" ? r.uploadedAt : new Date().toISOString(),
    });
  }
  return out;
}
