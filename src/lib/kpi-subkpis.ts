import type { Prisma } from "@prisma/client/primary";
import { normalizePersonName } from "@/lib/person-name";
import { DateTime } from "luxon";
import { itProjectAllItems, isItProjectEnvelope, parseItProjectSubKpis, wrapItProjectSubKpis } from "@/lib/it-project-subkpis";
import {
  parseTaskScreenshotMetaList,
  type TaskScreenshotMetaItem,
  type TaskScreenshotSlot,
} from "@/lib/task-screenshot-meta";
import { normalizeTimeZone } from "./kpi-recurrence";
import {
  applySubKpiCompletionMode,
  applySubKpiCompletionRequirements,
  completionRequirementsFromLegacyMode,
  hasBeforeAndAfterScreenshots,
  isSubKpiCompletionMode,
  normalizeCompletionRequirements,
  resolveSubKpiCompletionMode,
  resolveSubKpiCompletionRequirements,
  subKpiItemProgressFraction,
  subKpiRequirementsMet,
  subKpiRequiresScreenshotsFromMode,
  subKpiRequiresNumerical,
  subKpiStoredCompletionRequirements,
  type SubKpiCompletionMode,
  type SubKpiCompletionRequirements,
} from "@/lib/sub-kpi-completion-mode";

/** Synthetic sub-task id when completion applies on the pillar card (no checklist rows). */
export const PILLAR_ONLY_VIRTUAL_SUBKPI_ID = "__pillar__";

/** Optional schedule fields are calendar days `YYYY-MM-DD` (IT Project Implementation sub-tasks). */
export type SubKpiItem = {
  id: string;
  title: string;
  /** Optional free-text details shown in the Sub Tasks manager. */
  description?: string | null;
  done?: boolean;
  assignedAgentId?: string | null;
  assignedAgentName?: string | null;
  projectPriority?: "High" | "Medium" | "Low" | null;
  projectStatus?: "Pending" | "On Going" | "Finalizing" | "Done" | null;
  /** How assignees complete this sub-task (checkbox, screenshots, numerical, or combinations). */
  completionMode?: SubKpiCompletionMode;
  completionRequirements?: SubKpiCompletionRequirements;
  screenshotsEnabled?: boolean;
  beforeScreenshot?: TaskScreenshotMetaItem[];
  afterScreenshot?: TaskScreenshotMetaItem[];
  /** Generic proof uploads when screenshot-upload completion is enabled. */
  uploadScreenshot?: TaskScreenshotMetaItem[];
  location?: string | null;
  startDate?: string | null;
  /** End date (stored as dueDate for backward compatibility). */
  dueDate?: string | null;
  actualDate?: string | null;
  numericalValue?: number | null;
  /** Target number admins set when numerical record completion is enabled. */
  numericalTarget?: number | null;
  /** Daily penalty amount when this sub-task is delayed (overrides task default). */
  dailyPenaltyAmount?: number | null;
  /** Main assignee unlocked helper assignment via Seek Assistance. */
  assistanceRequested?: boolean;
  assistanceRequestedAt?: string | null;
  assistanceRequestedBy?: string | null;
};

/** Subtask assignee UI/API unlocked when parent flag is on or Seek Assistance was used. */
export function isSubKpiAssigneeUnlocked(
  enableSubtaskAssignees: boolean,
  item: Pick<SubKpiItem, "assistanceRequested">,
): boolean {
  return enableSubtaskAssignees === true || item.assistanceRequested === true;
}

/** Who may set a subtask assignee once unlocked. */
export function canMutateSubKpiAssignee(opts: {
  enableSubtaskAssignees: boolean;
  item: Pick<SubKpiItem, "assistanceRequested">;
  canAssignWork: boolean;
  isMainAssignee: boolean;
}): boolean {
  return (
    isSubKpiAssigneeUnlocked(opts.enableSubtaskAssignees, opts.item) &&
    (opts.canAssignWork || opts.isMainAssignee)
  );
}

const SUB_KPI_PRIORITY_OPTIONS = ["High", "Medium", "Low"] as const;

function normalizeSubKpiPriority(value: unknown): SubKpiItem["projectPriority"] {
  return SUB_KPI_PRIORITY_OPTIONS.find((option) => option === value) ?? null;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeOptionalSubKpiYmd(v: unknown): string | null {
  if (v == null) return null;
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  return YMD.test(s) ? s : null;
}

const SUB_KPI_DESCRIPTION_MAX = 600;

function normalizeSubKpiDescription(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, SUB_KPI_DESCRIPTION_MAX) : "";
}

function itemFromRaw(r: Record<string, unknown>): SubKpiItem {
  const id = String(r?.id ?? "");
  const title = String(r?.title ?? "");
  const description = normalizeSubKpiDescription(r?.description);
  const done = Boolean(r?.done);
  const assignedAgentId = typeof r?.assignedAgentId === "string" ? r.assignedAgentId.trim() : "";
  const assignedAgentName = typeof r?.assignedAgentName === "string" ? r.assignedAgentName.trim() : "";
  const projectPriority = normalizeSubKpiPriority(r?.projectPriority);
  const projectStatus =
    r?.projectStatus === "Pending" ||
    r?.projectStatus === "On Going" ||
    r?.projectStatus === "Finalizing" ||
    r?.projectStatus === "Done"
      ? r.projectStatus
      : null;
  const beforeScreenshot = parseTaskScreenshotMetaList(r?.beforeScreenshot);
  const afterScreenshot = parseTaskScreenshotMetaList(r?.afterScreenshot);
  const uploadScreenshot = parseTaskScreenshotMetaList(r?.uploadScreenshot);
  const completionRequirements = normalizeCompletionRequirements(r?.completionRequirements);
  const completionMode = isSubKpiCompletionMode(r?.completionMode)
    ? r.completionMode
    : resolveSubKpiCompletionMode({
        completionMode: undefined,
        screenshotsEnabled: r?.screenshotsEnabled === true,
        beforeScreenshot,
        afterScreenshot,
      });
  const resolvedRequirements =
    completionRequirements ?? completionRequirementsFromLegacyMode(completionMode);
  const screenshotsEnabled =
    r?.screenshotsEnabled === true || subKpiRequiresScreenshotsFromMode(completionMode);
  const startDate = normalizeOptionalSubKpiYmd(r?.startDate);
  const dueDate = normalizeOptionalSubKpiYmd(r?.dueDate);
  const actualDate = normalizeOptionalSubKpiYmd(r?.actualDate);
  const numericalRaw = r?.numericalValue;
  const numericalValue =
    typeof numericalRaw === "number" && Number.isFinite(numericalRaw) ? numericalRaw : null;
  const numericalTargetRaw = r?.numericalTarget;
  const numericalTarget =
    typeof numericalTargetRaw === "number" && Number.isFinite(numericalTargetRaw)
      ? numericalTargetRaw
      : null;
  const dailyPenaltyRaw = r?.dailyPenaltyAmount;
  const dailyPenaltyAmount =
    typeof dailyPenaltyRaw === "number" && Number.isFinite(dailyPenaltyRaw) && dailyPenaltyRaw >= 0
      ? dailyPenaltyRaw
      : null;
  const assistanceRequested = r?.assistanceRequested === true;
  const assistanceRequestedAt =
    typeof r?.assistanceRequestedAt === "string" ? r.assistanceRequestedAt.trim() : "";
  const assistanceRequestedBy =
    typeof r?.assistanceRequestedBy === "string" ? r.assistanceRequestedBy.trim() : "";
  return {
    id,
    title,
    ...(description ? { description } : {}),
    done,
    ...(assignedAgentId ? { assignedAgentId } : {}),
    ...(assignedAgentName ? { assignedAgentName } : {}),
    ...(projectPriority ? { projectPriority } : {}),
    ...(projectStatus ? { projectStatus } : {}),
    ...(completionRequirements ? { completionRequirements: resolvedRequirements } : {}),
    ...(completionMode !== "checkbox" && !completionRequirements ? { completionMode } : {}),
    ...(screenshotsEnabled ? { screenshotsEnabled: true } : {}),
    ...(beforeScreenshot.length > 0 ? { beforeScreenshot } : {}),
    ...(afterScreenshot.length > 0 ? { afterScreenshot } : {}),
    ...(uploadScreenshot.length > 0 ? { uploadScreenshot } : {}),
    ...(startDate ? { startDate } : {}),
    ...(dueDate ? { dueDate } : {}),
    ...(actualDate ? { actualDate } : {}),
    ...(numericalValue != null ? { numericalValue } : {}),
    ...(numericalTarget != null ? { numericalTarget } : {}),
    ...(dailyPenaltyAmount != null ? { dailyPenaltyAmount } : {}),
    ...(assistanceRequested ? { assistanceRequested: true } : {}),
    ...(assistanceRequestedAt ? { assistanceRequestedAt } : {}),
    ...(assistanceRequestedBy ? { assistanceRequestedBy } : {}),
  };
}

export type SubKpiSegment = { id: string; label: string; items: SubKpiItem[] };

/** Stored JSON: legacy flat array or wrapped envelope. */
export type SubKpisStoredEnvelope = {
  segmented: boolean;
  items?: SubKpiItem[];
  segments?: SubKpiSegment[];
  taskPriority?: SubKpiItem["projectPriority"];
  pillarScreenshotsEnabled?: boolean;
  pillarBeforeScreenshot?: TaskScreenshotMetaItem[];
  pillarAfterScreenshot?: TaskScreenshotMetaItem[];
  pillarScreenshotUploadEnabled?: boolean;
  pillarScreenshot?: TaskScreenshotMetaItem[];
  archivedTaskScreenshots?: ArchivedTaskScreenshotSet[];
  archivedNumericalRecords?: ArchivedNumericalRecordSet[];
  /** Default daily penalty for sub-tasks when delayed (sub-task value overrides). */
  taskDailyPenaltyAmount?: number | null;
  /** Total number of sub-tasks (checklist items) currently in this group. */
  taskCount?: number | null;
};

export type ArchivedTaskScreenshotSet = {
  archivedAt: string;
  subTasks: Array<{
    id: string;
    title: string;
    beforeScreenshot?: TaskScreenshotMetaItem[];
    afterScreenshot?: TaskScreenshotMetaItem[];
    uploadScreenshot?: TaskScreenshotMetaItem[];
  }>;
  pillarBeforeScreenshot?: TaskScreenshotMetaItem[];
  pillarAfterScreenshot?: TaskScreenshotMetaItem[];
  pillarScreenshot?: TaskScreenshotMetaItem[];
};

export type ArchivedNumericalRecordSet = {
  archivedAt: string;
  subTasks: Array<{
    id: string;
    title: string;
    numericalTarget?: number | null;
    numericalValue?: number | null;
  }>;
};

export type NormalizedSubKpis =
  | { segmented: false; flat: SubKpiItem[] }
  | { segmented: true; segments: SubKpiSegment[] };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function normalizeSubKpis(raw: unknown): NormalizedSubKpis {
  if (Array.isArray(raw)) {
    const flat = raw.map((x) =>
      isPlainObject(x) ? itemFromRaw(x as Record<string, unknown>) : { id: "", title: "", done: false },
    );
    return { segmented: false, flat };
  }
  if (isPlainObject(raw)) {
    if (raw.segmented === true && Array.isArray(raw.segments)) {
      const segments = (raw.segments as unknown[]).map((seg) => {
        const s = seg as SubKpiSegment;
        const id = String(s?.id ?? "");
        const label = String(s?.label ?? "");
        const items = Array.isArray(s?.items)
          ? (s.items as unknown[]).map((it) =>
              isPlainObject(it)
                ? itemFromRaw(it as Record<string, unknown>)
                : { id: "", title: "", done: false },
            )
          : [];
        return { id, label, items };
      });
      return { segmented: true, segments };
    }
    if (Array.isArray(raw.items)) {
      const flat = (raw.items as unknown[]).map((x) =>
        isPlainObject(x) ? itemFromRaw(x as Record<string, unknown>) : { id: "", title: "", done: false },
      );
      return { segmented: false, flat };
    }
  }
  return { segmented: false, flat: [] };
}

export function collectAllSubKpiItems(norm: NormalizedSubKpis): SubKpiItem[] {
  if (norm.segmented) return norm.segments.flatMap((s) => s.items);
  return norm.flat;
}

/** IT Project tasks: all phases flattened (legacy segmented JSON is flattened for display). */
export function normalizeSubKpisForItProject(raw: unknown): NormalizedSubKpis {
  if (isItProjectEnvelope(raw)) {
    return { segmented: false, flat: itProjectAllItems(parseItProjectSubKpis(raw)) };
  }
  const n = normalizeSubKpis(raw);
  if (!n.segmented) return n;
  return { segmented: false, flat: collectAllSubKpiItems(n) };
}

/** Checklist completion: percent = (total − missing) / total, missing = unchecked items. */
export type KpiChecklistProgress = {
  total: number;
  done: number;
  missing: number;
  percent: number;
};

export function kpiChecklistProgress(raw: unknown, taskTitle?: string): KpiChecklistProgress {
  const all = collectChecklistProgressItems(raw, taskTitle);
  const total = all.length;
  const done = all.filter((s) => subKpiRequirementsMet(s)).length;
  const missing = total - done;
  const progressSum = all.reduce((sum, item) => sum + subKpiItemProgressFraction(item), 0);
  const percent = total > 0 ? Math.round((progressSum / total) * 100) : 0;
  return { total, done, missing, percent };
}

export function aggregateKpiChecklistProgress(
  records: ReadonlyArray<{ subKpis: unknown }>,
): KpiChecklistProgress {
  let total = 0;
  let done = 0;
  for (const r of records) {
    const p = kpiChecklistProgress(r.subKpis);
    total += p.total;
    done += p.done;
  }
  const missing = total - done;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return { total, done, missing, percent };
}

/**
 * Cybersecurity / network: checked on the task board = breach or downtime;
 * unchecked items are neutral (safe / uptime), not counted as incidents.
 * @deprecated Both pillars now use normal checklist semantics (checked = done).
 */
export const INVERTED_CHECKLIST_PILLARS = new Set<string>([]);

/** @deprecated Use {@link isInvertedChecklistPillar} — frequency is ignored. */
export const DAILY_INVERTED_CHECKLIST_PILLARS = INVERTED_CHECKLIST_PILLARS;

export function isInvertedChecklistPillar(title: string): boolean {
  return INVERTED_CHECKLIST_PILLARS.has(title.trim());
}

export function isDailyInvertedChecklistPillar(title: string, frequency?: string): boolean {
  void frequency;
  return isInvertedChecklistPillar(title);
}

/** Donut/headline view: positive = good state, negative = bad state (may invert raw checklist). */
export type KpiChecklistMetricView = KpiChecklistProgress & {
  positive: number;
  negative: number;
  inverted: boolean;
};

export function kpiChecklistMetricView(
  agg: KpiChecklistProgress,
  invert: boolean,
): KpiChecklistMetricView {
  if (!invert) {
    return { ...agg, positive: agg.done, negative: agg.missing, inverted: false };
  }
  const positive = agg.missing;
  const negative = agg.done;
  const percent = agg.total > 0 ? Math.round((positive / agg.total) * 100) : 0;
  return { ...agg, percent, positive, negative, inverted: true };
}

/** Cybersecurity / network CSV + headline: unchecked = safe, checked = breached/downtime. */
export function incidentMetricPercents(agg: KpiChecklistProgress): {
  safePercent: number;
  breachedPercent: number;
  /** Null when there is no checklist data for the day/period. */
  effPercent: number | null;
} {
  if (agg.total <= 0) {
    return { safePercent: 0, breachedPercent: 0, effPercent: null };
  }
  const view = kpiChecklistMetricView(agg, true);
  const safePercent = view.percent;
  const breachedPercent = Math.round((view.negative / agg.total) * 100);
  const effPercent = breachedPercent >= 100 ? 0 : safePercent;
  return { safePercent, breachedPercent, effPercent };
}

export function wrapForPersist(norm: NormalizedSubKpis): Prisma.InputJsonValue {
  if (norm.segmented) {
    return { segmented: true, segments: norm.segments } as Prisma.InputJsonValue;
  }
  return { segmented: false, items: norm.flat } as Prisma.InputJsonValue;
}

function rawEnvelopeMeta(raw: unknown) {
  if (!isPlainObject(raw)) {
    return {
      taskPriority: null as SubKpiItem["projectPriority"],
      pillarScreenshotsEnabled: false,
      pillarBeforeScreenshot: [] as TaskScreenshotMetaItem[],
      pillarAfterScreenshot: [] as TaskScreenshotMetaItem[],
      pillarScreenshotUploadEnabled: false,
      pillarScreenshot: [] as TaskScreenshotMetaItem[],
      archivedTaskScreenshots: [] as ArchivedTaskScreenshotSet[],
      archivedNumericalRecords: [] as ArchivedNumericalRecordSet[],
      taskDailyPenaltyAmount: null as number | null,
      pillarCompletionRequirements: null as SubKpiCompletionRequirements | null,
      pillarDone: false,
      pillarNumericalTarget: null as number | null,
      pillarNumericalValue: null as number | null,
      pillarDueDate: null as string | null,
      pillarActualDate: null as string | null,
      taskCount: null as number | null,
    };
  }
  const pillarBeforeScreenshot = parseTaskScreenshotMetaList(raw.pillarBeforeScreenshot);
  const pillarAfterScreenshot = parseTaskScreenshotMetaList(raw.pillarAfterScreenshot);
  const pillarScreenshot = parseTaskScreenshotMetaList(raw.pillarScreenshot);
  const penaltyRaw = raw.taskDailyPenaltyAmount;
  const taskDailyPenaltyAmount =
    typeof penaltyRaw === "number" && Number.isFinite(penaltyRaw) && penaltyRaw >= 0 ? penaltyRaw : null;
  const pillarTargetRaw = raw.pillarNumericalTarget;
  const pillarValueRaw = raw.pillarNumericalValue;
  return {
    taskPriority: normalizeSubKpiPriority(raw.taskPriority),
    pillarScreenshotsEnabled:
      raw.pillarScreenshotsEnabled === true ||
      pillarBeforeScreenshot.length > 0 ||
      pillarAfterScreenshot.length > 0,
    pillarBeforeScreenshot,
    pillarAfterScreenshot,
    pillarScreenshotUploadEnabled:
      raw.pillarScreenshotUploadEnabled === true || pillarScreenshot.length > 0,
    pillarScreenshot,
    archivedTaskScreenshots: parseArchivedTaskScreenshotSets(raw.archivedTaskScreenshots),
    archivedNumericalRecords: parseArchivedNumericalRecordSets(raw.archivedNumericalRecords),
    taskDailyPenaltyAmount,
    pillarCompletionRequirements: normalizeCompletionRequirements(raw.pillarCompletionRequirements),
    pillarDone: raw.pillarDone === true,
    pillarNumericalTarget:
      typeof pillarTargetRaw === "number" && Number.isFinite(pillarTargetRaw) ? pillarTargetRaw : null,
    pillarNumericalValue:
      typeof pillarValueRaw === "number" && Number.isFinite(pillarValueRaw) ? pillarValueRaw : null,
    pillarDueDate: normalizeOptionalSubKpiYmd(raw.pillarDueDate),
    pillarActualDate: normalizeOptionalSubKpiYmd(raw.pillarActualDate),
    taskCount:
      typeof raw.taskCount === "number" && Number.isFinite(raw.taskCount) && Number.isInteger(raw.taskCount) && raw.taskCount >= 0
        ? raw.taskCount
        : null,
  };
}

function withEnvelopeMeta(base: Prisma.InputJsonValue, meta: ReturnType<typeof rawEnvelopeMeta>): Prisma.InputJsonValue {
  if (!isPlainObject(base)) return base;
  return {
    ...base,
    ...(meta.taskPriority ? { taskPriority: meta.taskPriority } : {}),
    ...(meta.pillarScreenshotsEnabled ? { pillarScreenshotsEnabled: true } : {}),
    ...(meta.pillarBeforeScreenshot.length > 0 ? { pillarBeforeScreenshot: meta.pillarBeforeScreenshot } : {}),
    ...(meta.pillarAfterScreenshot.length > 0 ? { pillarAfterScreenshot: meta.pillarAfterScreenshot } : {}),
    ...(meta.pillarScreenshotUploadEnabled ? { pillarScreenshotUploadEnabled: true } : {}),
    ...(meta.pillarScreenshot.length > 0 ? { pillarScreenshot: meta.pillarScreenshot } : {}),
    ...(meta.archivedTaskScreenshots.length > 0 ? { archivedTaskScreenshots: meta.archivedTaskScreenshots } : {}),
    ...(meta.archivedNumericalRecords.length > 0 ? { archivedNumericalRecords: meta.archivedNumericalRecords } : {}),
    ...(meta.taskDailyPenaltyAmount != null ? { taskDailyPenaltyAmount: meta.taskDailyPenaltyAmount } : {}),
    ...(meta.pillarCompletionRequirements
      ? { pillarCompletionRequirements: meta.pillarCompletionRequirements }
      : {}),
    ...(meta.pillarDone ? { pillarDone: true } : {}),
    ...(meta.pillarNumericalTarget != null ? { pillarNumericalTarget: meta.pillarNumericalTarget } : {}),
    ...(meta.pillarNumericalValue != null ? { pillarNumericalValue: meta.pillarNumericalValue } : {}),
    ...(meta.pillarDueDate ? { pillarDueDate: meta.pillarDueDate } : {}),
    ...(meta.pillarActualDate ? { pillarActualDate: meta.pillarActualDate } : {}),
    ...(meta.taskCount != null ? { taskCount: meta.taskCount } : {}),
  } as Prisma.InputJsonValue;
}

export function taskDailyPenaltyAmountFromSubKpis(raw: unknown): number | null {
  return rawEnvelopeMeta(raw).taskDailyPenaltyAmount;
}

export function setTaskDailyPenaltyAmount(
  raw: unknown,
  amount: number | null,
): Prisma.InputJsonValue {
  const meta = rawEnvelopeMeta(raw);
  meta.taskDailyPenaltyAmount =
    typeof amount === "number" && Number.isFinite(amount) && amount >= 0 ? amount : null;
  return withEnvelopeMeta(ensureEnvelope(raw), meta);
}

export function taskCountFromSubKpis(raw: unknown): number | null {
  return rawEnvelopeMeta(raw).taskCount;
}

export function setTaskCount(raw: unknown, count: number | null): Prisma.InputJsonValue {
  const meta = rawEnvelopeMeta(raw);
  meta.taskCount =
    typeof count === "number" && Number.isFinite(count) && Number.isInteger(count) && count >= 0
      ? count
      : null;
  return withEnvelopeMeta(ensureEnvelope(raw), meta);
}

export function wrapForPersistWithExistingMeta(norm: NormalizedSubKpis, raw: unknown): Prisma.InputJsonValue {
  return withEnvelopeMeta(wrapForPersist(norm), rawEnvelopeMeta(raw));
}

export function getTaskPriority(raw: unknown): SubKpiItem["projectPriority"] {
  return rawEnvelopeMeta(raw).taskPriority;
}

export function setTaskPriority(raw: unknown, priority: unknown): Prisma.InputJsonValue {
  const meta = rawEnvelopeMeta(raw);
  meta.taskPriority = normalizeSubKpiPriority(priority);
  return withEnvelopeMeta(ensureEnvelope(raw), meta);
}

export function enablePillarScreenshotUpload(raw: unknown): Prisma.InputJsonValue {
  const meta = rawEnvelopeMeta(raw);
  meta.pillarScreenshotUploadEnabled = true;
  return withEnvelopeMeta(ensureEnvelope(raw), meta);
}

export function pillarScreenshotUploadEnabled(raw: unknown): boolean {
  return rawEnvelopeMeta(raw).pillarScreenshotUploadEnabled;
}

export function getPillarScreenshotUploads(raw: unknown): TaskScreenshotMetaItem[] {
  return rawEnvelopeMeta(raw).pillarScreenshot;
}

export function setPillarScreenshotUploads(
  raw: unknown,
  screenshots: TaskScreenshotMetaItem[],
): Prisma.InputJsonValue {
  const meta = rawEnvelopeMeta(raw);
  meta.pillarScreenshotUploadEnabled = true;
  meta.pillarScreenshot = screenshots;
  return withEnvelopeMeta(ensureEnvelope(raw), meta);
}

export function removePillarScreenshotUpload(
  raw: unknown,
  storedFileName: string,
): Prisma.InputJsonValue {
  const meta = rawEnvelopeMeta(raw);
  meta.pillarScreenshot = meta.pillarScreenshot.filter((item) => item.storedFileName !== storedFileName);
  meta.pillarScreenshotUploadEnabled = true;
  return withEnvelopeMeta(ensureEnvelope(raw), meta);
}

export function getPillarCompletionRequirements(raw: unknown): SubKpiCompletionRequirements | null {
  return rawEnvelopeMeta(raw).pillarCompletionRequirements;
}

export function isPillarOnlyTask(raw: unknown): boolean {
  if (collectAllSubKpiItems(normalizeSubKpis(raw)).length > 0) return false;
  return getPillarCompletionRequirements(raw) != null;
}

/** Virtual checklist row when completion is stored on the task pillar (no sub-tasks). */
export function pillarVirtualSubKpiItem(raw: unknown, taskTitle?: string): SubKpiItem | null {
  const requirements = getPillarCompletionRequirements(raw);
  if (!requirements) return null;
  const meta = rawEnvelopeMeta(raw);
  const item: SubKpiItem = {
    id: PILLAR_ONLY_VIRTUAL_SUBKPI_ID,
    title: taskTitle?.trim() || "Task",
    done: meta.pillarDone,
    completionRequirements: requirements,
  };
  if (requirements.screenshots || meta.pillarBeforeScreenshot.length > 0 || meta.pillarAfterScreenshot.length > 0) {
    item.screenshotsEnabled = true;
    if (meta.pillarBeforeScreenshot.length > 0) item.beforeScreenshot = meta.pillarBeforeScreenshot;
    if (meta.pillarAfterScreenshot.length > 0) item.afterScreenshot = meta.pillarAfterScreenshot;
  }
  if (requirements.screenshotUpload || meta.pillarScreenshot.length > 0) {
    if (meta.pillarScreenshot.length > 0) item.uploadScreenshot = meta.pillarScreenshot;
  }
  if (meta.pillarNumericalTarget != null) item.numericalTarget = meta.pillarNumericalTarget;
  if (meta.pillarNumericalValue != null) item.numericalValue = meta.pillarNumericalValue;
  if (meta.pillarDueDate) item.dueDate = meta.pillarDueDate;
  if (meta.pillarActualDate) item.actualDate = meta.pillarActualDate;
  return item;
}

/** Sub-tasks for progress, delay, and penalties — includes a virtual pillar row when applicable. */
export function collectChecklistProgressItems(raw: unknown, taskTitle?: string): SubKpiItem[] {
  const items = collectAllSubKpiItems(normalizeSubKpis(raw));
  if (items.length > 0) return items;
  const virtual = pillarVirtualSubKpiItem(raw, taskTitle);
  return virtual ? [virtual] : [];
}

export function applyPillarOnlyTaskCreate(
  raw: Prisma.InputJsonValue,
  requirements: SubKpiCompletionRequirements,
  opts: { numericalTarget?: number | null; dueDate?: string | null } = {},
): Prisma.InputJsonValue {
  const meta = rawEnvelopeMeta(raw);
  meta.pillarCompletionRequirements = subKpiStoredCompletionRequirements(requirements);
  meta.pillarDone = false;
  if (opts.numericalTarget != null) meta.pillarNumericalTarget = opts.numericalTarget;
  const dueYmd = opts.dueDate ? normalizeOptionalSubKpiYmd(opts.dueDate) : null;
  if (dueYmd) meta.pillarDueDate = dueYmd;
  let result = withEnvelopeMeta(ensureEnvelope(raw), meta);
  if (requirements.screenshots) result = enablePillarScreenshots(result);
  if (requirements.screenshotUpload) result = enablePillarScreenshotUpload(result);
  return result;
}

export function setPillarDone(raw: unknown, done: boolean): Prisma.InputJsonValue {
  const meta = rawEnvelopeMeta(raw);
  meta.pillarDone = done;
  return withEnvelopeMeta(ensureEnvelope(raw), meta);
}

export function setPillarWorkMeta(
  raw: unknown,
  patch: {
    dueDate?: string | null;
    actualDate?: string | null;
    numericalTarget?: number | null;
    numericalValue?: number | null;
  },
): Prisma.InputJsonValue {
  const meta = rawEnvelopeMeta(raw);
  if (patch.dueDate !== undefined) {
    meta.pillarDueDate = patch.dueDate ? normalizeOptionalSubKpiYmd(patch.dueDate) : null;
  }
  if (patch.actualDate !== undefined) {
    meta.pillarActualDate = patch.actualDate ? normalizeOptionalSubKpiYmd(patch.actualDate) : null;
  }
  if (patch.numericalTarget !== undefined) {
    meta.pillarNumericalTarget =
      patch.numericalTarget != null && Number.isFinite(patch.numericalTarget)
        ? patch.numericalTarget
        : null;
  }
  if (patch.numericalValue !== undefined) {
    meta.pillarNumericalValue =
      patch.numericalValue != null && Number.isFinite(patch.numericalValue)
        ? patch.numericalValue
        : null;
  }
  return withEnvelopeMeta(ensureEnvelope(raw), meta);
}

export function syncPillarDoneFromRequirements(raw: unknown): Prisma.InputJsonValue {
  const virtual = pillarVirtualSubKpiItem(raw);
  if (!virtual) return raw as Prisma.InputJsonValue;
  const shouldBeDone = subKpiRequirementsMet(virtual);
  const meta = rawEnvelopeMeta(raw);
  if (Boolean(meta.pillarDone) === shouldBeDone) return raw as Prisma.InputJsonValue;
  return setPillarDone(raw, shouldBeDone);
}

export function enablePillarScreenshots(raw: unknown): Prisma.InputJsonValue {
  const meta = rawEnvelopeMeta(raw);
  meta.pillarScreenshotsEnabled = true;
  return withEnvelopeMeta(ensureEnvelope(raw), meta);
}

export function pillarScreenshotsEnabled(raw: unknown): boolean {
  return rawEnvelopeMeta(raw).pillarScreenshotsEnabled;
}

export function getPillarScreenshots(raw: unknown, slot: TaskScreenshotSlot): TaskScreenshotMetaItem[] {
  const meta = rawEnvelopeMeta(raw);
  if (slot === "general") return meta.pillarScreenshot;
  return slot === "before" ? meta.pillarBeforeScreenshot : meta.pillarAfterScreenshot;
}

export function getArchivedTaskScreenshots(raw: unknown): ArchivedTaskScreenshotSet[] {
  return rawEnvelopeMeta(raw).archivedTaskScreenshots;
}

export function getArchivedNumericalRecords(raw: unknown): ArchivedNumericalRecordSet[] {
  return rawEnvelopeMeta(raw).archivedNumericalRecords;
}

/** Past-cycle numerical entries for one sub-task (newest archive last). */
export function archivedNumericalEntriesForSubKpi(
  raw: unknown,
  subKpiId: string,
): Array<{
  archivedAt: string;
  numericalTarget: number | null;
  numericalValue: number | null;
}> {
  const out: Array<{
    archivedAt: string;
    numericalTarget: number | null;
    numericalValue: number | null;
  }> = [];
  for (const archive of getArchivedNumericalRecords(raw)) {
    const row = archive.subTasks.find((it) => it.id === subKpiId);
    if (!row) continue;
    const target =
      typeof row.numericalTarget === "number" && Number.isFinite(row.numericalTarget)
        ? row.numericalTarget
        : null;
    const value =
      typeof row.numericalValue === "number" && Number.isFinite(row.numericalValue)
        ? row.numericalValue
        : null;
    if (target == null && value == null) continue;
    out.push({ archivedAt: archive.archivedAt, numericalTarget: target, numericalValue: value });
  }
  return out;
}

export function setPillarScreenshots(
  raw: unknown,
  slot: TaskScreenshotSlot,
  screenshots: TaskScreenshotMetaItem[],
): Prisma.InputJsonValue {
  const meta = rawEnvelopeMeta(raw);
  meta.pillarScreenshotsEnabled = true;
  if (slot === "general") {
    meta.pillarScreenshotUploadEnabled = true;
    meta.pillarScreenshot = screenshots;
  } else if (slot === "before") meta.pillarBeforeScreenshot = screenshots;
  else meta.pillarAfterScreenshot = screenshots;
  return withEnvelopeMeta(ensureEnvelope(raw), meta);
}

export function removePillarScreenshot(
  raw: unknown,
  slot: TaskScreenshotSlot,
  storedFileName: string,
): Prisma.InputJsonValue {
  const meta = rawEnvelopeMeta(raw);
  if (slot === "general") {
    meta.pillarScreenshot = meta.pillarScreenshot.filter((item) => item.storedFileName !== storedFileName);
    meta.pillarScreenshotUploadEnabled = true;
  } else {
    const next =
      slot === "before"
        ? meta.pillarBeforeScreenshot.filter((item) => item.storedFileName !== storedFileName)
        : meta.pillarAfterScreenshot.filter((item) => item.storedFileName !== storedFileName);
    if (slot === "before") meta.pillarBeforeScreenshot = next;
    else meta.pillarAfterScreenshot = next;
    meta.pillarScreenshotsEnabled = true;
  }
  return withEnvelopeMeta(ensureEnvelope(raw), meta);
}

/** Migrate legacy array to envelope (optional, for consistency). */
export function ensureEnvelope(raw: unknown): Prisma.InputJsonValue {
  // IT Project envelopes must keep kind/phases/items — normalizeSubKpis would wipe them.
  if (isItProjectEnvelope(raw)) {
    const wrapped = wrapItProjectSubKpisPreserve(raw);
    return withEnvelopeMeta(wrapped, rawEnvelopeMeta(raw));
  }
  const n = normalizeSubKpis(raw);
  return wrapForPersistWithExistingMeta(n, raw);
}

/** Re-wrap IT project JSON without going through checklist normalize (avoids circular import issues at call sites). */
function wrapItProjectSubKpisPreserve(raw: unknown): Prisma.InputJsonValue {
  return wrapItProjectSubKpis(parseItProjectSubKpis(raw));
}

function parseArchivedTaskScreenshotSets(raw: unknown): ArchivedTaskScreenshotSet[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry): ArchivedTaskScreenshotSet | null => {
      if (!isPlainObject(entry)) return null;
      const subTasks = Array.isArray(entry.subTasks)
        ? entry.subTasks
            .map((it): ArchivedTaskScreenshotSet["subTasks"][number] | null => {
              if (!isPlainObject(it)) return null;
              const id = typeof it.id === "string" ? it.id : "";
              const title = typeof it.title === "string" ? it.title : "";
              const beforeScreenshot = parseTaskScreenshotMetaList(it.beforeScreenshot);
              const afterScreenshot = parseTaskScreenshotMetaList(it.afterScreenshot);
              const uploadScreenshot = parseTaskScreenshotMetaList(it.uploadScreenshot);
              if (
                !id ||
                (beforeScreenshot.length === 0 &&
                  afterScreenshot.length === 0 &&
                  uploadScreenshot.length === 0)
              ) {
                return null;
              }
              return {
                id,
                title,
                ...(beforeScreenshot.length > 0 ? { beforeScreenshot } : {}),
                ...(afterScreenshot.length > 0 ? { afterScreenshot } : {}),
                ...(uploadScreenshot.length > 0 ? { uploadScreenshot } : {}),
              };
            })
            .filter((it): it is ArchivedTaskScreenshotSet["subTasks"][number] => it != null)
        : [];
      const pillarBeforeScreenshot = parseTaskScreenshotMetaList(entry.pillarBeforeScreenshot);
      const pillarAfterScreenshot = parseTaskScreenshotMetaList(entry.pillarAfterScreenshot);
      const pillarScreenshot = parseTaskScreenshotMetaList(entry.pillarScreenshot);
      if (
        subTasks.length === 0 &&
        pillarBeforeScreenshot.length === 0 &&
        pillarAfterScreenshot.length === 0 &&
        pillarScreenshot.length === 0
      ) {
        return null;
      }
      return {
        archivedAt: typeof entry.archivedAt === "string" ? entry.archivedAt : new Date().toISOString(),
        subTasks,
        ...(pillarBeforeScreenshot.length > 0 ? { pillarBeforeScreenshot } : {}),
        ...(pillarAfterScreenshot.length > 0 ? { pillarAfterScreenshot } : {}),
        ...(pillarScreenshot.length > 0 ? { pillarScreenshot } : {}),
      };
    })
    .filter((entry): entry is ArchivedTaskScreenshotSet => entry != null);
}

function parseArchivedNumericalRecordSets(raw: unknown): ArchivedNumericalRecordSet[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry): ArchivedNumericalRecordSet | null => {
      if (!isPlainObject(entry)) return null;
      const subTasks = Array.isArray(entry.subTasks)
        ? entry.subTasks
            .map((it): ArchivedNumericalRecordSet["subTasks"][number] | null => {
              if (!isPlainObject(it)) return null;
              const id = typeof it.id === "string" ? it.id : "";
              const title = typeof it.title === "string" ? it.title : "";
              const targetRaw = it.numericalTarget;
              const valueRaw = it.numericalValue;
              const numericalTarget =
                typeof targetRaw === "number" && Number.isFinite(targetRaw) ? targetRaw : null;
              const numericalValue =
                typeof valueRaw === "number" && Number.isFinite(valueRaw) ? valueRaw : null;
              if (!id || (numericalTarget == null && numericalValue == null)) return null;
              return {
                id,
                title,
                ...(numericalTarget != null ? { numericalTarget } : {}),
                ...(numericalValue != null ? { numericalValue } : {}),
              };
            })
            .filter((it): it is ArchivedNumericalRecordSet["subTasks"][number] => it != null)
        : [];
      if (subTasks.length === 0) return null;
      return {
        archivedAt: typeof entry.archivedAt === "string" ? entry.archivedAt : new Date().toISOString(),
        subTasks,
      };
    })
    .filter((entry): entry is ArchivedNumericalRecordSet => entry != null);
}

function archiveScreenshotsForReset(raw: unknown, norm: NormalizedSubKpis): ReturnType<typeof rawEnvelopeMeta> {
  const meta = rawEnvelopeMeta(raw);
  const subTasks = collectAllSubKpiItems(norm)
    .map((it) => {
      const beforeScreenshot = it.beforeScreenshot ?? [];
      const afterScreenshot = it.afterScreenshot ?? [];
      const uploadScreenshot = it.uploadScreenshot ?? [];
      if (beforeScreenshot.length === 0 && afterScreenshot.length === 0 && uploadScreenshot.length === 0) {
        return null;
      }
      return {
        id: it.id,
        title: it.title,
        ...(beforeScreenshot.length > 0 ? { beforeScreenshot } : {}),
        ...(afterScreenshot.length > 0 ? { afterScreenshot } : {}),
        ...(uploadScreenshot.length > 0 ? { uploadScreenshot } : {}),
      };
    })
    .filter((it): it is ArchivedTaskScreenshotSet["subTasks"][number] => it != null);
  if (
    subTasks.length > 0 ||
    meta.pillarBeforeScreenshot.length > 0 ||
    meta.pillarAfterScreenshot.length > 0 ||
    meta.pillarScreenshot.length > 0
  ) {
    meta.archivedTaskScreenshots = [
      ...meta.archivedTaskScreenshots,
      {
        archivedAt: new Date().toISOString(),
        subTasks,
        ...(meta.pillarBeforeScreenshot.length > 0 ? { pillarBeforeScreenshot: meta.pillarBeforeScreenshot } : {}),
        ...(meta.pillarAfterScreenshot.length > 0 ? { pillarAfterScreenshot: meta.pillarAfterScreenshot } : {}),
        ...(meta.pillarScreenshot.length > 0 ? { pillarScreenshot: meta.pillarScreenshot } : {}),
      },
    ];
    meta.pillarBeforeScreenshot = [];
    meta.pillarAfterScreenshot = [];
    meta.pillarScreenshot = [];
  }
  return meta;
}

function archiveNumericalRecordsForReset(
  meta: ReturnType<typeof rawEnvelopeMeta>,
  norm: NormalizedSubKpis,
): ReturnType<typeof rawEnvelopeMeta> {
  const subTasks: ArchivedNumericalRecordSet["subTasks"] = [];
  for (const it of collectAllSubKpiItems(norm)) {
    const req = resolveSubKpiCompletionRequirements(it);
    if (!subKpiRequiresNumerical(req)) continue;
    const numericalTarget =
      typeof it.numericalTarget === "number" && Number.isFinite(it.numericalTarget)
        ? it.numericalTarget
        : null;
    const numericalValue =
      typeof it.numericalValue === "number" && Number.isFinite(it.numericalValue)
        ? it.numericalValue
        : null;
    if (numericalTarget == null && numericalValue == null) continue;
    subTasks.push({
      id: it.id,
      title: it.title,
      ...(numericalTarget != null ? { numericalTarget } : {}),
      ...(numericalValue != null ? { numericalValue } : {}),
    });
  }
  if (meta.pillarCompletionRequirements && subKpiRequiresNumerical(meta.pillarCompletionRequirements)) {
    const numericalTarget = meta.pillarNumericalTarget;
    const numericalValue = meta.pillarNumericalValue;
    if (numericalTarget != null || numericalValue != null) {
      subTasks.push({
        id: PILLAR_ONLY_VIRTUAL_SUBKPI_ID,
        title: "Task",
        ...(numericalTarget != null ? { numericalTarget } : {}),
        ...(numericalValue != null ? { numericalValue } : {}),
      });
    }
  }
  if (subTasks.length > 0) {
    meta.archivedNumericalRecords = [
      ...meta.archivedNumericalRecords,
      {
        archivedAt: new Date().toISOString(),
        subTasks,
      },
    ];
  }
  return meta;
}

function clearPillarForReset(meta: ReturnType<typeof rawEnvelopeMeta>): ReturnType<typeof rawEnvelopeMeta> {
  meta.pillarDone = false;
  meta.pillarNumericalValue = null;
  if (meta.pillarCompletionRequirements && subKpiRequiresNumerical(meta.pillarCompletionRequirements)) {
    meta.pillarNumericalTarget = null;
  }
  return meta;
}

function clearActiveSubKpiForReset(it: SubKpiItem): SubKpiItem {
  const next = { ...it, done: false };
  delete next.beforeScreenshot;
  delete next.afterScreenshot;
  delete next.uploadScreenshot;
  const req = resolveSubKpiCompletionRequirements(it);
  if (subKpiRequiresNumerical(req)) {
    delete next.numericalValue;
    delete next.numericalTarget;
  }
  return next;
}

export function resetAllSubKpiDone(raw: unknown): Prisma.InputJsonValue {
  const n = normalizeSubKpis(raw);
  let meta = archiveScreenshotsForReset(raw, n);
  meta = archiveNumericalRecordsForReset(meta, n);
  meta = clearPillarForReset(meta);
  if (n.segmented) {
    const segments = n.segments.map((seg) => ({
      ...seg,
      items: seg.items.map(clearActiveSubKpiForReset),
    }));
    return withEnvelopeMeta(wrapForPersist({ segmented: true, segments }), meta);
  }
  const flat = n.flat.map(clearActiveSubKpiForReset);
  return withEnvelopeMeta(wrapForPersist({ segmented: false, flat }), meta);
}

export function setSubKpiItemDone(raw: unknown, subKpiId: string, done: boolean): Prisma.InputJsonValue {
  if (subKpiId === PILLAR_ONLY_VIRTUAL_SUBKPI_ID && isPillarOnlyTask(raw)) {
    return setPillarDone(raw, done);
  }
  const n = normalizeSubKpis(raw);
  if (n.segmented) {
    const segments = n.segments.map((seg) => ({
      ...seg,
      items: seg.items.map((it) => (it.id === subKpiId ? { ...it, done } : it)),
    }));
    return wrapForPersistWithExistingMeta({ segmented: true, segments }, raw);
  }
  const flat = n.flat.map((it) => (it.id === subKpiId ? { ...it, done } : it));
  return wrapForPersistWithExistingMeta({ segmented: false, flat }, raw);
}

export function subKpiAssignedAgentId(item: SubKpiItem): string | null {
  const id = item.assignedAgentId?.trim();
  return id ? id : null;
}

/** Match sub-task assignee to the signed-in operator by Agent id or display name. */
export function subKpiAssignedToOperator(
  item: SubKpiItem,
  operator: { id?: string | null; name?: string | null },
): boolean {
  const operatorId = operator.id?.trim();
  const subAssigneeId = subKpiAssignedAgentId(item);
  if (operatorId && subAssigneeId === operatorId) return true;
  const operatorName = (operator.name ?? "").trim();
  const subAssigneeName = (item.assignedAgentName ?? "").trim();
  if (!operatorName || !subAssigneeName) return false;
  return normalizePersonName(operatorName) === normalizePersonName(subAssigneeName);
}

export const SUB_KPI_PROGRESS_MISMATCH_WARNING =
  "If you check this it will not record to your own progress";

export type SubKpiProgressOwner = {
  id: string;
  name: string;
  role: "Assignee" | "Sub-assignee" | "Unassigned";
};

/** Single contributor credited for a sub-task in personal KPI metrics. */
export function subKpiProgressOwner(
  item: SubKpiItem,
  parentAssignee?: { id: string; name: string } | null,
): SubKpiProgressOwner {
  const subAssigneeId = subKpiAssignedAgentId(item);
  const parentAssigneeId = parentAssignee?.id?.trim() || "";
  if (subAssigneeId) {
    return {
      id: subAssigneeId,
      name: item.assignedAgentName?.trim() || parentAssignee?.name?.trim() || "Assigned user",
      role: subAssigneeId === parentAssigneeId ? "Assignee" : "Sub-assignee",
    };
  }
  if (parentAssigneeId) {
    return {
      id: parentAssigneeId,
      name: parentAssignee?.name?.trim() || "Assigned user",
      role: "Assignee",
    };
  }
  return { id: "__unassigned__", name: "Unassigned", role: "Unassigned" };
}

export function operatorIsMainKpiAssignee(
  parentAssignee: { id: string; name: string } | null | undefined,
  operator: { id?: string | null; name?: string | null },
): boolean {
  const parentId = parentAssignee?.id?.trim() || "";
  if (!parentId) return false;
  if (operator.id?.trim() === parentId) return true;
  const parentName = (parentAssignee?.name ?? "").trim();
  const operatorName = (operator.name ?? "").trim();
  if (!parentName || !operatorName) return false;
  return normalizePersonName(parentName) === normalizePersonName(operatorName);
}

export function operatorOwnsSubKpiProgress(
  item: SubKpiItem,
  parentAssignee: { id: string; name: string } | null | undefined,
  operator: { id?: string | null; name?: string | null },
): boolean {
  const owner = subKpiProgressOwner(item, parentAssignee);
  if (owner.id === "__unassigned__") return false;
  if (operator.id?.trim() && owner.id === operator.id.trim()) return true;
  const operatorName = (operator.name ?? "").trim();
  const ownerName = owner.name.trim();
  if (!operatorName || !ownerName) return false;
  return normalizePersonName(operatorName) === normalizePersonName(ownerName);
}

/** True when the signed-in operator can check the box but progress credits another assignee. */
export function subKpiProgressMismatchWarning(
  item: SubKpiItem,
  parentAssignee: { id: string; name: string } | null | undefined,
  operator: { id?: string | null; name?: string | null },
): boolean {
  if (!operator.id && !operator.name?.trim()) return false;
  return !operatorOwnsSubKpiProgress(item, parentAssignee, operator);
}

export function hasSubKpiAssignedTo(raw: unknown, agentId: string | null | undefined): boolean {
  const id = agentId?.trim();
  if (!id) return false;
  const items = isItProjectEnvelope(raw)
    ? itProjectAllItems(parseItProjectSubKpis(raw))
    : collectAllSubKpiItems(normalizeSubKpis(raw));
  return items.some((it) => subKpiAssignedAgentId(it) === id);
}

export function setSubKpiItemAssignee(
  raw: unknown,
  subKpiId: string,
  assignee: { id: string; name: string } | null,
): Prisma.InputJsonValue {
  const n = normalizeSubKpis(raw);
  const touch = (it: SubKpiItem): SubKpiItem => {
    if (it.id !== subKpiId) return it;
    const next = { ...it };
    if (assignee) {
      next.assignedAgentId = assignee.id;
      next.assignedAgentName = assignee.name;
    } else {
      delete next.assignedAgentId;
      delete next.assignedAgentName;
    }
    return next;
  };
  if (n.segmented) {
    const segments = n.segments.map((seg) => ({
      ...seg,
      items: seg.items.map(touch),
    }));
    return wrapForPersistWithExistingMeta({ segmented: true, segments }, raw);
  }
  const flat = n.flat.map(touch);
  return wrapForPersistWithExistingMeta({ segmented: false, flat }, raw);
}

export function setSubKpiItemAssistanceRequested(
  raw: unknown,
  subKpiId: string,
  byAgentId: string,
  atIso: string = new Date().toISOString(),
): Prisma.InputJsonValue | null {
  const n = normalizeSubKpis(raw);
  let found = false;
  const touch = (it: SubKpiItem): SubKpiItem => {
    if (it.id !== subKpiId) return it;
    found = true;
    return {
      ...it,
      assistanceRequested: true,
      assistanceRequestedAt: atIso,
      assistanceRequestedBy: byAgentId,
    };
  };
  if (n.segmented) {
    const segments = n.segments.map((seg) => ({
      ...seg,
      items: seg.items.map(touch),
    }));
    if (!found) return null;
    return wrapForPersistWithExistingMeta({ segmented: true, segments }, raw);
  }
  const flat = n.flat.map(touch);
  if (!found) return null;
  return wrapForPersistWithExistingMeta({ segmented: false, flat }, raw);
}

export function setSubKpiItemScreenshots(
  raw: unknown,
  subKpiId: string,
  slot: TaskScreenshotSlot,
  screenshots: TaskScreenshotMetaItem[],
): Prisma.InputJsonValue {
  const n = normalizeSubKpis(raw);
  const key =
    slot === "before" ? "beforeScreenshot" : slot === "after" ? "afterScreenshot" : "uploadScreenshot";
  const touch = (it: SubKpiItem): SubKpiItem =>
    it.id === subKpiId ? { ...it, [key]: screenshots } : it;
  if (n.segmented) {
    return wrapForPersistWithExistingMeta({
      segmented: true,
      segments: n.segments.map((seg) => ({ ...seg, items: seg.items.map(touch) })),
    }, raw);
  }
  return wrapForPersistWithExistingMeta({ segmented: false, flat: n.flat.map(touch) }, raw);
}

export function removeSubKpiItemScreenshot(
  raw: unknown,
  subKpiId: string,
  slot: TaskScreenshotSlot,
  storedFileName: string,
): Prisma.InputJsonValue {
  const n = normalizeSubKpis(raw);
  const key =
    slot === "before" ? "beforeScreenshot" : slot === "after" ? "afterScreenshot" : "uploadScreenshot";
  const touch = (it: SubKpiItem): SubKpiItem => {
    if (it.id !== subKpiId) return it;
    const nextScreenshots = (it[key] ?? []).filter((item) => item.storedFileName !== storedFileName);
    return { ...it, [key]: nextScreenshots };
  };
  if (n.segmented) {
    return wrapForPersistWithExistingMeta({
      segmented: true,
      segments: n.segments.map((seg) => ({ ...seg, items: seg.items.map(touch) })),
    }, raw);
  }
  return wrapForPersistWithExistingMeta({ segmented: false, flat: n.flat.map(touch) }, raw);
}

/** When marking an IT Project sub-task done, default actual date to today (timezone) if unset. Clears actual date when unchecked. */
export function applyItProjectSubTaskDoneMeta(
  raw: unknown,
  subKpiId: string,
  done: boolean,
  timeZone: string,
): Prisma.InputJsonValue {
  const n = normalizeSubKpis(raw);
  const zone = normalizeTimeZone(timeZone);
  const today =
    DateTime.now().setZone(zone).toISODate() ?? DateTime.utc().toISODate() ?? undefined;
  const touch = (it: SubKpiItem): SubKpiItem => {
    if (it.id !== subKpiId) return it;
    if (!done) {
      const next = { ...it, done: false };
      delete (next as { actualDate?: string }).actualDate;
      return next;
    }
    const hasActual = Boolean(it.actualDate?.trim());
    return {
      ...it,
      done: true,
      ...(!hasActual && today ? { actualDate: today } : {}),
    };
  };
  if (n.segmented) {
    const segments = n.segments.map((seg) => ({
      ...seg,
      items: seg.items.map(touch),
    }));
    return wrapForPersistWithExistingMeta({ segmented: true, segments }, raw);
  }
  const flat = n.flat.map(touch);
  return wrapForPersistWithExistingMeta({ segmented: false, flat }, raw);
}

export function setSubKpiItemScheduleMeta(
  raw: unknown,
  subKpiId: string,
  meta: { startDate?: string | null; dueDate?: string | null; actualDate?: string | null },
): Prisma.InputJsonValue {
  const n = normalizeSubKpis(raw);
  const start =
    meta.startDate === undefined ? undefined : normalizeOptionalSubKpiYmd(meta.startDate) ?? null;
  const due =
    meta.dueDate === undefined ? undefined : normalizeOptionalSubKpiYmd(meta.dueDate) ?? null;
  const act =
    meta.actualDate === undefined ? undefined : normalizeOptionalSubKpiYmd(meta.actualDate) ?? null;
  const touch = (it: SubKpiItem): SubKpiItem => {
    if (it.id !== subKpiId) return it;
    let next = { ...it };
    if (start !== undefined) {
      if (start) next = { ...next, startDate: start };
      else {
        delete (next as { startDate?: string }).startDate;
      }
    }
    if (due !== undefined) {
      if (due) next = { ...next, dueDate: due };
      else {
        delete (next as { dueDate?: string }).dueDate;
      }
    }
    if (act !== undefined) {
      if (act) next = { ...next, actualDate: act };
      else {
        delete (next as { actualDate?: string }).actualDate;
      }
    }
    return next;
  };
  if (n.segmented) {
    const segments = n.segments.map((seg) => ({
      ...seg,
      items: seg.items.map(touch),
    }));
    return wrapForPersistWithExistingMeta({ segmented: true, segments }, raw);
  }
  const flat = n.flat.map(touch);
  return wrapForPersistWithExistingMeta({ segmented: false, flat }, raw);
}

export function setSubKpiItemWorkMeta(
  raw: unknown,
  subKpiId: string,
  meta: {
    startDate?: string | null;
    dueDate?: string | null;
    actualDate?: string | null;
    location?: string | null;
    projectPriority?: string | null;
    numericalValue?: number | null;
    numericalTarget?: number | null;
  },
): Prisma.InputJsonValue {
  if (subKpiId === PILLAR_ONLY_VIRTUAL_SUBKPI_ID && isPillarOnlyTask(raw)) {
    return setPillarWorkMeta(raw, {
      dueDate: meta.dueDate,
      actualDate: meta.actualDate,
      numericalValue: meta.numericalValue,
      numericalTarget: meta.numericalTarget,
    });
  }
  const n = normalizeSubKpis(raw);
  const start =
    meta.startDate === undefined ? undefined : normalizeOptionalSubKpiYmd(meta.startDate) ?? null;
  const due =
    meta.dueDate === undefined ? undefined : normalizeOptionalSubKpiYmd(meta.dueDate) ?? null;
  const act =
    meta.actualDate === undefined ? undefined : normalizeOptionalSubKpiYmd(meta.actualDate) ?? null;
  const location =
    meta.location === undefined
      ? undefined
      : typeof meta.location === "string" && meta.location.trim()
        ? meta.location.trim().slice(0, 160)
        : null;
  const projectPriority =
    meta.projectPriority === undefined ? undefined : normalizeSubKpiPriority(meta.projectPriority);
  const touch = (it: SubKpiItem): SubKpiItem => {
    if (it.id !== subKpiId) return it;
    let next = { ...it };
    if (start !== undefined) {
      if (start) next = { ...next, startDate: start };
      else delete (next as { startDate?: string }).startDate;
    }
    if (due !== undefined) {
      if (due) next = { ...next, dueDate: due };
      else delete (next as { dueDate?: string }).dueDate;
    }
    if (act !== undefined) {
      if (act) next = { ...next, actualDate: act };
      else delete (next as { actualDate?: string }).actualDate;
    }
    if (location !== undefined) {
      if (location) next = { ...next, location };
      else delete (next as { location?: string }).location;
    }
    if (projectPriority !== undefined) {
      if (projectPriority) next = { ...next, projectPriority };
      else delete (next as { projectPriority?: SubKpiItem["projectPriority"] }).projectPriority;
    }
    if (meta.numericalValue !== undefined) {
      if (meta.numericalValue != null && Number.isFinite(meta.numericalValue)) {
        next = { ...next, numericalValue: meta.numericalValue };
      } else {
        delete (next as { numericalValue?: number }).numericalValue;
      }
    }
    if (meta.numericalTarget !== undefined) {
      if (meta.numericalTarget != null && Number.isFinite(meta.numericalTarget)) {
        next = { ...next, numericalTarget: meta.numericalTarget };
      } else {
        delete (next as { numericalTarget?: number }).numericalTarget;
      }
    }
    return next;
  };
  if (n.segmented) {
    const segments = n.segments.map((seg) => ({
      ...seg,
      items: seg.items.map(touch),
    }));
    return wrapForPersistWithExistingMeta({ segmented: true, segments }, raw);
  }
  const flat = n.flat.map(touch);
  return wrapForPersistWithExistingMeta({ segmented: false, flat }, raw);
}

export function markEverySubKpiDone(raw: unknown, done: boolean): Prisma.InputJsonValue {
  if (isPillarOnlyTask(raw)) {
    return setPillarDone(raw, done);
  }
  const n = normalizeSubKpis(raw);
  if (n.segmented) {
    const segments = n.segments.map((seg) => ({
      ...seg,
      items: seg.items.map((it) => ({ ...it, done })),
    }));
    return wrapForPersistWithExistingMeta({ segmented: true, segments }, raw);
  }
  const flat = n.flat.map((it) => ({ ...it, done }));
  return wrapForPersistWithExistingMeta({ segmented: false, flat }, raw);
}

function subKpiFromStructuredItem(it: Record<string, unknown>): SubKpiItem | null {
  const title = typeof it.title === "string" ? it.title.trim() : "";
  if (!title) return null;
  const id = typeof it.id === "string" && it.id.trim() ? it.id.trim() : crypto.randomUUID();
  const description = normalizeSubKpiDescription(it.description);
  const assignedAgentId = typeof it.assignedAgentId === "string" ? it.assignedAgentId.trim() : "";
  const assignedAgentName = typeof it.assignedAgentName === "string" ? it.assignedAgentName.trim() : "";
  const beforeScreenshot = parseTaskScreenshotMetaList(it.beforeScreenshot);
  const afterScreenshot = parseTaskScreenshotMetaList(it.afterScreenshot);
  const completionMode = isSubKpiCompletionMode(it.completionMode)
    ? it.completionMode
    : resolveSubKpiCompletionMode({
        completionMode: undefined,
        screenshotsEnabled: it.screenshotsEnabled === true,
        beforeScreenshot,
        afterScreenshot,
      });
  const screenshotsEnabled = it.screenshotsEnabled === true || subKpiRequiresScreenshotsFromMode(completionMode);
  const startDate = normalizeOptionalSubKpiYmd(it.startDate);
  const dueDate = normalizeOptionalSubKpiYmd(it.dueDate);
  const actualDate = normalizeOptionalSubKpiYmd(it.actualDate);
  return {
    id,
    title,
    ...(description ? { description } : {}),
    done: Boolean(it.done),
    ...(assignedAgentId ? { assignedAgentId } : {}),
    ...(assignedAgentName ? { assignedAgentName } : {}),
    ...(completionMode !== "checkbox" ? { completionMode } : {}),
    ...(screenshotsEnabled ? { screenshotsEnabled: true } : {}),
    ...(beforeScreenshot.length > 0 ? { beforeScreenshot } : {}),
    ...(afterScreenshot.length > 0 ? { afterScreenshot } : {}),
    ...(startDate ? { startDate } : {}),
    ...(dueDate ? { dueDate } : {}),
    ...(actualDate ? { actualDate } : {}),
  };
}

export type ItProjectSubKpiDraft = { title: string; startDate: string; endDate: string };

/** Build flat checklist for IT Project Implementation (no segments, no task-level dates). */
export function buildItProjectSubKpis(
  items: ItProjectSubKpiDraft[],
): { ok: true; norm: NormalizedSubKpis } | { ok: false; error: string } {
  const flat: SubKpiItem[] = [];
  for (const item of items) {
    const title = item.title.trim();
    const startDate = normalizeOptionalSubKpiYmd(item.startDate);
    const endDate = normalizeOptionalSubKpiYmd(item.endDate);
    if (!title) continue;
    if (!startDate || !endDate) {
      return { ok: false, error: "Each sub-task needs a start date and end date." };
    }
    if (endDate < startDate) {
      return { ok: false, error: `Sub-task "${title}": end date must be on or after start date.` };
    }
    flat.push({ id: crypto.randomUUID(), title, done: false, startDate, dueDate: endDate });
  }
  if (flat.length === 0) {
    return { ok: false, error: "Add at least one sub-task with start and end dates." };
  }
  return { ok: true, norm: { segmented: false, flat } };
}

/** Exported for client-side save validation (must match segmented KPI rules). */
export const MIN_SEGMENTED_SUBKPIS_FOR_CREATE = 3;
const MIN_SEGMENTED_SUBKPIS = MIN_SEGMENTED_SUBKPIS_FOR_CREATE;

type SubKpiCreateDraft = string | {
  title?: string | null;
  description?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  endDate?: string | null;
  actualDate?: string | null;
  projectPriority?: string | null;
  screenshotsEnabled?: boolean | null;
  completionRequirements?: SubKpiCompletionRequirements | null;
  numericalTarget?: number | null;
  dailyPenaltyAmount?: number | null;
};

function subKpiFromCreateDraft(input: SubKpiCreateDraft): SubKpiItem | null {
  const rawTitle = typeof input === "string" ? input : input.title;
  const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
  if (!title) return null;
  const description = typeof input === "string" ? "" : normalizeSubKpiDescription(input.description);
  const projectPriority =
    typeof input === "string" ? null : normalizeSubKpiPriority(input.projectPriority);
  const startDate = typeof input === "string" ? null : normalizeOptionalSubKpiYmd(input.startDate);
  const dueDate = typeof input === "string" ? null : normalizeOptionalSubKpiYmd(input.dueDate ?? input.endDate);
  const actualDate = typeof input === "string" ? null : normalizeOptionalSubKpiYmd(input.actualDate);
  const numericalTarget =
    typeof input !== "string" &&
    typeof input.numericalTarget === "number" &&
    Number.isFinite(input.numericalTarget)
      ? input.numericalTarget
      : null;
  let item: SubKpiItem = {
    id: crypto.randomUUID(),
    title,
    ...(description ? { description } : {}),
    done: false,
    ...(projectPriority ? { projectPriority } : {}),
    ...(startDate ? { startDate } : {}),
    ...(dueDate ? { dueDate } : {}),
    ...(actualDate ? { actualDate } : {}),
  };
  if (typeof input !== "string" && input.completionRequirements) {
    item = applySubKpiCompletionRequirements(item, input.completionRequirements);
  } else {
    const screenshotsEnabled = typeof input === "string" ? false : input.screenshotsEnabled === true;
    item = applySubKpiCompletionRequirements(
      item,
      completionRequirementsFromLegacyMode(screenshotsEnabled ? "both" : "checkbox"),
    );
  }
  if (numericalTarget != null) {
    item = { ...item, numericalTarget };
  }
  const dailyPenaltyAmount =
    typeof input !== "string" &&
    typeof input.dailyPenaltyAmount === "number" &&
    Number.isFinite(input.dailyPenaltyAmount) &&
    input.dailyPenaltyAmount >= 0
      ? input.dailyPenaltyAmount
      : null;
  if (dailyPenaltyAmount != null) {
    item = { ...item, dailyPenaltyAmount };
  }
  return item;
}

export function validateSegmentStructureForPersist(
  segmented: boolean,
  flatInput: SubKpiCreateDraft[],
  segmentsInput: Array<{ label: string; items: SubKpiCreateDraft[] }> | undefined,
  options?: { allowPillarOnly?: boolean },
): { ok: true; norm: NormalizedSubKpis } | { ok: false; error: string } {
  if (!segmented) {
    const flat = flatInput
      .map(subKpiFromCreateDraft)
      .filter((item): item is SubKpiItem => item != null);
    if (flat.length === 0) {
      if (options?.allowPillarOnly) {
        return { ok: true, norm: { segmented: false, flat: [] } };
      }
      return { ok: false, error: "At least one sub-task is required." };
    }
    return { ok: true, norm: { segmented: false, flat } };
  }

  const total =
    segmentsInput?.reduce(
      (acc, seg) => acc + seg.items.map(subKpiFromCreateDraft).filter(Boolean).length,
      0,
    ) ?? 0;
  if (total < MIN_SEGMENTED_SUBKPIS) {
    return {
      ok: false,
      error: `Segmented checklists require at least ${MIN_SEGMENTED_SUBKPIS} sub-tasks across segments.`,
    };
  }

  if (!segmentsInput || segmentsInput.length === 0) {
    return { ok: false, error: "Add at least one segment with a label before adding sub-tasks." };
  }

  const segments: SubKpiSegment[] = [];
  for (const seg of segmentsInput) {
    const label = seg.label.trim();
    if (!label) {
      return { ok: false, error: "Each segment needs a label before saving." };
    }
    const items = seg.items
      .map(subKpiFromCreateDraft)
      .filter((item): item is SubKpiItem => item != null);
    segments.push({ id: crypto.randomUUID(), label, items });
    if (items.length === 0) {
      return { ok: false, error: `Segment "${label}" has no sub-tasks; add titles or remove the segment.` };
    }
  }

  return { ok: true, norm: { segmented: true, segments } };
}

export function validateStructuredUpdate(
  body: unknown,
): { ok: true; norm: NormalizedSubKpis } | { ok: false; error: string } {
  if (!isPlainObject(body)) return { ok: false, error: "Invalid sub-task payload." };
  const segmented = body.segmented === true;
  if (segmented) {
    const segs = body.segments;
    if (!Array.isArray(segs) || segs.length === 0) {
      return { ok: false, error: "segmented payloads require segments array." };
    }
    const segmentsOut: SubKpiSegment[] = [];
    let totalItems = 0;
    for (const s of segs) {
      if (!isPlainObject(s)) continue;
      const label = typeof s.label === "string" ? s.label.trim() : "";
      if (!label) return { ok: false, error: "Each segment must have a label." };
      const sid = typeof s.id === "string" && s.id.trim() ? s.id.trim() : crypto.randomUUID();
      const rawItems = Array.isArray(s.items) ? s.items : [];
      const items: SubKpiItem[] = [];
      for (const it of rawItems) {
        if (!isPlainObject(it)) continue;
        const row = subKpiFromStructuredItem(it);
        if (row) items.push(row);
      }
      if (items.length === 0) {
        return { ok: false, error: `Segment "${label}" cannot be empty.` };
      }
      totalItems += items.length;
      segmentsOut.push({ id: sid, label, items });
    }
    if (totalItems < MIN_SEGMENTED_SUBKPIS) {
      return {
        ok: false,
        error: `Segmented tasks must keep at least ${MIN_SEGMENTED_SUBKPIS} sub-tasks in total.`,
      };
    }
    return { ok: true, norm: { segmented: true, segments: segmentsOut } };
  }
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const flat: SubKpiItem[] = [];
  for (const it of rawItems) {
    if (!isPlainObject(it)) continue;
    const row = subKpiFromStructuredItem(it);
    if (row) flat.push(row);
  }
  if (flat.length === 0) {
    return { ok: false, error: "Flat checklist needs at least one sub-task." };
  }
  return { ok: true, norm: { segmented: false, flat } };
}

export type AppendSubKpiInput = {
  title: string;
  description?: string | null;
  segmentId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  projectPriority?: string | null;
  screenshotsEnabled?: boolean;
};

/** Append one sub-task to an existing flat or segmented checklist (preserves envelope metadata). */
export function appendSubKpiItem(
  raw: unknown,
  input: AppendSubKpiInput,
): { ok: true; json: Prisma.InputJsonValue } | { ok: false; error: string } {
  const item = subKpiFromCreateDraft({
    title: input.title,
    description: input.description,
    startDate: input.startDate,
    dueDate: input.dueDate,
    projectPriority: input.projectPriority,
    screenshotsEnabled: input.screenshotsEnabled,
  });
  if (!item) return { ok: false, error: "Sub Task title is required." };

  const n = normalizeSubKpis(raw);
  if (n.segmented) {
    const segmentId = typeof input.segmentId === "string" ? input.segmentId.trim() : "";
    if (!segmentId) {
      return { ok: false, error: "Choose a segment before adding a Sub Task." };
    }
    const segIdx = n.segments.findIndex((seg) => seg.id === segmentId);
    if (segIdx < 0) return { ok: false, error: "Segment not found." };
    const segments = n.segments.map((seg, idx) =>
      idx === segIdx ? { ...seg, items: [...seg.items, item] } : seg,
    );
    return { ok: true, json: wrapForPersistWithExistingMeta({ segmented: true, segments }, raw) };
  }

  return {
    ok: true,
    json: wrapForPersistWithExistingMeta({ segmented: false, flat: [...n.flat, item] }, raw),
  };
}

export type UpdateSubKpiItemInput = {
  title?: string;
  description?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  projectPriority?: string | null;
  completionMode?: SubKpiCompletionMode;
  numericalTarget?: number | null;
  dailyPenaltyAmount?: number | null;
};

/** Update Sub Task title and/or schedule fields (preserves other item metadata). */
export function updateSubKpiItem(
  raw: unknown,
  subKpiId: string,
  input: UpdateSubKpiItemInput,
): { ok: true; json: Prisma.InputJsonValue } | { ok: false; error: string } {
  const id = subKpiId.trim();
  if (!id) return { ok: false, error: "Sub Task id is required." };

  const n = normalizeSubKpis(raw);
  const allItems = n.segmented ? n.segments.flatMap((seg) => seg.items) : n.flat;
  if (!allItems.some((item) => item.id === id)) {
    return { ok: false, error: "Sub Task not found." };
  }

  const title =
    input.title === undefined ? undefined : typeof input.title === "string" ? input.title.trim() : "";
  if (title !== undefined && !title) {
    return { ok: false, error: "Sub Task title is required." };
  }

  const description =
    input.description === undefined ? undefined : normalizeSubKpiDescription(input.description);
  const projectPriority =
    input.projectPriority === undefined ? undefined : normalizeSubKpiPriority(input.projectPriority);
  const startDate =
    input.startDate === undefined ? undefined : normalizeOptionalSubKpiYmd(input.startDate) ?? null;
  const dueDate =
    input.dueDate === undefined ? undefined : normalizeOptionalSubKpiYmd(input.dueDate) ?? null;
  const completionMode =
    input.completionMode === undefined
      ? undefined
      : isSubKpiCompletionMode(input.completionMode)
        ? input.completionMode
        : undefined;
  const numericalTarget =
    input.numericalTarget === undefined
      ? undefined
      : typeof input.numericalTarget === "number" && Number.isFinite(input.numericalTarget)
        ? input.numericalTarget
        : null;
  const dailyPenaltyAmount =
    input.dailyPenaltyAmount === undefined
      ? undefined
      : typeof input.dailyPenaltyAmount === "number" && Number.isFinite(input.dailyPenaltyAmount)
        ? Math.max(0, input.dailyPenaltyAmount)
        : null;

  const touch = (item: SubKpiItem): SubKpiItem => {
    if (item.id !== id) return item;
    let next = { ...item };
    if (title !== undefined) next = { ...next, title };
    if (description !== undefined) {
      if (description) next = { ...next, description };
      else delete (next as { description?: string }).description;
    }
    if (projectPriority !== undefined) {
      if (projectPriority) next = { ...next, projectPriority };
      else delete (next as { projectPriority?: SubKpiItem["projectPriority"] }).projectPriority;
    }
    if (startDate !== undefined) {
      if (startDate) next = { ...next, startDate };
      else delete (next as { startDate?: string }).startDate;
    }
    if (dueDate !== undefined) {
      if (dueDate) next = { ...next, dueDate };
      else delete (next as { dueDate?: string }).dueDate;
    }
    if (completionMode !== undefined) {
      next = applySubKpiCompletionMode(next, completionMode);
    }
    if (numericalTarget !== undefined) {
      if (numericalTarget != null) next = { ...next, numericalTarget };
      else delete (next as { numericalTarget?: number }).numericalTarget;
    }
    if (dailyPenaltyAmount !== undefined) {
      if (dailyPenaltyAmount != null) next = { ...next, dailyPenaltyAmount };
      else delete (next as { dailyPenaltyAmount?: number }).dailyPenaltyAmount;
    }
    return next;
  };

  if (n.segmented) {
    const segments = n.segments.map((seg) => ({
      ...seg,
      items: seg.items.map(touch),
    }));
    return { ok: true, json: wrapForPersistWithExistingMeta({ segmented: true, segments }, raw) };
  }

  return {
    ok: true,
    json: wrapForPersistWithExistingMeta({ segmented: false, flat: n.flat.map(touch) }, raw),
  };
}

/** Remove one Sub Task from a flat or segmented checklist (preserves envelope metadata). */
export function removeSubKpiItem(
  raw: unknown,
  subKpiId: string,
): { ok: true; json: Prisma.InputJsonValue } | { ok: false; error: string } {
  const id = subKpiId.trim();
  if (!id) return { ok: false, error: "Sub Task id is required." };

  const n = normalizeSubKpis(raw);
  if (n.segmented) {
    const targetSegment = n.segments.find((seg) => seg.items.some((item) => item.id === id));
    if (!targetSegment) return { ok: false, error: "Sub Task not found." };
    if (targetSegment.items.length <= 1) {
      return { ok: false, error: "Each segment must keep at least one Sub Task." };
    }
    const totalAfter = collectAllSubKpiItems(n).length - 1;
    if (totalAfter < MIN_SEGMENTED_SUBKPIS) {
      return {
        ok: false,
        error: `Segmented checklists must keep at least ${MIN_SEGMENTED_SUBKPIS} Sub Tasks in total.`,
      };
    }
    const segments = n.segments.map((seg) => ({
      ...seg,
      items: seg.items.filter((item) => item.id !== id),
    }));
    return { ok: true, json: wrapForPersistWithExistingMeta({ segmented: true, segments }, raw) };
  }

  if (n.flat.length <= 1) {
    return { ok: false, error: "Checklists must keep at least one Sub Task." };
  }
  const flat = n.flat.filter((item) => item.id !== id);
  return { ok: true, json: wrapForPersistWithExistingMeta({ segmented: false, flat }, raw) };
}

/** Remove schedule start dates from all sub-tasks (used when cadence becomes daily). */
export function stripSubKpiStartDates(raw: unknown): Prisma.InputJsonValue {
  const n = normalizeSubKpis(raw);
  const strip = (item: SubKpiItem): SubKpiItem => {
    const next = { ...item };
    delete (next as { startDate?: string }).startDate;
    return next;
  };
  if (n.segmented) {
    const segments = n.segments.map((seg) => ({
      ...seg,
      items: seg.items.map(strip),
    }));
    return wrapForPersistWithExistingMeta({ segmented: true, segments }, raw);
  }
  return wrapForPersistWithExistingMeta({ segmented: false, flat: n.flat.map(strip) }, raw);
}

/** Sub-tasks without a checkbox requirement auto-complete when other requirements are met. */
export function syncSubKpiDoneFromRequirements(raw: unknown, subKpiId: string): Prisma.InputJsonValue {
  if (subKpiId === PILLAR_ONLY_VIRTUAL_SUBKPI_ID && isPillarOnlyTask(raw)) {
    return syncPillarDoneFromRequirements(raw);
  }
  const n = normalizeSubKpis(raw);
  const items = n.segmented ? n.segments.flatMap((seg) => seg.items) : n.flat;
  const item = items.find((row) => row.id === subKpiId);
  if (!item) return raw as Prisma.InputJsonValue;
  const req = resolveSubKpiCompletionRequirements(item);
  if (req.checkbox) {
    if (resolveSubKpiCompletionMode(item) !== "screenshots") return raw as Prisma.InputJsonValue;
  }
  const shouldBeDone = subKpiRequirementsMet(item);
  if (Boolean(item.done) === shouldBeDone) return raw as Prisma.InputJsonValue;
  return setSubKpiItemDone(raw, subKpiId, shouldBeDone);
}

/** @deprecated use syncSubKpiDoneFromRequirements */
export function syncScreenshotOnlySubKpiDone(raw: unknown, subKpiId: string): Prisma.InputJsonValue {
  return syncSubKpiDoneFromRequirements(raw, subKpiId);
}
