"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { SubTaskDto } from "@/lib/kpi-subtasks-rest";
import { TaskBoardPopup } from "@/components/task-board/TaskBoardPopup";
import { DatePickerField } from "@/components/ui/DatePickerField";

const PRIORITY_OPTIONS = ["High", "Medium", "Low"] as const;

type SubTaskFormDraft = {
  title: string;
  description: string;
  dueDate: string;
  priority: string;
  segmentId: string;
};

const EMPTY_DRAFT: SubTaskFormDraft = {
  title: "",
  description: "",
  dueDate: "",
  priority: "",
  segmentId: "",
};

type SubTasksManagerPopupProps = {
  open: boolean;
  taskId: string | null;
  /** Task card label shown in the popup header. */
  taskLabel: string;
  /** Admins can add/edit/delete; everyone else gets a read-only list. */
  canManage: boolean;
  /** Hide due-date inputs (daily recurring tasks don't use sub-task dates). */
  hideDueDate?: boolean;
  tz: string;
  onClose: () => void;
  /** Called after any successful mutation so the board can refresh its rows. */
  onChanged: () => void;
};

export function SubTasksManagerPopup({
  open,
  taskId,
  taskLabel,
  canManage,
  hideDueDate = false,
  tz,
  onClose,
  onChanged,
}: SubTasksManagerPopupProps) {
  const [subtasks, setSubtasks] = useState<SubTaskDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addDraft, setAddDraft] = useState<SubTaskFormDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<SubTaskFormDraft>(EMPTY_DRAFT);

  const segments = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of subtasks) {
      if (s.segmentId && !seen.has(s.segmentId)) {
        seen.set(s.segmentId, s.segmentLabel ?? s.segmentId);
      }
    }
    return [...seen.entries()].map(([id, label]) => ({ id, label }));
  }, [subtasks]);

  const loadSubtasks = useCallback(async () => {
    if (!taskId) return;
    try {
      const res = await fetch(`/api/kpi-maintenance/${encodeURIComponent(taskId)}/subtasks`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not load sub-tasks.");
        return;
      }
      const payload = (await res.json()) as { subtasks: SubTaskDto[] };
      setSubtasks(payload.subtasks);
    } catch {
      setError("Could not load sub-tasks. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  // Reset per-task state during render when the popup opens for a (new) task.
  const activeKey = open && taskId ? taskId : null;
  const [resetKey, setResetKey] = useState<string | null>(null);
  if (activeKey !== resetKey) {
    setResetKey(activeKey);
    if (activeKey) {
      setSubtasks([]);
      setAddDraft(EMPTY_DRAFT);
      setEditingId(null);
      setError(null);
      setLoading(true);
    }
  }

  useEffect(() => {
    if (!open || !taskId) return;
    queueMicrotask(() => {
      void loadSubtasks();
    });
  }, [open, taskId, loadSubtasks]);

  if (!open || !taskId) return null;

  async function runMutation(request: () => Promise<Response>, failMessage: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await request();
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? failMessage);
        return false;
      }
      const payload = (await res.json()) as { subtasks: SubTaskDto[] };
      setSubtasks(payload.subtasks);
      onChanged();
      return true;
    } catch {
      setError(failMessage);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addSubTask() {
    const title = addDraft.title.trim();
    if (!title) {
      setError("Sub Task title is required.");
      return;
    }
    if (segments.length > 0 && !addDraft.segmentId) {
      setError("Choose a segment for the new sub-task.");
      return;
    }
    const ok = await runMutation(
      () =>
        fetch(`/api/kpi-maintenance/${encodeURIComponent(taskId!)}/subtasks?tz=${encodeURIComponent(tz)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title,
            description: addDraft.description.trim() || null,
            dueDate: hideDueDate ? null : addDraft.dueDate || null,
            priority: addDraft.priority || null,
            segmentId: addDraft.segmentId || null,
          }),
        }),
      "Could not add the sub-task.",
    );
    if (ok) setAddDraft(EMPTY_DRAFT);
  }

  function startEditing(s: SubTaskDto) {
    setEditingId(s.id);
    setEditDraft({
      title: s.title,
      description: s.description ?? "",
      dueDate: s.dueDate ?? "",
      priority: s.priority ?? "",
      segmentId: s.segmentId ?? "",
    });
    setError(null);
  }

  async function saveEdit(subtaskId: string) {
    const title = editDraft.title.trim();
    if (!title) {
      setError("Sub Task title is required.");
      return;
    }
    const ok = await runMutation(
      () =>
        fetch(
          `/api/kpi-maintenance/${encodeURIComponent(taskId!)}/subtasks/${encodeURIComponent(subtaskId)}?tz=${encodeURIComponent(tz)}`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              title,
              description: editDraft.description.trim() || null,
              ...(hideDueDate ? {} : { dueDate: editDraft.dueDate || null }),
              priority: editDraft.priority || null,
            }),
          },
        ),
      "Could not update the sub-task.",
    );
    if (ok) setEditingId(null);
  }

  async function deleteSubTask(s: SubTaskDto) {
    if (!window.confirm(`Delete sub-task "${s.title}"? This cannot be undone.`)) return;
    await runMutation(
      () =>
        fetch(
          `/api/kpi-maintenance/${encodeURIComponent(taskId!)}/subtasks/${encodeURIComponent(s.id)}?tz=${encodeURIComponent(tz)}`,
          { method: "DELETE" },
        ),
      "Could not delete the sub-task.",
    );
  }

  function renderFormFields(
    draft: SubTaskFormDraft,
    patch: (next: Partial<SubTaskFormDraft>) => void,
    idPrefix: string,
  ) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500 sm:col-span-2">
          Title
          <input
            type="text"
            value={draft.title}
            disabled={busy}
            placeholder="Sub Task title"
            onChange={(e) => patch({ title: e.target.value })}
            className="mt-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </label>
        <label className="flex flex-col text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500 sm:col-span-2">
          Description
          <textarea
            value={draft.description}
            disabled={busy}
            rows={2}
            placeholder="Optional details about this sub-task"
            onChange={(e) => patch({ description: e.target.value })}
            className="mt-1 resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </label>
        {!hideDueDate ? (
          <label className="flex flex-col text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
            Due date
            <DatePickerField
              value={draft.dueDate}
              disabled={busy}
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
            disabled={busy}
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

  const priorityBadgeClass = (priority: string) =>
    priority === "High"
      ? "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300"
      : priority === "Medium"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300";

  return (
    <TaskBoardPopup
      open={open}
      title="Sub Tasks"
      description={`Manage the sub-tasks of "${taskLabel}".`}
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

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading sub-tasks…
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-500">
              {subtasks.length} sub-task{subtasks.length === 1 ? "" : "s"}
            </p>
            {subtasks.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-300 px-3 py-4 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                No sub-tasks yet. Add the first one below.
              </p>
            ) : (
              subtasks.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    "rounded-lg border border-zinc-200/80 bg-white/60 p-3 dark:border-zinc-700 dark:bg-zinc-950/40",
                    s.done &&
                      "border-emerald-300/70 bg-emerald-50/60 dark:border-emerald-800/50 dark:bg-emerald-950/20",
                  )}
                >
                  {editingId === s.id ? (
                    <div className="space-y-2">
                      {renderFormFields(editDraft, (next) => setEditDraft((prev) => ({ ...prev, ...next })), "Edit")}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={busy || !editDraft.title.trim()}
                          onClick={() => void saveEdit(s.id)}
                          className="rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Save changes
                        </button>
                        <button
                          type="button"
                          disabled={busy}
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
                          <p
                            className={cn(
                              "text-sm font-semibold text-zinc-900 dark:text-zinc-100",
                              s.done && "line-through opacity-70",
                            )}
                          >
                            {s.title}
                          </p>
                          {s.description ? (
                            <p className="mt-0.5 whitespace-pre-wrap text-xs text-zinc-600 dark:text-zinc-400">
                              {s.description}
                            </p>
                          ) : null}
                          {s.segmentLabel ? (
                            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-700 dark:text-orange-400">
                              {s.segmentLabel}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                          {s.priority ? (
                            <span
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                priorityBadgeClass(s.priority),
                              )}
                            >
                              {s.priority}
                            </span>
                          ) : null}
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                              s.done
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                            )}
                          >
                            {s.status}
                          </span>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          {s.assignee ? `Assigned to ${s.assignee.name}` : "Unassigned"}
                          {s.dueDate ? ` · Due ${s.dueDate}` : ""}
                        </p>
                        {canManage ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => startEditing(s)}
                              className="inline-flex items-center gap-1 rounded-full border border-zinc-300 px-2.5 py-1 text-[10px] font-semibold text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                            >
                              <Pencil className="size-3" aria-hidden />
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void deleteSubTask(s)}
                              className="inline-flex items-center gap-1 rounded-full border border-rose-400/60 px-2.5 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-950/40"
                            >
                              <Trash2 className="size-3" aria-hidden />
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {canManage && !loading ? (
          <div className="rounded-lg border border-dashed border-orange-400/50 bg-orange-500/[0.04] p-3 dark:border-orange-500/35 dark:bg-orange-500/[0.07]">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange-800 dark:text-orange-200">
              Add Sub Task
            </p>
            <div className="mt-2 space-y-2">
              {segments.length > 0 ? (
                <label className="flex flex-col text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
                  Segment
                  <select
                    value={addDraft.segmentId}
                    disabled={busy}
                    onChange={(e) => setAddDraft((prev) => ({ ...prev, segmentId: e.target.value }))}
                    className="mt-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    <option value="">Choose a segment…</option>
                    {segments.map((seg) => (
                      <option key={seg.id} value={seg.id}>
                        {seg.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {renderFormFields(addDraft, (next) => setAddDraft((prev) => ({ ...prev, ...next })), "New sub-task")}
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  New sub-tasks start as Pending. Assign personnel from the task card on the board.
                </p>
                <button
                  type="button"
                  disabled={busy || !addDraft.title.trim()}
                  onClick={() => void addSubTask()}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Plus className="size-3.5" aria-hidden />
                  )}
                  Add Sub Task
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </TaskBoardPopup>
  );
}
