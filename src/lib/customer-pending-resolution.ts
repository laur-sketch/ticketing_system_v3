import type { Prisma, TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveTicketContactFields } from "@/lib/ticket-intake-contact";

/**
 * Requestor cannot open another ticket while any ticket tied to them (contact or requestor email)
 * is in one of these states. They may submit again once the ticket is **CLOSED** (or never opened
 * a conflicting one). Unassigned `OPEN` tickets are allowed, but assigned `OPEN` tickets block intake.
 */
export const CUSTOMER_INTAKE_LOCK_STATUSES: TicketStatus[] = [
  "IN_PROGRESS",
  "PENDING_INFO",
  "ESCALATED",
  "FOR_CONFIRMATION",
  "RESOLVED",
];

export function isAwaitingCustomerConfirmation(status: TicketStatus) {
  return status === "FOR_CONFIRMATION" || status === "RESOLVED";
}

/** Deep link for a blocking ticket (verification flow vs. general ticket view). */
export function customerPendingTicketHref(row: { id: string; status: TicketStatus }) {
  return isAwaitingCustomerConfirmation(row.status)
    ? `/tickets/${row.id}/verification`
    : `/tickets/${row.id}`;
}

/** Tickets visible to a customer (portal contact or notification inbox). */
export function customerTicketWhereBySessionEmail(email: string): Prisma.TicketWhereInput {
  const e = email.trim().toLowerCase();
  if (!e) return { id: "__none__" };
  return {
    OR: [
      { contactEmail: { equals: e, mode: "insensitive" as const } },
      { requestorEmail: { equals: e, mode: "insensitive" as const } },
    ],
  };
}

/** OR-clause: ticket belongs to any of these emails as contact or requestor. */
export function requestorIdentityWhereForEmails(emails: Iterable<string>): Prisma.TicketWhereInput {
  const normalized = [
    ...new Set(
      [...emails]
        .map((e) => (e ?? "").trim().toLowerCase())
        .filter((e) => e.length > 0),
    ),
  ];
  if (normalized.length === 0) return { id: "__none__" };
  return {
    OR: normalized.flatMap((e) => [
      { contactEmail: { equals: e, mode: "insensitive" as const } },
      { requestorEmail: { equals: e, mode: "insensitive" as const } },
    ]),
  };
}

const intakeBlockingWhere = (emails: Iterable<string>): Prisma.TicketWhereInput => ({
  ...requestorIdentityWhereForEmails(emails),
  OR: [
    { status: { in: [...CUSTOMER_INTAKE_LOCK_STATUSES] } },
    {
      status: { not: "CLOSED" },
      assignedAgentId: { not: null },
    },
  ],
});

/**
 * Any ticket for this identity set that blocks a new submission (in progress or awaiting
 * customer confirmation / closure).
 */
export async function requestorHasIntakeBlockingTicket(identityEmails: Iterable<string>) {
  const normalized = [
    ...new Set(
      [...identityEmails]
        .map((e) => (e ?? "").trim().toLowerCase())
        .filter((e) => e.length > 0),
    ),
  ];
  if (normalized.length === 0) return null;
  return prisma.ticket.findFirst({
    where: intakeBlockingWhere(normalized),
    orderBy: { updatedAt: "desc" },
    select: { id: true, ticketNumber: true, updatedAt: true, status: true },
  });
}

/**
 * Same email set POST /api/tickets uses for intake lock (portal contact + notification inbox).
 * Must stay in sync with {@link resolveTicketContactFields} for customers.
 */
export async function resolveCustomerIntakeIdentityEmails(
  accountEmail: string,
  authProvider: string | null | undefined,
): Promise<string[]> {
  const e = accountEmail.trim().toLowerCase();
  if (!e) return [];
  try {
    const r = await resolveTicketContactFields({
      sessionEmail: e,
      authProvider,
      bodyRequestorEmail: undefined,
    });
    return [
      ...new Set(
        [r.contactEmail, r.requestorEmail]
          .map((x) => (x ?? "").trim().toLowerCase())
          .filter((x) => x.length > 0),
      ),
    ];
  } catch {
    return [e];
  }
}

export async function listIntakeBlockingTicketsForEmails(emails: Iterable<string>) {
  const normalized = [
    ...new Set(
      [...emails]
        .map((x) => (x ?? "").trim().toLowerCase())
        .filter((x) => x.length > 0),
    ),
  ];
  if (normalized.length === 0) return [];
  return prisma.ticket.findMany({
    where: intakeBlockingWhere(normalized),
    orderBy: { updatedAt: "desc" },
    select: { id: true, ticketNumber: true, updatedAt: true, status: true },
  });
}

/** @see {@link requestorHasIntakeBlockingTicket} — portal session identity (Customer or Personnel as requestor). */
export async function customerHasPendingResolvedTicket(
  accountEmail: string,
  authProvider?: string | null,
) {
  const emails = await resolveCustomerIntakeIdentityEmails(accountEmail, authProvider ?? null);
  return requestorHasIntakeBlockingTicket(emails);
}

export async function listCustomerPendingResolvedTickets(
  accountEmail: string,
  authProvider?: string | null,
) {
  const emails = await resolveCustomerIntakeIdentityEmails(accountEmail, authProvider ?? null);
  return listIntakeBlockingTicketsForEmails(emails);
}

/** Tickets where the requestor must confirm or reject the resolution. */
export async function listTicketsAwaitingCustomerConfirmation(
  accountEmail: string,
  authProvider?: string | null,
) {
  const emails = await resolveCustomerIntakeIdentityEmails(accountEmail, authProvider ?? null);
  const normalized = [
    ...new Set(
      [...emails]
        .map((x) => (x ?? "").trim().toLowerCase())
        .filter((x) => x.length > 0),
    ),
  ];
  if (normalized.length === 0) return [];
  return prisma.ticket.findMany({
    where: {
      ...requestorIdentityWhereForEmails(normalized),
      status: { in: ["FOR_CONFIRMATION", "RESOLVED"] },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      status: true,
      updatedAt: true,
    },
  });
}
