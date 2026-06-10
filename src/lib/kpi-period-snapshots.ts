import { DateTime } from "luxon";
import type { KpiFrequency, Prisma } from "@prisma/client";
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
  isInvertedChecklistPillar,
  kpiChecklistMetricView,
  kpiChecklistProgress,
  normalizeSubKpis,
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
import { prisma } from "@/lib/prisma";

export type KpiRowForSnapshot = {
  id: string;
  title: string;
  frequency: KpiFrequency;
  subKpis: unknown;
  periodKey: string | null;
  recurrenceWeekday: number | null;
  recurrenceMonthDay: number | null;
  periodCycleStartAt: Date | null;
  isRecurring: boolean;
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
  if (!row.isRecurring) return;
  const zone = normalizeTimeZone(timeZone);
  const atDt = DateTime.fromMillis(at.getTime(), { zone });
  if ((row.frequency as KpiFrequencyCode) === "DAILY" && !isKpiMetricsWorkingDay(atDt)) {
    return;
  }
  const periodKey =
    periodKeyOverride?.trim() || resolvePeriodKeyForKpi(row, at, zone);
  const progress = kpiChecklistProgress(row.subKpis);
  const fullyComplete = progress.total > 0 && progress.missing === 0;

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
    },
    update: {
      total: progress.total,
      done: progress.done,
      missing: progress.missing,
      percent: progress.percent,
      fullyComplete,
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
  dailyProgressRows?: TaskChecklistDailyProgress[];
  assigneeProgress?: TaskAssigneeProgress[];
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
): Prisma.KpiMaintenanceWhereInput {
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
    assigneeProgress: averageAssigneeProgressToDonut(assigneeProgress, percent),
  };
}

function assigneeProgressForRows(
  rows: ReadonlyArray<{
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
    const items = row.items ?? collectAllSubKpiItems(normalizeSubKpis(row.subKpis));
    for (const item of items) {
      if (!item.title.trim()) continue;
      const subAssigneeId = item.assignedAgentId?.trim() || "";
      const parentAssigneeId = row.assignedAgent?.id?.trim() || "";
      const candidates = new Map<string, { id: string; name: string; roles: string[] }>();
      if (parentAssigneeId) {
        candidates.set(parentAssigneeId, {
          id: parentAssigneeId,
          name: row.assignedAgent?.name?.trim() || "Assigned user",
          roles: ["Assignee"],
        });
      }
      if (subAssigneeId && subAssigneeId !== parentAssigneeId) {
        candidates.set(subAssigneeId, {
          id: subAssigneeId,
          name: item.assignedAgentName?.trim() || row.assignedAgent?.name?.trim() || "Assigned user",
          roles: ["Sub-assignee"],
        });
      }
      if (candidates.size === 0) {
        candidates.set("__unassigned__", { id: "__unassigned__", name: "Unassigned", roles: ["Unassigned"] });
      }

      for (const candidate of candidates.values()) {
        const current = byAssignee.get(candidate.id) ?? {
          id: candidate.id,
          name: candidate.name,
          roles: new Set<string>(),
          total: 0,
          done: 0,
        };
        for (const role of candidate.roles) current.roles.add(role);
        current.total += 1;
        if (isDone(item)) current.done += 1;
        byAssignee.set(candidate.id, current);
      }
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
      return {
        id: row.id,
        name: row.name,
        role: displayRoles.join(" / "),
        total: row.total,
        done: row.done,
        percent: row.total > 0 ? Math.round((row.done / row.total) * 100) : 0,
      };
    })
    .sort((a, b) => b.percent - a.percent || b.done - a.done || a.name.localeCompare(b.name));
}

function averageAssigneeProgressToDonut(
  rows: TaskAssigneeProgress[],
  targetPercent: number,
): TaskAssigneeProgress[] {
  const safeTarget = Math.min(100, Math.max(0, Math.round(targetPercent)));
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const done = rows.reduce((sum, row) => sum + row.done, 0);
  const currentPercent = total > 0 ? Math.round((done / total) * 100) : 0;

  return rows
    .map((row) => {
      const scaledPercent =
        currentPercent > 0 ? Math.round((row.percent * safeTarget) / currentPercent) : safeTarget;
      const percent = Math.min(100, Math.max(0, scaledPercent));
      return {
        ...row,
        done: Math.round((row.total * percent) / 100),
        percent,
      };
    })
    .sort((a, b) => b.percent - a.percent || b.done - a.done || a.name.localeCompare(b.name));
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

  const kpis = await prisma.kpiMaintenance.findMany({
    where: {
      isRecurring: true,
      ...kpiWhere,
    },
    select: {
      id: true,
      title: true,
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
      };
      continue;
    }

    const progressRows: KpiChecklistProgress[] = [];
    const invert = isInvertedChecklistPillar(pillar);
    const rawAssigneeProgress = assigneeProgressForRows(pillarKpis, (item) =>
      invert ? !item.done : Boolean(item.done),
    );
    let periodsInRange = 0;

    for (const kpi of pillarKpis) {
      const periodKeys = enumeratePeriodKeysForKpiInRange(kpi, fromYmd, toYmd, zone);
      periodsInRange += periodKeys.length;
      const nowPeriodKey = currentPeriodKeyFor(kpi);

      for (const key of periodKeys) {
        const snap = snapshotByKpiPeriod.get(`${kpi.id}:${key}`);
        if (snap) {
          progressRows.push(snapshotToProgress(snap));
        } else if (metricsCadence === "DAILY" && key === nowPeriodKey) {
          /** Daily view may show today's live checklist before a snapshot exists. Wider cadences use stored snapshots only. */
          progressRows.push(kpiChecklistProgress(kpi.subKpis));
        }
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
          } else if (metricsCadence === "DAILY" && key === nowPeriodKey) {
            dayRows.push(kpiChecklistProgress(kpi.subKpis));
          }
        }
      }
      if (hasDailyKpis) {
        dailyProgressRows.push({ date: ymd, ...averageDailyProgress(dayRows) });
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
        assigneeProgress: averageAssigneeProgressToDonut(rawAssigneeProgress, 0),
      };
      continue;
    }

    if (progressRows.length === 1) {
      const targetPercent = kpiChecklistMetricView(progressRows[0]!, invert).percent;
      result[pillar] = {
        ...progressRows[0]!,
        periodsCounted: 1,
        periodsInRange: Math.max(1, periodsInRange),
        dailyProgressRows,
        assigneeProgress: averageAssigneeProgressToDonut(rawAssigneeProgress, targetPercent),
      };
      continue;
    }

    const averaged = averageProgress(progressRows);
    averaged.periodsInRange = periodsInRange;
    const targetPercent = kpiChecklistMetricView(averaged, invert).percent;
    result[pillar] = {
      ...averaged,
      dailyProgressRows,
      assigneeProgress: averageAssigneeProgressToDonut(rawAssigneeProgress, targetPercent),
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
