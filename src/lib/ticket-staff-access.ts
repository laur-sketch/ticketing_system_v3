import { customerCanAccessTicket } from "@/lib/access";
import { portalCompanyAdminPrivilegesForEmail } from "@/lib/portal-staff";
import {
  currentFundTransferStepBoardAssigneeId,
  parseFundTransferApprovalMeta,
} from "@/lib/fund-transfer-approval";
import {
  currentItemRequisitionStepBoardAssigneeId,
  parseItemRequisitionApprovalMeta,
} from "@/lib/item-requisition-approval";
import { prisma } from "@/lib/prisma";
import {
  currentPaymentStepBoardAssigneeId,
  parsePaymentApprovalMeta,
} from "@/lib/request-for-payment-approval";
import { resolveStaffCompanyTeamId } from "@/lib/staff-company-scope";

type TicketAccessShape = {
  teamId: string | null;
  assignedAgentId: string | null;
  assignedAgent?: { email?: string | null; teamId?: string | null } | null;
  paymentApprovalMeta?: unknown;
  itemRequisitionApprovalMeta?: unknown;
  fundTransferApprovalMeta?: unknown;
  contactEmail?: string | null;
  requestorEmail?: string | null;
};

/** True when the session identity matches the ticket's board assignee. */
export function isTicketAssignee(args: {
  operatorId?: string | null;
  sessionEmail?: string | null;
  ticket: TicketAccessShape;
}): boolean {
  const { operatorId, sessionEmail, ticket } = args;
  if (operatorId && ticket.assignedAgentId === operatorId) return true;
  const agentEmail = ticket.assignedAgent?.email?.trim().toLowerCase() ?? "";
  const email = sessionEmail?.trim().toLowerCase() ?? "";
  return !!agentEmail && !!email && agentEmail === email;
}

/**
 * Async assignee check that also treats duplicate Agent rows sharing the
 * session email as the same person (HRIS remaps / legacy duplicates).
 */
export async function isSessionAssigneeOfTicket(args: {
  operatorId?: string | null;
  sessionEmail?: string | null;
  ticket: TicketAccessShape;
}): Promise<boolean> {
  if (isTicketAssignee(args)) return true;
  const email = (args.sessionEmail ?? "").trim();
  const assignedId = args.ticket.assignedAgentId;
  if (!email || !assignedId) return false;

  const [assigned, sessionAgents] = await Promise.all([
    prisma.agent.findUnique({
      where: { id: assignedId },
      select: { id: true, email: true },
    }),
    prisma.agent.findMany({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    }),
  ]);
  if (!assigned) return false;
  if (sessionAgents.some((a) => a.id === assignedId)) return true;
  const assignedEmail = assigned.email?.trim().toLowerCase() ?? "";
  return !!assignedEmail && assignedEmail === email.toLowerCase();
}

/** True when the signed-in user filed the ticket (My Requests / customer ownership). */
export function isTicketRequestor(
  ticket: Pick<TicketAccessShape, "contactEmail" | "requestorEmail">,
  sessionEmail?: string | null,
): boolean {
  if (!ticket.contactEmail && !ticket.requestorEmail) return false;
  return customerCanAccessTicket(
    {
      contactEmail: ticket.contactEmail ?? "",
      requestorEmail: ticket.requestorEmail,
    },
    sessionEmail,
  );
}

/** True when the actor is the current RFP / IRS / FTR procedural-step assignee. */
export function isCurrentProceduralStepAssignee(
  ticket: TicketAccessShape,
  operatorId: string | null | undefined,
): boolean {
  if (!operatorId) return false;

  const paymentMeta = parsePaymentApprovalMeta(ticket.paymentApprovalMeta);
  if (paymentMeta && currentPaymentStepBoardAssigneeId(paymentMeta) === operatorId) {
    return true;
  }

  const irsMeta = parseItemRequisitionApprovalMeta(ticket.itemRequisitionApprovalMeta);
  if (irsMeta && currentItemRequisitionStepBoardAssigneeId(irsMeta) === operatorId) {
    return true;
  }

  const ftrMeta = parseFundTransferApprovalMeta(ticket.fundTransferApprovalMeta);
  if (ftrMeta && currentFundTransferStepBoardAssigneeId(ftrMeta) === operatorId) {
    return true;
  }

  return false;
}

/** @deprecated Use {@link isCurrentProceduralStepAssignee}. */
export function isCurrentPaymentStepAssignee(
  ticket: TicketAccessShape,
  operatorId: string | null | undefined,
): boolean {
  return isCurrentProceduralStepAssignee(ticket, operatorId);
}

/**
 * Company-scoped Admin (JWT Admin) may only touch tickets routed to their
 * designated company. SuperAdmin is never blocked here.
 * Requestors may always access tickets they filed (even when sent to another company).
 */
export async function adminOutsideCompanyScope(args: {
  role: string | undefined;
  email?: string | null;
  ticketTeamId: string | null;
  ticket?: Pick<TicketAccessShape, "contactEmail" | "requestorEmail"> | null;
}): Promise<boolean> {
  if (args.role !== "Admin") return false;
  if (args.ticket && isTicketRequestor(args.ticket, args.email)) return false;
  const scoped = await resolveStaffCompanyTeamId(args.email);
  if (!scoped) return true;
  return args.ticketTeamId !== scoped;
}

/**
 * Personnel may read/mutate when they are the requestor, board assignee,
 * current RFP/IRS/FTR step assignee, or company coordinator for the ticket's company.
 * Peers on the same team are denied.
 */
export async function personnelForbiddenForTicket(args: {
  email?: string | null;
  operatorId?: string | null;
  ticket: TicketAccessShape;
}): Promise<boolean> {
  const { email, operatorId, ticket } = args;
  if (isTicketAssignee({ operatorId, sessionEmail: email, ticket })) return false;
  if (isTicketRequestor(ticket, email)) return false;
  if (isCurrentProceduralStepAssignee(ticket, operatorId)) return false;

  const companyCoordinator = await portalCompanyAdminPrivilegesForEmail(email);
  if (!companyCoordinator) return true;
  const coordinatorTeamId = await resolveStaffCompanyTeamId(email);
  if (!coordinatorTeamId) return true;
  return !(
    ticket.teamId === coordinatorTeamId ||
    ticket.assignedAgent?.teamId === coordinatorTeamId
  );
}
