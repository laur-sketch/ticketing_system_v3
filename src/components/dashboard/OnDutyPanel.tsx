"use client";

import { useEffect, useMemo, useState } from "react";

type OnDutyAgent = {
  id: string;
  name: string;
  companyName: string;
  isOnline: boolean;
};

type Props = {
  initialAgents: OnDutyAgent[];
  initialPage: number;
  totalPages: number;
};

export function OnDutyPanel({ initialAgents, initialPage, totalPages }: Props) {
  const [agents, setAgents] = useState<OnDutyAgent[]>(initialAgents);
  const [page, setPage] = useState(initialPage);
  const [pages, setPages] = useState(totalPages);
  const canPrev = page > 1;
  const canNext = page < pages;

  const endpoint = useMemo(() => `/api/dashboard/on-duty?page=${page}`, [page]);

  useEffect(() => {
    let stopped = false;
    async function refresh() {
      try {
        const res = await fetch(endpoint, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          agents: OnDutyAgent[];
          page: number;
          totalPages: number;
        };
        if (stopped) return;
        setAgents(data.agents ?? []);
        setPage(data.page ?? 1);
        setPages(data.totalPages ?? 1);
      } catch {
        // Ignore intermittent polling failures.
      }
    }

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 10000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [endpoint]);

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-[#0b1220]">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-600 dark:text-zinc-500">On Duty</h3>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
          {page}/{pages}
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {agents.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-500">No agents available.</p>
        ) : (
          agents.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{agent.name}</p>
                <p className="text-xs text-zinc-600 dark:text-zinc-500">{agent.companyName || "General Queue"}</p>
              </div>
              <span
                className={`inline-block size-2.5 rounded-full ${
                  agent.isOnline ? "bg-orange-600 dark:bg-orange-500" : "bg-zinc-400 dark:bg-zinc-600"
                }`}
                title={agent.isOnline ? "Online" : "Offline"}
              />
            </div>
          ))
        )}
      </div>
      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-end gap-2 text-xs font-semibold">
          <button
            type="button"
            onClick={() => canPrev && setPage((p) => Math.max(1, p - 1))}
            disabled={!canPrev}
            className={`rounded-md px-2.5 py-1.5 ${
              canPrev
                ? "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                : "cursor-not-allowed border border-zinc-200 bg-zinc-100 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-600"
            }`}
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => canNext && setPage((p) => Math.min(pages, p + 1))}
            disabled={!canNext}
            className={`rounded-md px-2.5 py-1.5 ${
              canNext
                ? "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                : "cursor-not-allowed border border-zinc-200 bg-zinc-100 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-600"
            }`}
          >
            Next
          </button>
        </div>
      ) : null}
    </article>
  );
}
