import { NextResponse } from "next/server";
import { requireSession } from "@/lib/access";
import {
  customerHasPendingResolvedTicket,
  customerPendingTicketHref,
} from "@/lib/customer-pending-resolution";

/**
 * Whether the signed-in user may open another request as **requestor** (same rules as POST /api/tickets).
 * Used by Customer and Personnel intake UIs; Admin/SuperAdmin are always allowed here (they file for others).
 */
export async function GET() {
  const session = await requireSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;
  if (role !== "Customer" && role !== "Personnel") {
    return NextResponse.json({
      canCreateTickets: true,
      authProvider: session.user.authProvider ?? null,
      pendingConfirmation: null,
    });
  }

  const email = (session.user.email ?? "").trim().toLowerCase();
  const pending = email
    ? await customerHasPendingResolvedTicket(email, session.user.authProvider)
    : null;

  return NextResponse.json({
    canCreateTickets: !pending,
    authProvider: session.user.authProvider ?? null,
    pendingConfirmation: pending
      ? {
          ticketId: pending.id,
          ticketNumber: pending.ticketNumber,
          verificationHref: customerPendingTicketHref(pending),
        }
      : null,
  });
}
