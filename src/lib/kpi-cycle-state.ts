import type { KpiFrequencyCode } from "@/lib/kpi-recurrence";
import { isItProjectImplementationPillar } from "@/lib/it-task-pillar-titles";
import { itProjectHasAnyDelay, itProjectMaxDelayMs } from "@/lib/it-project-subkpis";
import {
  collectChecklistProgressItems,
  getTaskTargetDueDate,
  resolveEffectiveSubKpiDueDate,
  type SubKpiItem,
} from "@/lib/kpi-subkpis";
import { subKpiRequirementsMet } from "@/lib/sub-kpi-completion-mode";
import {
  getPeriodEndExclusiveFromCycleStart,
  getRolloverEligibleAfterCompletion,
  normalizeTimeZone,
} from "@/lib/kpi-recurrence";
import { DateTime } from "luxon";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function parseSubKpiYmd(value: unknown, timeZone: string): DateTime | null {
  if (typeof value !== "string" || !YMD.test(value.trim())) return null;
  const dt = DateTime.fromISO(value.trim(), { zone: normalizeTimeZone(timeZone) }).startOf("day");
  return dt.isValid ? dt : null;
}

/** When incomplete non-recurring work becomes delayed: midnight on the day after target date. */
export function nonRecurringDelayStartExclusive(dueDateYmd: string, timeZone: string): Date | null {
  const zone = normalizeTimeZone(timeZone);
  const due = DateTime.fromISO(dueDateYmd.trim(), { zone }).startOf("day");
  if (!due.isValid) return null;
  return due.plus({ days: 1 }).startOf("day").toJSDate();
}

export function isNonRecurringSubKpiDelayed(
  item: SubKpiItem,
  nowMs: number,
  timeZone: string,
  parentDueYmd?: string | null,
): boolean {
  const effective = resolveEffectiveSubKpiDueDate(item, parentDueYmd).dueDate;
  const due = parseSubKpiYmd(effective, timeZone);
  if (!due) return false;
  const delayStart = nonRecurringDelayStartExclusive(due.toISODate()!, timeZone);
  if (!delayStart) return false;
  const delayStartMs = delayStart.getTime();
  const actual = parseSubKpiYmd(item.actualDate, timeZone);
  const complete = subKpiRequirementsMet(item);
  if (actual) {
    return actual.toMillis() >= delayStartMs;
  }
  if (complete) return false;
  return nowMs >= delayStartMs;
}

export function nonRecurringTaskHasDelay(
  subKpis: unknown,
  nowMs: number,
  timeZone: string,
): boolean {
  const parentDue = getTaskTargetDueDate(subKpis);
  return collectChecklistProgressItems(subKpis).some((item) =>
    isNonRecurringSubKpiDelayed(item, nowMs, timeZone, parentDue),
  );
}

export function nonRecurringTaskMaxDelayMs(
  subKpis: unknown,
  nowMs: number,
  timeZone: string,
): number {
  const zone = normalizeTimeZone(timeZone);
  const parentDue = getTaskTargetDueDate(subKpis);
  let maxDelay = 0;
  for (const item of collectChecklistProgressItems(subKpis)) {
    const effective = resolveEffectiveSubKpiDueDate(item, parentDue).dueDate;
    const due = parseSubKpiYmd(effective, zone);
    if (!due) continue;
    const delayStart = nonRecurringDelayStartExclusive(due.toISODate()!, zone);
    if (!delayStart) continue;
    const delayStartMs = delayStart.getTime();
    const actual = parseSubKpiYmd(item.actualDate, zone);
    if (actual) {
      if (actual.toMillis() >= delayStartMs) {
        maxDelay = Math.max(maxDelay, actual.toMillis() - delayStartMs);
      }
    } else if (!subKpiRequirementsMet(item) && nowMs >= delayStartMs) {
      maxDelay = Math.max(maxDelay, nowMs - delayStartMs);
    }
  }
  return maxDelay;
}

/** Earliest delay boundary among incomplete sub-tasks (for board cycle copy). */
export function nonRecurringTaskDelayDeadline(subKpis: unknown, timeZone: string): Date | null {
  const parentDue = getTaskTargetDueDate(subKpis);
  let earliestMs: number | null = null;
  for (const item of collectChecklistProgressItems(subKpis)) {
    if (subKpiRequirementsMet(item)) continue;
    const effective = resolveEffectiveSubKpiDueDate(item, parentDue).dueDate;
    const due = parseSubKpiYmd(effective, timeZone);
    if (!due) continue;
    const delayStart = nonRecurringDelayStartExclusive(due.toISODate()!, timeZone);
    if (!delayStart) continue;
    const ms = delayStart.getTime();
    if (earliestMs == null || ms < earliestMs) earliestMs = ms;
  }
  return earliestMs != null ? new Date(earliestMs) : null;
}

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
  if (record.isRecurring === false) {
    return nonRecurringTaskMaxDelayMs(record.subKpis, nowMs, timeZone);
  }
  const deadline = recurringDeadlineExclusive(record, timeZone);
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

/** Board column: IT Project and non-recurring tasks land in Delayed from target/actual dates. */
export function taskKanbanDerivedStatus(
  record: KpiMaintenanceLike & { subKpis?: unknown },
  args: { total: number; done: number; nowMs: number; timeZone: string },
): "CURRENT" | "DONE" | "DELAYED" {
  const { total, done, nowMs, timeZone } = args;
  if (total === 0) return "CURRENT";
  if (isItProjectImplementationPillar(String(record.title ?? ""))) {
    if (itProjectHasAnyDelay(record.subKpis, nowMs, timeZone)) return "DELAYED";
    return done === total ? "DONE" : "CURRENT";
  }
  if (record.isRecurring === false && nonRecurringTaskHasDelay(record.subKpis, nowMs, timeZone)) {
    return "DELAYED";
  }
  return done === total ? "DONE" : "CURRENT";
}

export function nextRolloverEligibleAtUtc(
  lastFullCompletionAt: Date | null,
  timeZone: string,
  /** When set (recurring W/M/Q), completion can roll over immediately. Omit for Daily / one-off archive delay. */
  frequency?: KpiFrequencyCode | null,
): Date | null {
  if (!lastFullCompletionAt || !Number.isFinite(lastFullCompletionAt.getTime())) return null;
  return getRolloverEligibleAfterCompletion(lastFullCompletionAt, timeZone, frequency);
}
