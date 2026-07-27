import { Prisma } from "@prisma/client/primary";
import { ACTIVE_REQUEST_STATUSES } from "@/lib/active-request-statuses";
import { prisma } from "@/lib/prisma";
import {
  currentPaymentStepBoardAssigneeId,
  parsePaymentApprovalMeta,
} from "@/lib/request-for-payment-approval";

/**
 * RFP ticket ids whose current procedural role assignee is `agentId`
 * (even when `tickets.assignedAgentId` has not been synced yet).
 */
export async function loadRfpTicketIdsForCurrentStepAssignee(
  agentId: string,
): Promise<string[]> {
  if (!agentId) return [];
  const rows = await prisma.ticket.findMany({
    where: {
      requestType: "REQUEST_FOR_PAYMENT",
      paymentApprovalMeta: { not: null },
      status: { in: ACTIVE_REQUEST_STATUSES },
    },
    select: {
      id: true,
      assignedAgentId: true,
      paymentApprovalMeta: true,
    },
  });

  const ids: string[] = [];
  for (const row of rows) {
    if (row.assignedAgentId === agentId) continue; // already covered by assignedAgentId filter
    const meta = parsePaymentApprovalMeta(row.paymentApprovalMeta);
    if (!meta) continue;
    if (currentPaymentStepBoardAssigneeId(meta) === agentId) {
      ids.push(row.id);
    }
  }
  return ids;
}

/** Prisma where fragment: Personnel sees own assignments + RFPs awaiting their current role. */
export async function personnelRequestBoardWhere(
  agentId: string | null | undefined,
): Promise<Prisma.TicketWhereInput> {
  if (!agentId) {
    return { assignedAgentId: "__none__" };
  }
  const rfpIds = await loadRfpTicketIdsForCurrentStepAssignee(agentId);
  if (rfpIds.length === 0) {
    return { assignedAgentId: agentId };
  }
  return {
    OR: [{ assignedAgentId: agentId }, { id: { in: rfpIds } }],
  };
}
