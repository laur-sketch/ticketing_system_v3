import type { Session } from "next-auth";
import { customerCanAccessTicket } from "@/lib/access";
import { findSessionAgentId } from "@/lib/session-agent";
import { adminOutsideCompanyScope } from "@/lib/ticket-staff-access";

/** Aligns with GET /api/tickets/[id]: customer owns; Personnel assignee; Admin company-scoped; SuperAdmin all. */
export async function canAccessTicketScreenshot(
  session: Session | null,
  ticket: {
    contactEmail: string;
    requestorEmail: string | null;
    assignedAgentId: string | null;
    teamId: string | null;
  },
): Promise<boolean> {
  if (!session?.user) return false;
  const role = session.user.role;
  if (role === "Customer") {
    return customerCanAccessTicket(
      { contactEmail: ticket.contactEmail, requestorEmail: ticket.requestorEmail },
      session.user.email,
    );
  }
  if (role === "Personnel") {
    const operator = await findSessionAgentId({ email: session.user.email, name: session.user.name });
    return !!operator && operator.id === ticket.assignedAgentId;
  }
  if (role === "SuperAdmin") return true;
  if (role === "Admin") {
    return !(await adminOutsideCompanyScope({
      role,
      email: session.user.email,
      ticketTeamId: ticket.teamId,
    }));
  }
  return false;
}
