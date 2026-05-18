import type { TicketStatus } from "@prisma/client";

/** User-facing ticket status labels (ESCALATED = transfer pending approval). */
export function formatTicketStatusLabel(status: TicketStatus | string): string {
  const s = String(status);
  if (s === "ESCALATED") return "Transfer pending";
  if (s === "FOR_CONFIRMATION") return "For confirmation";
  if (s === "IN_PROGRESS") return "In progress";
  if (s === "PENDING_INFO") return "Pending info";
  if (s === "OPEN") return "Open";
  if (s === "CLOSED") return "Closed";
  if (s === "RESOLVED") return "Resolved";
  return s.replaceAll("_", " ");
}
