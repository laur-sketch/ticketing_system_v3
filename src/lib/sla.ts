import type { SlaPolicy, Ticket, TicketPriority } from "@prisma/client";
import { prisma } from "./prisma";

export async function getSlaPolicy(
  priority: TicketPriority,
): Promise<SlaPolicy> {
  const policy = await prisma.slaPolicy.findUnique({ where: { priority } });
  if (!policy) {
    throw new Error(`Missing SLA policy for priority ${priority}`);
  }
  return policy;
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export type SlaState = "ON_TRACK" | "AT_RISK" | "BREACHED";

export function getTicketSlaState(ticket: Ticket): SlaState {
  const now = Date.now();
  const unresolved =
    ticket.status !== "FOR_CONFIRMATION" &&
    ticket.status !== "RESOLVED" &&
    ticket.status !== "CLOSED";
  if (!unresolved) return "ON_TRACK";

  const resolutionDue = new Date(ticket.resolutionDueAt).getTime();
  if (now > resolutionDue) return "BREACHED";

  const remainingMs = resolutionDue - now;
  const riskWindowMs = 2 * 60 * 60 * 1000;
  return remainingMs <= riskWindowMs ? "AT_RISK" : "ON_TRACK";
}

export async function runSlaEscalationSweep() {
  const now = new Date();
  const [scanned, breached] = await Promise.all([
    prisma.ticket.count({
      where: { status: { notIn: ["FOR_CONFIRMATION", "RESOLVED", "CLOSED"] } },
    }),
    prisma.ticket.findMany({
      where: {
        status: { notIn: ["FOR_CONFIRMATION", "RESOLVED", "CLOSED"] },
        resolutionDueAt: { lt: now },
        NOT: {
          status: "ESCALATED",
          escalationType: "HIERARCHICAL",
        },
      },
      select: { id: true },
    }),
  ]);

  if (breached.length === 0) {
    return { scanned, escalated: 0 };
  }

  const ids = breached.map((t) => t.id);
  await prisma.$transaction([
    prisma.ticket.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "ESCALATED",
        escalationType: "HIERARCHICAL",
        escalatedAt: now,
      },
    }),
    prisma.ticketActivity.createMany({
      data: ids.map((ticketId) => ({
        ticketId,
        actor: "SYSTEM",
        summary: "SLA breach escalation",
        detail: "Resolution due time passed. Escalated hierarchically by SLA sweep.",
      })),
    }),
  ]);

  return { scanned, escalated: ids.length };
}
