"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { type KpiFrequencyCode } from "@/lib/kpi-recurrence";
import { type SubKpiItem as SubKpi } from "@/lib/kpi-subkpis";

const MIN_SUB_FOR_SEGMENT_OPTION = 3;
const INSIGHTS_VIEW_ONLY = false;

type MaintenanceFrequency = "Daily" | "Weekly" | "Monthly";
type DraftSegmentRow = { id: string; label: string; items: SubKpi[] };

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
  const [recurrenceTz, setRecurrenceTz] = useState("UTC");
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
  const [kpiMaintenanceAssignWork, setKpiMaintenanceAssignWork] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

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

  const loadAssignFlag = useCallback(async () => {
    const kpiRes = await fetch(`/api/kpi-maintenance${kpiMaintenanceSearch}`, { cache: "no-store" });
    if (kpiRes.ok) {
      const payload = (await kpiRes.json()) as { canAssignWork?: boolean };
      setKpiMaintenanceAssignWork(Boolean(payload.canAssignWork));
    }
  }, [kpiMaintenanceSearch]);

  useEffect(() => {
    void loadAssignFlag();
  }, [loadAssignFlag]);

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
        const payload = (await reload.json()) as { rows: KpiDefinitionMaintenanceRecord[] };
        onMaintenanceRecordsUpdated?.(payload.rows);
      }
    } else {
      const errBody = await res.json().catch(() => ({}));
      setLocalError(typeof errBody.error === "string" ? errBody.error : "Could not save KPI.");
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
    setDraftUseSegments(false);
    setDraftSegments([]);
    setSegItemDraft({});
    void loadAssignFlag();
  }

  return (
    <section className="mb-5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_8px_28px_rgba(0,0,0,0.06)] sm:p-6 dark:border-zinc-800/90 dark:bg-[#0b1220] dark:shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600 dark:text-zinc-500">
        Task management
      </h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Configure KPI checklist definitions here. Use the Task Assignment Board below to assign personnel to KPI cards.
      </p>
      {localError ? (
        <p className="mt-2 rounded-lg border border-red-500/35 bg-red-50 px-3 py-2 text-xs text-red-900 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-200">
          {localError}
        </p>
      ) : null}

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
          Assignment is on the Task Assignment Board below.
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
    </section>
  );
}
