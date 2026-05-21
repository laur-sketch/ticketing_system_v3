import { DateTime } from "luxon";
import type { KpiFrequencyCode } from "@/lib/kpi-recurrence";

/** Local calendar YYYY-MM-DD (browser timezone). */
export function calendarYmd(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local calendar YYYY-MM (browser timezone). */
export function calendarYm(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function isYearMonthKey(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value.trim());
}

/** Expand `YYYY-MM` start/end to inclusive first/last calendar day (local). */
export function expandYearMonthRangeToYmd(fromYm: string, toYm: string): { from: string; to: string } {
  let from = fromYm.trim();
  let to = toYm.trim();
  if (!isYearMonthKey(from)) from = calendarYm();
  if (!isYearMonthKey(to)) to = from;
  if (from > to) {
    const swap = from;
    from = to;
    to = swap;
  }
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const fromYmd = `${fy}-${String(fm).padStart(2, "0")}-01`;
  const end = DateTime.fromObject({ year: ty, month: tm, day: 1 }).endOf("month");
  const toYmd = end.toISODate() ?? calendarYmd();
  return { from: fromYmd, to: toYmd };
}

export function defaultTaskMetricsDailyDate(): string {
  return calendarYmd();
}

export function defaultTaskMetricsWeeklyRange(): { from: string; to: string } {
  const to = calendarYmd();
  const d = new Date();
  const weekday = d.getDay();
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
  const start = new Date(d);
  start.setDate(d.getDate() - daysFromMonday);
  return { from: calendarYmd(start), to };
}

export function defaultTaskMetricsMonthlyRange(): { from: string; to: string } {
  const ym = calendarYm();
  return { from: ym, to: ym };
}

export function defaultTaskMetricsQuarterlyRange(): { from: string; to: string } {
  const now = new Date();
  const startMonth = Math.floor(now.getMonth() / 4) * 4;
  const start = new Date(now.getFullYear(), startMonth, 1);
  const end = new Date(now.getFullYear(), startMonth + 4, 0);
  return { from: calendarYmd(start), to: calendarYmd(end) };
}

export function defaultTaskMetricsRangeForCadence(
  cadence: KpiFrequencyCode,
): { dailyDate: string; from: string; to: string } {
  if (cadence === "DAILY") {
    const dailyDate = defaultTaskMetricsDailyDate();
    return { dailyDate, from: dailyDate, to: dailyDate };
  }
  if (cadence === "WEEKLY") {
    const { from, to } = defaultTaskMetricsWeeklyRange();
    return { dailyDate: defaultTaskMetricsDailyDate(), from, to };
  }
  if (cadence === "QUARTERLY") {
    const { from, to } = defaultTaskMetricsQuarterlyRange();
    return { dailyDate: defaultTaskMetricsDailyDate(), from, to };
  }
  const { from, to } = defaultTaskMetricsMonthlyRange();
  return { dailyDate: defaultTaskMetricsDailyDate(), from, to };
}

/** Query `from` / `to` for `/api/kpis/task-metrics` from cadence + UI state. */
export function resolveTaskMetricsQueryRange(
  cadence: KpiFrequencyCode,
  dailyDate: string,
  rangeFrom: string,
  rangeTo: string,
): { from: string; to: string } {
  if (cadence === "DAILY") {
    const day = dailyDate.trim() || defaultTaskMetricsDailyDate();
    return { from: day, to: day };
  }
  if (cadence === "MONTHLY") {
    const ym = isYearMonthKey(rangeFrom)
      ? rangeFrom.trim()
      : isYearMonthKey(rangeTo)
        ? rangeTo.trim()
        : calendarYm();
    return expandYearMonthRangeToYmd(ym, ym);
  }
  let from = rangeFrom.trim();
  let to = rangeTo.trim();
  if (!from) {
    from = cadence === "QUARTERLY" ? defaultTaskMetricsQuarterlyRange().from : defaultTaskMetricsWeeklyRange().from;
  }
  if (!to) to = calendarYmd();
  if (from > to) {
    const swap = from;
    from = to;
    to = swap;
  }
  return { from, to };
}

/** Human-readable label for the active task-metrics reporting window. */
export function formatTaskMetricsPeriodLabel(
  cadence: KpiFrequencyCode,
  opts: { dailyDate: string; rangeFrom: string; rangeTo: string },
): string {
  const { dailyDate, rangeFrom, rangeTo } = opts;
  if (cadence === "DAILY") {
    const dt = DateTime.fromISO(dailyDate.trim());
    return dt.isValid ? dt.toFormat("MMMM d, yyyy") : dailyDate;
  }
  if (cadence === "MONTHLY") {
    const ym = isYearMonthKey(rangeFrom) ? rangeFrom.trim() : rangeFrom;
    const dt = DateTime.fromISO(`${ym}-01`);
    return dt.isValid ? dt.toFormat("MMMM yyyy") : ym;
  }
  const from = DateTime.fromISO(rangeFrom.trim());
  const to = DateTime.fromISO(rangeTo.trim());
  if (from.isValid && to.isValid) {
    if (from.hasSame(to, "day")) return from.toFormat("MMMM d, yyyy");
    return `${from.toFormat("MMM d")} – ${to.toFormat("MMM d, yyyy")}`;
  }
  return rangeFrom === rangeTo ? rangeFrom : `${rangeFrom} – ${rangeTo}`;
}
