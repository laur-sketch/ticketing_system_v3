import { NextResponse } from "next/server";
import { requireSession } from "@/lib/access";
import {
  customerPendingTicketHref,
  listTicketsAwaitingCustomerConfirmation,
} from "@/lib/customer-pending-resolution";

/**
 * Tickets awaiting the signed-in requestor's confirmation (FOR_CONFIRMATION / RESOLVED).
 * Used by the post-login modal for Customer and Personnel accounts.
 */
export async function GET() {
  const session = await requireSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;
  if (role !== "Customer" && role !== "Personnel") {
    return NextResponse.json({ tickets: [] });
  }

  const email = (session.user.email ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ tickets: [] });
  }

  const rows = await listTicketsAwaitingCustomerConfirmation(email, session.user.authProvider);
  return NextResponse.json({
    tickets: rows.map((ticket) => ({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      status: ticket.status,
      updatedAt: ticket.updatedAt.toISOString(),
      verificationHref: customerPendingTicketHref(ticket),
    })),
  });
}
