import { DateTime } from "luxon";
import { IT_TASK_PILLAR_TITLES, type ItTaskPillarTitle } from "@/lib/it-task-pillar-titles";
import {
  getDailyPeriodKey,
  getMonthlyPeriodKey,
  getWeeklyPeriodKey,
  normalizeTimeZone,
} from "@/lib/kpi-recurrence";
import { prisma } from "@/lib/prisma";

/** Map KPI sheet labels (any case/spacing) to canonical pillar titles. */
const PILLAR_LOOKUP: Array<{ match: RegExp; pillar: ItTaskPillarTitle }> = [
  { match: /^\s*system\s+availability\s*$/i, pillar: "SYSTEM AVAILABILITY" },
  { match: /^\s*cybersecurity\s*$/i, pillar: "CYBERSECURITY" },
  { match: /^\s*data\s+backup\s*$/i, pillar: "DATA BACKUP" },
  { match: /^\s*system\s+maintenance\s*$/i, pillar: "SYSTEM MAINTENANCE" },
  { match: /^\s*network\s+performance\s*$/i, pillar: "NETWORK PERFORMANCE" },
];

export function matchPillarFromSheetLabel(raw: string): ItTaskPillarTitle | null {
  const s = raw.trim().replace(/\s*\*+\s*$/u, "").trim();
  if (!s) return null;
  for (const { match, pillar } of PILLAR_LOOKUP) {
    if (match.test(s)) return pillar;
  }
  const squish = s.toUpperCase().replace(/\s+/g, " ");
  if ((IT_TASK_PILLAR_TITLES as readonly string[]).includes(squish)) {
    return squish as ItTaskPillarTitle;
  }
  return null;
}

/** Calendar month `YYYY-MM` → monthly period key for a KPI with given anchor day. */
export function monthlyPeriodKeyForYMonth(
  ym: string,
  recurrenceMonthDay: number | null | undefined,
  timeZone: string,
): string {
  const zone = normalizeTimeZone(timeZone);
  const parts = ym.trim().split("-");
  if (parts.length !== 2) throw new Error(`Invalid month key "${ym}" (expected YYYY-MM)`);
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error(`Invalid month key "${ym}"`);
  }
  const dom = typeof recurrenceMonthDay === "number" ? recurrenceMonthDay : 1;
  const mid = DateTime.fromObject({ year, month, day: 15 }, { zone }).toJSDate();
  return getMonthlyPeriodKey(mid, dom, zone);
}

/** Every local calendar day in `YYYY-MM` as `YYYY-MM-DD`. */
export function enumerateYmdDaysInMonth(ym: string, timeZone: string): string[] {
  const zone = normalizeTimeZone(timeZone);
  const parts = ym.trim().split("-");
  if (parts.length !== 2) throw new Error(`Invalid month key "${ym}"`);
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error(`Invalid month key "${ym}"`);
  }
  const start = DateTime.fromObject({ year, month, day: 1 }, { zone }).startOf("day");
  const dim = start.daysInMonth ?? 28;
  const out: string[] = [];
  for (let d = 1; d <= dim; d++) {
    const dt = DateTime.fromObject({ year, month, day: d }, { zone });
    const iso = dt.toISODate();
    if (iso) out.push(iso);
  }
  return out;
}

function periodKeysForImportedMonth(
  frequency: string,
  ym: string,
  recurrenceWeekday: number | null | undefined,
  recurrenceMonthDay: number | null | undefined,
  timeZone: string,
): string[] {
  const zone = normalizeTimeZone(timeZone);
  if (frequency === "MONTHLY") {
    return [monthlyPeriodKeyForYMonth(ym, recurrenceMonthDay, timeZone)];
  }
  const days = enumerateYmdDaysInMonth(ym, zone);
  if (frequency === "DAILY") {
    return days.map((ymd) => getDailyPeriodKey(DateTime.fromISO(ymd, { zone }).toJSDate(), zone));
  }
  if (frequency === "WEEKLY") {
    const wd = typeof recurrenceWeekday === "number" ? recurrenceWeekday : 1;
    const keys = new Set<string>();
    for (const ymd of days) {
      keys.add(getWeeklyPeriodKey(DateTime.fromISO(ymd, { zone }).toJSDate(), wd, zone));
    }
    return [...keys];
  }
  return [];
}

export type SheetImportPillarPercents = Partial<Record<ItTaskPillarTitle, Record<string, number>>>;

export type ApplyKpiSheetSnapshotResult = {
  applied: number;
  skipped: Array<{ reason: string; detail?: string }>;
};

/**
 * Writes `KpiMaintenancePeriodSnapshot` rows from headline percentages (0–100).
 * Each snapshot uses total=100 so Task metrics math matches the target percent.
 * Supports DAILY / WEEKLY / MONTHLY KPI rows: a monthly spreadsheet cell is expanded
 * to every period key in that month (each day, each distinct week start in the month,
 * or the monthly anchor key) so Task metrics averages match the sheet headline %.
 */
export async function applyPillarPercentSnapshots(args: {
  timeZone: string;
  pillarMonths: Record<string, Record<string, number> | undefined>;
  assignedAgentId?: string;
}): Promise<ApplyKpiSheetSnapshotResult> {
  const zone = normalizeTimeZone(args.timeZone);
  const skipped: ApplyKpiSheetSnapshotResult["skipped"] = [];
  let applied = 0;

  const whereAgent =
    typeof args.assignedAgentId === "string" && args.assignedAgentId.length > 0
      ? { assignedAgentId: args.assignedAgentId }
      : {};

  const normalizedPillars: SheetImportPillarPercents = {};
  for (const [rawLabel, byMonth] of Object.entries(args.pillarMonths)) {
    const pillar = matchPillarFromSheetLabel(rawLabel);
    if (!pillar) {
      skipped.push({ reason: "unknown pillar label", detail: rawLabel });
      continue;
    }
    if (!byMonth) continue;
    normalizedPillars[pillar] = { ...normalizedPillars[pillar], ...byMonth };
  }

  for (const [pillar, byMonth] of Object.entries(normalizedPillars)) {
    if (!byMonth || typeof byMonth !== "object") continue;

    const kpis = await prisma.kpiMaintenance.findMany({
      where: {
        isRecurring: true,
        title: pillar,
        frequency: { in: ["DAILY", "WEEKLY", "MONTHLY"] },
        ...whereAgent,
      },
      select: {
        id: true,
        title: true,
        frequency: true,
        recurrenceWeekday: true,
        recurrenceMonthDay: true,
      },
    });

    if (kpis.length === 0) {
      skipped.push({
        reason: "no KPI row for pillar",
        detail: `pillar=${pillar}`,
      });
      continue;
    }

    for (const [ym, rawPct] of Object.entries(byMonth)) {
      if (rawPct == null || Number.isNaN(rawPct)) {
        skipped.push({ reason: "missing percent", detail: `${pillar} ${ym}` });
        continue;
      }
      const percent = Math.round(Math.min(100, Math.max(0, Number(rawPct))));
      const total = 100;
      const done = percent;
      const missing = total - done;
      const fullyComplete = missing === 0;

      for (const kpi of kpis) {
        const freq = kpi.frequency as string;
        const periodKeys = periodKeysForImportedMonth(
          freq,
          ym,
          kpi.recurrenceWeekday,
          kpi.recurrenceMonthDay,
          zone,
        );
        if (periodKeys.length === 0) {
          skipped.push({ reason: "unsupported KPI frequency", detail: `${pillar} ${kpi.id} ${freq}` });
          continue;
        }
        for (const periodKey of periodKeys) {
          await prisma.kpiMaintenancePeriodSnapshot.upsert({
            where: {
              kpiMaintenanceId_periodKey: {
                kpiMaintenanceId: kpi.id,
                periodKey,
              },
            },
            create: {
              kpiMaintenanceId: kpi.id,
              periodKey,
              frequency: kpi.frequency,
              timeZone: zone,
              total,
              done,
              missing,
              percent,
              fullyComplete,
            },
            update: {
              total,
              done,
              missing,
              percent,
              fullyComplete,
              frequency: kpi.frequency,
              timeZone: zone,
              capturedAt: new Date(),
            },
          });
          applied += 1;
        }
      }
    }
  }

  return { applied, skipped };
}
