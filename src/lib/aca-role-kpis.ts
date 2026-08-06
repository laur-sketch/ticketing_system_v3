/**
 * ACA personnel KPIs — credit Submitted By.
 * Mirrors IRS/FTR role attribution (pending while open; closed on confirmation).
 */

import { Prisma } from "@prisma/client/primary";
import { ACTIVE_REQUEST_STATUSES } from "@/lib/active-request-statuses";
import { parseAcaApprovalMeta } from "@/lib/aca-approval";
import { prisma } from "@/lib/prisma";

export type AcaSubmittedPersonnelMetric = {
  id: string;
  name: string;
  closed: number;
  pending: number;
  efficiency: number;
};

type WorkingDayInterval = { start: Date; end: Date };

function roleEfficiencyPercent(closed: number, pending: number): number {
  const total = closed + pending;
  if (total <= 0) return 0;
  return Number(Math.min(100, (closed / total) * 100).toFixed(1));
}

function timestampInWorkingDays(iso: string | undefined, intervals: WorkingDayInterval[]): boolean {
  if (!iso || intervals.length === 0) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return intervals.some((i) => t >= i.start.getTime() && t <= i.end.getTime());
}

function agentInScope(
  agentId: string | null | undefined,
  scopedAgentIds: Set<string> | null,
): agentId is string {
  if (!agentId) return false;
  if (!scopedAgentIds) return true;
  return scopedAgentIds.has(agentId);
}

function resolveScopedAgentIds(scoped: Record<string, unknown>): Set<string> | null {
  const raw = (scoped as { assignedAgentId?: unknown }).assignedAgentId;
  if (raw == null) return null;
  if (typeof raw === "string") return new Set([raw]);
  if (typeof raw === "object" && raw !== null && "in" in raw) {
    const ids = (raw as { in: unknown }).in;
    if (Array.isArray(ids)) {
      return new Set(ids.filter((id): id is string => typeof id === "string" && Boolean(id)));
    }
  }
  return null;
}

type RoleCounts = Map<string, { closed: number; pending: number }>;

function bump(map: RoleCounts, agentId: string, field: "closed" | "pending") {
  const cur = map.get(agentId) ?? { closed: 0, pending: 0 };
  cur[field] += 1;
  map.set(agentId, cur);
}

async function metricsFromCounts(counts: RoleCounts): Promise<AcaSubmittedPersonnelMetric[]> {
  const agentIds = [...counts.keys()];
  if (agentIds.length === 0) return [];
  const agents = await prisma.agent.findMany({
    where: { id: { in: agentIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(agents.map((a) => [a.id, a.name]));
  return agentIds
    .map((id) => {
      const { closed, pending } = counts.get(id) ?? { closed: 0, pending: 0 };
      return {
        id,
        name: nameById.get(id)?.trim() || "Unknown",
        closed,
        pending,
        efficiency: roleEfficiencyPercent(closed, pending),
      };
    })
    .filter((row) => row.closed > 0 || row.pending > 0)
    .sort((a, b) => b.efficiency - a.efficiency || b.closed - a.closed || a.name.localeCompare(b.name));
}

function submittedByAgentId(meta: NonNullable<ReturnType<typeof parseAcaApprovalMeta>>): string | null {
  const level = meta.levels.find((l) => l.key === "SUBMITTED_BY");
  return level?.agentId?.trim() || null;
}

/**
 * ACA Submitted By KPIs from `aca_approval_meta`.
 * Closed = request confirmed (`closedAt`) on a Mon–Sat day in range (submit stamped at intake).
 * Pending = ACA still active (open pipeline / awaiting confirmation) for that submitter.
 */
export async function loadAcaSubmittedPersonnelMetrics(
  scoped: Record<string, unknown>,
  workingDayIntervals: WorkingDayInterval[],
): Promise<AcaSubmittedPersonnelMetric[]> {
  const scopedAgentIds = resolveScopedAgentIds(scoped);
  if (scopedAgentIds && scopedAgentIds.size === 0) return [];

  const tickets = await prisma.ticket.findMany({
    where: {
      requestType: "AUTHORITY_TO_CONDUCT_ACTIVITY",
      acaApprovalMeta: { not: Prisma.DbNull },
    },
    select: {
      id: true,
      status: true,
      closedAt: true,
      acaApprovalMeta: true,
    },
  });

  const counts: RoleCounts = new Map();
  const activeStatuses = new Set<string>(ACTIVE_REQUEST_STATUSES);

  for (const row of tickets) {
    const meta = parseAcaApprovalMeta(row.acaApprovalMeta);
    if (!meta) continue;
    const creditId = submittedByAgentId(meta);
    if (!agentInScope(creditId, scopedAgentIds)) continue;

    const confirmedInRange = timestampInWorkingDays(
      row.closedAt?.toISOString(),
      workingDayIntervals,
    );
    if (confirmedInRange) {
      bump(counts, creditId, "closed");
      continue;
    }

    // Still running / awaiting confirmation — credit as pending for the submitter.
    if (!row.closedAt && activeStatuses.has(row.status)) {
      bump(counts, creditId, "pending");
    }
  }

  return metricsFromCounts(counts);
}
