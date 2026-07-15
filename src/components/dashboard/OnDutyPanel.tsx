"use client";

import { useEffect, useMemo, useState } from "react";
import { authInputClass, authLabelClass } from "@/components/auth/AuthShell";
import { cn } from "@/lib/cn";
import type { OnDutyAgentSnapshot } from "@/lib/load-on-duty-snapshot";

type Props = {
  initialAgents: OnDutyAgentSnapshot[];
  initialPage: number;
  totalPages: number;
  initialTotal?: number;
  initialOnDutyCount?: number;
  initialCompanies?: string[];
  pageSize?: number;
  variant?: "list" | "cards";
  showCompanyFilter?: boolean;
  className?: string;
};

function isAgentOnDuty(agent: OnDutyAgentSnapshot): boolean {
  if (typeof agent.isOnDuty === "boolean") return agent.isOnDuty;
  if (agent.dutyStatus) return agent.dutyStatus === "ON_DUTY";
  return Boolean(agent.isOnline);
}

function dutyLabel(agent: OnDutyAgentSnapshot): "On Duty" | "Offline" {
  return isAgentOnDuty(agent) ? "On Duty" : "Offline";
}

export function OnDutyPanel({
  initialAgents,
  initialPage,
  totalPages,
  initialTotal = initialAgents.length,
  initialOnDutyCount,
  initialCompanies = [],
  pageSize = 6,
  variant = "list",
  showCompanyFilter = false,
  className,
}: Props) {
  const [agents, setAgents] = useState<OnDutyAgentSnapshot[]>(initialAgents);
  const [page, setPage] = useState(initialPage);
  const [pages, setPages] = useState(totalPages);
  const [total, setTotal] = useState(initialTotal);
  const [onDutyCount, setOnDutyCount] = useState(
    initialOnDutyCount ?? initialAgents.filter((a) => isAgentOnDuty(a)).length,
  );
  const [companies, setCompanies] = useState<string[]>(initialCompanies);
  const [companyFilter, setCompanyFilter] = useState("");
  const canPrev = page > 1;
  const canNext = page < pages;

  const endpoint = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (companyFilter) params.set("company", companyFilter);
    return `/api/dashboard/on-duty?${params.toString()}`;
  }, [page, pageSize, companyFilter]);

  useEffect(() => {
    let stopped = false;
    async function refresh() {
      try {
        const res = await fetch(endpoint, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          agents: OnDutyAgentSnapshot[];
          page: number;
          totalPages: number;
          total: number;
          onDutyCount?: number;
          companies: string[];
        };
        if (stopped) return;
        setAgents(data.agents ?? []);
        setPage(data.page ?? 1);
        setPages(data.totalPages ?? 1);
        setTotal(data.total ?? 0);
        setOnDutyCount(
          typeof data.onDutyCount === "number"
            ? data.onDutyCount
            : (data.agents ?? []).filter((a) => isAgentOnDuty(a)).length,
        );
        if (Array.isArray(data.companies) && data.companies.length > 0) {
          setCompanies(data.companies);
        }
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

  function handleCompanyFilterChange(value: string) {
    setCompanyFilter(value);
    setPage(1);
  }

  const cardGridClass =
    variant === "cards"
      ? "mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
      : "mt-4 space-y-3";

  return (
    <article
      className={cn(
        "rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-[#0b1220]",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-600 dark:text-zinc-500">
            Personnel activity
          </h3>
          <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            Status from merged DB clock-in (today, Asia/Manila)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
          <span className="text-emerald-700 dark:text-emerald-400">{onDutyCount} on duty</span>
          <span>{total} staff</span>
          <span>
            {page}/{pages}
          </span>
        </div>
      </div>

      {showCompanyFilter ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <label className="flex min-w-[12rem] flex-col gap-1">
            <span className={authLabelClass}>Filter by company</span>
            <select
              value={companyFilter}
              onChange={(e) => handleCompanyFilterChange(e.target.value)}
              className={cn(authInputClass, "py-2 text-xs")}
            >
              <option value="">All companies</option>
              {companies.map((company) => (
                <option key={company} value={company}>
                  {company}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            {companyFilter
              ? `Showing ${agents.length} of ${total} in ${companyFilter}`
              : `Showing ${agents.length} of ${total}`}
          </p>
        </div>
      ) : null}

      {variant === "cards" ? (
        <div className={cardGridClass}>
          {agents.length === 0 ? (
            <p className="col-span-full text-sm text-zinc-600 dark:text-zinc-500">
              {companyFilter ? "No personnel for this company." : "No personnel linked from the merge database."}
            </p>
          ) : (
            agents.map((agent) => {
              const onDuty = isAgentOnDuty(agent);
              const label = dutyLabel(agent);
              return (
                <div
                  key={agent.id}
                  className="flex flex-col rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{agent.name}</p>
                      <p className="mt-1 truncate text-xs text-zinc-600 dark:text-zinc-500">
                        {agent.companyName || "General Queue"}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "mt-0.5 inline-block size-2.5 shrink-0 rounded-full",
                        onDuty ? "bg-emerald-500" : "bg-zinc-400 dark:bg-zinc-600",
                      )}
                      title={label}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        onDuty
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                          : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
                      )}
                    >
                      {label}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                    {agent.lastActivity ?? (onDuty ? "Clocked in today" : "No clock-in today")}
                  </p>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className={cardGridClass}>
          {agents.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-500">
              {companyFilter ? "No personnel for this company." : "No personnel linked from the merge database."}
            </p>
          ) : (
            agents.map((agent) => {
              const onDuty = isAgentOnDuty(agent);
              const label = dutyLabel(agent);
              return (
                <div
                  key={agent.id}
                  className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{agent.name}</p>
                    <p className="truncate text-xs text-zinc-600 dark:text-zinc-500">
                      {agent.companyName || "General Queue"}
                      {" · "}
                      {agent.lastActivity ?? (onDuty ? "Clocked in today" : "No clock-in today")}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                      onDuty
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                        : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
                    )}
                    title={label}
                  >
                    {label}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}

      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-end gap-2 text-xs font-semibold">
          <button
            type="button"
            onClick={() => canPrev && setPage((p) => Math.max(1, p - 1))}
            disabled={!canPrev}
            className={cn(
              "rounded-md px-2.5 py-1.5",
              canPrev
                ? "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                : "cursor-not-allowed border border-zinc-200 bg-zinc-100 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-600",
            )}
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => canNext && setPage((p) => Math.min(pages, p + 1))}
            disabled={!canNext}
            className={cn(
              "rounded-md px-2.5 py-1.5",
              canNext
                ? "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                : "cursor-not-allowed border border-zinc-200 bg-zinc-100 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-600",
            )}
          >
            Next
          </button>
        </div>
      ) : null}
    </article>
  );
}
