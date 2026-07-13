/**
 * Populate tickets with random status & assigned agents within a date range.
 * Usage: npx tsx scripts/populate-tickets-date-range.ts
 *        npx tsx scripts/populate-tickets-date-range.ts --from=27/04/2026 --to=16/05/2026
 *        npx tsx scripts/populate-tickets-date-range.ts --count=50 --update-existing
 */
import {
  PrismaClient,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from "@prisma/client/primary";

const prisma = new PrismaClient();

function parseDateArg(value: string, endOfDay = false): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(endOfDay ? `${value}T23:59:59.999Z` : `${value}T00:00:00.000Z`);
  }
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    const [, day, month, year] = m;
    const iso = `${year}-${month}-${day}`;
    return new Date(endOfDay ? `${iso}T23:59:59.999Z` : `${iso}T00:00:00.000Z`);
  }
  throw new Error(`Invalid date "${value}" — use DD/MM/YYYY or YYYY-MM-DD`);
}

function parseArgs() {
  const countArg = process.argv.find((a) => a.startsWith("--count="));
  const fromArg = process.argv.find((a) => a.startsWith("--from="));
  const toArg = process.argv.find((a) => a.startsWith("--to="));
  const count = countArg ? Math.max(1, Number.parseInt(countArg.split("=")[1] ?? "40", 10)) : 40;
  const updateExisting = process.argv.includes("--update-existing");
  const rangeStart = parseDateArg(fromArg?.split("=")[1] ?? "27/04/2026", false);
  const rangeEnd = parseDateArg(toArg?.split("=")[1] ?? "16/05/2026", true);
  if (rangeEnd.getTime() < rangeStart.getTime()) {
    throw new Error("--to must be on or after --from");
  }
  return { count, updateExisting, rangeStart, rangeEnd };
}

const STATUSES: TicketStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "PENDING_INFO",
  "ESCALATED",
  "FOR_CONFIRMATION",
  "RESOLVED",
  "CLOSED",
];

const CATEGORIES: TicketCategory[] = ["IT", "HR", "FINANCE", "OPERATIONS", "GENERAL"];
const PRIORITIES: TicketPriority[] = ["UNSET", "LOW", "MEDIUM", "HIGH", "URGENT"];

const SAMPLE_TITLES = [
  "VPN connection drops intermittently",
  "Payroll access request for new hire",
  "Printer queue stuck on floor 3",
  "Expense report submission error",
  "Email alias not routing correctly",
  "Laptop replacement before travel",
  "Shared drive permission review",
  "Badge not working at main entrance",
  "Software license renewal follow-up",
  "Network latency on Wi‑Fi segment",
  "HR policy acknowledgment pending",
  "Invoice approval workflow blocked",
  "Teams meeting room display offline",
  "Password reset loop on portal",
  "Audit evidence upload timeout",
];

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDateBetween(start: Date, end: Date) {
  const t = start.getTime() + Math.random() * (end.getTime() - start.getTime());
  return new Date(t);
}

function pick<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)]!;
}

function slaHours(priority: TicketPriority) {
  switch (priority) {
    case "URGENT":
      return { fr: 1, res: 4 };
    case "HIGH":
      return { fr: 2, res: 24 };
    case "MEDIUM":
      return { fr: 8, res: 48 };
    default:
      return { fr: 24, res: 72 };
  }
}

function timestampsForStatus(status: TicketStatus, createdAt: Date, updatedAt: Date) {
  const hour = 60 * 60 * 1000;
  let firstResponseAt: Date | null = null;
  let resolvedAt: Date | null = null;
  let closedAt: Date | null = null;

  if (status !== "OPEN") {
    firstResponseAt = new Date(createdAt.getTime() + randomInt(15, 180) * 60 * 1000);
  }
  if (status === "RESOLVED" || status === "CLOSED" || status === "FOR_CONFIRMATION") {
    resolvedAt = new Date(Math.min(updatedAt.getTime(), createdAt.getTime() + randomInt(2, 72) * hour));
  }
  if (status === "CLOSED") {
    closedAt = updatedAt;
  }

  return { firstResponseAt, resolvedAt, closedAt };
}

async function initialTicketSeq(year: number) {
  const prefix = `TKT-${year}-`;
  const latest = await prisma.ticket.findFirst({
    where: { ticketNumber: { startsWith: prefix } },
    orderBy: { ticketNumber: "desc" },
    select: { ticketNumber: true },
  });
  if (!latest?.ticketNumber) return 1;
  const part = latest.ticketNumber.slice(prefix.length);
  const n = Number.parseInt(part, 10);
  return Number.isNaN(n) ? 1 : n + 1;
}

async function updateExistingTickets(agentIds: string[], rangeStart: Date, rangeEnd: Date) {
  const tickets = await prisma.ticket.findMany({ select: { id: true } });
  if (tickets.length === 0) return 0;

  let updated = 0;
  for (const ticket of tickets) {
    const createdAt = randomDateBetween(rangeStart, rangeEnd);
    const updatedAt = randomDateBetween(createdAt, rangeEnd);
    const status = pick(STATUSES);
    const priority = pick(PRIORITIES);
    const assignedAgentId = Math.random() < 0.12 ? null : pick(agentIds);
    const agent = assignedAgentId
      ? await prisma.agent.findUnique({
          where: { id: assignedAgentId },
          select: { teamId: true, name: true },
        })
      : null;
    const { fr, res } = slaHours(priority);
    const { firstResponseAt, resolvedAt, closedAt } = timestampsForStatus(status, createdAt, updatedAt);

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status,
        priority,
        assignedAgentId,
        teamId: agent?.teamId ?? undefined,
        firstResponseDueAt: new Date(createdAt.getTime() + fr * 60 * 60 * 1000),
        resolutionDueAt: new Date(createdAt.getTime() + res * 60 * 60 * 1000),
        firstResponseAt,
        resolvedAt,
        closedAt,
        createdAt,
        updatedAt,
      },
    });
    updated += 1;
  }
  return updated;
}

async function createTickets(count: number, agentIds: string[], rangeStart: Date, rangeEnd: Date) {
  const agents = await prisma.agent.findMany({
    select: { id: true, name: true, teamId: true },
  });
  const agentById = new Map(agents.map((a) => [a.id, a]));

  const year = rangeEnd.getUTCFullYear();
  const prefix = `TKT-${year}-`;
  let seq = await initialTicketSeq(year);
  let created = 0;

  for (let i = 0; i < count; i++) {
    const createdAt = randomDateBetween(rangeStart, rangeEnd);
    const updatedAt = randomDateBetween(createdAt, rangeEnd);
    const status = pick(STATUSES);
    const priority = pick(PRIORITIES);
    const category = pick(CATEGORIES);
    const assignedAgentId = Math.random() < 0.12 ? null : pick(agentIds);
    const agent = assignedAgentId ? agentById.get(assignedAgentId) : null;
    const { fr, res } = slaHours(priority);
    const { firstResponseAt, resolvedAt, closedAt } = timestampsForStatus(status, createdAt, updatedAt);

    const ticketNumber = `${prefix}${String(seq).padStart(5, "0")}`;
    seq += 1;
    const title = pick(SAMPLE_TITLES);
    const dept = category === "IT" ? "IT" : category === "HR" ? "HR" : "Operations";

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber,
        title: `${title} (${createdAt.toISOString().slice(0, 10)})`,
        description: `Sample ticket for metrics demo.\nDepartment/Business Unit: ${dept}`,
        category,
        priority,
        status,
        contactName: "Demo Requester",
        contactEmail: `requester${randomInt(1, 999)}@demo.local`,
        teamId: agent?.teamId ?? null,
        assignedAgentId,
        firstResponseDueAt: new Date(createdAt.getTime() + fr * 60 * 60 * 1000),
        resolutionDueAt: new Date(createdAt.getTime() + res * 60 * 60 * 1000),
        firstResponseAt,
        resolvedAt,
        closedAt,
        createdAt,
        updatedAt,
      },
    });

    await prisma.ticketActivity.createMany({
      data: [
        {
          ticketId: ticket.id,
          actor: "SYSTEM",
          summary: "Ticket created",
          detail: "Populated by populate-tickets-date-range script.",
          createdAt,
        },
        {
          ticketId: ticket.id,
          actor: assignedAgentId ? "AGENT" : "SYSTEM",
          summary: assignedAgentId ? "Assigned to agent" : "Awaiting assignment",
          detail: assignedAgentId
            ? `Assigned to ${agent?.name ?? "agent"}.`
            : "Pending manual assignment.",
          createdAt: new Date(createdAt.getTime() + 10 * 60 * 1000),
        },
        {
          ticketId: ticket.id,
          actor: "AGENT",
          summary: "Status update",
          detail: `Current status: ${status.replaceAll("_", " ")}.`,
          createdAt: updatedAt,
        },
      ],
    });

    created += 1;
  }

  return created;
}

async function main() {
  const { count, updateExisting, rangeStart, rangeEnd } = parseArgs();

  const agents = await prisma.agent.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  if (agents.length === 0) {
    console.error("No agents in database. Add personnel first, then re-run this script.");
    process.exit(1);
  }

  const agentIds = agents.map((a) => a.id);
  console.log(`Using ${agents.length} agents from database.`);
  console.log(`Date range: ${rangeStart.toISOString()} → ${rangeEnd.toISOString()}`);

  let updated = 0;
  if (updateExisting) {
    updated = await updateExistingTickets(agentIds, rangeStart, rangeEnd);
    console.log(`Updated ${updated} existing ticket(s).`);
  }

  const created = await createTickets(count, agentIds, rangeStart, rangeEnd);
  console.log(`Created ${created} new ticket(s) with random status and assignees.`);

  const total = await prisma.ticket.count({
    where: {
      createdAt: { gte: rangeStart, lte: rangeEnd },
    },
  });
  console.log(`Tickets with createdAt in range: ${total}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
