import { DateTime } from "luxon";
import type { KpiFrequencyCode } from "@/lib/kpi-recurrence";
import { normalizeTimeZone } from "@/lib/kpi-recurrence";
import { isItProjectImplementationPillar } from "@/lib/it-task-pillar-titles";
import {
  itProjectChecklistItems,
  isItProjectEnvelope,
} from "@/lib/it-project-subkpis";
import {
  isNonRecurringSubKpiDelayed,
  nonRecurringDelayStartExclusive,
} from "@/lib/kpi-cycle-state";
import { kpiMainTaskLabel } from "@/lib/kpi-main-task";
import {
  collectAllSubKpiItems,
  collectChecklistProgressItems,
  normalizeSubKpis,
  subKpiProgressOwner,
  taskDailyPenaltyAmountFromSubKpis,
  type SubKpiItem,
} from "@/lib/kpi-subkpis";
import { subKpiRequirementsMet } from "@/lib/sub-kpi-completion-mode";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export type SubKpiPenaltyContext = {
  nowMs: number;
  timeZone: string;
  frequency: KpiFrequencyCode;
  isRecurring: boolean;
  title: string;
  taskDailyPenaltyAmount?: number | null;
};

function parseSubKpiYmd(value: unknown, timeZone: string): DateTime | null {
  if (typeof value !== "string" || !YMD.test(value.trim())) return null;
  const dt = DateTime.fromISO(value.trim(), { zone: normalizeTimeZone(timeZone) }).startOf("day");
  return dt.isValid ? dt : null;
}

/** Inclusive calendar days from delay start day through end day. */
export function penaltyAccrualDays(delayStartMs: number, endMs: number, timeZone: string): number {
  const zone = normalizeTimeZone(timeZone);
  const startDay = DateTime.fromMillis(delayStartMs, { zone }).startOf("day");
  const endDay = DateTime.fromMillis(endMs, { zone }).startOf("day");
  if (!startDay.isValid || !endDay.isValid || endDay < startDay) return 0;
  return Math.floor(endDay.diff(startDay, "days").days) + 1;
}

export function subKpiPenaltyDelayStartMs(
  item: SubKpiItem,
  ctx: SubKpiPenaltyContext,
): number | null {
  if (ctx.isRecurring !== false) return null;
  if (isItProjectImplementationPillar(ctx.title)) return null;
  const zone = normalizeTimeZone(ctx.timeZone);
  const dueYmd = item.dueDate?.trim();
  if (!dueYmd) return null;
  return nonRecurringDelayStartExclusive(dueYmd, zone)?.getTime() ?? null;
}

export function isSubKpiInDelayPenaltyScope(item: SubKpiItem, ctx: SubKpiPenaltyContext): boolean {
  if (ctx.isRecurring !== false) return false;
  const zone = normalizeTimeZone(ctx.timeZone);
  return isNonRecurringSubKpiDelayed(item, ctx.nowMs, zone);
}

export function subKpiPenaltyDays(item: SubKpiItem, ctx: SubKpiPenaltyContext): number {
  const zone = normalizeTimeZone(ctx.timeZone);
  const delayStartMs = subKpiPenaltyDelayStartMs(item, ctx);
  if (delayStartMs == null) return 0;

  const actual = parseSubKpiYmd(item.actualDate, zone);
  const complete = subKpiRequirementsMet(item);

  if (actual) {
    const actualMs = actual.toMillis();
    if (actualMs < delayStartMs) return 0;
    return penaltyAccrualDays(delayStartMs, actualMs, zone);
  }

  if (complete && !isSubKpiInDelayPenaltyScope(item, ctx)) return 0;
  if (!isSubKpiInDelayPenaltyScope(item, ctx)) return 0;

  return penaltyAccrualDays(delayStartMs, ctx.nowMs, zone);
}

export function resolveSubKpiDailyPenaltyAmount(
  item: SubKpiItem,
  ctx: Pick<SubKpiPenaltyContext, "taskDailyPenaltyAmount">,
): number {
  const itemAmount = item.dailyPenaltyAmount;
  if (typeof itemAmount === "number" && Number.isFinite(itemAmount) && itemAmount > 0) {
    return itemAmount;
  }
  const taskAmount = ctx.taskDailyPenaltyAmount;
  if (typeof taskAmount === "number" && Number.isFinite(taskAmount) && taskAmount > 0) {
    return taskAmount;
  }
  return 0;
}

export function subKpiAccruedPenalty(item: SubKpiItem, ctx: SubKpiPenaltyContext): number {
  if (ctx.isRecurring !== false) return 0;
  if (isItProjectImplementationPillar(ctx.title)) return 0;
  const rate = resolveSubKpiDailyPenaltyAmount(item, ctx);
  if (rate <= 0) return 0;
  const days = subKpiPenaltyDays(item, ctx);
  if (days <= 0) return 0;
  return Math.round(rate * days * 100) / 100;
}

export type KpiPenaltySource = {
  subKpis: unknown;
  frequency: KpiFrequencyCode;
  isRecurring: boolean;
  title: string;
  mainTask?: string | null;
  assignedAgent?: { id: string; name: string } | null;
};

export function penaltyDeductionsForKpi(
  kpi: KpiPenaltySource,
  ctx: { nowMs: number; timeZone: string },
): Map<string, { id: string; name: string; deduction: number }> {
  if (kpi.isRecurring !== false) return new Map();
  if (isItProjectImplementationPillar(kpi.title)) return new Map();
  const taskDailyPenaltyAmount = taskDailyPenaltyAmountFromSubKpis(kpi.subKpis);
  const penaltyCtx: SubKpiPenaltyContext = {
    nowMs: ctx.nowMs,
    timeZone: ctx.timeZone,
    frequency: kpi.frequency,
    isRecurring: kpi.isRecurring,
    title: kpi.title,
    taskDailyPenaltyAmount,
  };

  const items = isItProjectEnvelope(kpi.subKpis)
    ? itProjectChecklistItems(kpi.subKpis)
    : collectChecklistProgressItems(kpi.subKpis, kpiMainTaskLabel(kpi));

  const byPerson = new Map<string, { id: string; name: string; deduction: number }>();
  for (const item of items) {
    if (!item.title.trim()) continue;
    const deduction = subKpiAccruedPenalty(item, penaltyCtx);
    if (deduction <= 0) continue;
    const owner = subKpiProgressOwner(item, kpi.assignedAgent ?? null);
    if (owner.id === "__unassigned__") continue;
    const key = owner.id !== "__unassigned__" ? owner.id : owner.name.trim().toLowerCase();
    const current = byPerson.get(key) ?? { id: owner.id, name: owner.name, deduction: 0 };
    current.deduction += deduction;
    byPerson.set(key, current);
  }
  return byPerson;
}

export function mergePenaltyDeductionMaps(
  maps: Iterable<Map<string, { id: string; name: string; deduction: number }>>,
): Map<string, { id: string; name: string; deduction: number }> {
  const merged = new Map<string, { id: string; name: string; deduction: number }>();
  for (const map of maps) {
    for (const [key, row] of map) {
      const current = merged.get(key) ?? { id: row.id, name: row.name, deduction: 0 };
      current.deduction += row.deduction;
      if (row.id !== "__unassigned__") current.id = row.id;
      merged.set(key, current);
    }
  }
  return merged;
}
