/**
 * Request for Payment personnel KPIs — separate helpdesk-style metrics for
 * Received By (Accounting) and Received By (Finance).
 */

import { prisma } from "@/lib/prisma";
import {
  parsePaymentApprovalMeta,
  type PaymentApprovalMeta,
} from "@/lib/request-for-payment-approval";

export type RfpRolePersonnelMetric = {
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

async function metricsFromCounts(counts: RoleCounts): Promise<RfpRolePersonnelMetric[]> {
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

/**
 * Build Accounting and Finance personnel KPIs from RFP `payment_approval_meta`.
 * Closed = step completed on a Mon–Sat day in range; pending = currently awaiting that step.
 */
export async function loadRfpRolePersonnelMetrics(
  scoped: Record<string, unknown>,
  workingDayIntervals: WorkingDayInterval[],
): Promise<{
  accounting: RfpRolePersonnelMetric[];
  finance: RfpRolePersonnelMetric[];
}> {
  const scopedAgentIds = resolveScopedAgentIds(scoped);
  if (scopedAgentIds && scopedAgentIds.size === 0) {
    return { accounting: [], finance: [] };
  }

  // Load all RFPs with approval meta; apply company/personnel scope in memory so
  // accounting/finance role assignees are credited even when they are not the board assignee.
  const tickets = await prisma.ticket.findMany({
    where: {
      requestType: "REQUEST_FOR_PAYMENT",
      paymentApprovalMeta: { not: null },
    },
    select: {
      id: true,
      assignedAgentId: true,
      paymentApprovalMeta: true,
    },
  });

  const accountingCounts: RoleCounts = new Map();
  const financeCounts: RoleCounts = new Map();

  for (const row of tickets) {
    const meta = parsePaymentApprovalMeta(row.paymentApprovalMeta) as PaymentApprovalMeta | null;
    if (!meta) continue;

    const accountingClosedAt = meta.completed.RECEIVED_BY_ACCOUNTING;
    if (timestampInWorkingDays(accountingClosedAt, workingDayIntervals)) {
      const creditId = meta.accountingAgentId ?? row.assignedAgentId;
      if (agentInScope(creditId, scopedAgentIds)) bump(accountingCounts, creditId, "closed");
    }

    const financeClosedAt = meta.completed.RECEIVED_BY_FINANCE;
    if (timestampInWorkingDays(financeClosedAt, workingDayIntervals)) {
      const creditId = meta.financeAgentId ?? row.assignedAgentId;
      if (agentInScope(creditId, scopedAgentIds)) bump(financeCounts, creditId, "closed");
    }

    if (meta.proceduralStep === "RECEIVED_BY_ACCOUNTING") {
      const pendingId = meta.accountingAgentId ?? row.assignedAgentId;
      if (agentInScope(pendingId, scopedAgentIds)) bump(accountingCounts, pendingId, "pending");
    }

    if (meta.proceduralStep === "RECEIVED_BY_FINANCE") {
      const pendingId = meta.financeAgentId ?? row.assignedAgentId;
      if (agentInScope(pendingId, scopedAgentIds)) bump(financeCounts, pendingId, "pending");
    }
  }

  const [accounting, finance] = await Promise.all([
    metricsFromCounts(accountingCounts),
    metricsFromCounts(financeCounts),
  ]);
  return { accounting, finance };
}
