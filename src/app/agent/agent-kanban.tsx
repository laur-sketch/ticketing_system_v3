"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GripVertical } from "lucide-react";
import { AgentTicketDeepLink } from "@/components/AgentTicketDeepLink";
import { AssigneeColorHighlight } from "@/components/ticket/AssigneeColorHighlight";
import { AssigneeInitialsBadge } from "@/components/ticket/AssigneeInitialsBadge";
import { ElapsedFromIso } from "@/components/ElapsedFromIso";
import type { TicketStatus } from "@prisma/client";
import { cn } from "@/lib/cn";
import { formatTicketStatusLabel } from "@/lib/ticket-status-label";
import { PointerDragGhostLayer, usePointerColumnDrag } from "@/lib/pointer-column-drag";

export type KanbanTicket = {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  priority: string;
  status: TicketStatus;
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

export function AgentKanban({ tickets: initialTickets }: { tickets: KanbanTicket[] }) {
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
      setError("Set a priority level on the ticket before moving it to In progress.");
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
    activationDistance: 12,
    disabled: busyId != null,
  });

  return (
    <div className="space-y-3">
      <PointerDragGhostLayer ghost={ghost} />
      {error ? (
        <p className="rounded-lg border border-amber-500/50 bg-amber-500/15 px-3 py-2 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          {error}
        </p>
      ) : null}

      <p className="text-[11px] text-zinc-600 md:hidden dark:text-zinc-400">
        Tap a card to open it. Drag using the grip icon on the left to move tickets between lanes.
      </p>

      <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 [touch-action:pan-x] md:mx-0 md:grid md:gap-4 md:overflow-visible md:px-0 md:pb-0 md:snap-none md:grid-cols-3 md:[touch-action:auto]">
        {columns.map((col) => {
          const colTickets = tickets.filter((t) => statusToColumn(t.status) === col.id);
          const dropEnabled = col.id !== "open";
          const highlightDrop = dropEnabled && hoverColumn === col.id;

          return (
            <div
              key={col.id}
              ref={registerColumn(col.id)}
              className={cn(
                "flex min-h-[280px] w-[86vw] min-w-[260px] snap-start flex-col rounded-xl border border-zinc-200 bg-zinc-50 sm:w-[360px] md:w-auto md:min-w-0 dark:border-zinc-800 dark:bg-zinc-950/40",
                highlightDrop && "ring-2 ring-orange-500/70 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-zinc-950",
              )}
            >
              <div className="border-b border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-900 dark:text-zinc-200">
                    {col.label}
                  </h3>
                  <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300">
                    {colTickets.length}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-zinc-600 dark:text-zinc-500">{col.sublabel}</p>
              </div>

              <div className="flex flex-1 flex-col gap-2 p-2">
                {colTickets.map((t) => (
                  <AssigneeColorHighlight
                    key={t.id}
                    assigneeColorKey={t.assigneeColorKey}
                    className={cn(
                      "rounded-lg border border-zinc-200 bg-white shadow-sm transition dark:border-zinc-800 dark:bg-[#0f172a]",
                      draggingItemId === t.id && "opacity-55",
                      busyId === t.id && "pointer-events-none opacity-50",
                      t.status === "ESCALATED" && "ring-1 ring-rose-500/40",
                    )}
                  >
                    <div className="flex gap-1.5 p-3 pt-2">
                      <span
                        {...getCardPointerProps(t.id, {
                          getLabel: () => `#${t.ticketNumber} · ${(t.description || t.title).slice(0, 80)}`,
                        })}
                        className={cn(
                          "mt-0.5 shrink-0 touch-none select-none text-zinc-400 md:cursor-grab md:active:cursor-grabbing dark:text-zinc-500",
                          busyId === t.id && "pointer-events-none",
                        )}
                        title="Hold and drag to another lane (touch or mouse)"
                        aria-hidden
                      >
                        <GripVertical className="size-4" />
                      </span>
                      <AgentTicketDeepLink
                        ticketId={t.id}
                        className="min-w-0 flex-1 cursor-pointer rounded-md text-left hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-mono text-[11px] text-zinc-600 hover:text-orange-700 dark:text-zinc-500 dark:hover:text-zinc-300">
                            #{t.ticketNumber}
                          </span>
                          <div className="flex items-center gap-1">
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
                        <p className="mt-1 line-clamp-2 text-sm font-semibold text-zinc-900 hover:underline dark:text-zinc-100">
                          {t.description || t.title}
                        </p>
                        <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-600 dark:text-zinc-500">
                          <ElapsedFromIso iso={t.updatedAt} className="inline" />
                          <AssigneeInitialsBadge
                            agentName={t.agentName}
                            assigneeColorKey={t.assigneeColorKey}
                            profileImage={t.assigneeProfileImage}
                            profileImageZoom={t.assigneeProfileImageZoom}
                            profileImagePosX={t.assigneeProfileImagePosX}
                            profileImagePosY={t.assigneeProfileImagePosY}
                          />
                        </div>
                      </AgentTicketDeepLink>
                    </div>
                  </AssigneeColorHighlight>
                ))}

                {colTickets.length === 0 && (
                  <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-zinc-800 py-6 text-center">
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
