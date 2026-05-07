import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import type { UserRole } from "./auth";
import { authOptions } from "./auth";

export async function requireSession() {
  return getServerSession(authOptions);
}

export function hasRole(
  role: UserRole | undefined,
  allowed: UserRole[],
): boolean {
  if (!role) return false;
  if (role === "SuperAdmin" && allowed.includes("Admin")) return true;
  return allowed.includes(role);
}

export async function requireRole(allowed: UserRole[]) {
  const session = await requireSession();
  if (!session?.user) {
    return {
      session: null,
      unauthorized: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!hasRole(session.user.role, allowed)) {
    return {
      session,
      unauthorized: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { session, unauthorized: null };
}

export function ensureTicketOwnership(
  ticketEmail: string,
  sessionEmail: string | null | undefined,
) {
  return ticketEmail.toLowerCase() === (sessionEmail ?? "").toLowerCase();
}

/** Customer may access tickets where they are the portal contact or the notification requestor inbox. */
export function customerCanAccessTicket(
  ticket: { contactEmail: string; requestorEmail?: string | null },
  sessionEmail: string | null | undefined,
) {
  const s = (sessionEmail ?? "").trim().toLowerCase();
  if (!s) return false;
  if (ticket.contactEmail.trim().toLowerCase() === s) return true;
  const r = (ticket.requestorEmail ?? "").trim().toLowerCase();
  return r.length > 0 && r === s;
}
