"use client";

import { useState } from "react";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { SubKpiItem } from "@/lib/kpi-subkpis";
import { TaskBoardPopup } from "@/components/task-board/TaskBoardPopup";
import { DatePickerField } from "@/components/ui/DatePickerField";

const PRIORITY_OPTIONS = ["High", "Medium", "Low"] as const;

type DraftForm = {
  title: string;
  description: string;
  dueDate: string;
  priority: string;
  segmentId: string;
};

const EMPTY: DraftForm = { title: "", description: "", dueDate: "", priority: "", segmentId: "" };

type DraftSegment = { id: string; label: string; items: SubKpiItem[] };

type DraftSubTasksPopupProps = {
  open: boolean;
  taskLabel: string;
  items: SubKpiItem[];
  segmented: boolean;
  segments: DraftSegment[];
  canSegment: boolean;
  minimumSegmentItems: number;
  hideDueDate?: boolean;
  onChange: (next: SubKpiItem[]) => void;
  onSegmentedChange: (next: boolean) => void;
  onSegmentsChange: (next: DraftSegment[]) => void;
  onClose: () => void;
};

/** Local (pre-save) Sub Tasks manager for the Task Management create form. */
export function DraftSubTasksPopup({
  open,
  taskLabel,
  items,
  segmented,
  segments,
  canSegment,
  minimumSegmentItems,
  hideDueDate = false,
  onChange,
  onSegmentedChange,
  onSegmentsChange,
  onClose,
}: DraftSubTasksPopupProps) {
  const [addDraft, setAddDraft] = useState<DraftForm>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DraftForm>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const allItems = segmented ? segments.flatMap((segment) => segment.items) : items;

  function patchItems(updater: (current: SubKpiItem[]) => SubKpiItem[]) {
    if (!segmented) {
      onChange(updater(items));
      return;
    }
    onSegmentsChange(
      segments.map((segment) => ({
        ...segment,
        items: updater(segment.items),
      })),
    );
  }

  function addItem() {
    const title = addDraft.title.trim();
    if (!title) {
      setError("Sub Task title is required.");
      return;
    }
    if (segmented && !addDraft.segmentId) {
      setError("Choose a segment for this Sub Task.");
      return;
    }
    const next: SubKpiItem = {
      id: crypto.randomUUID(),
      title,
      ...(addDraft.description.trim() ? { description: addDraft.description.trim() } : {}),
      ...(!hideDueDate && addDraft.dueDate ? { dueDate: addDraft.dueDate } : {}),
      ...(addDraft.priority === "High" || addDraft.priority === "Medium" || addDraft.priority === "Low"
        ? { projectPriority: addDraft.priority }
        : {}),
    };
    if (segmented) {
      onSegmentsChange(
        segments.map((segment) =>
          segment.id === addDraft.segmentId
            ? { ...segment, items: [...segment.items, next] }
            : segment,
        ),
      );
    } else {
      onChange([...items, next]);
    }
    setAddDraft(EMPTY);
    setError(null);
  }

  function startEdit(item: SubKpiItem) {
    setEditingId(item.id);
    setEditDraft({
      title: item.title,
      description: item.description ?? "",
      dueDate: item.dueDate ?? "",
      priority: item.projectPriority ?? "",
      segmentId:
        segments.find((segment) => segment.items.some((candidate) => candidate.id === item.id))?.id ?? "",
    });
    setError(null);
  }

  function saveEdit(id: string) {
    const title = editDraft.title.trim();
    if (!title) {
      setError("Sub Task title is required.");
      return;
    }
    patchItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        const next: SubKpiItem = { ...item, title };
        const desc = editDraft.description.trim();
        if (desc) next.description = desc;
        else delete (next as { description?: string }).description;
        if (!hideDueDate) {
          if (editDraft.dueDate) next.dueDate = editDraft.dueDate;
          else delete (next as { dueDate?: string }).dueDate;
        }
        if (
          editDraft.priority === "High" ||
          editDraft.priority === "Medium" ||
          editDraft.priority === "Low"
        ) {
          next.projectPriority = editDraft.priority;
        } else {
          delete (next as { projectPriority?: SubKpiItem["projectPriority"] }).projectPriority;
        }
        return next;
      }),
    );
    setEditingId(null);
    setError(null);
  }

  function removeItem(item: SubKpiItem) {
    if (!window.confirm(`Remove sub-task "${item.title}"?`)) return;
    patchItems((current) => current.filter((x) => x.id !== item.id));
    if (editingId === item.id) setEditingId(null);
  }

  function addSegment() {
    const nextNumber = segments.length + 1;
    onSegmentsChange([
      ...segments,
      { id: crypto.randomUUID(), label: `Segment ${nextNumber}`, items: [] },
    ]);
  }

  function removeSegment(segment: DraftSegment) {
    const detail =
      segment.items.length > 0
        ? ` Its ${segment.items.length} sub-task${segment.items.length === 1 ? "" : "s"} will also be removed.`
        : "";
    if (!window.confirm(`Remove segment "${segment.label || "Untitled"}"?${detail}`)) return;
    onSegmentsChange(segments.filter((candidate) => candidate.id !== segment.id));
    if (addDraft.segmentId === segment.id) setAddDraft((current) => ({ ...current, segmentId: "" }));
  }

  function updateSegmentLabel(segmentId: string, label: string) {
    onSegmentsChange(
      segments.map((segment) => (segment.id === segmentId ? { ...segment, label } : segment)),
    );
  }

  function renderFields(draft: DraftForm, patch: (next: Partial<DraftForm>) => void, idPrefix: string) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500 sm:col-span-2">
          Title
          <input
            type="text"
            value={draft.title}
            placeholder="Sub Task title"
            onChange={(e) => patch({ title: e.target.value })}
            className="mt-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </label>
        <label className="flex flex-col text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500 sm:col-span-2">
          Description
          <textarea
            value={draft.description}
            rows={2}
            placeholder="Optional details"
            onChange={(e) => patch({ description: e.target.value })}
            className="mt-1 resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </label>
        {!hideDueDate ? (
          <label className="flex flex-col text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
            Due date
            <DatePickerField
              value={draft.dueDate}
              onChange={(e) => patch({ dueDate: e.target.value })}
              wrapperClassName="mt-1"
              aria-label={`${idPrefix} due date`}
            />
          </label>
        ) : null}
        <label className="flex flex-col text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
          Priority
          <select
            value={draft.priority}
            onChange={(e) => patch({ priority: e.target.value })}
            className="mt-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <option value="">No priority</option>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  return (
    <TaskBoardPopup
      open={open}
      title="Sub Tasks"
      description={`Add and edit sub-tasks for "${taskLabel || "this task"}". Changes apply when you click Apply on the main form.`}
      onClose={onClose}
      size="md"
    >
      <div className="space-y-4">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back
        </button>

        {error ? (
          <p
            className="rounded-lg border border-rose-400/50 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-800 dark:border-rose-500/40 dark:text-rose-200"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {canSegment || segmented ? (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-700 dark:bg-zinc-950/40">
            <label className="flex cursor-pointer items-start gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              <input
                type="checkbox"
                checked={segmented}
                onChange={(event) => {
                  onSegmentedChange(event.target.checked);
                  setEditingId(null);
                  setAddDraft(EMPTY);
                  setError(null);
                }}
                className="mt-0.5"
              />
              <span>
                Segment this checklist
                <span className="mt-0.5 block text-xs font-normal text-zinc-500 dark:text-zinc-400">
                  Group {minimumSegmentItems}+ sub-tasks under labeled sections.
                </span>
              </span>
            </label>
            {segmented ? (
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-500">
                    Checklist segments
                  </p>
                  <button
                    type="button"
                    onClick={addSegment}
                    className="inline-flex items-center gap-1 rounded-lg border border-orange-500/50 px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-500/10 dark:text-orange-300"
                  >
                    <Plus className="size-3.5" aria-hidden />
                    Add segment
                  </button>
                </div>
                {segments.map((segment) => (
                  <div
                    key={segment.id}
                    className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <div className="flex items-end gap-2">
                      <label className="flex min-w-0 flex-1 flex-col text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
                        Segment label
                        <input
                          value={segment.label}
                          onChange={(event) => updateSegmentLabel(segment.id, event.target.value)}
                          placeholder="e.g. Week 1 — Response quality"
                          className="mt-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => removeSegment(segment)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                        Remove
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                      {segment.items.length} sub-task{segment.items.length === 1 ? "" : "s"}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-500">
            {allItems.length} sub-task{allItems.length === 1 ? "" : "s"}
          </p>
          {allItems.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-300 px-3 py-4 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              No sub-tasks yet. Add the first one below.
            </p>
          ) : (
            allItems.map((s) => (
              <div
                key={s.id}
                className="rounded-lg border border-zinc-200/80 bg-white/60 p-3 dark:border-zinc-700 dark:bg-zinc-950/40"
              >
                {editingId === s.id ? (
                  <div className="space-y-2">
                    {renderFields(editDraft, (next) => setEditDraft((prev) => ({ ...prev, ...next })), "Edit")}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!editDraft.title.trim()}
                        onClick={() => saveEdit(s.id)}
                        className="rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Save changes
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-lg border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{s.title}</p>
                        {segmented ? (
                          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-700 dark:text-orange-400">
                            {segments.find((segment) =>
                              segment.items.some((candidate) => candidate.id === s.id),
                            )?.label || "Unlabeled segment"}
                          </p>
                        ) : null}
                        {s.description ? (
                          <p className="mt-0.5 whitespace-pre-wrap text-xs text-zinc-600 dark:text-zinc-400">
                            {s.description}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        {s.projectPriority ? (
                          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                            {s.projectPriority}
                          </span>
                        ) : null}
                        {s.dueDate ? (
                          <span className="rounded-full border border-zinc-300 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 dark:border-zinc-600 dark:text-zinc-400">
                            Due {s.dueDate}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => startEdit(s)}
                        className="inline-flex items-center gap-1 rounded-full border border-zinc-300 px-2.5 py-1 text-[10px] font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        <Pencil className="size-3" aria-hidden />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(s)}
                        className="inline-flex items-center gap-1 rounded-full border border-rose-400/60 px-2.5 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-950/40"
                      >
                        <Trash2 className="size-3" aria-hidden />
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        <div className="rounded-lg border border-dashed border-orange-400/50 bg-orange-500/[0.04] p-3 dark:border-orange-500/35 dark:bg-orange-500/[0.07]">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange-800 dark:text-orange-200">
            Add Sub Task
          </p>
          <div className="mt-2 space-y-2">
            {segmented ? (
              <label className="flex flex-col text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
                Segment
                <select
                  value={addDraft.segmentId}
                  onChange={(event) =>
                    setAddDraft((current) => ({ ...current, segmentId: event.target.value }))
                  }
                  className="mt-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  <option value="">Choose a segment…</option>
                  {segments.map((segment) => (
                    <option key={segment.id} value={segment.id} disabled={!segment.label.trim()}>
                      {segment.label.trim() || "Untitled segment"}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {renderFields(addDraft, (next) => setAddDraft((prev) => ({ ...prev, ...next })), "New")}
            <div className="flex justify-end">
              <button
                type="button"
                disabled={!addDraft.title.trim() || (segmented && !addDraft.segmentId)}
                onClick={addItem}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-500",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                <Plus className="size-3.5" aria-hidden />
                Add Sub Task
              </button>
            </div>
          </div>
        </div>
      </div>
    </TaskBoardPopup>
  );
}
