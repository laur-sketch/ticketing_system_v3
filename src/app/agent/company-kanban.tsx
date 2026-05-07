"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AgentTicketDeepLink } from "@/components/AgentTicketDeepLink";
import type { CompanyBoardColumn, CompanyBucketId } from "@/lib/company-board";
import { cleanIssuePreview, formatRelativeAgo, priorityPillClass } from "@/lib/ticket-board-formatters";
import { cn } from "@/lib/cn";

const BUCKET_META: { id: CompanyBucketId; label: string; sub: string }[] = [
  { id: "unassigned", label: "Unassigned", sub: "Not yet assigned to personnel" },
  { id: "in_progress", label: "In progress", sub: "Actively owned work" },
  { id: "for_confirmation", label: "For confirmation", sub: "Awaiting customer confirmation" },
  { id: "closed", label: "Closed", sub: "Recently completed" },
];

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

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
    return "bg-rose-500/15 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200";
  }
  return "bg-zinc-200 text-zinc-700 dark:bg-zinc-700/60 dark:text-zinc-200";
}

export function CompanyKanban({
  columns,
  refreshSeconds = 30,
}: {
  columns: CompanyBoardColumn[];
  refreshSeconds?: number;
}) {
  const router = useRouter();
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
    <div className="space-y-4">
      <p className="text-[11px] text-zinc-600 dark:text-zinc-500">
        Company lanes with status buckets. Refreshes about every {refreshSeconds}s.
      </p>

      <div className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3">
        {columns.map((col) => (
          <article
            key={col.teamId}
            className="w-[min(94vw,380px)] shrink-0 snap-start sm:w-auto rounded-2xl border border-zinc-200 bg-white p-3 shadow-[0_8px_28px_rgba(0,0,0,0.06)] dark:border-zinc-800 dark:bg-[#0b1220] dark:shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
          >
            <div className="mb-3 flex items-start justify-between gap-2 border-b border-zinc-200 px-1 pb-2 dark:border-zinc-800">
              <div className="min-w-0">
                <p className="truncate text-lg font-bold leading-tight text-zinc-900 dark:text-zinc-100">
                  {col.companyName}
                </p>
                <p className="text-xs text-zinc-600 dark:text-zinc-500">Company queue</p>
              </div>
              <span className="shrink-0 rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {BUCKET_META.reduce((n, b) => n + col.buckets[b.id].length, 0)}
              </span>
            </div>

            <div className="max-h-[min(78vh,720px)] space-y-4 overflow-y-auto pr-0.5">
              {BUCKET_META.map((meta) => {
                const list = col.buckets[meta.id];
                return (
                  <div key={meta.id}>
                    <div className="mb-1.5 px-0.5">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
                        {meta.label}
                      </p>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-500">{meta.sub}</p>
                      <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-500">{list.length}</p>
                    </div>
                    <div className="space-y-2">
                      {list.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-zinc-300 px-2 py-4 text-center text-[11px] text-zinc-500 dark:border-zinc-700">
                          None
                        </div>
                      ) : col.cardMode === "staff" ? (
                        list.map((t) => {
                          const preview = cleanIssuePreview(t.description || t.title);
                          return (
                            <AgentTicketDeepLink
                              key={`${meta.id}-${t.id}`}
                              ticketId={t.id}
                              className="block rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 shadow-sm transition hover:border-orange-400/60 dark:border-zinc-700 dark:bg-[#101a2f]"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-mono text-[11px] text-zinc-600 dark:text-zinc-500">
                                  {t.ticketNumber}
                                </p>
                                <div className="flex items-center gap-1">
                                  <span
                                    className={cn(
                                      "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                                      priorityPillClass(t.priority),
                                    )}
                                  >
                                    {t.priority}
                                  </span>
                                  <span
                                    className={cn(
                                      "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                                      statusPillClass(t.status),
                                    )}
                                  >
                                    {statusLabel(t.status)}
                                  </span>
                                </div>
                              </div>
                              <p className="mt-1 line-clamp-2 text-sm font-semibold text-zinc-900 hover:underline dark:text-zinc-100">
                                {preview || t.title}
                              </p>
                              {t.assignedAgentName ? (
                                <p className="mt-1 text-[10px] font-medium text-zinc-500 dark:text-zinc-500">
                                  Assigned: {t.assignedAgentName}
                                </p>
                              ) : null}
                              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-500">
                                {formatRelativeAgo(t.updatedAt)}
                              </p>
                            </AgentTicketDeepLink>
                          );
                        })
                      ) : (
                        list.map((t) => (
                          <AgentTicketDeepLink
                            key={`${meta.id}-${t.id}`}
                            ticketId={t.id}
                            className="block rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 shadow-sm transition hover:border-orange-400/60 dark:border-zinc-700 dark:bg-[#101a2f]"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-mono text-[11px] text-zinc-600 dark:text-zinc-500">
                                {t.ticketNumber}
                              </p>
                              <div className="flex items-center gap-1">
                                <span
                                  className={cn(
                                    "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                                    priorityPillClass(t.priority),
                                  )}
                                >
                                  {t.priority}
                                </span>
                                <span
                                  className={cn(
                                    "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                                    statusPillClass(t.status),
                                  )}
                                >
                                  {statusLabel(t.status)}
                                </span>
                              </div>
                            </div>
                            <p className="mt-1 line-clamp-2 text-sm font-semibold text-zinc-900 hover:underline dark:text-zinc-100">
                              {cleanIssuePreview(t.description || t.title) || t.title}
                            </p>
                            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-500">
                              {formatRelativeAgo(t.updatedAt)}
                            </p>
                          </AgentTicketDeepLink>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
