import type { KpiFrequencyCode } from "@/lib/kpi-recurrence";

/** Local calendar YYYY-MM-DD (browser timezone). */
export function calendarYmd(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  const d = new Date();
  const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  return { from, to: calendarYmd(d) };
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
  let from = rangeFrom.trim();
  let to = rangeTo.trim();
  if (!from) from = defaultTaskMetricsWeeklyRange().from;
  if (!to) to = calendarYmd();
  if (from > to) {
    const swap = from;
    from = to;
    to = swap;
  }
  return { from, to };
}
