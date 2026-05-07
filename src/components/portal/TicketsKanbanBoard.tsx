"use client";

import Link from "next/link";
import type { TicketPriority, TicketStatus } from "@prisma/client";
import { cn } from "@/lib/cn";

export type KanbanTicket = {
  id: string;
  ticketNumber: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  updatedAt: string;
  authorLabel: string;
};

const columns: {
  id: "pending" | "inProgress" | "done";
  title: string;
  match: (s: TicketStatus) => boolean;
}[] = [
  {
    id: "pending",
    title: "Pending",
    match: (s) => s === "OPEN" || s === "PENDING_INFO",
  },
  {
    id: "inProgress",
    title: "In progress",
    match: (s) => s === "IN_PROGRESS" || s === "ESCALATED",
  },
  {
    id: "done",
    title: "For confirmation / Closed",
    match: (s) => s === "FOR_CONFIRMATION" || s === "RESOLVED" || s === "CLOSED",
  },
];

function shortNum(ticketNumber: string) {
  const m = ticketNumber.replace(/\D/g, "");
  if (m.length >= 3) return m.slice(-3);
  return ticketNumber;
}

function idBadgeClass(ticketNumber: string, priority: TicketPriority) {
  if (priority === "UNSET")
    return "border-amber-400/50 bg-amber-500/15 text-amber-950 dark:bg-amber-500/15 dark:text-amber-200";
  if (priority === "URGENT") return "border-rose-400/50 bg-rose-500/15 text-rose-900 dark:bg-rose-500/20 dark:text-rose-200";
  const h = Array.from(ticketNumber).reduce((a, c) => a + c.charCodeAt(0), 0);
  return h % 2 === 0
    ? "border-orange-400/50 bg-orange-500/15 text-orange-900 dark:bg-orange-500/20 dark:text-orange-200"
    : "border-zinc-400/60 bg-zinc-200 text-zinc-900 dark:border-zinc-500/50 dark:bg-zinc-700/40 dark:text-zinc-200";
}

function statusPill(status: TicketStatus) {
  switch (status) {
    case "IN_PROGRESS":
      return {
        label: "In progress",
        className: "bg-orange-500/15 text-orange-900 dark:bg-orange-500/20 dark:text-orange-200",
      };
    case "OPEN":
      return { label: "Open", className: "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-200" };
    case "ESCALATED":
      return { label: "Urgent", className: "bg-rose-500/15 text-rose-900 dark:bg-rose-500/20 dark:text-rose-200" };
    case "PENDING_INFO":
      return { label: "Pending", className: "bg-amber-500/15 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200" };
    case "FOR_CONFIRMATION":
    case "RESOLVED":
      return {
        label: "For confirmation",
        className: "bg-orange-600/15 text-orange-900 dark:bg-orange-600/20 dark:text-orange-200",
      };
    case "CLOSED":
      return {
        label: "Closed",
        className: "bg-orange-600/15 text-orange-900 dark:bg-orange-600/20 dark:text-orange-200",
      };
    default: {
      const s = status as string;
      return { label: s.replaceAll("_", " "), className: "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-200" };
    }
  }
}

function formatUpdated(iso: string) {
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString();
}

function TicketCard({ t }: { t: KanbanTicket }) {
  const pill = statusPill(t.status);
  const pillLabel = t.priority === "URGENT" ? "Urgent" : pill.label;
  const pillClass =
    t.priority === "URGENT"
      ? "bg-rose-500/15 text-rose-900 dark:bg-rose-500/20 dark:text-rose-200"
      : pill.className;
  return (
    <Link
      href={`/tickets/${t.id}`}
      className="block rounded-xl border border-zinc-200 bg-white p-3.5 shadow-sm transition hover:border-orange-400/60 hover:bg-orange-50/50 dark:border-zinc-700 dark:bg-[#0f172a] dark:hover:bg-[#111c33]"
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "shrink-0 rounded-md border px-2 py-0.5 font-mono text-[11px] font-bold",
            idBadgeClass(t.ticketNumber, t.priority),
          )}
        >
          #{shortNum(t.ticketNumber)}
        </span>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", pillClass)}>
          {pillLabel}
        </span>
      </div>
      <p className="mt-2.5 line-clamp-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t.title}</p>
      <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400">
        Updated {formatUpdated(t.updatedAt)}
        {t.authorLabel ? ` · ${t.authorLabel}` : ""}
      </p>
    </Link>
  );
}

export function TicketsKanbanBoard({ tickets }: { tickets: KanbanTicket[] }) {
  return (
    <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 md:mx-0 md:grid md:gap-4 md:overflow-visible md:px-0 md:pb-0 md:snap-none md:grid-cols-3">
      {columns.map((col) => {
        const list = tickets.filter((t) => col.match(t.status));
        return (
          <div
            key={col.id}
            className="flex min-h-[260px] w-[86vw] min-w-[260px] snap-start flex-col rounded-2xl border border-zinc-200 bg-white sm:w-[360px] md:w-auto md:min-w-0 dark:border-zinc-800 dark:bg-[#0b1220]"
          >
            <div className="border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-400">
                {col.title}
                <span className="ml-1.5 font-mono text-zinc-500 dark:text-zinc-500">({list.length})</span>
              </h3>
            </div>
            <div className="flex max-h-[min(52vh,520px)] min-h-[120px] flex-col gap-2 overflow-y-auto p-3">
              {list.length === 0 ? (
                <p className="py-4 text-center text-xs text-zinc-600 dark:text-zinc-500">No tickets in this column.</p>
              ) : (
                list.map((t) => <TicketCard key={t.id} t={t} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
