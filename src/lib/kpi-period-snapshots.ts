import { DateTime } from "luxon";
import type { KpiFrequency, Prisma } from "@prisma/client/primary";
import {
  DEFAULT_TIME_ZONE,
  computePeriodKey,
  getDailyPeriodKey,
  getMonthlyPeriodKey,
  getQuarterlyPeriodKey,
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
  kpiChecklistMetricView,
  kpiChecklistProgress,
  normalizeSubKpis,
  pillarVirtualSubKpiItem,
  subKpiProgressOwner,
  type KpiChecklistProgress,
  type SubKpiItem,
} from "@/lib/kpi-subkpis";
import { countItProjectSubKpiStatus, itProjectChecklistItems, itProjectStatusProgress } from "@/lib/it-project-subkpis";
import {
  IT_PROJECT_IMPLEMENTATION_TITLE,
  IT_TASK_PILLAR_TITLES,
  type ItTaskPillarTitle,
} from "@/lib/it-task-pillar-titles";
import { pillarFromKpiTitle } from "@/lib/kpi-sheet-import-snapshots";
import { kpiMainTaskLabel } from "@/lib/kpi-main-task";
import { prisma } from "@/lib/prisma";

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
  const getPeriodKey = freq === "QUARTERLY" ? getQuarterlyPeriodKey : getMonthlyPeriodKey;
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
  metricsCadence: KpiFrequencyCode,
): T[] {
  if (pillarKpis.length === 0) return [];
  const daily = pillarKpis.filter((k) => (k.frequency as KpiFrequencyCode) === "DAILY");
  const weekly = pillarKpis.filter((k) => (k.frequency as KpiFrequencyCode) === "WEEKLY");
  const monthly = pillarKpis.filter((k) => (k.frequency as KpiFrequencyCode) === "MONTHLY");
  const quarterly = pillarKpis.filter((k) => (k.frequency as KpiFrequencyCode) === "QUARTERLY");

  if (metricsCadence === "DAILY") return daily;

  if (daily.length > 0) return daily;

  if (metricsCadence === "WEEKLY") {
    return weekly.length > 0 ? weekly : monthly;
  }

  if (metricsCadence === "MONTHLY") {
    return monthly.length > 0 ? monthly : quarterly.length > 0 ? quarterly : weekly;
  }

  return quarterly.length > 0 ? quarterly : monthly.length > 0 ? monthly : weekly;
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

export type TaskChecklistPillarMetrics = Partial<Record<ItTaskPillarTitle, TaskChecklistPillarMetric>>;

/** IANA zone used when writing/reading imported KPI period snapshots (defaults to REPORT_TZ). */
export function snapshotTimeZoneForTaskMetrics(clientTz?: string | null): string {
  const fromEnv = process.env.KPI_SNAPSHOT_TZ ?? process.env.REPORT_TZ;
  if (fromEnv) return normalizeTimeZone(fromEnv);
  const client = clientTz?.trim();
  // Imported snapshots use Asia/Manila keys; UTC is the SSR/hydration default, not the data zone.
  if (client && client !== "UTC") return normalizeTimeZone(client);
  return "Asia/Manila";
}

/** Task metrics checklist rows: admins see all; personnel see their assignments plus org-wide (unassigned) KPIs. */
export function kpiMaintenanceWhereForTaskMetrics(
  assignedAgentId?: string,
  assignedAgentIds?: string[],
): Prisma.KpiMaintenanceWhereInput {
  if (assignedAgentIds) {
    return { assignedAgentId: { in: assignedAgentIds.length > 0 ? assignedAgentIds : ["__none__"] } };
  }
  if (!assignedAgentId) return {};
  if (assignedAgentId === "__none__") return { assignedAgentId: null };
  return {
    OR: [{ assignedAgentId }, { assignedAgentId: null }],
  };
}

async function computeItProjectImplementationPillarMetric(args: {
  kpiWhere: Prisma.KpiMaintenanceWhereInput;
  timeZone: string;
}): Promise<TaskChecklistPillarMetric> {
  const rows = await prisma.kpiMaintenance.findMany({
    where: {
      title: IT_PROJECT_IMPLEMENTATION_TITLE,
      isRecurring: false,
      ...args.kpiWhere,
    },
    select: {
      subKpis: true,
      assignedAgent: { select: { id: true, name: true } },
    },
  });
  const nowMs = Date.now();
  let total = 0;
  let completedOnTime = 0;
  let delayed = 0;
  for (const row of rows) {
    const counts = countItProjectSubKpiStatus(row.subKpis, nowMs, args.timeZone);
    total += counts.total;
    completedOnTime += counts.completedOnTime;
    delayed += counts.delayed;
  }
  const percent = total > 0 ? Math.round((completedOnTime / total) * 100) : 0;
  const assigneeProgress = assigneeProgressForRows(
    rows.map((row) => ({
      subKpis: row.subKpis,
      assignedAgent: row.assignedAgent,
      items: itProjectChecklistItems(row.subKpis),
    })),
    (item) => itProjectStatusProgress(item) === 100,
  );
  return {
    total,
    done: completedOnTime,
    missing: delayed,
    percent,
    periodsCounted: rows.length,
    periodsInRange: rows.length,
    assigneeProgress,
    assigneeProgressAccumulated: assigneeProgress,
  };
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
    const mergedChecks = mergeSubtaskChecks(checksList, args.columns);
    const progress = mergePeriodProgress(progressRows);
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
      if (freq !== "MONTHLY" && freq !== "QUARTERLY") continue;
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

    const mergedChecks = mergeSubtaskChecks(checksList, args.columns);
    const progress = mergePeriodProgress(progressRows);
    rows.push([
      formatMonthlySubtaskCsvDateLabel(args.year, month, args.zone),
      ...args.columns.map((title) => formatSubtaskCsvCheckCell(mergedChecks[title])),
      progress.total > 0 ? formatSubtaskCsvEffCell(progress, args.invert) : "—",
    ]);
  }
  return rows;
}

export function buildSubtaskCsvPreviewForPillar(args: {
  pillar: ItTaskPillarTitle;
  pillarKpis: KpiForSubtaskCsv[];
  metricsCadence: KpiFrequencyCode;
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
      return freq === "MONTHLY" || freq === "QUARTERLY";
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
  metricsCadence: KpiFrequencyCode;
  fromYmd: string;
  toYmd: string;
  timeZone: string;
  kpiWhere?: Prisma.KpiMaintenanceWhereInput;
}): Promise<TaskChecklistPillarMetrics> {
  const { metricsCadence, fromYmd, toYmd, timeZone, kpiWhere = {} } = args;
  const zone = normalizeTimeZone(timeZone);

  const kpisWhereAnd: Prisma.KpiMaintenanceWhereInput[] = [
    {
      OR: [
        { isRecurring: true },
        { isRecurring: false, lastFullCompletionAt: { not: null } },
      ],
    },
  ];
  if (Object.keys(kpiWhere).length > 0) {
    kpisWhereAnd.push(kpiWhere);
  }
  const kpis = await prisma.kpiMaintenance.findMany({
    where: { AND: kpisWhereAnd },
    select: {
      id: true,
      title: true,
      mainTask: true,
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

  const kpisByPillar = new Map<ItTaskPillarTitle, (typeof kpis)[number][]>();
  for (const kpi of kpis) {
    const pillar = pillarFromKpiTitle(kpi.title);
    if (!pillar || pillar === "HELPDESK SUPPORT" || pillar === "USER SUPPORT") continue;
    const list = kpisByPillar.get(pillar) ?? [];
    list.push(kpi);
    kpisByPillar.set(pillar, list);
  }

  const selectedByPillar = new Map<string, (typeof kpis)[number][]>();
  const allSelectedKpis: (typeof kpis)[number][] = [];
  for (const pillar of IT_TASK_PILLAR_TITLES) {
    if (pillar === "HELPDESK SUPPORT" || pillar === "USER SUPPORT") continue;
    const pillarKpis = kpisByPillar.get(pillar) ?? [];
    const selected = selectKpisForPillarTaskMetrics(pillarKpis, metricsCadence);
    if (selected.length > 0) {
      selectedByPillar.set(pillar, selected);
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

  const result: TaskChecklistPillarMetrics = {};

  for (const pillar of IT_TASK_PILLAR_TITLES) {
    if (pillar === "HELPDESK SUPPORT" || pillar === "USER SUPPORT") continue;

    if (pillar === IT_PROJECT_IMPLEMENTATION_TITLE) {
      result[pillar] = await computeItProjectImplementationPillarMetric({ kpiWhere, timeZone: zone });
      continue;
    }

    const pillarKpis = selectedByPillar.get(pillar) ?? [];
    if (pillarKpis.length === 0) {
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
      };
      continue;
    }

    const progressRows: KpiChecklistProgress[] = [];
    const assigneeBundles: AssigneeProgressBundle[] = [];
    const personnelRoster: PersonnelKpiRosterRow[] = [];
    const invert = isInvertedChecklistPillar(pillar);
    let periodsInRange = 0;

    for (const kpi of pillarKpis) {
      const periodKeys = enumeratePeriodKeysForKpiInRange(kpi, fromYmd, toYmd, zone);
      periodsInRange += periodKeys.length;
      personnelRoster.push({
        row: { title: kpi.title, mainTask: kpi.mainTask, subKpis: kpi.subKpis, assignedAgent: kpi.assignedAgent ?? null },
        periodCount: periodKeys.length,
      });
      const nowPeriodKey = currentPeriodKeyFor(kpi);

      for (const key of periodKeys) {
        const snap = snapshotByKpiPeriod.get(`${kpi.id}:${key}`);
        let progress: KpiChecklistProgress | null = null;
        if (snap) {
          progress = snapshotToProgress(snap);
        } else if (key === nowPeriodKey) {
          /** Live Task Board checkboxes for the active period when no snapshot exists yet. */
          progress = kpiChecklistProgress(kpi.subKpis, kpiMainTaskLabel(kpi));
        }
        if (!progress) continue;

        progressRows.push(progress);
        assigneeBundles.push({
          progress,
          contributors: contributorProgressForKpiPeriod(kpi, key, nowPeriodKey, snap, rawCheckboxIsDone),
        });
      }
    }

    const dailyProgressRows: TaskChecklistDailyProgress[] = [];
    const hasDailyKpis = pillarKpis.some((kpi) => (kpi.frequency as KpiFrequencyCode) === "DAILY");
    for (const ymd of enumerateYmdDaysInRange(fromYmd, toYmd, zone)) {
      const dayRows: KpiChecklistProgress[] = [];
      for (const kpi of pillarKpis) {
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

    const assigneeProgress = syncAssigneeProgressToPillarAgg(
      applyAssigneeDonutView(averageAssigneeProgressAcrossPeriods(assigneeBundles), invert),
      pillarAgg,
      invert,
    );
    const assigneeProgressAccumulated = applyAssigneeDonutView(
      personnelAssigneeProgressAcrossPeriods(assigneeBundles, personnelRoster, rawCheckboxIsDone),
      invert,
    );

    const subtaskCsv = buildSubtaskCsvPreviewForPillar({
      pillar,
      pillarKpis,
      metricsCadence,
      fromYmd,
      toYmd,
      zone,
      snapshotByKpiPeriod,
      currentPeriodKeyFor: (kpi) => currentPeriodKeyFor(kpi as (typeof kpis)[number]),
    });

    result[pillar] = {
      ...pillarAgg,
      dailyProgressRows,
      assigneeProgress,
      assigneeProgressAccumulated,
      ...(subtaskCsv
        ? { subtaskCsvColumns: subtaskCsv.columns, subtaskCsvRows: subtaskCsv.rows }
        : {}),
    };
  }

  return result;
}

/** Headline percent for a pillar (respects inverted cyber/network pillars). */
export function pillarMetricPercent(
  pillar: ItTaskPillarTitle,
  _metricsCadence: KpiFrequencyCode,
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
