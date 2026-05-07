import type { Prisma, TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Customer intake lock: block new submissions while they already have active work in progress. */
export const CUSTOMER_INTAKE_LOCK_STATUSES: TicketStatus[] = ["IN_PROGRESS"];

export function isAwaitingCustomerConfirmation(status: TicketStatus) {
  return status === "FOR_CONFIRMATION" || status === "RESOLVED";
}

/** Tickets visible to a customer (portal contact or notification inbox). */
export function customerTicketWhereBySessionEmail(email: string): Prisma.TicketWhereInput {
  const e = email.trim().toLowerCase();
  if (!e) return { id: "__none__" };
  return {
    OR: [
      { contactEmail: { equals: e, mode: "insensitive" } },
      { requestorEmail: { equals: e, mode: "insensitive" } },
    ],
  };
}

const pendingWhere = (email: string): Prisma.TicketWhereInput => ({
  status: { in: [...CUSTOMER_INTAKE_LOCK_STATUSES] },
  ...customerTicketWhereBySessionEmail(email),
});

/** Customer may open one request at a time: block while another ticket is already IN_PROGRESS. */
export async function customerHasPendingResolvedTicket(accountEmail: string) {
  const email = accountEmail.trim().toLowerCase();
  if (!email) return null;
  return prisma.ticket.findFirst({
    where: pendingWhere(email),
    orderBy: { updatedAt: "desc" },
    select: { id: true, ticketNumber: true, updatedAt: true },
  });
}

export async function listCustomerPendingResolvedTickets(accountEmail: string) {
  const email = accountEmail.trim().toLowerCase();
  if (!email) return [];
  return prisma.ticket.findMany({
    where: pendingWhere(email),
    orderBy: { updatedAt: "desc" },
    select: { id: true, ticketNumber: true, updatedAt: true },
  });
}
