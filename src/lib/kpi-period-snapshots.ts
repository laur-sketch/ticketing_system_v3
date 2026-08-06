import { DateTime } from "luxon";
import type { KpiFrequency, Prisma } from "@prisma/client/primary";
import {
  DEFAULT_TIME_ZONE,
  computePeriodKey,
  getDailyPeriodKey,
  getMonthlyPeriodKey,
  getQuarterlyPeriodKey,
  getSemiAnnualPeriodKey,
  getWeeklyPeriodKey,
  isKpiMetricsWorkingDay,
  normalizeTimeZone,
  type KpiFrequencyCode,
} from "@/lib/kpi-recurrence";
import {
  collectAllSubKpiItems,
  collectChecklistProgressItems,
  incidentMetricPercents,
  isInvertedChecklistPillar,
  isPillarOnlyTask,
  isProjectTask,
  kpiChecklistMetricView,
  kpiChecklistProgress,
  normalizeSubKpis,
  pillarVirtualSubKpiItem,
  subKpiProgressOwner,
  type KpiChecklistProgress,
  type SubKpiItem,
} from "@/lib/kpi-subkpis";
import {
  countItProjectSubKpiStatus,
  itProjectAggregatedProgressFromRaw,
  itProjectChecklistItems,
  itProjectStatusProgress,
  usesProjectTimelineTracker,
} from "@/lib/it-project-subkpis";
import {
  isItProjectImplementationPillar,
  isJobOrderRequestPillar,
} from "@/lib/it-task-pillar-titles";
import { pillarFromKpiTitle } from "@/lib/kpi-sheet-import-snapshots";
import type { TaskMetricsCadence } from "@/lib/task-metrics-range";
import { kpiMainTaskLabel } from "@/lib/kpi-main-task";
import {
  donutKeyForTaskMetricsRow,
  FIELD_ASSIGNMENT_DONUT_KEY,
  kpiMatchesTaskMetricsType,
  PROJECTS_DONUT_KEY,
  TASK_FREQUENCY_DONUT_KEYS,
  type TaskMetricsTaskType,
} from "@/lib/task-metrics-task-type";
import { prisma } from "@/lib/prisma";
import {
  applyPenaltiesToAssigneeProgress,
  applyPenaltyToTaskEfficiency,
  weightedAssigneeProgressPercent,
  type PersonnelDelayPenaltyRow,
} from "@/lib/task-personnel-metrics";
import {
  mergePenaltyDeductionMaps,
  penaltyDeductionsForKpi,
} from "@/lib/task-delay-penalty";

export type KpiRowForSnapshot = {
  id: string;
  title: string;
  mainTask?: string | null;
  frequency: KpiFrequency;
  subKpis: unknown;
  periodKey: string | null;
  recurrenceWeekday: number | null;
  recurrenceMonthDay: number | null;
  periodCycleStartAt: Date | null;
  isRecurring: boolean;
  assignedAgent?: { id: string; name: string } | null;
};

export type StoredContributorProgress = {
  id: string;
  name: string;
  role: string;
  total: number;
  done: number;
};

export function timeZoneFromPeriodKey(periodKey: string | null | undefined): string {
  if (!periodKey) return DEFAULT_TIME_ZONE;
  const parts = periodKey.split(":");
  if (parts.length >= 3 && parts[1]) return normalizeTimeZone(parts[1]);
  return DEFAULT_TIME_ZONE;
}

export function resolvePeriodKeyForKpi(
  row: KpiRowForSnapshot,
  at: Date,
  timeZone: string,
): string {
  if (row.periodKey?.trim()) return row.periodKey.trim();
  const freq = row.frequency as KpiFrequencyCode;
  return computePeriodKey(freq, row.recurrenceWeekday, row.recurrenceMonthDay, at, timeZone);
}

/** Inclusive local calendar days between two YYYY-MM-DD values. */
export function enumerateYmdDaysInRange(fromYmd: string, toYmd: string, timeZone: string): string[] {
  const zone = normalizeTimeZone(timeZone);
  let cursor = DateTime.fromISO(fromYmd, { zone }).startOf("day");
  const end = DateTime.fromISO(toYmd, { zone }).startOf("day");
  if (!cursor.isValid || !end.isValid || cursor > end) return [];
  const out: string[] = [];
  while (cursor <= end) {
    if (isKpiMetricsWorkingDay(cursor)) {
      const iso = cursor.toISODate();
      if (iso) out.push(iso);
    }
    cursor = cursor.plus({ days: 1 });
  }
  return out;
}

/** Persist checklist progress for the active period (idempotent). */
export async function upsertKpiPeriodSnapshot(
  row: KpiRowForSnapshot,
  timeZone: string,
  at: Date = new Date(),
  periodKeyOverride?: string,
): Promise<void> {
  const zone = normalizeTimeZone(timeZone);
  const atDt = DateTime.fromMillis(at.getTime(), { zone });
  if (!row.isRecurring) {
    // Non-recurring: snapshot uses computePeriodKey for metrics compatibility
    const periodKey = computePeriodKey(
      row.frequency as KpiFrequencyCode,
      row.recurrenceWeekday,
      row.recurrenceMonthDay,
      at,
      zone,
    );
    const progress = kpiChecklistProgress(row.subKpis, kpiMainTaskLabel(row));
    const fullyComplete = progress.total > 0 && progress.missing === 0;
    const contributorProgress = assigneeProgressToStored(
      assigneeProgressForRows(
        [{ title: row.title, mainTask: row.mainTask, subKpis: row.subKpis, assignedAgent: row.assignedAgent ?? null }],
        rawCheckboxIsDone,
      ),
    );
    await prisma.kpiMaintenancePeriodSnapshot.upsert({
      where: {
        kpiMaintenanceId_periodKey: {
          kpiMaintenanceId: row.id,
          periodKey,
        },
      },
      create: {
        kpiMaintenanceId: row.id,
        periodKey,
        frequency: row.frequency,
        timeZone: zone,
        total: progress.total,
        done: progress.done,
        missing: progress.missing,
        percent: progress.percent,
        fullyComplete,
        contributorProgress,
      },
      update: {
        total: progress.total,
        done: progress.done,
        missing: progress.missing,
        percent: progress.percent,
        fullyComplete,
        contributorProgress,
        capturedAt: new Date(),
      },
    });
    return;
  }
  if ((row.frequency as KpiFrequencyCode) === "DAILY" && !isKpiMetricsWorkingDay(atDt)) {
    return;
  }
  const periodKey =
    periodKeyOverride?.trim() || resolvePeriodKeyForKpi(row, at, zone);
  const progress = kpiChecklistProgress(row.subKpis, kpiMainTaskLabel(row));
  const fullyComplete = progress.total > 0 && progress.missing === 0;
  const contributorProgress = assigneeProgressToStored(
    assigneeProgressForRows(
      [{ title: row.title, mainTask: row.mainTask, subKpis: row.subKpis, assignedAgent: row.assignedAgent ?? null }],
      rawCheckboxIsDone,
    ),
  );

  await prisma.kpiMaintenancePeriodSnapshot.upsert({
    where: {
      kpiMaintenanceId_periodKey: {
        kpiMaintenanceId: row.id,
        periodKey,
      },
    },
    create: {
      kpiMaintenanceId: row.id,
      periodKey,
      frequency: row.frequency,
      timeZone: zone,
      total: progress.total,
      done: progress.done,
      missing: progress.missing,
      percent: progress.percent,
      fullyComplete,
      contributorProgress,
    },
    update: {
      total: progress.total,
      done: progress.done,
      missing: progress.missing,
      percent: progress.percent,
      fullyComplete,
      contributorProgress,
      capturedAt: new Date(),
    },
  });
}

/** All recurrence period keys for one KPI overlapping an inclusive local date range. */
export function enumeratePeriodKeysForKpiInRange(
  kpi: Pick<KpiRowForSnapshot, "frequency" | "recurrenceWeekday" | "recurrenceMonthDay">,
  fromYmd: string,
  toYmd: string,
  timeZone: string,
): string[] {
  const zone = normalizeTimeZone(timeZone);
  const freq = kpi.frequency as KpiFrequencyCode;
  let cursor = DateTime.fromISO(fromYmd, { zone }).startOf("day");
  const end = DateTime.fromISO(toYmd, { zone }).startOf("day");
  if (!cursor.isValid || !end.isValid || cursor > end) return [];

  const keys = new Set<string>();
  if (freq === "DAILY") {
    while (cursor <= end) {
      if (isKpiMetricsWorkingDay(cursor)) {
        keys.add(getDailyPeriodKey(cursor.toJSDate(), zone));
      }
      cursor = cursor.plus({ days: 1 });
    }
    return [...keys];
  }

  if (freq === "WEEKLY") {
    const wd = typeof kpi.recurrenceWeekday === "number" ? kpi.recurrenceWeekday : 1;
    while (cursor <= end) {
      keys.add(getWeeklyPeriodKey(cursor.toJSDate(), wd, zone));
      cursor = cursor.plus({ days: 1 });
    }
    return [...keys];
  }

  const dom = typeof kpi.recurrenceMonthDay === "number" ? kpi.recurrenceMonthDay : 1;
  const getPeriodKey =
    freq === "QUARTERLY"
      ? getQuarterlyPeriodKey
      : freq === "SEMI_ANNUAL"
        ? getSemiAnnualPeriodKey
        : getMonthlyPeriodKey;
  while (cursor <= end) {
    keys.add(getPeriodKey(cursor.toJSDate(), dom, zone));
    cursor = cursor.plus({ days: 1 });
  }
  return [...keys];
}

type KpiRowForMetrics = Pick<KpiRowForSnapshot, "frequency" | "title">;

/**
 * Pick which KPI row(s) to use for a pillar in task metrics.
 * Prefer daily snapshots when a DAILY KPI exists (CSV / task-board history).
 * Pillars with only MONTHLY rows (e.g. System Maintenance from the KPI sheet) still appear
 * via their monthly snapshots when no daily KPI is defined.
 */
export function selectKpisForPillarTaskMetrics<T extends KpiRowForMetrics>(
  pillarKpis: T[],
  metricsCadence: TaskMetricsCadence,
): T[] {
  if (pillarKpis.length === 0) return [];
  const daily = pillarKpis.filter((k) => (k.frequency as KpiFrequencyCode) === "DAILY");
  const weekly = pillarKpis.filter((k) => (k.frequency as KpiFrequencyCode) === "WEEKLY");
  const monthly = pillarKpis.filter((k) => (k.frequency as KpiFrequencyCode) === "MONTHLY");
  const quarterly = pillarKpis.filter((k) => (k.frequency as KpiFrequencyCode) === "QUARTERLY");
  const semiAnnual = pillarKpis.filter((k) => (k.frequency as KpiFrequencyCode) === "SEMI_ANNUAL");

  // Prefer the most granular rows that exist so monthly/yearly windows still roll up.
  if (daily.length > 0) return daily;
  if (weekly.length > 0) return weekly;
  if (metricsCadence === "MONTHLY") {
    return monthly.length > 0
      ? monthly
      : quarterly.length > 0
        ? quarterly
        : semiAnnual;
  }
  // YEARLY: monthly → quarterly → semi-annual
  return monthly.length > 0
    ? monthly
    : quarterly.length > 0
      ? quarterly
      : semiAnnual.length > 0
        ? semiAnnual
        : weekly;
}

function averageProgress(rows: KpiChecklistProgress[]): KpiChecklistProgress & {
  periodsCounted: number;
  periodsInRange: number;
} {
  const periodsInRange = rows.length;
  const withData = rows.filter((r) => r.total > 0);
  const periodsCounted = withData.length;
  if (periodsCounted === 0) {
    return { total: 0, done: 0, missing: 0, percent: 0, periodsCounted: 0, periodsInRange };
  }
  const percent = Math.round(
    withData.reduce((s, r) => s + r.percent, 0) / periodsCounted,
  );
  const total = Math.round(withData.reduce((s, r) => s + r.total, 0) / periodsCounted);
  const done = Math.round(withData.reduce((s, r) => s + r.done, 0) / periodsCounted);
  const missing = Math.max(0, total - done);
  return { total, done, missing, percent, periodsCounted, periodsInRange };
}

function snapshotToProgress(s: {
  total: number;
  done: number;
  missing: number;
  percent: number;
}): KpiChecklistProgress {
  return {
    total: s.total,
    done: s.done,
    missing: s.missing,
    percent: s.percent,
  };
}

function averageDailyProgress(rows: KpiChecklistProgress[]): KpiChecklistProgress {
  const withData = rows.filter((r) => r.total > 0);
  if (withData.length === 0) return { total: 0, done: 0, missing: 0, percent: 0 };
  const percent = Math.round(withData.reduce((sum, row) => sum + row.percent, 0) / withData.length);
  const total = Math.round(withData.reduce((sum, row) => sum + row.total, 0) / withData.length);
  const done = Math.round(withData.reduce((sum, row) => sum + row.done, 0) / withData.length);
  const missing = Math.max(0, total - done);
  return { total, done, missing, percent };
}

/** Live Task Board rows that feed a company-view donut (admin extended view). */
export type TaskChecklistIncludedPhase = {
  id: string;
  name: string;
  total: number;
  done: number;
  percent: number;
};

export type TaskChecklistIncludedTask = {
  id: string;
  title: string;
  /** Recurring cadence for tasks; null for projects (projects are one-off). */
  frequency: string | null;
  assigneeName: string | null;
  total: number;
  done: number;
  missing: number;
  percent: number;
  items: Array<{ id: string; title: string; done: boolean }>;
  /** Project timeline extended view — progress per phase instead of flat sub-tasks. */
  phases?: TaskChecklistIncludedPhase[];
};

export type TaskChecklistPillarMetric = KpiChecklistProgress & {
  periodsCounted: number;
  periodsInRange: number;
  csvRows?: string[][];
  /** Extended-view CSV columns derived from live Task Board sub-tasks. */
  subtaskCsvColumns?: string[];
  subtaskCsvRows?: string[][];
  dailyProgressRows?: TaskChecklistDailyProgress[];
  assigneeProgress?: TaskAssigneeProgress[];
  /** Sum of contributor tasks across every counted period (personnel monthly rollup). */
  assigneeProgressAccumulated?: TaskAssigneeProgress[];
  /** Main tasks (and their checklist items) that contribute to this donut. */
  includedTasks?: TaskChecklistIncludedTask[];
};

export type TaskChecklistDailyProgress = KpiChecklistProgress & {
  date: string;
};

export type TaskAssigneeProgress = {
  id: string;
  name: string;
  role: string;
  total: number;
  done: number;
  /** Checklist items still open for this contributor in the counted period. */
  remaining: number;
  percent: number;
};

/**
 * Keyed by pillar title. Canonical pillars are always present; any other task group
 * created on the Task Board appears under its own normalized (uppercase) title.
 */
export type TaskChecklistPillarMetrics = Partial<Record<string, TaskChecklistPillarMetric>>;

/** Dynamic task groups use their Task Board title, squished and uppercased, as the pillar key. */
export function normalizeDynamicPillarTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toUpperCase();
}

/** IANA zone used when writing/reading imported KPI period snapshots (defaults to REPORT_TZ). */
export function snapshotTimeZoneForTaskMetrics(clientTz?: string | null): string {
  const fromEnv = process.env.KPI_SNAPSHOT_TZ ?? process.env.REPORT_TZ;
  if (fromEnv) return normalizeTimeZone(fromEnv);
  const client = clientTz?.trim();
  // Imported snapshots use Asia/Taipei (GMT+8) keys; UTC is the SSR/hydration default, not the data zone.
  if (client && client !== "UTC") return normalizeTimeZone(client);
  return "Asia/Taipei";
}

/** Task metrics checklist rows: admins see scoped set; personnel see only their assignments. */
export function kpiMaintenanceWhereForTaskMetrics(
  assignedAgentId?: string,
  assignedAgentIds?: string[],
): Prisma.KpiMaintenanceWhereInput {
  if (assignedAgentIds) {
    return { assignedAgentId: { in: assignedAgentIds.length > 0 ? assignedAgentIds : ["__none__"] } };
  }
  if (!assignedAgentId) return {};
  if (assignedAgentId === "__none__") return { assignedAgentId: null };
  return { assignedAgentId };
}

function buildIncludedTasksFromKpis(
  rows: ReadonlyArray<{
    id: string;
    title: string;
    mainTask?: string | null;
    itProjectName?: string | null;
    frequency: string | KpiFrequency | null;
    subKpis: unknown;
    assignedAgent?: { id: string; name: string } | null;
  }>,
  opts?: {
    itemsForRow?: (row: (typeof rows)[number]) => SubKpiItem[];
    isDone?: (item: SubKpiItem) => boolean;
    /** When true, omit frequency and attach phase progress for timeline projects. */
    projectMode?: boolean;
  },
): TaskChecklistIncludedTask[] {
  const out: TaskChecklistIncludedTask[] = [];
  for (const row of rows) {
    let title = kpiMainTaskLabel(row).trim();
    if (!title || isItProjectImplementationPillar(title) || isJobOrderRequestPillar(title)) {
      title =
        (row.itProjectName ?? "").trim() ||
        (row.mainTask ?? "").trim() ||
        (opts?.projectMode ? "Untitled project" : row.title.trim());
    }
    if (!title) continue;
    const projectMode = opts?.projectMode === true;
    if (projectMode) {
      const agg = itProjectAggregatedProgressFromRaw(row.subKpis);
      const phases = agg.phases
        .filter((ph) => ph.total > 0 || ph.phaseName.trim().length > 0)
        .map((ph) => ({
          id: ph.phaseId,
          name: ph.phaseName.trim() || "Phase",
          total: ph.total,
          done: ph.done,
          percent: ph.percent,
        }));
      const total = agg.totalItems;
      const done = agg.totalDone;
      out.push({
        id: row.id,
        title,
        frequency: null,
        assigneeName: row.assignedAgent?.name?.trim() || null,
        total,
        done,
        missing: Math.max(0, total - done),
        percent: total > 0 ? Math.round((done / total) * 100) : agg.averagePercent,
        items: [],
        phases,
      });
      continue;
    }
    const items = (opts?.itemsForRow?.(row) ?? collectChecklistProgressItems(row.subKpis, title)).filter(
      (item) => item.title.trim().length > 0,
    );
    const isDone = opts?.isDone ?? ((item: SubKpiItem) => Boolean(item.done));
    const total = items.length;
    const done = items.reduce((sum, item) => sum + (isDone(item) ? 1 : 0), 0);
    const missing = Math.max(0, total - done);
    out.push({
      id: row.id,
      title,
      frequency: String(row.frequency ?? "").toUpperCase() || "—",
      assigneeName: row.assignedAgent?.name?.trim() || null,
      total,
      done,
      missing,
      percent: total > 0 ? Math.round((done / total) * 100) : 0,
      items: items.map((item) => ({
        id: item.id,
        title: item.title.trim(),
        done: isDone(item),
      })),
    });
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

function isProjectTimelineMetricsKpi(row: {
  title: string;
  subKpis: unknown;
  isRecurring: boolean | null;
}): boolean {
  if (row.isRecurring === true) return false;
  if (isItProjectImplementationPillar(row.title) || isJobOrderRequestPillar(row.title)) return true;
  return isProjectTask(row.subKpis) || usesProjectTimelineTracker(row.subKpis);
}

/** All Project task-type rows register under a single PROJECTS donut. */
function pillarKeyForProjectKpi(_row: {
  title: string;
  mainTask?: string | null;
  itProjectName?: string | null;
}): string {
  return PROJECTS_DONUT_KEY;
}

/**
 * On-time / delayed metrics for Timeline Tracker / JO-linked projects.
 * Includes legacy IT PROJECT IMPLEMENTATION rows and newer Project / JOB ORDER REQUEST rows.
 * Only projects overlapping [fromYmd, toYmd] are counted.
 */
async function computeProjectTimelinePillarMetricsByTitle(args: {
  kpiWhere: Prisma.KpiMaintenanceWhereInput;
  timeZone: string;
  fromYmd: string;
  toYmd: string;
  taskType?: TaskMetricsTaskType;
}): Promise<TaskChecklistPillarMetrics> {
  const zone = normalizeTimeZone(args.timeZone);
  const taskType = args.taskType ?? "task";
  if (taskType !== "project") {
    return {};
  }
  const rows = await prisma.kpiMaintenance.findMany({
    where: {
      isRecurring: false,
      ...args.kpiWhere,
    },
    select: {
      id: true,
      title: true,
      mainTask: true,
      itProjectName: true,
      subKpis: true,
      frequency: true,
      isRecurring: true,
      nonRecurringStartAt: true,
      nonRecurringEndAt: true,
      assignedAgent: { select: { id: true, name: true } },
    },
  });

  const inRange = (row: (typeof rows)[number]) => {
    const start = row.nonRecurringStartAt
      ? DateTime.fromJSDate(row.nonRecurringStartAt, { zone }).toISODate()
      : null;
    const end = row.nonRecurringEndAt
      ? DateTime.fromJSDate(row.nonRecurringEndAt, { zone }).toISODate()
      : null;
    if (start && end) return start <= args.toYmd && end >= args.fromYmd;
    if (start) return start <= args.toYmd;
    if (end) return end >= args.fromYmd;
    const dues = itProjectChecklistItems(row.subKpis)
      .map((it) => it.dueDate?.trim())
      .filter((d): d is string => Boolean(d));
    if (dues.length === 0) return true;
    return dues.some((d) => d >= args.fromYmd && d <= args.toYmd);
  };

  const projectRows = rows.filter(
    (row) =>
      isProjectTimelineMetricsKpi(row) &&
      inRange(row) &&
      kpiMatchesTaskMetricsType(row, taskType),
  );
  const byPillar = new Map<string, typeof projectRows>();
  for (const row of projectRows) {
    const pillar = pillarKeyForProjectKpi(row);
    const list = byPillar.get(pillar) ?? [];
    list.push(row);
    byPillar.set(pillar, list);
  }

  const nowMs = Date.now();
  const out: TaskChecklistPillarMetrics = {};

  for (const [pillar, pillarRows] of byPillar) {
    let total = 0;
    let completedOnTime = 0;
    let delayed = 0;
    for (const row of pillarRows) {
      const counts = countItProjectSubKpiStatus(row.subKpis, nowMs, args.timeZone);
      total += counts.total;
      completedOnTime += counts.completedOnTime;
      delayed += counts.delayed;
    }
    const basePercent = total > 0 ? Math.round((completedOnTime / total) * 100) : 0;
    let assigneeProgress = assigneeProgressForRows(
      pillarRows.map((row) => ({
        title: row.title,
        subKpis: row.subKpis,
        assignedAgent: row.assignedAgent,
        items: itProjectChecklistItems(row.subKpis),
      })),
      (item) => itProjectStatusProgress(item) === 100,
    );

    const penaltyRows: PersonnelDelayPenaltyRow[] = [
      ...mergePenaltyDeductionMaps(
        pillarRows.map((row) =>
          penaltyDeductionsForKpi(
            {
              subKpis: row.subKpis,
              frequency: row.frequency as KpiFrequencyCode,
              isRecurring: row.isRecurring,
              title: row.title,
              assignedAgent: row.assignedAgent,
            },
            { nowMs, timeZone: args.timeZone },
          ),
        ),
      ).values(),
    ].filter((row) => row.deduction > 0);

    assigneeProgress = applyPenaltiesToAssigneeProgress(assigneeProgress, penaltyRows);
    const totalPenalty = penaltyRows.reduce((sum, row) => sum + row.deduction, 0);
    const percent =
      assigneeProgress.length > 0
        ? weightedAssigneeProgressPercent(assigneeProgress)
        : totalPenalty > 0
          ? applyPenaltyToTaskEfficiency(basePercent, totalPenalty)
          : basePercent;

    out[pillar] = {
      total,
      done: completedOnTime,
      missing: delayed,
      percent,
      periodsCounted: pillarRows.length,
      periodsInRange: pillarRows.length,
      assigneeProgress,
      assigneeProgressAccumulated: assigneeProgress,
      includedTasks: buildIncludedTasksFromKpis(pillarRows, {
        projectMode: true,
      }),
    };
  }

  return out;
}

function assigneeProgressForRows(
  rows: ReadonlyArray<{
    title: string;
    mainTask?: string | null;
    subKpis: unknown;
    assignedAgent?: { id: string; name: string } | null;
    items?: SubKpiItem[];
  }>,
  isDone: (item: SubKpiItem) => boolean,
): TaskAssigneeProgress[] {
  const byAssignee = new Map<
    string,
    { id: string; name: string; roles: Set<string>; total: number; done: number }
  >();

  for (const row of rows) {
    const items =
      row.items ?? collectChecklistProgressItems(row.subKpis, kpiMainTaskLabel(row));
    for (const item of items) {
      if (!item.title.trim()) continue;
      const owner = subKpiProgressOwner(item, row.assignedAgent);
      const current = byAssignee.get(owner.id) ?? {
        id: owner.id,
        name: owner.name,
        roles: new Set<string>(),
        total: 0,
        done: 0,
      };
      current.roles.add(owner.role);
      current.total += 1;
      if (isDone(item)) current.done += 1;
      byAssignee.set(owner.id, current);
    }
  }

  const mergedByPerson = new Map<
    string,
    { id: string; name: string; roles: Set<string>; total: number; done: number }
  >();
  for (const row of byAssignee.values()) {
    const nameKey = row.name.trim().toLowerCase();
    const existing = mergedByPerson.get(nameKey);
    if (existing) {
      for (const role of row.roles) existing.roles.add(role);
      existing.total += row.total;
      existing.done += row.done;
      if (row.id !== "__unassigned__") existing.id = row.id;
      continue;
    }
    mergedByPerson.set(nameKey, {
      id: row.id,
      name: row.name,
      roles: new Set(row.roles),
      total: row.total,
      done: row.done,
    });
  }

  return [...mergedByPerson.values()]
    .map((row) => {
      const roles = [...row.roles].sort();
      const displayRoles =
        roles.includes("Assignee") && roles.includes("Sub-assignee") ? ["Assignee"] : roles;
      const done = row.done;
      const total = row.total;
      return {
        id: row.id,
        name: row.name,
        role: displayRoles.join(" / "),
        total,
        done,
        remaining: Math.max(0, total - done),
        percent: total > 0 ? Math.round((done / total) * 100) : 0,
      };
    })
    .sort((a, b) => b.percent - a.percent || b.done - a.done || a.name.localeCompare(b.name));
}

function assigneeProgressToStored(rows: TaskAssigneeProgress[]): StoredContributorProgress[] {
  return rows.map(({ id, name, role, total, done }) => ({ id, name, role, total, done }));
}

function parseContributorProgress(raw: unknown): StoredContributorProgress[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredContributorProgress[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!name) continue;
    const total = Number(row.total);
    const done = Number(row.done);
    if (!Number.isFinite(total) || !Number.isFinite(done) || total < 0 || done < 0) continue;
    out.push({
      id: typeof row.id === "string" ? row.id : name.toLowerCase(),
      name,
      role: typeof row.role === "string" ? row.role : "Contributor",
      total: Math.round(total),
      done: Math.round(Math.min(done, total)),
    });
  }
  return out;
}

function storedToAssigneeProgress(rows: StoredContributorProgress[]): TaskAssigneeProgress[] {
  return rows.map((row) => {
    const total = row.total;
    const done = row.done;
    return {
      id: row.id,
      name: row.name,
      role: row.role,
      total,
      done,
      remaining: Math.max(0, total - done),
      percent: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  });
}

function rawCheckboxIsDone(item: SubKpiItem): boolean {
  return Boolean(item.done);
}

/** Live Task Board rows that currently roll into a Task Metrics donut (Admin extended view). */
function buildIncludedTasksForKpis(
  pillarKpis: ReadonlyArray<{
    id: string;
    title: string;
    mainTask?: string | null;
    frequency: string | null;
    isRecurring: boolean | null;
    subKpis: unknown;
    assignedAgent?: { id: string; name: string } | null;
  }>,
): TaskChecklistIncludedTask[] {
  return pillarKpis.map((kpi) => {
    const frequency =
      kpi.isRecurring === false
        ? "ONE-OFF"
        : String(kpi.frequency ?? "").trim().toUpperCase() || null;
    const assigneeName = kpi.assignedAgent?.name?.trim() || null;

    if (isProjectTimelineMetricsKpi(kpi)) {
      const agg = itProjectAggregatedProgressFromRaw(kpi.subKpis);
      const missing = Math.max(0, agg.totalItems - agg.totalDone);
      return {
        id: kpi.id,
        title: kpi.title,
        assigneeName,
        frequency,
        total: agg.totalItems,
        done: agg.totalDone,
        missing,
        percent: agg.averagePercent,
        items: [],
        phases: agg.phases.map((ph) => ({
          id: ph.phaseId,
          name: ph.phaseName,
          total: ph.total,
          done: ph.done,
          percent: ph.percent,
        })),
      };
    }

    const label = kpiMainTaskLabel(kpi);
    const progress = kpiChecklistProgress(kpi.subKpis, label);
    const items = collectChecklistProgressItems(kpi.subKpis, label).map((item) => ({
      id: item.id,
      title: item.title,
      done: rawCheckboxIsDone(item),
    }));
    return {
      id: kpi.id,
      title: kpi.title,
      assigneeName,
      frequency,
      total: progress.total,
      done: progress.done,
      missing: progress.missing,
      percent: progress.percent,
      items,
    };
  });
}

type AssigneeProgressBundle = {
  progress: KpiChecklistProgress;
  contributors: TaskAssigneeProgress[];
};

function rollupAssigneeProgressAcrossPeriods(
  bundles: AssigneeProgressBundle[],
  combine: (values: number[]) => number,
): TaskAssigneeProgress[] {
  const withData = bundles.filter((b) => b.progress.total > 0);
  if (withData.length === 0) return [];

  const byPerson = new Map<
    string,
    { id: string; name: string; roles: Set<string>; totals: number[]; dones: number[] }
  >();

  for (const bundle of withData) {
    for (const row of bundle.contributors) {
      const nameKey = row.name.trim().toLowerCase();
      const existing = byPerson.get(nameKey);
      if (existing) {
        for (const part of row.role.split(" / ")) {
          const role = part.trim();
          if (role) existing.roles.add(role);
        }
        existing.totals.push(row.total);
        existing.dones.push(row.done);
        if (row.id !== "__unassigned__") existing.id = row.id;
        continue;
      }
      byPerson.set(nameKey, {
        id: row.id,
        name: row.name,
        roles: new Set(row.role.split(" / ").map((r) => r.trim()).filter(Boolean)),
        totals: [row.total],
        dones: [row.done],
      });
    }
  }

  return [...byPerson.values()]
    .map((row) => {
      const roles = [...row.roles].sort();
      const displayRoles =
        roles.includes("Assignee") && roles.includes("Sub-assignee") ? ["Assignee"] : roles;
      const total = row.totals.length > 0 ? combine(row.totals) : 0;
      const done = row.dones.length > 0 ? combine(row.dones) : 0;
      const remaining = Math.max(0, total - done);
      return {
        id: row.id,
        name: row.name,
        role: displayRoles.join(" / "),
        total,
        done,
        remaining,
        percent: total > 0 ? Math.round((done / total) * 100) : 0,
      };
    })
    .sort((a, b) => b.percent - a.percent || b.done - a.done || a.name.localeCompare(b.name));
}

function averageAcrossPeriodValues(values: number[]): number {
  return values.length > 0
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : 0;
}

function sumAcrossPeriodValues(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

/** Average contributor rows across the same counted periods used by pillar donut metrics. */
function averageAssigneeProgressAcrossPeriods(bundles: AssigneeProgressBundle[]): TaskAssigneeProgress[] {
  return rollupAssigneeProgressAcrossPeriods(bundles, averageAcrossPeriodValues);
}

/** Sum contributor rows across every Mon–Sat period in the reporting window (personnel view). */
export function accumulateAssigneeProgressAcrossPeriods(
  bundles: AssigneeProgressBundle[],
): TaskAssigneeProgress[] {
  return rollupAssigneeProgressAcrossPeriods(bundles, sumAcrossPeriodValues);
}

type PersonnelKpiRosterRow = {
  row: {
    title: string;
    mainTask?: string | null;
    subKpis: unknown;
    assignedAgent?: { id: string; name: string } | null;
  };
  periodCount: number;
};

/**
 * Personnel monthly totals: sum completions from each day's snapshot, but derive Assigned
 * from the current task roster × Mon–Sat periods (so removed tasks do not inflate Assigned).
 */
export function personnelAssigneeProgressAcrossPeriods(
  bundles: AssigneeProgressBundle[],
  roster: PersonnelKpiRosterRow[],
  isDone: (item: SubKpiItem) => boolean,
): TaskAssigneeProgress[] {
  const doneByPerson = new Map(
    rollupAssigneeProgressAcrossPeriods(bundles, sumAcrossPeriodValues).map((row) => [
      row.name.trim().toLowerCase(),
      row,
    ]),
  );

  const rosterByPerson = new Map<
    string,
    { id: string; name: string; roles: Set<string>; total: number }
  >();

  for (const { row, periodCount } of roster) {
    if (periodCount <= 0) continue;
    for (const person of assigneeProgressForRows([row], isDone)) {
      const nameKey = person.name.trim().toLowerCase();
      const chunk = person.total * periodCount;
      const existing = rosterByPerson.get(nameKey);
      if (existing) {
        for (const part of person.role.split(" / ")) {
          const role = part.trim();
          if (role) existing.roles.add(role);
        }
        existing.total += chunk;
        if (person.id !== "__unassigned__") existing.id = person.id;
        continue;
      }
      rosterByPerson.set(nameKey, {
        id: person.id,
        name: person.name,
        roles: new Set(person.role.split(" / ").map((r) => r.trim()).filter(Boolean)),
        total: chunk,
      });
    }
  }

  return [...rosterByPerson.values()]
    .map((row) => {
      const roles = [...row.roles].sort();
      const displayRoles =
        roles.includes("Assignee") && roles.includes("Sub-assignee") ? ["Assignee"] : roles;
      const total = row.total;
      const rawDone = doneByPerson.get(row.name.trim().toLowerCase())?.done ?? 0;
      const done = Math.min(rawDone, total);
      const remaining = Math.max(0, total - done);
      const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
      return {
        id: row.id,
        name: row.name,
        role: displayRoles.join(" / "),
        total,
        done,
        remaining,
        percent,
      };
    })
    .sort((a, b) => b.percent - a.percent || b.done - a.done || a.name.localeCompare(b.name));
}

function applyAssigneeDonutView(rows: TaskAssigneeProgress[], invert: boolean): TaskAssigneeProgress[] {
  return rows.map((row) => {
    const missing = Math.max(0, row.total - row.done);
    const view = kpiChecklistMetricView(
      { total: row.total, done: row.done, missing, percent: row.percent },
      invert,
    );
    return {
      ...row,
      done: view.positive,
      remaining: view.negative,
      percent: view.percent,
    };
  });
}

function scaleAssigneeBucketsToTargets(
  rows: TaskAssigneeProgress[],
  targetPositive: number,
  targetNegative: number,
  targetTotal: number,
): TaskAssigneeProgress[] {
  if (rows.length === 0) return rows;
  const sumDone = rows.reduce((sum, row) => sum + row.done, 0);
  const sumRemaining = rows.reduce((sum, row) => sum + row.remaining, 0);
  const sumTotal = rows.reduce((sum, row) => sum + row.total, 0);
  if (sumTotal <= 0) return rows;

  let allocatedDone = 0;
  let allocatedRemaining = 0;
  let allocatedTotal = 0;

  return rows.map((row, index) => {
    const isLast = index === rows.length - 1;
    const done = isLast
      ? Math.max(0, targetPositive - allocatedDone)
      : sumDone > 0
        ? Math.min(row.total, Math.round((row.done / sumDone) * targetPositive))
        : 0;
    const remaining = isLast
      ? Math.max(0, targetNegative - allocatedRemaining)
      : sumRemaining > 0
        ? Math.min(Math.max(0, row.total - done), Math.round((row.remaining / sumRemaining) * targetNegative))
        : 0;
    const total = isLast
      ? Math.max(done + remaining, targetTotal - allocatedTotal)
      : sumTotal > 0
        ? Math.max(done + remaining, Math.round((row.total / sumTotal) * targetTotal))
        : done + remaining;
    allocatedDone += done;
    allocatedRemaining += remaining;
    allocatedTotal += total;
    return {
      ...row,
      done,
      remaining,
      total,
      percent: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  });
}

function syncAssigneeProgressToPillarAgg(
  rows: TaskAssigneeProgress[],
  agg: KpiChecklistProgress,
  invert: boolean,
): TaskAssigneeProgress[] {
  if (rows.length === 0 || agg.total <= 0) return rows;
  const view = kpiChecklistMetricView(agg, invert);
  const sumDone = rows.reduce((sum, row) => sum + row.done, 0);
  const sumRemaining = rows.reduce((sum, row) => sum + row.remaining, 0);
  const sumTotal = rows.reduce((sum, row) => sum + row.total, 0);
  if (sumDone === view.positive && sumRemaining === view.negative && sumTotal === view.total) {
    return rows;
  }
  return scaleAssigneeBucketsToTargets(rows, view.positive, view.negative, view.total);
}

/** Spread legacy snapshot totals across current assignee weights when contributor JSON is missing. */
function scaleAssigneeProgressToTotals(
  rows: TaskAssigneeProgress[],
  targetDone: number,
  targetTotal: number,
): TaskAssigneeProgress[] {
  if (targetTotal <= 0 || rows.length === 0) return [];
  const liveTotal = rows.reduce((sum, row) => sum + row.total, 0);
  if (liveTotal <= 0) return [];

  let allocatedDone = 0;
  let allocatedTotal = 0;
  const scaled = rows.map((row, index) => {
    const isLast = index === rows.length - 1;
    const share = row.total / liveTotal;
    const total = isLast ? Math.max(0, targetTotal - allocatedTotal) : Math.round(targetTotal * share);
    const done = isLast
      ? Math.max(0, Math.min(total, targetDone - allocatedDone))
      : Math.min(total, Math.round(targetDone * share));
    allocatedTotal += total;
    allocatedDone += done;
    return {
      ...row,
      total,
      done,
      remaining: Math.max(0, total - done),
      percent: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  });
  return scaled;
}

type PeriodSnapshotRow = {
  total: number;
  done: number;
  missing: number;
  percent: number;
  contributorProgress?: unknown;
};

/** Per-period contributor rows aligned with the same snapshot/live source as pillar donut metrics. */
function contributorProgressForKpiPeriod(
  kpi: {
    title: string;
    mainTask?: string | null;
    subKpis: unknown;
    assignedAgent?: { id: string; name: string } | null;
  },
  periodKey: string,
  nowPeriodKey: string,
  snap: PeriodSnapshotRow | undefined,
  isDone: (item: SubKpiItem) => boolean,
): TaskAssigneeProgress[] {
  const checkboxRow = {
    title: kpi.title,
    mainTask: kpi.mainTask,
    subKpis: kpi.subKpis,
    assignedAgent: kpi.assignedAgent ?? null,
  };

  if (periodKey === nowPeriodKey) {
    return assigneeProgressForRows([checkboxRow], isDone);
  }
  if (!snap) return [];

  const stored = parseContributorProgress(snap.contributorProgress);
  if (stored.length > 0) {
    return storedToAssigneeProgress(stored);
  }
  if (snap.total > 0) {
    return scaleAssigneeProgressToTotals(
      assigneeProgressForRows([checkboxRow], isDone),
      snap.done,
      snap.total,
    );
  }
  return [];
}

type KpiForSubtaskCsv = {
  id: string;
  title: string;
  mainTask?: string | null;
  frequency: KpiFrequency;
  subKpis: unknown;
  recurrenceWeekday: number | null;
  recurrenceMonthDay: number | null;
  periodKey: string | null;
};

function collectSubtaskColumnTitles(pillarKpis: KpiForSubtaskCsv[]): string[] {
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const kpi of pillarKpis) {
    if (isPillarOnlyTask(kpi.subKpis)) {
      const title = kpiMainTaskLabel(kpi).trim();
      if (!title) continue;
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      titles.push(title);
      continue;
    }
    for (const item of collectAllSubKpiItems(normalizeSubKpis(kpi.subKpis))) {
      const title = item.title.trim();
      if (!title) continue;
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      titles.push(title);
    }
  }
  return titles;
}

function subtaskChecksFromSubKpis(
  subKpis: unknown,
  columns: readonly string[],
  taskTitle?: string,
): Record<string, boolean> {
  const byTitle = new Map<string, boolean>();
  if (isPillarOnlyTask(subKpis)) {
    const virtual = pillarVirtualSubKpiItem(subKpis, taskTitle);
    const title = (taskTitle ?? virtual?.title ?? "").trim();
    if (virtual && title) {
      byTitle.set(title.toLowerCase(), Boolean(virtual.done));
    }
  } else {
    for (const item of collectAllSubKpiItems(normalizeSubKpis(subKpis))) {
      const title = item.title.trim();
      if (!title) continue;
      byTitle.set(title.toLowerCase(), Boolean(item.done));
    }
  }
  return Object.fromEntries(columns.map((title) => [title, byTitle.get(title.toLowerCase()) === true]));
}

function formatSubtaskCsvDateLabel(ymd: string, zone: string): string {
  const dt = DateTime.fromISO(ymd, { zone: normalizeTimeZone(zone) });
  if (!dt.isValid) return ymd;
  return dt.toFormat("cccc, MMMM d, yyyy", { locale: "en" });
}

function formatMonthlySubtaskCsvDateLabel(year: number, month: number, zone: string): string {
  const dt = DateTime.fromObject({ year, month, day: 1 }, { zone: normalizeTimeZone(zone) });
  if (!dt.isValid) return `${month}/${year}`;
  return dt.toFormat("LLL. yyyy", { locale: "en" });
}

function formatSubtaskCsvEffCell(progress: KpiChecklistProgress, invert: boolean): string {
  if (progress.total <= 0) return "—";
  if (invert) {
    const { effPercent } = incidentMetricPercents(progress);
    return effPercent == null ? "—" : `${effPercent}%`;
  }
  return `${progress.percent}%`;
}

function formatSubtaskCsvCheckCell(done: boolean | undefined): string {
  if (done === undefined) return "";
  return done ? "TRUE" : "FALSE";
}

function primaryYearFromRange(fromYmd: string, toYmd: string, zone: string): number {
  const to = DateTime.fromISO(toYmd, { zone: normalizeTimeZone(zone) });
  if (to.isValid) return to.year;
  const from = DateTime.fromISO(fromYmd, { zone: normalizeTimeZone(zone) });
  return from.isValid ? from.year : DateTime.now().year;
}

function progressForKpiPeriod(args: {
  kpi: KpiForSubtaskCsv;
  periodKey: string;
  nowPeriodKey: string;
  snapshotByKpiPeriod: Map<string, { total: number; done: number; missing: number; percent: number }>;
}): { progress: KpiChecklistProgress; subKpis: unknown | null } | null {
  const snap = args.snapshotByKpiPeriod.get(`${args.kpi.id}:${args.periodKey}`);
  if (snap) {
    return { progress: snapshotToProgress(snap), subKpis: null };
  }
  if (args.periodKey === args.nowPeriodKey) {
    return { progress: kpiChecklistProgress(args.kpi.subKpis, kpiMainTaskLabel(args.kpi)), subKpis: args.kpi.subKpis };
  }
  return null;
}

function mergePeriodProgress(rows: KpiChecklistProgress[]): KpiChecklistProgress {
  if (rows.length === 0) return { total: 0, done: 0, missing: 0, percent: 0 };
  if (rows.length === 1) return rows[0]!;
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const done = rows.reduce((sum, row) => sum + row.done, 0);
  const missing = Math.max(0, total - done);
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return { total, done, missing, percent };
}

function mergeSubtaskChecks(
  checksList: Array<Record<string, boolean>>,
  columns: readonly string[],
): Record<string, boolean | undefined> {
  const out: Record<string, boolean | undefined> = {};
  for (const title of columns) {
    const values = checksList.map((checks) => checks[title]).filter((value) => value !== undefined);
    if (values.length === 0) {
      out[title] = undefined;
      continue;
    }
    out[title] = values.some(Boolean);
  }
  return out;
}

/**
 * Snapshots for past periods store only done/total, not per-item check state.
 * Fill unknown check cells from the period progress so the marks agree with EFF %
 * (100% → all checked, 0% → all unchecked, partial → done-count checked left to right).
 */
function fillChecksFromProgress(
  checks: Record<string, boolean | undefined>,
  columns: readonly string[],
  progress: KpiChecklistProgress,
): Record<string, boolean | undefined> {
  if (progress.total <= 0) return checks;
  const unknown = columns.filter((title) => checks[title] === undefined);
  if (unknown.length === 0) return checks;

  const knownTrue = columns.filter((title) => checks[title] === true).length;
  const targetTrue = Math.round((progress.done / progress.total) * columns.length);
  let remainingTrue = Math.max(0, Math.min(unknown.length, targetTrue - knownTrue));

  const out = { ...checks };
  for (const title of unknown) {
    out[title] = remainingTrue > 0;
    if (remainingTrue > 0) remainingTrue--;
  }
  return out;
}

function buildDailySubtaskCsvRows(args: {
  pillarKpis: KpiForSubtaskCsv[];
  columns: readonly string[];
  fromYmd: string;
  toYmd: string;
  zone: string;
  invert: boolean;
  snapshotByKpiPeriod: Map<string, { total: number; done: number; missing: number; percent: number }>;
  currentPeriodKeyFor: (kpi: KpiForSubtaskCsv) => string;
}): string[][] {
  const rows: string[][] = [];
  for (const ymd of enumerateYmdDaysInRange(args.fromYmd, args.toYmd, args.zone)) {
    const progressRows: KpiChecklistProgress[] = [];
    const checksList: Array<Record<string, boolean>> = [];
    for (const kpi of args.pillarKpis) {
      if ((kpi.frequency as KpiFrequencyCode) !== "DAILY") continue;
      const periodKeys = enumeratePeriodKeysForKpiInRange(kpi, ymd, ymd, args.zone);
      for (const key of periodKeys) {
        const resolved = progressForKpiPeriod({
          kpi,
          periodKey: key,
          nowPeriodKey: args.currentPeriodKeyFor(kpi),
          snapshotByKpiPeriod: args.snapshotByKpiPeriod,
        });
        if (!resolved) continue;
        progressRows.push(resolved.progress);
        if (resolved.subKpis) {
          checksList.push(subtaskChecksFromSubKpis(resolved.subKpis, args.columns, kpiMainTaskLabel(kpi)));
        }
      }
    }
    if (progressRows.length === 0) continue;
    const progress = mergePeriodProgress(progressRows);
    const mergedChecks = fillChecksFromProgress(
      mergeSubtaskChecks(checksList, args.columns),
      args.columns,
      progress,
    );
    rows.push([
      formatSubtaskCsvDateLabel(ymd, args.zone),
      ...args.columns.map((title) => formatSubtaskCsvCheckCell(mergedChecks[title])),
      formatSubtaskCsvEffCell(progress, args.invert),
    ]);
  }
  return rows;
}

function buildMonthlySubtaskCsvRows(args: {
  pillarKpis: KpiForSubtaskCsv[];
  columns: readonly string[];
  year: number;
  zone: string;
  invert: boolean;
  snapshotByKpiPeriod: Map<string, { total: number; done: number; missing: number; percent: number }>;
  currentPeriodKeyFor: (kpi: KpiForSubtaskCsv) => string;
}): string[][] {
  const rows: string[][] = [];
  for (let month = 1; month <= 12; month++) {
    const monthStart = DateTime.fromObject({ year: args.year, month, day: 1 }, { zone: args.zone });
    if (!monthStart.isValid) continue;
    const monthEnd = monthStart.endOf("month");
    const fromYmd = monthStart.toISODate();
    const toYmd = monthEnd.toISODate();
    if (!fromYmd || !toYmd) continue;

    const progressRows: KpiChecklistProgress[] = [];
    const checksList: Array<Record<string, boolean>> = [];
    for (const kpi of args.pillarKpis) {
      const freq = kpi.frequency as KpiFrequencyCode;
      if (freq !== "MONTHLY" && freq !== "QUARTERLY" && freq !== "SEMI_ANNUAL") continue;
      const periodKeys = enumeratePeriodKeysForKpiInRange(kpi, fromYmd, toYmd, args.zone);
      for (const key of periodKeys) {
        const resolved = progressForKpiPeriod({
          kpi,
          periodKey: key,
          nowPeriodKey: args.currentPeriodKeyFor(kpi),
          snapshotByKpiPeriod: args.snapshotByKpiPeriod,
        });
        if (!resolved) continue;
        progressRows.push(resolved.progress);
        if (resolved.subKpis) {
          checksList.push(subtaskChecksFromSubKpis(resolved.subKpis, args.columns, kpiMainTaskLabel(kpi)));
        }
      }
    }

    const progress = mergePeriodProgress(progressRows);
    const mergedChecks = fillChecksFromProgress(
      mergeSubtaskChecks(checksList, args.columns),
      args.columns,
      progress,
    );
    rows.push([
      formatMonthlySubtaskCsvDateLabel(args.year, month, args.zone),
      ...args.columns.map((title) => formatSubtaskCsvCheckCell(mergedChecks[title])),
      progress.total > 0 ? formatSubtaskCsvEffCell(progress, args.invert) : "—",
    ]);
  }
  return rows;
}

export function buildSubtaskCsvPreviewForPillar(args: {
  pillar: string;
  pillarKpis: KpiForSubtaskCsv[];
  metricsCadence: TaskMetricsCadence;
  fromYmd: string;
  toYmd: string;
  zone: string;
  snapshotByKpiPeriod: Map<string, { total: number; done: number; missing: number; percent: number }>;
  currentPeriodKeyFor: (kpi: KpiForSubtaskCsv) => string;
}): { columns: string[]; rows: string[][] } | null {
  if (args.pillar === "HELPDESK SUPPORT" || args.pillar === "USER SUPPORT") return null;
  const subtaskColumns = collectSubtaskColumnTitles(args.pillarKpis);
  if (subtaskColumns.length === 0) return null;

  const invert = isInvertedChecklistPillar(args.pillar);
  const csvColumns = ["DATE", ...subtaskColumns, "EFF %"];
  const useMonthlyLayout =
    args.metricsCadence === "MONTHLY" &&
    args.pillarKpis.some((kpi) => {
      const freq = kpi.frequency as KpiFrequencyCode;
      return freq === "MONTHLY" || freq === "QUARTERLY" || freq === "SEMI_ANNUAL";
    });

  const rows = useMonthlyLayout
    ? buildMonthlySubtaskCsvRows({
        pillarKpis: args.pillarKpis,
        columns: subtaskColumns,
        year: primaryYearFromRange(args.fromYmd, args.toYmd, args.zone),
        zone: args.zone,
        invert,
        snapshotByKpiPeriod: args.snapshotByKpiPeriod,
        currentPeriodKeyFor: args.currentPeriodKeyFor,
      })
    : buildDailySubtaskCsvRows({
        pillarKpis: args.pillarKpis,
        columns: subtaskColumns,
        fromYmd: args.fromYmd,
        toYmd: args.toYmd,
        zone: args.zone,
        invert,
        snapshotByKpiPeriod: args.snapshotByKpiPeriod,
        currentPeriodKeyFor: args.currentPeriodKeyFor,
      });

  if (rows.length === 0) return null;
  return { columns: csvColumns, rows };
}

export async function computeTaskChecklistPillarMetrics(args: {
  metricsCadence: TaskMetricsCadence;
  fromYmd: string;
  toYmd: string;
  timeZone: string;
  kpiWhere?: Prisma.KpiMaintenanceWhereInput;
  taskType?: TaskMetricsTaskType;
}): Promise<TaskChecklistPillarMetrics> {
  const { metricsCadence, fromYmd, toYmd, timeZone, kpiWhere = {}, taskType = "task" } = args;
  const zone = normalizeTimeZone(timeZone);

  const kpisWhereAnd: Prisma.KpiMaintenanceWhereInput[] = [];
  if (taskType === "task") {
    // Recurring tasks + completed one-offs (incomplete one-offs stay off the Task donuts).
    kpisWhereAnd.push({
      OR: [
        { isRecurring: true },
        { isRecurring: false, lastFullCompletionAt: { not: null } },
      ],
    });
  }
  if (Object.keys(kpiWhere).length > 0) {
    kpisWhereAnd.push(kpiWhere);
  }
  const kpis = await prisma.kpiMaintenance.findMany({
    where: kpisWhereAnd.length > 0 ? { AND: kpisWhereAnd } : {},
    select: {
      id: true,
      title: true,
      mainTask: true,
      itProjectName: true,
      frequency: true,
      subKpis: true,
      assignedAgent: { select: { id: true, name: true } },
      periodKey: true,
      recurrenceWeekday: true,
      recurrenceMonthDay: true,
      periodCycleStartAt: true,
      isRecurring: true,
    },
  });

  const kpisByPillar = new Map<string, (typeof kpis)[number][]>();
  for (const kpi of kpis) {
    const groupKey = pillarFromKpiTitle(kpi.title);
    if (groupKey === "HELPDESK SUPPORT" || groupKey === "USER SUPPORT") continue;
    const pillar = donutKeyForTaskMetricsRow(kpi, taskType);
    if (!pillar) continue;
    const list = kpisByPillar.get(pillar) ?? [];
    list.push(kpi);
    kpisByPillar.set(pillar, list);
  }

  /** Task type always exposes fixed donuts; Project / Field use a single bucket. */
  const pillarsToCompute =
    taskType === "task"
      ? [...TASK_FREQUENCY_DONUT_KEYS]
      : taskType === "field"
        ? [FIELD_ASSIGNMENT_DONUT_KEY]
        : [PROJECTS_DONUT_KEY];

  const selectedByPillar = new Map<string, (typeof kpis)[number][]>();
  const allSelectedKpis: (typeof kpis)[number][] = [];
  for (const pillar of pillarsToCompute) {
    const pillarKpis = kpisByPillar.get(pillar) ?? [];
    // Frequency / type buckets are already typed — keep every row in the bucket.
    const selected =
      taskType === "task" || taskType === "field"
        ? pillarKpis
        : selectKpisForPillarTaskMetrics(pillarKpis, metricsCadence);
    selectedByPillar.set(pillar, selected);
    if (selected.length > 0) {
      allSelectedKpis.push(...selected);
    }
  }

  const uniqueSelected = [...new Map(allSelectedKpis.map((k) => [k.id, k])).values()];

  const allPeriodKeys = new Set<string>();
  for (const kpi of uniqueSelected) {
    for (const key of enumeratePeriodKeysForKpiInRange(kpi, fromYmd, toYmd, zone)) {
      allPeriodKeys.add(key);
    }
  }

  const snapshots =
    uniqueSelected.length === 0 || allPeriodKeys.size === 0
      ? []
      : await prisma.kpiMaintenancePeriodSnapshot.findMany({
          where: {
            kpiMaintenanceId: { in: uniqueSelected.map((k) => k.id) },
            periodKey: { in: [...allPeriodKeys] },
          },
        });

  const snapshotByKpiPeriod = new Map(
    snapshots.map((s) => [`${s.kpiMaintenanceId}:${s.periodKey}`, s] as const),
  );

  const now = new Date();
  const currentPeriodKeyFor = (kpi: (typeof kpis)[number]) => resolvePeriodKeyForKpi(kpi, now, zone);

  const projectMetricsByPillar = await computeProjectTimelinePillarMetricsByTitle({
    kpiWhere,
    timeZone: zone,
    fromYmd,
    toYmd,
    taskType,
  });

  const result: TaskChecklistPillarMetrics = {};
  const pillarsWithProjectMetrics = new Set(
    Object.entries(projectMetricsByPillar)
      .filter(
        ([, metric]) =>
          (metric?.periodsCounted ?? 0) > 0 || (metric?.total ?? 0) > 0,
      )
      .map(([pillar]) => pillar),
  );

  const pillarsForLoop = [
    ...pillarsToCompute,
    ...[...pillarsWithProjectMetrics].filter((p) => !pillarsToCompute.includes(p)),
  ];

  for (const pillar of pillarsForLoop) {
    if (pillarsWithProjectMetrics.has(pillar) && projectMetricsByPillar[pillar]) {
      const projectKpis = (kpisByPillar.get(pillar) ?? []).filter((kpi) =>
        isProjectTimelineMetricsKpi(kpi),
      );
      result[pillar] = {
        ...projectMetricsByPillar[pillar]!,
        includedTasks: buildIncludedTasksForKpis(projectKpis),
      };
      continue;
    }

    const pillarKpis = (selectedByPillar.get(pillar) ?? []).filter(
      (kpi) => !isProjectTimelineMetricsKpi(kpi),
    );
    const includedTasks = buildIncludedTasksForKpis(
      taskType ? (selectedByPillar.get(pillar) ?? []) : pillarKpis,
    );

    // For task/field buckets, include every mapped row (including project-like field tasks).
    const rowsForProgress =
      taskType && (selectedByPillar.get(pillar)?.length ?? 0) > 0
        ? (selectedByPillar.get(pillar) ?? [])
        : pillarKpis;

    if (rowsForProgress.length === 0) {
      result[pillar] = {
        total: 0,
        done: 0,
        missing: 0,
        percent: 0,
        periodsCounted: 0,
        periodsInRange: 0,
        dailyProgressRows: [],
        assigneeProgress: [],
        assigneeProgressAccumulated: [],
        includedTasks,
      };
      continue;
    }

    const progressRows: KpiChecklistProgress[] = [];
    const assigneeBundles: AssigneeProgressBundle[] = [];
    const personnelRoster: PersonnelKpiRosterRow[] = [];
    const invert = isInvertedChecklistPillar(pillar);
    let periodsInRange = 0;

    for (const kpi of rowsForProgress) {
      const periodKeys = enumeratePeriodKeysForKpiInRange(kpi, fromYmd, toYmd, zone);
      periodsInRange += periodKeys.length;
      const nowPeriodKey = currentPeriodKeyFor(kpi);
      let countedPeriodsForKpi = 0;

      for (const key of periodKeys) {
        const snap = snapshotByKpiPeriod.get(`${kpi.id}:${key}`);
        let progress: KpiChecklistProgress | null = null;
        if (snap) {
          progress = snapshotToProgress(snap);
        } else if (key === nowPeriodKey) {
          /**
           * Live Task Board checkboxes for the active period when no snapshot exists yet.
           * Count the in-progress period toward the aggregate only once it is fully
           * complete; otherwise an unfinished "today" drags the percent below the
           * personnel breakdowns, which are snapshot-based. Inverted (incident-style)
           * pillars keep live inclusion since unchecked means healthy there.
           */
          const live = kpiChecklistProgress(kpi.subKpis, kpiMainTaskLabel(kpi));
          if (invert || (live.total > 0 && live.done >= live.total)) {
            progress = live;
          }
        }
        if (!progress) continue;

        countedPeriodsForKpi += 1;
        progressRows.push(progress);
        assigneeBundles.push({
          progress,
          contributors: contributorProgressForKpiPeriod(kpi, key, nowPeriodKey, snap, rawCheckboxIsDone),
        });
      }

      personnelRoster.push({
        row: { title: kpi.title, mainTask: kpi.mainTask, subKpis: kpi.subKpis, assignedAgent: kpi.assignedAgent ?? null },
        /** Assigned should reflect only counted periods so an in-progress day doesn't inflate it. */
        periodCount: countedPeriodsForKpi,
      });
    }

    const dailyProgressRows: TaskChecklistDailyProgress[] = [];
    const hasDailyKpis = rowsForProgress.some((kpi) => (kpi.frequency as KpiFrequencyCode) === "DAILY");
    for (const ymd of enumerateYmdDaysInRange(fromYmd, toYmd, zone)) {
      const dayRows: KpiChecklistProgress[] = [];
      for (const kpi of rowsForProgress) {
        if ((kpi.frequency as KpiFrequencyCode) !== "DAILY") continue;
        const periodKeys = enumeratePeriodKeysForKpiInRange(kpi, ymd, ymd, zone);
        const nowPeriodKey = currentPeriodKeyFor(kpi);
        for (const key of periodKeys) {
          const snap = snapshotByKpiPeriod.get(`${kpi.id}:${key}`);
          if (snap) {
            dayRows.push(snapshotToProgress(snap));
          } else if (key === nowPeriodKey) {
            dayRows.push(kpiChecklistProgress(kpi.subKpis, kpiMainTaskLabel(kpi)));
          }
        }
      }
      if (hasDailyKpis) {
        const dayAgg = averageDailyProgress(dayRows);
        const skipEmptyIncidentDay =
          isInvertedChecklistPillar(pillar) && dayAgg.total <= 0;
        if (!skipEmptyIncidentDay) {
          dailyProgressRows.push({ date: ymd, ...dayAgg });
        }
      }
    }

    if (progressRows.length === 0) {
      result[pillar] = {
        total: 0,
        done: 0,
        missing: 0,
        percent: 0,
        periodsCounted: 0,
        periodsInRange,
        dailyProgressRows,
        assigneeProgress: [],
        assigneeProgressAccumulated: [],
        includedTasks,
      };
      continue;
    }

    const pillarAgg =
      progressRows.length === 1
        ? {
            ...progressRows[0]!,
            periodsCounted: 1,
            periodsInRange: Math.max(1, periodsInRange),
          }
        : (() => {
            const averaged = averageProgress(progressRows);
            averaged.periodsInRange = periodsInRange;
            return averaged;
          })();

    let assigneeProgress = syncAssigneeProgressToPillarAgg(
      applyAssigneeDonutView(averageAssigneeProgressAcrossPeriods(assigneeBundles), invert),
      pillarAgg,
      invert,
    );
    let assigneeProgressAccumulated = applyAssigneeDonutView(
      personnelAssigneeProgressAcrossPeriods(assigneeBundles, personnelRoster, rawCheckboxIsDone),
      invert,
    );

    const penaltyRows: PersonnelDelayPenaltyRow[] = [
      ...mergePenaltyDeductionMaps(
        rowsForProgress.map((kpi) =>
          penaltyDeductionsForKpi(
            {
              subKpis: kpi.subKpis,
              frequency: kpi.frequency as KpiFrequencyCode,
              isRecurring: kpi.isRecurring,
              title: kpi.title,
              assignedAgent: kpi.assignedAgent ?? null,
            },
            { nowMs: Date.now(), timeZone: zone },
          ),
        ),
      ).values(),
    ].filter((row) => row.deduction > 0);

    let headlinePercent = pillarAgg.percent;
    if (penaltyRows.length > 0) {
      assigneeProgress = applyPenaltiesToAssigneeProgress(assigneeProgress, penaltyRows);
      assigneeProgressAccumulated = applyPenaltiesToAssigneeProgress(
        assigneeProgressAccumulated,
        penaltyRows,
      );
      headlinePercent =
        assigneeProgress.length > 0
          ? weightedAssigneeProgressPercent(assigneeProgress)
          : applyPenaltyToTaskEfficiency(
              pillarAgg.percent,
              penaltyRows.reduce((s, row) => s + row.deduction, 0),
            );
    }

    const subtaskCsv = buildSubtaskCsvPreviewForPillar({
      pillar,
      pillarKpis: rowsForProgress,
      metricsCadence,
      fromYmd,
      toYmd,
      zone,
      snapshotByKpiPeriod,
      currentPeriodKeyFor: (kpi) => currentPeriodKeyFor(kpi as (typeof kpis)[number]),
    });

    result[pillar] = {
      ...pillarAgg,
      percent: headlinePercent,
      dailyProgressRows,
      assigneeProgress,
      assigneeProgressAccumulated,
      includedTasks,
      ...(subtaskCsv
        ? { subtaskCsvColumns: subtaskCsv.columns, subtaskCsvRows: subtaskCsv.rows }
        : {}),
    };
  }

  return result;
}

/** Headline percent for a pillar (respects inverted checklist pillars). */
export function pillarMetricPercent(
  pillar: string,
  _metricsCadence: TaskMetricsCadence,
  agg: KpiChecklistProgress,
): number {
  return kpiChecklistMetricView(agg, isInvertedChecklistPillar(pillar)).percent;
}

/** Backfill daily/weekly/monthly period snapshots across a local date range. */
export async function backfillKpiPeriodSnapshotsForRange(args: {
  fromYmd: string;
  toYmd: string;
  timeZone: string;
  fillMissingOnly?: boolean;
}): Promise<{ applied: number; skipped: number }> {
  const zone = normalizeTimeZone(args.timeZone);
  const fillMissingOnly = args.fillMissingOnly !== false;
  const days = enumerateYmdDaysInRange(args.fromYmd, args.toYmd, zone);
  if (days.length === 0) return { applied: 0, skipped: 0 };

  const rows = await prisma.kpiMaintenance.findMany({
    where: { isRecurring: true },
    select: {
      id: true,
      title: true,
      frequency: true,
      subKpis: true,
      periodKey: true,
      recurrenceWeekday: true,
      recurrenceMonthDay: true,
      periodCycleStartAt: true,
      isRecurring: true,
      assignedAgent: { select: { id: true, name: true } },
    },
  });

  let applied = 0;
  let skipped = 0;

  for (const row of rows) {
    for (const ymd of days) {
      const periodKeys = enumeratePeriodKeysForKpiInRange(row, ymd, ymd, zone);
      const at = DateTime.fromISO(ymd, { zone }).toJSDate();
      for (const periodKey of periodKeys) {
        if (fillMissingOnly) {
          const existing = await prisma.kpiMaintenancePeriodSnapshot.findUnique({
            where: {
              kpiMaintenanceId_periodKey: {
                kpiMaintenanceId: row.id,
                periodKey,
              },
            },
            select: { id: true },
          });
          if (existing) {
            skipped += 1;
            continue;
          }
        }
        await upsertKpiPeriodSnapshot(row, zone, at, periodKey);
        applied += 1;
      }
    }
  }

  return { applied, skipped };
}
