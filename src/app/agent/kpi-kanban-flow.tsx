"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, GripVertical, Maximize2, X } from "lucide-react";
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
  IT_PROJECT_PRIORITY_OPTIONS,
  IT_PROJECT_STATUS_OPTIONS,
  isItProjectSubTaskDelayed,
  itProjectStatusProgress,
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
  getTaskPriority,
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

type KpiBoardStatus = "CURRENT" | "DONE" | "DELAYED";

const ASSIGNMENT_COMPANY_ALL = "ALL";
const ASSIGNMENT_NO_COMPANY = "__NO_COMPANY__";
const ASSIGNMENT_COMPANY_DROP_PREFIX = "__COMPANY__:";
const ASSIGNMENT_USER_DROP_PREFIX = "__USER__:";

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
  portalRole?: string | null;
  headPrivileges?: boolean;
  team?: { id?: string | null; name?: string | null } | null;
  assignmentCompany?: { id?: string | null; name?: string | null } | null;
};

type CompanyFilterOption = {
  id: string;
  name: string;
};

type AssignmentCompanyOption = CompanyFilterOption & {
  agentCount: number;
};

function assignmentCompanyKey(agent: AssignableAgent): string {
  return (
    agent.assignmentCompany?.id ??
    (agent.assignmentCompany?.name ? `name:${agent.assignmentCompany.name.trim().toLowerCase()}` : ASSIGNMENT_NO_COMPANY)
  );
}

function assignmentCompanyName(agent: AssignableAgent): string {
  return agent.assignmentCompany?.name?.trim() || "No assigned company";
}

function assignmentRoleLabel(agent: AssignableAgent): "Admin" | "Personnel" {
  return agent.portalRole === "Admin" || agent.headPrivileges ? "Admin" : "Personnel";
}

function sortAssignmentAgentsByRole(list: AssignableAgent[]): AssignableAgent[] {
  return [...list].sort((a, b) => {
    const roleDiff = (assignmentRoleLabel(a) === "Admin" ? 0 : 1) - (assignmentRoleLabel(b) === "Admin" ? 0 : 1);
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
  companyFilterOptions = [],
  currentCompanyFilter = "ALL",
  showAdminTaskManagement = false,
}: {
  /** When set, loads KPI rows and assignment lanes for this SBU only (personnel designated company). */
  companyFilterTeamId?: string | null;
  /** Company choices shown inside the Task Assignment Board. */
  companyFilterOptions?: CompanyFilterOption[];
  /** Current company query value. */
  currentCompanyFilter?: string;
  /** SuperAdmin / Admin: KPI definition form (moved from Ticket Metrics and Reports). */
  showAdminTaskManagement?: boolean;
} = {}) {
  const [rows, setRows] = useState<KpiRecord[]>([]);
  const [agents, setAgents] = useState<AssignableAgent[]>([]);
  const [allAssignableAgents, setAllAssignableAgents] = useState<AssignableAgent[]>([]);
  const [canAssignWork, setCanAssignWork] = useState(false);
  const [canUnassignWork, setCanUnassignWork] = useState(false);
  const [canCompleteUnassignedWork, setCanCompleteUnassignedWork] = useState(false);
  const [operatorAgentId, setOperatorAgentId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tz, setTz] = useState(DEFAULT_TIME_ZONE);
  const [nowMs, setNowMs] = useState(0);
  const [assignmentCompanyId, setAssignmentCompanyId] = useState(
    currentCompanyFilter !== ASSIGNMENT_COMPANY_ALL ? currentCompanyFilter : ASSIGNMENT_COMPANY_ALL,
  );
  const [dragRevealCompanyId, setDragRevealCompanyId] = useState<string | null>(null);
  const [openSubtaskDrawers, setOpenSubtaskDrawers] = useState<Set<string>>(() => new Set());
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [subAssigneePeersByMainId, setSubAssigneePeersByMainId] = useState<Record<string, AssignableAgent[]>>({});
  const subAssigneePeersFetchedRef = useRef(new Set<string>());

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
    const [permRes, agentsRes, allAgentsRes] = await Promise.all([
      fetch("/api/me/permissions", { cache: "no-store" }),
      fetch(agentsUrl, { cache: "no-store" }),
      fetch("/api/agents", { cache: "no-store" }),
    ]);
    if (permRes.ok) {
      const p = (await permRes.json()) as { operatorAgentId?: string | null };
      setOperatorAgentId(p.operatorAgentId ?? null);
    }
    if (agentsRes.ok) {
      const a = (await agentsRes.json()) as AssignableAgent[];
      if (Array.isArray(a)) setAgents(dedupeAssignableAgents(a));
    }
    if (allAgentsRes.ok) {
      const a = (await allAgentsRes.json()) as AssignableAgent[];
      if (Array.isArray(a)) setAllAssignableAgents(dedupeAssignableAgents(a));
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load();
      void loadContext();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tz, companyFilterTeamId]);

  useEffect(() => {
    const mainIds = [...new Set(rows.map((row) => row.assignedAgent?.id).filter(Boolean))] as string[];
    for (const mainId of mainIds) {
      if (subAssigneePeersFetchedRef.current.has(mainId)) continue;
      subAssigneePeersFetchedRef.current.add(mainId);
      void fetch(`/api/agents?forMainAgentId=${encodeURIComponent(mainId)}`, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : []))
        .then((list: unknown) => {
          if (!Array.isArray(list)) return;
          const peers = dedupeAssignableAgents(list as AssignableAgent[]).filter((a) => a.id !== mainId);
          setSubAssigneePeersByMainId((prev) => (prev[mainId] ? prev : { ...prev, [mainId]: peers }));
        })
        .catch(() => {
          subAssigneePeersFetchedRef.current.delete(mainId);
        });
    }
  }, [rows]);

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

  function taskWillFinishAfterToggle(r: KpiRecord, subKpiId: string, currentlyDone: boolean) {
    if (currentlyDone) return false;
    const items = isItProjectImplementationPillar(r.title)
      ? parseItProjectSubKpis(r.subKpis, r.itProjectPhase).phases.flatMap((phase) => phase.items)
      : collectAllSubKpiItems(normalizeSubKpis(r.subKpis));
    if (items.length === 0) return false;
    return items.every((item) => (item.id === subKpiId ? true : item.done));
  }

  function canOpenSubtaskDrawer(r: KpiRecord, items: SubKpiItem[]) {
    if (canAssignWork || canEditChecklist(r)) return true;
    if (!operatorAgentId) return canCompleteUnassignedWork && !r.assignedAgent?.id;
    return items.some((item) => subKpiAssignedAgentId(item) === operatorAgentId);
  }

  function toggleSubtaskDrawer(recordId: string) {
    setOpenSubtaskDrawers((prev) => {
      const next = new Set(prev);
      if (next.has(recordId)) next.delete(recordId);
      else next.add(recordId);
      return next;
    });
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

  async function patchSubKpiProjectMeta(
    recordId: string,
    subKpiId: string,
    meta: { projectPriority?: string; projectStatus?: string },
  ) {
    setBusyId(recordId);
    setError(null);
    try {
      const res = await fetch(`/api/kpi-maintenance?tz=${encodeURIComponent(tz)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: recordId, subKpiProjectMeta: { subKpiId, ...meta } }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not update project task details.");
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
      projectPriority?: string | null;
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

  async function patchTaskPriority(recordId: string, taskPriority: string) {
    setBusyId(recordId);
    setError(null);
    try {
      const res = await fetch(`/api/kpi-maintenance?tz=${encodeURIComponent(tz)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: recordId, taskPriority }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not update task priority.");
        return;
      }
      const updated = (await res.json()) as KpiRecord;
      setRows((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleSubKpi(recordId: string, subKpiId: string, done: boolean) {
    const shouldCloseWhenSaved =
      activeTaskId === recordId &&
      rows.some((row) => row.id === recordId && taskWillFinishAfterToggle(row, subKpiId, done));
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
      if (shouldCloseWhenSaved) {
        setActiveTaskId(null);
      }
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
  const agentNameById = useMemo(() => {
    const all = [...agents, ...allAssignableAgents, ...Object.values(subAssigneePeersByMainId).flat()];
    return new Map(dedupeAssignableAgents(all).map((a) => [a.id, a.name] as const));
  }, [agents, allAssignableAgents, subAssigneePeersByMainId]);

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
    const mainAssigneeId = r.assignedAgent?.id;
    const mainAssignee = mainAssigneeId
      ? allAssignableAgents.find((a) => a.id === mainAssigneeId) ??
        agents.find((a) => a.id === mainAssigneeId) ??
        null
      : null;
    const mainCompanyId = mainAssignee ? assignmentCompanyKey(mainAssignee) : null;
    let companyScopedAgents = mainCompanyId
      ? allAssignableAgents.filter((a) => assignmentCompanyKey(a) === mainCompanyId && a.id !== mainAssigneeId)
      : [];
    if (companyScopedAgents.length === 0 && mainAssigneeId) {
      companyScopedAgents = subAssigneePeersByMainId[mainAssigneeId] ?? [];
    }
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

  function renderNonItSubKpiCard(r: KpiRecord, s: SubKpiItem, showPriority = true) {
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
          {showPriority ? (
            <label className="flex flex-col text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
              Priority
              <select
                value={s.projectPriority ?? "Medium"}
                disabled={!canEditWorkDetails || busyId === r.id}
                onChange={(e) =>
                  void patchSubKpiWorkMeta(r.id, s.id, {
                    projectPriority: e.target.value,
                  })
                }
                className="mt-1 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-xs font-semibold text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {IT_PROJECT_PRIORITY_OPTIONS.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
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

  function renderItProjectSubKpiCard(r: KpiRecord, s: SubKpiItem, parentEditable: boolean) {
    const subEditable = canEditSubKpi(r, s);
    const projectStatus = s.projectStatus ?? (s.assignedAgentId ? "Pending" : "");
    const projectProgress = itProjectStatusProgress(s);
    return (
      <div
        key={s.id}
        className="rounded-lg border border-zinc-200/90 bg-zinc-50/80 p-2.5 dark:border-zinc-600 dark:bg-zinc-950/40"
      >
        <div className="flex items-start gap-2 text-xs text-zinc-800 dark:text-zinc-200">
          <span
            className={cn(
              "mt-0.5 size-2.5 shrink-0 rounded-full",
              projectProgress === 100
                ? "bg-emerald-500"
                : projectProgress >= 50
                  ? "bg-orange-500"
                  : "bg-amber-500",
            )}
            aria-hidden
          />
          <span className={cn(projectProgress === 100 && "line-through opacity-70")}>
            {s.title}
          </span>
        </div>
        {renderSubKpiAssignmentControl(r, s)}
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="flex flex-col text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
            Priority
            <select
              value={s.projectPriority ?? "Medium"}
              disabled={!subEditable || busyId === r.id}
              onChange={(e) =>
                void patchSubKpiProjectMeta(r.id, s.id, {
                  projectPriority: e.target.value,
                })
              }
              className="mt-1 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-xs font-semibold text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {IT_PROJECT_PRIORITY_OPTIONS.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
            Completion
            <select
              value={projectStatus}
              disabled={!subEditable || busyId === r.id || !s.assignedAgentId}
              onChange={(e) =>
                void patchSubKpiProjectMeta(r.id, s.id, {
                  projectStatus: e.target.value,
                })
              }
              className="mt-1 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-xs font-semibold text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {!projectStatus ? <option value="">Assign first</option> : null}
              {IT_PROJECT_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <div className="rounded-lg border border-zinc-200 bg-white px-2 py-2 dark:border-zinc-800 dark:bg-zinc-900/70">
            <div className="mb-1 flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              <span>Progress</span>
              <span>{projectProgress}%</span>
            </div>
            <div className="h-2 w-full min-w-24 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div className="h-full rounded-full bg-orange-500 transition-[width]" style={{ width: `${projectProgress}%` }} />
            </div>
          </div>
        </div>
        {!hasValidActualDate(s) ? (
          <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
            Set completion to Done when this task is finished.
          </p>
        ) : null}
        <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Sub-task
        </p>
        <div className="mt-1.5 grid gap-2">
          <label className="flex flex-col text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
            Due date
            <DatePickerField
              value={s.dueDate ?? ""}
              disabled={!parentEditable || busyId === r.id}
              onChange={(e) =>
                void patchSubKpiSchedule(r.id, s.id, {
                  dueDate: e.target.value || null,
                })
              }
              wrapperClassName="mt-1"
              aria-label={`Due date for ${s.title}`}
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
  }

  function renderTaskSubtaskContent(r: KpiRecord) {
    const itProject = isItProjectImplementationPillar(r.title);
    const normalized = normalizeSubKpis(r.subKpis);
    const itProjectData = itProject ? parseItProjectSubKpis(r.subKpis, r.itProjectPhase) : null;
    const checklistItems = collectAllSubKpiItems(normalized);
    const editable = canEditChecklist(r);
    const showSubtaskPriority = itProject || checklistItems.length <= 1;

    if (!itProject && normalized.segmented) {
      return normalized.segments.map((seg) => (
        <div
          key={seg.id}
          className="rounded-md border border-zinc-200/80 bg-white/60 p-2 dark:border-zinc-700 dark:bg-zinc-900/50"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange-700 dark:text-orange-400">
            {seg.label}
          </p>
          <div className="mt-1 space-y-2">
            {seg.items.map((s) => renderNonItSubKpiCard(r, s, showSubtaskPriority))}
          </div>
        </div>
      ));
    }

    if (itProject && itProjectData) {
      return itProjectData.phases.map((phase) => {
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
                phase.items.map((s) => renderItProjectSubKpiCard(r, s, editable))
              )}
            </div>
          </div>
        );
      });
    }

    return checklistItems.map((s: SubKpiItem) => renderNonItSubKpiCard(r, s, showSubtaskPriority));
  }

  const assignLaneDrag = usePointerColumnDrag<string>({
    onDrop: (id, targetId) => {
      setDragRevealCompanyId(null);
      const companyId = assignmentCompanyIdFromTarget(targetId);
      if (companyId) {
        setAssignmentCompanyId(companyId);
        return;
      }
      void assignKpi(id, assignmentUserIdFromTarget(targetId) ?? targetId);
    },
    onHover: (targetId) => {
      const companyId = assignmentCompanyIdFromTarget(targetId);
      if (companyId) {
        setDragRevealCompanyId((prev) => (prev === companyId ? prev : companyId));
        return;
      }
      const userId = assignmentUserIdFromTarget(targetId);
      if (userId) {
        const userAgent = agents.find((agent) => agent.id === userId);
        if (userAgent) {
          const userCompanyId = assignmentCompanyKey(userAgent);
          setDragRevealCompanyId((prev) => (prev === userCompanyId ? prev : userCompanyId));
          return;
        }
      }
      setDragRevealCompanyId(null);
    },
    onDragEnd: () => setDragRevealCompanyId(null),
    disabled: busyId != null || !canAssignWork,
    activationDistance: 12,
  });

  const assignmentCompanyOptions = useMemo<AssignmentCompanyOption[]>(() => {
    const agentCountByCompany = new Map<string, number>();
    const nameByCompany = new Map<string, string>();
    const rosterCompanyIds = new Set(companyFilterOptions.map((team) => team.id));

    for (const team of companyFilterOptions) {
      nameByCompany.set(team.id, team.name);
    }

    for (const agent of agents) {
      const key = assignmentCompanyKey(agent);
      if (key === ASSIGNMENT_NO_COMPANY) continue;
      if (rosterCompanyIds.size > 0 && !rosterCompanyIds.has(key)) continue;
      agentCountByCompany.set(key, (agentCountByCompany.get(key) ?? 0) + 1);
      if (!nameByCompany.has(key)) nameByCompany.set(key, assignmentCompanyName(agent));
    }

    const options: AssignmentCompanyOption[] = [];
    for (const [id, name] of nameByCompany) {
      const agentCount = agentCountByCompany.get(id) ?? 0;
      if (agentCount > 0) {
        options.push({ id, name, agentCount });
      }
    }

    return options.sort((a, b) => {
      const rosterA = companyFilterOptions.findIndex((team) => team.id === a.id);
      const rosterB = companyFilterOptions.findIndex((team) => team.id === b.id);
      if (rosterA !== -1 || rosterB !== -1) {
        const orderA = rosterA === -1 ? Number.MAX_SAFE_INTEGER : rosterA;
        const orderB = rosterB === -1 ? Number.MAX_SAFE_INTEGER : rosterB;
        return orderA - orderB;
      }
      return a.name.localeCompare(b.name);
    });
  }, [agents, companyFilterOptions]);

  const activeAssignmentCompanyId =
    dragRevealCompanyId ??
    (!assignLaneDrag.draggingItemId && assignmentCompanyId !== ASSIGNMENT_COMPANY_ALL ? assignmentCompanyId : null);
  const agentsByAssignmentCompany = useMemo(() => {
    const grouped = new Map<string, AssignableAgent[]>();
    for (const agent of agents) {
      const key = assignmentCompanyKey(agent);
      const list = grouped.get(key);
      if (list) list.push(agent);
      else grouped.set(key, [agent]);
    }
    for (const [key, list] of grouped) {
      grouped.set(key, sortAssignmentAgentsByRole(list));
    }
    return grouped;
  }, [agents]);

  const kpiStatusDrag = usePointerColumnDrag<KpiBoardStatus>({
    onDrop: (id, col) => void move(id, col),
    disabled: busyId != null,
    activationDistance: 12,
  });

  const activeTask = activeTaskId ? rows.find((row) => row.id === activeTaskId) ?? null : null;

  function renderActiveTaskModal() {
    if (!activeTask) return null;
    const editable = canEditChecklist(activeTask);
    const p = progress(activeTask);
    const end = periodEnd(activeTask);
    const itProject = isItProjectImplementationPillar(activeTask.title);
    const normalized = normalizeSubKpis(activeTask.subKpis);
    const checklistItems = collectAllSubKpiItems(normalized);
    const usesTaskPriority = !itProject && checklistItems.length > 1;
    const itProjectProgress = itProject
      ? itProjectAggregatedProgressFromRaw(activeTask.subKpis, activeTask.itProjectPhase)
      : null;
    const mainBarPct = itProjectProgress ? itProjectProgress.averagePercent : p.pct;
    const mainBarClass = itProject ? "bg-orange-500" : statusOf(activeTask) === "DONE" ? "bg-emerald-500" : "bg-blue-500";

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-3 py-6 backdrop-blur-sm"
        onClick={() => setActiveTaskId(null)}
        role="dialog"
        aria-modal="true"
        aria-label={`${activeTask.title} full task details`}
      >
        <div
          className="max-h-[calc(100dvh-3rem)] w-full max-w-4xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-800 dark:bg-[#0b1220] sm:p-5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-800 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-700 dark:text-orange-400">
                Full Task Details
              </p>
              <h3 className="mt-1 truncate text-xl font-bold text-zinc-950 dark:text-zinc-50">{activeTask.title}</h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Assigned to {activeTask.assignedAgent?.name ?? "Unassigned"} · {itProject ? "Project" : activeTask.frequency}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTaskId(null)}
              className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white p-2 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              aria-label="Close task details"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.6fr]">
            <aside className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                    {itProjectProgress ? "Project progress" : "Progress"}
                  </p>
                  <p className="text-xs font-bold text-zinc-950 dark:text-zinc-50">
                    {itProjectProgress
                      ? `${itProjectProgress.averagePercent}% avg · ${itProjectProgress.totalDone}/${itProjectProgress.totalItems}`
                      : p.inverted
                        ? `${p.positive}/${p.total} clear · ${p.negative} flagged`
                        : `${p.done}/${p.total} finished`}
                  </p>
                </div>
                <ChecklistProgressBar percent={mainBarPct} barClassName={mainBarClass} />
              </div>
              <dl className="space-y-2 text-xs">
                <div>
                  <dt className="font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">Status</dt>
                  <dd className="mt-0.5 text-zinc-800 dark:text-zinc-200">{statusOf(activeTask)}</dd>
                </div>
                <div>
                  <dt className="font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">Cycle</dt>
                  <dd className="mt-0.5 text-zinc-800 dark:text-zinc-200">
                    {activeTask.isRecurring === false || !end
                      ? activeTask.nonRecurringStartAt && activeTask.nonRecurringEndAt
                        ? `${new Date(activeTask.nonRecurringStartAt).toLocaleDateString()} - ${new Date(activeTask.nonRecurringEndAt).toLocaleDateString()}`
                        : "Non-recurring"
                      : `Next period starts ${end.toLocaleString(undefined, { timeZone: tz })}`}
                  </dd>
                </div>
                {!itProject && normalized.segmented ? (
                  <div>
                    <dt className="font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">Format</dt>
                    <dd className="mt-0.5 text-zinc-800 dark:text-zinc-200">Segmented checklist</dd>
                  </div>
                ) : null}
              </dl>
              {usesTaskPriority ? (
                <label className="block rounded-lg border border-zinc-200 bg-white p-3 text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-500">
                  Task priority
                  <select
                    value={getTaskPriority(activeTask.subKpis) ?? "Medium"}
                    disabled={(!editable && !canAssignWork) || busyId === activeTask.id}
                    onChange={(e) => void patchTaskPriority(activeTask.id, e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-xs font-semibold normal-case tracking-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    {IT_PROJECT_PRIORITY_OPTIONS.map((priority) => (
                      <option key={priority} value={priority}>
                        {priority}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {itProject ? (
                <div className="space-y-2 rounded-lg border border-orange-400/35 bg-orange-500/[0.07] p-3 dark:border-orange-500/30 dark:bg-orange-500/10">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-orange-800 dark:text-orange-200">
                    Project details
                  </p>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
                    Project name
                    <input
                      key={`modal-ipn-${activeTask.id}-${activeTask.updatedAt}`}
                      type="text"
                      defaultValue={activeTask.itProjectName ?? ""}
                      disabled={!editable || busyId === activeTask.id}
                      placeholder="e.g. Intranet refresh"
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        const prev = (activeTask.itProjectName ?? "").trim();
                        if (v !== prev) void patchItProjectMeta(activeTask.id, { itProjectName: v || null });
                      }}
                      className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </label>
                </div>
              ) : (
                renderPillarScreenshotFields(activeTask, editable)
              )}
            </aside>

            <section className="min-w-0">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Subtasks</h4>
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                  {p.total} item{p.total === 1 ? "" : "s"}
                </span>
              </div>
              <div className="space-y-2">{renderTaskSubtaskContent(activeTask)}</div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="mt-3 space-y-4">
      <PointerDragGhostLayer ghost={assignLaneDrag.ghost} />
      <PointerDragGhostLayer ghost={kpiStatusDrag.ghost} />
      {showAdminTaskManagement ? (
        <KpiDefinitionConsole onMaintenanceRecordsUpdated={() => void load()} />
      ) : null}
      {canAssignWork ? (
        <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_10px_34px_rgba(15,23,42,0.06)] dark:border-zinc-800 dark:bg-[#080808] dark:shadow-[0_14px_40px_rgba(0,0,0,0.28)]">
          <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/70">
            <div className="flex flex-col gap-1.5 lg:flex-row lg:items-end lg:justify-between">
              <div>
              <h4 className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-700 dark:text-zinc-300">
                Task Assignment Board
              </h4>
              <p className="mt-1 max-w-3xl text-xs text-zinc-600 dark:text-zinc-400">
                Drag a task over a company to reveal users, then release over an admin or personnel.
              </p>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-500">
                Screenshots remain available inside eligible task cards.
              </p>
            </div>
          </div>
          <div className="grid gap-3 p-3 md:grid-cols-[minmax(16rem,0.7fr)_minmax(0,1.8fr)] lg:p-4">
            <div
              ref={canUnassignWork ? assignLaneDrag.registerColumn("__UNASSIGNED__") : undefined}
              className={cn(
                "rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 transition dark:border-zinc-800 dark:bg-zinc-950/50",
                canUnassignWork && assignLaneDrag.hoverColumn === "__UNASSIGNED__" &&
                  "ring-2 ring-orange-500/60 ring-offset-2 ring-offset-white dark:ring-offset-zinc-900",
              )}
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">Unassigned</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-500">Drop here to clear assignment.</p>
                </div>
                <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {unassignedRows.length}
                </span>
              </div>
              <div className="max-h-[min(42dvh,24rem)] space-y-1.5 overflow-y-auto pr-1">
                {unassignedRows.length === 0 ? (
                  <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white/70 px-3 py-6 text-center dark:border-zinc-700 dark:bg-zinc-900/30">
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">No unassigned tasks.</p>
                  </div>
                ) : null}
                {unassignedRows.map((r) => (
                  <div
                    key={`unassigned-${r.id}`}
                    {...assignLaneDrag.getCardPointerProps(r.id, { getLabel: () => r.title })}
                    className={cn(
                      "touch-pan-y select-none rounded-lg border border-zinc-300 bg-zinc-50 px-2.5 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950/40 sm:py-2",
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
            <div className="min-w-0">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-950/50">
                <div className="flex flex-col gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
                      Personnel group
                    </p>
                    <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                      Drag over a company to reveal its users, then drop on a person.
                    </p>
                  </div>
                </div>
                {assignmentCompanyOptions.length > 0 ? (
                  <div className="mt-3 grid gap-2 xl:grid-cols-2">
                    {assignmentCompanyOptions.map((company) => {
                      const targetId = assignmentCompanyDropTarget(company.id);
                      const isSelected = assignmentCompanyId === company.id;
                      const isRevealed = activeAssignmentCompanyId === company.id;
                      const companyAgents = agentsByAssignmentCompany.get(company.id) ?? [];
                      const adminAgents = companyAgents.filter((agent) => assignmentRoleLabel(agent) === "Admin");
                      const personnelAgents = companyAgents.filter((agent) => assignmentRoleLabel(agent) === "Personnel");
                      return (
                        <div
                          key={`company-drop-${company.id}`}
                          ref={assignLaneDrag.registerColumn(targetId)}
                          className={cn(
                            "touch-pan-y rounded-xl border border-zinc-200 bg-white p-2 transition dark:border-zinc-800 dark:bg-zinc-900/40",
                            isSelected && "border-orange-300 bg-orange-50/70 dark:border-orange-800/70 dark:bg-orange-950/20",
                            isRevealed && "ring-2 ring-orange-500/60 ring-offset-2 ring-offset-white dark:ring-offset-zinc-900",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setAssignmentCompanyId((current) =>
                                current === company.id ? ASSIGNMENT_COMPANY_ALL : company.id,
                              );
                            }}
                            aria-pressed={isSelected}
                            aria-expanded={isRevealed}
                            className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-2 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-950/60"
                          >
                            <span className="min-w-0 truncate text-xs font-bold text-zinc-800 dark:text-zinc-200">
                              {company.name}
                            </span>
                            <span className="flex shrink-0 items-center gap-1">
                              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                                {company.agentCount}
                              </span>
                              <ChevronDown
                                className={cn(
                                  "size-3.5 text-zinc-500 transition-transform dark:text-zinc-400",
                                  isRevealed && "rotate-180",
                                )}
                                aria-hidden
                              />
                            </span>
                          </button>
                          {isRevealed ? (
                            <div className="mt-2 rounded-lg border border-orange-200 bg-white p-2 shadow-sm dark:border-orange-900/60 dark:bg-zinc-950">
                              <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-orange-700 dark:text-orange-300">
                                Drop on admin or personnel
                              </p>
                              <div className="max-h-[min(44dvh,20rem)] space-y-3 overflow-y-auto pr-1 sm:max-h-60">
                                {companyAgents.length === 0 ? (
                                  <p className="rounded-md border border-dashed border-zinc-300 px-2 py-3 text-center text-[11px] text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                                    No users in this company.
                                  </p>
                                ) : null}
                                {[
                                  { label: "Admins", list: adminAgents },
                                  { label: "Personnel", list: personnelAgents },
                                ].map((group) =>
                                  group.list.length > 0 ? (
                                    <div key={`${company.id}-${group.label}`} className="space-y-1">
                                      <p className="px-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                                        {group.label}
                                      </p>
                                      {group.list.map((agent) => {
                                        const userTargetId = assignmentUserDropTarget(agent.id);
                                        const isUserHovered = assignLaneDrag.hoverColumn === userTargetId;
                                        return (
                                          <div
                                            key={`company-user-${company.id}-${agent.id}`}
                                            ref={assignLaneDrag.registerColumn(userTargetId)}
                                            role="option"
                                            aria-selected={isUserHovered}
                                            className={cn(
                                              "rounded-md border border-zinc-200 bg-zinc-50 px-2 py-2 text-left transition dark:border-zinc-800 dark:bg-zinc-900/50 sm:py-1.5",
                                              isUserHovered &&
                                                "border-orange-400 bg-orange-50 ring-2 ring-orange-500/50 dark:border-orange-700 dark:bg-orange-950/30",
                                            )}
                                          >
                                            <div className="flex items-center justify-between gap-2">
                                              <p className="min-w-0 truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                                                {agent.name}
                                              </p>
                                              <span className="shrink-0 rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                                                {assignedCountByAgent.get(agent.id) ?? 0}
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : null,
                                )}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
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
        <div className="mt-3 grid gap-3 md:grid-cols-3">
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
                  "min-h-[300px] rounded-xl border p-2.5 transition",
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
                <div className="mt-2 space-y-2.5">
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
                      const drawerAllowed = canOpenSubtaskDrawer(r, checklistItems);
                      const drawerOpen = openSubtaskDrawers.has(r.id);
                      return (
                        <div
                          key={r.id}
                          {...(editable
                            ? kpiStatusDrag.getCardPointerProps(r.id, { getLabel: () => r.title })
                            : {})}
                          className={cn(
                            "rounded-lg border bg-white/75 p-3 shadow-sm transition hover:border-orange-300 hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/30 dark:hover:border-orange-800/80 dark:hover:bg-zinc-950/60",
                            busyId === r.id && "opacity-50",
                            editable && kpiStatusDrag.draggingItemId === r.id && "ring-1 ring-orange-400/40",
                          )}
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            const target = e.target as HTMLElement;
                            if (target.closest("a,button,input,select,textarea,label")) return;
                            setActiveTaskId(r.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setActiveTaskId(r.id);
                            }
                          }}
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
                          {itProject && (r.itProjectName || r.itProjectPhase) ? (
                            <p className="mt-2 truncate text-xs text-orange-800 dark:text-orange-200">
                              {[r.itProjectName, r.itProjectPhase].filter(Boolean).join(" · ")}
                            </p>
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
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {drawerAllowed ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSubtaskDrawer(r.id);
                                }}
                                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                aria-expanded={drawerOpen}
                              >
                                <ChevronDown
                                  className={cn("size-3.5 transition-transform", drawerOpen && "rotate-180")}
                                  aria-hidden
                                />
                                {drawerOpen ? "Close subtasks" : "Open subtasks"}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveTaskId(r.id);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-full bg-orange-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-orange-500"
                            >
                              <Maximize2 className="size-3.5" aria-hidden />
                              Full details
                            </button>
                          </div>
                          {drawerOpen && !itProject ? renderPillarScreenshotFields(r, editable) : null}
                          {drawerOpen ? (
                            <div className="mt-3 space-y-2">
                              {renderTaskSubtaskContent(r)}
                            </div>
                          ) : null}
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
      {renderActiveTaskModal()}
    </section>
  );
}
