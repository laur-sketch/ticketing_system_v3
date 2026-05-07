import type { Session } from "next-auth";
import { customerCanAccessTicket } from "@/lib/access";
import { findSessionAgentId } from "@/lib/session-agent";

/** Same visibility as GET /api/tickets/[id]: customer owns ticket; Personnel must be assignee; Admin/SuperAdmin see all. */
export async function canAccessTicketScreenshot(
  session: Session | null,
  ticket: {
    contactEmail: string;
    requestorEmail: string | null;
    assignedAgentId: string | null;
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
  if (role === "SuperAdmin" || role === "Admin") return true;
  return false;
}
