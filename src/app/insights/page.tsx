"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { BRAND_TITLE } from "@/lib/brand";
import {
  MetricsBarChart,
  MetricsGauge,
  MetricsPieChart,
  MetricsQueueStrip,
  MetricsTrendChart,
} from "@/components/metrics/MetricsCharts";
import { agentOperationalRoleLabel } from "@/lib/agent-account-role";
import {
  incompletePastDeadlineDelayMs,
  nonRecurringDeadline,
  recurringDeadlineExclusive,
  recurringDoneDelayedMs,
  taskKanbanDerivedStatus,
} from "@/lib/kpi-cycle-state";
import { type KpiFrequencyCode } from "@/lib/kpi-recurrence";
import {
  collectAllSubKpiItems,
  normalizeSubKpis,
  type SubKpiItem as SubKpi,
} from "@/lib/kpi-subkpis";

type KpiPayload = {
  range: { from: string; to: string };
  operational: {
    ticketVolume: number;
    backlogSize: number;
    firstResponseTimeMsAvg: number | null;
    resolutionTimeMsAvg: number | null;
    firstContactResolutionApprox: number | null;
  };
  sla: {
    firstResponseComplianceRate: number | null;
    resolutionComplianceRate: number | null;
    escalationRate: number | null;
    reopenRate: number | null;
    ticketsClosedInRange: number;
  };
  quality: {
    csatAvg: number | null;
    npsAvg: number | null;
    cesAvg: number | null;
    feedbackCount: number;
  };
  agents: {
    ticketsClosedByAgent: { agentId: string; name: string; ticketsClosed: number }[];
  };
  charts?: {
    days: string[];
    createdByDay: number[];
    closedByDay: number[];
    queueStatusMix: { status: string; count: number }[];
  };
  kpiManagement?: {
    kpisAdded: number;
  };
};

type MaintenanceFrequency = "Daily" | "Weekly" | "Monthly";
type DraftSegmentRow = { id: string; label: string; items: SubKpi[] };
type MaintenanceRecord = {
  id: string;
  title: string;
  isRecurring?: boolean;
  nonRecurringStartAt?: string | null;
  nonRecurringEndAt?: string | null;
  frequency: KpiFrequencyCode;
  createdAt: string;
  updatedAt: string;
  subKpis: unknown;
  recurrenceWeekday?: number | null;
  recurrenceMonthDay?: number | null;
  periodCycleStartAt?: string | null;
  periodKey?: string | null;
  assignedAgent?: {
    id: string;
    name: string;
    team?: { name?: string | null } | null;
  } | null;
};
type KpiBoardStatus = "CURRENT" | "DONE" | "DELAYED";
type TaskItem = {
  id: string;
  title: string;
  description: string | null;
  status: "CURRENT" | "DONE" | "DELAYED";
  dueAt: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  priority: string | null;
  assignedAgent?: {
    id: string;
    name: string;
    team?: { name?: string | null } | null;
  } | null;
};
type TaskActivity = {
  id: string;
  author: string;
  action: string;
  detail: string | null;
  createdAt: string;
};
type AssignableAgent = {
  id: string;
  name: string;
  teamName: string;
  roleLabel: "Admin" | "Personnel";
};

const MIN_SUB_FOR_SEGMENT_OPTION = 3;
const INSIGHTS_VIEW_ONLY = false;

function formatDuration(ms: number | null) {
  if (ms === null) return "—";
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.round(ms / 60_000)} min avg`;
  return `${hours.toFixed(1)} h avg`;
}

function pct(n: number | null) {
  if (n === null) return "—";
  return `${Math.round(n * 1000) / 10}%`;
}

export default function InsightsPage() {
  const { data: session } = useSession();
  const isPersonnel = session?.user?.role === "Personnel";
  const [activeTab, setActiveTab] = useState<"metrics" | "kpi-mgmt">("metrics");
  const [data, setData] = useState<KpiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sweepInfo, setSweepInfo] = useState<string | null>(null);
  const [sweepBusy, setSweepBusy] = useState(false);
  const [throughputView, setThroughputView] = useState<"cards" | "table">("table");
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [taskSelectedIds, setTaskSelectedIds] = useState<string[]>([]);
  const [taskDragOver, setTaskDragOver] = useState<TaskItem["status"] | null>(null);
  const [autoDelayBusy, setAutoDelayBusy] = useState(false);
  const [maintenanceTitle, setMaintenanceTitle] = useState("");
  const [maintenanceIsRecurring, setMaintenanceIsRecurring] = useState(true);
  const [nonRecurringStartDate, setNonRecurringStartDate] = useState("");
  const [nonRecurringEndDate, setNonRecurringEndDate] = useState("");
  const [maintenanceFrequency, setMaintenanceFrequency] = useState<MaintenanceFrequency>("Daily");
  const [recurrenceWeekday, setRecurrenceWeekday] = useState(1);
  const [recurrenceMonthDay, setRecurrenceMonthDay] = useState(1);
  const [subKpiDraft, setSubKpiDraft] = useState("");
  const [subKpisDraft, setSubKpisDraft] = useState<SubKpi[]>([]);
  const [draftUseSegments, setDraftUseSegments] = useState(false);
  const [draftSegments, setDraftSegments] = useState<DraftSegmentRow[]>([]);
  const [segItemDraft, setSegItemDraft] = useState<Record<string, string>>({});
  const [expandedEditKpiId, setExpandedEditKpiId] = useState<string | null>(null);
  const [structureEditDraft, setStructureEditDraft] = useState<{
    segmented: boolean;
    flat: SubKpi[];
    segments: DraftSegmentRow[];
  } | null>(null);
  const [editSegItemDraft, setEditSegItemDraft] = useState<Record<string, string>>({});
  const [assignableAgents, setAssignableAgents] = useState<AssignableAgent[]>([]);
  const [canAssignKpi, setCanAssignKpi] = useState(false);
  /** From KPI maintenance API — Admin-role assignment board (distinct from tab visibility). */
  const [kpiMaintenanceAssignWork, setKpiMaintenanceAssignWork] = useState(false);
  const [operatorAgentId, setOperatorAgentId] = useState<string | null>(null);
  const [taskAssignedToId, setTaskAssignedToId] = useState("");
  /** IANA zone for KPI period boundaries (browser); starts UTC until hydrated on client. */
  const [recurrenceTz, setRecurrenceTz] = useState("UTC");

  useEffect(() => {
    try {
      const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (z) setRecurrenceTz(z);
    } catch {
      setRecurrenceTz("UTC");
    }
  }, []);

  const kpiMaintenanceSearch = useMemo(
    () => `?tz=${encodeURIComponent(recurrenceTz)}`,
    [recurrenceTz],
  );
  const [kpiDragOver, setKpiDragOver] = useState<KpiBoardStatus | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskPriority, setTaskPriority] = useState("MEDIUM");
  const [taskActivities, setTaskActivities] = useState<Record<string, TaskActivity[]>>({});
  const [taskCommentDraft, setTaskCommentDraft] = useState<Record<string, string>>({});
  const showKpiTasksTab = !isPersonnel || canAssignKpi;

  const defaultRange = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  }, []);

  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);

  const loadKpis = useCallback(async () => {
    setError(null);
    const qs = new URLSearchParams({ from, to });
    const res = await fetch(`/api/kpis?${qs.toString()}`, { cache: "no-store" });
    if (!res.ok) {
      setError("Could not load KPIs. Is the database running and migrated?");
      setData(null);
      return;
    }
    const json = (await res.json()) as KpiPayload;
    setData(json);
  }, [from, to]);

  async function runSlaSweep() {
    setSweepBusy(true);
    setSweepInfo(null);
    const res = await fetch("/api/sla/sweep", { method: "POST" });
    setSweepBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setSweepInfo(body.error ?? "Could not run SLA sweep.");
      return;
    }
    const body = (await res.json()) as { scanned: number; escalated: number };
    setSweepInfo(
      `SLA sweep complete: scanned ${body.scanned}, escalated ${body.escalated}.`,
    );
    await loadKpis();
  }

  useEffect(() => {
    void loadKpis();
  }, [loadKpis]);

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "visible") void loadKpis();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [loadKpis]);

  useEffect(() => {
    if (activeTab !== "metrics") return;
    const id = setInterval(() => void loadKpis(), 45_000);
    return () => clearInterval(id);
  }, [activeTab, loadKpis]);

  useEffect(() => {
    let cancelled = false;
    async function loadAssignableAgents() {
      const role = session?.user?.role;
      if (!role) return;
      const permissionRes = await fetch("/api/me/permissions", { cache: "no-store" });
      const permission = permissionRes.ok
        ? ((await permissionRes.json()) as {
            canAccessAssignmentBoard?: boolean;
            operatorAgentId?: string | null;
          })
        : { canAccessAssignmentBoard: false, operatorAgentId: null };
      if (!cancelled) setOperatorAgentId(permission.operatorAgentId ?? null);
      if (role === "SuperAdmin" || role === "Admin") {
        if (!cancelled) setCanAssignKpi(true);
      } else {
        if (!cancelled) setCanAssignKpi(!!permission.canAccessAssignmentBoard);
      }

      const res = await fetch("/api/agents", { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const rows = (await res.json()) as Array<{
        id: string;
        name: string;
        team?: { name?: string | null } | null;
      }>;
      const mapped: AssignableAgent[] = rows.map((a) => ({
        id: a.id,
        name: a.name,
        teamName: a.team?.name ?? "Unassigned team",
        roleLabel: agentOperationalRoleLabel((a as { headPrivileges?: boolean }).headPrivileges),
      }));
      if (!cancelled) setAssignableAgents(mapped);

      const [kpiRes, taskRes] = await Promise.all([
        fetch(`/api/kpi-maintenance${kpiMaintenanceSearch}`, { cache: "no-store" }),
        fetch("/api/task-management", { cache: "no-store" }),
      ]);
      if (!cancelled && kpiRes.ok) {
        const payload = (await kpiRes.json()) as {
          rows: MaintenanceRecord[];
          canAssignWork: boolean;
        };
        setMaintenanceRecords(payload.rows);
        setKpiMaintenanceAssignWork(payload.canAssignWork);
      }
      if (!cancelled && taskRes.ok) {
        const payload = (await taskRes.json()) as {
          rows: TaskItem[];
        };
        setTasks(payload.rows);
      }
    }
    void loadAssignableAgents();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.role, kpiMaintenanceSearch]);

  useEffect(() => {
    if (activeTab !== "kpi-mgmt") return;
    void autoMarkOverdueTasksDelayed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, tasks]);

  useEffect(() => {
    if (!showKpiTasksTab && activeTab === "kpi-mgmt") {
      setActiveTab("metrics");
    }
  }, [showKpiTasksTab, activeTab]);

  const charts = data?.charts ?? {
    days: [],
    createdByDay: [],
    closedByDay: [],
    queueStatusMix: [],
  };

  const agentBars = useMemo(() => {
    if (!data) return [];
    return data.agents.ticketsClosedByAgent.slice(0, 10).map((r) => ({
      label: r.name,
      value: r.ticketsClosed,
    }));
  }, [data]);

  function kpiProgress(record: MaintenanceRecord) {
    const all = collectAllSubKpiItems(normalizeSubKpis(record.subKpis));
    const total = all.length;
    const doneCount = all.filter((s) => s.done).length;
    const percent = total === 0 ? 0 : Math.round((doneCount / total) * 100);
    return { doneCount, total, percent };
  }

  function kpiPeriodEndExclusive(record: MaintenanceRecord) {
    if (record.isRecurring === false) return nonRecurringDeadline(record);
    return recurringDeadlineExclusive(record, recurrenceTz);
  }

  function formatDelayDaysHours(ms: number) {
    if (!Number.isFinite(ms) || ms <= 0) return "0d 0h";
    const totalHours = Math.floor(ms / 3_600_000);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return `${days}d ${hours}h`;
  }

  function kpiDoneDelayMs(record: MaintenanceRecord) {
    const { doneCount, total } = kpiProgress(record);
    if (total === 0 || doneCount !== total) return 0;
    const updatedAt = new Date(record.updatedAt).getTime();
    if (!Number.isFinite(updatedAt)) return 0;
    return recurringDoneDelayedMs(record, recurrenceTz, updatedAt);
  }

  function kpiIncompleteOverdueDelayMs(record: MaintenanceRecord, nowMs: number) {
    const { doneCount, total } = kpiProgress(record);
    if (total === 0 || doneCount === total) return 0;
    return incompletePastDeadlineDelayMs(record, nowMs, recurrenceTz);
  }

  function deriveKpiBoardStatus(record: MaintenanceRecord, nowMs: number): KpiBoardStatus {
    const { doneCount, total } = kpiProgress(record);
    return taskKanbanDerivedStatus(record, {
      total,
      done: doneCount,
      nowMs,
      timeZone: recurrenceTz,
    });
  }

  function taskAchievedOnTime(task: TaskItem) {
    if (task.status !== "DONE") return false;
    if (!task.dueAt) return true;
    if (!task.updatedAt) return true;
    const due = new Date(task.dueAt).getTime();
    const updated = new Date(task.updatedAt).getTime();
    if (!Number.isFinite(due) || !Number.isFinite(updated)) return true;
    return updated <= due;
  }

  function taskDoneDelayMs(task: TaskItem) {
    if (task.status !== "DONE" || !task.dueAt || !task.updatedAt) return 0;
    const due = new Date(task.dueAt).getTime();
    const doneAt = new Date(task.updatedAt).getTime();
    if (!Number.isFinite(due) || !Number.isFinite(doneAt)) return 0;
    return Math.max(0, doneAt - due);
  }

  function canEditTask(task: TaskItem) {
    if (INSIGHTS_VIEW_ONLY) return false;
    return !!operatorAgentId && task.assignedAgent?.id === operatorAgentId;
  }

  function canEditKpi(record: MaintenanceRecord) {
    if (INSIGHTS_VIEW_ONLY) return false;
    return !!operatorAgentId && record.assignedAgent?.id === operatorAgentId;
  }

  function taskDerivedStatus(task: TaskItem): TaskItem["status"] {
    // Keep DB status as primary for colors, but optionally highlight delayed state via dueAt.
    if (task.status === "DONE" || task.status === "DELAYED") return task.status;
    if (task.status === "CURRENT" && task.dueAt) {
      const now = Date.now();
      const due = new Date(task.dueAt).getTime();
      if (Number.isFinite(due) && now > due) return "DELAYED";
    }
    return task.status;
  }

  const draftSubKpiTotal = draftUseSegments
    ? draftSegments.reduce((a, s) => a + s.items.length, 0)
    : subKpisDraft.length;
  const showSegmentedCreateOption =
    draftUseSegments || draftSubKpiTotal >= MIN_SUB_FOR_SEGMENT_OPTION;

  function addSubKpiDraft() {
    const trimmed = subKpiDraft.trim();
    if (!trimmed || draftUseSegments) return;
    setSubKpisDraft((prev) => [...prev, { id: crypto.randomUUID(), title: trimmed }]);
    setSubKpiDraft("");
  }

  function removeSubKpiDraft(id: string) {
    setSubKpisDraft((prev) => prev.filter((s) => s.id !== id));
  }

  function setDraftSegmentedMode(next: boolean) {
    if (!next) {
      const merged = draftSegments.flatMap((s) => s.items);
      setSubKpisDraft(merged);
      setDraftSegments([]);
      setDraftUseSegments(false);
      setSegItemDraft({});
      return;
    }
    setDraftUseSegments(true);
    if (subKpisDraft.length > 0) {
      setDraftSegments([{ id: crypto.randomUUID(), label: "", items: [...subKpisDraft] }]);
      setSubKpisDraft([]);
      return;
    }
    if (draftSegments.length === 0) {
      setDraftSegments([{ id: crypto.randomUUID(), label: "", items: [] }]);
    }
  }

  function addDraftSegmentRow() {
    setDraftSegments((prev) => [...prev, { id: crypto.randomUUID(), label: "", items: [] }]);
  }

  function updateDraftSegmentLabel(segmentId: string, label: string) {
    setDraftSegments((prev) => prev.map((s) => (s.id === segmentId ? { ...s, label } : s)));
  }

  function pushItemToDraftSegment(segmentId: string) {
    const raw = (segItemDraft[segmentId] ?? "").trim();
    if (!raw) return;
    const seg = draftSegments.find((s) => s.id === segmentId);
    if (!seg?.label.trim()) return;
    setDraftSegments((prev) =>
      prev.map((s) =>
        s.id === segmentId ? { ...s, items: [...s.items, { id: crypto.randomUUID(), title: raw }] } : s,
      ),
    );
    setSegItemDraft((prev) => ({ ...prev, [segmentId]: "" }));
  }

  function removeDraftSegmentRow(segmentId: string) {
    setDraftSegments((prev) => prev.filter((s) => s.id !== segmentId));
    setSegItemDraft((prev) => {
      const n = { ...prev };
      delete n[segmentId];
      return n;
    });
  }

  function removeDraftSegmentItem(segmentId: string, itemId: string) {
    setDraftSegments((prev) =>
      prev.map((s) =>
        s.id === segmentId ? { ...s, items: s.items.filter((it) => it.id !== itemId) } : s,
      ),
    );
  }

  function openStructureEdit(record: MaintenanceRecord) {
    const n = normalizeSubKpis(record.subKpis);
    if (n.segmented) {
      setStructureEditDraft({
        segmented: true,
        flat: [],
        segments: n.segments.map((s) => ({
          id: s.id,
          label: s.label,
          items: s.items.map((i) => ({ ...i })),
        })),
      });
    } else {
      setStructureEditDraft({
        segmented: false,
        segments: [],
        flat: n.flat.map((i) => ({ ...i })),
      });
    }
    setExpandedEditKpiId(record.id);
    setEditSegItemDraft({});
  }

  async function saveStructureEdit(recordId: string) {
    if (!structureEditDraft) return;
    setError(null);
    let payload: Record<string, unknown>;
    if (structureEditDraft.segmented) {
      payload = {
        segmented: true,
        segments: structureEditDraft.segments.map((s) => ({
          id: s.id,
          label: s.label.trim(),
          items: s.items.map((it) => ({
            id: it.id,
            title: it.title.trim(),
            done: Boolean(it.done),
          })),
        })),
      };
    } else {
      payload = {
        segmented: false,
        items: structureEditDraft.flat.map((it) => ({
          id: it.id,
          title: it.title.trim(),
          done: Boolean(it.done),
        })),
      };
    }
    const res = await fetch(`/api/kpi-maintenance${kpiMaintenanceSearch}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: recordId, structuredSubKpis: payload }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      setError(typeof errBody.error === "string" ? errBody.error : "Could not update checklist.");
      return;
    }
    const reload = await fetch(`/api/kpi-maintenance${kpiMaintenanceSearch}`, { cache: "no-store" });
    if (reload.ok) {
      const out = (await reload.json()) as { rows: MaintenanceRecord[] };
      setMaintenanceRecords(out.rows);
    }
    setExpandedEditKpiId(null);
    setStructureEditDraft(null);
  }

  function renderSubKpiChecklistBlock(r: MaintenanceRecord, editable: boolean) {
    const norm = normalizeSubKpis(r.subKpis);
    const all = collectAllSubKpiItems(norm);
    if (all.length === 0) {
      return <p className="mt-3 text-sm text-zinc-500">No sub-tasks.</p>;
    }
    if (!norm.segmented) {
      return (
        <div className="mt-3 space-y-2">
          {norm.flat.map((s) => (
            <label key={s.id} className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
              <input
                type="checkbox"
                checked={Boolean(s.done)}
                disabled={!editable}
                onChange={() => void toggleSubKpiDone(r.id, s)}
              />
              <span className={cn(Boolean(s.done) && "line-through text-zinc-500 dark:text-zinc-500")}>
                {s.title}
              </span>
            </label>
          ))}
        </div>
      );
    }
    return (
      <div className="mt-3 space-y-3">
        {norm.segments.map((seg) => (
          <div
            key={seg.id}
            className="rounded-lg border border-zinc-200/80 bg-white/40 p-3 dark:border-zinc-700/70 dark:bg-zinc-950/20"
          >
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-orange-700 dark:text-orange-400/95">
              {seg.label.trim() || "(Unnamed segment)"}
            </p>
            <div className="space-y-2">
              {seg.items.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(s.done)}
                    disabled={!editable}
                    onChange={() => void toggleSubKpiDone(r.id, s)}
                  />
                  <span className={cn(Boolean(s.done) && "line-through text-zinc-500 dark:text-zinc-500")}>
                    {s.title}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  async function createMaintenanceRecord() {
    if (INSIGHTS_VIEW_ONLY) return;
    const title = maintenanceTitle.trim();
    if (!title) return;
    const freqUpper = maintenanceFrequency.toUpperCase() as KpiFrequencyCode;

    const body: Record<string, unknown> = {
      title,
      frequency: maintenanceFrequency,
      isRecurring: maintenanceIsRecurring,
    };
    if (draftUseSegments) {
      body.subKpisSegmented = true;
      body.segments = draftSegments.map((s) => ({
        label: s.label.trim(),
        items: s.items.map((it) => ({ title: it.title.trim() })),
      }));
    } else {
      body.subKpis = subKpisDraft.map((s) => ({ title: s.title }));
    }

    if (maintenanceIsRecurring && freqUpper === "WEEKLY") body.recurrenceWeekday = recurrenceWeekday;
    if (maintenanceIsRecurring && freqUpper === "MONTHLY") body.recurrenceMonthDay = recurrenceMonthDay;
    if (!maintenanceIsRecurring) {
      if (!nonRecurringStartDate || !nonRecurringEndDate) return;
      const startAt = new Date(`${nonRecurringStartDate}T00:00:00`);
      const endAt = new Date(`${nonRecurringEndDate}T23:59:59`);
      if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime())) return;
      if (endAt.getTime() <= startAt.getTime()) return;
      body.nonRecurringStartAt = startAt.toISOString();
      body.nonRecurringEndAt = endAt.toISOString();
    }
    body.timeZone = recurrenceTz;

    const res = await fetch(`/api/kpi-maintenance${kpiMaintenanceSearch}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const reload = await fetch(`/api/kpi-maintenance${kpiMaintenanceSearch}`, { cache: "no-store" });
      if (reload.ok) {
        const payload = (await reload.json()) as { rows: MaintenanceRecord[] };
        setMaintenanceRecords(payload.rows);
      }
    } else {
      const errBody = await res.json().catch(() => ({}));
      setError(typeof errBody.error === "string" ? errBody.error : "Could not save KPI.");
      return;
    }
    setError(null);
    setMaintenanceTitle("");
    setMaintenanceIsRecurring(true);
    setNonRecurringStartDate("");
    setNonRecurringEndDate("");
    setMaintenanceFrequency("Daily");
    setRecurrenceWeekday(1);
    setRecurrenceMonthDay(1);
    setSubKpisDraft([]);
    setSubKpiDraft("");
    setDraftUseSegments(false);
    setDraftSegments([]);
    setSegItemDraft({});
  }

  async function createTask() {
    if (INSIGHTS_VIEW_ONLY) return;
    if (!taskTitle.trim() || !taskAssignedToId) return;
    const res = await fetch("/api/task-management", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: taskTitle,
        description: taskDescription,
        dueAt: taskDueDate ? new Date(taskDueDate).toISOString() : undefined,
        assignedAgentId: taskAssignedToId,
        priority: taskPriority,
      }),
    });
    if (!res.ok) return;
    setTaskTitle("");
    setTaskDescription("");
    setTaskDueDate("");
    setTaskPriority("MEDIUM");
    setTaskAssignedToId("");
    const reload = await fetch("/api/task-management", { cache: "no-store" });
    if (reload.ok) {
      const payload = (await reload.json()) as { rows: TaskItem[] };
      setTasks(payload.rows);
    }
  }

  async function reloadTasks() {
    const reload = await fetch("/api/task-management", { cache: "no-store" });
    if (!reload.ok) return;
    const payload = (await reload.json()) as { rows: TaskItem[] };
    setTasks(payload.rows);
  }

  async function bulkMoveSelectedTasks(status: TaskItem["status"]) {
    if (INSIGHTS_VIEW_ONLY) return;
    if (taskSelectedIds.length === 0) return;
    const ids = tasks.filter((t) => taskSelectedIds.includes(t.id) && canEditTask(t)).map((t) => t.id);
    if (ids.length === 0) return;
    await Promise.all(
      ids.map((id) =>
        fetch("/api/task-management", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, status }),
        }).then((r) => {
          if (!r.ok) throw new Error("Task status update failed");
        }),
      ),
    ).catch(() => null);
    setTaskSelectedIds([]);
    setTaskDragOver(null);
    await reloadTasks();
  }

  async function autoMarkOverdueTasksDelayed() {
    if (INSIGHTS_VIEW_ONLY) return;
    if (autoDelayBusy) return;
    if (!operatorAgentId) return;
    const now = Date.now();
    const overdue = tasks.filter((t) => {
      if (!canEditTask(t)) return false;
      if (t.status !== "CURRENT") return false;
      if (!t.dueAt) return false;
      const due = new Date(t.dueAt).getTime();
      if (!Number.isFinite(due)) return false;
      return now > due;
    });
    if (overdue.length === 0) return;

    setAutoDelayBusy(true);
    try {
      await Promise.all(
        overdue.map((t) =>
          fetch("/api/task-management", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: t.id, status: "DELAYED" }),
          }),
        ),
      );
      await reloadTasks();
    } finally {
      setAutoDelayBusy(false);
    }
  }

  async function updateTaskStatus(id: string, status: TaskItem["status"]) {
    if (INSIGHTS_VIEW_ONLY) return;
    const res = await fetch("/api/task-management", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (!res.ok) return;
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status, updatedAt: new Date().toISOString() } : t)),
    );
    await loadTaskActivity(id);
  }

  async function loadTaskActivity(taskId: string) {
    const res = await fetch(`/api/task-management/${taskId}/activity`, { cache: "no-store" });
    if (!res.ok) return;
    const payload = (await res.json()) as { rows: TaskActivity[] };
    setTaskActivities((prev) => ({ ...prev, [taskId]: payload.rows }));
  }

  async function addTaskComment(taskId: string) {
    const comment = (taskCommentDraft[taskId] ?? "").trim();
    if (!comment) return;
    const res = await fetch(`/api/task-management/${taskId}/activity`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ comment }),
    });
    if (!res.ok) return;
    setTaskCommentDraft((prev) => ({ ...prev, [taskId]: "" }));
    await loadTaskActivity(taskId);
  }

  async function toggleSubKpiDone(recordId: string, subKpi: SubKpi) {
    if (INSIGHTS_VIEW_ONLY) return;
    const res = await fetch(`/api/kpi-maintenance${kpiMaintenanceSearch}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: recordId, subKpiId: subKpi.id, done: !subKpi.done }),
    });
    if (!res.ok) return;
    const reload = await fetch(`/api/kpi-maintenance${kpiMaintenanceSearch}`, { cache: "no-store" });
    if (!reload.ok) return;
    const payload = (await reload.json()) as { rows: MaintenanceRecord[] };
    setMaintenanceRecords(payload.rows);
  }

  async function markAllSubKpis(recordId: string, done: boolean) {
    if (INSIGHTS_VIEW_ONLY) return;
    const res = await fetch(`/api/kpi-maintenance${kpiMaintenanceSearch}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: recordId, markAllDone: done }),
    });
    if (!res.ok) return;
    const reload = await fetch(`/api/kpi-maintenance${kpiMaintenanceSearch}`, { cache: "no-store" });
    if (!reload.ok) return;
    const payload = (await reload.json()) as { rows: MaintenanceRecord[] };
    setMaintenanceRecords(payload.rows);
  }

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-6 text-zinc-900 sm:space-y-10 sm:py-8 md:py-10 dark:text-zinc-100">
      <header className="rounded-2xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 p-6 shadow-[0_12px_40px_rgba(0,0,0,0.06)] md:p-8 dark:border-zinc-800/90 dark:from-[#101010] dark:to-[#080808] dark:shadow-[0_20px_50px_rgba(0,0,0,0.4)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700 dark:text-orange-400/95">
              {BRAND_TITLE} · {isPersonnel ? "Personnal Metrics" : "Metrics & reports"}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 md:text-4xl dark:text-white">
              {isPersonnel ? "Personal performance intelligence" : "Operations intelligence"}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {isPersonnel
                ? "Live charts for your assigned queue, your SLA compliance, and your own throughput in the selected window."
                : "Live charts for intake vs closure, queue composition, SLA compliance, and throughput. Adjust the reporting window to align with your review cycle."}
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-3 text-sm lg:w-auto lg:justify-end">
            <label className="flex flex-col text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
              From
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1.5 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-orange-500/30 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <label className="flex flex-col text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
              To
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1.5 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-orange-500/30 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            {session?.user?.role === "SuperAdmin" || session?.user?.role === "Admin" ? (
              <div className="flex flex-col justify-end">
                <Button
                  type="button"
                  disabled={sweepBusy}
                  onClick={() => void runSlaSweep()}
                  className="h-[42px] rounded-xl px-5"
                >
                  {sweepBusy ? "Running SLA sweep..." : "Run SLA sweep"}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-6 inline-flex rounded-full border border-zinc-300 bg-zinc-100 p-1 text-xs font-semibold dark:border-zinc-700 dark:bg-zinc-900/90">
          <button
            type="button"
            onClick={() => setActiveTab("metrics")}
            className={cn(
              "rounded-full px-4 py-1.5 transition",
              activeTab === "metrics"
                ? "bg-orange-600 text-white shadow-sm"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200",
            )}
          >
            {isPersonnel ? "My Metrics & Reports" : "Metrics & Reports"}
          </button>
          {showKpiTasksTab ? (
            <button
              type="button"
              onClick={() => setActiveTab("kpi-mgmt")}
              className={cn(
                "rounded-full px-4 py-1.5 transition",
                activeTab === "kpi-mgmt"
                  ? "bg-orange-600 text-white shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200",
              )}
            >
              {isPersonnel ? "My Task Management" : "Task Management"}
            </button>
          ) : null}
        </div>
      </header>

      {sweepInfo ? (
        <p className="rounded-xl border border-orange-400/40 bg-orange-500/15 px-4 py-3 text-sm text-orange-950 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-100">
          {sweepInfo}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-red-500/35 bg-red-50 px-4 py-3 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {activeTab === "kpi-mgmt" ? (
        <div className="space-y-6">
          {!INSIGHTS_VIEW_ONLY ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_12px_36px_rgba(0,0,0,0.06)] sm:p-7 dark:border-zinc-800/90 dark:bg-[#0a0a0a] dark:shadow-[0_16px_48px_rgba(0,0,0,0.35)]">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600 dark:text-zinc-500">Task management</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Configure KPI checklist definitions here. Assignment and drag/board controls are handled in the Task Board.
            </p>
            {INSIGHTS_VIEW_ONLY ? (
              <p className="mt-2 rounded-lg border border-blue-300/40 bg-blue-100/40 px-3 py-2 text-xs text-blue-800 dark:border-blue-700/40 dark:bg-blue-950/30 dark:text-blue-300">
                View-only mode: KPI and task actions are handled in the Orchestration Board.
              </p>
            ) : null}

            {!INSIGHTS_VIEW_ONLY ? (
            <>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <input
                value={maintenanceTitle}
                onChange={(e) => setMaintenanceTitle(e.target.value)}
                placeholder="Task title (e.g., First-response SLA)"
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-orange-500/30 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
              <label className="flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                <input
                  type="checkbox"
                  checked={maintenanceIsRecurring}
                  onChange={(e) => setMaintenanceIsRecurring(e.target.checked)}
                />
                Recurring task
              </label>
              {!maintenanceIsRecurring ? (
                <>
                  <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
                    Start date
                    <input
                      type="date"
                      value={nonRecurringStartDate}
                      onChange={(e) => setNonRecurringStartDate(e.target.value)}
                      className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none ring-orange-500/30 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
                    End date
                    <input
                      type="date"
                      value={nonRecurringEndDate}
                      onChange={(e) => setNonRecurringEndDate(e.target.value)}
                      className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none ring-orange-500/30 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </label>
                </>
              ) : null}
              <select
                value={maintenanceFrequency}
                onChange={(e) => setMaintenanceFrequency(e.target.value as MaintenanceFrequency)}
                disabled={!maintenanceIsRecurring}
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-orange-500/30 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value="Daily">Daily</option>
                <option value="Weekly">Weekly</option>
                <option value="Monthly">Monthly</option>
              </select>
              {maintenanceIsRecurring && maintenanceFrequency === "Weekly" ? (
                <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
                  Week starts on ({recurrenceTz})
                  <select
                    value={recurrenceWeekday}
                    onChange={(e) => setRecurrenceWeekday(Number(e.target.value))}
                    className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none ring-orange-500/30 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    <option value={0}>Sunday</option>
                    <option value={1}>Monday</option>
                    <option value={2}>Tuesday</option>
                    <option value={3}>Wednesday</option>
                    <option value={4}>Thursday</option>
                    <option value={5}>Friday</option>
                    <option value={6}>Saturday</option>
                  </select>
                </label>
              ) : null}
              {maintenanceIsRecurring && maintenanceFrequency === "Monthly" ? (
                <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
                  Month cycle starts on day (1–31, {recurrenceTz})
                  <select
                    value={recurrenceMonthDay}
                    onChange={(e) => setRecurrenceMonthDay(Number(e.target.value))}
                    className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none ring-orange-500/30 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="rounded-xl border border-dashed border-zinc-300 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                Assignment moved to Task Board.
              </div>
            </div>

            {showSegmentedCreateOption && kpiMaintenanceAssignWork ? (
              <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={draftUseSegments}
                  onChange={(e) => setDraftSegmentedMode(e.target.checked)}
                />
                <span>
                  Segment this checklist ({MIN_SUB_FOR_SEGMENT_OPTION}+ sub-tasks). Each segment needs a{" "}
                  <strong>label</strong> before you add rows under it.
                </span>
              </label>
            ) : null}

            {!draftUseSegments ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  value={subKpiDraft}
                  onChange={(e) => setSubKpiDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSubKpiDraft();
                    }
                  }}
                  placeholder="Add sub-task (press Enter)"
                  className="min-w-[240px] flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-orange-500/30 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
                <Button type="button" onClick={addSubKpiDraft} className="rounded-xl px-4">
                  Add sub-task
                </Button>
                <Button
                  type="button"
                  onClick={() => void createMaintenanceRecord()}
                  className="rounded-xl px-4"
                >
                  Save KPI maintenance
                </Button>
              </div>
            ) : (
              <div className="mt-3 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" onClick={addDraftSegmentRow} className="rounded-xl">
                    Add segment
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void createMaintenanceRecord()}
                    className="rounded-xl px-4"
                  >
                    Save KPI maintenance
                  </Button>
                </div>
                {draftSegments.map((seg) => (
                  <div
                    key={seg.id}
                    className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-950/40"
                  >
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-500">
                        Segment label (required before items)
                        <input
                          value={seg.label}
                          onChange={(e) => updateDraftSegmentLabel(seg.id, e.target.value)}
                          placeholder="e.g. Week 1 — Response quality"
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                        />
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-rose-600 hover:text-rose-700 dark:text-rose-400"
                        onClick={() => removeDraftSegmentRow(seg.id)}
                      >
                        Remove segment
                      </Button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <input
                        value={segItemDraft[seg.id] ?? ""}
                        disabled={!seg.label.trim()}
                        onChange={(e) => setSegItemDraft((p) => ({ ...p, [seg.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            pushItemToDraftSegment(seg.id);
                          }
                        }}
                        placeholder={
                          seg.label.trim() ? "Add sub-task under this segment" : "Enter segment label first"
                        }
                        className="min-w-[200px] flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                      />
                      <Button
                        type="button"
                        disabled={!seg.label.trim()}
                        onClick={() => pushItemToDraftSegment(seg.id)}
                        className="rounded-lg px-3"
                      >
                        Add
                      </Button>
                    </div>
                    {seg.items.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {seg.items.map((it) => (
                          <button
                            key={it.id}
                            type="button"
                            onClick={() => removeDraftSegmentItem(seg.id, it.id)}
                            className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          >
                            {it.title} ×
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            {!draftUseSegments && subKpisDraft.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {subKpisDraft.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => removeSubKpiDraft(s.id)}
                    className="rounded-full border border-zinc-300 bg-zinc-100 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    title="Remove sub-task"
                  >
                    {s.title} ×
                  </button>
                ))}
              </div>
            ) : null}
            </>
            ) : null}
          </section>
          ) : null}

          {false ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_12px_36px_rgba(0,0,0,0.06)] sm:p-7 dark:border-zinc-800/90 dark:bg-[#0a0a0a] dark:shadow-[0_16px_48px_rgba(0,0,0,0.35)]">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600 dark:text-zinc-500">
                  KPI Kanban (drag to update)
                </h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Drag a KPI to <strong>Done</strong> to mark all subtasks done, or to <strong>Current</strong> to reset.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {(["CURRENT", "DONE", "DELAYED"] as const).map((col) => {
                const nowMs = Date.now();
                const list = maintenanceRecords
                  .filter((r) => deriveKpiBoardStatus(r, nowMs) === col)
                  .sort((a, b) => {
                    if (col !== "DELAYED") return 0;
                    return kpiIncompleteOverdueDelayMs(b, nowMs) - kpiIncompleteOverdueDelayMs(a, nowMs);
                  });
                const label = col === "CURRENT" ? "Current" : col === "DONE" ? "Done" : "Delayed";
                const colClass =
                  col === "CURRENT"
                    ? "border-blue-300 bg-blue-50/60 dark:border-blue-700/60 dark:bg-blue-950/20"
                    : col === "DONE"
                      ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-700/60 dark:bg-emerald-950/20"
                      : "border-rose-300 bg-rose-50/60 dark:border-rose-700/60 dark:bg-rose-950/20";

                return (
                  <div
                    key={col}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setKpiDragOver(col);
                    }}
                    onDragLeave={() => setKpiDragOver(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setKpiDragOver(null);
                      const recordId = e.dataTransfer.getData("text/kpi-id");
                      if (!recordId) return;
                      const target = maintenanceRecords.find((r) => r.id === recordId);
                      if (!target || !canEditKpi(target)) return;
                      void markAllSubKpis(recordId, col === "DONE");
                    }}
                    className={cn(
                      "min-h-[380px] rounded-2xl border p-3 transition",
                      kpiDragOver === col && "ring-2 ring-orange-500/60",
                      colClass,
                    )}
                  >
                    <div className="flex items-center justify-between gap-3 px-1">
                      <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                        {label}
                      </h4>
                      <span className="rounded-full bg-white/60 px-2 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-200">
                        {list.length}
                      </span>
                    </div>

                    <div className="mt-3 space-y-3">
                      {list.length === 0 ? (
                        <p className="px-2 py-8 text-center text-sm text-zinc-600 dark:text-zinc-400">
                          No KPIs in this column.
                        </p>
                      ) : (
                        list.map((r) => {
                          const canEditThisKpi = canEditKpi(r);
                          const periodEnd = kpiPeriodEndExclusive(r);
                          const { doneCount, total, percent } = kpiProgress(r);
                          const kpiDelayMs = kpiDoneDelayMs(r);
                          const incompleteOverdueMs = kpiIncompleteOverdueDelayMs(r, nowMs);
                          const dueLabel = !periodEnd || Number.isNaN(periodEnd.getTime())
                            ? "—"
                            : `Next period starts ${periodEnd.toLocaleString(undefined, { timeZone: recurrenceTz })} (${recurrenceTz})`;
                          const normView = normalizeSubKpis(r.subKpis);
                          return (
                            <article
                              key={r.id}
                              draggable={canEditThisKpi}
                              onDragStart={(e) => {
                                if (!canEditThisKpi) return;
                                e.dataTransfer.setData("text/kpi-id", r.id);
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              className={cn(
                                "cursor-grab rounded-xl border bg-white/60 p-4 shadow-sm dark:bg-zinc-950/30",
                                col === "CURRENT" && "border-blue-200/70",
                                col === "DONE" && "border-emerald-200/70",
                                col === "DELAYED" && "border-rose-200/70",
                              )}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{r.title}</p>
                                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                                    Assigned: {r.assignedAgent?.name ?? "Unassigned"}
                                  </p>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {normView.segmented ? (
                                    <span className="rounded-full border border-orange-400/60 bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-orange-900 dark:border-orange-500/35 dark:bg-orange-500/10 dark:text-orange-100">
                                      Segmented
                                    </span>
                                  ) : null}
                                  <span className="rounded-full border border-zinc-200 bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-200">
                                    {r.frequency}
                                  </span>
                                  {kpiDelayMs > 0 ? (
                                    <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                                      Done but delayed
                                    </span>
                                  ) : incompleteOverdueMs > 0 ? (
                                    <span className="rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-rose-800 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                                      Incomplete · delayed
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              <div className="mt-3">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                                    Progress
                                  </p>
                                  <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                                    {doneCount}/{total} · {percent}%
                                  </p>
                                </div>
                                <div className="mt-2 h-2 rounded-full bg-zinc-200/70 dark:bg-zinc-800/60">
                                  <div
                                    className={cn(
                                      "h-full rounded-full",
                                      col === "DONE"
                                        ? "bg-emerald-500"
                                        : col === "DELAYED"
                                          ? "bg-rose-500"
                                          : "bg-blue-500",
                                    )}
                                    style={{ width: `${percent}%` }}
                                  />
                                </div>
                                <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{dueLabel}</p>
                                {kpiDelayMs > 0 ? (
                                  <p className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                                    Delayed by {formatDelayDaysHours(kpiDelayMs)} before completion
                                  </p>
                                ) : incompleteOverdueMs > 0 ? (
                                  <p className="mt-1 text-xs font-semibold text-rose-700 dark:text-rose-300">
                                    Overdue by {formatDelayDaysHours(incompleteOverdueMs)} (days and hours past period
                                    end)
                                  </p>
                                ) : null}
                              </div>

                              {renderSubKpiChecklistBlock(r, canEditThisKpi)}
                              {canEditThisKpi ? (
                                <>
                                  <div className="mt-3 flex flex-wrap gap-2 border-t border-zinc-200/80 pt-3 dark:border-zinc-800">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="h-8 rounded-lg px-3 text-xs"
                                      onClick={() => {
                                        if (expandedEditKpiId === r.id) {
                                          setExpandedEditKpiId(null);
                                          setStructureEditDraft(null);
                                        } else {
                                          openStructureEdit(r);
                                        }
                                      }}
                                    >
                                      {expandedEditKpiId === r.id ? "Close editor" : "Edit checklist"}
                                    </Button>
                                  </div>
                                  {expandedEditKpiId === r.id && structureEditDraft ? (
                                    <div className="mt-3 rounded-xl border border-orange-400/35 bg-orange-500/10 p-3 dark:border-orange-500/25 dark:bg-orange-950/20">
                                      <p className="text-xs font-semibold text-orange-950 dark:text-orange-100">
                                        Change segment labels or sub-task titles. Use the add controls below to append
                                        another sub-task while editing. Removing items updates the checklist structure;
                                        checkbox progress is preserved for matching IDs.
                                      </p>
                                      {structureEditDraft.segmented ? (
                                        <div className="mt-3 space-y-3">
                                          <Button
                                            type="button"
                                            variant="outline"
                                            className="h-8 rounded-lg text-xs"
                                            onClick={() =>
                                              setStructureEditDraft((prev) =>
                                                prev
                                                  ? {
                                                      ...prev,
                                                      segments: [
                                                        ...prev.segments,
                                                        {
                                                          id: crypto.randomUUID(),
                                                          label: "",
                                                          items: [],
                                                        },
                                                      ],
                                                    }
                                                  : null,
                                              )
                                            }
                                          >
                                            Add segment
                                          </Button>
                                          {structureEditDraft.segments.map((seg) => (
                                            <div
                                              key={seg.id}
                                              className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-950/60"
                                            >
                                              <input
                                                value={seg.label}
                                                placeholder="Segment label"
                                                className="mb-2 w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                                                onChange={(e) =>
                                                  setStructureEditDraft((prev) => {
                                                    if (!prev?.segmented) return prev;
                                                    return {
                                                      ...prev,
                                                      segments: prev.segments.map((s) =>
                                                        s.id === seg.id ? { ...s, label: e.target.value } : s,
                                                      ),
                                                    };
                                                  })
                                                }
                                              />
                                              <div className="space-y-2">
                                                {seg.items.map((it) => (
                                                  <div key={it.id} className="flex gap-2">
                                                    <input
                                                      value={it.title}
                                                      className="min-w-0 flex-1 rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                                                      onChange={(e) =>
                                                        setStructureEditDraft((prev) => {
                                                          if (!prev?.segmented) return prev;
                                                          return {
                                                            ...prev,
                                                            segments: prev.segments.map((s) =>
                                                              s.id === seg.id
                                                                ? {
                                                                    ...s,
                                                                    items: s.items.map((row) =>
                                                                      row.id === it.id
                                                                        ? {
                                                                            ...row,
                                                                            title: e.target.value,
                                                                          }
                                                                        : row,
                                                                    ),
                                                                  }
                                                                : s,
                                                            ),
                                                          };
                                                        })
                                                      }
                                                    />
                                                    <button
                                                      type="button"
                                                      className="text-xs text-rose-600 dark:text-rose-400"
                                                      onClick={() =>
                                                        setStructureEditDraft((prev) => {
                                                          if (!prev?.segmented) return prev;
                                                          return {
                                                            ...prev,
                                                            segments: prev.segments.map((s) =>
                                                              s.id === seg.id
                                                                ? {
                                                                    ...s,
                                                                    items: s.items.filter((row) => row.id !== it.id),
                                                                  }
                                                                : s,
                                                            ),
                                                          };
                                                        })
                                                      }
                                                    >
                                                      Remove
                                                    </button>
                                                  </div>
                                                ))}
                                              </div>
                                              <div className="mt-2 flex gap-2">
                                                <input
                                                  value={editSegItemDraft[seg.id] ?? ""}
                                                  placeholder={
                                                    seg.label.trim()
                                                      ? "Add another sub-task"
                                                      : "Set segment label first"
                                                  }
                                                  disabled={!seg.label.trim()}
                                                  className="min-w-0 flex-1 rounded border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950"
                                                  onChange={(e) =>
                                                    setEditSegItemDraft((p) => ({ ...p, [seg.id]: e.target.value }))
                                                  }
                                                  onKeyDown={(e) => {
                                                    if (e.key === "Enter") {
                                                      e.preventDefault();
                                                      const raw = (editSegItemDraft[seg.id] ?? "").trim();
                                                      if (!raw || !seg.label.trim()) return;
                                                      setStructureEditDraft((prev) => {
                                                        if (!prev?.segmented) return prev;
                                                        return {
                                                          ...prev,
                                                          segments: prev.segments.map((s) =>
                                                            s.id === seg.id
                                                              ? {
                                                                  ...s,
                                                                  items: [
                                                                    ...s.items,
                                                                    {
                                                                      id: crypto.randomUUID(),
                                                                      title: raw,
                                                                      done: false,
                                                                    },
                                                                  ],
                                                                }
                                                              : s,
                                                          ),
                                                        };
                                                      });
                                                      setEditSegItemDraft((p) => ({ ...p, [seg.id]: "" }));
                                                    }
                                                  }}
                                                />
                                                <Button
                                                  type="button"
                                                  className="h-7 shrink-0 px-2 text-xs"
                                                  disabled={!seg.label.trim()}
                                                  onClick={() => {
                                                    const raw = (editSegItemDraft[seg.id] ?? "").trim();
                                                    if (!raw || !seg.label.trim()) return;
                                                    setStructureEditDraft((prev) => {
                                                      if (!prev?.segmented) return prev;
                                                      return {
                                                        ...prev,
                                                        segments: prev.segments.map((s) =>
                                                          s.id === seg.id
                                                            ? {
                                                                ...s,
                                                                items: [
                                                                  ...s.items,
                                                                  {
                                                                    id: crypto.randomUUID(),
                                                                    title: raw,
                                                                    done: false,
                                                                  },
                                                                ],
                                                              }
                                                            : s,
                                                        ),
                                                      };
                                                    });
                                                    setEditSegItemDraft((p) => ({ ...p, [seg.id]: "" }));
                                                  }}
                                                >
                                                  Add another sub-task
                                                </Button>
                                              </div>
                                              <button
                                                type="button"
                                                className="mt-2 text-xs text-rose-600 dark:text-rose-400"
                                                onClick={() =>
                                                  setStructureEditDraft((prev) =>
                                                    prev?.segmented
                                                      ? {
                                                          ...prev,
                                                          segments: prev.segments.filter((s) => s.id !== seg.id),
                                                        }
                                                      : prev,
                                                  )
                                                }
                                              >
                                                Remove segment
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="mt-3 space-y-2">
                                          {structureEditDraft.flat.map((it) => (
                                            <div key={it.id} className="flex gap-2">
                                              <input
                                                value={it.title}
                                                className="min-w-0 flex-1 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                                                onChange={(e) =>
                                                  setStructureEditDraft((prev) =>
                                                    prev && !prev.segmented
                                                      ? {
                                                          ...prev,
                                                          flat: prev.flat.map((row) =>
                                                            row.id === it.id
                                                              ? { ...row, title: e.target.value }
                                                              : row,
                                                          ),
                                                        }
                                                      : prev,
                                                  )
                                                }
                                              />
                                              <button
                                                type="button"
                                                className="text-xs text-rose-600 dark:text-rose-400"
                                                onClick={() =>
                                                  setStructureEditDraft((prev) =>
                                                    prev && !prev.segmented
                                                      ? {
                                                          ...prev,
                                                          flat: prev.flat.filter((row) => row.id !== it.id),
                                                        }
                                                      : prev,
                                                  )
                                                }
                                              >
                                                Remove
                                              </button>
                                            </div>
                                          ))}
                                          <Button
                                            type="button"
                                            variant="outline"
                                            className="h-8 rounded-lg text-xs"
                                            onClick={() =>
                                              setStructureEditDraft((prev) =>
                                                prev && !prev.segmented
                                                  ? {
                                                      ...prev,
                                                      flat: [
                                                        ...prev.flat,
                                                        {
                                                          id: crypto.randomUUID(),
                                                          title: "",
                                                          done: false,
                                                        },
                                                      ],
                                                    }
                                                  : prev,
                                              )
                                            }
                                          >
                                            Add another sub-task
                                          </Button>
                                        </div>
                                      )}
                                      <div className="mt-4 flex flex-wrap gap-2">
                                        <Button
                                          type="button"
                                          className="rounded-xl px-4"
                                          onClick={() => void saveStructureEdit(r.id)}
                                        >
                                          Save changes
                                        </Button>
                                      </div>
                                    </div>
                                  ) : null}
                                </>
                              ) : null}
                            </article>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          ) : null}

          {false && !INSIGHTS_VIEW_ONLY && canAssignKpi ? (
            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_12px_36px_rgba(0,0,0,0.06)] sm:p-7 dark:border-zinc-800/90 dark:bg-[#0a0a0a] dark:shadow-[0_16px_48px_rgba(0,0,0,0.35)]">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600 dark:text-zinc-500">
                Create task
              </h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Task title" className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
                <input value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)} type="date" className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
                <select value={taskPriority} onChange={(e) => setTaskPriority(e.target.value)} className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
                <textarea value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} placeholder="Description" className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none md:col-span-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
                <select value={taskAssignedToId} onChange={(e) => setTaskAssignedToId(e.target.value)} className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none md:col-span-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                  <option value="">Assign to personnel/head role…</option>
                  {assignableAgents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.roleLabel} · {a.teamName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-4">
                <Button type="button" onClick={() => void createTask()}>Send task</Button>
              </div>
            </section>
          ) : null}
          {false && !isPersonnel ? (() => {
            const total = tasks.length;
            const done = tasks.filter((t) => t.status === "DONE").length;
            const delayed = tasks.filter((t) => t.status === "DELAYED").length;
            const dueAssigned = tasks.filter((t) => Boolean(t.dueAt)).length;
            const achieved = tasks.filter((t) => taskAchievedOnTime(t)).length;
            const editableSelectedCount = tasks.filter(
              (t) => taskSelectedIds.includes(t.id) && canEditTask(t),
            ).length;
            const achievedRate =
              dueAssigned === 0 ? (total === 0 ? 0 : done === total ? 100 : 0) : Math.round((achieved / dueAssigned) * 100);

            return (
              <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_12px_36px_rgba(0,0,0,0.06)] sm:p-7 dark:border-zinc-800/90 dark:bg-[#0a0a0a] dark:shadow-[0_16px_48px_rgba(0,0,0,0.35)]">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <h2 className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600 dark:text-zinc-500">
                      Task metrics
                    </h2>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      Achievement uses your completion time (status=Done) vs due date.
                    </p>
                  </div>
                  {editableSelectedCount > 0 ? (
                    <div className="flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-900 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-100">
                      {editableSelectedCount} selected
                    </div>
                  ) : null}
                </div>

                {editableSelectedCount > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl border-zinc-300 px-4"
                      onClick={() => void bulkMoveSelectedTasks("CURRENT")}
                    >
                      Move to Current
                    </Button>
                    <Button
                      type="button"
                      className="rounded-xl bg-emerald-600 px-4 hover:bg-emerald-500"
                      onClick={() => void bulkMoveSelectedTasks("DONE")}
                    >
                      Move to Done
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl border-rose-300 bg-rose-50 px-4 dark:border-rose-700 dark:bg-rose-950/20"
                      onClick={() => void bulkMoveSelectedTasks("DELAYED")}
                    >
                      Move to Delayed
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="rounded-xl px-3 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                      onClick={() => setTaskSelectedIds([])}
                    >
                      Clear selection
                    </Button>
                  </div>
                ) : null}

                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricTile label="Assigned tasks" value={String(total)} accent />
                  <MetricTile label="Done tasks" value={String(done)} />
                  <MetricTile label="Delayed tasks" value={String(delayed)} />
                  <MetricTile label="On-time achievement" value={`${achievedRate}%`} />
                </div>
              </section>
            );
          })() : null}

          {false && !isPersonnel ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_12px_36px_rgba(0,0,0,0.06)] sm:p-7 dark:border-zinc-800/90 dark:bg-[#0a0a0a] dark:shadow-[0_16px_48px_rgba(0,0,0,0.35)]">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600 dark:text-zinc-500">
                  Task Kanban (drag cards)
                </h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Drag to change status. Use checkboxes for bulk moves.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {(["CURRENT", "DONE", "DELAYED"] as const).map((col) => {
                const list = tasks.filter((t) => taskDerivedStatus(t) === col);
                const label = col === "CURRENT" ? "Current" : col === "DONE" ? "Done" : "Delayed";
                const colClass =
                  col === "CURRENT"
                    ? "border-blue-300 bg-blue-50/60 dark:border-blue-700/60 dark:bg-blue-950/20"
                    : col === "DONE"
                      ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-700/60 dark:bg-emerald-950/20"
                      : "border-rose-300 bg-rose-50/60 dark:border-rose-700/60 dark:bg-rose-950/20";

                return (
                  <div
                    key={col}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setTaskDragOver(col);
                    }}
                    onDragLeave={() => setTaskDragOver(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setTaskDragOver(null);
                      const taskId = e.dataTransfer.getData("text/task-id");
                      if (!taskId) return;
                      const targetTask = tasks.find((t) => t.id === taskId);
                      if (!targetTask || !canEditTask(targetTask)) return;
                      void updateTaskStatus(taskId, col);
                    }}
                    className={cn(
                      "min-h-[380px] rounded-2xl border p-3 transition",
                      taskDragOver === col && "ring-2 ring-orange-500/60",
                      colClass,
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
                        <p className="px-2 py-8 text-center text-sm text-zinc-600 dark:text-zinc-400">
                          No tasks here.
                        </p>
                      ) : (
                        list.map((task) => {
                          const canEditThisTask = canEditTask(task);
                          const doneDelayMs = taskDoneDelayMs(task);
                          return (
                          <article
                            key={task.id}
                            draggable={canEditThisTask}
                            onDragStart={(e) => {
                              if (!canEditThisTask) return;
                              const el = e.target as HTMLElement | null;
                              if (el?.closest("input,button,select,textarea,label,summary,a")) {
                                e.preventDefault();
                                return;
                              }
                              e.dataTransfer.setData("text/task-id", task.id);
                              e.dataTransfer.effectAllowed = "move";
                            }}
                            className={cn(
                              "rounded-xl border bg-white/60 p-4 shadow-sm dark:bg-zinc-950/30",
                              col === "CURRENT" && "border-blue-200/70",
                              col === "DONE" && "border-emerald-200/70",
                              col === "DELAYED" && "border-rose-200/70",
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              {canEditThisTask ? (
                                <label className="flex cursor-pointer items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={taskSelectedIds.includes(task.id)}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      setTaskSelectedIds((prev) =>
                                        checked
                                          ? [...prev, task.id]
                                          : prev.filter((id) => id !== task.id),
                                      );
                                    }}
                                  />
                                  <span className="sr-only">Select task</span>
                                </label>
                              ) : null}
                              {taskAchievedOnTime(task) && task.status === "DONE" ? (
                                <span className="rounded-full bg-emerald-600/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                                  On-time
                                </span>
                              ) : null}
                              {doneDelayMs > 0 ? (
                                <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                                  Delayed
                                </span>
                              ) : null}
                            </div>

                            <div className="mt-2">
                              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{task.title}</p>
                              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                                Assigned to {task.assignedAgent?.name ?? "Unassigned"} ·{" "}
                                {task.dueAt ? `Due ${new Date(task.dueAt).toLocaleDateString()}` : "No due date"}
                              </p>
                              {doneDelayMs > 0 ? (
                                <p className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                                  Delayed by {formatDelayDaysHours(doneDelayMs)} before completion
                                </p>
                              ) : null}
                              <span className={cn(
                                "mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                task.priority === "LOW" && "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
                                task.priority === "MEDIUM" && "border-blue-300 bg-blue-100 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
                                task.priority === "HIGH" && "border-orange-300 bg-orange-100 text-orange-700 dark:border-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
                                task.priority === "URGENT" && "border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
                              )}>
                                {task.priority ?? "MEDIUM"}
                              </span>
                              {task.description ? (
                                <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{task.description}</p>
                              ) : null}
                            </div>

                            <details className="mt-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                              <summary
                                className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400"
                                onClick={() => void loadTaskActivity(task.id)}
                              >
                                Activity & Comments
                              </summary>
                              <div className="mt-3 space-y-2">
                                {(taskActivities[task.id] ?? []).map((a) => (
                                  <div
                                    key={a.id}
                                    className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-950/40"
                                  >
                                    <p className="font-semibold">
                                      {a.action} · {a.author}
                                    </p>
                                    {a.detail ? (
                                      <p className="mt-1 text-zinc-600 dark:text-zinc-400">{a.detail}</p>
                                    ) : null}
                                  </div>
                                ))}
                                <div className="flex gap-2">
                                  <input
                                    value={taskCommentDraft[task.id] ?? ""}
                                    onChange={(e) =>
                                      setTaskCommentDraft((prev) => ({ ...prev, [task.id]: e.target.value }))
                                    }
                                    placeholder="Add comment..."
                                    className="flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                                  />
                                  <Button
                                    type="button"
                                    className="h-7 px-3 text-xs"
                                    onClick={() => void addTaskComment(task.id)}
                                  >
                                    Post
                                  </Button>
                                </div>
                              </div>
                            </details>
                          </article>
                        );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {tasks.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-500">No tasks available.</p>
            ) : null}
          </section>
          ) : null}
        </div>
      ) : !data ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-500">Loading metrics…</p>
      ) : (
        <div className="space-y-8">
          <TaskMetricsPanel maintenanceRecords={maintenanceRecords} recurrenceTz={recurrenceTz} />
          {/* Trend chart */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_12px_36px_rgba(0,0,0,0.06)] sm:p-7 dark:border-zinc-800/90 dark:bg-[#0a0a0a] dark:shadow-[0_16px_48px_rgba(0,0,0,0.35)]">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600 dark:text-zinc-500">
                  Volume trend
                </h2>
                <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  Created vs closed (UTC days)
                </p>
              </div>
              <div className="flex flex-wrap gap-4 text-right text-xs text-zinc-600 dark:text-zinc-500">
                <div>
                  <span className="block text-[10px] uppercase tracking-wider">Created in range</span>
                  <span className="text-lg font-bold tabular-nums text-orange-700 dark:text-orange-400">
                    {data.operational.ticketVolume}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase tracking-wider">Closed in range</span>
                  <span className="text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-200">
                    {data.sla.ticketsClosedInRange}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-6">
              <MetricsTrendChart
                labels={charts.days}
                created={charts.createdByDay}
                closed={charts.closedByDay}
              />
            </div>
          </section>

          {/* Queue + SLA gauges */}
          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-7 dark:border-zinc-800/90 dark:bg-[#0a0a0a]">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600 dark:text-zinc-500">
                Open queue mix
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Non-closed tickets by status ({data.operational.backlogSize} total open)
              </p>
              <div className="mt-6">
                <MetricsQueueStrip segments={charts.queueStatusMix} />
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-7 dark:border-zinc-800/90 dark:bg-[#0a0a0a]">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600 dark:text-zinc-500">
                SLA compliance
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Sample-based within the selected window</p>
              <div className="mt-4 grid grid-cols-2 gap-4 border-t border-zinc-200 pt-6 dark:border-zinc-800/80">
                <MetricsGauge
                  label="First response"
                  value={data.sla.firstResponseComplianceRate}
                  sub="Met ÷ sampled"
                />
                <MetricsGauge
                  label="Resolution"
                  value={data.sla.resolutionComplianceRate}
                  sub="Met ÷ sampled"
                />
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3 border-t border-zinc-200 pt-6 text-center dark:border-zinc-800/80">
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950/60">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
                    Escalation rate
                  </p>
                  <p className="mt-1 text-xl font-bold text-orange-700 dark:text-orange-300">
                    {pct(data.sla.escalationRate)}
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950/60">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
                    Reopen rate
                  </p>
                  <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-200">{pct(data.sla.reopenRate)}</p>
                </div>
              </div>
            </div>
          </section>

          {/* Operational + Quality grids */}
          <section>
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-600 dark:text-zinc-500">
              Operational load
            </h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3 lg:grid-cols-5">
              <MetricTile label="Ticket volume" value={String(data.operational.ticketVolume)} accent />
              <MetricTile label="Backlog (open)" value={String(data.operational.backlogSize)} />
              <MetricTile label="Avg first response" value={formatDuration(data.operational.firstResponseTimeMsAvg)} />
              <MetricTile label="Avg resolution time" value={formatDuration(data.operational.resolutionTimeMsAvg)} />
              <MetricTile
                label="First-contact resolution"
                value={pct(data.operational.firstContactResolutionApprox)}
                hint="Approximation"
              />
              <MetricTile label="KPIs added" value={String(data.kpiManagement?.kpisAdded ?? 0)} accent />
            </div>
          </section>

          <section>
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-600 dark:text-zinc-500">
              Quality &amp; signals
            </h2>
            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <MetricTile label="Avg CSAT" value={data.quality.csatAvg ? data.quality.csatAvg.toFixed(2) : "—"} />
              <MetricTile label="Avg NPS" value={data.quality.npsAvg ? data.quality.npsAvg.toFixed(2) : "—"} />
              <MetricTile label="Avg CES" value={data.quality.cesAvg ? data.quality.cesAvg.toFixed(2) : "—"} />
              <MetricTile label="Feedback responses" value={String(data.quality.feedbackCount)} accent />
            </div>
          </section>

          {/* Agent bar chart */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-7 dark:border-zinc-800/90 dark:bg-[#0a0a0a]">
            <MetricsBarChart title="Top closers · tickets closed in range" rows={agentBars} />
          </section>

          {/* Throughput table */}
          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_8px_28px_rgba(0,0,0,0.06)] dark:border-zinc-800/90 dark:bg-[#080808] dark:shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-4 dark:border-zinc-800/80 sm:px-6">
              <div>
                <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-600 dark:text-zinc-500">
                  Agent throughput
                </h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-500">
                  Detailed roster · same window as charts above
                </p>
              </div>
              <div className="inline-flex rounded-full border border-zinc-300 bg-zinc-100 p-1 text-xs font-semibold dark:border-zinc-700 dark:bg-zinc-900/90">
                <button
                  type="button"
                  onClick={() => setThroughputView("cards")}
                  className={cn(
                    "rounded-full px-4 py-1.5 transition",
                    throughputView === "cards"
                      ? "bg-orange-600 text-white shadow-sm"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200",
                  )}
                >
                  Cards
                </button>
                <button
                  type="button"
                  onClick={() => setThroughputView("table")}
                  className={cn(
                    "rounded-full px-4 py-1.5 transition",
                    throughputView === "table"
                      ? "bg-orange-600 text-white shadow-sm"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200",
                  )}
                >
                  Table
                </button>
              </div>
            </div>

            {throughputView === "cards" ? (
              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 lg:p-6">
                {data.agents.ticketsClosedByAgent.length === 0 ? (
                  <article className="col-span-full rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-12 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/40 dark:text-zinc-500">
                    No closures in this range yet.
                  </article>
                ) : (
                  data.agents.ticketsClosedByAgent.map((row) => (
                    <article
                      key={row.agentId}
                      className="rounded-xl border border-zinc-200 bg-gradient-to-b from-zinc-50 to-white p-5 shadow-inner dark:border-zinc-800 dark:from-zinc-900/80 dark:to-zinc-950"
                    >
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white">{row.name}</p>
                      <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
                        Tickets closed
                      </p>
                      <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-orange-700 dark:text-orange-400">
                        {row.ticketsClosed}
                      </p>
                    </article>
                  ))
                )}
              </div>
            ) : (
              <div className="overflow-x-auto px-2 pb-3 pt-1 sm:px-4 sm:pb-5">
                <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800/90">
                  <thead className="bg-zinc-100 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-600 dark:bg-zinc-900/80 dark:text-zinc-500">
                    <tr>
                      <th className="px-4 py-3.5 sm:px-6">Agent</th>
                      <th className="px-4 py-3.5 sm:px-6">Tickets closed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
                    {data.agents.ticketsClosedByAgent.length === 0 ? (
                      <tr>
                        <td className="px-4 py-14 text-center text-sm text-zinc-600 dark:text-zinc-500 sm:px-6" colSpan={2}>
                          No closures in this range yet.
                        </td>
                      </tr>
                    ) : (
                      data.agents.ticketsClosedByAgent.map((row) => (
                        <tr
                          key={row.agentId}
                          className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                        >
                          <td className="px-4 py-3.5 font-medium text-zinc-900 dark:text-zinc-100 sm:px-6">{row.name}</td>
                          <td className="px-4 py-3.5 font-mono tabular-nums text-orange-700 dark:text-orange-300 sm:px-6">
                            {row.ticketsClosed}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <p className="border-t border-zinc-200 px-4 py-3 text-xs text-zinc-600 dark:border-zinc-800/80 dark:text-zinc-600 sm:px-6">
              Utilization and audit-quality scores require scheduling integrations beyond this schema.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}

function kpiPanelProgress(record: MaintenanceRecord) {
  const all = collectAllSubKpiItems(normalizeSubKpis(record.subKpis));
  return { total: all.length, done: all.filter((s) => s.done).length };
}

type TaskMetricsStatusView = "general" | "current" | "done" | "delayed";

const TASK_PIE_OTHER = "#a1a1aa";

function TaskMetricsPanel({
  maintenanceRecords,
  recurrenceTz,
}: {
  maintenanceRecords: MaintenanceRecord[];
  recurrenceTz: string;
}) {
  const [freq, setFreq] = useState<KpiFrequencyCode>("DAILY");
  const [statusView, setStatusView] = useState<TaskMetricsStatusView>("general");
  const scoped = useMemo(
    () => maintenanceRecords.filter((r) => r.isRecurring !== false && r.frequency === freq),
    [maintenanceRecords, freq],
  );
  const nowMs = Date.now();
  let doneN = 0;
  let delayedN = 0;
  let currentN = 0;
  for (const r of scoped) {
    const p = kpiPanelProgress(r);
    const st = taskKanbanDerivedStatus(r, {
      total: p.total,
      done: p.done,
      nowMs,
      timeZone: recurrenceTz,
    });
    if (st === "DONE") doneN += 1;
    else if (st === "DELAYED") delayedN += 1;
    else currentN += 1;
  }

  const { pieSegments, pieSubtitle } = useMemo(() => {
    switch (statusView) {
      case "general":
        return {
          pieSegments: [
            { label: "Current", value: currentN, color: "#3b82f6" },
            { label: "Done", value: doneN, color: "#10b981" },
            { label: "Delayed", value: delayedN, color: "#f43f5e" },
          ],
          pieSubtitle: "All statuses for the selected cadence (current · done · delayed).",
        };
      case "current": {
        const other = doneN + delayedN;
        return {
          pieSegments: [
            { label: "Current", value: currentN, color: "#3b82f6" },
            { label: "Other", value: other, color: TASK_PIE_OTHER },
          ],
          pieSubtitle: "Current tasks vs all other statuses in this cadence.",
        };
      }
      case "done": {
        const other = currentN + delayedN;
        return {
          pieSegments: [
            { label: "Done", value: doneN, color: "#10b981" },
            { label: "Other", value: other, color: TASK_PIE_OTHER },
          ],
          pieSubtitle: "Done tasks vs all other statuses in this cadence.",
        };
      }
      case "delayed": {
        const other = currentN + doneN;
        return {
          pieSegments: [
            { label: "Delayed", value: delayedN, color: "#f43f5e" },
            { label: "Other", value: other, color: TASK_PIE_OTHER },
          ],
          pieSubtitle: "Delayed tasks vs all other statuses in this cadence.",
        };
      }
    }
  }, [statusView, currentN, doneN, delayedN]);

  const statusToggleDefs: Array<{ id: TaskMetricsStatusView; label: string }> = [
    { id: "general", label: "General" },
    { id: "current", label: "Current" },
    { id: "done", label: "Done" },
    { id: "delayed", label: "Delayed" },
  ];

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_12px_36px_rgba(0,0,0,0.06)] sm:p-7 dark:border-zinc-800/90 dark:bg-[#0a0a0a] dark:shadow-[0_16px_48px_rgba(0,0,0,0.35)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600 dark:text-zinc-500">
            Task metrics
          </h3>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Recurring maintenance tasks by kanban status. One-off tasks are excluded from the pie.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          <div className="flex flex-col gap-1.5 sm:items-end">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">
              Cadence
            </span>
            <div className="inline-flex flex-wrap gap-1.5 rounded-xl border border-zinc-200 bg-zinc-100/80 p-1 dark:border-zinc-700 dark:bg-zinc-900/60">
              {(["DAILY", "WEEKLY", "MONTHLY"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFreq(f)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                    freq === f
                      ? "bg-orange-600 text-white shadow-sm"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
                  )}
                >
                  {f === "DAILY" ? "Daily" : f === "WEEKLY" ? "Weekly" : "Monthly"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5 sm:items-end">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">
              View
            </span>
            <div className="inline-flex flex-wrap gap-1.5 rounded-xl border border-zinc-200 bg-zinc-100/80 p-1 dark:border-zinc-700 dark:bg-zinc-900/60">
              {statusToggleDefs.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setStatusView(id)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                    statusView === id
                      ? "bg-orange-600 text-white shadow-sm"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-6">
        <MetricsPieChart
          title="Task status distribution"
          subtitle={pieSubtitle}
          itemsLabel={(n) => `${n} task${n === 1 ? "" : "s"}`}
          emptyDescription="No recurring tasks for this frequency in scope."
          pieClassName="h-52 w-52 sm:h-60 sm:w-60"
          segments={pieSegments}
        />
      </div>
    </section>
  );
}

function MetricTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <article
      className={cn(
        "rounded-2xl border p-4 shadow-sm transition",
        accent
          ? "border-orange-400/40 bg-gradient-to-br from-orange-500/15 to-zinc-50 dark:border-orange-500/35 dark:from-orange-500/10 dark:to-zinc-950"
          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950/60",
      )}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">{label}</p>
      <p
        className={cn(
          "mt-2 text-2xl font-bold tabular-nums",
          accent ? "text-orange-800 dark:text-orange-300" : "text-zinc-900 dark:text-white",
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-2 text-[11px] text-zinc-600 dark:text-zinc-600">{hint}</p>
      ) : null}
    </article>
  );
}
