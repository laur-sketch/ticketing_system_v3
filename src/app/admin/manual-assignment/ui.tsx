"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, GripVertical, UserPlus, X } from "lucide-react";
import { OrchestrationQueueNav } from "@/components/OrchestrationQueueNav";
import { AssigneeColorHighlight } from "@/components/ticket/AssigneeColorHighlight";
import { AssigneeInitialsBadge } from "@/components/ticket/AssigneeInitialsBadge";
import { authInputClass, authLabelClass } from "@/components/auth/AuthShell";
import { cn } from "@/lib/cn";
import { PointerDragGhostLayer, usePointerColumnDrag } from "@/lib/pointer-column-drag";
import { BRAND_TITLE } from "@/lib/brand";
import { extractPaymentBoardPreview } from "@/lib/request-for-payment";
import { parseItemRequisitionDescription } from "@/lib/item-requisition";
import { extractFundTransferPreview } from "@/lib/fund-transfer-request";
import { extractJobOrderPreview } from "@/lib/job-order";
import { requestTypeAcronym, requestTypeLabel } from "@/lib/request-types";
import { orgChartSectionOptionText } from "@/lib/org-chart-section-display";
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
  /** Intake request type id — same as ticket board (ISSUE_CONCERN_TICKET, REQUEST_FOR_PAYMENT, …). */
  requestType?: string | null;
  sendToSectionId?: string | null;
  sendToSectionName?: string | null;
  requestorSectionId?: string | null;
  requestorSectionName?: string | null;
};

const ASSIGNMENT_UNSECTIONED = "__unsectioned__";

/** Match ticket-board card title (RFP → in payment of + amount; IRS/FTR → purpose; otherwise cleaned description/title). */
function assignmentCardPreview(ticket: TicketCard): string {
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
  return cleanIssuePreview(ticket.description || ticket.title);
}

type PersonnelColumn = {
  agentId: string;
  name: string;
  role: string;
  teamLabel: string;
  companyId: string | null;
  sectionId: string | null;
  sectionName: string | null;
  assigneeColorKey?: string | null;
  cards: TicketCard[];
};

type RosterSection = { id: string; name: string; depth: number };

const ASSIGNMENT_SECTION_ALL = "ALL";
const ASSIGNMENT_SECTION_DROP_PREFIX = "__SECTION__:";
const ASSIGNMENT_USER_DROP_PREFIX = "__USER__:";

function personnelSectionKey(col: PersonnelColumn): string {
  return col.sectionId?.trim() || ASSIGNMENT_UNSECTIONED;
}

function personnelRoleLabel(role: string): "Admin" | "Personnel" {
  return role === "Admin" ? "Admin" : "Personnel";
}

function sortPersonnelByRole(list: PersonnelColumn[]): PersonnelColumn[] {
  return [...list].sort((a, b) => {
    const roleCmp = personnelRoleLabel(a.role).localeCompare(personnelRoleLabel(b.role));
    if (roleCmp !== 0) return roleCmp;
    return a.name.localeCompare(b.name);
  });
}

function matchesAssignmentPersonnelSearch(col: PersonnelColumn, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    col.name.toLowerCase().includes(q) ||
    col.role.toLowerCase().includes(q) ||
    (col.teamLabel ?? "").toLowerCase().includes(q) ||
    (col.sectionName ?? "").toLowerCase().includes(q)
  );
}

function assignmentSectionDropTarget(sectionId: string): string {
  return `${ASSIGNMENT_SECTION_DROP_PREFIX}${sectionId}`;
}

function assignmentSectionIdFromTarget(target: string | null): string | null {
  if (!target?.startsWith(ASSIGNMENT_SECTION_DROP_PREFIX)) return null;
  return target.slice(ASSIGNMENT_SECTION_DROP_PREFIX.length);
}

function assignmentUserDropTarget(agentId: string): string {
  return `${ASSIGNMENT_USER_DROP_PREFIX}${agentId}`;
}

function assignmentUserIdFromTarget(target: string | null): string | null {
  if (!target?.startsWith(ASSIGNMENT_USER_DROP_PREFIX)) return null;
  return target.slice(ASSIGNMENT_USER_DROP_PREFIX.length);
}

const personnelSearchInputClass = cn(authInputClass, "min-w-[12rem] py-1.5 text-xs sm:min-w-[14rem]");

export function ManualAssignmentBoard({
  unassigned,
  personnel,
  rosterSections = [],
  notice,
}: {
  unassigned: TicketCard[];
  personnel: PersonnelColumn[];
  rosterSections?: RosterSection[];
  notice?: string | null;
}) {
  const [cards, setCards] = useState<TicketCard[]>(unassigned);
  const [columns, setColumns] = useState<PersonnelColumn[]>(personnel);
  const [busyTicketId, setBusyTicketId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openSectionId, setOpenSectionId] = useState<string | null>(null);
  const [dragRevealSectionId, setDragRevealSectionId] = useState<string | null>(null);
  const [sectionFilter, setSectionFilter] = useState<string>(ASSIGNMENT_SECTION_ALL);
  const [personnelSearchQuery, setPersonnelSearchQuery] = useState("");
  const [assignTicket, setAssignTicket] = useState<TicketCard | null>(null);
  const [sheetSearch, setSheetSearch] = useState("");
  const [sheetSection, setSheetSection] = useState<string>(ASSIGNMENT_SECTION_ALL);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setPortalReady(true));
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      setCards(unassigned);
      setColumns(personnel);
    });
  }, [unassigned, personnel]);

  useEffect(() => {
    if (!assignTicket) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [assignTicket]);

  const sectionScopedColumns = useMemo(() => {
    if (sectionFilter === ASSIGNMENT_SECTION_ALL) return columns;
    return columns.filter((col) => personnelSectionKey(col) === sectionFilter);
  }, [columns, sectionFilter]);

  const filteredColumns = useMemo(
    () =>
      sectionScopedColumns.filter((col) =>
        matchesAssignmentPersonnelSearch(col, personnelSearchQuery),
      ),
    [sectionScopedColumns, personnelSearchQuery],
  );
  const personnelSearchActive = Boolean(personnelSearchQuery.trim());

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
        setError(data.error ?? "Could not assign request.");
        return false;
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
      setAssignTicket(null);
      setSheetSearch("");
      setSheetSection(ASSIGNMENT_SECTION_ALL);
      return true;
    } finally {
      setBusyTicketId(null);
    }
  }

  const laneDrag = usePointerColumnDrag<string>({
    onDrop: (ticketId, targetId) => {
      setDragRevealSectionId(null);
      const sectionId = assignmentSectionIdFromTarget(targetId);
      if (sectionId) {
        setOpenSectionId((current) => (current === sectionId ? null : sectionId));
        return;
      }
      const agentId = assignmentUserIdFromTarget(targetId);
      if (!agentId) return;
      const t = cards.find((x) => x.id === ticketId);
      if (t) void assign(t, agentId);
    },
    onHover: (targetId) => {
      const sectionId = assignmentSectionIdFromTarget(targetId);
      if (sectionId) {
        setDragRevealSectionId((prev) => (prev === sectionId ? prev : sectionId));
        return;
      }
      const agentId = assignmentUserIdFromTarget(targetId);
      if (agentId) {
        const col = columns.find((c) => c.agentId === agentId);
        if (col) {
          const key = personnelSectionKey(col);
          setDragRevealSectionId((prev) => (prev === key ? prev : key));
          return;
        }
      }
      setDragRevealSectionId(null);
    },
    onDragEnd: () => setDragRevealSectionId(null),
    disabled: busyTicketId != null,
    activationDistance: 12,
  });

  const columnsBySection = useMemo(() => {
    const grouped = new Map<string, PersonnelColumn[]>();
    for (const col of filteredColumns) {
      const key = personnelSectionKey(col);
      const list = grouped.get(key);
      if (list) list.push(col);
      else grouped.set(key, [col]);
    }
    for (const [key, list] of grouped) {
      grouped.set(key, sortPersonnelByRole(list));
    }
    return grouped;
  }, [filteredColumns]);

  const sectionOrderIndex = useMemo(
    () => new Map(rosterSections.map((s, i) => [s.id, i])),
    [rosterSections],
  );

  const sectionOptions = useMemo(() => {
    const nameById = new Map(rosterSections.map((s) => [s.id, s.name]));
    const depthById = new Map(rosterSections.map((s) => [s.id, s.depth]));
    const options: Array<{ id: string; name: string; depth: number; agentCount: number }> = [];
    for (const [id, cols] of columnsBySection) {
      if (cols.length === 0) continue;
      if (id === ASSIGNMENT_UNSECTIONED) {
        options.push({ id, name: "Unsectioned", depth: 0, agentCount: cols.length });
        continue;
      }
      options.push({
        id,
        name: nameById.get(id) ?? cols[0]?.sectionName ?? "Unknown section",
        depth: depthById.get(id) ?? 0,
        agentCount: cols.length,
      });
    }
    return options.sort((a, b) => {
      if (a.id === ASSIGNMENT_UNSECTIONED) return 1;
      if (b.id === ASSIGNMENT_UNSECTIONED) return -1;
      const orderA = sectionOrderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const orderB = sectionOrderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });
  }, [columnsBySection, rosterSections, sectionOrderIndex]);

  const sectionFilterOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const col of columns) {
      const key = personnelSectionKey(col);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const nameById = new Map(rosterSections.map((s) => [s.id, s.name]));
    const depthById = new Map(rosterSections.map((s) => [s.id, s.depth]));
    const options: Array<{ id: string; name: string; depth: number; agentCount: number }> = [];
    for (const [id, agentCount] of counts) {
      if (id === ASSIGNMENT_UNSECTIONED) {
        options.push({ id, name: "Unsectioned", depth: 0, agentCount });
        continue;
      }
      options.push({
        id,
        name: nameById.get(id) ?? "Unknown section",
        depth: depthById.get(id) ?? 0,
        agentCount,
      });
    }
    return options.sort((a, b) => {
      if (a.id === ASSIGNMENT_UNSECTIONED) return 1;
      if (b.id === ASSIGNMENT_UNSECTIONED) return -1;
      const orderA = sectionOrderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const orderB = sectionOrderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });
  }, [columns, rosterSections, sectionOrderIndex]);

  const activeSectionId =
    dragRevealSectionId ??
    (!laneDrag.draggingItemId && openSectionId !== null ? openSectionId : null);

  function handleSectionFilterChange(next: string) {
    setSectionFilter(next);
    setOpenSectionId(next === ASSIGNMENT_SECTION_ALL ? null : next);
  }

  function openAssignSheet(ticket: TicketCard) {
    setAssignTicket(ticket);
    setSheetSearch("");
    setSheetSection(
      sectionFilter === ASSIGNMENT_SECTION_ALL ? ASSIGNMENT_SECTION_ALL : sectionFilter,
    );
    setError(null);
  }

  const sheetPeople = useMemo(() => {
    let list = columns.filter((col) => matchesAssignmentPersonnelSearch(col, sheetSearch));
    if (sheetSection !== ASSIGNMENT_SECTION_ALL) {
      list = list.filter((col) => personnelSectionKey(col) === sheetSection);
    }
    return sortPersonnelByRole(list);
  }, [columns, sheetSearch, sheetSection]);

  function renderTicketCard(t: TicketCard, assigneeColorKey?: string | null, compact?: boolean) {
    const preview = assignmentCardPreview(t);
    const inner = (
      <>
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-[11px] text-zinc-600 dark:text-zinc-500">{t.ticketNumber}</p>
          <div className="flex flex-wrap items-center justify-end gap-1">
            <span
              className="rounded-full border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
              title={requestTypeLabel(t.requestType)}
            >
              {requestTypeAcronym(t.requestType)}
            </span>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", priorityPillClass(t.priority))}>
              {t.priority}
            </span>
          </div>
        </div>
        <Link
          href={`/agent/tickets/${t.id}`}
          className={cn(
            "mt-1 block font-semibold text-zinc-900 hover:underline dark:text-zinc-100",
            compact ? "text-sm" : "text-base line-clamp-2",
          )}
        >
          {preview}
        </Link>
        {(t.requestorSectionName || t.sendToSectionName) ? (
          <p className="mt-1 space-y-0.5 text-[11px] text-zinc-600 dark:text-zinc-500">
            {t.requestorSectionName ? (
              <span className="block truncate" title={t.requestorSectionName}>
                From: {t.requestorSectionName}
              </span>
            ) : null}
            {t.sendToSectionName ? (
              <span className="block truncate" title={t.sendToSectionName}>
                To: {t.sendToSectionName}
              </span>
            ) : null}
          </p>
        ) : extractDepartmentFromDescription(t.description) ? (
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

    return (
      <div
        key={t.id}
        className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-[#101a2f]"
      >
        {inner}
      </div>
    );
  }

  return (
    <main className="min-h-[calc(100dvh-56px)] bg-zinc-50 px-2 py-4 text-zinc-900 sm:px-4 sm:py-8 dark:bg-[#070d19] dark:text-zinc-100">
      <div className="mx-auto max-w-[1500px] space-y-4 sm:space-y-5">
        <PointerDragGhostLayer ghost={laneDrag.ghost} />
        {portalReady && assignTicket
          ? createPortal(
              <div className="fixed inset-0 z-[220] flex flex-col justify-end md:hidden">
                <button
                  type="button"
                  className="absolute inset-0 bg-zinc-950/60 backdrop-blur-[1px]"
                  aria-label="Close assign sheet"
                  onClick={() => setAssignTicket(null)}
                />
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-label="Assign request"
                  className="relative z-10 flex max-h-[85dvh] flex-col rounded-t-2xl border border-zinc-700 bg-zinc-950 pb-[max(1rem,env(safe-area-inset-bottom,0px))] shadow-2xl"
                >
                  <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-400">Assign to</p>
                      <p className="mt-0.5 truncate font-mono text-xs text-zinc-400">{assignTicket.ticketNumber}</p>
                      <p className="mt-1 line-clamp-2 text-sm font-semibold text-zinc-100">
                        {assignmentCardPreview(assignTicket)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAssignTicket(null)}
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-zinc-700 text-zinc-300"
                      aria-label="Close"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="space-y-2 border-b border-zinc-800 px-4 py-3">
                    {sectionFilterOptions.length > 0 ? (
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Section</span>
                        <select
                          value={sheetSection}
                          onChange={(e) => setSheetSection(e.target.value)}
                          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100"
                        >
                          <option value={ASSIGNMENT_SECTION_ALL}>All sections</option>
                          {sectionFilterOptions.map((s) => (
                            <option key={s.id} value={s.id}>
                              {orgChartSectionOptionText(s)} ({s.agentCount})
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Search person</span>
                      <input
                        type="search"
                        value={sheetSearch}
                        onChange={(e) => setSheetSearch(e.target.value)}
                        placeholder="Name…"
                        autoComplete="off"
                        className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500"
                      />
                    </label>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                    {sheetPeople.length === 0 ? (
                      <p className="px-2 py-8 text-center text-sm text-zinc-500">No matching people.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {sheetPeople.map((col) => (
                          <li key={col.agentId}>
                            <button
                              type="button"
                              disabled={busyTicketId === assignTicket.id}
                              onClick={() => void assign(assignTicket, col.agentId)}
                              className="flex w-full items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-3 text-left transition hover:border-orange-500/40 hover:bg-orange-500/10 disabled:opacity-50"
                            >
                              <AssigneeInitialsBadge
                                agentName={col.name}
                                assigneeColorKey={col.assigneeColorKey}
                                className="size-9 shrink-0 text-xs"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-zinc-100">{col.name}</p>
                                <p className="truncate text-[11px] text-zinc-500">
                                  {col.role}
                                  {col.teamLabel ? ` · ${col.teamLabel}` : ""}
                                </p>
                              </div>
                              <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-zinc-300">
                                {col.cards.length}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>,
              document.body,
            )
          : null}
        <OrchestrationQueueNav />
        <header className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)] sm:p-6 dark:border-zinc-800/90 dark:bg-gradient-to-b dark:from-[#0d1629] dark:to-[#0b1220] dark:shadow-[0_16px_45px_rgba(0,0,0,0.35)]">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-400/95">
            {BRAND_TITLE} · Manual assignment
          </p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl md:text-4xl dark:text-white">
            Assign Requests
          </h1>
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
            <p className="mb-2 px-1 text-[11px] text-zinc-500 md:hidden">
              Tap <span className="font-semibold text-orange-600 dark:text-orange-300">Assign</span> on a
              request, then choose a person.
            </p>
            <div className="max-h-[38dvh] space-y-2 overflow-y-auto overflow-x-hidden pr-1 sm:max-h-[70vh]">
              {cards.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-500">
                  No unassigned requests.
                </div>
              ) : (
                cards.map((t) => (
                  <div
                    key={t.id}
                    {...laneDrag.getCardPointerProps(t.id, {
                      getLabel: () =>
                        `${t.ticketNumber} · ${assignmentCardPreview(t).slice(0, 72)}`,
                    })}
                    className={cn(
                      "touch-pan-y select-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 shadow-sm dark:border-zinc-700 dark:bg-[#101a2f]",
                      busyTicketId === t.id && "pointer-events-none opacity-50",
                      laneDrag.draggingItemId === t.id && "opacity-60 ring-1 ring-orange-400/40",
                    )}
                  >
                    <div className="flex gap-2">
                      <GripVertical
                        className="mt-0.5 hidden size-4 shrink-0 text-zinc-400 md:block dark:text-zinc-500"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        {renderTicketCard(t)}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openAssignSheet(t);
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-orange-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-orange-500 md:hidden"
                        >
                          <UserPlus size={14} aria-hidden />
                          Assign
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>

          <div className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-[#0b1220] sm:p-3">
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2 px-1">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-800 dark:text-zinc-200">
                  Personnel by section
                </h2>
                <p className="mt-0.5 hidden text-[11px] text-zinc-500 md:block dark:text-zinc-400">
                  Tap a section to expand, or drag a request over it to reveal admins and personnel.
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-500 md:hidden dark:text-zinc-400">
                  Browse people here, or use Assign on a request card.
                </p>
              </div>
              {sectionFilterOptions.length > 0 ? (
                <label className="flex items-center gap-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  <span className="uppercase tracking-wide">Section</span>
                  <select
                    value={sectionFilter}
                    onChange={(e) => handleSectionFilterChange(e.target.value)}
                    className={cn(
                      "min-w-[200px] max-w-[300px] rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
                      "focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/30",
                    )}
                    title="Narrow personnel to one org-chart section"
                  >
                    <option value={ASSIGNMENT_SECTION_ALL}>All sections</option>
                    {sectionFilterOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {orgChartSectionOptionText(s)} ({s.agentCount})
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            <div className="mb-3 flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-3 dark:border-zinc-800/90 dark:bg-zinc-900/40 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="flex min-w-[12rem] flex-1 flex-col gap-1 sm:max-w-xs">
                <span className={authLabelClass}>Search by name</span>
                <input
                  type="search"
                  value={personnelSearchQuery}
                  onChange={(e) => setPersonnelSearchQuery(e.target.value)}
                  placeholder="Name…"
                  className={personnelSearchInputClass}
                  autoComplete="off"
                  aria-label="Search personnel by name"
                />
              </label>
              <p className="w-full text-[11px] text-zinc-500 dark:text-zinc-500 sm:ml-auto sm:w-auto sm:text-right">
                {personnelSearchActive
                  ? `Showing ${filteredColumns.length} of ${sectionScopedColumns.length} user${sectionScopedColumns.length === 1 ? "" : "s"}`
                  : `${filteredColumns.length} user${filteredColumns.length === 1 ? "" : "s"}`}
              </p>
            </div>

            {columns.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 px-4 py-12 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
                No personnel — designate staff to a company/SBU in Personnel (Portal Accounts).
              </div>
            ) : filteredColumns.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 px-4 py-12 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
                No users match the current filters.
              </div>
            ) : sectionOptions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 px-4 py-12 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
                No personnel sections to show.
              </div>
            ) : (
              <div className="max-h-[min(72dvh,48rem)] space-y-2 overflow-y-auto pr-1">
                {sectionOptions.map((section) => {
                  const targetId = assignmentSectionDropTarget(section.id);
                  const isSelected = openSectionId === section.id;
                  const isRevealed =
                    activeSectionId === section.id ||
                    (personnelSearchActive && !laneDrag.draggingItemId);
                  const showRevealRing = activeSectionId === section.id;
                  const sectionColumns = columnsBySection.get(section.id) ?? [];
                  const adminColumns = sectionColumns.filter(
                    (c) => personnelRoleLabel(c.role) === "Admin",
                  );
                  const personnelColumns = sectionColumns.filter(
                    (c) => personnelRoleLabel(c.role) === "Personnel",
                  );

                  return (
                    <div
                      key={`section-drop-${section.id}`}
                      ref={laneDrag.registerColumn(targetId)}
                      className={cn(
                        "touch-pan-y rounded-xl border border-zinc-200 bg-zinc-50/80 p-2 transition dark:border-zinc-700 dark:bg-zinc-900/40",
                        isSelected &&
                          "border-orange-300 bg-orange-50/70 dark:border-orange-800/70 dark:bg-orange-950/20",
                        showRevealRing &&
                          "ring-2 ring-orange-500/60 ring-offset-2 ring-offset-white dark:ring-offset-zinc-950",
                      )}
                      style={
                        section.depth > 0
                          ? { marginLeft: `${Math.min(section.depth, 4) * 12}px` }
                          : undefined
                      }
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setOpenSectionId((current) =>
                            current === section.id ? null : section.id,
                          )
                        }
                        aria-pressed={isSelected}
                        aria-expanded={isRevealed}
                        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-1 text-left"
                      >
                        <span className="min-w-0 truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
                          {section.name}
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                            {section.agentCount}
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
                              <div key={`${section.id}-${group.label}`} className="space-y-2">
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
                                            <p className="text-[11px] text-zinc-600 dark:text-zinc-500">
                                              {col.role}
                                              {col.teamLabel ? ` · ${col.teamLabel}` : ""}
                                            </p>
                                          </div>
                                        </div>
                                        <span className="shrink-0 rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                                          {col.cards.length}
                                        </span>
                                      </div>
                                      <div className="max-h-40 space-y-1.5 overflow-y-auto pr-0.5">
                                        {col.cards.length === 0 ? (
                                          <div className="rounded-lg border border-dashed border-zinc-300 px-3 py-4 text-center text-[11px] text-zinc-600 dark:border-zinc-700 dark:text-zinc-500">
                                            Drop requests here to assign.
                                          </div>
                                        ) : (
                                          col.cards.map((t) =>
                                            renderTicketCard(t, col.assigneeColorKey, true),
                                          )
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
