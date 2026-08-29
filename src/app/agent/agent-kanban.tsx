"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { AgentTicketDeepLink } from "@/components/AgentTicketDeepLink";
import { AssigneeColorHighlight } from "@/components/ticket/AssigneeColorHighlight";
import { AssigneeInitialsBadge } from "@/components/ticket/AssigneeInitialsBadge";
import { ElapsedFromIso } from "@/components/ElapsedFromIso";
import type { TicketStatus } from "@prisma/client/primary";
import { cn } from "@/lib/cn";
import { formatTicketStatusLabel } from "@/lib/ticket-status-label";
import { requestTypeAcronym, requestTypeLabel } from "@/lib/request-types";
import { extractPaymentBoardPreview } from "@/lib/request-for-payment";
import { parseItemRequisitionDescription } from "@/lib/item-requisition";
import { extractFundTransferPreview } from "@/lib/fund-transfer-request";
import { extractJobOrderPreview } from "@/lib/job-order";
import { PointerDragGhostLayer, usePointerColumnDrag } from "@/lib/pointer-column-drag";

export type KanbanTicket = {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  priority: string;
  status: TicketStatus;
  /** Intake request type id (ISSUE_CONCERN_TICKET, REQUEST_FOR_PAYMENT, …). */
  requestType?: string | null;
  /** e.g. APPROVED BY IS MISSING for Request for Payment. */
  proceduralStatusLabel?: string | null;
  updatedAt: string;
  agentName: string | null;
  assigneeColorKey?: string | null;
  assigneeProfileImage?: string | null;
  assigneeProfileImageZoom?: number | null;
  assigneeProfileImagePosX?: number | null;
  assigneeProfileImagePosY?: number | null;
};

type ColumnId = "open" | "progress" | "feedback";

const columns: { id: ColumnId; label: string; sublabel: string }[] = [
  { id: "open", label: "Open", sublabel: "New & triaged" },
  { id: "progress", label: "In progress", sublabel: "Work in flight" },
  { id: "feedback", label: "For confirmation", sublabel: "Awaiting customer confirmation" },
];

function statusToColumn(status: TicketStatus): ColumnId {
  if (status === "OPEN") return "open";
  if (status === "PENDING_INFO" || status === "FOR_CONFIRMATION" || status === "RESOLVED") return "feedback";
  return "progress";
}

function targetStatusForColumn(ticket: KanbanTicket, column: ColumnId): TicketStatus {
  if (column === "open") return "OPEN";
  if (column === "feedback") return "FOR_CONFIRMATION";
  return ticket.status === "ESCALATED" ? "ESCALATED" : "IN_PROGRESS";
}

function priorityClass(priority: string) {
  if (priority === "UNSET")
    return "bg-amber-500/15 text-amber-950 dark:bg-amber-500/15 dark:text-amber-200";
  if (priority === "URGENT" || priority === "HIGH")
    return "bg-rose-500/15 text-rose-900 dark:bg-rose-500/20 dark:text-rose-200";
  if (priority === "MEDIUM")
    return "bg-orange-500/15 text-orange-900 dark:bg-orange-500/20 dark:text-orange-200";
  return "bg-zinc-200 text-zinc-800 dark:bg-zinc-600/50 dark:text-zinc-200";
}

function priorityBadgeLabel(priority: string) {
  if (priority === "UNSET") return "Set level";
  return priority;
}

function statusBadgeClass(status: TicketStatus) {
  if (status === "OPEN") {
    return "bg-sky-500/15 text-sky-900 dark:bg-sky-500/20 dark:text-sky-200";
  }
  if (status === "IN_PROGRESS") {
    return "bg-indigo-500/15 text-indigo-900 dark:bg-indigo-500/20 dark:text-indigo-200";
  }
  if (status === "FOR_CONFIRMATION" || status === "RESOLVED") {
    return "bg-emerald-500/15 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200";
  }
  if (status === "ESCALATED") {
    return "bg-rose-500/15 text-rose-900 dark:bg-rose-500/20 dark:text-rose-200";
  }
  if (status === "PENDING_INFO") {
    return "bg-amber-500/15 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200";
  }
  return "bg-zinc-200 text-zinc-800 dark:bg-zinc-600/50 dark:text-zinc-200";
}

function statusBadgeLabel(status: TicketStatus) {
  if (status === "FOR_CONFIRMATION" || status === "RESOLVED") return "FOR CONFIRMATION";
  return formatTicketStatusLabel(status).toUpperCase();
}

function kanbanCardPreview(ticket: KanbanTicket): string {
  if (ticket.requestType === "REQUEST_FOR_PAYMENT") {
    const preview = extractPaymentBoardPreview(ticket.description);
    if (preview) return preview;
  }
  if (ticket.requestType === "ITEM_REQUISITION_SLIP") {
    const purpose = parseItemRequisitionDescription(ticket.description)?.purposeOfRequest?.trim();
    if (purpose) return purpose.slice(0, 120);
  }
  if (ticket.requestType === "FUND_TRANSFER_REQUEST") {
    const preview = extractFundTransferPreview(ticket.description);
    if (preview) return preview;
  }
  if (ticket.requestType === "JOB_ORDER") {
    const preview = extractJobOrderPreview(ticket.description);
    if (preview) return preview;
  }
  if (ticket.requestType === "AUTHORITY_TO_CONDUCT_ACTIVITY") {
    const nature = ticket.description.match(/^Nature of Request:\s*(.*)$/im)?.[1]?.trim();
    if (nature) return nature.slice(0, 120);
  }
  return (ticket.description || ticket.title).trim();
}

export function AgentKanban({
  tickets: initialTickets,
  columnTotals,
}: {
  tickets: KanbanTicket[];
  columnTotals?: Partial<Record<ColumnId, number>>;
}) {
  const router = useRouter();
  const [tickets, setTickets] = useState(initialTickets);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => setTickets(initialTickets));
  }, [initialTickets]);

  async function moveTicket(ticket: KanbanTicket, toColumn: ColumnId) {
    const from = ticket.status;
    const nextStatus = targetStatusForColumn(ticket, toColumn);
    if (from === nextStatus) return;
    if (toColumn === "progress" && nextStatus === "IN_PROGRESS" && ticket.priority === "UNSET") {
      setError("Set a priority level on the request before moving it to In progress.");
      setTimeout(() => setError(null), 6000);
      return;
    }
    if (toColumn === "open" && from !== "OPEN") {
      setError("This column is for newly opened items only. Move work forward from Open into In progress.");
      setTimeout(() => setError(null), 5000);
      return;
    }

    setBusyId(ticket.id);
    setError(null);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", status: nextStatus }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; status?: TicketStatus; updatedAt?: string };
      if (!res.ok) {
        setError(data.error ?? "Move not allowed for this transition.");
        setTimeout(() => setError(null), 5000);
        return;
      }
      setTickets((prev) =>
        prev.map((t) =>
          t.id === ticket.id
            ? { ...t, status: (data.status ?? nextStatus) as TicketStatus, updatedAt: new Date().toISOString(), assigneeColorKey: t.assigneeColorKey }
            : t,
        ),
      );
      router.refresh();
    } catch {
      setError("Network error — try again.");
      setTimeout(() => setError(null), 5000);
    } finally {
      setBusyId(null);
    }
  }

  const { registerColumn, getCardPointerProps, ghost, hoverColumn, draggingItemId } = usePointerColumnDrag<ColumnId>({
    onDrop: (itemId, column) => {
      const t = tickets.find((x) => x.id === itemId);
      if (t) void moveTicket(t, column);
    },
    isColumnDropDisabled: (c) => c === "open",
    activationDistance: 7,
    disabled: busyId != null,
  });

  function quickMoveTargets(ticket: KanbanTicket) {
    const currentColumn = statusToColumn(ticket.status);
    return columns.filter((target) => target.id !== currentColumn && target.id !== "open");
  }

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [activeLane, setActiveLane] = useState(0);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const syncActive = () => {
      const children = Array.from(el.querySelectorAll<HTMLElement>("[data-lane-index]"));
      if (children.length === 0) return;
      const mid = el.scrollLeft + el.clientWidth / 2;
      let best = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      children.forEach((child, i) => {
        const center = child.offsetLeft + child.offsetWidth / 2;
        const dist = Math.abs(center - mid);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      setActiveLane(best);
    };

    syncActive();
    el.addEventListener("scroll", syncActive, { passive: true });
    window.addEventListener("resize", syncActive);
    return () => {
      el.removeEventListener("scroll", syncActive);
      window.removeEventListener("resize", syncActive);
    };
  }, []);

  function scrollToLane(index: number) {
    const el = scrollerRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(columns.length - 1, index));
    const lane = el.querySelector<HTMLElement>(`[data-lane-index="${clamped}"]`);
    if (lane) {
      lane.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      setActiveLane(clamped);
      return;
    }
    const laneWidth = el.clientWidth * 0.86;
    el.scrollTo({ left: clamped * (laneWidth + 10), behavior: "smooth" });
    setActiveLane(clamped);
  }

  return (
    <div className="space-y-2 md:space-y-3">
      <PointerDragGhostLayer ghost={ghost} />
      {error ? (
        <p className="rounded-lg border border-amber-500/50 bg-amber-500/15 px-3 py-2 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2 md:hidden">
        <button
          type="button"
          onClick={() => scrollToLane(activeLane - 1)}
          disabled={activeLane <= 0}
          className="inline-flex size-9 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-700 disabled:opacity-35 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          aria-label="Previous lane"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="flex items-center gap-1.5">
          {columns.map((col, index) => (
            <button
              key={col.id}
              type="button"
              onClick={() => scrollToLane(index)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                index === activeLane ? "w-6 bg-orange-500" : "w-1.5 bg-zinc-300 dark:bg-zinc-700",
              )}
              aria-label={`Go to ${col.label}`}
              aria-current={index === activeLane ? "true" : undefined}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => scrollToLane(activeLane + 1)}
          disabled={activeLane >= columns.length - 1}
          className="inline-flex size-9 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-700 disabled:opacity-35 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          aria-label="Next lane"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div
        ref={scrollerRef}
        data-kanban-scroller
        className="-mx-2 flex snap-x snap-proximity gap-2.5 overflow-x-auto overscroll-x-contain px-2 pb-1 scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:grid md:snap-none md:gap-4 md:overflow-visible md:px-0 md:pb-0 md:scroll-auto md:grid-cols-3"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {columns.map((col, index) => {
          const colTickets = tickets.filter((t) => statusToColumn(t.status) === col.id);
          const dropEnabled = col.id !== "open";
          const highlightDrop = dropEnabled && hoverColumn === col.id;

          return (
            <div
              key={col.id}
              data-lane-index={index}
              ref={registerColumn(col.id)}
              className={cn(
                // Mobile: peek next lane; no nested vertical scroll so horizontal swipe works on cards too.
                "flex w-[min(86vw,22rem)] shrink-0 snap-center flex-col rounded-xl border border-zinc-200 bg-zinc-50 sm:w-[360px] md:w-auto md:min-h-[280px] md:min-w-0 md:snap-align-none dark:border-zinc-800 dark:bg-zinc-950/40",
                highlightDrop && "ring-2 ring-orange-500/70 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-zinc-950",
              )}
            >
              <div className="shrink-0 border-b border-zinc-200 px-3 py-1.5 dark:border-zinc-800 md:py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-900 dark:text-zinc-200">
                    {col.label}
                  </h3>
                  <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300">
                    {columnTotals?.[col.id] != null && columnTotals[col.id]! > colTickets.length
                      ? `${colTickets.length} / ${columnTotals[col.id]}`
                      : colTickets.length}
                  </span>
                </div>
                <p className="mt-0.5 hidden text-[11px] text-zinc-600 sm:block dark:text-zinc-500">{col.sublabel}</p>
              </div>

              <div className="flex flex-1 flex-col gap-2 p-2 md:max-h-[min(70dvh,42rem)] md:overflow-y-auto md:overscroll-contain">
                {colTickets.map((t) => (
                  <AssigneeColorHighlight
                    key={t.id}
                    assigneeColorKey={t.assigneeColorKey}
                    className={cn(
                      "rounded-lg border border-zinc-200 bg-white shadow-sm transition dark:border-zinc-800 dark:bg-[#181716]",
                      draggingItemId === t.id && "opacity-55",
                      busyId === t.id && "pointer-events-none opacity-50",
                      t.status === "ESCALATED" && "ring-1 ring-rose-500/40",
                    )}
                  >
                    <div className="flex gap-1.5 p-2.5 sm:p-3 sm:pt-2">
                      <span
                        {...getCardPointerProps(t.id, {
                          getLabel: () => `#${t.ticketNumber} · ${kanbanCardPreview(t).slice(0, 80)}`,
                        })}
                        data-drag-handle
                        className={cn(
                          "mt-0.5 flex min-h-10 w-7 shrink-0 touch-none select-none flex-col items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-500 active:bg-orange-50 active:text-orange-600 md:min-h-0 md:w-auto md:border-0 md:bg-transparent md:cursor-grab md:active:cursor-grabbing dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-400 dark:active:bg-orange-950/30",
                          busyId === t.id && "pointer-events-none",
                        )}
                        title="Hold and drag to another lane (touch or mouse)"
                        aria-label={`Drag ticket ${t.ticketNumber}`}
                        role="button"
                      >
                        <GripVertical className="size-4" />
                        <span className="sr-only">Drag</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <AgentTicketDeepLink
                          ticketId={t.id}
                          className="block min-w-0 cursor-pointer rounded-md text-left hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40"
                        >
                          <div className="flex flex-col gap-1.5 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between">
                            <span className="min-w-0 font-mono text-[11px] text-zinc-600 hover:text-orange-700 dark:text-zinc-500 dark:hover:text-zinc-300">
                              #{t.ticketNumber}
                            </span>
                            <div className="flex flex-wrap items-center gap-1 min-[420px]:justify-end">
                              <span
                                className="rounded-full border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
                                title={requestTypeLabel(t.requestType)}
                              >
                                {requestTypeAcronym(t.requestType)}
                              </span>
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                                  priorityClass(t.priority),
                                )}
                              >
                                {priorityBadgeLabel(t.priority)}
                              </span>
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                                  statusBadgeClass(t.status),
                                )}
                              >
                                {statusBadgeLabel(t.status)}
                              </span>
                            </div>
                          </div>
                          <p className="mt-1 line-clamp-3 break-words text-sm font-semibold leading-snug text-zinc-900 hover:underline sm:line-clamp-2 dark:text-zinc-100">
                            {kanbanCardPreview(t)}
                          </p>
                          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-zinc-600 dark:text-zinc-500">
                            <ElapsedFromIso iso={t.updatedAt} className="inline" />
                            <div className="flex shrink-0 items-center gap-1.5">
                              {t.proceduralStatusLabel ? (
                                <span
                                  className="rounded-full border border-amber-400/50 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200"
                                  title={t.proceduralStatusLabel}
                                >
                                  {t.proceduralStatusLabel}
                                </span>
                              ) : null}
                              <AssigneeInitialsBadge
                                agentName={t.agentName}
                                assigneeColorKey={t.assigneeColorKey}
                                profileImage={t.assigneeProfileImage}
                                profileImageZoom={t.assigneeProfileImageZoom}
                                profileImagePosX={t.assigneeProfileImagePosX}
                                profileImagePosY={t.assigneeProfileImagePosY}
                              />
                            </div>
                          </div>
                        </AgentTicketDeepLink>
                        {quickMoveTargets(t).length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5 md:hidden">
                            {quickMoveTargets(t).map((target) => (
                              <button
                                key={target.id}
                                type="button"
                                disabled={busyId === t.id}
                                onClick={() => void moveTicket(t, target.id)}
                                className="rounded-full border border-orange-300 bg-orange-50 px-2.5 py-1 text-[10px] font-bold text-orange-800 active:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-200"
                              >
                                Move to {target.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </AssigneeColorHighlight>
                ))}

                {colTickets.length === 0 && (
                  <div className="flex min-h-[92px] flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 py-5 text-center dark:border-zinc-800">
                    <p className="text-xs font-medium text-zinc-600 dark:text-zinc-500">+ Drop here</p>
                    <p className="mt-0.5 text-[11px] text-zinc-600">Drag a card from another lane</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
