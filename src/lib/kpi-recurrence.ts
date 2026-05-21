/**
 * Calendar recurrence for KPI maintenance in a specific IANA timezone
 * (typically the browser's `Intl.DateTimeFormat().resolvedOptions().timeZone`).
 */

import { DateTime } from "luxon";

export type KpiFrequencyCode = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY";

/** @returns true for keys from the pre-timezone format, e.g. `D:2026-04-29`. */
export function isLegacyPeriodKey(key: string | null | undefined): boolean {
  if (!key) return false;
  return /^(D|W|M|Q):\d{4}-\d{2}-\d{2}$/.test(key);
}

export function normalizeTimeZone(tz: string | null | undefined): string {
  const raw = (tz ?? "").trim();
  if (!raw) return "UTC";
  const probe = DateTime.now().setZone(raw);
  return probe.isValid ? raw : "UTC";
}

function atZone(now: Date, timeZone: string): DateTime {
  return DateTime.fromMillis(now.getTime(), { zone: timeZone });
}

/** Luxon weekday 7 = Sunday — excluded from daily KPI task metrics and snapshots. */
export function isKpiMetricsWorkingDay(dt: DateTime): boolean {
  return dt.weekday !== 7;
}

export function isKpiMetricsWorkingYmd(ymd: string, timeZone: string): boolean {
  const zone = normalizeTimeZone(timeZone);
  const dt = DateTime.fromISO(ymd, { zone }).startOf("day");
  return dt.isValid && isKpiMetricsWorkingDay(dt);
}

/** Luxon weekday 1=Mon … 7=Sun; input is JS getDay() 0=Sun … 6=Sat. */
function jsWeekdayToLuxon(js: number): number {
  return js === 0 ? 7 : js;
}

export function getDailyPeriodKey(now: Date, timeZone: string): string {
  const dt = atZone(now, timeZone);
  return `D:${timeZone}:${dt.toISODate()}`;
}

export function getWeeklyPeriodStartDt(now: Date, anchorJsWeekday: number, timeZone: string): DateTime {
  const dt = atZone(now, timeZone).startOf("day");
  const anchorLuxon = jsWeekdayToLuxon(anchorJsWeekday);
  const w = dt.weekday;
  const diff = (w - anchorLuxon + 7) % 7;
  return dt.minus({ days: diff });
}

export function getWeeklyPeriodKey(now: Date, anchorJsWeekday: number, timeZone: string): string {
  const start = getWeeklyPeriodStartDt(now, anchorJsWeekday, timeZone);
  return `W:${timeZone}:${start.toISODate()}`;
}

export function getMonthlyPeriodStartDt(now: Date, anchorDay: number, timeZone: string): DateTime {
  const dt = atZone(now, timeZone);
  const y = dt.year;
  const mo = dt.month;
  const dim = DateTime.fromObject({ year: y, month: mo, day: 1 }, { zone: timeZone }).daysInMonth ?? 28;
  const dom = Math.min(Math.max(1, anchorDay), dim);
  const candidate = DateTime.fromObject({ year: y, month: mo, day: dom }, { zone: timeZone }).startOf("day");
  if (dt.startOf("day") < candidate) {
    const prev = dt.minus({ months: 1 });
    const py = prev.year;
    const pm = prev.month;
    const dimP = DateTime.fromObject({ year: py, month: pm, day: 1 }, { zone: timeZone }).daysInMonth ?? 28;
    const domP = Math.min(Math.max(1, anchorDay), dimP);
    return DateTime.fromObject({ year: py, month: pm, day: domP }, { zone: timeZone }).startOf("day");
  }
  return candidate;
}

export function getMonthlyPeriodKey(now: Date, anchorDay: number, timeZone: string): string {
  const start = getMonthlyPeriodStartDt(now, anchorDay, timeZone);
  return `M:${timeZone}:${start.toISODate()}`;
}

export function getQuarterlyPeriodStartDt(now: Date, anchorDay: number, timeZone: string): DateTime {
  const dt = atZone(now, timeZone);
  const quarterStartMonth = Math.floor((dt.month - 1) / 4) * 4 + 1;
  const startFor = (year: number, month: number) => {
    const dim = DateTime.fromObject({ year, month, day: 1 }, { zone: timeZone }).daysInMonth ?? 28;
    const dom = Math.min(Math.max(1, anchorDay), dim);
    return DateTime.fromObject({ year, month, day: dom }, { zone: timeZone }).startOf("day");
  };
  const candidate = startFor(dt.year, quarterStartMonth);
  if (dt.startOf("day") >= candidate) return candidate;
  const prev = candidate.minus({ months: 4 });
  return startFor(prev.year, prev.month);
}

export function getQuarterlyPeriodKey(now: Date, anchorDay: number, timeZone: string): string {
  const start = getQuarterlyPeriodStartDt(now, anchorDay, timeZone);
  return `Q:${timeZone}:${start.toISODate()}`;
}

export function computePeriodKey(
  frequency: KpiFrequencyCode,
  recurrenceWeekday: number | null | undefined,
  recurrenceMonthDay: number | null | undefined,
  now: Date,
  timeZone: string,
): string {
  const zone = normalizeTimeZone(timeZone);
  switch (frequency) {
    case "DAILY":
      return getDailyPeriodKey(now, zone);
    case "WEEKLY": {
      const wd = typeof recurrenceWeekday === "number" ? recurrenceWeekday : 1;
      return getWeeklyPeriodKey(now, wd, zone);
    }
    case "MONTHLY": {
      const dom = typeof recurrenceMonthDay === "number" ? recurrenceMonthDay : 1;
      return getMonthlyPeriodKey(now, dom, zone);
    }
    case "QUARTERLY": {
      const dom = typeof recurrenceMonthDay === "number" ? recurrenceMonthDay : 1;
      return getQuarterlyPeriodKey(now, dom, zone);
    }
    default:
      return getDailyPeriodKey(now, zone);
  }
}

export function getNextMonthlyPeriodStartDt(periodStart: DateTime, anchorDay: number): DateTime {
  const z = periodStart.zone;
  const n = periodStart.plus({ months: 1 });
  const dim = DateTime.fromObject({ year: n.year, month: n.month, day: 1 }, { zone: z }).daysInMonth ?? 28;
  const dom = Math.min(Math.max(1, anchorDay), dim);
  return DateTime.fromObject({ year: n.year, month: n.month, day: dom }, { zone: z }).startOf("day");
}

export function getNextQuarterlyPeriodStartDt(periodStart: DateTime, anchorDay: number): DateTime {
  const z = periodStart.zone;
  const n = periodStart.plus({ months: 4 });
  const dim = DateTime.fromObject({ year: n.year, month: n.month, day: 1 }, { zone: z }).daysInMonth ?? 28;
  const dom = Math.min(Math.max(1, anchorDay), dim);
  return DateTime.fromObject({ year: n.year, month: n.month, day: dom }, { zone: z }).startOf("day");
}

/** Instant when the current period ends (start of next period) as a JS Date (absolute instant). */
export function getPeriodEndExclusive(
  frequency: KpiFrequencyCode,
  recurrenceWeekday: number | null | undefined,
  recurrenceMonthDay: number | null | undefined,
  now: Date,
  timeZone: string,
): Date {
  const zone = normalizeTimeZone(timeZone);
  switch (frequency) {
    case "DAILY":
      return atZone(now, zone).startOf("day").plus({ days: 1 }).toJSDate();
    case "WEEKLY": {
      const wd = typeof recurrenceWeekday === "number" ? recurrenceWeekday : 1;
      return getWeeklyPeriodStartDt(now, wd, zone).plus({ weeks: 1 }).toJSDate();
    }
    case "MONTHLY": {
      const dom = typeof recurrenceMonthDay === "number" ? recurrenceMonthDay : 1;
      const start = getMonthlyPeriodStartDt(now, dom, zone);
      return getNextMonthlyPeriodStartDt(start, dom).toJSDate();
    }
    case "QUARTERLY": {
      const dom = typeof recurrenceMonthDay === "number" ? recurrenceMonthDay : 1;
      const start = getQuarterlyPeriodStartDt(now, dom, zone);
      return getNextQuarterlyPeriodStartDt(start, dom).toJSDate();
    }
    default:
      return atZone(now, zone).startOf("day").plus({ days: 1 }).toJSDate();
  }
}

/**
 * End instant (exclusive) of one recurrence cycle anchored at cycleStartUtc
 * (`cycleStartUtc` is interpreted in `timeZone` for day/week/month boundaries).
 */
export function getPeriodEndExclusiveFromCycleStart(
  cycleStartUtc: Date,
  frequency: KpiFrequencyCode,
  recurrenceWeekday: number | null | undefined,
  recurrenceMonthDay: number | null | undefined,
  timeZone: string,
): Date {
  const zone = normalizeTimeZone(timeZone);
  const start = DateTime.fromMillis(cycleStartUtc.getTime(), { zone }).startOf("day");
  switch (frequency) {
    case "DAILY":
      return start.plus({ days: 1 }).toJSDate();
    case "WEEKLY":
      void recurrenceWeekday;
      return start.plus({ weeks: 1 }).toJSDate();
    case "MONTHLY": {
      const dom = typeof recurrenceMonthDay === "number" ? recurrenceMonthDay : 1;
      return getNextMonthlyPeriodStartDt(start, dom).toJSDate();
    }
    case "QUARTERLY": {
      const dom = typeof recurrenceMonthDay === "number" ? recurrenceMonthDay : 1;
      return getNextQuarterlyPeriodStartDt(start, dom).toJSDate();
    }
    default:
      return start.plus({ days: 1 }).toJSDate();
  }
}

/** First instant eligible for rollover: start of calendar day following completion (in `timeZone`). */
export function getRolloverEligibleAfterCompletion(completedAtUtc: Date, timeZone: string): Date {
  const zone = normalizeTimeZone(timeZone);
  return DateTime.fromMillis(completedAtUtc.getTime(), { zone }).startOf("day").plus({ days: 1 }).toJSDate();
}
