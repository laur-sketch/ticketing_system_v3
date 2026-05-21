"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { GripVertical } from "lucide-react";
import { OrchestrationQueueNav } from "@/components/OrchestrationQueueNav";
import { SimplePaginationBar } from "@/components/ui/SimplePaginationBar";
import { AssigneeColorHighlight } from "@/components/ticket/AssigneeColorHighlight";
import { AssigneeInitialsBadge } from "@/components/ticket/AssigneeInitialsBadge";
import { cn } from "@/lib/cn";
import { PointerDragGhostLayer, usePointerColumnDrag } from "@/lib/pointer-column-drag";
import { BRAND_TITLE } from "@/lib/brand";
import {
  cleanIssuePreview,
  extractDepartmentFromDescription,
  formatRelativeAgo,
  priorityPillClass,
} from "@/lib/ticket-board-formatters";

type TicketCard = {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  priority: string;
  updatedAt: string;
};

type PersonnelColumn = {
  agentId: string;
  name: string;
  role: string;
  teamLabel: string;
  /** Registry color for this lane's assignee (Admin/Personnel). */
  assigneeColorKey?: string | null;
  cards: TicketCard[];
};

const ASSIGNMENT_LANES_PAGE_SIZE = 6;

export function ManualAssignmentBoard({
  unassigned,
  personnel,
  companyFilterLabel,
  companyFilterTeamId,
  companyFilterOptions,
  notice,
  showFullRosterFilter,
}: {
  unassigned: TicketCard[];
  personnel: PersonnelColumn[];
  companyFilterLabel?: string | null;
  companyFilterTeamId?: string | null;
  companyFilterOptions?: Array<{ id: string; name: string }>;
  notice?: string | null;
  /** SuperAdmin / Admin: company dropdown narrows personnel lanes + queue */
  showFullRosterFilter?: boolean;
}) {
  const pathname = usePathname();
  const [cards, setCards] = useState<TicketCard[]>(unassigned);
  const [columns, setColumns] = useState<PersonnelColumn[]>(personnel);
  const [busyTicketId, setBusyTicketId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lanePage, setLanePage] = useState(1);
  const allCount = useMemo(() => cards.length + columns.reduce((sum, c) => sum + c.cards.length, 0), [cards, columns]);
  const canChooseCompanyFilter = Array.isArray(companyFilterOptions) && companyFilterOptions.length > 0;

  useEffect(() => {
    queueMicrotask(() => {
      setCards(unassigned);
      setColumns(personnel);
    });
  }, [unassigned, personnel]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(columns.length / ASSIGNMENT_LANES_PAGE_SIZE));
    queueMicrotask(() => setLanePage((p) => Math.min(Math.max(1, p), totalPages)));
  }, [columns.length]);

  const lanePageCount = Math.max(1, Math.ceil(columns.length / ASSIGNMENT_LANES_PAGE_SIZE));
  const lanePageClamped = Math.min(Math.max(1, lanePage), lanePageCount);
  const visibleColumns = useMemo(() => {
    const start = (lanePageClamped - 1) * ASSIGNMENT_LANES_PAGE_SIZE;
    return columns.slice(start, start + ASSIGNMENT_LANES_PAGE_SIZE);
  }, [columns, lanePageClamped]);

  async function assign(ticket: TicketCard, agentId: string) {
    setBusyTicketId(ticket.id);
    setError(null);
    try {
      const res = await fetch("/api/admin/manual-assignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: ticket.id, agentId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not assign ticket.");
        return;
      }
      setCards((prev) => prev.filter((t) => t.id !== ticket.id));
      setColumns((prev) =>
        prev.map((col) =>
          col.agentId === agentId
            ? {
                ...col,
                cards: [ticket, ...col.cards],
              }
            : col,
        ),
      );
    } finally {
      setBusyTicketId(null);
    }
  }

  const laneDrag = usePointerColumnDrag<string>({
    onDrop: (ticketId, agentId) => {
      const t = cards.find((x) => x.id === ticketId);
      if (t) void assign(t, agentId);
    },
    disabled: busyTicketId != null,
    activationDistance: 12,
  });

  return (
      <main className="min-h-[calc(100vh-56px)] bg-zinc-50 px-3 py-6 text-zinc-900 sm:px-4 sm:py-8 dark:bg-[#070d19] dark:text-zinc-100">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <PointerDragGhostLayer ghost={laneDrag.ghost} />
        <OrchestrationQueueNav />
        <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-zinc-800/90 dark:bg-gradient-to-b dark:from-[#0d1629] dark:to-[#0b1220] dark:shadow-[0_16px_45px_rgba(0,0,0,0.35)]">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-400/95">
            {BRAND_TITLE} · Manual assignment
          </p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl md:text-4xl dark:text-white">
            Assignment Board
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            Move tickets from the unassigned pool into staff lanes (hold and slide on touch, or drag with a mouse).
            Active pipeline cards:{" "}
            <span className="font-semibold text-orange-700 dark:text-orange-300">{allCount}</span>.
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Up to six personnel lanes per page; use pagination below the lanes when there are more. On mobile, swipe
            within the lane row.
          </p>
          {companyFilterLabel ? (
            <p className="mt-2 text-xs font-semibold text-orange-700 dark:text-orange-300">
              {canChooseCompanyFilter
                ? companyFilterTeamId
                  ? `Personnel lanes: ${companyFilterLabel}. Unassigned pool lists every active unassigned ticket (all queues).`
                  : `Showing personnel & unassigned queue for: ${companyFilterLabel}`
                : `Locked to your company/SBU: ${companyFilterLabel}`}
            </p>
          ) : showFullRosterFilter && canChooseCompanyFilter ? (
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
              All companies/SBUs — pick a company above to show only personnel assigned to that SBU and tickets queued to that SBU.
            </p>
          ) : null}
          {notice ? (
            <p className="mt-3 rounded-lg border border-amber-400/40 bg-amber-100/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100">
              {notice}
            </p>
          ) : null}
          {canChooseCompanyFilter ? (
            <form
              method="get"
              action={pathname}
              onChange={(e) => e.currentTarget.requestSubmit()}
              className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end"
            >
              <div className="flex min-w-[200px] max-w-xs flex-col gap-1.5">
                <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                  Company / SBU (personnel lanes)
                </label>
                <select
                  key={companyFilterTeamId ?? "all"}
                  name="company"
                  defaultValue={companyFilterTeamId ?? ""}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                >
                  <option value="">All companies / SBUs</option>
                  {companyFilterOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </select>
              </div>
              <p className="w-full text-[11px] text-zinc-500 dark:text-zinc-500">
                Choose an SBU to update the personnel lanes automatically. Select all companies/SBUs to remove the filter.
              </p>
            </form>
          ) : null}
        </header>

        {error ? <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-200">{error}</p> : null}

        <section className="grid gap-4 xl:grid-cols-[1.05fr_1.95fr]">
          <article className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-[#0b1220] xl:sticky xl:top-4 xl:self-start">
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-800 dark:text-zinc-200">Unassigned pool</h2>
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800 dark:bg-orange-500/20 dark:text-orange-200">{cards.length}</span>
            </div>
            <div className="max-h-[70vh] space-y-2 overflow-y-auto overflow-x-hidden pr-1">
              {cards.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-500">
                  No unassigned tickets.
                </div>
              ) : (
                cards.map((t) => (
                  <div
                    key={t.id}
                    {...laneDrag.getCardPointerProps(t.id, {
                      getLabel: () => `${t.ticketNumber} · ${cleanIssuePreview(t.description || t.title).slice(0, 72)}`,
                    })}
                    className={cn(
                      "touch-pan-y select-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 shadow-sm dark:border-zinc-700 dark:bg-[#101a2f]",
                      busyTicketId === t.id && "pointer-events-none opacity-50",
                      laneDrag.draggingItemId === t.id && "opacity-60 ring-1 ring-orange-400/40",
                    )}
                  >
                    <div className="flex gap-2">
                      <GripVertical className="mt-0.5 size-4 shrink-0 text-zinc-400 dark:text-zinc-500" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-mono text-[11px] text-zinc-600 dark:text-zinc-500">{t.ticketNumber}</p>
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", priorityPillClass(t.priority))}>
                            {t.priority}
                          </span>
                        </div>
                        <Link href={`/agent/tickets/${t.id}`} className="mt-1 block line-clamp-2 text-base font-semibold text-zinc-900 hover:underline dark:text-zinc-100">
                          {cleanIssuePreview(t.description || t.title)}
                        </Link>
                        {extractDepartmentFromDescription(t.description) ? (
                          <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-500">
                            Request to Company/SBU: {extractDepartmentFromDescription(t.description)}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-500">{formatRelativeAgo(t.updatedAt)}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>

          <div className="space-y-3 xl:min-w-0">
          <div className="-mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-1 [touch-action:pan-x] sm:mx-0 sm:grid sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 sm:grid-cols-2 sm:[touch-action:auto]">
            {columns.length === 0 ? (
              <div className="w-full rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/80 px-4 py-12 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
                {companyFilterTeamId
                  ? "No personnel on roster for this company/SBU. Designate staff to this SBU in Personnel (Portal Accounts), or pick another filter."
                  : "No personnel lanes — add staff to the roster from Personnel."}
              </div>
            ) : (
              visibleColumns.map((col) => (
              <article
                key={col.agentId}
                ref={laneDrag.registerColumn(col.agentId)}
                className={cn(
                  "w-[88%] shrink-0 snap-start rounded-2xl border border-zinc-200 bg-white p-3 transition sm:w-auto dark:border-zinc-800 dark:bg-[#0b1220]",
                  laneDrag.hoverColumn === col.agentId && "ring-2 ring-orange-500/65 ring-offset-2 ring-offset-white dark:ring-offset-zinc-950",
                )}
              >
                <div className="mb-2 flex items-start justify-between gap-2 px-1">
                  <div className="flex min-w-0 items-start gap-2">
                    <AssigneeInitialsBadge
                      agentName={col.name}
                      assigneeColorKey={col.assigneeColorKey}
                      className="mt-0.5 size-8 text-xs"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-lg font-bold text-zinc-900 dark:text-zinc-100">{col.name}</p>
                      <p className="text-xs text-zinc-600 dark:text-zinc-500">
                        {col.role} · {col.teamLabel}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{col.cards.length}</span>
                </div>
                <div className="max-h-[56vh] space-y-2 overflow-y-auto pr-1">
                  {col.cards.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-500">
                      Drop tickets here to assign.
                    </div>
                  ) : (
                    col.cards.map((t) => (
                      <AssigneeColorHighlight
                        key={t.id}
                        assigneeColorKey={col.assigneeColorKey}
                        className="rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-[#101a2f]"
                      >
                      <div className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-mono text-[11px] text-zinc-600 dark:text-zinc-500">{t.ticketNumber}</p>
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", priorityPillClass(t.priority))}>
                            {t.priority}
                          </span>
                        </div>
                        <Link href={`/agent/tickets/${t.id}`} className="mt-1 block text-sm font-semibold text-zinc-900 hover:underline dark:text-zinc-100">
                        {cleanIssuePreview(t.description || t.title)}
                        </Link>
                      {extractDepartmentFromDescription(t.description) ? (
                        <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-500">
                          Request to Company/SBU: {extractDepartmentFromDescription(t.description)}
                        </p>
                      ) : null}
                        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-500">{formatRelativeAgo(t.updatedAt)}</p>
                      </div>
                      </AssigneeColorHighlight>
                    ))
                  )}
                </div>
              </article>
            ))
            )}
          </div>
            <SimplePaginationBar
              page={lanePage}
              pageSize={ASSIGNMENT_LANES_PAGE_SIZE}
              total={columns.length}
              onPageChange={setLanePage}
              itemLabel="personnel"
              className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-[#0b1220]"
            />
          </div>
        </section>
      </div>
    </main>
  );
}
