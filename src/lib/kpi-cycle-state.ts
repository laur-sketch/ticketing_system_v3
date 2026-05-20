import { DateTime } from "luxon";
import type { KpiFrequencyCode } from "@/lib/kpi-recurrence";
import { isItProjectImplementationPillar } from "@/lib/it-task-pillar-titles";
import { itProjectHasAnyDelay, itProjectMaxDelayMs } from "@/lib/it-project-subkpis";
import {
  getPeriodEndExclusiveFromCycleStart,
  getRolloverEligibleAfterCompletion,
  normalizeTimeZone,
} from "@/lib/kpi-recurrence";

export type KpiMaintenanceLike = {
  isRecurring?: boolean | null;
  frequency: KpiFrequencyCode;
  recurrenceWeekday?: number | null;
  recurrenceMonthDay?: number | null;
  nonRecurringStartAt?: unknown;
  nonRecurringEndAt?: unknown;
  periodCycleStartAt?: unknown;
  /** Pillar title — overdue → Delayed applies only to IT Project Implementation. */
  title?: string | null;
};

export function toJsDateMaybe(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
  const d = new Date(typeof v === "string" ? v : String(v));
  return Number.isFinite(d.getTime()) ? d : null;
}

/** Active recurring cycle deadline — after this instant, incomplete work is overdue / Delayed column. */
export function recurringDeadlineExclusive(record: KpiMaintenanceLike, timeZone: string): Date | null {
  const start = toJsDateMaybe(record.periodCycleStartAt);
  if (!start) return null;
  return getPeriodEndExclusiveFromCycleStart(
    start,
    record.frequency,
    record.recurrenceWeekday,
    record.recurrenceMonthDay,
    normalizeTimeZone(timeZone),
  );
}

export function nonRecurringDeadline(record: Pick<KpiMaintenanceLike, "nonRecurringEndAt">): Date | null {
  return toJsDateMaybe(record.nonRecurringEndAt);
}

function endOfYmdMs(ymd: string, timeZone: string): number | null {
  const dt = DateTime.fromISO(ymd, { zone: normalizeTimeZone(timeZone) }).endOf("day");
  if (!dt.isValid) return null;
  return dt.toMillis();
}

/** Max overdue ms for IT Project (incomplete past due or actual date after due). */
export function itProjectIncompleteOverdueMs(
  subKpis: unknown,
  nowMs: number,
  timeZone: string,
): number {
  return itProjectMaxDelayMs(subKpis, nowMs, timeZone);
}

export function incompletePastDeadlineDelayMs(
  record: KpiMaintenanceLike & { subKpis?: unknown },
  nowMs: number,
  timeZone: string,
): number {
  if (isItProjectImplementationPillar(String(record.title ?? ""))) {
    return itProjectIncompleteOverdueMs(record.subKpis, nowMs, timeZone);
  }
  const deadline =
    record.isRecurring === false
      ? nonRecurringDeadline(record)
      : recurringDeadlineExclusive(record, timeZone);
  if (!deadline) return 0;
  const end = deadline.getTime();
  if (!Number.isFinite(end) || nowMs < end) return 0;
  return Math.max(0, nowMs - end);
}

export function recurringDoneDelayedMs(
  record: KpiMaintenanceLike & { subKpis?: unknown },
  timeZone: string,
  doneAtMs: number,
): number {
  if (isItProjectImplementationPillar(String(record.title ?? ""))) {
    return itProjectMaxDelayMs(record.subKpis, doneAtMs, timeZone);
  }
  const deadline =
    record.isRecurring === false
      ? nonRecurringDeadline(record)
      : recurringDeadlineExclusive(record, timeZone);
  if (!deadline) return 0;
  const end = deadline.getTime();
  if (!Number.isFinite(end) || doneAtMs <= end) return 0;
  return Math.max(0, doneAtMs - end);
}

/** Board column: IT Project → Delayed when any sub-task is late; Done only when all complete and on time. */
export function taskKanbanDerivedStatus(
  record: KpiMaintenanceLike & { subKpis?: unknown },
  args: { total: number; done: number; nowMs: number; timeZone: string },
): "CURRENT" | "DONE" | "DELAYED" {
  const { total, done, nowMs, timeZone } = args;
  if (total === 0) return "CURRENT";
  if (!isItProjectImplementationPillar(String(record.title ?? ""))) {
    return done === total ? "DONE" : "CURRENT";
  }
  if (itProjectHasAnyDelay(record.subKpis, nowMs, timeZone)) return "DELAYED";
  return done === total ? "DONE" : "CURRENT";
}

export function nextRolloverEligibleAtUtc(lastFullCompletionAt: Date | null, timeZone: string): Date | null {
  if (!lastFullCompletionAt || !Number.isFinite(lastFullCompletionAt.getTime())) return null;
  return getRolloverEligibleAfterCompletion(lastFullCompletionAt, timeZone);
}
