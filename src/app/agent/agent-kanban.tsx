"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AgentTicketDeepLink } from "@/components/AgentTicketDeepLink";
import { AssigneeColorHighlight } from "@/components/ticket/AssigneeColorHighlight";
import { AssigneeInitialsBadge } from "@/components/ticket/AssigneeInitialsBadge";
import { ElapsedFromIso } from "@/components/ElapsedFromIso";
import type { TicketStatus } from "@prisma/client";
import { cn } from "@/lib/cn";

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
  // Progress lane represents IN_PROGRESS, but also currently visually groups ESCALATED.
  // Keep ESCALATED stable when dropped back into the Progress lane.
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
  return status.replaceAll("_", " ");
}

export function AgentKanban({ tickets: initialTickets }: { tickets: KanbanTicket[] }) {
  const router = useRouter();
  const [tickets, setTickets] = useState(initialTickets);
  const [draggingId, setDraggingId] = useState<string | null>(null);
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

  function onDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(id);
  }

  function onDragEnd() {
    setDraggingId(null);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  return (
    <div className="space-y-3">
        {error ? (
        <p className="rounded-lg border border-amber-500/50 bg-amber-500/15 px-3 py-2 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          {error}
        </p>
      ) : null}

      <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 md:mx-0 md:grid md:gap-4 md:overflow-visible md:px-0 md:pb-0 md:snap-none md:grid-cols-3">
        {columns.map((col) => {
          const colTickets = tickets.filter((t) => statusToColumn(t.status) === col.id);
          const dropEnabled = col.id !== "open";

          return (
            <div
              key={col.id}
              className="flex min-h-[280px] w-[86vw] min-w-[260px] snap-start flex-col rounded-xl border border-zinc-200 bg-zinc-50 sm:w-[360px] md:w-auto md:min-w-0 dark:border-zinc-800 dark:bg-zinc-950/40"
              onDragOver={dropEnabled ? onDragOver : undefined}
              onDrop={
                dropEnabled
                  ? (e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData("text/plain");
                      const t = tickets.find((x) => x.id === id);
                      if (t) void moveTicket(t, col.id);
                    }
                  : undefined
              }
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
                      "cursor-grab rounded-lg border border-zinc-200 bg-white shadow-sm transition active:cursor-grabbing dark:border-zinc-800 dark:bg-[#0f172a]",
                      draggingId === t.id && "opacity-60",
                      busyId === t.id && "pointer-events-none opacity-50",
                      t.status === "ESCALATED" && "ring-1 ring-rose-500/40",
                    )}
                  >
                  <div
                    draggable
                    title="Drag to move ticket status"
                    onDragStart={(e) => onDragStart(e, t.id)}
                    onDragEnd={onDragEnd}
                    className="p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <AgentTicketDeepLink
                        ticketId={t.id}
                        className="font-mono text-[11px] text-zinc-600 hover:text-orange-700 dark:text-zinc-500 dark:hover:text-zinc-300"
                      >
                        #{t.ticketNumber}
                      </AgentTicketDeepLink>
                      <div className="flex items-center gap-1">
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", priorityClass(t.priority))}>
                          {priorityBadgeLabel(t.priority)}
                        </span>
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", statusBadgeClass(t.status))}>
                          {statusBadgeLabel(t.status)}
                        </span>
                      </div>
                    </div>
                    <AgentTicketDeepLink ticketId={t.id} className="mt-1 block text-left">
                      <p className="line-clamp-2 text-sm font-semibold text-zinc-900 hover:underline dark:text-zinc-100">
                        {t.description || t.title}
                      </p>
                    </AgentTicketDeepLink>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-600 dark:text-zinc-500">
                      <ElapsedFromIso iso={t.updatedAt} className="inline" />
                      <AssigneeInitialsBadge
                        agentName={t.agentName}
                        assigneeColorKey={t.assigneeColorKey}
                      />
                    </div>
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
