import type { Prisma } from "@prisma/client/primary";
import { DateTime } from "luxon";
import {
  collectAllSubKpiItems,
  kpiChecklistProgress,
  normalizeSubKpis,
  type KpiChecklistProgress,
  type SubKpiItem,
} from "@/lib/kpi-subkpis";
import { normalizeTimeZone } from "@/lib/kpi-recurrence";
import { parseTaskScreenshotMetaList } from "@/lib/task-screenshot-meta";
import { hasValidActualDate, normalizeOptionalUsDate } from "@/lib/us-date-format";

export type ItProjectPhase = {
  id: string;
  name: string;
  /** Phase target / due date (YYYY-MM-DD). Subtask due dates must be on or before this when set. */
  dueDate?: string | null;
  items: SubKpiItem[];
};

export type ItProjectData = {
  activePhaseId: string;
  phases: ItProjectPhase[];
};

export const IT_PROJECT_ENVELOPE_KIND = "it_project" as const;
export const IT_PROJECT_PRIORITY_OPTIONS = ["High", "Medium", "Low"] as const;
export const IT_PROJECT_STATUS_OPTIONS = ["Pending", "On Going", "Finalizing", "Done"] as const;

export type ItProjectPriority = (typeof IT_PROJECT_PRIORITY_OPTIONS)[number];
export type ItProjectStatus = (typeof IT_PROJECT_STATUS_OPTIONS)[number];

export function normalizeItProjectPriority(value: unknown): ItProjectPriority | null {
  return IT_PROJECT_PRIORITY_OPTIONS.find((option) => option === value) ?? null;
}

export function normalizeItProjectStatus(value: unknown): ItProjectStatus | null {
  return IT_PROJECT_STATUS_OPTIONS.find((option) => option === value) ?? null;
}

export function itProjectStatusProgress(item: SubKpiItem): number {
  const status = normalizeItProjectStatus(item.projectStatus);
  if (status === "Done") return 100;
  if (status === "Finalizing") return 75;
  if (status === "On Going") return 50;
  if (item.assignedAgentId) return 25;
  return 0;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function itemFromRaw(r: Record<string, unknown>): SubKpiItem {
  const id = String(r?.id ?? "").trim() || crypto.randomUUID();
  const title = String(r?.title ?? "").trim();
  const assignedAgentId = typeof r?.assignedAgentId === "string" ? r.assignedAgentId.trim() : "";
  const assignedAgentName = typeof r?.assignedAgentName === "string" ? r.assignedAgentName.trim() : "";
  const projectPriority = normalizeItProjectPriority(r?.projectPriority);
  const projectStatus = normalizeItProjectStatus(r?.projectStatus);
  const beforeScreenshot = parseTaskScreenshotMetaList(r?.beforeScreenshot);
  const afterScreenshot = parseTaskScreenshotMetaList(r?.afterScreenshot);
  const startDate = normalizeOptionalUsDate(r?.startDate);
  const dueDate = normalizeOptionalUsDate(r?.dueDate ?? r?.endDate);
  const actualDate = normalizeOptionalUsDate(r?.actualDate);
  const done = hasValidActualDate({ actualDate });
  const assistanceRequested = r?.assistanceRequested === true;
  const assistanceRequestedAt =
    typeof r?.assistanceRequestedAt === "string" ? r.assistanceRequestedAt.trim() : "";
  const assistanceRequestedBy =
    typeof r?.assistanceRequestedBy === "string" ? r.assistanceRequestedBy.trim() : "";
  return {
    id,
    title,
    done,
    ...(assignedAgentId ? { assignedAgentId } : {}),
    ...(assignedAgentName ? { assignedAgentName } : {}),
    ...(projectPriority ? { projectPriority } : {}),
    ...(projectStatus ? { projectStatus } : {}),
    ...(beforeScreenshot.length > 0 ? { beforeScreenshot } : {}),
    ...(afterScreenshot.length > 0 ? { afterScreenshot } : {}),
    ...(startDate ? { startDate } : {}),
    ...(dueDate ? { dueDate } : {}),
    ...(actualDate ? { actualDate } : {}),
    ...(assistanceRequested ? { assistanceRequested: true } : {}),
    ...(assistanceRequestedAt ? { assistanceRequestedAt } : {}),
    ...(assistanceRequestedBy ? { assistanceRequestedBy } : {}),
  };
}

function phaseFromRaw(raw: unknown, fallbackName: string): ItProjectPhase | null {
  if (!isPlainObject(raw)) return null;
  const name = String(raw.name ?? "").trim() || fallbackName;
  const id = String(raw.id ?? "").trim() || crypto.randomUUID();
  const dueDate = normalizeOptionalUsDate(raw.dueDate);
  const items = Array.isArray(raw.items)
    ? (raw.items as unknown[])
        .map((it) => (isPlainObject(it) ? itemFromRaw(it) : null))
        .filter((x): x is SubKpiItem => x != null && x.title.length > 0)
    : [];
  return { id, name, ...(dueDate ? { dueDate } : {}), items };
}

export type ItProjectStoredEnvelope = {
  kind: typeof IT_PROJECT_ENVELOPE_KIND;
  activePhaseId?: string;
  phases: unknown[];
};

export function isItProjectEnvelope(raw: unknown): raw is ItProjectStoredEnvelope {
  return isPlainObject(raw) && raw.kind === IT_PROJECT_ENVELOPE_KIND && Array.isArray(raw.phases);
}

/** Parse stored JSON for IT Project Implementation (migrates legacy flat checklists). */
export function parseItProjectSubKpis(raw: unknown, fallbackPhaseLabel?: string | null): ItProjectData {
  if (isItProjectEnvelope(raw)) {
    const phases = (raw.phases as unknown[])
      .map((p, i) => phaseFromRaw(p, `Phase ${i + 1}`))
      .filter((p): p is ItProjectPhase => p != null);
    const activePhaseId = String(raw.activePhaseId ?? "").trim();
    if (phases.length > 0) {
      const active = phases.find((p) => p.id === activePhaseId) ?? phases[0]!;
      return { activePhaseId: active.id, phases };
    }
  }

  const legacyFlat = collectAllSubKpiItems(normalizeSubKpis(raw));
  const phaseName = (fallbackPhaseLabel ?? "").trim() || "Phase 1";
  const id = crypto.randomUUID();
  return {
    activePhaseId: id,
    phases: [{ id, name: phaseName, items: legacyFlat }],
  };
}

export function wrapItProjectSubKpis(data: ItProjectData): Prisma.InputJsonValue {
  return {
    kind: IT_PROJECT_ENVELOPE_KIND,
    activePhaseId: data.activePhaseId,
    phases: data.phases.map((p) => ({
      id: p.id,
      name: p.name,
      ...(p.dueDate ? { dueDate: p.dueDate } : {}),
      items: p.items.map((it) => ({
        id: it.id,
        title: it.title,
        done: hasValidActualDate(it),
        ...(it.assignedAgentId ? { assignedAgentId: it.assignedAgentId } : {}),
        ...(it.assignedAgentName ? { assignedAgentName: it.assignedAgentName } : {}),
        ...(it.projectPriority ? { projectPriority: it.projectPriority } : {}),
        ...(it.projectStatus ? { projectStatus: it.projectStatus } : {}),
        ...(it.beforeScreenshot ? { beforeScreenshot: it.beforeScreenshot } : {}),
        ...(it.afterScreenshot ? { afterScreenshot: it.afterScreenshot } : {}),
        ...(it.startDate ? { startDate: it.startDate } : {}),
        ...(it.dueDate ? { dueDate: it.dueDate } : {}),
        ...(it.actualDate ? { actualDate: it.actualDate } : {}),
        ...(typeof it.dailyPenaltyAmount === "number" ? { dailyPenaltyAmount: it.dailyPenaltyAmount } : {}),
        ...(it.assistanceRequested ? { assistanceRequested: true } : {}),
        ...(it.assistanceRequestedAt ? { assistanceRequestedAt: it.assistanceRequestedAt } : {}),
        ...(it.assistanceRequestedBy ? { assistanceRequestedBy: it.assistanceRequestedBy } : {}),
      })),
    })),
  } as Prisma.InputJsonValue;
}

export function itProjectAllItems(data: ItProjectData): SubKpiItem[] {
  return data.phases.flatMap((p) => p.items);
}

export function itProjectChecklistItems(subKpis: unknown): SubKpiItem[] {
  return isItProjectEnvelope(subKpis)
    ? itProjectAllItems(parseItProjectSubKpis(subKpis))
    : collectAllSubKpiItems(normalizeSubKpis(subKpis));
}

function endOfDueDayMs(dueYmd: string, timeZone: string): number | null {
  const dt = DateTime.fromISO(dueYmd, { zone: normalizeTimeZone(timeZone) }).endOf("day");
  if (!dt.isValid) return null;
  return dt.toMillis();
}

/** Sub-task is delayed when actual completion is after due, or work is incomplete past due. */
export function isItProjectSubTaskComplete(item: SubKpiItem): boolean {
  return hasValidActualDate(item);
}

export function isItProjectSubTaskDelayed(
  item: SubKpiItem,
  nowMs: number,
  timeZone: string,
): boolean {
  const due = normalizeOptionalUsDate(item.dueDate);
  if (!due) return false;
  const actual = normalizeOptionalUsDate(item.actualDate);
  if (actual) return actual > due;
  if (item.done) return false;
  const endMs = endOfDueDayMs(due, timeZone);
  if (endMs == null) return false;
  return nowMs > endMs;
}

export function itProjectHasAnyDelay(subKpis: unknown, nowMs: number, timeZone: string): boolean {
  return itProjectChecklistItems(subKpis).some((it) => isItProjectSubTaskDelayed(it, nowMs, timeZone));
}

export function itProjectMaxDelayMs(subKpis: unknown, nowMs: number, timeZone: string): number {
  let maxDelay = 0;
  for (const it of itProjectChecklistItems(subKpis)) {
    const due = normalizeOptionalUsDate(it.dueDate);
    if (!due) continue;
    const endMs = endOfDueDayMs(due, timeZone);
    if (endMs == null) continue;
    const actual = normalizeOptionalUsDate(it.actualDate);
    if (actual && actual > due) {
      const actualStart = DateTime.fromISO(actual, { zone: normalizeTimeZone(timeZone) })
        .startOf("day")
        .toMillis();
      maxDelay = Math.max(maxDelay, Math.max(0, actualStart - endMs));
    } else if (!it.done && nowMs > endMs) {
      maxDelay = Math.max(maxDelay, nowMs - endMs);
    }
  }
  return maxDelay;
}

export type ItProjectSubKpiStatusCounts = {
  total: number;
  completedOnTime: number;
  delayed: number;
  pending: number;
};

/** Per sub-task: on-time complete vs delayed (includes late actual date or overdue incomplete). */
export function countItProjectSubKpiStatus(
  subKpis: unknown,
  nowMs: number,
  timeZone: string,
): ItProjectSubKpiStatusCounts {
  const items = itProjectChecklistItems(subKpis);
  let completedOnTime = 0;
  let delayed = 0;
  let pending = 0;
  for (const it of items) {
    if (isItProjectSubTaskDelayed(it, nowMs, timeZone)) {
      delayed += 1;
    } else if (hasValidActualDate(it)) {
      completedOnTime += 1;
    } else {
      pending += 1;
    }
  }
  return { total: items.length, completedOnTime, delayed, pending };
}

export function itProjectActivePhase(data: ItProjectData): ItProjectPhase {
  return data.phases.find((p) => p.id === data.activePhaseId) ?? data.phases[0]!;
}

export function itProjectChecklistProgressFromRaw(raw: unknown): KpiChecklistProgress {
  const data = parseItProjectSubKpis(raw);
  return kpiChecklistProgress(wrapItProjectSubKpis(data));
}

export type ItProjectPhaseProgress = {
  phaseId: string;
  phaseName: string;
  total: number;
  done: number;
  percent: number;
};

export type ItProjectAggregatedProgress = {
  phases: ItProjectPhaseProgress[];
  /** Mean of each phase's completion % (phases with sub-tasks only). */
  averagePercent: number;
  totalDone: number;
  totalItems: number;
};

export function itProjectPhaseProgressFromItems(phase: ItProjectPhase): ItProjectPhaseProgress {
  const total = phase.items.length;
  const done = phase.items.filter((it) => isItProjectSubTaskComplete(it)).length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return { phaseId: phase.id, phaseName: phase.name, total, done, percent };
}

export function itProjectAggregatedProgressFromRaw(
  raw: unknown,
  fallbackPhaseLabel?: string | null,
): ItProjectAggregatedProgress {
  const data = parseItProjectSubKpis(raw, fallbackPhaseLabel);
  const phases = data.phases.map(itProjectPhaseProgressFromItems);
  const withTasks = phases.filter((ph) => ph.total > 0);
  const averagePercent =
    withTasks.length > 0
      ? Math.round(withTasks.reduce((sum, ph) => sum + ph.percent, 0) / withTasks.length)
      : 0;
  const totalDone = phases.reduce((sum, ph) => sum + ph.done, 0);
  const totalItems = phases.reduce((sum, ph) => sum + ph.total, 0);
  return { phases, averagePercent, totalDone, totalItems };
}

export type ItProjectPhaseDraft = {
  name: string;
  dueDate?: string;
  items: Array<{ title: string; dueDate: string }>;
};

/** True when subtask due is on or before phase due (both YYYY-MM-DD). */
export function isSubtaskDueWithinPhaseDue(
  subtaskDue: string | null | undefined,
  phaseDue: string | null | undefined,
): boolean {
  const sub = normalizeOptionalUsDate(subtaskDue);
  const phase = normalizeOptionalUsDate(phaseDue);
  if (!phase) return true;
  if (!sub) return false;
  return sub <= phase;
}

export function validateItProjectPhaseDueConstraints(
  data: ItProjectData,
): { ok: true } | { ok: false; error: string } {
  for (const phase of data.phases) {
    const phaseDue = normalizeOptionalUsDate(phase.dueDate);
    if (!phaseDue) continue;
    for (const it of phase.items) {
      if (!isSubtaskDueWithinPhaseDue(it.dueDate, phaseDue)) {
        return {
          ok: false,
          error: `Sub-task "${it.title}" due date must be on or before phase "${phase.name}" due date (${phaseDue}).`,
        };
      }
    }
  }
  return { ok: true };
}

export function buildItProjectFromPhaseDrafts(
  phasesInput: ItProjectPhaseDraft[],
): { ok: true; data: ItProjectData } | { ok: false; error: string } {
  if (!phasesInput.length) {
    return { ok: false, error: "Add at least one phase with sub-tasks." };
  }
  const phases: ItProjectPhase[] = [];
  for (let i = 0; i < phasesInput.length; i++) {
    const row = phasesInput[i]!;
    const name = row.name.trim() || `Phase ${i + 1}`;
    const phaseDue = normalizeOptionalUsDate(row.dueDate);
    const items: SubKpiItem[] = [];
    for (const it of row.items) {
      const title = it.title.trim();
      const dueDate = normalizeOptionalUsDate(it.dueDate);
      if (!title) continue;
      if (!dueDate) {
        return { ok: false, error: `Each sub-task in "${name}" needs a due date (MM/DD/YYYY).` };
      }
      if (phaseDue && dueDate > phaseDue) {
        return {
          ok: false,
          error: `Sub-task "${title}" due date must be on or before phase "${name}" due date.`,
        };
      }
      items.push({ id: crypto.randomUUID(), title, done: false, dueDate });
    }
    if (items.length === 0) {
      return { ok: false, error: `Phase "${name}" needs at least one sub-task with a due date.` };
    }
    phases.push({
      id: crypto.randomUUID(),
      name,
      ...(phaseDue ? { dueDate: phaseDue } : {}),
      items,
    });
  }
  return { ok: true, data: { activePhaseId: phases[0]!.id, phases } };
}

function mapPhases(
  data: ItProjectData,
  fn: (phase: ItProjectPhase) => ItProjectPhase,
): ItProjectData {
  const phases = data.phases.map(fn);
  const activeStill = phases.some((p) => p.id === data.activePhaseId);
  return {
    activePhaseId: activeStill ? data.activePhaseId : (phases[0]?.id ?? data.activePhaseId),
    phases,
  };
}

export function setItProjectActivePhase(raw: unknown, phaseId: string): Prisma.InputJsonValue {
  const data = parseItProjectSubKpis(raw);
  if (!data.phases.some((p) => p.id === phaseId)) return wrapItProjectSubKpis(data);
  return wrapItProjectSubKpis({ ...data, activePhaseId: phaseId });
}

export function updateItProjectPhases(
  raw: unknown,
  next: ItProjectData,
): Prisma.InputJsonValue {
  if (!next.phases.length) return wrapItProjectSubKpis(parseItProjectSubKpis(raw));
  const activeStill = next.phases.some((p) => p.id === next.activePhaseId);
  return wrapItProjectSubKpis({
    activePhaseId: activeStill ? next.activePhaseId : next.phases[0]!.id,
    phases: next.phases,
  });
}

export function setItProjectSubKpiSchedule(
  raw: unknown,
  subKpiId: string,
  meta: { dueDate?: string | null; actualDate?: string | null; startDate?: string | null },
): Prisma.InputJsonValue {
  const data = parseItProjectSubKpis(raw);
  const due = meta.dueDate === undefined ? undefined : normalizeOptionalUsDate(meta.dueDate);
  const act = meta.actualDate === undefined ? undefined : normalizeOptionalUsDate(meta.actualDate);
  const start = meta.startDate === undefined ? undefined : normalizeOptionalUsDate(meta.startDate);

  const touch = (it: SubKpiItem, phase: ItProjectPhase): SubKpiItem => {
    if (it.id !== subKpiId) return it;
    let next = { ...it };
    if (due !== undefined) {
      if (due) {
        if (!isSubtaskDueWithinPhaseDue(due, phase.dueDate)) {
          // Keep previous due when invalid; caller should validate first.
          return it;
        }
        next = { ...next, dueDate: due };
      } else delete (next as { dueDate?: string }).dueDate;
    }
    if (start !== undefined) {
      if (start) next = { ...next, startDate: start };
      else delete (next as { startDate?: string }).startDate;
    }
    if (act !== undefined) {
      if (act) {
        next = { ...next, actualDate: act, done: true };
      } else {
        delete (next as { actualDate?: string }).actualDate;
        next = { ...next, done: false };
      }
    }
    if (!hasValidActualDate(next)) {
      next = { ...next, done: false };
    } else if (!next.done) {
      next = { ...next, done: true };
    }
    return next;
  };

  return updateItProjectPhases(
    raw,
    mapPhases(data, (phase) => ({
      ...phase,
      items: phase.items.map((it) => touch(it, phase)),
    })),
  );
}

/** Start / End lifecycle for an IT project sub-task (Asia/Manila calendar day). */
export function setItProjectSubKpiLifecycle(
  raw: unknown,
  subKpiId: string,
  action: "start" | "end",
  timeZone = "Asia/Manila",
): { ok: true; json: Prisma.InputJsonValue } | { ok: false; error: string } {
  const data = parseItProjectSubKpis(raw);
  const today = DateTime.now().setZone(normalizeTimeZone(timeZone)).toFormat("yyyy-MM-dd");
  let found = false;

  const touch = (it: SubKpiItem): SubKpiItem => {
    if (it.id !== subKpiId) return it;
    found = true;
    if (action === "start") {
      if (normalizeOptionalUsDate(it.startDate) || hasValidActualDate(it)) {
        return it;
      }
      return {
        ...it,
        startDate: today,
        projectStatus: normalizeItProjectStatus(it.projectStatus) === "Done" ? "Done" : "On Going",
      };
    }
    // end
    if (!normalizeOptionalUsDate(it.startDate) && !hasValidActualDate(it)) {
      return it;
    }
    return {
      ...it,
      actualDate: today,
      done: true,
      projectStatus: "Done",
      ...(normalizeOptionalUsDate(it.startDate) ? {} : { startDate: today }),
    };
  };

  const next = mapPhases(data, (phase) => ({
    ...phase,
    items: phase.items.map(touch),
  }));

  if (!found) return { ok: false, error: "Sub-task not found." };

  const target = itProjectAllItems(next).find((it) => it.id === subKpiId);
  if (action === "start" && target && !normalizeOptionalUsDate(target.startDate)) {
    return { ok: false, error: "Could not start this sub-task." };
  }
  if (action === "end") {
    const prev = itProjectAllItems(data).find((it) => it.id === subKpiId);
    if (prev && !normalizeOptionalUsDate(prev.startDate) && !hasValidActualDate(prev)) {
      return { ok: false, error: "Start the sub-task before ending it." };
    }
    if (prev && hasValidActualDate(prev)) {
      return { ok: false, error: "Sub-task is already completed." };
    }
  }

  return { ok: true, json: updateItProjectPhases(raw, next) };
}

export function findItProjectPhaseForSubKpi(
  data: ItProjectData,
  subKpiId: string,
): ItProjectPhase | null {
  return data.phases.find((p) => p.items.some((it) => it.id === subKpiId)) ?? null;
}

export function setItProjectSubKpiAssignee(
  raw: unknown,
  subKpiId: string,
  assignee: { id: string; name: string } | null,
): Prisma.InputJsonValue {
  const data = parseItProjectSubKpis(raw);
  const touch = (it: SubKpiItem): SubKpiItem => {
    if (it.id !== subKpiId) return it;
    const next = { ...it };
    if (assignee) {
      next.assignedAgentId = assignee.id;
      next.assignedAgentName = assignee.name;
      next.projectStatus = normalizeItProjectStatus(next.projectStatus) ?? "Pending";
    } else {
      delete next.assignedAgentId;
      delete next.assignedAgentName;
      if (next.projectStatus === "Pending") delete next.projectStatus;
    }
    return next;
  };
  return updateItProjectPhases(
    raw,
    mapPhases(data, (phase) => ({
      ...phase,
      items: phase.items.map(touch),
    })),
  );
}

export function setItProjectSubKpiAssistanceRequested(
  raw: unknown,
  subKpiId: string,
  byAgentId: string,
  atIso: string = new Date().toISOString(),
): Prisma.InputJsonValue | null {
  return setItProjectSubKpiItemsAssistanceRequested(raw, [subKpiId], byAgentId, atIso);
}

/** Mark Seek Assistance on one or more IT Project sub-tasks. Returns null if any id is missing. */
export function setItProjectSubKpiItemsAssistanceRequested(
  raw: unknown,
  subKpiIds: string[],
  byAgentId: string,
  atIso: string = new Date().toISOString(),
): Prisma.InputJsonValue | null {
  const idSet = new Set(subKpiIds.map((id) => String(id ?? "").trim()).filter(Boolean));
  if (idSet.size === 0) return null;
  const data = parseItProjectSubKpis(raw);
  const found = new Set<string>();
  const touch = (it: SubKpiItem): SubKpiItem => {
    if (!idSet.has(it.id)) return it;
    found.add(it.id);
    if (it.assistanceRequested) return it;
    return {
      ...it,
      assistanceRequested: true,
      assistanceRequestedAt: atIso,
      assistanceRequestedBy: byAgentId,
    };
  };
  const next = updateItProjectPhases(
    raw,
    mapPhases(data, (phase) => ({
      ...phase,
      items: phase.items.map(touch),
    })),
  );
  return found.size === idSet.size ? next : null;
}

export function setItProjectSubKpiDone(
  raw: unknown,
  subKpiId: string,
  done: boolean,
): { ok: true; json: Prisma.InputJsonValue } | { ok: false; error: string } {
  const data = parseItProjectSubKpis(raw);
  let found = false;

  const touch = (it: SubKpiItem): SubKpiItem => {
    if (it.id !== subKpiId) return it;
    found = true;
    if (!done) {
      const cleared = { ...it, done: false };
      delete (cleared as { actualDate?: string }).actualDate;
      return cleared;
    }
    if (!hasValidActualDate(it)) {
      return it;
    }
    return { ...it, done: true };
  };

  const next = mapPhases(data, (phase) => ({
    ...phase,
    items: phase.items.map(touch),
  }));

  if (!found) return { ok: false, error: "Sub-task not found." };
  const target = itProjectAllItems(next).find((it) => it.id === subKpiId);
  if (done && target && !hasValidActualDate(target)) {
    return {
      ok: false,
      error: "Enter an actual date (MM/DD/YYYY) before marking this sub-task complete.",
    };
  }

  return { ok: true, json: updateItProjectPhases(raw, next) };
}

export function setItProjectSubKpiProjectMeta(
  raw: unknown,
  subKpiId: string,
  meta: { projectPriority?: unknown; projectStatus?: unknown },
): { ok: true; json: Prisma.InputJsonValue } | { ok: false; error: string } {
  const data = parseItProjectSubKpis(raw);
  const priority = meta.projectPriority === undefined ? undefined : normalizeItProjectPriority(meta.projectPriority);
  const status = meta.projectStatus === undefined ? undefined : normalizeItProjectStatus(meta.projectStatus);

  if (meta.projectPriority !== undefined && !priority) {
    return { ok: false, error: "Priority must be High, Medium, or Low." };
  }
  if (meta.projectStatus !== undefined && !status) {
    return { ok: false, error: "Completion status must be Pending, On Going, Finalizing, or Done." };
  }

  let found = false;
  const touch = (it: SubKpiItem): SubKpiItem => {
    if (it.id !== subKpiId) return it;
    found = true;
    let next = { ...it };
    if (priority !== undefined) next = { ...next, projectPriority: priority };
    if (status !== undefined) {
      next = { ...next, projectStatus: status, done: status === "Done" };
      if (status === "Done" && !hasValidActualDate(next)) {
        next.actualDate = DateTime.now().toFormat("yyyy-MM-dd");
      }
      if (status !== "Done" && next.actualDate && next.done) {
        delete (next as { actualDate?: string }).actualDate;
      }
    }
    return next;
  };

  const next = mapPhases(data, (phase) => ({
    ...phase,
    items: phase.items.map(touch),
  }));

  if (!found) return { ok: false, error: "Sub-task not found." };
  return { ok: true, json: updateItProjectPhases(raw, next) };
}
