"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, GripVertical } from "lucide-react";
import { OrchestrationQueueNav } from "@/components/OrchestrationQueueNav";
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
  companyId: string | null;
  assigneeColorKey?: string | null;
  cards: TicketCard[];
};

type RosterCompany = { id: string; name: string };

const ASSIGNMENT_COMPANY_ALL = "ALL";
const ASSIGNMENT_NO_COMPANY = "__NO_COMPANY__";
const ASSIGNMENT_COMPANY_DROP_PREFIX = "__COMPANY__:";
const ASSIGNMENT_USER_DROP_PREFIX = "__USER__:";

function personnelCompanyKey(col: PersonnelColumn): string {
  return col.companyId ?? (col.teamLabel ? `name:${col.teamLabel.trim().toLowerCase()}` : ASSIGNMENT_NO_COMPANY);
}

function personnelRoleLabel(role: string): "Admin" | "Personnel" {
  return role === "Admin" ? "Admin" : "Personnel";
}

function sortPersonnelByRole(list: PersonnelColumn[]): PersonnelColumn[] {
  return [...list].sort((a, b) => {
    const roleDiff =
      (personnelRoleLabel(a.role) === "Admin" ? 0 : 1) - (personnelRoleLabel(b.role) === "Admin" ? 0 : 1);
    if (roleDiff !== 0) return roleDiff;
    return a.name.localeCompare(b.name);
  });
}

function assignmentCompanyDropTarget(companyId: string): string {
  return `${ASSIGNMENT_COMPANY_DROP_PREFIX}${companyId}`;
}

function assignmentCompanyIdFromTarget(target: string | null): string | null {
  if (!target?.startsWith(ASSIGNMENT_COMPANY_DROP_PREFIX)) return null;
  return target.slice(ASSIGNMENT_COMPANY_DROP_PREFIX.length);
}

function assignmentUserDropTarget(agentId: string): string {
  return `${ASSIGNMENT_USER_DROP_PREFIX}${agentId}`;
}

function assignmentUserIdFromTarget(target: string | null): string | null {
  if (!target?.startsWith(ASSIGNMENT_USER_DROP_PREFIX)) return null;
  return target.slice(ASSIGNMENT_USER_DROP_PREFIX.length);
}

export function ManualAssignmentBoard({
  unassigned,
  personnel,
  rosterCompanies = [],
  companyFilterLabel,
  notice,
}: {
  unassigned: TicketCard[];
  personnel: PersonnelColumn[];
  rosterCompanies?: RosterCompany[];
  companyFilterLabel?: string | null;
  notice?: string | null;
}) {
  const [cards, setCards] = useState<TicketCard[]>(unassigned);
  const [columns, setColumns] = useState<PersonnelColumn[]>(personnel);
  const [busyTicketId, setBusyTicketId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openCompanyId, setOpenCompanyId] = useState<string | null>(null);
  const [dragRevealCompanyId, setDragRevealCompanyId] = useState<string | null>(null);

  const allCount = useMemo(() => cards.length + columns.reduce((sum, c) => sum + c.cards.length, 0), [cards, columns]);

  useEffect(() => {
    queueMicrotask(() => {
      setCards(unassigned);
      setColumns(personnel);
    });
  }, [unassigned, personnel]);

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
    onDrop: (ticketId, targetId) => {
      setDragRevealCompanyId(null);
      const companyId = assignmentCompanyIdFromTarget(targetId);
      if (companyId) {
        setOpenCompanyId((current) => (current === companyId ? null : companyId));
        return;
      }
      const agentId = assignmentUserIdFromTarget(targetId);
      if (!agentId) return;
      const t = cards.find((x) => x.id === ticketId);
      if (t) void assign(t, agentId);
    },
    onHover: (targetId) => {
      const companyId = assignmentCompanyIdFromTarget(targetId);
      if (companyId) {
        setDragRevealCompanyId((prev) => (prev === companyId ? prev : companyId));
        return;
      }
      const agentId = assignmentUserIdFromTarget(targetId);
      if (agentId) {
        const col = columns.find((c) => c.agentId === agentId);
        if (col) {
          const userCompanyId = personnelCompanyKey(col);
          setDragRevealCompanyId((prev) => (prev === userCompanyId ? prev : userCompanyId));
          return;
        }
      }
      setDragRevealCompanyId(null);
    },
    onDragEnd: () => setDragRevealCompanyId(null),
    disabled: busyTicketId != null,
    activationDistance: 12,
  });

  const columnsByCompany = useMemo(() => {
    const grouped = new Map<string, PersonnelColumn[]>();
    for (const col of columns) {
      const key = personnelCompanyKey(col);
      const list = grouped.get(key);
      if (list) list.push(col);
      else grouped.set(key, [col]);
    }
    for (const [key, list] of grouped) {
      grouped.set(key, sortPersonnelByRole(list));
    }
    return grouped;
  }, [columns]);

  const companyOptions = useMemo(() => {
    const nameByCompany = new Map<string, string>();
    const rosterIds = new Set(rosterCompanies.map((c) => c.id));
    for (const company of rosterCompanies) {
      nameByCompany.set(company.id, company.name);
    }
    const options: Array<{ id: string; name: string; agentCount: number }> = [];
    for (const [id, cols] of columnsByCompany) {
      if (id === ASSIGNMENT_NO_COMPANY) continue;
      const agentCount = cols.length;
      if (agentCount === 0) continue;
      const name = nameByCompany.get(id) ?? cols[0]?.teamLabel ?? "Unknown company";
      if (rosterIds.size > 0 && !rosterIds.has(id) && !id.startsWith("name:")) continue;
      options.push({ id, name, agentCount });
    }
    return options.sort((a, b) => {
      const rosterA = rosterCompanies.findIndex((c) => c.id === a.id);
      const rosterB = rosterCompanies.findIndex((c) => c.id === b.id);
      if (rosterA !== -1 || rosterB !== -1) {
        const orderA = rosterA === -1 ? Number.MAX_SAFE_INTEGER : rosterA;
        const orderB = rosterB === -1 ? Number.MAX_SAFE_INTEGER : rosterB;
        return orderA - orderB;
      }
      return a.name.localeCompare(b.name);
    });
  }, [columnsByCompany, rosterCompanies]);

  const activeCompanyId =
    dragRevealCompanyId ?? (!laneDrag.draggingItemId && openCompanyId !== ASSIGNMENT_COMPANY_ALL ? openCompanyId : null);

  function renderTicketCard(t: TicketCard, assigneeColorKey?: string | null, compact?: boolean) {
    const inner = (
      <>
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-[11px] text-zinc-600 dark:text-zinc-500">{t.ticketNumber}</p>
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", priorityPillClass(t.priority))}>
            {t.priority}
          </span>
        </div>
        <Link
          href={`/agent/tickets/${t.id}`}
          className={cn(
            "mt-1 block font-semibold text-zinc-900 hover:underline dark:text-zinc-100",
            compact ? "text-sm" : "text-base line-clamp-2",
          )}
        >
          {cleanIssuePreview(t.description || t.title)}
        </Link>
        {extractDepartmentFromDescription(t.description) ? (
          <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-500">
            Request to Company/SBU: {extractDepartmentFromDescription(t.description)}
          </p>
        ) : null}
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-500">{formatRelativeAgo(t.updatedAt)}</p>
      </>
    );

    if (assigneeColorKey) {
      return (
        <AssigneeColorHighlight
          key={t.id}
          assigneeColorKey={assigneeColorKey}
          className="rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-[#101a2f]"
        >
          <div className="p-3">{inner}</div>
        </AssigneeColorHighlight>
      );
    }

    return inner;
  }

  return (
    <main className="min-h-[calc(100dvh-56px)] bg-zinc-50 px-2 py-4 text-zinc-900 sm:px-4 sm:py-8 dark:bg-[#070d19] dark:text-zinc-100">
      <div className="mx-auto max-w-[1500px] space-y-4 sm:space-y-5">
        <PointerDragGhostLayer ghost={laneDrag.ghost} />
        <OrchestrationQueueNav />
        <header className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)] sm:p-6 dark:border-zinc-800/90 dark:bg-gradient-to-b dark:from-[#0d1629] dark:to-[#0b1220] dark:shadow-[0_16px_45px_rgba(0,0,0,0.35)]">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-400/95">
            {BRAND_TITLE} · Manual assignment
          </p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl md:text-4xl dark:text-white">
            Assignment Board
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            Move tickets from the unassigned pool onto staff (hold and slide on touch, or drag with a mouse). Active
            pipeline cards:{" "}
            <span className="font-semibold text-orange-700 dark:text-orange-300">{allCount}</span>.
          </p>
          <p className="mt-1 hidden text-xs text-zinc-500 sm:block dark:text-zinc-400">
            Drag over a company to open its roster, then release over an admin or personnel member.
          </p>
          {companyFilterLabel ? (
            <p className="mt-2 text-xs font-semibold text-orange-700 dark:text-orange-300">
              Locked to your company/SBU: {companyFilterLabel}
            </p>
          ) : null}
          {notice ? (
            <p className="mt-3 rounded-lg border border-amber-400/40 bg-amber-100/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100">
              {notice}
            </p>
          ) : null}
        </header>

        {error ? (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-200">
            {error}
          </p>
        ) : null}

        <section className="grid gap-3 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] xl:grid-cols-[1fr_2fr] xl:gap-4">
          <article className="rounded-2xl border border-zinc-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-[#0b1220] sm:p-3 xl:sticky xl:top-4 xl:self-start">
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-800 dark:text-zinc-200">
                Unassigned pool
              </h2>
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800 dark:bg-orange-500/20 dark:text-orange-200">
                {cards.length}
              </span>
            </div>
            <div className="max-h-[38dvh] space-y-2 overflow-y-auto overflow-x-hidden pr-1 sm:max-h-[70vh]">
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
                      <div className="min-w-0 flex-1">{renderTicketCard(t)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>

          <div className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-[#0b1220] sm:p-3">
            <div className="mb-2 px-1">
              <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-800 dark:text-zinc-200">
                Personnel group
              </h2>
              <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                Tap a company to expand, or drag a ticket over it to reveal admins and personnel.
              </p>
            </div>

            {columns.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 px-4 py-12 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
                No personnel — designate staff to a company/SBU in Personnel (Portal Accounts).
              </div>
            ) : companyOptions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 px-4 py-12 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
                No personnel with a designated company/SBU.
              </div>
            ) : (
              <div className="max-h-[min(72dvh,48rem)] space-y-2 overflow-y-auto pr-1">
                {companyOptions.map((company) => {
                  const targetId = assignmentCompanyDropTarget(company.id);
                  const isSelected = openCompanyId === company.id;
                  const isRevealed = activeCompanyId === company.id;
                  const companyColumns = columnsByCompany.get(company.id) ?? [];
                  const adminColumns = companyColumns.filter((c) => personnelRoleLabel(c.role) === "Admin");
                  const personnelColumns = companyColumns.filter((c) => personnelRoleLabel(c.role) === "Personnel");

                  return (
                    <div
                      key={`company-drop-${company.id}`}
                      ref={laneDrag.registerColumn(targetId)}
                      className={cn(
                        "touch-pan-y rounded-xl border border-zinc-200 bg-zinc-50/80 p-2 transition dark:border-zinc-700 dark:bg-zinc-900/40",
                        isSelected && "border-orange-300 bg-orange-50/70 dark:border-orange-800/70 dark:bg-orange-950/20",
                        isRevealed && "ring-2 ring-orange-500/60 ring-offset-2 ring-offset-white dark:ring-offset-zinc-950",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setOpenCompanyId((current) => (current === company.id ? null : company.id))}
                        aria-pressed={isSelected}
                        aria-expanded={isRevealed}
                        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-1 text-left"
                      >
                        <span className="min-w-0 truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
                          {company.name}
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                            {company.agentCount}
                          </span>
                          <ChevronDown
                            className={cn(
                              "size-4 text-zinc-500 transition-transform dark:text-zinc-400",
                              isRevealed && "rotate-180",
                            )}
                            aria-hidden
                          />
                        </span>
                      </button>

                      {isRevealed ? (
                        <div className="mt-2 space-y-3 rounded-lg border border-orange-200 bg-white p-2 shadow-sm dark:border-orange-900/60 dark:bg-zinc-950">
                          {[
                            { label: "Admins", list: adminColumns },
                            { label: "Personnel", list: personnelColumns },
                          ].map((group) =>
                            group.list.length > 0 ? (
                              <div key={`${company.id}-${group.label}`} className="space-y-2">
                                <p className="px-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                                  {group.label}
                                </p>
                                {group.list.map((col) => {
                                  const userTargetId = assignmentUserDropTarget(col.agentId);
                                  const isUserHovered = laneDrag.hoverColumn === userTargetId;
                                  return (
                                    <article
                                      key={col.agentId}
                                      ref={laneDrag.registerColumn(userTargetId)}
                                      className={cn(
                                        "rounded-xl border border-zinc-200 bg-zinc-50/90 p-2 transition dark:border-zinc-700 dark:bg-[#101a2f]",
                                        isUserHovered &&
                                          "ring-2 ring-orange-500/65 ring-offset-2 ring-offset-white dark:ring-offset-zinc-950",
                                      )}
                                    >
                                      <div className="mb-2 flex items-start justify-between gap-2">
                                        <div className="flex min-w-0 items-start gap-2">
                                          <AssigneeInitialsBadge
                                            agentName={col.name}
                                            assigneeColorKey={col.assigneeColorKey}
                                            className="mt-0.5 size-8 text-xs"
                                          />
                                          <div className="min-w-0">
                                            <p className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                              {col.name}
                                            </p>
                                            <p className="text-[11px] text-zinc-600 dark:text-zinc-500">{col.role}</p>
                                          </div>
                                        </div>
                                        <span className="shrink-0 rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                                          {col.cards.length}
                                        </span>
                                      </div>
                                      <div className="max-h-40 space-y-1.5 overflow-y-auto pr-0.5">
                                        {col.cards.length === 0 ? (
                                          <div className="rounded-lg border border-dashed border-zinc-300 px-3 py-4 text-center text-[11px] text-zinc-600 dark:border-zinc-700 dark:text-zinc-500">
                                            Drop tickets here to assign.
                                          </div>
                                        ) : (
                                          col.cards.map((t) => renderTicketCard(t, col.assigneeColorKey, true))
                                        )}
                                      </div>
                                    </article>
                                  );
                                })}
                              </div>
                            ) : null,
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
