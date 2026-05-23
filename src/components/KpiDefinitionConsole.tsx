"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/DatePickerField";
import { cn } from "@/lib/cn";
import {
  IT_TASK_PILLAR_SELECT_OPTIONS,
  isItProjectImplementationPillar,
  isSelectableItTaskPillarTitle,
} from "@/lib/it-task-pillar-titles";
import { DEFAULT_TIME_ZONE, type KpiFrequencyCode } from "@/lib/kpi-recurrence";
import {
  MIN_SEGMENTED_SUBKPIS_FOR_CREATE,
  type SubKpiItem as SubKpi,
} from "@/lib/kpi-subkpis";

const MIN_SUB_FOR_SEGMENT_OPTION = 3;
const INSIGHTS_VIEW_ONLY = false;

type MaintenanceFrequency = "Daily" | "Weekly" | "Monthly" | "Quarterly";
type DraftSegmentRow = { id: string; label: string; items: SubKpi[] };
type ItProjectSubDraft = { id: string; title: string; dueDate: string };
type ItProjectPhaseDraft = { id: string; name: string; items: ItProjectSubDraft[] };

export type KpiDefinitionMaintenanceRecord = {
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
};

export function KpiDefinitionConsole({ onMaintenanceRecordsUpdated }: Props) {
  const [recurrenceTz, setRecurrenceTz] = useState(DEFAULT_TIME_ZONE);
  const [maintenanceTitle, setMaintenanceTitle] = useState("");
  const [maintenanceIsRecurring, setMaintenanceIsRecurring] = useState(true);
  const [nonRecurringStartDate, setNonRecurringStartDate] = useState("");
  const [nonRecurringEndDate, setNonRecurringEndDate] = useState("");
  const [maintenanceFrequency, setMaintenanceFrequency] = useState<MaintenanceFrequency>("Daily");
  const [recurrenceWeekday, setRecurrenceWeekday] = useState(1);
  const [recurrenceMonthDay, setRecurrenceMonthDay] = useState(1);
  const [subKpiDraft, setSubKpiDraft] = useState("");
  const [subKpiScheduleDate, setSubKpiScheduleDate] = useState("");
  const [subKpiTargetDate, setSubKpiTargetDate] = useState("");
  const [subKpisDraft, setSubKpisDraft] = useState<SubKpi[]>([]);
  const [draftUseSegments, setDraftUseSegments] = useState(false);
  const [enableTaskScreenshots, setEnableTaskScreenshots] = useState(false);
  const [screenshotAttachmentScope, setScreenshotAttachmentScope] = useState<"subtask" | "pillar">("subtask");
  const [draftSegments, setDraftSegments] = useState<DraftSegmentRow[]>([]);
  const [segItemDraft, setSegItemDraft] = useState<Record<string, string>>({});
  const [segItemScheduleDate, setSegItemScheduleDate] = useState<Record<string, string>>({});
  const [segItemTargetDate, setSegItemTargetDate] = useState<Record<string, string>>({});
  const [kpiMaintenanceAssignWork, setKpiMaintenanceAssignWork] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [itProjectNameDraft, setItProjectNameDraft] = useState("");
  const [itProjectPhases, setItProjectPhases] = useState<ItProjectPhaseDraft[]>([]);
  const [activePhaseId, setActivePhaseId] = useState<string | null>(null);
  const [itProjectPhaseName, setItProjectPhaseName] = useState("Phase 1");
  const [itProjectSubDraft, setItProjectSubDraft] = useState<ItProjectSubDraft[]>([]);
  const [itProjectSubTitle, setItProjectSubTitle] = useState("");
  const [itProjectSubDue, setItProjectSubDue] = useState("");

  const isItProject = isItProjectImplementationPillar(maintenanceTitle);

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

  const kpiMaintenanceSearch = useMemo(
    () => `?tz=${encodeURIComponent(recurrenceTz)}`,
    [recurrenceTz],
  );

  const loadAssignFlag = useCallback(async () => {
    const kpiRes = await fetch(`/api/kpi-maintenance${kpiMaintenanceSearch}`, { cache: "no-store" });
    if (kpiRes.ok) {
      const payload = (await kpiRes.json()) as { canAssignWork?: boolean };
      setKpiMaintenanceAssignWork(Boolean(payload.canAssignWork));
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
  const hideSubTaskScheduleDate = !isItProject && maintenanceIsRecurring && maintenanceFrequency === "Daily";
  const showSegmentedCreateOption =
    !isItProject && (draftUseSegments || draftSubKpiTotal >= MIN_SUB_FOR_SEGMENT_OPTION);

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
    const scheduleDate = hideSubTaskScheduleDate ? "" : subKpiScheduleDate;
    const targetDate = maintenanceIsRecurring ? "" : subKpiTargetDate;
    if (scheduleDate && targetDate && targetDate < scheduleDate) {
      setLocalError("Target date must be on or after the schedule date.");
      return;
    }
    setSubKpisDraft((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        title: trimmed,
        ...(scheduleDate ? { startDate: scheduleDate } : {}),
        ...(targetDate ? { dueDate: targetDate } : {}),
      },
    ]);
    setSubKpiDraft("");
    if (!hideSubTaskScheduleDate) setSubKpiScheduleDate("");
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
    const scheduleDate = hideSubTaskScheduleDate ? "" : segItemScheduleDate[segmentId] ?? "";
    const targetDate = maintenanceIsRecurring ? "" : segItemTargetDate[segmentId] ?? "";
    if (scheduleDate && targetDate && targetDate < scheduleDate) {
      setLocalError("Target date must be on or after the schedule date.");
      return;
    }
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
                  ...(scheduleDate ? { startDate: scheduleDate } : {}),
                  ...(targetDate ? { dueDate: targetDate } : {}),
                },
              ],
            }
          : s,
      ),
    );
    setSegItemDraft((prev) => ({ ...prev, [segmentId]: "" }));
    if (!hideSubTaskScheduleDate) {
      setSegItemScheduleDate((prev) => ({ ...prev, [segmentId]: "" }));
    }
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

  async function createMaintenanceRecord() {
    if (INSIGHTS_VIEW_ONLY) return;
    const title = maintenanceTitle.trim();
    if (!title || !isSelectableItTaskPillarTitle(title)) {
      setLocalError("Choose a task title from the IT pillar list.");
      return;
    }
    const freqUpper = maintenanceFrequency.toUpperCase() as KpiFrequencyCode;

    if (isItProject) {
      const phasesForSubmit = snapshotCurrentItProjectPhase(itProjectPhases);
      const hasTasks = phasesForSubmit.some((p) => p.items.length > 0);
      if (!hasTasks) {
        setLocalError("Add at least one sub-task with a due date in at least one phase.");
        return;
      }
    } else if (draftUseSegments) {
      for (const seg of draftSegments) {
        if (!seg.label.trim()) {
          setLocalError('Each checklist segment needs a label (or turn off "Segment this checklist").');
          return;
        }
        if (seg.items.length === 0) {
          setLocalError(`Add at least one sub-task under "${seg.label.trim()}" or remove that segment.`);
          return;
        }
      }
      const segmentedTotal = draftSegments.reduce((a, s) => a + s.items.length, 0);
      if (segmentedTotal < MIN_SEGMENTED_SUBKPIS_FOR_CREATE) {
        setLocalError(
          `Segmented checklists need at least ${MIN_SEGMENTED_SUBKPIS_FOR_CREATE} sub-tasks in total, or turn off "Segment this checklist".`,
        );
        return;
      }
    } else if (subKpisDraft.length === 0) {
      setLocalError("Add at least one sub-task (checklist item) before saving.");
      return;
    }

    const body: Record<string, unknown> = {
      title,
      frequency: freqUpper,
      isRecurring: isItProject ? false : maintenanceIsRecurring,
    };
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
          startDate: hideSubTaskScheduleDate ? "" : it.startDate ?? "",
          dueDate: maintenanceIsRecurring ? "" : it.dueDate ?? "",
          screenshotsEnabled: enableTaskScreenshots && screenshotAttachmentScope === "subtask",
        })),
      }));
    } else {
      body.subKpis = subKpisDraft.map((s) => ({
        title: s.title,
        startDate: hideSubTaskScheduleDate ? "" : s.startDate ?? "",
        dueDate: maintenanceIsRecurring ? "" : s.dueDate ?? "",
        screenshotsEnabled: enableTaskScreenshots && screenshotAttachmentScope === "subtask",
      }));
    }
    if (!isItProject && enableTaskScreenshots) {
      body.screenshotAttachmentScope = screenshotAttachmentScope;
    }

    if (!isItProject && maintenanceIsRecurring && freqUpper === "WEEKLY") {
      body.recurrenceWeekday = recurrenceWeekday;
    }
    if (!isItProject && maintenanceIsRecurring && (freqUpper === "MONTHLY" || freqUpper === "QUARTERLY")) {
      body.recurrenceMonthDay = recurrenceMonthDay;
    }
    if (!isItProject && !maintenanceIsRecurring) {
      if (!nonRecurringStartDate || !nonRecurringEndDate) {
        setLocalError("Choose start and end dates for this one-off task.");
        return;
      }
      const startAt = new Date(`${nonRecurringStartDate}T00:00:00`);
      const endAt = new Date(`${nonRecurringEndDate}T23:59:59`);
      if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime())) {
        setLocalError("Invalid start or end date.");
        return;
      }
      if (endAt.getTime() <= startAt.getTime()) {
        setLocalError("End date must be after start date.");
        return;
      }
      body.nonRecurringStartAt = startAt.toISOString();
      body.nonRecurringEndAt = endAt.toISOString();
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
    if (res.ok) {
      const reload = await fetch(`/api/kpi-maintenance${kpiMaintenanceSearch}`, { cache: "no-store" });
      if (reload.ok) {
        const payload = (await reload.json()) as { rows: KpiDefinitionMaintenanceRecord[] };
        onMaintenanceRecordsUpdated?.(payload.rows);
      }
    } else {
      const raw = await res.text();
      let message = "Could not save KPI.";
      try {
        const parsed = JSON.parse(raw) as { error?: unknown };
        if (typeof parsed.error === "string" && parsed.error.trim()) {
          message = parsed.error.trim();
        }
      } catch {
        if (raw.trim()) message = raw.trim().slice(0, 400);
      }
      setLocalError(message);
      return;
    }
    setLocalError(null);
    setMaintenanceTitle("");
    setMaintenanceIsRecurring(true);
    setNonRecurringStartDate("");
    setNonRecurringEndDate("");
    setMaintenanceFrequency("Daily");
    setRecurrenceWeekday(1);
    setRecurrenceMonthDay(1);
    setSubKpisDraft([]);
    setSubKpiDraft("");
    setSubKpiScheduleDate("");
    setSubKpiTargetDate("");
    setDraftUseSegments(false);
    setEnableTaskScreenshots(false);
    setScreenshotAttachmentScope("subtask");
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
    void loadAssignFlag();
  }

  return (
    <section className="mb-5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_8px_28px_rgba(0,0,0,0.06)] sm:p-6 dark:border-zinc-800/90 dark:bg-[#0b1220] dark:shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600 dark:text-zinc-500">
        Task management
      </h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Choose an IT pillar as the task title, add task rows, then save. Use the Task Assignment Board below to
        assign personnel to KPI cards.
      </p>
      {localError ? (
        <p className="mt-2 rounded-lg border border-red-500/35 bg-red-50 px-3 py-2 text-xs text-red-900 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-200">
          {localError}
        </p>
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500 md:col-span-2">
          Task title
          <select
            value={maintenanceTitle}
            onChange={(e) => {
              const v = e.target.value;
              setMaintenanceTitle(v);
              setLocalError(null);
              if (isItProjectImplementationPillar(v)) {
                setMaintenanceIsRecurring(false);
                setEnableTaskScreenshots(false);
                setScreenshotAttachmentScope("subtask");
                setDraftUseSegments(false);
                setDraftSegments([]);
                setNonRecurringStartDate("");
                setNonRecurringEndDate("");
              } else {
                setItProjectNameDraft("");
                setItProjectPhases([]);
                setActivePhaseId(null);
                setItProjectPhaseName("Phase 1");
                setItProjectSubDraft([]);
                setItProjectSubTitle("");
                setItProjectSubDue("");
              }
            }}
            required
            className="rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm font-semibold tracking-tight text-zinc-900 outline-none ring-orange-500/30 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <option value="">Select pillar…</option>
            {IT_TASK_PILLAR_SELECT_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        {isItProject ? (
          <>
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
          </>
        ) : null}
        {!isItProject ? (
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
        {!isItProject && !maintenanceIsRecurring ? (
          <>
            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
              Start date
              <DatePickerField
                value={nonRecurringStartDate}
                onChange={(e) => setNonRecurringStartDate(e.target.value)}
                inputClassName="font-normal normal-case tracking-normal"
              />
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
              End date
              <DatePickerField
                value={nonRecurringEndDate}
                onChange={(e) => setNonRecurringEndDate(e.target.value)}
                inputClassName="font-normal normal-case tracking-normal"
              />
            </label>
          </>
        ) : null}
        {!isItProject ? (
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
              disabled={!maintenanceIsRecurring}
              className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none ring-orange-500/30 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            >
              <option value="Daily">Daily</option>
              <option value="Weekly">Weekly</option>
              <option value="Monthly">Monthly</option>
              <option value="Quarterly">Quarterly</option>
            </select>
          </label>
        ) : null}
        {!isItProject && maintenanceIsRecurring && maintenanceFrequency === "Weekly" ? (
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
        {!isItProject &&
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
          {isItProject
            ? "IT Project tasks are not recurring. Add phases and set a due date on each sub-task. Assignees enter actual dates (MM/DD/YYYY) when work is done."
            : "Add task rows with schedule and target dates. By default, assignees complete work with the checklist checkbox on the Task Board."}
        </div>
      </div>

      {!isItProject ? (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/70 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-300">
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={enableTaskScreenshots}
              onChange={(e) => {
                setEnableTaskScreenshots(e.target.checked);
                if (!e.target.checked) setScreenshotAttachmentScope("subtask");
              }}
              className="mt-1"
            />
            <span>
              Add before/after screenshot uploads for this task. Leave this off to use the default checkbox-only completion.
            </span>
          </label>
          {enableTaskScreenshots ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950">
                <input
                  type="radio"
                  name="screenshotAttachmentScope"
                  value="subtask"
                  checked={screenshotAttachmentScope === "subtask"}
                  onChange={() => setScreenshotAttachmentScope("subtask")}
                  className="mt-1"
                />
                <span>
                  <strong className="block text-zinc-900 dark:text-zinc-100">Attach to each sub-task</strong>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    Current behavior: before/after screenshots are required before checking the sub-task done.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950">
                <input
                  type="radio"
                  name="screenshotAttachmentScope"
                  value="pillar"
                  checked={screenshotAttachmentScope === "pillar"}
                  onChange={() => setScreenshotAttachmentScope("pillar")}
                  className="mt-1"
                />
                <span>
                  <strong className="block text-zinc-900 dark:text-zinc-100">Attach to the pillar card</strong>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    Screenshots live on the pillar card; checklist checkboxes continue to work normally.
                  </span>
                </span>
              </label>
            </div>
          ) : null}
        </div>
      ) : null}

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

      {isItProject ? (
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
              Save KPI maintenance
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
      ) : !draftUseSegments ? (
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
          {!hideSubTaskScheduleDate ? (
            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
              Schedule date
              <DatePickerField
                value={subKpiScheduleDate}
                onChange={(e) => setSubKpiScheduleDate(e.target.value)}
                aria-label="Schedule date"
                shellClassName="h-10"
              />
            </label>
          ) : null}
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
            Save KPI maintenance
          </Button>
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={addDraftSegmentRow} className="rounded-xl">
              Add segment
            </Button>
            <Button type="button" onClick={() => void createMaintenanceRecord()} className="rounded-xl px-4">
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
                {!hideSubTaskScheduleDate ? (
                  <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-500">
                    Schedule date
                    <DatePickerField
                      value={segItemScheduleDate[seg.id] ?? ""}
                      disabled={!seg.label.trim()}
                      onChange={(e) => setSegItemScheduleDate((p) => ({ ...p, [seg.id]: e.target.value }))}
                      aria-label={`Schedule date for ${seg.label || "segment item"}`}
                      shellClassName="h-10 rounded-lg"
                    />
                  </label>
                ) : null}
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
                      {it.startDate ? ` · Schedule ${it.startDate}` : ""}
                      {it.dueDate ? ` · Target ${it.dueDate}` : ""} ×
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {!isItProject && !draftUseSegments && subKpisDraft.length > 0 ? (
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
              {s.startDate ? ` · Schedule ${s.startDate}` : ""}
              {s.dueDate ? ` · Target ${s.dueDate}` : ""} ×
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
