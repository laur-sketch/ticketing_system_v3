"use client";

import { useEffect, useState } from "react";
import { TaskBoardPopup } from "@/components/task-board/TaskBoardPopup";

export type SeekAssistanceCandidate = {
  id: string;
  title: string;
};

type SeekAssistanceModalProps = {
  open: boolean;
  taskTitle: string;
  segmentLabel?: string | null;
  candidates: SeekAssistanceCandidate[];
  busy?: boolean;
  onClose: () => void;
  onConfirm: (selectedIds: string[]) => void | Promise<void>;
};

export function SeekAssistanceModal({
  open,
  taskTitle,
  segmentLabel,
  candidates,
  busy = false,
  onClose,
  onConfirm,
}: SeekAssistanceModalProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(candidates.map((c) => c.id)));
  }, [open, candidates]);

  const description = segmentLabel
    ? `Select sub-tasks in “${segmentLabel}” that need a helper assignee.`
    : "Select which sub-tasks need a helper assignee.";

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(candidates.map((c) => c.id)) : new Set());
  }

  const allSelected = candidates.length > 0 && selected.size === candidates.length;
  const someSelected = selected.size > 0;

  return (
    <TaskBoardPopup
      open={open}
      title="Seek Assistance"
      description={`${taskTitle}${segmentLabel ? ` · ${segmentLabel}` : ""} — ${description}`}
      onClose={busy ? () => undefined : onClose}
      size="md"
    >
      {candidates.length === 0 ? (
        <div className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            There are no locked sub-tasks to unlock here. Add sub-tasks first, or helpers may already
            be unlocked for every item in this scope.
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Close
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={allSelected}
              disabled={busy}
              onChange={(e) => toggleAll(e.target.checked)}
              className="size-3.5 rounded border-zinc-300 text-orange-600 focus:ring-orange-500"
            />
            Select all ({candidates.length})
          </label>
          <ul className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-zinc-200 p-2 dark:border-zinc-800">
            {candidates.map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    disabled={busy}
                    onChange={() => toggle(c.id)}
                    className="mt-0.5 size-3.5 rounded border-zinc-300 text-orange-600 focus:ring-orange-500"
                  />
                  <span className="min-w-0 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {c.title || "Untitled sub-task"}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-500">
            Only the main assignee can unlock helper assignees. After unlocking, use each sub-task’s
            assignee dropdown to pick On Duty personnel from the same company.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !someSelected}
              onClick={() => void onConfirm([...selected])}
              className="rounded-lg border border-orange-500 bg-orange-500 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Requesting…" : "Request assistance"}
            </button>
          </div>
        </div>
      )}
    </TaskBoardPopup>
  );
}
