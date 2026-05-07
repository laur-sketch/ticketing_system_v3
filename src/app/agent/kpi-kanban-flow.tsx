"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  incompletePastDeadlineDelayMs,
  nonRecurringDeadline,
  recurringDeadlineExclusive,
  recurringDoneDelayedMs,
  taskKanbanDerivedStatus,
} from "@/lib/kpi-cycle-state";
import { type KpiFrequencyCode } from "@/lib/kpi-recurrence";
import { collectAllSubKpiItems, normalizeSubKpis } from "@/lib/kpi-subkpis";

type KpiBoardStatus = "CURRENT" | "DONE" | "DELAYED";

type KpiRecord = {
  id: string;
  title: string;
  isRecurring?: boolean;
  nonRecurringStartAt?: string | null;
  nonRecurringEndAt?: string | null;
  frequency: KpiFrequencyCode;
  subKpis: unknown;
  createdAt: string;
  updatedAt: string;
  recurrenceWeekday?: number | null;
  recurrenceMonthDay?: number | null;
  /** Active cycle anchor (UTC); backlog rows may be null until first GET normalizes */
  periodCycleStartAt?: string | null;
  assignedAgent?: { id: string; name: string; team?: { name?: string | null } | null } | null;
};

type AssignableAgent = {
  id: string;
  name: string;
  team?: { name?: string | null } | null;
};

export function AgentKpiKanbanFlow() {
  const [rows, setRows] = useState<KpiRecord[]>([]);
  const [agents, setAgents] = useState<AssignableAgent[]>([]);
  const [canAssignWork, setCanAssignWork] = useState(false);
  const [operatorAgentId, setOperatorAgentId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<KpiBoardStatus | null>(null);
  const [assignDragId, setAssignDragId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tz, setTz] = useState("UTC");

  useEffect(() => {
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (zone) setTz(zone);
    } catch {
      setTz("UTC");
    }
  }, []);

  async function load() {
    const res = await fetch(`/api/kpi-maintenance?tz=${encodeURIComponent(tz)}`, { cache: "no-store" });
    if (!res.ok) return;
    const payload = (await res.json()) as { rows?: KpiRecord[]; canAssignWork?: boolean };
    if (Array.isArray(payload.rows)) setRows(payload.rows);
    setCanAssignWork(Boolean(payload.canAssignWork));
  }

  async function loadContext() {
    const [permRes, agentsRes] = await Promise.all([
      fetch("/api/me/permissions", { cache: "no-store" }),
      fetch("/api/agents", { cache: "no-store" }),
    ]);
    if (permRes.ok) {
      const p = (await permRes.json()) as { operatorAgentId?: string | null };
      setOperatorAgentId(p.operatorAgentId ?? null);
    }
    if (agentsRes.ok) {
      const a = (await agentsRes.json()) as AssignableAgent[];
      if (Array.isArray(a)) setAgents(a);
    }
  }

  useEffect(() => {
    void load();
    void loadContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tz]);

  function progress(r: KpiRecord) {
    const all = collectAllSubKpiItems(normalizeSubKpis(r.subKpis));
    const total = all.length;
    const done = all.filter((s) => s.done).length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return { total, done, pct };
  }

  function periodEnd(r: KpiRecord) {
    if (r.isRecurring === false) return nonRecurringDeadline(r);
    return recurringDeadlineExclusive(r, tz);
  }

  function delayMs(r: KpiRecord) {
    const p = progress(r);
    if (p.total === 0 || p.done !== p.total) return 0;
    const doneAt = new Date(r.updatedAt).getTime();
    if (!Number.isFinite(doneAt)) return 0;
    return recurringDoneDelayedMs(r, tz, doneAt);
  }

  function incompleteOverdueMs(r: KpiRecord) {
    const p = progress(r);
    if (p.total === 0 || p.done === p.total) return 0;
    return incompletePastDeadlineDelayMs(r, Date.now(), tz);
  }

  function fmtDelay(ms: number) {
    if (!Number.isFinite(ms) || ms <= 0) return "0d 0h";
    const hours = Math.floor(ms / 3_600_000);
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }

  function statusOf(r: KpiRecord): KpiBoardStatus {
    const p = progress(r);
    return taskKanbanDerivedStatus(r, {
      total: p.total,
      done: p.done,
      nowMs: Date.now(),
      timeZone: tz,
    });
  }

  function canEditChecklist(r: KpiRecord) {
    return !!operatorAgentId && r.assignedAgent?.id === operatorAgentId;
  }

  async function move(id: string, to: KpiBoardStatus) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/kpi-maintenance?tz=${encodeURIComponent(tz)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, markAllDone: to === "DONE" }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not move KPI card.");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function assignKpi(id: string, assignedAgentId: string) {
    if (!canAssignWork || !assignedAgentId) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/kpi-maintenance?tz=${encodeURIComponent(tz)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, assignedAgentId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not reassign KPI.");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function toggleSubKpi(recordId: string, subKpiId: string, done: boolean) {
    setBusyId(recordId);
    setError(null);
    try {
      const res = await fetch(`/api/kpi-maintenance?tz=${encodeURIComponent(tz)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: recordId, subKpiId, done: !done }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not update checklist.");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const hasRows = useMemo(() => rows.length > 0, [rows.length]);
  const unassignedRows = useMemo(() => rows.filter((r) => !r.assignedAgent?.id), [rows]);
  const assignedCountByAgent = useMemo(
    () =>
      new Map(
        agents.map((a) => [a.id, rows.filter((r) => r.assignedAgent?.id === a.id).length] as const),
      ),
    [agents, rows],
  );

  return (
    <section className="mt-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-[0_8px_28px_rgba(0,0,0,0.06)] dark:border-zinc-800 dark:bg-[#0b1220] dark:shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
      {canAssignWork ? (
        <div className="mb-5 rounded-2xl border border-zinc-300 bg-zinc-50/70 p-4 dark:border-zinc-700 dark:bg-zinc-950/30">
          <h4 className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-700 dark:text-zinc-300">
            Task Assignment Board
          </h4>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Drag from Unassigned tasks into a personnel/head-role lane. Lanes are touch-friendly on mobile.
          </p>
          <div className="mt-3 grid gap-3 lg:grid-cols-[1.1fr_1.9fr]">
            <div className="rounded-xl border border-zinc-300 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900/40">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">Unassigned</p>
                <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {unassignedRows.length}
                </span>
              </div>
              <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                {unassignedRows.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-zinc-300 px-3 py-6 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                    No unassigned tasks.
                  </p>
                ) : null}
                {unassignedRows.map((r) => (
                  <div
                    key={`unassigned-${r.id}`}
                    draggable={busyId !== r.id}
                    onDragStart={(e) => {
                      setAssignDragId(r.id);
                      e.dataTransfer.setData("text/kpi-assign-id", r.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => setAssignDragId(null)}
                    className={cn(
                      "rounded-lg border border-zinc-300 bg-zinc-50 px-2.5 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950/40",
                      assignDragId === r.id && "ring-1 ring-orange-400/40",
                    )}
                  >
                    <p className="line-clamp-2 leading-snug">{r.title}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-2">
              {agents.map((a) => (
                <div
                  key={`lane-${a.id}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData("text/kpi-assign-id");
                    if (!id) return;
                    void assignKpi(id, a.id);
                    setAssignDragId(null);
                  }}
                  className="w-[88%] shrink-0 snap-start rounded-xl border border-zinc-300 bg-white p-3 sm:w-auto dark:border-zinc-700 dark:bg-zinc-900/40"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{a.name}</p>
                    <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {assignedCountByAgent.get(a.id) ?? 0}
                    </span>
                  </div>
                  <div className="max-h-[140px] space-y-1.5 overflow-y-auto pr-1">
                    {rows
                      .filter((r) => r.assignedAgent?.id === a.id)
                      .slice(0, 5)
                      .map((r) => (
                        <p key={`lane-item-${r.id}`} className="truncate rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700">
                          {r.title}
                        </p>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600 dark:text-zinc-500">
            Task Kanban (drag to update)
          </h3>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Drag a task to <strong>Done</strong> to mark all sub-tasks done, or to <strong>Current</strong> to reset.
          </p>
        </div>
      </div>
      {error ? (
        <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-200">
          {error}
        </p>
      ) : null}
      {!hasRows ? (
        <div className="mt-4 rounded-xl border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-500">
          No task cards available.
        </div>
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {(["CURRENT", "DONE", "DELAYED"] as const).map((col) => {
            const list = rows
              .filter((r) => statusOf(r) === col)
              .sort((a, b) => {
                if (col !== "DELAYED") return 0;
                return incompleteOverdueMs(b) - incompleteOverdueMs(a);
              });
            const label = col === "CURRENT" ? "Current" : col === "DONE" ? "Done" : "Delayed";
            const colClass =
              col === "CURRENT"
                ? "border-blue-300 bg-blue-50/60 dark:border-blue-700/60 dark:bg-blue-950/20"
                : col === "DONE"
                  ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-700/60 dark:bg-emerald-950/20"
                  : "border-rose-300 bg-rose-50/60 dark:border-rose-700/60 dark:bg-rose-950/20";

            return (
              <article
                key={col}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(col);
                }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(null);
                  const id = e.dataTransfer.getData("text/kpi-id");
                  if (!id) return;
                  void move(id, col);
                }}
                className={cn(
                  "min-h-[320px] rounded-2xl border p-3 transition",
                  colClass,
                  dragOver === col && "ring-2 ring-orange-500/60",
                )}
              >
                <div className="flex items-center justify-between gap-3 px-1">
                  <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{label}</h4>
                  <span className="rounded-full bg-white/60 px-2 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-200">
                    {list.length}
                  </span>
                </div>
                <div className="mt-3 space-y-3">
                  {list.length === 0 ? (
                    <p className="px-2 py-8 text-center text-sm text-zinc-600 dark:text-zinc-400">No tasks here.</p>
                  ) : (
                    list.map((r) => {
                      const editable = canEditChecklist(r);
                      const p = progress(r);
                      const late = delayMs(r);
                      const incLate = incompleteOverdueMs(r);
                      const end = periodEnd(r);
                      const normalized = normalizeSubKpis(r.subKpis);
                      return (
                        <div
                          key={r.id}
                          draggable={editable && busyId !== r.id}
                          onDragStart={(e) => {
                            if (!editable) return;
                            setDragId(r.id);
                            e.dataTransfer.setData("text/kpi-id", r.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => setDragId(null)}
                          className={cn(
                            "rounded-xl border bg-white/60 p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-950/30",
                            busyId === r.id && "opacity-50",
                            dragId === r.id && "ring-1 ring-orange-400/40",
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{r.title}</p>
                              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                                Assigned: {r.assignedAgent?.name ?? "Unassigned"}
                              </p>
                            </div>
                            <span className="rounded-full border border-zinc-200 bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-200">
                              {r.frequency}
                            </span>
                          </div>
                          {normalized.segmented ? (
                            <span className="mt-2 inline-flex rounded-full border border-orange-400/60 bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-orange-900 dark:border-orange-500/35 dark:bg-orange-500/10 dark:text-orange-100">
                              Segmented
                            </span>
                          ) : null}
                          {canAssignWork ? (
                            <p className="mt-2 text-[11px] text-zinc-600 dark:text-zinc-400">
                              Reassign through drag-and-drop lanes above.
                            </p>
                          ) : null}
                          <div className="mt-3">
                            <div className="flex items-center justify-between">
                              <p className="text-xs text-zinc-700 dark:text-zinc-200">Progress</p>
                              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                                {p.done}/{p.total} · {p.pct}%
                              </p>
                            </div>
                            <div className="mt-2 h-2 rounded-full bg-zinc-200/70 dark:bg-zinc-800/60">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  col === "DONE" ? "bg-emerald-500" : col === "DELAYED" ? "bg-rose-500" : "bg-blue-500",
                                )}
                                style={{ width: `${p.pct}%` }}
                              />
                            </div>
                            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                              {r.isRecurring === false || !end
                                ? `Non-recurring task${r.nonRecurringStartAt && r.nonRecurringEndAt ? ` (${new Date(r.nonRecurringStartAt).toLocaleDateString()} - ${new Date(r.nonRecurringEndAt).toLocaleDateString()})` : ""}`
                                : `Next period starts ${end.toLocaleString(undefined, { timeZone: tz })} (${tz})`}
                            </p>
                            {late > 0 ? (
                              <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
                                Done but delayed by {fmtDelay(late)}
                              </p>
                            ) : incLate > 0 ? (
                              <p className="mt-2 text-xs font-semibold text-rose-700 dark:text-rose-300">
                                Incomplete · overdue by {fmtDelay(incLate)}
                              </p>
                            ) : null}
                          </div>
                          <div className="mt-3 space-y-2">
                            {normalized.segmented
                              ? normalized.segments.map((seg) => (
                                  <div
                                    key={seg.id}
                                    className="rounded-md border border-zinc-200/80 bg-white/60 p-2 dark:border-zinc-700 dark:bg-zinc-900/50"
                                  >
                                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange-700 dark:text-orange-400">
                                      {seg.label}
                                    </p>
                                    <div className="mt-1 space-y-1">
                                      {seg.items.map((s) => (
                                        <label
                                          key={s.id}
                                          className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300"
                                        >
                                          <input
                                            type="checkbox"
                                            disabled={!editable || busyId === r.id}
                                            checked={Boolean(s.done)}
                                            onChange={() => void toggleSubKpi(r.id, s.id, Boolean(s.done))}
                                          />
                                          <span className={cn(Boolean(s.done) && "line-through opacity-70")}>{s.title}</span>
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                ))
                              : normalized.flat.map((s) => (
                                  <label
                                    key={s.id}
                                    className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300"
                                  >
                                    <input
                                      type="checkbox"
                                      disabled={!editable || busyId === r.id}
                                      checked={Boolean(s.done)}
                                      onChange={() => void toggleSubKpi(r.id, s.id, Boolean(s.done))}
                                    />
                                    <span className={cn(Boolean(s.done) && "line-through opacity-70")}>{s.title}</span>
                                  </label>
                                ))}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
