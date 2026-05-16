import type { KpiFrequencyCode } from "@/lib/kpi-recurrence";
import { isItProjectImplementationPillar } from "@/lib/it-task-pillar-titles";
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

export function incompletePastDeadlineDelayMs(record: KpiMaintenanceLike, nowMs: number, timeZone: string): number {
  const deadline =
    record.isRecurring === false
      ? nonRecurringDeadline(record)
      : recurringDeadlineExclusive(record, timeZone);
  if (!deadline) return 0;
  const end = deadline.getTime();
  if (!Number.isFinite(end) || nowMs < end) return 0;
  return Math.max(0, nowMs - end);
}

export function recurringDoneDelayedMs(record: KpiMaintenanceLike, timeZone: string, doneAtMs: number): number {
  const deadline =
    record.isRecurring === false
      ? nonRecurringDeadline(record)
      : recurringDeadlineExclusive(record, timeZone);
  if (!deadline) return 0;
  const end = deadline.getTime();
  if (!Number.isFinite(end) || doneAtMs <= end) return 0;
  return Math.max(0, doneAtMs - end);
}

/** Board column for task kanban: Done when checklist complete; Delayed only when overdue and incomplete (IT Project Implementation only). */
export function taskKanbanDerivedStatus(
  record: KpiMaintenanceLike,
  args: { total: number; done: number; nowMs: number; timeZone: string },
): "CURRENT" | "DONE" | "DELAYED" {
  const { total, done, nowMs, timeZone } = args;
  if (total > 0 && done === total) return "DONE";
  if (total === 0) return "CURRENT";
  if (!isItProjectImplementationPillar(String(record.title ?? ""))) return "CURRENT";
  return incompletePastDeadlineDelayMs(record, nowMs, timeZone) > 0 ? "DELAYED" : "CURRENT";
}

export function nextRolloverEligibleAtUtc(lastFullCompletionAt: Date | null, timeZone: string): Date | null {
  if (!lastFullCompletionAt || !Number.isFinite(lastFullCompletionAt.getTime())) return null;
  return getRolloverEligibleAfterCompletion(lastFullCompletionAt, timeZone);
}
