import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { findSessionAgentId } from "@/lib/session-agent";
import { runForConfirmationReminderSweep } from "@/lib/confirmation-reminders";

export const dynamic = "force-dynamic";

function parseLastSeenMs(raw: string | null): Date | null {
  const ms = Number(raw ?? "0");
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(req: Request) {
  const { session, unauthorized } = await requireRole(["Admin", "Personnel"]);
  if (unauthorized) return unauthorized;

  void runForConfirmationReminderSweep().catch((error) => {
    console.error("Confirmation reminder sweep failed", error);
  });

  const { searchParams } = new URL(req.url);
  const lastSeenAt = parseLastSeenMs(searchParams.get("lastSeenMs"));
  const operator =
    session.user.role === "Personnel"
      ? await findSessionAgentId({ email: session.user.email, name: session.user.name })
      : null;

  const [ticketCount, accountRequestCount] = await Promise.all([
    prisma.ticket.count({
      where: {
        status: "OPEN",
        ...(lastSeenAt ? { createdAt: { gt: lastSeenAt } } : {}),
        ...(session.user.role === "Personnel" ? { assignedAgentId: operator?.id ?? "__none__" } : {}),
      },
    }),
    session.user.role === "Admin" || session.user.role === "SuperAdmin"
      ? prisma.accountActionRequest.count({
          where: {
            status: "PENDING",
            ...(lastSeenAt ? { createdAt: { gt: lastSeenAt } } : {}),
          },
        })
      : 0,
  ]);

  return NextResponse.json(
    {
      ticketCount,
      accountRequestCount,
      total: ticketCount + accountRequestCount,
    },
    {
      headers: { "cache-control": "private, no-store" },
    },
  );
}
