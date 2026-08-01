import { portalCompanyAdminPrivilegesForEmail } from "@/lib/portal-staff";
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

/** True when the actor is the current RFP procedural-step assignee. */
export function isCurrentPaymentStepAssignee(
  ticket: TicketAccessShape,
  operatorId: string | null | undefined,
): boolean {
  if (!operatorId) return false;
  const meta = parsePaymentApprovalMeta(ticket.paymentApprovalMeta);
  if (!meta) return false;
  return currentPaymentStepBoardAssigneeId(meta) === operatorId;
}

/**
 * Company-scoped Admin (JWT Admin) may only touch tickets routed to their
 * designated company. SuperAdmin is never blocked here.
 */
export async function adminOutsideCompanyScope(args: {
  role: string | undefined;
  email?: string | null;
  ticketTeamId: string | null;
}): Promise<boolean> {
  if (args.role !== "Admin") return false;
  const scoped = await resolveStaffCompanyTeamId(args.email);
  if (!scoped) return true;
  return args.ticketTeamId !== scoped;
}

/**
 * Personnel may read/mutate when assignee, current RFP-step assignee, or
 * company coordinator for the ticket's company. Peers on the same team are denied.
 */
export async function personnelForbiddenForTicket(args: {
  email?: string | null;
  operatorId?: string | null;
  ticket: TicketAccessShape;
}): Promise<boolean> {
  const { email, operatorId, ticket } = args;
  if (isTicketAssignee({ operatorId, sessionEmail: email, ticket })) return false;
  if (isCurrentPaymentStepAssignee(ticket, operatorId)) return false;

  const companyCoordinator = await portalCompanyAdminPrivilegesForEmail(email);
  if (!companyCoordinator) return true;
  const coordinatorTeamId = await resolveStaffCompanyTeamId(email);
  if (!coordinatorTeamId) return true;
  return !(
    ticket.teamId === coordinatorTeamId ||
    ticket.assignedAgent?.teamId === coordinatorTeamId
  );
}
