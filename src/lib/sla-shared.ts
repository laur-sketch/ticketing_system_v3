import type { Ticket, TicketStatus } from "@prisma/client/primary";
import { requestBoardLaneKey } from "@/lib/request-board-columns-shared";

/** OVERDUE when a request stays in the same Request Board lane longer than this. */
export const BOARD_LANE_OVERDUE_MS = 24 * 60 * 60 * 1000;

/** Hours before the 24h lane overdue mark when a ticket is considered AT_RISK. */
export const BOARD_LANE_AT_RISK_HOURS = 4;
export const BOARD_LANE_AT_RISK_MS = BOARD_LANE_AT_RISK_HOURS * 60 * 60 * 1000;

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export type SlaState = "ON_TRACK" | "AT_RISK" | "BREACHED";

type BoardLaneTicket = {
  status: TicketStatus;
  boardLaneEnteredAt?: Date | string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

function toMs(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Instant the ticket entered its current Request Board lane. */
export function boardLaneEnteredAtMs(ticket: BoardLaneTicket): number {
  return (
    toMs(ticket.boardLaneEnteredAt) ??
    toMs(ticket.updatedAt) ??
    toMs(ticket.createdAt) ??
    Date.now()
  );
}

export function isUnresolvedRequestStatus(status: TicketStatus): boolean {
  return status !== "FOR_CONFIRMATION" && status !== "RESOLVED" && status !== "CLOSED";
}

/** Still on the Request Board (any column except fully closed). */
export function isOnRequestBoard(status: TicketStatus): boolean {
  return status !== "CLOSED";
}

/**
 * OVERDUE: still on the Request Board and in the same kanban column
 * for more than 24 hours.
 */
export function isBoardLaneOverdue(ticket: BoardLaneTicket, nowMs = Date.now()): boolean {
  if (!isOnRequestBoard(ticket.status)) return false;
  return nowMs - boardLaneEnteredAtMs(ticket) > BOARD_LANE_OVERDUE_MS;
}

export function getTicketSlaState(ticket: Ticket | BoardLaneTicket): SlaState {
  const now = Date.now();
  if (!isOnRequestBoard(ticket.status)) return "ON_TRACK";

  // OVERDUE = parked in one Request Board column for > 24 hours.
  const dwellMs = now - boardLaneEnteredAtMs(ticket);
  if (dwellMs > BOARD_LANE_OVERDUE_MS) return "BREACHED";
  // Approaching overdue: last 4 hours of the 24h lane window.
  if (dwellMs > BOARD_LANE_OVERDUE_MS - BOARD_LANE_AT_RISK_MS) return "AT_RISK";
  return "ON_TRACK";
}

/** Whether a status / board-column change moves the ticket to a different lane. */
export function didRequestBoardLaneChange(
  before: { status: TicketStatus; requestBoardColumnId?: string | null },
  after: { status: TicketStatus; requestBoardColumnId?: string | null },
): boolean {
  return requestBoardLaneKey(before) !== requestBoardLaneKey(after);
}
