import type { PersonnelTicketMetric, TaskChecklistPillarMetrics } from "@/lib/kpis";

export type PersonnelAccumulatedTaskMetric = {
  id: string;
  name: string;
  role: string;
  total: number;
  done: number;
  remaining: number;
  percent: number;
  pillarsContributed: number;
  penaltyDeduction?: number;
};

export type PersonnelCombinedMetricCard = {
  id: string;
  name: string;
  role: string;
  tickets: {
    closed: number;
    pending: number;
    efficiency: number;
  } | null;
  tasks: {
    closed: number;
    pending: number;
    efficiency: number;
    pillarsContributed: number;
    penaltyDeduction?: number;
    /** Raw task efficiency before delay penalty points are applied. */
    efficiencyBeforePenalty?: number;
  } | null;
};

export const PERSONNEL_AVERAGE_EFFICIENCY_FLOOR = 50;

export function applyPenaltyToTaskEfficiency(efficiency: number, penaltyDeduction: number): number {
  if (penaltyDeduction <= 0) return efficiency;
  const adjusted = efficiency - Math.min(efficiency, penaltyDeduction);
  return Math.max(PERSONNEL_AVERAGE_EFFICIENCY_FLOOR, Math.round(adjusted));
}

export function applyPersonnelAverageEfficiencyFloor(efficiency: number): number {
  return Math.max(PERSONNEL_AVERAGE_EFFICIENCY_FLOOR, Math.round(efficiency));
}

export function combinedPersonnelEfficiency(row: PersonnelCombinedMetricCard): number | null {
  const values = [row.tickets?.efficiency, row.tasks?.efficiency].filter(
    (value): value is number => value != null,
  );
  if (values.length === 0) return null;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return applyPersonnelAverageEfficiencyFloor(average);
}

export type PersonnelEfficiencyBracketLabel =
  | "Outstanding"
  | "Good"
  | "Satisfactory"
  | "Needs Improvement";

export type PersonnelEfficiencyBracket = {
  label: PersonnelEfficiencyBracketLabel;
  badgeClassName: string;
  valueClassName: string;
};

/** Color-coded bracket for combined ticket/task average efficiency. */
export function personnelEfficiencyBracket(efficiency: number): PersonnelEfficiencyBracket {
  const value = Math.round(efficiency);
  if (value >= 95) {
    return {
      label: "Outstanding",
      badgeClassName:
        "border-emerald-500/45 bg-emerald-500/12 text-emerald-900 dark:border-emerald-400/40 dark:bg-emerald-500/10 dark:text-emerald-200",
      valueClassName: "text-emerald-800 dark:text-emerald-200",
    };
  }
  if (value >= 88) {
    return {
      label: "Good",
      badgeClassName:
        "border-teal-500/45 bg-teal-500/12 text-teal-900 dark:border-teal-400/40 dark:bg-teal-500/10 dark:text-teal-200",
      valueClassName: "text-teal-800 dark:text-teal-200",
    };
  }
  if (value >= 75) {
    return {
      label: "Satisfactory",
      badgeClassName:
        "border-amber-500/45 bg-amber-500/12 text-amber-950 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-200",
      valueClassName: "text-amber-900 dark:text-amber-200",
    };
  }
  return {
    label: "Needs Improvement",
    badgeClassName:
      "border-rose-500/45 bg-rose-500/12 text-rose-900 dark:border-rose-400/40 dark:bg-rose-500/10 dark:text-rose-200",
    valueClassName: "text-rose-800 dark:text-rose-200",
  };
}

/** @deprecated Use PersonnelCombinedMetricCard */
export type PersonnelTaskMetricCard = {
  kind: "task";
  id: string;
  name: string;
  role: string;
  closed: number;
  remaining: number;
  efficiency: number;
  pillarsContributed: number;
};

/** @deprecated Use PersonnelCombinedMetricCard */
export type PersonnelTicketMetricCard = {
  kind: "ticket";
  id: string;
  name: string;
  role: string;
  closed: number;
  pending: number;
  efficiency: number;
};

/** @deprecated Use PersonnelCombinedMetricCard */
export type PersonnelMetricCardRow = PersonnelTaskMetricCard | PersonnelTicketMetricCard;

/**
 * Done ÷ total, matching the company-view pillar math (and the per-pillar
 * contributor rows), so the personnel cards agree with the company donuts.
 */
function personnelTaskEfficiency(done: number, pending: number): number {
  const total = done + pending;
  if (total <= 0) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}

export function normalizePersonnelTaskTotals(
  assigned: number,
  closed: number,
): { pending: number; closed: number; efficiency: number } {
  const total = Math.max(0, assigned);
  const done = Math.min(Math.max(0, closed), total);
  const pending = Math.max(0, total - done);
  return {
    pending,
    closed: done,
    efficiency: personnelTaskEfficiency(done, pending),
  };
}

function normalizePersonName(name: string): string {
  return name.trim().toLowerCase();
}

function mergeRoles(existing: string, incoming: string): string {
  const roles = new Set(
    `${existing} / ${incoming}`
      .split(" / ")
      .map((part) => part.trim())
      .filter(Boolean),
  );
  const sorted = [...roles].sort();
  if (sorted.includes("Assignee") && sorted.includes("Sub-assignee")) return "Assignee";
  return sorted.join(" / ") || "Assignee";
}

export type PersonnelDelayPenaltyRow = {
  id: string;
  name: string;
  deduction: number;
};

export function applyDelayPenaltiesToPersonnelTasks(
  tasks: PersonnelAccumulatedTaskMetric[],
  penalties: PersonnelDelayPenaltyRow[],
): PersonnelAccumulatedTaskMetric[] {
  if (penalties.length === 0) return tasks;
  const byId = new Map(penalties.map((row) => [row.id, row.deduction]));
  const byName = new Map(penalties.map((row) => [row.name.trim().toLowerCase(), row.deduction]));
  return tasks.map((task) => {
    const deduction = byId.get(task.id) ?? byName.get(task.name.trim().toLowerCase()) ?? 0;
    if (deduction <= 0) return task;
    return {
      ...task,
      penaltyDeduction: Math.round(deduction * 100) / 100,
      percent: applyPenaltyToTaskEfficiency(task.percent, deduction),
    };
  });
}

export function mergePersonnelMetricCards(
  tasks: PersonnelAccumulatedTaskMetric[],
  tickets: PersonnelTicketMetric[],
): PersonnelCombinedMetricCard[] {
  const byName = new Map<string, PersonnelCombinedMetricCard>();

  for (const ticket of tickets) {
    const key = normalizePersonName(ticket.name);
    if (!key) continue;
    const current = byName.get(key) ?? {
      id: ticket.id,
      name: ticket.name.trim(),
      role: "Assignee",
      tickets: null,
      tasks: null,
    };
    // The same person can own several agent rows (legacy emails, duplicate
    // accounts) — accumulate their counts instead of overwriting the card.
    const closed = (current.tickets?.closed ?? 0) + ticket.closed;
    const pending = (current.tickets?.pending ?? 0) + ticket.pending;
    const total = closed + pending;
    current.tickets = {
      closed,
      pending,
      efficiency: total > 0 ? Math.round((closed / total) * 100) : Math.round(ticket.efficiency),
    };
    if (ticket.id) current.id = ticket.id;
    byName.set(key, current);
  }

  for (const task of tasks) {
    const key = normalizePersonName(task.name);
    if (!key) continue;
    const current = byName.get(key) ?? {
      id: task.id,
      name: task.name.trim(),
      role: task.role,
      tickets: null,
      tasks: null,
    };
    const normalized = normalizePersonnelTaskTotals(task.total, task.done);
    // Accumulate duplicate person rows; the delay penalty is name-keyed, so
    // the same deduction would repeat — take the max instead of summing it.
    const closed = (current.tasks?.closed ?? 0) + normalized.closed;
    const pending = (current.tasks?.pending ?? 0) + normalized.pending;
    const penaltyDeduction = Math.max(
      task.penaltyDeduction ?? 0,
      current.tasks?.penaltyDeduction ?? 0,
    );
    const efficiencyBeforePenalty = normalizePersonnelTaskTotals(
      closed + pending,
      closed,
    ).efficiency;
    const efficiency =
      penaltyDeduction > 0
        ? applyPenaltyToTaskEfficiency(efficiencyBeforePenalty, penaltyDeduction)
        : efficiencyBeforePenalty;
    current.tasks = {
      pending,
      closed,
      efficiency,
      pillarsContributed: Math.max(
        task.pillarsContributed,
        current.tasks?.pillarsContributed ?? 0,
      ),
      ...(penaltyDeduction > 0
        ? { penaltyDeduction, efficiencyBeforePenalty }
        : {}),
    };
    current.role = mergeRoles(current.role, task.role);
    if (task.id && task.id !== "__unassigned__") current.id = task.id;
    byName.set(key, current);
  }

  return [...byName.values()]
    .filter((row) => row.tickets != null || row.tasks != null)
    .sort((a, b) => {
      const aEff = Math.max(a.tickets?.efficiency ?? 0, a.tasks?.efficiency ?? 0);
      const bEff = Math.max(b.tickets?.efficiency ?? 0, b.tasks?.efficiency ?? 0);
      const aClosed = (a.tickets?.closed ?? 0) + (a.tasks?.closed ?? 0);
      const bClosed = (b.tickets?.closed ?? 0) + (b.tasks?.closed ?? 0);
      return bEff - aEff || bClosed - aClosed || a.name.localeCompare(b.name);
    });
}

/** Roll up contributor rows across checklist pillars into per-personnel accumulated task metrics. */
export function aggregatePersonnelTaskMetrics(
  checklistPillars: TaskChecklistPillarMetrics | null,
): PersonnelAccumulatedTaskMetric[] {
  const byKey = new Map<
    string,
    {
      id: string;
      name: string;
      roles: Set<string>;
      total: number;
      done: number;
      pillars: Set<string>;
    }
  >();

  for (const [pillar, metric] of Object.entries(checklistPillars ?? {})) {
    const contributorRows = metric?.assigneeProgressAccumulated ?? metric?.assigneeProgress ?? [];
    for (const row of contributorRows) {
      if (!row.name.trim() || row.id === "__unassigned__") continue;
      const key = row.id && row.id !== "__unassigned__" ? row.id : row.name.trim().toLowerCase();
      const current = byKey.get(key) ?? {
        id: row.id,
        name: row.name,
        roles: new Set<string>(),
        total: 0,
        done: 0,
        pillars: new Set<string>(),
      };
      current.roles.add(row.role);
      current.total += row.total;
      current.done += row.done;
      if (row.total > 0) current.pillars.add(pillar);
      byKey.set(key, current);
    }
  }

  return [...byKey.values()]
    .map((row) => {
      const total = row.total;
      const done = Math.min(row.done, total);
      const roles = [...row.roles].sort();
      const role =
        roles.includes("Assignee") && roles.includes("Sub-assignee") ? "Assignee" : roles.join(" / ");
      const normalized = normalizePersonnelTaskTotals(total, done);
      return {
        id: row.id,
        name: row.name,
        role,
        total: normalized.pending + normalized.closed,
        done: normalized.closed,
        remaining: normalized.pending,
        percent: normalized.efficiency,
        pillarsContributed: row.pillars.size,
      };
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.percent - a.percent || b.done - a.done || a.name.localeCompare(b.name));
}
