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
    assigned: number;
    efficiency: number;
    pillarsContributed: number;
  } | null;
};

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

function personnelTaskEfficiency(closed: number, assigned: number): number {
  if (assigned <= 0) return closed > 0 ? 100 : 0;
  return Math.min(100, Math.round((closed / assigned) * 100));
}

export function normalizePersonnelTaskTotals(
  assigned: number,
  closed: number,
): { assigned: number; closed: number; efficiency: number } {
  const safeAssigned = Math.max(0, assigned);
  const safeClosed = Math.min(Math.max(0, closed), safeAssigned);
  return {
    assigned: safeAssigned,
    closed: safeClosed,
    efficiency: personnelTaskEfficiency(safeClosed, safeAssigned),
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
    current.tickets = {
      closed: ticket.closed,
      pending: ticket.pending,
      efficiency: Math.round(ticket.efficiency),
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
    current.tasks = {
      ...normalizePersonnelTaskTotals(task.total, task.done),
      pillarsContributed: task.pillarsContributed,
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
      const remaining = Math.max(0, total - done);
      const roles = [...row.roles].sort();
      const role =
        roles.includes("Assignee") && roles.includes("Sub-assignee") ? "Assignee" : roles.join(" / ");
      const normalized = normalizePersonnelTaskTotals(total, done);
      return {
        id: row.id,
        name: row.name,
        role,
        total: normalized.assigned,
        done: normalized.closed,
        remaining,
        percent: normalized.efficiency,
        pillarsContributed: row.pillars.size,
      };
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.percent - a.percent || b.done - a.done || a.name.localeCompare(b.name));
}
