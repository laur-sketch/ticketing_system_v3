"use client";

import { useEffect, useMemo, useState } from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/cn";
import { PointerDragGhostLayer, usePointerColumnDrag } from "@/lib/pointer-column-drag";
import {
  incompletePastDeadlineDelayMs,
  nonRecurringDeadline,
  recurringDeadlineExclusive,
  taskKanbanDerivedStatus,
} from "@/lib/kpi-cycle-state";
import { DEFAULT_TIME_ZONE, type KpiFrequencyCode } from "@/lib/kpi-recurrence";
import {
  isItProjectSubTaskComplete,
  isItProjectSubTaskDelayed,
  itProjectAggregatedProgressFromRaw,
  itProjectChecklistProgressFromRaw,
  itProjectPhaseProgressFromItems,
  parseItProjectSubKpis,
} from "@/lib/it-project-subkpis";
import { isItProjectImplementationPillar } from "@/lib/it-task-pillar-titles";
import {
  kpiChecklistMetricView,
  kpiChecklistProgress,
  collectAllSubKpiItems,
  getPillarScreenshots,
  normalizeSubKpis,
  pillarScreenshotsEnabled,
  subKpiAssignedAgentId,
  type SubKpiItem,
} from "@/lib/kpi-subkpis";
import { hasValidActualDate } from "@/lib/us-date-format";
import {
  MAX_TASK_SCREENSHOT_BYTES,
  MAX_TASK_SCREENSHOTS_PER_SLOT,
  TASK_SCREENSHOT_ACCEPT,
} from "@/lib/task-screenshot-constants";
import type { TaskScreenshotSlot } from "@/lib/task-screenshot-meta";
import { KpiDefinitionConsole } from "@/components/KpiDefinitionConsole";
import { DatePickerField } from "@/components/ui/DatePickerField";
import { SimplePaginationBar } from "@/components/ui/SimplePaginationBar";

type KpiBoardStatus = "CURRENT" | "DONE" | "DELAYED";

const TASK_ASSIGNMENT_LANES_PAGE_SIZE = 6;

function subTaskStatusLabel(s: SubKpiItem, nowMs: number, timeZone: string): string {
  if (isItProjectSubTaskDelayed(s, nowMs, timeZone)) return "Delayed";
  if (hasValidActualDate(s)) return "On time";
  return "Pending";
}

function taskScreenshotsEnabled(s: SubKpiItem): boolean {
  return (
    s.screenshotsEnabled === true ||
    (s.beforeScreenshot?.length ?? 0) > 0 ||
    (s.afterScreenshot?.length ?? 0) > 0
  );
}

function hasBeforeAndAfterScreenshots(s: SubKpiItem): boolean {
  return (s.beforeScreenshot?.length ?? 0) > 0 && (s.afterScreenshot?.length ?? 0) > 0;
}

function ChecklistProgressBar({
  percent,
  barClassName,
}: {
  percent: number;
  barClassName: string;
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className="h-2 rounded-full bg-zinc-200/70 dark:bg-zinc-800/60">
      <div className={cn("h-full rounded-full transition-[width]", barClassName)} style={{ width: `${clamped}%` }} />
    </div>
  );
}

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
  assignedAgent?: { id: string; name: string; team?: { id?: string | null; name?: string | null } | null } | null;
  itProjectName?: string | null;
  itProjectPhase?: string | null;
};

type AssignableAgent = {
  id: string;
  name: string;
  email?: string | null;
  team?: { id?: string | null; name?: string | null } | null;
};

function dedupeAssignableAgents(list: AssignableAgent[]): AssignableAgent[] {
  const seen = new Set<string>();
  const out: AssignableAgent[] = [];
  for (const agent of list) {
    const nameKey = agent.name.trim().toLowerCase().replace(/\s+/g, " ");
    const key = nameKey || agent.email?.trim().toLowerCase() || agent.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(agent);
  }
  return out;
}

export function AgentKpiKanbanFlow({
  companyFilterTeamId = null,
  showAdminTaskManagement = false,
}: {
  /** When set, loads KPI rows and assignment lanes for this SBU only (personnel designated company). */
  companyFilterTeamId?: string | null;
  /** SuperAdmin / Admin: KPI definition form (moved from Ticket Metrics and Reports). */
  showAdminTaskManagement?: boolean;
} = {}) {
  const [rows, setRows] = useState<KpiRecord[]>([]);
  const [agents, setAgents] = useState<AssignableAgent[]>([]);
  const [canAssignWork, setCanAssignWork] = useState(false);
  const [canUnassignWork, setCanUnassignWork] = useState(false);
  const [canCompleteUnassignedWork, setCanCompleteUnassignedWork] = useState(false);
  const [operatorAgentId, setOperatorAgentId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tz, setTz] = useState(DEFAULT_TIME_ZONE);
  const [nowMs, setNowMs] = useState(0);
  const [assignmentLanePage, setAssignmentLanePage] = useState(1);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        setTz(DEFAULT_TIME_ZONE);
      } catch {
        setTz(DEFAULT_TIME_ZONE);
      }
    });
  }, []);

  useEffect(() => {
    queueMicrotask(() => setNowMs(Date.now()));
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const companyQs =
    companyFilterTeamId && companyFilterTeamId !== "ALL"
      ? `&company=${encodeURIComponent(companyFilterTeamId)}`
      : "";

  async function load() {
    const res = await fetch(`/api/kpi-maintenance?tz=${encodeURIComponent(tz)}${companyQs}`, { cache: "no-store" });
    if (!res.ok) return;
    const payload = (await res.json()) as {
      rows?: KpiRecord[];
      canAssignWork?: boolean;
      canUnassignWork?: boolean;
      canCompleteUnassignedWork?: boolean;
    };
    if (Array.isArray(payload.rows)) setRows(payload.rows);
    setCanAssignWork(Boolean(payload.canAssignWork));
    setCanUnassignWork(Boolean(payload.canUnassignWork));
    setCanCompleteUnassignedWork(Boolean(payload.canCompleteUnassignedWork));
  }

  async function loadContext() {
    const agentsUrl =
      companyFilterTeamId && companyFilterTeamId !== "ALL"
        ? `/api/agents?company=${encodeURIComponent(companyFilterTeamId)}`
        : "/api/agents";
    const [permRes, agentsRes] = await Promise.all([
      fetch("/api/me/permissions", { cache: "no-store" }),
      fetch(agentsUrl, { cache: "no-store" }),
    ]);
    if (permRes.ok) {
      const p = (await permRes.json()) as { operatorAgentId?: string | null };
      setOperatorAgentId(p.operatorAgentId ?? null);
    }
    if (agentsRes.ok) {
      const a = (await agentsRes.json()) as AssignableAgent[];
      if (Array.isArray(a)) setAgents(dedupeAssignableAgents(a));
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load();
      void loadContext();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tz, companyFilterTeamId]);

  function progress(r: KpiRecord) {
    const p = isItProjectImplementationPillar(r.title)
      ? itProjectChecklistProgressFromRaw(r.subKpis)
      : kpiChecklistProgress(r.subKpis);
    const view = kpiChecklistMetricView(p, false);
    return {
      total: view.total,
      done: view.done,
      missing: view.missing,
      pct: view.percent,
      inverted: view.inverted,
      positive: view.positive,
      negative: view.negative,
    };
  }

  function periodEnd(r: KpiRecord) {
    if (r.isRecurring === false) return nonRecurringDeadline(r);
    return recurringDeadlineExclusive(r, tz);
  }

  function incompleteOverdueMs(r: KpiRecord) {
    if (isItProjectImplementationPillar(r.title)) {
      return incompletePastDeadlineDelayMs(r, nowMs, tz);
    }
    const p = progress(r);
    if (p.total === 0 || p.done === p.total) return 0;
    return incompletePastDeadlineDelayMs(r, nowMs, tz);
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
      nowMs,
      timeZone: tz,
    });
  }

  function canEditChecklist(r: KpiRecord) {
    return !!operatorAgentId && r.assignedAgent?.id === operatorAgentId;
  }

  function canEditSubKpi(r: KpiRecord, s: SubKpiItem) {
    if (canEditChecklist(r)) return true;
    const subAssigneeId = subKpiAssignedAgentId(s);
    if (operatorAgentId && subAssigneeId === operatorAgentId) return true;
    return canCompleteUnassignedWork && !r.assignedAgent?.id && !subAssigneeId;
  }

  function canCompleteSubKpi(r: KpiRecord, s: SubKpiItem) {
    const screenshotsEnabled = taskScreenshotsEnabled(s);
    if (screenshotsEnabled && !hasBeforeAndAfterScreenshots(s)) return false;
    if (canEditSubKpi(r, s)) return true;
    return canAssignWork && screenshotsEnabled && hasBeforeAndAfterScreenshots(s);
  }

  function taskCardDone(r: KpiRecord) {
    const p = progress(r);
    return p.total > 0 && p.done === p.total;
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
    if (!canAssignWork) return;
    const nextAssigneeId = assignedAgentId === "__UNASSIGNED__" ? "" : assignedAgentId;
    if (!nextAssigneeId && !canUnassignWork) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/kpi-maintenance?tz=${encodeURIComponent(tz)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, assignedAgentId: nextAssigneeId }),
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

  async function assignSubKpi(recordId: string, subKpiId: string, assignedAgentId: string) {
    if (!canAssignWork) return;
    setBusyId(recordId);
    setError(null);
    try {
      const res = await fetch(`/api/kpi-maintenance?tz=${encodeURIComponent(tz)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: recordId,
          subKpiAssignee: { subKpiId, assignedAgentId: assignedAgentId || null },
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not assign sub-task.");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  function validateTaskScreenshotFile(file: File): string | null {
    const type = (file.type || "").toLowerCase();
    const isAllowed = type === "image/jpeg" || type === "image/png" || /\.(jpe?g|png)$/i.test(file.name);
    if (!isAllowed) return "Only JPEG and PNG screenshots are allowed.";
    if (file.size > MAX_TASK_SCREENSHOT_BYTES) return "Screenshot must not exceed 10MB.";
    return null;
  }

  async function uploadSubKpiScreenshots(
    recordId: string,
    subKpiId: string,
    slot: TaskScreenshotSlot,
    files: File[],
    existingCount: number,
  ) {
    if (files.length === 0) return;
    if (existingCount + files.length > MAX_TASK_SCREENSHOTS_PER_SLOT) {
      setError(`You can upload up to ${MAX_TASK_SCREENSHOTS_PER_SLOT} ${slot} screenshots per sub-task.`);
      return;
    }
    for (const file of files) {
      const validationError = validateTaskScreenshotFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    setBusyId(recordId);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("id", recordId);
      fd.append("subKpiId", subKpiId);
      fd.append("slot", slot);
      for (const file of files) {
        fd.append("screenshot", file);
      }
      const res = await fetch(`/api/kpi-maintenance?tz=${encodeURIComponent(tz)}`, {
        method: "PATCH",
        body: fd,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not upload task screenshot.");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function uploadPillarScreenshots(
    recordId: string,
    slot: TaskScreenshotSlot,
    files: File[],
    existingCount: number,
  ) {
    if (files.length === 0) return;
    if (existingCount + files.length > MAX_TASK_SCREENSHOTS_PER_SLOT) {
      setError(`You can upload up to ${MAX_TASK_SCREENSHOTS_PER_SLOT} ${slot} screenshots per pillar.`);
      return;
    }
    for (const file of files) {
      const validationError = validateTaskScreenshotFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    setBusyId(recordId);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("id", recordId);
      fd.append("pillarScreenshot", "1");
      fd.append("slot", slot);
      for (const file of files) {
        fd.append("screenshot", file);
      }
      const res = await fetch(`/api/kpi-maintenance?tz=${encodeURIComponent(tz)}`, {
        method: "PATCH",
        body: fd,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not upload pillar screenshot.");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function removePillarScreenshot(recordId: string, slot: TaskScreenshotSlot, storedFileName: string) {
    setBusyId(recordId);
    setError(null);
    try {
      const res = await fetch(`/api/kpi-maintenance?tz=${encodeURIComponent(tz)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: recordId,
          pillarScreenshotDelete: { slot, storedFileName },
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not remove pillar screenshot.");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function removeSubKpiScreenshot(
    recordId: string,
    subKpiId: string,
    slot: TaskScreenshotSlot,
    storedFileName: string,
  ) {
    setBusyId(recordId);
    setError(null);
    try {
      const res = await fetch(`/api/kpi-maintenance?tz=${encodeURIComponent(tz)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: recordId,
          subKpiScreenshotDelete: { subKpiId, slot, storedFileName },
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not remove task screenshot.");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function patchItProjectMeta(
    recordId: string,
    data: { itProjectName?: string | null; itProjectPhase?: string | null },
  ) {
    setBusyId(recordId);
    setError(null);
    try {
      const res = await fetch(`/api/kpi-maintenance?tz=${encodeURIComponent(tz)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: recordId, ...data }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not update project details.");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function patchSubKpiSchedule(
    recordId: string,
    subKpiId: string,
    schedule: { dueDate?: string | null; actualDate?: string | null },
  ) {
    setBusyId(recordId);
    setError(null);
    try {
      const res = await fetch(`/api/kpi-maintenance?tz=${encodeURIComponent(tz)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: recordId, subKpiSchedule: { subKpiId, ...schedule } }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not update sub-task dates.");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function patchSubKpiWorkMeta(
    recordId: string,
    subKpiId: string,
    meta: {
      startDate?: string | null;
      dueDate?: string | null;
      actualDate?: string | null;
      location?: string | null;
    },
  ) {
    setBusyId(recordId);
    setError(null);
    try {
      const res = await fetch(`/api/kpi-maintenance?tz=${encodeURIComponent(tz)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: recordId, subKpiWorkMeta: { subKpiId, ...meta } }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not update sub-task details.");
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
  const agentNameById = useMemo(
    () => new Map(agents.map((a) => [a.id, a.name] as const)),
    [agents],
  );

  function subKpiAssigneeLabel(s: SubKpiItem) {
    const id = subKpiAssignedAgentId(s);
    if (!id) return "Sub-task assignee: unassigned";
    return `Sub-task assignee: ${agentNameById.get(id) ?? s.assignedAgentName ?? "assigned personnel"}`;
  }

  function renderSubKpiAssignmentControl(r: KpiRecord, s: SubKpiItem) {
    const assignedId = subKpiAssignedAgentId(s) ?? "";
    if (!canAssignWork) {
      return <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">{subKpiAssigneeLabel(s)}</p>;
    }
    const mainTeamId = r.assignedAgent?.team?.id ?? null;
    const mainTeamName = r.assignedAgent?.team?.name?.trim().toLowerCase() ?? "";
    const companyScopedAgents = agents.filter((a) => {
      if (mainTeamId) return a.team?.id === mainTeamId;
      if (mainTeamName) return a.team?.name?.trim().toLowerCase() === mainTeamName;
      return false;
    });
    const assignedStillVisible = assignedId && !companyScopedAgents.some((a) => a.id === assignedId);
    return (
      <label className="mt-2 flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
        Sub-task assignee
        <select
          value={assignedId}
          disabled={busyId === r.id || (!r.assignedAgent?.id && !assignedId)}
          onChange={(e) => void assignSubKpi(r.id, s.id, e.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs font-normal normal-case tracking-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        >
          <option value="">Unassigned</option>
          {assignedStillVisible ? (
            <option value={assignedId}>{agentNameById.get(assignedId) ?? s.assignedAgentName ?? "Current assignee"}</option>
          ) : null}
          {companyScopedAgents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {!r.assignedAgent?.id ? (
          <span className="text-[10px] font-medium normal-case tracking-normal text-zinc-500 dark:text-zinc-500">
            Assign the main task first to show personnel from that company.
          </span>
        ) : null}
      </label>
    );
  }

  function renderPillarScreenshotField(r: KpiRecord, slot: TaskScreenshotSlot, editable: boolean) {
    const screenshots = getPillarScreenshots(r.subKpis, slot);
    const label = slot === "before" ? "Before screenshot" : "After screenshot";
    const canUpload = editable || canAssignWork;
    const canRemove = canUpload && !taskCardDone(r);
    const remainingSlots = Math.max(0, MAX_TASK_SCREENSHOTS_PER_SLOT - screenshots.length);
    return (
      <div className="rounded-lg border border-orange-200 bg-orange-50/60 p-2 dark:border-orange-800/50 dark:bg-orange-950/20">
        <p className="text-[10px] font-bold uppercase tracking-wide text-orange-800 dark:text-orange-200">{label}</p>
        {screenshots.length > 0 ? (
          <div className="mt-1 space-y-1">
            {screenshots.map((meta, index) => (
              <div key={meta.storedFileName} className="flex items-center justify-between gap-2 text-[11px]">
                <a
                  href={`/api/kpi-maintenance/${r.id}/screenshots/${encodeURIComponent(meta.storedFileName)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-orange-700 hover:underline dark:text-orange-300"
                >
                  View {index + 1}
                </a>
                {canRemove ? (
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      void removePillarScreenshot(r.id, slot, meta.storedFileName);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="rounded-full border border-orange-300 px-2 py-0.5 font-semibold text-orange-800 hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-orange-800 dark:text-orange-200 dark:hover:bg-orange-950/50"
                    aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        <label
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            "mt-2 inline-flex cursor-pointer rounded-full bg-orange-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-orange-500",
            (!canUpload || busyId === r.id || remainingSlots === 0) && "cursor-not-allowed opacity-60 hover:bg-orange-600",
          )}
        >
          Choose File
          <input
            type="file"
            multiple
            accept={TASK_SCREENSHOT_ACCEPT}
            disabled={!canUpload || busyId === r.id || remainingSlots === 0}
            onChange={(e) => {
              e.stopPropagation();
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              void uploadPillarScreenshots(r.id, slot, files, screenshots.length);
            }}
            className="sr-only"
            aria-label={`Upload 1 to ${remainingSlots} ${label.toLowerCase()} images for ${r.title}`}
          />
        </label>
      </div>
    );
  }

  function renderPillarScreenshotFields(r: KpiRecord, editable: boolean) {
    if (!pillarScreenshotsEnabled(r.subKpis)) return null;
    return (
      <div className="mt-3 rounded-lg border border-orange-300/60 bg-orange-50/60 p-3 dark:border-orange-800/60 dark:bg-orange-950/20">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-orange-800 dark:text-orange-200">
            Pillar screenshots
          </p>
          <p className="text-[10px] text-orange-700 dark:text-orange-300">
            Cached for recurring cycles; remove before Done if the proof is wrong.
          </p>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {renderPillarScreenshotField(r, "before", editable)}
          {renderPillarScreenshotField(r, "after", editable)}
        </div>
      </div>
    );
  }

  function renderScreenshotField(r: KpiRecord, s: SubKpiItem, slot: TaskScreenshotSlot, editable: boolean) {
    const screenshots = slot === "before" ? s.beforeScreenshot ?? [] : s.afterScreenshot ?? [];
    const label = slot === "before" ? "Before screenshot" : "After screenshot";
    const canUpload = editable || canAssignWork;
    const canRemove = canUpload && !s.done && !taskCardDone(r);
    const remainingSlots = Math.max(0, MAX_TASK_SCREENSHOTS_PER_SLOT - screenshots.length);
    return (
      <div className="rounded-lg border border-zinc-200 bg-white/60 p-2 dark:border-zinc-700 dark:bg-zinc-950/40">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">{label}</p>
        </div>
        {screenshots.length > 0 ? (
          <div className="mt-1 space-y-1">
            {screenshots.map((meta, index) => (
              <div key={meta.storedFileName} className="flex items-center justify-between gap-2 text-[11px]">
                <a
                  href={`/api/kpi-maintenance/${r.id}/screenshots/${encodeURIComponent(meta.storedFileName)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 font-semibold text-orange-700 hover:underline dark:text-orange-300"
                >
                  View {index + 1}
                </a>
                {canRemove ? (
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeSubKpiScreenshot(r.id, s.id, slot, meta.storedFileName);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="rounded-full border border-zinc-300 px-2 py-0.5 font-semibold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    aria-label={`Remove ${label.toLowerCase()} ${index + 1} for ${s.title}`}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        <label
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            "mt-2 inline-flex cursor-pointer rounded-full bg-orange-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-orange-500",
            (!canUpload || busyId === r.id || remainingSlots === 0) && "cursor-not-allowed opacity-60 hover:bg-orange-600",
          )}
        >
          Choose File
          <input
            type="file"
            multiple
            accept={TASK_SCREENSHOT_ACCEPT}
            disabled={!canUpload || busyId === r.id || remainingSlots === 0}
            onChange={(e) => {
              e.stopPropagation();
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              void uploadSubKpiScreenshots(r.id, s.id, slot, files, screenshots.length);
            }}
            className="sr-only"
            aria-label={`Upload 1 to ${remainingSlots} ${label.toLowerCase()} images for ${s.title}`}
          />
        </label>
      </div>
    );
  }

  function renderTaskScreenshotFields(r: KpiRecord, s: SubKpiItem, editable: boolean) {
    if (!taskScreenshotsEnabled(s)) return null;
    return (
      <div className="mt-2">
        <p className="mb-1 text-[10px] text-zinc-500 dark:text-zinc-500">
          Screenshots are cached for recurring cycles. Remove them before marking this sub-task Done if needed.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
        {renderScreenshotField(r, s, "before", editable)}
        {renderScreenshotField(r, s, "after", editable)}
        </div>
      </div>
    );
  }

  function renderNonItSubKpiCard(r: KpiRecord, s: SubKpiItem) {
    const subEditable = canEditSubKpi(r, s);
    const subCompletable = canCompleteSubKpi(r, s);
    const needsScreenshots = taskScreenshotsEnabled(s) && !hasBeforeAndAfterScreenshots(s);
    const canEditWorkDetails = subEditable || canAssignWork;
    const recurring = r.isRecurring !== false;
    const dailyRecurring = recurring && r.frequency === "DAILY";
    const finished = Boolean(s.done);
    return (
      <div
        key={s.id}
        className={cn(
          "rounded-lg border border-zinc-200/80 bg-white/60 p-3 dark:border-zinc-700 dark:bg-zinc-950/40",
          finished && "border-emerald-300/70 bg-emerald-50/60 dark:border-emerald-800/50 dark:bg-emerald-950/20",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <label className="flex min-w-0 items-start gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            <input
              type="checkbox"
              className="mt-1"
              disabled={!subCompletable || busyId === r.id}
              checked={finished}
              onChange={() => void toggleSubKpi(r.id, s.id, finished)}
              aria-label={`Mark ${s.title} as ${finished ? "pending" : "done"}`}
            />
            <span className={cn("min-w-0", finished && "line-through opacity-70")}>{s.title}</span>
          </label>
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
              finished
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
            )}
          >
            {finished ? "Finished" : "Pending"}
          </span>
        </div>
        {needsScreenshots ? (
          <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
            Upload both before and after screenshots before marking this sub-task done.
          </p>
        ) : null}
        {renderSubKpiAssignmentControl(r, s)}
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {!dailyRecurring ? (
            <label className="flex flex-col text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
              Schedule date
              <DatePickerField
                value={s.startDate ?? ""}
                disabled={!canAssignWork || busyId === r.id}
                onChange={(e) =>
                  void patchSubKpiWorkMeta(r.id, s.id, {
                    startDate: e.target.value || null,
                  })
                }
                wrapperClassName="mt-1"
                aria-label={`Schedule date for ${s.title}`}
              />
            </label>
          ) : null}
          {!recurring ? (
            <label className="flex flex-col text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
              Target date
              <DatePickerField
                value={s.dueDate ?? ""}
                disabled={!canAssignWork || busyId === r.id}
                onChange={(e) =>
                  void patchSubKpiWorkMeta(r.id, s.id, {
                    dueDate: e.target.value || null,
                  })
                }
                wrapperClassName="mt-1"
                aria-label={`Target date for ${s.title}`}
              />
            </label>
          ) : null}
          <label className="flex flex-col text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
            Location
            <input
              key={`loc-${r.id}-${s.id}-${s.location ?? ""}`}
              type="text"
              defaultValue={s.location ?? ""}
              disabled={!canEditWorkDetails || busyId === r.id}
              placeholder="Enter location"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onBlur={(e) => {
                const next = e.target.value.trim();
                const prev = (s.location ?? "").trim();
                if (next !== prev) {
                  void patchSubKpiWorkMeta(r.id, s.id, { location: next || null });
                }
              }}
              className="mt-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>
          {!recurring ? (
            <label className="flex flex-col text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
              Date finished
              <DatePickerField
                value={s.actualDate ?? ""}
                disabled={!subEditable || busyId === r.id}
                onChange={(e) =>
                  void patchSubKpiWorkMeta(r.id, s.id, {
                    actualDate: e.target.value || null,
                  })
                }
                wrapperClassName="mt-1"
                aria-label={`Date finished for ${s.title}`}
              />
            </label>
          ) : null}
        </div>
        {renderTaskScreenshotFields(r, s, subEditable)}
      </div>
    );
  }

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(agents.length / TASK_ASSIGNMENT_LANES_PAGE_SIZE));
    queueMicrotask(() => setAssignmentLanePage((p) => Math.min(Math.max(1, p), totalPages)));
  }, [agents.length]);

  const assignmentLanePageCount = Math.max(1, Math.ceil(agents.length / TASK_ASSIGNMENT_LANES_PAGE_SIZE));
  const assignmentLanePageClamped = Math.min(Math.max(1, assignmentLanePage), assignmentLanePageCount);
  const visibleAssignmentAgents = useMemo(() => {
    const start = (assignmentLanePageClamped - 1) * TASK_ASSIGNMENT_LANES_PAGE_SIZE;
    return agents.slice(start, start + TASK_ASSIGNMENT_LANES_PAGE_SIZE);
  }, [agents, assignmentLanePageClamped]);

  const assignLaneDrag = usePointerColumnDrag<string>({
    onDrop: (id, agentId) => void assignKpi(id, agentId),
    disabled: busyId != null || !canAssignWork,
    activationDistance: 12,
  });

  const kpiStatusDrag = usePointerColumnDrag<KpiBoardStatus>({
    onDrop: (id, col) => void move(id, col),
    disabled: busyId != null,
    activationDistance: 12,
  });

  return (
    <section className="mt-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-[0_8px_28px_rgba(0,0,0,0.06)] dark:border-zinc-800 dark:bg-[#0b1220] dark:shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
      <PointerDragGhostLayer ghost={assignLaneDrag.ghost} />
      <PointerDragGhostLayer ghost={kpiStatusDrag.ghost} />
      {showAdminTaskManagement ? (
        <KpiDefinitionConsole onMaintenanceRecordsUpdated={() => void load()} />
      ) : null}
      {canAssignWork ? (
        <div className="mb-5 rounded-2xl border border-zinc-300 bg-zinc-50/70 p-4 dark:border-zinc-700 dark:bg-zinc-950/30">
          <h4 className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-700 dark:text-zinc-300">
            Task Assignment Board
          </h4>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Hold and slide a task, then release over a personnel lane
            {canUnassignWork ? " or the Unassigned lane" : ""} (works on touch and desktop).
          </p>
          <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            Up to six personnel lanes per page; use pagination below the lanes when there are more. Sub-tasks can also
            be assigned from each task card. Before/after screenshots appear only for tasks that enabled them during
            creation and accept JPEG or PNG only, up to 10MB each.
          </p>
          <div className="mt-3 grid gap-3 lg:grid-cols-[1.1fr_1.9fr]">
            <div
              ref={canUnassignWork ? assignLaneDrag.registerColumn("__UNASSIGNED__") : undefined}
              className={cn(
                "rounded-xl border border-zinc-300 bg-white p-3 transition dark:border-zinc-700 dark:bg-zinc-900/40",
                canUnassignWork && assignLaneDrag.hoverColumn === "__UNASSIGNED__" &&
                  "ring-2 ring-orange-500/60 ring-offset-2 ring-offset-white dark:ring-offset-zinc-900",
              )}
            >
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
                    {...assignLaneDrag.getCardPointerProps(r.id, { getLabel: () => r.title })}
                    className={cn(
                      "touch-pan-y select-none rounded-lg border border-zinc-300 bg-zinc-50 px-2.5 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950/40",
                      assignLaneDrag.draggingItemId === r.id && "opacity-60 ring-1 ring-orange-400/40",
                      busyId === r.id && "pointer-events-none opacity-50",
                    )}
                  >
                    <div className="flex items-start gap-1.5">
                      <GripVertical className="mt-0.5 size-4 shrink-0 text-zinc-400 dark:text-zinc-500" aria-hidden />
                      <p className="line-clamp-2 min-w-0 leading-snug">{r.title}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="min-w-0 space-y-3">
              <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 [touch-action:pan-x] sm:mx-0 sm:grid sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0 sm:[touch-action:auto] lg:grid-cols-2">
                {visibleAssignmentAgents.map((a) => (
                  <div
                    key={`lane-${a.id}`}
                    ref={assignLaneDrag.registerColumn(a.id)}
                    className={cn(
                      "w-[88%] shrink-0 snap-start rounded-xl border border-zinc-300 bg-white p-3 transition sm:w-auto dark:border-zinc-700 dark:bg-zinc-900/40",
                      assignLaneDrag.hoverColumn === a.id && "ring-2 ring-orange-500/60 ring-offset-2 ring-offset-white dark:ring-offset-zinc-900",
                    )}
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
                          <div
                            key={`lane-item-${r.id}`}
                            {...assignLaneDrag.getCardPointerProps(r.id, { getLabel: () => r.title })}
                            className={cn(
                              "touch-pan-y select-none truncate rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700",
                              assignLaneDrag.draggingItemId === r.id && "opacity-60 ring-1 ring-orange-400/40",
                              busyId === r.id && "pointer-events-none opacity-50",
                            )}
                          >
                            {r.title}
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
              <SimplePaginationBar
                page={assignmentLanePage}
                pageSize={TASK_ASSIGNMENT_LANES_PAGE_SIZE}
                total={agents.length}
                onPageChange={setAssignmentLanePage}
                itemLabel="personnel"
                className="rounded-lg border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900/40"
              />
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
            Hold and slide a task to <strong>Done</strong> or <strong>Current</strong> (touch or mouse).{" "}
            <span className="text-zinc-500 dark:text-zinc-500">
              The <strong>Delayed</strong> column applies only to <strong>IT Project Implementation</strong> tasks
              (sub-task past due or actual date after due date). Fully complete but late tasks stay in{" "}
              <strong>Delayed</strong>, not Done.
            </span>
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
                ref={kpiStatusDrag.registerColumn(col)}
                className={cn(
                  "min-h-[320px] rounded-2xl border p-3 transition",
                  colClass,
                  kpiStatusDrag.hoverColumn === col && "ring-2 ring-orange-500/60",
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
                      const incLate = incompleteOverdueMs(r);
                      const end = periodEnd(r);
                      const itProject = isItProjectImplementationPillar(r.title);
                      const normalized = normalizeSubKpis(r.subKpis);
                      const itProjectData = itProject
                        ? parseItProjectSubKpis(r.subKpis, r.itProjectPhase)
                        : null;
                      const itProjectProgress =
                        itProject && itProjectData
                          ? itProjectAggregatedProgressFromRaw(r.subKpis, r.itProjectPhase)
                          : null;
                      const checklistItems = collectAllSubKpiItems(normalized);
                      const mainBarPct = itProjectProgress ? itProjectProgress.averagePercent : p.pct;
                      const mainBarClass =
                        col === "DONE"
                          ? "bg-emerald-500"
                          : col === "DELAYED"
                            ? "bg-rose-500"
                            : itProject
                              ? "bg-orange-500"
                              : "bg-blue-500";
                      return (
                        <div
                          key={r.id}
                          {...(editable
                            ? kpiStatusDrag.getCardPointerProps(r.id, { getLabel: () => r.title })
                            : {})}
                          className={cn(
                            "rounded-xl border bg-white/60 p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-950/30",
                            busyId === r.id && "opacity-50",
                            editable && kpiStatusDrag.draggingItemId === r.id && "ring-1 ring-orange-400/40",
                          )}
                        >
                          <div className="flex items-start gap-2">
                            {editable ? (
                              <GripVertical className="mt-0.5 size-4 shrink-0 text-zinc-400 dark:text-zinc-500" aria-hidden />
                            ) : null}
                            <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{r.title}</p>
                              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                                Assigned: {r.assignedAgent?.name ?? "Unassigned"}
                              </p>
                            </div>
                            <span className="rounded-full border border-zinc-200 bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-200">
                              {itProject ? "Project" : r.frequency}
                            </span>
                          </div>
                          {!itProject && normalized.segmented ? (
                            <span className="mt-2 inline-flex rounded-full border border-orange-400/60 bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-orange-900 dark:border-orange-500/35 dark:bg-orange-500/10 dark:text-orange-100">
                              Segmented
                            </span>
                          ) : null}
                          {canAssignWork ? (
                            <p className="mt-2 text-[11px] text-zinc-600 dark:text-zinc-400">
                              Reassign the card through lanes above, or assign individual sub-tasks below.
                            </p>
                          ) : null}
                          {itProject ? (
                            <div className="mt-3 space-y-2 rounded-lg border border-orange-400/35 bg-orange-500/[0.07] p-3 dark:border-orange-500/30 dark:bg-orange-500/10">
                              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-orange-800 dark:text-orange-200">
                                Project details
                              </p>
                              <label className="block text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
                                Project name
                                <input
                                  key={`ipn-${r.id}-${r.updatedAt}`}
                                  type="text"
                                  defaultValue={r.itProjectName ?? ""}
                                  disabled={!editable || busyId === r.id}
                                  placeholder="e.g. Intranet refresh"
                                  onBlur={(e) => {
                                    const v = e.target.value.trim();
                                    const prev = (r.itProjectName ?? "").trim();
                                    if (v !== prev) void patchItProjectMeta(r.id, { itProjectName: v || null });
                                  }}
                                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                                />
                              </label>
                            </div>
                          ) : null}
                          <div className="mt-3">
                            <div className="flex items-center justify-between">
                              <p className="text-xs text-zinc-700 dark:text-zinc-200">
                                {itProjectProgress ? "Project progress (phase average)" : "Progress"}
                              </p>
                              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                                {itProjectProgress
                                  ? itProjectProgress.totalItems > 0
                                    ? `${itProjectProgress.averagePercent}% avg · ${itProjectProgress.totalDone}/${itProjectProgress.totalItems} sub-tasks`
                                    : "0%"
                                  : p.total > 0
                                    ? p.inverted
                                      ? `${p.positive}/${p.total} clear · ${p.negative} flagged · ${p.pct}%`
                                      : `${p.done}/${p.total} finished · ${p.missing} pending · ${p.pct}%`
                                    : `${p.done}/${p.total} · ${p.pct}%`}
                              </p>
                            </div>
                            <ChecklistProgressBar percent={mainBarPct} barClassName={mainBarClass} />
                            {itProjectProgress && itProjectProgress.phases.filter((ph) => ph.total > 0).length > 1 ? (
                              <p className="mt-1.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                                Average of{" "}
                                {itProjectProgress.phases
                                  .filter((ph) => ph.total > 0)
                                  .map((ph) => `${ph.phaseName} ${ph.percent}%`)
                                  .join(" · ")}
                              </p>
                            ) : null}
                            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                              {itProject
                                ? "Choosing an actual date marks the sub-task complete and sets status to On time or Delayed based on the due date."
                                : r.isRecurring === false || !end
                                  ? `Non-recurring task${r.nonRecurringStartAt && r.nonRecurringEndAt ? ` (${new Date(r.nonRecurringStartAt).toLocaleDateString()} - ${new Date(r.nonRecurringEndAt).toLocaleDateString()})` : ""}`
                                  : `Next period starts ${end.toLocaleString(undefined, { timeZone: tz })} (${tz})`}
                            </p>
                            {itProject && incLate > 0 ? (
                              <p className="mt-2 text-xs font-semibold text-rose-700 dark:text-rose-300">
                                {p.done === p.total
                                  ? `All sub-tasks complete · delayed by ${fmtDelay(incLate)}`
                                  : `Delayed by ${fmtDelay(incLate)}`}
                              </p>
                            ) : p.inverted
                              ? p.negative > 0 && p.positive < p.total ? (
                                  <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
                                    {p.negative} flagged item{p.negative === 1 ? "" : "s"}
                                  </p>
                                ) : null
                              : p.missing > 0 && p.done < p.total ? (
                                  <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
                                    {p.missing} pending task{p.missing === 1 ? "" : "s"}
                                  </p>
                                ) : null}
                          </div>
                          {!itProject ? renderPillarScreenshotFields(r, editable) : null}
                          <div className="mt-3 space-y-2">
                            {!itProject && normalized.segmented
                              ? normalized.segments.map((seg) => (
                                  <div
                                    key={seg.id}
                                    className="rounded-md border border-zinc-200/80 bg-white/60 p-2 dark:border-zinc-700 dark:bg-zinc-900/50"
                                  >
                                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange-700 dark:text-orange-400">
                                      {seg.label}
                                    </p>
                                    <div className="mt-1 space-y-2">
                                      {seg.items.map((s) => renderNonItSubKpiCard(r, s))}
                                    </div>
                                  </div>
                                ))
                              : itProject && itProjectData
                                ? itProjectData.phases.map((phase) => {
                                    const phaseProgress = itProjectPhaseProgressFromItems(phase);
                                    return (
                                      <div
                                        key={phase.id}
                                        className="rounded-lg border border-orange-400/45 bg-orange-500/[0.06] p-3 dark:border-orange-500/35 dark:bg-orange-500/10"
                                      >
                                        <div className="border-b border-orange-400/25 pb-2 dark:border-orange-500/25">
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange-800 dark:text-orange-200">
                                              {phase.name}
                                            </p>
                                            <span className="text-[10px] font-semibold text-zinc-600 dark:text-zinc-400">
                                              {phaseProgress.total > 0
                                                ? `${phaseProgress.done}/${phaseProgress.total} · ${phaseProgress.percent}%`
                                                : "No sub-tasks"}
                                            </span>
                                          </div>
                                          {phaseProgress.total > 0 ? (
                                            <ChecklistProgressBar
                                              percent={phaseProgress.percent}
                                              barClassName="bg-orange-500"
                                            />
                                          ) : null}
                                        </div>
                                        <div className="mt-2 space-y-2">
                                          {phase.items.length === 0 ? (
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                              No sub-tasks in this phase.
                                            </p>
                                          ) : (
                                            phase.items.map((s) => {
                                              const subEditable = canEditSubKpi(r, s);
                                              return (
                                              <div
                                                key={s.id}
                                                className="rounded-lg border border-zinc-200/90 bg-zinc-50/80 p-2.5 dark:border-zinc-600 dark:bg-zinc-950/40"
                                              >
                                      <label className="flex items-start gap-2 text-xs text-zinc-800 dark:text-zinc-200">
                                        <input
                                          type="checkbox"
                                          className="mt-0.5"
                                          disabled={!subEditable || busyId === r.id}
                                          checked={isItProjectSubTaskComplete(s)}
                                          onChange={() =>
                                            void toggleSubKpi(
                                              r.id,
                                              s.id,
                                              isItProjectSubTaskComplete(s),
                                            )
                                          }
                                        />
                                        <span
                                          className={cn(
                                            isItProjectSubTaskComplete(s) && "line-through opacity-70",
                                          )}
                                        >
                                          {s.title}
                                        </span>
                                      </label>
                                      {renderSubKpiAssignmentControl(r, s)}
                                      {!hasValidActualDate(s) ? (
                                        <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                                          Pick an actual date to complete this sub-task (on time vs delayed is set automatically).
                                        </p>
                                      ) : null}
                                      <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                        Sub-task
                                      </p>
                                      <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                                        <label className="flex flex-col text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
                                          Due date
                                          <DatePickerField
                                            value={s.dueDate ?? ""}
                                            disabled={!editable || busyId === r.id}
                                            onChange={(e) =>
                                              void patchSubKpiSchedule(r.id, s.id, {
                                                dueDate: e.target.value || null,
                                              })
                                            }
                                            wrapperClassName="mt-1"
                                            aria-label={`Due date for ${s.title}`}
                                          />
                                        </label>
                                        <label className="flex flex-col text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
                                          Actual date
                                          <DatePickerField
                                            value={s.actualDate ?? ""}
                                            disabled={!subEditable || busyId === r.id}
                                            onChange={(e) =>
                                              void patchSubKpiSchedule(r.id, s.id, {
                                                actualDate: e.target.value || null,
                                              })
                                            }
                                            wrapperClassName="mt-1"
                                            aria-label={`Actual date for ${s.title}`}
                                          />
                                        </label>
                                      </div>
                                      <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                                        Status:{" "}
                                        <span
                                          className={cn(
                                            "font-semibold",
                                            isItProjectSubTaskDelayed(s, nowMs, tz)
                                              ? "text-rose-700 dark:text-rose-400"
                                              : hasValidActualDate(s)
                                                ? "text-emerald-600 dark:text-emerald-400"
                                                : "text-amber-700 dark:text-amber-300",
                                          )}
                                        >
                                          {subTaskStatusLabel(s, nowMs, tz)}
                                        </span>
                                      </p>
                                              </div>
                                              );
                                            })
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })
                                : checklistItems.map((s: SubKpiItem) => renderNonItSubKpiCard(r, s))}
                          </div>
                            </div>
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
