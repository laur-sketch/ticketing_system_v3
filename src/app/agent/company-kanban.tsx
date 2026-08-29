"use client";

import type { TicketPriority } from "@prisma/client/primary";
import { ChevronRight, GripVertical } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { AgentTicketDeepLink } from "@/components/AgentTicketDeepLink";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CompanyBoardColumn, CompanyTicketCard } from "@/lib/company-board";
import { companyLogoApiPath } from "@/lib/company-logo-url";
import { cn } from "@/lib/cn";
import { priorityPillClass } from "@/lib/ticket-board-formatters";
import { formatCompanyBoardStatusLabel } from "@/lib/ticket-status-label";

const PRIORITY_ORDER: TicketPriority[] = ["URGENT", "HIGH", "MEDIUM", "LOW", "UNSET"];

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  URGENT: "Urgent",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  UNSET: "Set priority",
};

const CARD_ORDER_STORAGE_KEY = "company-board-card-order-v2";
const LEGACY_CARD_ORDER_STORAGE_KEY = "company-board-card-order-v1";
const DRAG_MIME = "application/x-company-board-team-id";

type PriorityModalState = {
  companyName: string;
  priority: TicketPriority;
  tickets: CompanyTicketCard[];
};

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

const TICKETS_PAGE_SIZE = 15;

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

function ticketsByPriority(tickets: CompanyTicketCard[]): Partial<Record<TicketPriority, CompanyTicketCard[]>> {
  const grouped: Partial<Record<TicketPriority, CompanyTicketCard[]>> = {};
  for (const ticket of tickets) {
    const list = grouped[ticket.priority] ?? [];
    list.push(ticket);
    grouped[ticket.priority] = list;
  }
  return grouped;
}

function companyInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function mergeOrderWithColumns(orderIds: string[], columnIds: string[]): string[] {
  return [
    ...orderIds.filter((id) => columnIds.includes(id)),
    ...columnIds.filter((id) => !orderIds.includes(id)),
  ];
}

function sameOrder(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
}

function readStoredSavedOrder(): string[] {
  try {
    const raw = localStorage.getItem(CARD_ORDER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
      }
      if (parsed && typeof parsed === "object" && Array.isArray((parsed as { saved?: unknown }).saved)) {
        return ((parsed as { saved: unknown[] }).saved).filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0,
        );
      }
    }
    // Migrate legacy plain-array key once.
    const legacy = localStorage.getItem(LEGACY_CARD_ORDER_STORAGE_KEY);
    if (!legacy) return [];
    const parsedLegacy = JSON.parse(legacy) as unknown;
    if (!Array.isArray(parsedLegacy)) return [];
    return parsedLegacy.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
  } catch {
    return [];
  }
}

function writeStoredSavedOrder(ids: string[]) {
  try {
    localStorage.setItem(CARD_ORDER_STORAGE_KEY, JSON.stringify({ saved: ids }));
    localStorage.removeItem(LEGACY_CARD_ORDER_STORAGE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

function applyCardOrder(columns: CompanyBoardColumn[], orderIds: string[]): CompanyBoardColumn[] {
  if (orderIds.length === 0) return columns;
  const byId = new Map(columns.map((c) => [c.teamId, c]));
  const ordered: CompanyBoardColumn[] = [];
  for (const id of orderIds) {
    const col = byId.get(id);
    if (!col) continue;
    ordered.push(col);
    byId.delete(id);
  }
  for (const col of columns) {
    if (byId.has(col.teamId)) ordered.push(col);
  }
  return ordered;
}

function moveTeamId(order: string[], fromId: string, toId: string): string[] {
  if (fromId === toId) return order;
  const next = [...order];
  const fromIdx = next.indexOf(fromId);
  const toIdx = next.indexOf(toId);
  if (fromIdx < 0 || toIdx < 0) return order;
  next.splice(fromIdx, 1);
  next.splice(toIdx, 0, fromId);
  return next;
}

export function CompanyKanban({
  columns,
  refreshSeconds = 30,
}: {
  columns: CompanyBoardColumn[];
  refreshSeconds?: number;
}) {
  const router = useRouter();
  const [modalState, setModalState] = useState<PriorityModalState | null>(null);
  const [savedOrderIds, setSavedOrderIds] = useState<string[]>([]);
  const [draftOrderIds, setDraftOrderIds] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [orderReady, setOrderReady] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  useEffect(() => {
    if (refreshSeconds <= 0) return;
    const id = window.setInterval(() => {
      router.refresh();
    }, refreshSeconds * 1000);
    return () => window.clearInterval(id);
  }, [router, refreshSeconds]);

  useEffect(() => {
    const columnIds = columns.map((c) => c.teamId);
    const stored = readStoredSavedOrder();
    const merged = mergeOrderWithColumns(stored.length > 0 ? stored : columnIds, columnIds);
    setSavedOrderIds(merged);
    setDraftOrderIds((prev) => {
      if (!editing || prev.length === 0) return merged;
      return mergeOrderWithColumns(prev, columnIds);
    });
    setOrderReady(true);
  }, [columns, editing]);

  const activeOrderIds = editing ? draftOrderIds : savedOrderIds;

  const orderedColumns = useMemo(() => {
    if (!orderReady) return columns;
    return applyCardOrder(columns, activeOrderIds);
  }, [columns, activeOrderIds, orderReady]);

  const hasUnsavedDraft = editing && !sameOrder(draftOrderIds, savedOrderIds);

  const startEditing = () => {
    setDraftOrderIds(savedOrderIds);
    setEditing(true);
    setDraggingId(null);
    setDropTargetId(null);
  };

  const saveOrder = () => {
    const next = mergeOrderWithColumns(
      draftOrderIds,
      columns.map((c) => c.teamId),
    );
    setSavedOrderIds(next);
    setDraftOrderIds(next);
    writeStoredSavedOrder(next);
    setEditing(false);
    setDraggingId(null);
    setDropTargetId(null);
  };

  const resetToSavedOrder = () => {
    setDraftOrderIds(savedOrderIds);
    setDraggingId(null);
    setDropTargetId(null);
  };

  if (columns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 py-16 text-center dark:border-zinc-800">
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-400">No companies in view</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex min-h-0 w-full flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-zinc-600 dark:text-zinc-500">
            {editing
              ? "Editing layout — drag cards by the grip, then Save to lock. Reset restores the last saved order."
              : "Card order is locked. Click Edit to rearrange. Click a priority row for the request list."}{" "}
            Refreshes about every {refreshSeconds}s.
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={resetToSavedOrder}
                  disabled={!hasUnsavedDraft}
                  className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Reset card order
                </button>
                <button
                  type="button"
                  onClick={saveOrder}
                  className="rounded-md border border-orange-500/40 bg-orange-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-orange-500"
                >
                  Save order
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={startEditing}
                className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Edit order
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {orderedColumns.map((col) => (
            <CompanyCard
              key={col.teamId}
              col={col}
              reorderEnabled={editing}
              dragging={editing && draggingId === col.teamId}
              dropTarget={editing && dropTargetId === col.teamId && draggingId !== col.teamId}
              onOpenPriority={(priority, tickets) =>
                setModalState({ companyName: col.companyName, priority, tickets })
              }
              onDragStartCard={() => {
                if (!editing) return;
                setDraggingId(col.teamId);
              }}
              onDragEndCard={() => {
                setDraggingId(null);
                setDropTargetId(null);
              }}
              onDragOverCard={(e) => {
                if (!editing) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (draggingId && draggingId !== col.teamId) {
                  setDropTargetId(col.teamId);
                }
              }}
              onDragLeaveCard={() => {
                setDropTargetId((prev) => (prev === col.teamId ? null : prev));
              }}
              onDropCard={(e) => {
                if (!editing) return;
                e.preventDefault();
                const fromId =
                  e.dataTransfer.getData(DRAG_MIME) ||
                  e.dataTransfer.getData("text/plain") ||
                  draggingId;
                if (!fromId) return;
                const base =
                  draftOrderIds.length > 0 ? draftOrderIds : columns.map((c) => c.teamId);
                setDraftOrderIds(moveTeamId(base, fromId, col.teamId));
                setDraggingId(null);
                setDropTargetId(null);
              }}
            />
          ))}
        </div>
      </div>

      <PriorityRequestsModal
        open={modalState !== null}
        onOpenChange={(open) => {
          if (!open) setModalState(null);
        }}
        companyName={modalState?.companyName ?? ""}
        priority={modalState?.priority ?? "LOW"}
        tickets={modalState?.tickets ?? []}
      />
    </>
  );
}

function CompanyLogoMark({
  teamId,
  companyName,
  hasLogo,
}: {
  teamId: string;
  companyName: string;
  hasLogo: boolean;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [teamId, hasLogo]);

  const showImage = hasLogo && !failed;

  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950">
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- dynamic auth-backed logo API
        <img
          src={`${companyLogoApiPath(teamId)}?v=${encodeURIComponent(companyName)}`}
          alt=""
          className="h-full w-full object-contain p-1.5"
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center text-[11px] font-bold tracking-wide text-orange-800 dark:text-orange-200"
          title={companyName}
          aria-hidden
        >
          {companyInitials(companyName)}
        </span>
      )}
    </div>
  );
}

function CompanyCard({
  col,
  onOpenPriority,
  reorderEnabled,
  dragging,
  dropTarget,
  onDragStartCard,
  onDragEndCard,
  onDragOverCard,
  onDragLeaveCard,
  onDropCard,
}: {
  col: CompanyBoardColumn;
  onOpenPriority: (priority: TicketPriority, tickets: CompanyTicketCard[]) => void;
  reorderEnabled: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onDragStartCard: () => void;
  onDragEndCard: () => void;
  onDragOverCard: (e: DragEvent) => void;
  onDragLeaveCard: () => void;
  onDropCard: (e: DragEvent) => void;
}) {
  const tickets = useMemo(() => ticketsForColumn(col), [col]);
  const byPriority = useMemo(() => ticketsByPriority(tickets), [tickets]);
  const activePriorities = PRIORITY_ORDER.filter((p) => (byPriority[p]?.length ?? 0) > 0);
  const hasRequests = tickets.length > 0;

  return (
    <article
      onDragOver={reorderEnabled ? onDragOverCard : undefined}
      onDragLeave={reorderEnabled ? onDragLeaveCard : undefined}
      onDrop={reorderEnabled ? onDropCard : undefined}
      className={cn(
        "flex min-h-[8.5rem] flex-col overflow-hidden rounded-2xl border bg-white shadow-[0_8px_28px_rgba(0,0,0,0.06)] transition dark:bg-surface dark:shadow-[0_10px_30px_rgba(0,0,0,0.25)]",
        hasRequests
          ? "border-zinc-200 dark:border-zinc-800"
          : "border-dashed border-zinc-300 dark:border-zinc-700",
        dragging && "opacity-50 ring-2 ring-orange-400/50",
        dropTarget && "border-orange-400 ring-2 ring-orange-400/40 dark:border-orange-500",
      )}
    >
      <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-3 dark:border-zinc-800 sm:gap-3 sm:px-4">
        {reorderEnabled ? (
          <button
            type="button"
            draggable
            aria-label={`Drag to reorder ${col.companyName}`}
            title="Drag to rearrange"
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_MIME, col.teamId);
              e.dataTransfer.setData("text/plain", col.teamId);
              e.dataTransfer.effectAllowed = "move";
              onDragStartCard();
            }}
            onDragEnd={onDragEndCard}
            className="flex h-8 w-6 shrink-0 cursor-grab items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 active:cursor-grabbing dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <GripVertical className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
        <CompanyLogoMark teamId={col.teamId} companyName={col.companyName} hasLogo={col.hasLogo} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100" title={col.companyName}>
            {col.companyName}
          </p>
          <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-500">
            {tickets.length} request{tickets.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        {activePriorities.length === 0 ? (
          <p className="flex flex-1 items-center justify-center py-4 text-center text-xs text-zinc-500 dark:text-zinc-500">
            No requests
          </p>
        ) : (
          activePriorities.map((priority) => {
            const priorityTickets = byPriority[priority] ?? [];
            return (
              <PriorityLevelRow
                key={priority}
                priority={priority}
                count={priorityTickets.length}
                onOpen={() => onOpenPriority(priority, priorityTickets)}
              />
            );
          })
        )}
      </div>
    </article>
  );
}

function PriorityLevelRow({
  priority,
  count,
  onOpen,
}: {
  priority: TicketPriority;
  count: number;
  onOpen: () => void;
}) {
  const label = PRIORITY_LABELS[priority];
  const labelClass = priority === "UNSET" ? "normal-case" : "uppercase";

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full min-w-0 items-center justify-between gap-2 rounded-xl border bg-zinc-50/80 px-3 py-2.5 text-left text-sm transition hover:bg-orange-500/[0.06] dark:bg-zinc-900/40 dark:hover:bg-orange-500/10",
        priority === "URGENT" && "border-rose-300/70 dark:border-rose-500/40",
        priority === "HIGH" && "border-orange-300/70 dark:border-orange-500/40",
        priority === "MEDIUM" && "border-orange-200/80 dark:border-orange-500/25",
        priority === "LOW" && "border-zinc-300 dark:border-zinc-700",
        priority === "UNSET" && "border-amber-300/70 dark:border-amber-500/35",
      )}
    >
      <span
        className={cn(
          "inline-flex rounded-md px-2 py-0.5 text-xs font-semibold tracking-wide",
          labelClass,
          priorityPillClass(priority),
        )}
      >
        {label}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <span className="tabular-nums text-xs font-semibold text-zinc-700 dark:text-zinc-300">{count}</span>
        <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />
      </span>
    </button>
  );
}

function PriorityRequestsModal({
  open,
  onOpenChange,
  companyName,
  priority,
  tickets,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyName: string;
  priority: TicketPriority;
  tickets: CompanyTicketCard[];
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(tickets.length / TICKETS_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = tickets.length === 0 ? 0 : (safePage - 1) * TICKETS_PAGE_SIZE + 1;
  const end = Math.min(tickets.length, safePage * TICKETS_PAGE_SIZE);
  const visibleTickets = tickets.slice(start === 0 ? 0 : start - 1, end);

  const label = PRIORITY_LABELS[priority];
  const labelClass = priority === "UNSET" ? "normal-case" : "uppercase";

  useEffect(() => {
    if (open) setPage(1);
  }, [open, priority, companyName]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(90dvh,40rem)] w-[calc(100vw-1.5rem)] max-w-lg flex-col gap-0 overflow-hidden border-zinc-200 bg-white p-0 dark:border-zinc-700 dark:bg-[#111]"
        aria-describedby="priority-requests-description"
      >
        <DialogHeader className="space-y-2 border-b border-zinc-200 px-5 py-4 text-left dark:border-zinc-800">
          <div className="flex flex-wrap items-center gap-2 pr-6">
            <DialogTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {companyName}
            </DialogTitle>
            <span
              className={cn(
                "inline-flex rounded-md px-2 py-0.5 text-xs font-semibold tracking-wide",
                labelClass,
                priorityPillClass(priority),
              )}
            >
              {label}
            </span>
          </div>
          <DialogDescription id="priority-requests-description" className="text-left text-sm text-zinc-600 dark:text-zinc-400">
            {tickets.length} request{tickets.length === 1 ? "" : "s"} at this priority level. Click a request to open
            its summary.
          </DialogDescription>
        </DialogHeader>

        <ul className="min-h-0 flex-1 divide-y divide-zinc-200 overflow-y-auto dark:divide-zinc-800">
          {visibleTickets.map((t) => (
            <li key={t.id}>
              <AgentTicketDeepLink
                ticketId={t.id}
                className="flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-orange-500/[0.06] dark:hover:bg-orange-500/10"
              >
                <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {t.ticketNumber}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold",
                    statusPillClass(t.status),
                  )}
                  title={formatCompanyBoardStatusLabel(t.status)}
                >
                  {formatCompanyBoardStatusLabel(t.status)}
                </span>
              </AgentTicketDeepLink>
            </li>
          ))}
        </ul>

        {tickets.length > TICKETS_PAGE_SIZE ? (
          <div className="border-t border-zinc-200 px-5 py-3 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
            <p className="mb-2 text-center">
              {start}-{end} of {tickets.length}
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
              >
                Previous
              </button>
              <span className="tabular-nums text-zinc-500">
                {safePage}/{totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage(safePage + 1)}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
