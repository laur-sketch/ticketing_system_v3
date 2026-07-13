"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/DatePickerField";
import { cn } from "@/lib/cn";
import {
  IT_PROJECT_IMPLEMENTATION_TITLE,
  isItProjectImplementationPillar,
} from "@/lib/it-task-pillar-titles";
import { DEFAULT_TIME_ZONE, type KpiFrequencyCode } from "@/lib/kpi-recurrence";
import {
  MIN_SEGMENTED_SUBKPIS_FOR_CREATE,
  type SubKpiItem as SubKpi,
} from "@/lib/kpi-subkpis";
import type { SubKpiCompletionRequirements } from "@/lib/sub-kpi-completion-mode";
import { TaskBoardPopup } from "@/components/task-board/TaskBoardPopup";

const MIN_SUB_FOR_SEGMENT_OPTION = 3;
const INSIGHTS_VIEW_ONLY = false;

function normalizeTaskTitle(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

const TASK_TITLE_INPUT_CLASS =
  "rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm font-semibold tracking-tight text-zinc-900 outline-none ring-orange-500/30 placeholder:font-normal placeholder:tracking-normal placeholder:text-zinc-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

type MaintenanceFrequency = "Daily" | "Weekly" | "Monthly" | "Quarterly";
type DraftSegmentRow = { id: string; label: string; items: SubKpi[] };
type ItProjectSubDraft = { id: string; title: string; dueDate: string };
type ItProjectPhaseDraft = { id: string; name: string; items: ItProjectSubDraft[] };

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
  const [useItProjectImplementation, setUseItProjectImplementation] = useState(false);
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [maintenanceIsRecurring, setMaintenanceIsRecurring] = useState(true);
  const [maintenanceFrequency, setMaintenanceFrequency] = useState<MaintenanceFrequency>("Daily");
  const [recurrenceWeekday, setRecurrenceWeekday] = useState(1);
  const [recurrenceMonthDay, setRecurrenceMonthDay] = useState(1);
  const [subKpiDraft, setSubKpiDraft] = useState("");
  const [subKpiScheduleDate, setSubKpiScheduleDate] = useState("");
  const [subKpiTargetDate, setSubKpiTargetDate] = useState("");
  const [subKpisDraft, setSubKpisDraft] = useState<SubKpi[]>([]);
  const [draftUseSegments, setDraftUseSegments] = useState(false);
  const [completionCheckbox, setCompletionCheckbox] = useState(true);
  const [completionBeforeAfterScreenshots, setCompletionBeforeAfterScreenshots] = useState(false);
  const [completionScreenshotUpload, setCompletionScreenshotUpload] = useState(false);
  const [completionNumerical, setCompletionNumerical] = useState(false);
  const [numericalTargetDraft, setNumericalTargetDraft] = useState("");
  const [dailyPenaltyDraft, setDailyPenaltyDraft] = useState("");
  const [draftSegments, setDraftSegments] = useState<DraftSegmentRow[]>([]);
  const [newPillarDraft, setNewPillarDraft] = useState("");
  const [scopedCompanyTeamId, setScopedCompanyTeamId] = useState("");
  const [rosterCompanies, setRosterCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [segItemDraft, setSegItemDraft] = useState<Record<string, string>>({});
  const [segItemScheduleDate, setSegItemScheduleDate] = useState<Record<string, string>>({});
  const [segItemTargetDate, setSegItemTargetDate] = useState<Record<string, string>>({});
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
  const [itProjectNameDraft, setItProjectNameDraft] = useState("");
  const [itProjectPhases, setItProjectPhases] = useState<ItProjectPhaseDraft[]>([]);
  const [activePhaseId, setActivePhaseId] = useState<string | null>(null);
  const [itProjectPhaseName, setItProjectPhaseName] = useState("Phase 1");
  const [itProjectSubDraft, setItProjectSubDraft] = useState<ItProjectSubDraft[]>([]);
  const [itProjectSubTitle, setItProjectSubTitle] = useState("");
  const [itProjectSubDue, setItProjectSubDue] = useState("");

  const isItProject = useItProjectImplementation;

  useEffect(() => {
    queueMicrotask(() => {
      if (isItProject && !activePhaseId) {
        setActivePhaseId(crypto.randomUUID());
      }
    });
  }, [isItProject, activePhaseId]);

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
  const hideSubTaskScheduleDate = !isItProject;
  const showSegmentedCreateOption =
    !isItProject && (draftUseSegments || draftSubKpiTotal >= MIN_SUB_FOR_SEGMENT_OPTION);

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
    selectMaintenanceTitle(normalized);
    setNewPillarDraft("");
    setLocalError(null);
  }

  const snapshotCurrentItProjectPhase = useCallback(
    (phases: ItProjectPhaseDraft[]): ItProjectPhaseDraft[] => {
      if (!activePhaseId) return phases;
      const snap: ItProjectPhaseDraft = {
        id: activePhaseId,
        name: itProjectPhaseName.trim() || `Phase ${phases.length + 1}`,
        items: [...itProjectSubDraft],
      };
      const idx = phases.findIndex((p) => p.id === activePhaseId);
      if (idx >= 0) {
        const next = [...phases];
        next[idx] = snap;
        return next;
      }
      return [...phases, snap];
    },
    [activePhaseId, itProjectPhaseName, itProjectSubDraft],
  );

  const itProjectPhasesForUi = useMemo(
    () => snapshotCurrentItProjectPhase(itProjectPhases),
    [itProjectPhases, snapshotCurrentItProjectPhase],
  );

  function switchItProjectPhase(phaseId: string) {
    const merged = snapshotCurrentItProjectPhase(itProjectPhases);
    const target = merged.find((p) => p.id === phaseId);
    if (!target) return;
    setItProjectPhases(merged);
    setActivePhaseId(target.id);
    setItProjectPhaseName(target.name);
    setItProjectSubDraft([...target.items]);
    setLocalError(null);
  }

  function addItProjectPhase() {
    const merged = snapshotCurrentItProjectPhase(itProjectPhases);
    const newId = crypto.randomUUID();
    setItProjectPhases(merged);
    setActivePhaseId(newId);
    setItProjectPhaseName(`Phase ${merged.length + 1}`);
    setItProjectSubDraft([]);
    setItProjectSubTitle("");
    setItProjectSubDue("");
    setLocalError(null);
  }

  function addItProjectSubDraft() {
    const title = itProjectSubTitle.trim();
    if (!title) return;
    if (!itProjectSubDue) {
      setLocalError("Each sub-task needs a due date.");
      return;
    }
    if (!activePhaseId) setActivePhaseId(crypto.randomUUID());
    setItProjectSubDraft((prev) => [
      ...prev,
      { id: crypto.randomUUID(), title, dueDate: itProjectSubDue },
    ]);
    setItProjectSubTitle("");
    setItProjectSubDue("");
    setLocalError(null);
  }

  function removeItProjectSubDraft(id: string) {
    setItProjectSubDraft((prev) => prev.filter((s) => s.id !== id));
  }

  function addSubKpiDraft() {
    const trimmed = subKpiDraft.trim();
    if (!trimmed || draftUseSegments) return;
    const targetDate = maintenanceIsRecurring ? "" : subKpiTargetDate;
    setSubKpisDraft((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        title: trimmed,
        ...(targetDate ? { dueDate: targetDate } : {}),
      },
    ]);
    setSubKpiDraft("");
    setSubKpiTargetDate("");
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
      setSegItemDraft({});
      return;
    }
    setDraftUseSegments(true);
    if (subKpisDraft.length > 0) {
      const defaultLabel = maintenanceTitle.trim() || "Checklist";
      setDraftSegments([{ id: crypto.randomUUID(), label: defaultLabel, items: [...subKpisDraft] }]);
      setSubKpisDraft([]);
      return;
    }
    if (draftSegments.length === 0) {
      setDraftSegments([
        { id: crypto.randomUUID(), label: maintenanceTitle.trim() || "Segment 1", items: [] },
      ]);
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
    const targetDate = maintenanceIsRecurring ? "" : segItemTargetDate[segmentId] ?? "";
    setDraftSegments((prev) =>
      prev.map((s) =>
        s.id === segmentId
          ? {
              ...s,
              items: [
                ...s.items,
                {
                  id: crypto.randomUUID(),
                  title: raw,
                  ...(targetDate ? { dueDate: targetDate } : {}),
                },
              ],
            }
          : s,
      ),
    );
    setSegItemDraft((prev) => ({ ...prev, [segmentId]: "" }));
    setSegItemTargetDate((prev) => ({ ...prev, [segmentId]: "" }));
    setLocalError(null);
  }

  function removeDraftSegmentRow(segmentId: string) {
    setDraftSegments((prev) => prev.filter((s) => s.id !== segmentId));
    setSegItemDraft((prev) => {
      const n = { ...prev };
      delete n[segmentId];
      return n;
    });
    setSegItemScheduleDate((prev) => {
      const n = { ...prev };
      delete n[segmentId];
      return n;
    });
    setSegItemTargetDate((prev) => {
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

  function selectMaintenanceTitle(title: string) {
    setMaintenanceTitle(title);
    setLocalError(null);
    if (isItProjectImplementationPillar(title)) {
      setUseItProjectImplementation(true);
      setMaintenanceIsRecurring(false);
      setCompletionCheckbox(true);
      setCompletionBeforeAfterScreenshots(false);
      setCompletionScreenshotUpload(false);
      setCompletionNumerical(false);
      setNumericalTargetDraft("");
      setDraftUseSegments(false);
      setDraftSegments([]);
    } else {
      setUseItProjectImplementation(false);
      setItProjectNameDraft("");
      setItProjectPhases([]);
      setActivePhaseId(null);
      setItProjectPhaseName("Phase 1");
      setItProjectSubDraft([]);
      setItProjectSubTitle("");
      setItProjectSubDue("");
    }
  }

  function handleItProjectImplementationChange(enabled: boolean) {
    setUseItProjectImplementation(enabled);
    setLocalError(null);
    if (enabled) {
      setMaintenanceIsRecurring(false);
      setCompletionCheckbox(true);
      setCompletionBeforeAfterScreenshots(false);
      setCompletionScreenshotUpload(false);
      setCompletionNumerical(false);
      setNumericalTargetDraft("");
      setDraftUseSegments(false);
      setDraftSegments([]);
    } else {
      setItProjectNameDraft("");
      setItProjectPhases([]);
      setActivePhaseId(null);
      setItProjectPhaseName("Phase 1");
      setItProjectSubDraft([]);
      setItProjectSubTitle("");
      setItProjectSubDue("");
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
    const title = useItProjectImplementation
      ? IT_PROJECT_IMPLEMENTATION_TITLE
      : normalizeTaskTitle(maintenanceTitle);
    if (!maintenanceTitle.trim()) {
      setError("Select a task group.");
      return;
    }
    if (!isItProject && !mainTaskDraft.trim()) {
      setError("Enter a main task name.");
      return;
    }
    if (!useItProjectImplementation && title !== maintenanceTitle) {
      setMaintenanceTitle(title);
      selectMaintenanceTitle(title);
    }
    const freqUpper = (
      !isItProject && !maintenanceIsRecurring ? "MONTHLY" : maintenanceFrequency.toUpperCase()
    ) as KpiFrequencyCode;

    if (isItProject) {
      const phasesForSubmit = snapshotCurrentItProjectPhase(itProjectPhases);
      const hasTasks = phasesForSubmit.some((p) => p.items.length > 0);
      if (!hasTasks) {
        setError("Add at least one sub-task with a due date in at least one phase.");
        return;
      }
    } else if (draftUseSegments) {
      for (const seg of draftSegments) {
        if (!seg.label.trim()) {
          setError('Each checklist segment needs a label (or turn off "Segment this checklist").');
          return;
        }
        if (seg.items.length === 0) {
          setError(`Add at least one sub-task under "${seg.label.trim()}" or remove that segment.`);
          return;
        }
      }
      const segmentedTotal = draftSegments.reduce((a, s) => a + s.items.length, 0);
      if (segmentedTotal < MIN_SEGMENTED_SUBKPIS_FOR_CREATE) {
        setError(
          `Segmented checklists need at least ${MIN_SEGMENTED_SUBKPIS_FOR_CREATE} sub-tasks in total, or turn off "Segment this checklist".`,
        );
        return;
      }
    } else if (subKpisDraft.length === 0 && draftUseSegments) {
      setError("Add at least one sub-task (checklist item) before saving, or turn off segmented checklists.");
      return;
    }

    if (
      !isItProject &&
      !completionRequirements.checkbox &&
      !completionRequirements.screenshots &&
      !completionRequirements.screenshotUpload &&
      !completionRequirements.numerical
    ) {
      setError("Select at least one completion condition.");
      return;
    }

    if (!isItProject && completionRequirements.numerical) {
      const isPillarOnlyDraft = !draftUseSegments && subKpisDraft.length === 0;
      const skipTargetAtCreate = maintenanceIsRecurring && isPillarOnlyDraft;
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
      isRecurring: isItProject ? false : maintenanceIsRecurring,
    };
    if (!isItProject) {
      body.mainTask = mainTaskDraft.trim();
      body.completionRequirements = completionRequirements;
      if (scopedCompanyTeamId) body.scopedCompanyTeamId = scopedCompanyTeamId;
      if (completionRequirements.numerical) {
        const targetRaw = numericalTargetDraft.trim();
        if (targetRaw !== "") {
          body.numericalTarget = Number(targetRaw);
        }
      }
      if (!maintenanceIsRecurring) {
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
    }
    if (isItProject) {
      const phasesForSubmit = snapshotCurrentItProjectPhase(itProjectPhases).filter((p) => p.items.length > 0);
      body.itProjectPhases = phasesForSubmit.map((p) => ({
        name: p.name,
        items: p.items.map((s) => ({ title: s.title, dueDate: s.dueDate })),
      }));
    } else if (draftUseSegments) {
      body.subKpisSegmented = true;
      body.segments = draftSegments.map((s) => ({
        label: s.label.trim(),
        items: s.items.map((it) => ({
          title: it.title.trim(),
          dueDate: maintenanceIsRecurring ? "" : it.dueDate ?? "",
        })),
      }));
    } else {
      body.subKpis = subKpisDraft.map((s) => ({
        title: s.title,
        dueDate: maintenanceIsRecurring ? "" : s.dueDate ?? "",
      }));
      if (subKpisDraft.length === 0 && !maintenanceIsRecurring && mainTaskTargetDateDraft.trim()) {
        body.pillarDueDate = mainTaskTargetDateDraft.trim();
      }
    }

    if (!isItProject && maintenanceIsRecurring && freqUpper === "WEEKLY") {
      body.recurrenceWeekday = recurrenceWeekday;
    }
    if (
      !isItProject &&
      maintenanceIsRecurring &&
      (freqUpper === "MONTHLY" || freqUpper === "QUARTERLY")
    ) {
      body.recurrenceMonthDay = recurrenceMonthDay;
    }
    body.timeZone = recurrenceTz;

    if (isItProjectImplementationPillar(title)) {
      const pn = itProjectNameDraft.trim();
      if (pn) body.itProjectName = pn;
    }

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
          }
      // Immediately add the newly created task group title to the dropdown
      setTitleSuggestions((prev) => {
        if (prev.some((t) => t.toLowerCase() === title.toLowerCase())) return prev;
        return [...prev, title].sort();
      });
      const reload = await fetch(`/api/kpi-maintenance${kpiMaintenanceSearch}`, { cache: "no-store" });
      if (reload.ok) {
        const payload = (await reload.json()) as { rows: KpiDefinitionMaintenanceRecord[] };
        onMaintenanceRecordsUpdated?.(payload.rows);
      }
    } else {
      let message = "Could not save KPI.";
      try {
        const parsed = JSON.parse(raw) as { error?: unknown };
        if (typeof parsed.error === "string" && parsed.error.trim()) {
          message = parsed.error.trim();
        }
      } catch {
        if (raw.trim()) message = raw.trim().slice(0, 400);
      }
      setError(message);
      return;
    }
    setError(null);
    setUseItProjectImplementation(false);
    setMaintenanceTitle("");
    setMainTaskDraft("");
    setMainTaskTargetDateDraft("");
    setMaintenanceIsRecurring(true);
    setMaintenanceFrequency("Daily");
    setRecurrenceWeekday(1);
    setRecurrenceMonthDay(1);
    setSubKpisDraft([]);
    setSubKpiDraft("");
    setSubKpiScheduleDate("");
    setSubKpiTargetDate("");
    setDraftUseSegments(false);
    setCompletionCheckbox(true);
    setCompletionBeforeAfterScreenshots(false);
    setCompletionScreenshotUpload(false);
    setCompletionNumerical(false);
    setNumericalTargetDraft("");
    setDailyPenaltyDraft("");
    setScopedCompanyTeamId("");
    setNewPillarDraft("");
    setDraftSegments([]);
    setSegItemDraft({});
    setSegItemScheduleDate({});
    setSegItemTargetDate({});
    setItProjectNameDraft("");
    setItProjectPhases([]);
    setActivePhaseId(null);
    setItProjectPhaseName("Phase 1");
    setItProjectSubDraft([]);
    setItProjectSubTitle("");
    setItProjectSubDue("");
    // Re-fetch with company scope so the dropdown matches the admin's company
    void loadAssignFlag(adminDesignatedCompanyId ?? undefined);
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
              setMaintenanceTitle(next);
              selectMaintenanceTitle(next);
              if (!next.trim()) {
                setUseItProjectImplementation(false);
              }
              setLocalError(null);
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
            <div className="grid gap-2 sm:grid-cols-2">
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-zinc-900 dark:text-zinc-100",
                  !isItProject
                    ? "border-orange-500 bg-orange-50/80 ring-1 ring-orange-500/30 dark:border-orange-500/60 dark:bg-orange-950/20"
                    : "border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950",
                )}
              >
                <input
                  type="radio"
                  name="maintenance-task-type"
                  checked={!isItProject}
                  onChange={() => handleItProjectImplementationChange(false)}
                />
                Task
              </label>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-zinc-900 dark:text-zinc-100",
                  isItProject
                    ? "border-orange-500 bg-orange-50/80 ring-1 ring-orange-500/30 dark:border-orange-500/60 dark:bg-orange-950/20"
                    : "border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950",
                )}
              >
                <input
                  type="radio"
                  name="maintenance-task-type"
                  checked={isItProject}
                  onChange={() => handleItProjectImplementationChange(true)}
                />
                Project
              </label>
            </div>
          </fieldset>
        ) : null}
        {hasTaskGroupSelected && !isItProject ? (
          <div className="grid gap-3 md:col-span-2 md:grid-cols-[minmax(220px,1fr)_180px]">
            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
              Main Task
              <input
                type="text"
                value={mainTaskDraft}
                onChange={(e) => {
                  setMainTaskDraft(e.target.value);
                  setLocalError(null);
                }}
                placeholder="e.g. Reroute Connections"
                required
                className={TASK_TITLE_INPUT_CLASS}
              />
            </label>
            {!maintenanceIsRecurring ? (
              <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
                Target date
                <DatePickerField
                  value={mainTaskTargetDateDraft}
                  onChange={(e) => setMainTaskTargetDateDraft(e.target.value)}
                  aria-label="Main task target date"
                  shellClassName="h-10"
                />
              </label>
            ) : null}
            <p className="text-xs font-normal normal-case tracking-normal text-zinc-500 dark:text-zinc-400 md:col-span-2">
              The specific work item under the task group. Works for recurring and one-off schedules — with no
              sub-tasks, completion conditions apply on this main task on the Task Board.
              {!maintenanceIsRecurring
                ? " Target date applies to the main task when there are no sub-tasks (delayed the day after if incomplete)."
                : null}
            </p>
          </div>
        ) : null}
        {hasTaskGroupSelected && isItProject ? (
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500 md:col-span-2">
            Project name
            <input
              type="text"
              value={itProjectNameDraft}
              onChange={(e) => setItProjectNameDraft(e.target.value)}
              placeholder="Name of the project"
              className="rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none ring-orange-500/30 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>
        ) : null}
        {hasTaskGroupSelected && !isItProject ? (
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
                    if (recurringDaily) {
                      setSubKpiScheduleDate("");
                      setSegItemScheduleDate({});
                    }
                    setSubKpiTargetDate("");
                    setMainTaskTargetDateDraft("");
                    setSegItemTargetDate({});
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
        {hasTaskGroupSelected && !isItProject && maintenanceIsRecurring ? (
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
            Frequency
            <select
              value={maintenanceFrequency}
              onChange={(e) => {
                const nextFrequency = e.target.value as MaintenanceFrequency;
                setMaintenanceFrequency(nextFrequency);
                if (maintenanceIsRecurring && nextFrequency === "Daily") {
                  setSubKpiScheduleDate("");
                  setSegItemScheduleDate({});
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
        {hasTaskGroupSelected && !isItProject && maintenanceIsRecurring && maintenanceFrequency === "Weekly" ? (
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
        !isItProject &&
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
        <div className="rounded-xl border border-dashed border-zinc-300 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400 md:col-span-2">
          {!hasTaskGroupSelected
            ? "Select a task group to continue."
            : isItProject
              ? "IT Project tasks are not recurring. Add phases and set a due date on each sub-task. Assignees enter actual dates (MM/DD/YYYY) when work is done."
              : maintenanceIsRecurring
                ? "Sub-tasks are optional. Without them, completion conditions apply on the main task each cycle."
                : "Sub-tasks are optional. Without them, set a main task target date and complete work on the main task — delayed the day after target if still incomplete."}
        </div>
      </div>

      {hasTaskGroupSelected && !isItProject ? (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/70 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-300">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
            Completion conditions
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Select one or more ways assignees can complete work on the Task Board. With no sub-tasks, these apply on
            the main task (recurring and one-off).
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
                {maintenanceIsRecurring && subKpisDraft.length === 0
                  ? "Optional for recurring tasks with no sub-tasks — assignees set the target each cycle on the Task Board."
                  : "Assignees will see this target when recording their actual number on the Task Board."}
              </span>
            </label>
          ) : null}
          {!isItProject && !maintenanceIsRecurring ? (
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

      {showSegmentedCreateOption && kpiMaintenanceAssignWork && hasTaskGroupSelected ? (
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

      {hasTaskGroupSelected && isItProject ? (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Build one phase at a time. Use <strong>Add another phase</strong> to save the current phase and start the
            next. Switch phases to edit earlier steps before saving the KPI.
          </p>
          <label className="flex max-w-md flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
            Phase name
            <input
              value={itProjectPhaseName}
              onChange={(e) => setItProjectPhaseName(e.target.value)}
              placeholder="e.g. Discovery"
              className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none ring-orange-500/30 focus:border-orange-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>
          {itProjectPhasesForUi.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {itProjectPhasesForUi.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => switchItProjectPhase(p.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-semibold transition",
                    p.id === activePhaseId
                      ? "border-orange-500 bg-orange-500/15 text-orange-900 dark:border-orange-400 dark:text-orange-100"
                      : "border-zinc-300 bg-white text-zinc-700 hover:border-orange-400 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-300",
                  )}
                >
                  {p.name}
                  <span className="ml-1 opacity-70">({p.items.length})</span>
                </button>
              ))}
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500 md:col-span-2">
              Sub-task title
              <input
                value={itProjectSubTitle}
                onChange={(e) => setItProjectSubTitle(e.target.value)}
                placeholder="e.g. Discovery workshop"
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none ring-orange-500/30 focus:border-orange-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
              Due date
              <DatePickerField
                value={itProjectSubDue}
                onChange={(e) => setItProjectSubDue(e.target.value)}
                inputClassName="font-normal normal-case tracking-normal"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={addItProjectSubDraft} className="rounded-xl px-4">
              Add sub-task
            </Button>
            <Button type="button" variant="outline" onClick={addItProjectPhase} className="rounded-xl px-4">
              Add another phase
            </Button>
            <Button type="button" onClick={() => void createMaintenanceRecord()} className="rounded-xl px-4">
              Apply
            </Button>
          </div>
          {itProjectSubDraft.length > 0 ? (
            <ul className="space-y-2">
              {itProjectSubDraft.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950/40"
                >
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">{s.title}</span>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">Due {s.dueDate}</span>
                  <button
                    type="button"
                    onClick={() => removeItProjectSubDraft(s.id)}
                    className="text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : hasTaskGroupSelected && !draftUseSegments ? (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px_180px_auto]">
            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
              Sub-task title
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
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none ring-orange-500/30 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            {!maintenanceIsRecurring ? (
              <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
                Target date
                <DatePickerField
                  value={subKpiTargetDate}
                  onChange={(e) => setSubKpiTargetDate(e.target.value)}
                  aria-label="Target date"
                  shellClassName="h-10"
                />
              </label>
            ) : null}
            <Button type="button" onClick={addSubKpiDraft} className="rounded-xl px-4">
              Add sub-task
            </Button>
          </div>
          <Button type="button" onClick={() => void createMaintenanceRecord()} className="rounded-xl px-4">
            Apply
          </Button>
        </div>
      ) : hasTaskGroupSelected ? (
        <div className="mt-3 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={addDraftSegmentRow} className="rounded-xl">
              Add segment
            </Button>
            <Button type="button" onClick={() => void createMaintenanceRecord()} className="rounded-xl px-4">
              Apply
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
              <div className="mt-3 grid gap-2 md:grid-cols-[minmax(200px,1fr)_180px_180px_auto]">
                <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-500">
                  Sub-task title
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
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>
                {!maintenanceIsRecurring ? (
                  <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-500">
                    Target date
                    <DatePickerField
                      value={segItemTargetDate[seg.id] ?? ""}
                      disabled={!seg.label.trim()}
                      onChange={(e) => setSegItemTargetDate((p) => ({ ...p, [seg.id]: e.target.value }))}
                      aria-label={`Target date for ${seg.label || "segment item"}`}
                      shellClassName="h-10 rounded-lg"
                    />
                  </label>
                ) : null}
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
                      {it.title}
                      {it.dueDate ? ` · Target ${it.dueDate}` : ""} ×
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {hasTaskGroupSelected && !isItProject && !draftUseSegments && subKpisDraft.length > 0 ? (
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
              {s.dueDate ? ` · Target ${s.dueDate}` : ""} ×
            </button>
          ))}
        </div>
      ) : null}

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
            setMaintenanceTitle(title);
            selectMaintenanceTitle(title);
            setLocalError(null);
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

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        const q = browseQuery.toLowerCase();
        return (
          !q ||
          r.title.toLowerCase().includes(q) ||
          (r.mainTask ?? "").toLowerCase().includes(q)
        );
      }),
    [rows, browseQuery],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = useMemo(
    () => filtered.slice(safePage * pageSize, (safePage + 1) * pageSize),
    [filtered, safePage],
  );

  useEffect(() => {
    setPage(0);
  }, [browseQuery]);

  function countTasks(row: KpiDefinitionMaintenanceRecord): number {
    if (Array.isArray(row.subKpis)) return row.subKpis.length;
    if (row.subKpis && typeof row.subKpis === "object") {
      const env = row.subKpis as Record<string, unknown>;
      if (env.segmented === true && Array.isArray(env.segments)) {
        return (env.segments as Array<{ items?: unknown[] }>).reduce((sum, seg) => sum + (seg.items?.length ?? 0), 0);
      }
      if (Array.isArray(env.items)) return env.items.length;
    }
    return 0;
  }

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
          {pageItems.map((row) => {
            const taskCount = countTasks(row);
            const created = row.createdAt
              ? new Date(row.createdAt).toLocaleDateString("en-PH", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })
              : "—";
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => onSelect(row.title)}
                className={cn(
                  "w-full rounded-xl border px-4 py-3 text-left transition",
                  selectedTitle === row.title
                    ? "border-orange-300 bg-orange-50 dark:border-orange-600/50 dark:bg-orange-500/10"
                    : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600 dark:hover:bg-zinc-800",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      {row.title} <span className="font-normal text-zinc-500">({taskCount} task{taskCount !== 1 ? "s" : ""})</span>
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

