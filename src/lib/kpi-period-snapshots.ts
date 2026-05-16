import { DateTime } from "luxon";
import type { KpiFrequency } from "@prisma/client";
import {
  computePeriodKey,
  getDailyPeriodKey,
  getMonthlyPeriodKey,
  getWeeklyPeriodKey,
  normalizeTimeZone,
  type KpiFrequencyCode,
} from "@/lib/kpi-recurrence";
import {
  isInvertedChecklistPillar,
  kpiChecklistMetricView,
  kpiChecklistProgress,
  type KpiChecklistProgress,
} from "@/lib/kpi-subkpis";
import { IT_TASK_PILLAR_TITLES, type ItTaskPillarTitle } from "@/lib/it-task-pillar-titles";
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
  if (!periodKey) return "UTC";
  const parts = periodKey.split(":");
  if (parts.length >= 3 && parts[1]) return normalizeTimeZone(parts[1]);
  return "UTC";
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

/** Persist checklist progress for the active period (idempotent). */
export async function upsertKpiPeriodSnapshot(
  row: KpiRowForSnapshot,
  timeZone: string,
  at: Date = new Date(),
): Promise<void> {
  if (!row.isRecurring) return;
  const zone = normalizeTimeZone(timeZone);
  const periodKey = resolvePeriodKeyForKpi(row, at, zone);
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

function ymdToDate(ymd: string, timeZone: string): Date {
  return DateTime.fromISO(ymd, { zone: normalizeTimeZone(timeZone) }).startOf("day").toJSDate();
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
      keys.add(getDailyPeriodKey(cursor.toJSDate(), zone));
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
  while (cursor <= end) {
    keys.add(getMonthlyPeriodKey(cursor.toJSDate(), dom, zone));
    cursor = cursor.plus({ days: 1 });
  }
  return [...keys];
}

/** Which KPI definition cadences contribute to a task-metrics reporting cadence. */
export function kpiFrequencyMatchesMetricsCadence(
  kpiFrequency: KpiFrequencyCode,
  metricsCadence: KpiFrequencyCode,
): boolean {
  if (metricsCadence === "DAILY") return kpiFrequency === "DAILY";
  if (metricsCadence === "WEEKLY") return kpiFrequency === "DAILY" || kpiFrequency === "WEEKLY";
  return true;
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

export type TaskChecklistPillarMetric = KpiChecklistProgress & {
  periodsCounted: number;
  periodsInRange: number;
};

export type TaskChecklistPillarMetrics = Partial<Record<ItTaskPillarTitle, TaskChecklistPillarMetric>>;

export async function computeTaskChecklistPillarMetrics(args: {
  metricsCadence: KpiFrequencyCode;
  fromYmd: string;
  toYmd: string;
  timeZone: string;
  kpiWhere: { assignedAgentId?: string };
}): Promise<TaskChecklistPillarMetrics> {
  const { metricsCadence, fromYmd, toYmd, timeZone, kpiWhere } = args;
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
      periodKey: true,
      recurrenceWeekday: true,
      recurrenceMonthDay: true,
      periodCycleStartAt: true,
      isRecurring: true,
    },
  });

  const scoped = kpis.filter((k) =>
    kpiFrequencyMatchesMetricsCadence(k.frequency as KpiFrequencyCode, metricsCadence),
  );

  const allPeriodKeys = new Set<string>();
  for (const kpi of scoped) {
    for (const key of enumeratePeriodKeysForKpiInRange(kpi, fromYmd, toYmd, zone)) {
      allPeriodKeys.add(key);
    }
  }

  const snapshots =
    scoped.length === 0 || allPeriodKeys.size === 0
      ? []
      : await prisma.kpiMaintenancePeriodSnapshot.findMany({
          where: {
            kpiMaintenanceId: { in: scoped.map((k) => k.id) },
            periodKey: { in: [...allPeriodKeys] },
          },
        });

  const snapshotByKpiPeriod = new Map(
    snapshots.map((s) => [`${s.kpiMaintenanceId}:${s.periodKey}`, s] as const),
  );

  const now = new Date();
  const currentPeriodKeyFor = (kpi: (typeof scoped)[number]) =>
    resolvePeriodKeyForKpi(kpi, now, zone);

  const result: TaskChecklistPillarMetrics = {};

  for (const pillar of IT_TASK_PILLAR_TITLES) {
    if (pillar === "HELPDESK SUPPORT" || pillar === "USER SUPPORT") continue;

    const pillarKpis = scoped.filter((k) => k.title.trim() === pillar);
    if (pillarKpis.length === 0) continue;

    const progressRows: KpiChecklistProgress[] = [];
    let periodsInRange = 0;

    for (const kpi of pillarKpis) {
      const periodKeys = enumeratePeriodKeysForKpiInRange(kpi, fromYmd, toYmd, zone);
      periodsInRange += periodKeys.length;
      const activeKey = currentPeriodKeyFor(kpi);

      for (const key of periodKeys) {
        const snap = snapshotByKpiPeriod.get(`${kpi.id}:${key}`);
        if (snap) {
          progressRows.push(snapshotToProgress(snap));
        } else if (key === activeKey) {
          progressRows.push(kpiChecklistProgress(kpi.subKpis));
        }
      }
    }

    if (progressRows.length === 0) {
      result[pillar] = { total: 0, done: 0, missing: 0, percent: 0, periodsCounted: 0, periodsInRange };
      continue;
    }

    if (progressRows.length === 1) {
      result[pillar] = { ...progressRows[0]!, periodsCounted: 1, periodsInRange: Math.max(1, periodsInRange) };
      continue;
    }

    const averaged = averageProgress(progressRows);
    averaged.periodsInRange = periodsInRange;
    result[pillar] = averaged;
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
