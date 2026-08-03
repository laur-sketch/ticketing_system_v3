"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  CheckSquare,
  CircleDot,
  ClipboardList,
  GitBranch,
  Inbox,
  Kanban,
  LifeBuoy,
  Loader2,
  Pencil,
  PlusSquare,
  Ticket,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

type SidebarSummary = {
  open: number;
  inProgress: number;
  forConfirmation: number;
  onDutyCount: number;
  onDutyPreview: Array<{ id: string; name: string; companyName: string }>;
  selfOnDuty: boolean | null;
};

type ShortcutDef = {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

type Props = {
  className?: string;
  /** Tighter padding for mobile drawer */
  compact?: boolean;
};

const MAX_SHORTCUTS = 6;

const SHORTCUT_CATALOG: ShortcutDef[] = [
  { id: "create", href: "/tickets/new", label: "Create", icon: PlusSquare },
  { id: "assign", href: "/admin/manual-assignment", label: "Assign", icon: Kanban, adminOnly: true },
  { id: "requests", href: "/agent", label: "Requests", icon: Ticket },
  { id: "tasks", href: "/agent/tasks", label: "Tasks", icon: CheckSquare },
  { id: "people", href: "/admin/personnel", label: "People", icon: Users, adminOnly: true },
  { id: "activities", href: "/admin/activities", label: "Activity", icon: Activity, adminOnly: true },
  { id: "alerts", href: "/admin/escalation-triggers", label: "Alerts", icon: LifeBuoy, adminOnly: true },
  { id: "inbox", href: "/admin/ticket-requests", label: "Inbox", icon: Inbox, adminOnly: true },
  { id: "process", href: "/process", label: "Process", icon: GitBranch },
  { id: "docs", href: "/tickets/knowledge", label: "Docs", icon: BookOpen },
  { id: "metrics", href: "/insights", label: "Metrics", icon: BarChart3 },
  { id: "reports", href: "/reports", label: "Reports", icon: ClipboardList, adminOnly: true },
];

const DEFAULT_ADMIN_IDS = ["create", "assign", "requests", "tasks", "people", "metrics"] as const;
const DEFAULT_PERSONNEL_IDS = ["create", "requests", "tasks", "process", "docs", "metrics"] as const;

const EMPTY: SidebarSummary = {
  open: 0,
  inProgress: 0,
  forConfirmation: 0,
  onDutyCount: 0,
  onDutyPreview: [],
  selfOnDuty: null,
};

function shortcutsStorageKey(email: string, role: string) {
  return `sidebar-shortcuts:${email.trim().toLowerCase() || "anon"}:${role}`;
}

function catalogForRole(isAdmin: boolean): ShortcutDef[] {
  return SHORTCUT_CATALOG.filter((item) => (item.adminOnly ? isAdmin : true));
}

function defaultIds(isAdmin: boolean): string[] {
  return [...(isAdmin ? DEFAULT_ADMIN_IDS : DEFAULT_PERSONNEL_IDS)];
}

function normalizeIds(raw: unknown, isAdmin: boolean): string[] {
  const allowed = new Set(catalogForRole(isAdmin).map((item) => item.id));
  if (!Array.isArray(raw)) return defaultIds(isAdmin);
  const cleaned = raw
    .filter((id): id is string => typeof id === "string" && allowed.has(id))
    .filter((id, index, arr) => arr.indexOf(id) === index)
    .slice(0, MAX_SHORTCUTS);
  return cleaned.length > 0 ? cleaned : defaultIds(isAdmin);
}

function readStoredIds(email: string, role: string, isAdmin: boolean): string[] {
  if (typeof window === "undefined") return defaultIds(isAdmin);
  try {
    const raw = window.localStorage.getItem(shortcutsStorageKey(email, role));
    if (!raw) return defaultIds(isAdmin);
    return normalizeIds(JSON.parse(raw) as unknown, isAdmin);
  } catch {
    return defaultIds(isAdmin);
  }
}

function writeStoredIds(email: string, role: string, ids: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(shortcutsStorageKey(email, role), JSON.stringify(ids));
}

export function SidebarOpsWidget({ className, compact = false }: Props) {
  const { data: session } = useSession();
  const role = session?.user?.role ?? "Personnel";
  const email = session?.user?.email ?? "";
  const isAdmin = role === "SuperAdmin" || role === "Admin";
  const [data, setData] = useState<SidebarSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => defaultIds(isAdmin));

  const available = useMemo(() => catalogForRole(isAdmin), [isAdmin]);
  const availableById = useMemo(() => new Map(available.map((item) => [item.id, item])), [available]);

  useEffect(() => {
    queueMicrotask(() => {
      setSelectedIds(readStoredIds(email, role, isAdmin));
      setEditing(false);
    });
  }, [email, role, isAdmin]);

  useEffect(() => {
    let stopped = false;

    async function refresh() {
      try {
        const res = await fetch("/api/dashboard/sidebar-summary", { cache: "no-store" });
        if (!res.ok) throw new Error("failed");
        const payload = (await res.json()) as SidebarSummary;
        if (stopped) return;
        setData({
          open: Math.max(0, Number(payload.open) || 0),
          inProgress: Math.max(0, Number(payload.inProgress) || 0),
          forConfirmation: Math.max(0, Number(payload.forConfirmation) || 0),
          onDutyCount: Math.max(0, Number(payload.onDutyCount) || 0),
          onDutyPreview: Array.isArray(payload.onDutyPreview) ? payload.onDutyPreview.slice(0, 2) : [],
          selfOnDuty:
            typeof payload.selfOnDuty === "boolean" ? payload.selfOnDuty : null,
        });
        setFailed(false);
      } catch {
        if (!stopped) setFailed(true);
      }
    }

    void refresh();
    const timer = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void refresh();
    }, 60_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);

  const shortcuts = useMemo(
    () => selectedIds.map((id) => availableById.get(id)).filter((item): item is ShortcutDef => Boolean(item)),
    [selectedIds, availableById],
  );

  const toggleShortcut = useCallback(
    (id: string) => {
      setSelectedIds((prev) => {
        if (prev.includes(id)) {
          if (prev.length <= 1) return prev;
          return prev.filter((item) => item !== id);
        }
        if (prev.length >= MAX_SHORTCUTS) return prev;
        return [...prev, id];
      });
    },
    [],
  );

  function saveEdits() {
    const next = normalizeIds(selectedIds, isAdmin);
    setSelectedIds(next);
    writeStoredIds(email, role, next);
    setEditing(false);
  }

  function resetDefaults() {
    const next = defaultIds(isAdmin);
    setSelectedIds(next);
    writeStoredIds(email, role, next);
  }

  const summary = data ?? EMPTY;
  const loading = data == null && !failed;

  return (
    <div
      className={cn(
        "shrink-0 border-t border-zinc-200/80 dark:border-zinc-800",
        compact ? "px-3 py-3" : "px-2.5 py-2.5",
        className,
      )}
    >
      <div className="rounded-xl border border-zinc-200 bg-white/80 p-2.5 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-500">
            Queue
          </p>
          {loading ? <Loader2 size={12} className="animate-spin text-zinc-400" aria-hidden /> : null}
        </div>

        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <QueueStat href="/agent?status=OPEN" label="Open" value={summary.open} tone="sky" />
          <QueueStat
            href="/agent?status=IN_PROGRESS"
            label="Active"
            value={summary.inProgress}
            tone="orange"
          />
          <QueueStat
            href="/agent?status=FOR_CONFIRMATION"
            label="Confirm"
            value={summary.forConfirmation}
            tone="emerald"
          />
        </div>

        <div className="mt-2.5 border-t border-zinc-200/80 pt-2.5 dark:border-zinc-800">
          {!isAdmin ? (
            <div className="flex items-center justify-between gap-2">
              <p className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-500">
                Status
              </p>
              {failed && data == null ? (
                <p className="min-w-0 text-right text-[11px] text-zinc-500">Unavailable</p>
              ) : (
                <p
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                    summary.selfOnDuty
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-1.5 shrink-0 rounded-full",
                      summary.selfOnDuty ? "bg-emerald-500" : "bg-zinc-400",
                    )}
                    aria-hidden
                  />
                  {summary.selfOnDuty ? "On duty" : "Off duty"}
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-500">
                  <Users size={11} aria-hidden />
                  On duty
                </p>
                <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                  {summary.onDutyCount}
                </span>
              </div>

              {failed && data == null ? (
                <p className="mt-1.5 text-[11px] text-zinc-500">Couldn’t load live status.</p>
              ) : summary.onDutyPreview.length === 0 ? (
                <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-500">No one clocked in yet.</p>
              ) : (
                <ul className="mt-1.5 space-y-1">
                  {summary.onDutyPreview.map((person) => (
                    <li key={person.id} className="flex min-w-0 items-center gap-2">
                      <span className="inline-flex size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-zinc-800 dark:text-zinc-200">
                        {person.name}
                      </span>
                    </li>
                  ))}
                  {summary.onDutyCount > summary.onDutyPreview.length ? (
                    <li>
                      <Link
                        href="/admin/activities"
                        className="text-[10px] font-semibold text-orange-700 hover:underline dark:text-orange-300"
                      >
                        +{summary.onDutyCount - summary.onDutyPreview.length} more
                      </Link>
                    </li>
                  ) : null}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="mt-2.5 border-t border-zinc-200/80 pt-2.5 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-500">
              Shortcuts
            </p>
            {editing ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={resetDefaults}
                  className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={saveEdits}
                  className="inline-flex items-center gap-1 rounded-md bg-orange-600 px-1.5 py-0.5 text-[10px] font-bold text-white transition hover:bg-orange-500"
                >
                  <Check size={10} aria-hidden />
                  Done
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-300 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                title="Edit shortcuts"
              >
                <Pencil size={10} aria-hidden />
                Edit
              </button>
            )}
          </div>

          {editing ? (
            <>
              <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-500">
                Pick up to {MAX_SHORTCUTS} · {selectedIds.length}/{MAX_SHORTCUTS} selected
              </p>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {available.map((item) => {
                  const Icon = item.icon;
                  const selected = selectedIds.includes(item.id);
                  const atLimit = selectedIds.length >= MAX_SHORTCUTS && !selected;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleShortcut(item.id)}
                      disabled={atLimit}
                      className={cn(
                        "relative flex min-w-0 flex-col items-center gap-1 rounded-lg border px-1 py-2 text-center transition",
                        selected
                          ? "border-orange-500/50 bg-orange-500/15 dark:border-orange-400/40 dark:bg-orange-500/15"
                          : "border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950/70",
                        atLimit && "cursor-not-allowed opacity-40",
                      )}
                      title={item.label}
                    >
                      {selected ? (
                        <span className="absolute right-1 top-1 inline-flex size-3.5 items-center justify-center rounded-full bg-orange-600 text-white">
                          <Check size={8} strokeWidth={3} aria-hidden />
                        </span>
                      ) : null}
                      <Icon
                        size={14}
                        className={cn(
                          selected ? "text-orange-700 dark:text-orange-300" : "text-zinc-500 dark:text-zinc-400",
                        )}
                        aria-hidden
                      />
                      <span className="w-full truncate text-[9px] font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {shortcuts.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="flex min-w-0 flex-col items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-1 py-2 text-center transition hover:border-orange-400/40 hover:bg-orange-500/10 dark:border-zinc-700 dark:bg-zinc-950/70 dark:hover:border-orange-500/30 dark:hover:bg-orange-500/10"
                    title={item.label}
                  >
                    <Icon size={14} className="text-orange-600 dark:text-orange-300" aria-hidden />
                    <span className="w-full truncate text-[9px] font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QueueStat({
  href,
  label,
  value,
  tone,
}: {
  href: string;
  label: string;
  value: number;
  tone: "sky" | "orange" | "emerald";
}) {
  const toneClass =
    tone === "sky"
      ? "text-sky-700 dark:text-sky-300"
      : tone === "orange"
        ? "text-orange-700 dark:text-orange-300"
        : "text-emerald-700 dark:text-emerald-300";
  const Icon = tone === "emerald" ? CheckCircle2 : CircleDot;

  return (
    <Link
      href={href}
      className="min-w-0 rounded-lg bg-zinc-50 px-1 py-2 text-center transition hover:bg-zinc-100 dark:bg-zinc-950/70 dark:hover:bg-zinc-950"
      title={
        tone === "emerald"
          ? `For confirmation: ${value}`
          : `${label}: ${value}`
      }
    >
      <Icon size={11} className={cn("mx-auto", toneClass)} aria-hidden />
      <p className={cn("mt-1 truncate text-[9px] font-bold uppercase tracking-wide", toneClass)}>
        {label}
      </p>
      <p className="mt-0.5 text-base font-bold tabular-nums leading-none text-zinc-900 dark:text-zinc-100">
        {value}
      </p>
    </Link>
  );
}
