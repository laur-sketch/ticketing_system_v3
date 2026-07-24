"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/DatePickerField";
import { cn } from "@/lib/cn";
import { isItProjectImplementationPillar } from "@/lib/it-task-pillar-titles";
import { DEFAULT_TIME_ZONE, type KpiFrequencyCode } from "@/lib/kpi-recurrence";
import {
  MIN_SEGMENTED_SUBKPIS_FOR_CREATE,
  ensureUnsegmentedSegment,
  isUnsegmentedSegmentId,
  UNASSIGNED_SEGMENT_BLOCK_MESSAGE,
  UNSEGMENTED_SEGMENT_ID,
  UNSEGMENTED_SEGMENT_LABEL,
  type SubKpiItem as SubKpi,
} from "@/lib/kpi-subkpis";
import type { SubKpiCompletionRequirements } from "@/lib/sub-kpi-completion-mode";
import { TaskBoardPopup } from "@/components/task-board/TaskBoardPopup";
import { DraftSubTasksPopup } from "@/components/task-board/DraftSubTasksPopup";
import { TravelOrderRequestModal } from "@/components/task-board/TravelOrderRequestModal";
import { ListChecks } from "lucide-react";

const INSIGHTS_VIEW_ONLY = false;

function normalizeTaskTitle(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

const TASK_TITLE_INPUT_CLASS =
  "rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm font-semibold tracking-tight text-zinc-900 outline-none ring-orange-500/30 placeholder:font-normal placeholder:tracking-normal placeholder:text-zinc-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

type MaintenanceFrequency = "Daily" | "Weekly" | "Monthly" | "Quarterly";
type DraftSegmentRow = { id: string; label: string; items: SubKpi[] };

export type KpiDefinitionMaintenanceRecord = {
  id: string;
  title: string;
  mainTask?: string | null;
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
  itProjectName?: string | null;
  itProjectPhase?: string | null;
  assignedAgent?: {
    id: string;
    name: string;
    team?: { name?: string | null } | null;
  } | null;
};

type Props = {
  /** Called after a successful create so parents can refresh KPI lists / metrics. */
  onMaintenanceRecordsUpdated?: (rows: KpiDefinitionMaintenanceRecord[]) => void;
  /** When true, omit outer card chrome (for use inside a popup). */
  embedded?: boolean;
};

export function KpiDefinitionConsole({ onMaintenanceRecordsUpdated, embedded = false }: Props) {
  const [recurrenceTz, setRecurrenceTz] = useState(DEFAULT_TIME_ZONE);
  const [maintenanceTitle, setMaintenanceTitle] = useState("");
  const [mainTaskDraft, setMainTaskDraft] = useState("");
  const [mainTaskTargetDateDraft, setMainTaskTargetDateDraft] = useState("");
  /** Project = one-off work item under a normal task group (no forced IT PROJECT IMPLEMENTATION pillar). */
  const [isProjectMode, setIsProjectMode] = useState(false);
  /** Field Assignment = one-off travel-order workflow (opens Request for Travel Order). */
  const [isFieldAssignmentMode, setIsFieldAssignmentMode] = useState(false);
  const [travelOrderModalOpen, setTravelOrderModalOpen] = useState(false);
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [maintenanceIsRecurring, setMaintenanceIsRecurring] = useState(true);
  const [maintenanceFrequency, setMaintenanceFrequency] = useState<MaintenanceFrequency>("Daily");
  const [recurrenceWeekday, setRecurrenceWeekday] = useState(1);
  const [recurrenceMonthDay, setRecurrenceMonthDay] = useState(1);
  const [subKpisDraft, setSubKpisDraft] = useState<SubKpi[]>([]);
  const [draftUseSegments, setDraftUseSegments] = useState(false);
  const [completionCheckbox, setCompletionCheckbox] = useState(true);
  const [completionBeforeAfterScreenshots, setCompletionBeforeAfterScreenshots] = useState(false);
  const [completionScreenshotUpload, setCompletionScreenshotUpload] = useState(false);
  const [completionNumerical, setCompletionNumerical] = useState(false);
  const [numericalTargetDraft, setNumericalTargetDraft] = useState("");
  const [dailyPenaltyDraft, setDailyPenaltyDraft] = useState("");
  const [enableSubtaskAssignees, setEnableSubtaskAssignees] = useState(true);
  const [draftSubTasksOpen, setDraftSubTasksOpen] = useState(false);
  const [draftSegments, setDraftSegments] = useState<DraftSegmentRow[]>([]);
  const [newPillarDraft, setNewPillarDraft] = useState("");
  const [scopedCompanyTeamId, setScopedCompanyTeamId] = useState("");
  const [rosterCompanies, setRosterCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [kpiMaintenanceAssignWork, setKpiMaintenanceAssignWork] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  useEffect(() => {
    if (successMessage) {
      const t = setTimeout(() => setSuccessMessage(null), 6000);
      return () => clearTimeout(t);
    }
  }, [successMessage]);
  function setError(msg: string | null) {
    setLocalError(msg);
    if (msg) setSuccessMessage(null);
  }
  function setOk(msg: string | null) {
    setSuccessMessage(msg);
    if (msg) setLocalError(null);
  }
  const [adminDesignatedCompanyId, setAdminDesignatedCompanyId] = useState<string | null>(null);
  const [adminDesignatedCompanyName, setAdminDesignatedCompanyName] = useState<string | null>(null);
  const [browseAllOpen, setBrowseAllOpen] = useState(false);
  const [maintenanceRows, setMaintenanceRows] = useState<KpiDefinitionMaintenanceRecord[]>([]);

  /** Effective recurring flag: Projects and Field Assignments are always one-off. */
  const effectiveIsRecurring =
    isProjectMode || isFieldAssignmentMode ? false : maintenanceIsRecurring;

  useEffect(() => {
    queueMicrotask(() => {
      try {
        setRecurrenceTz(DEFAULT_TIME_ZONE);
      } catch {
        setRecurrenceTz(DEFAULT_TIME_ZONE);
      }
    });
  }, []);

  useEffect(() => {
    queueMicrotask(async () => {
      try {
        const res = await fetch("/api/me/staff-designated-company", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          designatedCompanyTeamId?: string | null;
          designatedCompanyName?: string | null;
        };
        if (data.designatedCompanyTeamId) {
          setAdminDesignatedCompanyId(data.designatedCompanyTeamId);
          setAdminDesignatedCompanyName(data.designatedCompanyName ?? null);
        }
      } catch {
        /* ignore */
      }
    });
  }, []);

  useEffect(() => {
    if (
      adminDesignatedCompanyId &&
      rosterCompanies.length > 0 &&
      rosterCompanies.some((c) => c.id === adminDesignatedCompanyId)
    ) {
      setScopedCompanyTeamId(adminDesignatedCompanyId);
      // Scope the dropdown to show only this company's task groups
      void loadAssignFlag(adminDesignatedCompanyId);
    }
  }, [adminDesignatedCompanyId, rosterCompanies]);

  const kpiMaintenanceSearch = useMemo(
    () => `?tz=${encodeURIComponent(recurrenceTz)}`,
    [recurrenceTz],
  );

  const loadAssignFlag = useCallback(async (companyFilter?: string) => {
    const url = companyFilter
      ? `/api/kpi-maintenance${kpiMaintenanceSearch}&company=${encodeURIComponent(companyFilter)}`
      : `/api/kpi-maintenance${kpiMaintenanceSearch}`;
    const kpiRes = await fetch(url, { cache: "no-store" });
    if (kpiRes.ok) {
      const payload = (await kpiRes.json()) as {
        canAssignWork?: boolean;
        rows?: KpiDefinitionMaintenanceRecord[];
        rosterCompanies?: Array<{ id: string; name: string }>;
      };
      setKpiMaintenanceAssignWork(Boolean(payload.canAssignWork));
      setRosterCompanies(payload.rosterCompanies ?? []);
      // Store full rows for the browse-all modal
      setMaintenanceRows(payload.rows ?? []);
      // When a company filter is active, replace suggestions with only that company's task groups.
      // Also preserve any custom groups the user added via addCustomTaskGroup (prev).
      // Without a filter, merge API titles with any locally-added titles.
      setTitleSuggestions((prev) => {
        if (companyFilter && companyFilter !== "ALL") {
          // Scoped: only show task groups belonging to this company
          const scoped = new Set<string>();
          if (Array.isArray(payload.rows)) {
            for (const row of payload.rows) {
              const t = row.title?.trim();
              if (t) scoped.add(t);
            }
          }
          // Preserve any custom groups the user added via addCustomTaskGroup
          for (const t of prev) {
            if (t.trim()) scoped.add(t.trim());
          }
          return Array.from(scoped).sort();
        }
        // Unfiltered: merge with any locally-added custom groups
        const merged = new Set(prev);
        if (Array.isArray(payload.rows)) {
          for (const row of payload.rows) {
            const t = row.title?.trim();
            if (t) merged.add(t);
          }
        }
        return Array.from(merged).sort();
      });
    }
  }, [kpiMaintenanceSearch]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadAssignFlag();
    });
  }, [loadAssignFlag]);

  const draftSubKpiTotal = draftUseSegments
    ? draftSegments.reduce((a, s) => a + s.items.length, 0)
    : subKpisDraft.length;
  // Always offer "Segment this checklist" in the subtask popup (no min-count gate).
  const showSegmentedCreateOption = kpiMaintenanceAssignWork;

  const completionRequirements = useMemo<SubKpiCompletionRequirements>(
    () => ({
      checkbox: completionCheckbox,
      screenshots: completionBeforeAfterScreenshots,
      screenshotUpload: completionScreenshotUpload,
      numerical: completionNumerical,
    }),
    [completionCheckbox, completionBeforeAfterScreenshots, completionScreenshotUpload, completionNumerical],
  );

  function addCustomTaskGroup() {
    const normalized = normalizeTaskTitle(newPillarDraft);
    if (!normalized || isItProjectImplementationPillar(normalized)) {
      setError("Enter a valid task group name.");
      return;
    }
    setTitleSuggestions((prev) => {
      if (prev.some((title) => title.toLowerCase() === normalized.toLowerCase())) return prev;
      return [...prev, normalized];
    });
    setMaintenanceTitle(normalized);
    selectTaskGroup(normalized);
    setNewPillarDraft("");
    setLocalError(null);
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
      return;
    }
    setDraftUseSegments(true);
    if (subKpisDraft.length > 0) {
      // Existing flat items become Unsegmented; user can drag into named segments.
      setDraftSegments(
        ensureUnsegmentedSegment([
          {
            id: UNSEGMENTED_SEGMENT_ID,
            label: UNSEGMENTED_SEGMENT_LABEL,
            items: [...subKpisDraft],
          },
        ]),
      );
      setSubKpisDraft([]);
      return;
    }
    if (draftSegments.length === 0) {
      setDraftSegments(
        ensureUnsegmentedSegment([
          { id: crypto.randomUUID(), label: maintenanceTitle.trim() || "Segment 1", items: [] },
        ]),
      );
    } else {
      setDraftSegments(ensureUnsegmentedSegment(draftSegments));
    }
  }

  /**
   * Selecting a task group only binds the group title.
   * Always start a fresh task draft — never clone fields/subtasks from a prior task in that group.
   */
  function resetTaskDraftForNewGroup() {
    setMainTaskDraft("");
    setMainTaskTargetDateDraft("");
    setMaintenanceIsRecurring(true);
    setMaintenanceFrequency("Daily");
    setRecurrenceWeekday(1);
    setRecurrenceMonthDay(1);
    setSubKpisDraft([]);
    setDraftUseSegments(false);
    setDraftSegments([]);
    setDraftSubTasksOpen(false);
    setCompletionCheckbox(true);
    setCompletionBeforeAfterScreenshots(false);
    setCompletionScreenshotUpload(false);
    setCompletionNumerical(false);
    setNumericalTargetDraft("");
    setDailyPenaltyDraft("");
    setEnableSubtaskAssignees(true);
    setIsProjectMode(false);
    setIsFieldAssignmentMode(false);
    setTravelOrderModalOpen(false);
    setLocalError(null);
  }

  function selectMaintenanceTitle(title: string) {
    setMaintenanceTitle(title);
    setLocalError(null);
  }

  /** User picked a task group from search/browse — bind title only, reset all other create fields. */
  function selectTaskGroup(title: string) {
    const next = title.trim();
    setMaintenanceTitle(next);
    resetTaskDraftForNewGroup();
    if (!next) setLocalError(null);
  }

  function handleTaskTypeChange(next: "task" | "project" | "field") {
    setIsProjectMode(next === "project");
    setIsFieldAssignmentMode(next === "field");
    setLocalError(null);
    setTravelOrderModalOpen(false);
    if (next === "project" || next === "field") {
      setMaintenanceIsRecurring(false);
      setMainTaskTargetDateDraft("");
    }
  }

  function handleMaintenanceTitleBlur() {
    const normalized = normalizeTaskTitle(maintenanceTitle);
    if (normalized !== maintenanceTitle) {
      setMaintenanceTitle(normalized);
    }
    selectMaintenanceTitle(normalized);
  }

  async function createMaintenanceRecord() {
    if (INSIGHTS_VIEW_ONLY) return;
    if (isFieldAssignmentMode) {
      if (!maintenanceTitle.trim()) {
        setError("Select a task group.");
        return;
      }
      if (!mainTaskDraft.trim()) {
        setError("Enter a Field Assignment label.");
        return;
      }
      setTravelOrderModalOpen(true);
      return;
    }
    const title = normalizeTaskTitle(maintenanceTitle);
    if (!maintenanceTitle.trim()) {
      setError("Select a task group.");
      return;
    }
    if (!mainTaskDraft.trim()) {
      setError(isProjectMode ? "Enter a project name." : "Enter a main task name.");
      return;
    }
    if (title !== maintenanceTitle) {
      setMaintenanceTitle(title);
      selectMaintenanceTitle(title);
    }
    const freqUpper = (
      !effectiveIsRecurring ? "MONTHLY" : maintenanceFrequency.toUpperCase()
    ) as KpiFrequencyCode;

    if (draftUseSegments) {
      const ensured = ensureUnsegmentedSegment(draftSegments);
      const unassignedCount =
        ensured.find((seg) => isUnsegmentedSegmentId(seg.id))?.items.length ?? 0;
      if (unassignedCount > 0) {
        setError(UNASSIGNED_SEGMENT_BLOCK_MESSAGE);
        return;
      }
      for (const seg of ensured) {
        if (isUnsegmentedSegmentId(seg.id)) continue;
        if (!seg.label.trim()) {
          setError('Each checklist segment needs a label (or turn off "Segment this checklist").');
          return;
        }
      }
      const namedTotal = ensured
        .filter((seg) => !isUnsegmentedSegmentId(seg.id))
        .reduce((a, s) => a + s.items.length, 0);
      if (namedTotal < MIN_SEGMENTED_SUBKPIS_FOR_CREATE) {
        setError(
          `Assign at least ${MIN_SEGMENTED_SUBKPIS_FOR_CREATE} sub-task${MIN_SEGMENTED_SUBKPIS_FOR_CREATE === 1 ? "" : "s"} to a segment before creating the task.`,
        );
        return;
      }
    }

    if (
      !completionRequirements.checkbox &&
      !completionRequirements.screenshots &&
      !completionRequirements.screenshotUpload &&
      !completionRequirements.numerical
    ) {
      setError("Select at least one completion condition.");
      return;
    }

    if (completionRequirements.numerical) {
      const isPillarOnlyDraft = !draftUseSegments && subKpisDraft.length === 0;
      const skipTargetAtCreate = effectiveIsRecurring && isPillarOnlyDraft;
      if (!skipTargetAtCreate) {
        const targetRaw = numericalTargetDraft.trim();
        const target = targetRaw === "" ? NaN : Number(targetRaw);
        if (!Number.isFinite(target)) {
          setError("Enter a target number for numerical record completion.");
          return;
        }
      }
    }

    const body: Record<string, unknown> = {
      title,
      frequency: freqUpper,
      isRecurring: effectiveIsRecurring,
      enableSubtaskAssignees: enableSubtaskAssignees === true,
      mainTask: mainTaskDraft.trim(),
      completionRequirements,
      isProject: isProjectMode === true,
    };
    if (scopedCompanyTeamId) body.scopedCompanyTeamId = scopedCompanyTeamId;
    if (completionRequirements.numerical) {
      const targetRaw = numericalTargetDraft.trim();
      if (targetRaw !== "") {
        body.numericalTarget = Number(targetRaw);
      }
    }
    if (!effectiveIsRecurring) {
      const penaltyRaw = dailyPenaltyDraft.trim();
      if (penaltyRaw !== "") {
        const penalty = Number(penaltyRaw);
        if (!Number.isFinite(penalty) || penalty < 0) {
          setError("Daily delay penalty must be a non-negative number.");
          return;
        }
        body.taskDailyPenaltyAmount = penalty;
      }
    }
    if (draftUseSegments) {
      body.subKpisSegmented = true;
      body.segments = draftSegments.map((s) => ({
        id: s.id,
        label: s.label.trim(),
        items: s.items.map((it) => ({
          title: it.title.trim(),
          description: it.description ?? null,
          dueDate: effectiveIsRecurring ? "" : it.dueDate ?? "",
          projectPriority: it.projectPriority ?? null,
          projectStatus: it.projectStatus ?? null,
          done: it.done === true,
        })),
      }));
    } else {
      body.subKpis = subKpisDraft.map((s) => ({
        title: s.title,
        description: s.description ?? null,
        dueDate: effectiveIsRecurring ? "" : s.dueDate ?? "",
        projectPriority: s.projectPriority ?? null,
      }));
    }
    if (!effectiveIsRecurring && mainTaskTargetDateDraft.trim()) {
      body.pillarDueDate = mainTaskTargetDateDraft.trim();
    }

    if (effectiveIsRecurring && freqUpper === "WEEKLY") {
      body.recurrenceWeekday = recurrenceWeekday;
    }
    if (effectiveIsRecurring && (freqUpper === "MONTHLY" || freqUpper === "QUARTERLY")) {
      body.recurrenceMonthDay = recurrenceMonthDay;
    }
    body.timeZone = recurrenceTz;

    const res = await fetch(`/api/kpi-maintenance${kpiMaintenanceSearch}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    if (res.ok) {
      let message = "";
      try {
        const parsed = JSON.parse(raw) as { message?: string };
        if (typeof parsed.message === "string" && parsed.message.trim()) {
          message = parsed.message.trim();
        }
      } catch {
        // ignore parse errors on the message
      }
      if (message) {
        setOk(message);
      } else {
        setOk(isProjectMode ? "Project created." : "Task created.");
      }
      setTitleSuggestions((prev) => {
        if (prev.some((t) => t.toLowerCase() === title.toLowerCase())) return prev;
        return [...prev, title].sort();
      });
      setIsProjectMode(false);
      setIsFieldAssignmentMode(false);
      setTravelOrderModalOpen(false);
      setMaintenanceTitle("");
      setMainTaskDraft("");
      setMainTaskTargetDateDraft("");
      setMaintenanceIsRecurring(true);
      setMaintenanceFrequency("Daily");
      setRecurrenceWeekday(1);
      setRecurrenceMonthDay(1);
      setSubKpisDraft([]);
      setDraftUseSegments(false);
      setDraftSubTasksOpen(false);
      setCompletionCheckbox(true);
      setCompletionBeforeAfterScreenshots(false);
      setCompletionScreenshotUpload(false);
      setCompletionNumerical(false);
      setNumericalTargetDraft("");
      setDailyPenaltyDraft("");
      setEnableSubtaskAssignees(true);
      setScopedCompanyTeamId("");
      setNewPillarDraft("");
      setDraftSegments([]);
      const reload = await fetch(`/api/kpi-maintenance${kpiMaintenanceSearch}`, { cache: "no-store" });
      if (reload.ok) {
        const payload = (await reload.json()) as { rows: KpiDefinitionMaintenanceRecord[] };
        setMaintenanceRows(payload.rows);
        onMaintenanceRecordsUpdated?.(payload.rows);
      }
      void loadAssignFlag(adminDesignatedCompanyId ?? undefined);
      return;
    }
    let errMsg = "Could not create task.";
    try {
      const parsed = JSON.parse(raw) as { error?: string };
      if (typeof parsed.error === "string" && parsed.error.trim()) errMsg = parsed.error.trim();
    } catch {
      if (raw.trim()) errMsg = raw.trim();
    }
    setError(errMsg);
  }

  const hasTaskGroupSelected = maintenanceTitle.trim().length > 0;

  return (
    <section
      className={
        embedded
          ? undefined
          : "mb-5 rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_8px_28px_rgba(0,0,0,0.06)] sm:p-5 dark:border-zinc-800/90 dark:bg-[#0b1220] dark:shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
      }
    >
      {!embedded ? (
        <h2 className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600 dark:text-zinc-500">
          Task management
        </h2>
      ) : null}
      {localError ? (
        <p className="mt-2 rounded-lg border border-red-500/35 bg-red-50 px-3 py-2 text-xs text-red-900 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-200">
          {localError}
        </p>
      ) : null}
      {successMessage ? (
        <p className="mt-2 rounded-lg border border-emerald-500/35 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-200">
          {successMessage}
        </p>
      ) : null}

      <div className={cn("grid gap-2.5 md:grid-cols-2", embedded ? "mt-0" : "mt-4")}>
        <label className="relative flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500 md:col-span-2">
          Task Group
          <TaskGroupSearch
            maintenanceTitle={maintenanceTitle}
            companyName={adminDesignatedCompanyName}
            onSelect={(next) => {
              selectTaskGroup(next);
            }}
            onBlur={handleMaintenanceTitleBlur}
            onBrowseAll={() => setBrowseAllOpen(true)}
            TASK_TITLE_INPUT_CLASS={TASK_TITLE_INPUT_CLASS}
          />
        </label>
        {kpiMaintenanceAssignWork && !hasTaskGroupSelected ? (
          <div className="flex flex-wrap items-end gap-2 md:col-span-2">
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
              Add task group
              <input
                type="text"
                value={newPillarDraft}
                onChange={(e) => setNewPillarDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomTaskGroup();
                  }
                }}
                placeholder="New task group name"
                className={TASK_TITLE_INPUT_CLASS}
              />
            </label>
            <Button type="button" variant="outline" onClick={addCustomTaskGroup} className="rounded-xl px-4">
              Add task group
            </Button>
          </div>
        ) : null}
        {kpiMaintenanceAssignWork && hasTaskGroupSelected ? (
          <fieldset className="flex flex-col gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500 md:col-span-2">
            <legend className="mb-1 px-0">Task type</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-zinc-900 dark:text-zinc-100",
                  !isProjectMode && !isFieldAssignmentMode
                    ? "border-orange-500 bg-orange-50/80 ring-1 ring-orange-500/30 dark:border-orange-500/60 dark:bg-orange-950/20"
                    : "border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950",
                )}
              >
                <input
                  type="radio"
                  name="maintenance-task-type"
                  checked={!isProjectMode && !isFieldAssignmentMode}
                  onChange={() => handleTaskTypeChange("task")}
                />
                Task
              </label>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-zinc-900 dark:text-zinc-100",
                  isProjectMode
                    ? "border-orange-500 bg-orange-50/80 ring-1 ring-orange-500/30 dark:border-orange-500/60 dark:bg-orange-950/20"
                    : "border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950",
                )}
              >
                <input
                  type="radio"
                  name="maintenance-task-type"
                  checked={isProjectMode}
                  onChange={() => handleTaskTypeChange("project")}
                />
                Project
              </label>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-zinc-900 dark:text-zinc-100",
                  isFieldAssignmentMode
                    ? "border-orange-500 bg-orange-50/80 ring-1 ring-orange-500/30 dark:border-orange-500/60 dark:bg-orange-950/20"
                    : "border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950",
                )}
              >
                <input
                  type="radio"
                  name="maintenance-task-type"
                  checked={isFieldAssignmentMode}
                  onChange={() => handleTaskTypeChange("field")}
                />
                Field Assignment
              </label>
            </div>
            <p className="text-xs font-normal normal-case tracking-normal text-zinc-500 dark:text-zinc-400">
              {isFieldAssignmentMode
                ? "Field Assignment opens a Request for Travel Order with locations, GPS pins, approver, and remarks."
                : isProjectMode
                  ? "Projects are one-off (non-recurring) and use the same sub-task manager, assignees, and completion conditions as tasks."
                  : "Tasks can be recurring or one-off under any task group."}
            </p>
          </fieldset>
        ) : null}
        {kpiMaintenanceAssignWork && hasTaskGroupSelected && !isFieldAssignmentMode ? (
          <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 md:col-span-2">
            <input
              type="checkbox"
              checked={enableSubtaskAssignees}
              onChange={(e) => setEnableSubtaskAssignees(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
                Enable Subtask Assignees
              </span>
              <span className="mt-0.5 block text-xs font-normal normal-case tracking-normal text-zinc-600 dark:text-zinc-400">
                When off, subtasks stay unassigned until the main assignee uses Seek Assistance.
              </span>
            </span>
          </label>
        ) : null}
        {hasTaskGroupSelected ? (
          <div className="grid gap-3 md:col-span-2 md:grid-cols-[minmax(220px,1fr)_180px]">
            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
              {isFieldAssignmentMode
                ? "Field Assignment label"
                : isProjectMode
                  ? "Project name"
                  : "Main Task"}
              <input
                type="text"
                value={mainTaskDraft}
                onChange={(e) => {
                  setMainTaskDraft(e.target.value);
                  setLocalError(null);
                }}
                placeholder={
                  isFieldAssignmentMode
                    ? "e.g. Site survey — Client HQ"
                    : isProjectMode
                      ? "Name of the project"
                      : "e.g. Reroute Connections"
                }
                required
                className={TASK_TITLE_INPUT_CLASS}
              />
            </label>
            {!effectiveIsRecurring && !isFieldAssignmentMode ? (
              <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
                Target date
                <DatePickerField
                  value={mainTaskTargetDateDraft}
                  onChange={(e) => setMainTaskTargetDateDraft(e.target.value)}
                  aria-label={isProjectMode ? "Project target date" : "Main task target date"}
                  shellClassName="h-10"
                />
              </label>
            ) : null}
            <p className="text-xs font-normal normal-case tracking-normal text-zinc-500 dark:text-zinc-400 md:col-span-2">
              {isFieldAssignmentMode
                ? "Shown as a label on the Field Assignment card. Work is tracked on the Travel Order (not as a main-task checklist)."
                : isProjectMode
                  ? "The project work item under the task group. With no sub-tasks, completion conditions apply on this project on the Task Board."
                  : "The specific work item under the task group. Works for recurring and one-off schedules — with no sub-tasks, completion conditions apply on this main task on the Task Board."}
              {!effectiveIsRecurring && !isFieldAssignmentMode
                ? " Target date applies when there are no sub-tasks (delayed the day after if incomplete)."
                : null}
            </p>
          </div>
        ) : null}
        {hasTaskGroupSelected && !isProjectMode && !isFieldAssignmentMode ? (
          <div className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
            Task schedule type
            <label className="flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
              <input
                type="checkbox"
                checked={maintenanceIsRecurring}
                onChange={(e) => {
                  const nextRecurring = e.target.checked;
                  setMaintenanceIsRecurring(nextRecurring);
                  if (nextRecurring) {
                    const recurringDaily = maintenanceFrequency === "Daily";
                    setMainTaskTargetDateDraft("");
                    setSubKpisDraft((prev) =>
                      prev.map((item) => {
                        const next = { ...item };
                        if (recurringDaily) delete next.startDate;
                        delete next.dueDate;
                        return next;
                      }),
                    );
                    setDraftSegments((prev) =>
                      prev.map((seg) => ({
                        ...seg,
                        items: seg.items.map((item) => {
                          const next = { ...item };
                          if (recurringDaily) delete next.startDate;
                          delete next.dueDate;
                          return next;
                        }),
                      })),
                    );
                  }
                }}
              />
              Recurring task
            </label>
          </div>
        ) : null}
        {hasTaskGroupSelected && isFieldAssignmentMode ? (
          <div className="rounded-xl border border-dashed border-orange-400/50 bg-orange-500/[0.04] px-3 py-3 text-xs text-zinc-700 dark:border-orange-500/35 dark:bg-orange-500/[0.07] dark:text-zinc-300 md:col-span-2">
            Field Assignment creates a one-off task card with a <strong>Request for Travel Order</strong>. Use that
            button to add locations, approver, and approval confirmation.
          </div>
        ) : null}
        {hasTaskGroupSelected && isProjectMode ? (
          <div className="rounded-xl border border-dashed border-zinc-300 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            Projects are always one-off (non-recurring).
          </div>
        ) : null}
        {hasTaskGroupSelected && !isProjectMode && !isFieldAssignmentMode && maintenanceIsRecurring ? (
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
            Frequency
            <select
              value={maintenanceFrequency}
              onChange={(e) => {
                const nextFrequency = e.target.value as MaintenanceFrequency;
                setMaintenanceFrequency(nextFrequency);
                if (maintenanceIsRecurring && nextFrequency === "Daily") {
                  setSubKpisDraft((prev) =>
                    prev.map((item) => {
                      const next = { ...item };
                      delete next.startDate;
                      return next;
                    }),
                  );
                  setDraftSegments((prev) =>
                    prev.map((seg) => ({
                      ...seg,
                      items: seg.items.map((item) => {
                        const next = { ...item };
                        delete next.startDate;
                        return next;
                      }),
                    })),
                  );
                }
              }}
              className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none ring-orange-500/30 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            >
              <option value="Daily">Daily</option>
              <option value="Weekly">Weekly</option>
              <option value="Monthly">Monthly</option>
              <option value="Quarterly">Quarterly</option>
            </select>
          </label>
        ) : null}
        {hasTaskGroupSelected &&
        !isProjectMode &&
        !isFieldAssignmentMode &&
        maintenanceIsRecurring &&
        maintenanceFrequency === "Weekly" ? (
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
        {hasTaskGroupSelected &&
        !isProjectMode &&
        !isFieldAssignmentMode &&
        maintenanceIsRecurring &&
        (maintenanceFrequency === "Monthly" || maintenanceFrequency === "Quarterly") ? (
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
            {maintenanceFrequency === "Quarterly" ? "4-month cycle" : "Month cycle"} starts on day (1–31,{" "}
            {recurrenceTz})
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
        {!isFieldAssignmentMode ? (
        <div className="rounded-xl border border-dashed border-zinc-300 px-3 py-3 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400 md:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>
              {!hasTaskGroupSelected
                ? "Select a task group to continue."
                : isProjectMode
                  ? "Projects are one-off. Add optional sub-tasks in the popup; without them, completion conditions apply on the project."
                  : maintenanceIsRecurring
                    ? "Sub-tasks are optional. Without them, completion conditions apply on the main task each cycle."
                    : "Sub-tasks are optional. Without them, set a main task target date and complete work on the main task — delayed the day after target if still incomplete."}
            </p>
            {hasTaskGroupSelected ? (
              <button
                type="button"
                onClick={() => setDraftSubTasksOpen(true)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-orange-500/60 bg-orange-500/10 px-3 py-1.5 text-[11px] font-semibold text-orange-800 hover:bg-orange-500/20 dark:border-orange-500/40 dark:text-orange-200 dark:hover:bg-orange-950/40"
              >
                <ListChecks className="size-3.5" aria-hidden />
                Add Sub Tasks
                <span className="rounded-full bg-orange-600 px-1.5 py-px text-[10px] font-bold text-white">
                  {draftSubKpiTotal}
                </span>
              </button>
              ) : null}
          </div>
        </div>
        ) : null}
      </div>

      {hasTaskGroupSelected && !isFieldAssignmentMode ? (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/70 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-300">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
            Completion conditions
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Select one or more ways assignees can complete work on the Task Board. With no sub-tasks, these apply on
            the {isProjectMode ? "project" : "main task"}
            {effectiveIsRecurring ? " (recurring and one-off)." : "."}
          </p>
          <div className="mt-3 space-y-2">
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={completionCheckbox}
                onChange={(e) => setCompletionCheckbox(e.target.checked)}
                className="mt-1"
              />
              <span>Checklist checkbox (default)</span>
            </label>
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={completionBeforeAfterScreenshots}
                onChange={(e) => setCompletionBeforeAfterScreenshots(e.target.checked)}
                className="mt-1"
              />
              <span>
                Before/after screenshot uploads
                <span className="mt-0.5 block text-xs font-normal text-zinc-500 dark:text-zinc-400">
                  Required on each sub-task, or on the main task when there are no sub-tasks.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={completionScreenshotUpload}
                onChange={(e) => setCompletionScreenshotUpload(e.target.checked)}
                className="mt-1"
              />
              <span>
                Screenshot upload
                <span className="mt-0.5 block text-xs font-normal text-zinc-500 dark:text-zinc-400">
                  Attach proof on each sub-task, or on the main task when there are no sub-tasks.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={completionNumerical}
                onChange={(e) => {
                  setCompletionNumerical(e.target.checked);
                  if (!e.target.checked) setNumericalTargetDraft("");
                }}
                className="mt-1"
              />
              <span>Numerical record (assignees enter a number when completing work)</span>
            </label>
          </div>
          {completionNumerical ? (
            <label className="mt-3 flex max-w-xs flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
              Target number
              <input
                type="number"
                step="any"
                value={numericalTargetDraft}
                onChange={(e) => setNumericalTargetDraft(e.target.value)}
                placeholder="e.g. 100"
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none ring-orange-500/30 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
              <span className="text-xs font-normal normal-case tracking-normal text-zinc-500 dark:text-zinc-400">
                {effectiveIsRecurring && subKpisDraft.length === 0
                  ? "Optional for recurring tasks with no sub-tasks — assignees set the target each cycle on the Task Board."
                  : "Assignees will see this target when recording their actual number on the Task Board."}
              </span>
            </label>
          ) : null}
          {!effectiveIsRecurring ? (
            <label className="mt-3 flex max-w-xs flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
              Daily delay penalty
              <input
                type="number"
                min={0}
                step="any"
                value={dailyPenaltyDraft}
                onChange={(e) => setDailyPenaltyDraft(e.target.value)}
                placeholder="e.g. 5"
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none ring-orange-500/30 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
              <span className="text-xs font-normal normal-case tracking-normal text-zinc-500 dark:text-zinc-400">
                One-off tasks only. Applied per calendar day once a sub-task lands in Delayed (day after
                target date). Sub-task overrides can be set on the Task Board.
              </span>
            </label>
          ) : null}
        </div>
      ) : null}

      {hasTaskGroupSelected ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {isFieldAssignmentMode ? (
              <Button
                type="button"
                className="rounded-xl px-4"
                onClick={() => void createMaintenanceRecord()}
                disabled={!mainTaskDraft.trim()}
              >
                Request for Travel Order
              </Button>
            ) : (
              <Button type="button" onClick={() => void createMaintenanceRecord()} className="rounded-xl px-4">
                Apply
              </Button>
            )}
          </div>
          {isFieldAssignmentMode ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Opens the Request for Travel Order form. Saving there creates the Field Assignment task and travel
              order together.
            </p>
          ) : draftSubKpiTotal > 0 ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {draftSubKpiTotal} sub-task{draftSubKpiTotal === 1 ? "" : "s"} ready
              {draftUseSegments ? ` in ${draftSegments.length} segment${draftSegments.length === 1 ? "" : "s"}` : ""} — open{" "}
              <button
                type="button"
                onClick={() => setDraftSubTasksOpen(true)}
                className="font-semibold text-orange-700 underline-offset-2 hover:underline dark:text-orange-300"
              >
                Add Sub Tasks
              </button>{" "}
              above to edit details, or click a chip below to remove.
            </p>
          ) : (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Optional. Use Add Sub Tasks above to build a checklist, or Apply with none to use{" "}
              {isProjectMode ? "project" : "main-task"} completion.
            </p>
          )}
        </div>
      ) : null}

      {hasTaskGroupSelected && !draftUseSegments && subKpisDraft.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {subKpisDraft.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => removeSubKpiDraft(s.id)}
              className="rounded-full border border-zinc-300 bg-zinc-100 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              title="Remove sub-task"
            >
              {s.title}
              {s.projectPriority ? ` · ${s.projectPriority}` : ""}
              {s.dueDate ? ` · Target ${s.dueDate}` : ""} ×
            </button>
          ))}
        </div>
      ) : null}

      <DraftSubTasksPopup
        open={draftSubTasksOpen && hasTaskGroupSelected}
        taskLabel={mainTaskDraft.trim() || maintenanceTitle.trim() || "New task"}
        items={subKpisDraft}
        segmented={draftUseSegments}
        segments={draftSegments}
        canSegment={showSegmentedCreateOption}
        minimumSegmentItems={MIN_SEGMENTED_SUBKPIS_FOR_CREATE}
        hideDueDate={effectiveIsRecurring && maintenanceFrequency === "Daily"}
        parentDueDate={mainTaskTargetDateDraft}
        onChange={setSubKpisDraft}
        onSegmentedChange={setDraftSegmentedMode}
        onSegmentsChange={setDraftSegments}
        onClose={() => setDraftSubTasksOpen(false)}
      />

      <TravelOrderRequestModal
        open={travelOrderModalOpen}
        taskGroupTitle={normalizeTaskTitle(maintenanceTitle)}
        mainTaskName={mainTaskDraft.trim()}
        scopedCompanyTeamId={scopedCompanyTeamId || adminDesignatedCompanyId}
        companyScopeAgentId={null}
        onClose={() => setTravelOrderModalOpen(false)}
        onCreated={async () => {
          setOk("Field Assignment and travel order created.");
          setTravelOrderModalOpen(false);
          resetTaskDraftForNewGroup();
          setMaintenanceTitle("");
          setScopedCompanyTeamId("");
          const reload = await fetch(`/api/kpi-maintenance${kpiMaintenanceSearch}`, { cache: "no-store" });
          if (reload.ok) {
            const payload = (await reload.json()) as { rows: KpiDefinitionMaintenanceRecord[] };
            setMaintenanceRows(payload.rows);
            onMaintenanceRecordsUpdated?.(payload.rows);
          }
        }}
      />

      <TaskBoardPopup
        open={browseAllOpen}
        title={`Task Groups — ${adminDesignatedCompanyName ?? "Your Company"}`}
        description="Browse, search, and select a task group for this task."
        onClose={() => setBrowseAllOpen(false)}
        size="xl"
      >
        <TaskGroupBrowser
          rows={maintenanceRows}
          selectedTitle={maintenanceTitle}
          onSelect={(title) => {
            selectTaskGroup(title);
            setBrowseAllOpen(false);
          }}
        />
      </TaskBoardPopup>
    </section>
  );
}

function TaskGroupBrowser({
  rows,
  selectedTitle,
  onSelect,
}: {
  rows: KpiDefinitionMaintenanceRecord[];
  selectedTitle: string;
  onSelect: (title: string) => void;
}) {
  const [browseQuery, setBrowseQuery] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 10;

  const filtered = useMemo(() => {
    // Dedupe to unique task groups (title). Each create binds only the group name —
    // never a specific prior task row's fields/subtasks.
    const byTitle = new Map<string, { title: string; taskCount: number; createdAt: string | null }>();
    for (const r of rows) {
      const title = r.title?.trim();
      if (!title) continue;
      const key = title.toLowerCase();
      const prev = byTitle.get(key);
      if (prev) {
        prev.taskCount += 1;
        if (r.createdAt && (!prev.createdAt || r.createdAt < prev.createdAt)) {
          prev.createdAt = r.createdAt;
        }
      } else {
        byTitle.set(key, { title, taskCount: 1, createdAt: r.createdAt ?? null });
      }
    }
    const groups = Array.from(byTitle.values());
    const q = browseQuery.toLowerCase();
    return groups
      .filter((g) => !q || g.title.toLowerCase().includes(q))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [rows, browseQuery]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = useMemo(
    () => filtered.slice(safePage * pageSize, (safePage + 1) * pageSize),
    [filtered, safePage],
  );

  useEffect(() => {
    setPage(0);
  }, [browseQuery]);

  return (
    <div className="space-y-4">
      <input
        value={browseQuery}
        onChange={(e) => setBrowseQuery(e.target.value)}
        placeholder="Search task groups…"
        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm font-semibold tracking-tight text-zinc-900 outline-none ring-orange-500/30 placeholder:font-normal placeholder:tracking-normal placeholder:text-zinc-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      />
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">
          {browseQuery ? "No task groups match your search." : "No task groups yet for this company."}
        </p>
      ) : (
        <div className="space-y-2">
          {pageItems.map((group) => {
            const created = group.createdAt
              ? new Date(group.createdAt).toLocaleDateString("en-PH", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })
              : "—";
            return (
              <button
                key={group.title}
                type="button"
                onClick={() => onSelect(group.title)}
                className={cn(
                  "w-full rounded-xl border px-4 py-3 text-left transition",
                  selectedTitle === group.title
                    ? "border-orange-300 bg-orange-50 dark:border-orange-600/50 dark:bg-orange-500/10"
                    : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600 dark:hover:bg-zinc-800",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      {group.title}{" "}
                      <span className="font-normal text-zinc-500">
                        ({group.taskCount} task{group.taskCount !== 1 ? "s" : ""})
                      </span>
                    </p>
                    <p className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">Created: {created}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {pageCount > 1 ? (
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={safePage === 0}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-xl px-3 text-xs"
          >
            Previous
          </Button>
          <span className="text-xs text-zinc-500">
            Page {safePage + 1} of {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-xl px-3 text-xs"
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function TaskGroupSearch({
  maintenanceTitle,
  companyName,
  onSelect,
  onBlur,
  onBrowseAll,
  TASK_TITLE_INPUT_CLASS,
}: {
  maintenanceTitle: string;
  titleSuggestions?: string[];
  companyName: string | null;
  onSelect: (title: string) => void;
  onBlur: () => void;
  onBrowseAll: () => void;
  TASK_TITLE_INPUT_CLASS: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMousedown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMousedown);
    return () => document.removeEventListener("mousedown", onMousedown);
  }, []);

  function handleBlur() {
    setOpen(false);
    onBlur();
  }

  return (
    <div className="relative" ref={ref}>
      <input
        value={open ? query : maintenanceTitle}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (!e.target.value) onSelect("");
        }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        placeholder="Select task group…"
        className={TASK_TITLE_INPUT_CLASS + " w-full"}
      />
      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {companyName ? (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onBrowseAll();
              }}
              className="w-full px-3 py-2.5 text-left text-sm font-bold text-orange-700 transition hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-500/10"
            >
              Browse ({companyName}) TASKS
            </button>
          ) : (
            <p className="px-3 py-2.5 text-sm text-zinc-500">No company assigned — browse all available task groups.</p>
          )}
        </div>
      )}
    </div>
  );
}

