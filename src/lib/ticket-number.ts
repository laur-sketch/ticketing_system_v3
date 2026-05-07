import { prisma } from "./prisma";

export async function nextTicketNumber(): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `TKT-${year}-`;
  const latest = await prisma.ticket.findFirst({
    where: { ticketNumber: { startsWith: prefix } },
    orderBy: { ticketNumber: "desc" },
    select: { ticketNumber: true },
  });
  let seq = 1;
  if (latest?.ticketNumber) {
    const part = latest.ticketNumber.slice(prefix.length);
    const n = Number.parseInt(part, 10);
    if (!Number.isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(5, "0")}`;
}
