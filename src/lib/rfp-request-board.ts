import { Prisma } from "@prisma/client/primary";
import { ACTIVE_REQUEST_STATUSES } from "@/lib/active-request-statuses";
import { prisma } from "@/lib/prisma";
import {
  currentFundTransferStepBoardAssigneeId,
  parseFundTransferApprovalMeta,
} from "@/lib/fund-transfer-approval";
import {
  currentItemRequisitionStepBoardAssigneeId,
  parseItemRequisitionApprovalMeta,
} from "@/lib/item-requisition-approval";
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
      paymentApprovalMeta: { not: Prisma.DbNull },
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

export async function loadIrsTicketIdsForCurrentStepAssignee(
  agentId: string,
): Promise<string[]> {
  if (!agentId) return [];
  const rows = await prisma.ticket.findMany({
    where: {
      requestType: "ITEM_REQUISITION_SLIP",
      itemRequisitionApprovalMeta: { not: Prisma.DbNull },
      status: { in: ACTIVE_REQUEST_STATUSES },
    },
    select: {
      id: true,
      assignedAgentId: true,
      itemRequisitionApprovalMeta: true,
    },
  });

  const ids: string[] = [];
  for (const row of rows) {
    if (row.assignedAgentId === agentId) continue;
    const meta = parseItemRequisitionApprovalMeta(row.itemRequisitionApprovalMeta);
    if (!meta) continue;
    if (currentItemRequisitionStepBoardAssigneeId(meta) === agentId) {
      ids.push(row.id);
    }
  }
  return ids;
}

export async function loadFtrTicketIdsForCurrentStepAssignee(
  agentId: string,
): Promise<string[]> {
  if (!agentId) return [];
  const rows = await prisma.ticket.findMany({
    where: {
      requestType: "FUND_TRANSFER_REQUEST",
      fundTransferApprovalMeta: { not: Prisma.DbNull },
      status: { in: ACTIVE_REQUEST_STATUSES },
    },
    select: {
      id: true,
      assignedAgentId: true,
      fundTransferApprovalMeta: true,
    },
  });

  const ids: string[] = [];
  for (const row of rows) {
    if (row.assignedAgentId === agentId) continue;
    const meta = parseFundTransferApprovalMeta(row.fundTransferApprovalMeta);
    if (!meta) continue;
    if (currentFundTransferStepBoardAssigneeId(meta) === agentId) {
      ids.push(row.id);
    }
  }
  return ids;
}

/**
 * Prisma where fragment: Personnel sees own assignments + procedural requests
 * awaiting their current role (RFP / IRS / FTR).
 */
export async function personnelRequestBoardWhere(
  agentId: string | null | undefined,
): Promise<Prisma.TicketWhereInput> {
  if (!agentId) {
    return { assignedAgentId: "__none__" };
  }
  const [rfpIds, irsIds, ftrIds] = await Promise.all([
    loadRfpTicketIdsForCurrentStepAssignee(agentId),
    loadIrsTicketIdsForCurrentStepAssignee(agentId),
    loadFtrTicketIdsForCurrentStepAssignee(agentId),
  ]);
  const extraIds = [...new Set([...rfpIds, ...irsIds, ...ftrIds])];
  if (extraIds.length === 0) {
    return { assignedAgentId: agentId };
  }
  return {
    OR: [{ assignedAgentId: agentId }, { id: { in: extraIds } }],
  };
}
