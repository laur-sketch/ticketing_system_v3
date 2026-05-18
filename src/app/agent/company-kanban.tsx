"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { AgentTicketDeepLink } from "@/components/AgentTicketDeepLink";
import type { CompanyBoardColumn, CompanyTicketCard } from "@/lib/company-board";
import { formatCompanyBoardStatusLabel } from "@/lib/ticket-status-label";
import { cn } from "@/lib/cn";

function statusPillClass(status: string) {
  if (status === "OPEN") {
    return "bg-sky-500/15 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200";
  }
  if (status === "IN_PROGRESS") {
    return "bg-indigo-500/15 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-200";
  }
  if (status === "FOR_CONFIRMATION" || status === "RESOLVED") {
    return "bg-emerald-500/15 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200";
  }
  if (status === "ESCALATED") {
    return "bg-amber-500/15 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200";
  }
  if (status === "PENDING_INFO") {
    return "bg-violet-500/15 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200";
  }
  return "bg-zinc-200 text-zinc-700 dark:bg-zinc-700/60 dark:text-zinc-200";
}

function ticketsForColumn(col: CompanyBoardColumn): CompanyTicketCard[] {
  const merged = [
    ...col.buckets.unassigned,
    ...col.buckets.in_progress,
    ...col.buckets.for_confirmation,
    ...col.buckets.closed,
  ];
  return merged.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

/** Split TKT-2026-00013 into two lines so narrow columns stay readable. */
function splitTicketNumber(ticketNumber: string): { head: string; tail: string } {
  const match = /^(TKT-\d{4})-(\d+)$/i.exec(ticketNumber.trim());
  if (match) return { head: match[1], tail: match[2] };
  const lastDash = ticketNumber.lastIndexOf("-");
  if (lastDash > 0) {
    return { head: ticketNumber.slice(0, lastDash), tail: ticketNumber.slice(lastDash + 1) };
  }
  return { head: ticketNumber, tail: "" };
}

function boardDensity(columnCount: number) {
  if (columnCount >= 12) {
    return {
      gridGap: "gap-1",
      header: "text-[10px] leading-tight",
      count: "text-[9px]",
      ticketHead: "text-[9px]",
      ticketTail: "text-[10px]",
      status: "text-[9px] leading-tight",
      cardPad: "px-1.5 py-2",
      rowPad: "px-1.5 py-2",
      headerPad: "px-1.5 py-2",
    };
  }
  if (columnCount >= 9) {
    return {
      gridGap: "gap-1.5",
      header: "text-[11px] leading-tight",
      count: "text-[9px]",
      ticketHead: "text-[10px]",
      ticketTail: "text-[11px]",
      status: "text-[9px] leading-tight",
      cardPad: "px-2 py-2",
      rowPad: "px-2 py-2",
      headerPad: "px-2 py-2",
    };
  }
  if (columnCount >= 6) {
    return {
      gridGap: "gap-2",
      header: "text-xs leading-snug",
      count: "text-[10px]",
      ticketHead: "text-[10px]",
      ticketTail: "text-xs",
      status: "text-[10px] leading-snug",
      cardPad: "px-2 py-2.5",
      rowPad: "px-2 py-2.5",
      headerPad: "px-2 py-2.5",
    };
  }
  return {
    gridGap: "gap-3",
    header: "text-sm leading-snug",
    count: "text-xs",
    ticketHead: "text-[10px]",
    ticketTail: "text-xs",
    status: "text-[11px] leading-snug",
    cardPad: "px-3 py-3",
    rowPad: "px-3 py-3",
    headerPad: "px-3 py-3",
  };
}

export function CompanyKanban({
  columns,
  refreshSeconds = 30,
}: {
  columns: CompanyBoardColumn[];
  refreshSeconds?: number;
}) {
  const router = useRouter();
  const density = useMemo(() => boardDensity(columns.length), [columns.length]);

  useEffect(() => {
    if (refreshSeconds <= 0) return;
    const id = window.setInterval(() => {
      router.refresh();
    }, refreshSeconds * 1000);
    return () => window.clearInterval(id);
  }, [router, refreshSeconds]);

  if (columns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 py-16 text-center dark:border-zinc-800">
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-400">No companies in view</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-col gap-3">
      <p className="text-[11px] text-zinc-600 dark:text-zinc-500">
        All companies in one row; lists refresh about every {refreshSeconds}s.
      </p>

      <div
        className={cn("grid min-h-[min(85dvh,880px)] w-full", density.gridGap)}
        style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
      >
        {columns.map((col) => (
          <CompanyColumnList key={col.teamId} col={col} density={density} />
        ))}
      </div>
    </div>
  );
}

type Density = ReturnType<typeof boardDensity>;

function CompanyColumnList({ col, density }: { col: CompanyBoardColumn; density: Density }) {
  const tickets = useMemo(() => ticketsForColumn(col), [col]);

  return (
    <article className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_8px_28px_rgba(0,0,0,0.06)] dark:border-zinc-800 dark:bg-[#0b1220] dark:shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
      <div className={cn("border-b border-zinc-200 dark:border-zinc-800", density.headerPad)}>
        <p
          className={cn("font-bold break-words text-zinc-900 dark:text-zinc-100", density.header)}
          title={col.companyName}
        >
          {col.companyName}
        </p>
        <p className={cn("mt-0.5 text-zinc-600 dark:text-zinc-500", density.count)}>
          {tickets.length} ticket{tickets.length === 1 ? "" : "s"}
        </p>
      </div>

      <ul className="min-h-0 flex-1 divide-y divide-zinc-200 overflow-y-auto dark:divide-zinc-800">
        {tickets.length === 0 ? (
          <li className={cn("py-8 text-center text-zinc-500 dark:text-zinc-500", density.status)}>
            No tickets
          </li>
        ) : (
          tickets.map((t) => {
            const { head, tail } = splitTicketNumber(t.ticketNumber);
            return (
              <li key={t.id}>
                <AgentTicketDeepLink
                  ticketId={t.id}
                  companyView
                  className={cn(
                    "flex flex-col gap-1.5 transition hover:bg-orange-500/[0.06] dark:hover:bg-orange-500/10",
                    density.rowPad,
                  )}
                >
                  <span className="font-mono leading-none text-zinc-900 dark:text-zinc-100">
                    <span className={cn("block font-medium opacity-80", density.ticketHead)}>{head}</span>
                    {tail ? (
                      <span className={cn("block font-bold", density.ticketTail)}>{tail}</span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "block w-full rounded-md px-1.5 py-1 text-center font-semibold whitespace-normal",
                      density.status,
                      statusPillClass(t.status),
                    )}
                    title={formatCompanyBoardStatusLabel(t.status)}
                  >
                    {formatCompanyBoardStatusLabel(t.status)}
                  </span>
                </AgentTicketDeepLink>
              </li>
            );
          })
        )}
      </ul>
    </article>
  );
}
