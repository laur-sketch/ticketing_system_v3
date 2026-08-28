/** Post-approval Job Order execution team — client-safe helpers (no DB). */

import {
  isJobOrderWorkerAgent,
  parseJobOrderWorkerAgentIds,
  type JobOrderApprovalMeta,
} from "@/lib/job-order-approval";

export function isJobOrderExecutionMember(opts: {
  agentId: string | null | undefined;
  meta: JobOrderApprovalMeta | null | undefined;
  ticketAssignedAgentId: string | null | undefined;
  linkedProjectAssigneeId?: string | null;
}): boolean {
  const id = opts.agentId?.trim();
  if (!id) return false;
  const assignee =
    opts.ticketAssignedAgentId?.trim() || opts.linkedProjectAssigneeId?.trim() || null;
  if (assignee === id) return true;
  return isJobOrderWorkerAgent(id, opts.meta);
}

/** All agent ids that should receive KPI credit (assignee + listed co-workers). */
export function jobOrderKpiCreditAgentIds(opts: {
  meta: JobOrderApprovalMeta | null | undefined;
  ticketAssignedAgentId: string | null | undefined;
  linkedProjectAssigneeId?: string | null;
}): string[] {
  const ids = new Set<string>();
  const assignee =
    opts.ticketAssignedAgentId?.trim() || opts.linkedProjectAssigneeId?.trim() || null;
  if (assignee) ids.add(assignee);
  for (const id of parseJobOrderWorkerAgentIds(opts.meta)) ids.add(id);
  return [...ids];
}
