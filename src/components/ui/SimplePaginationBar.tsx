"use client";

import { cn } from "@/lib/cn";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Shown in "Showing … of N …" */
  itemLabel?: string;
  className?: string;
};

/**
 * Prev/next + range text. Renders nothing when everything fits on one page or total is 0.
 */
export function SimplePaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
  itemLabel = "items",
  className,
}: Props) {
  if (total === 0 || total <= pageSize) return null;

  const totalPages = Math.ceil(total / pageSize);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);

  return (
    <div
      className={cn(
        "flex flex-col gap-2 border-t border-zinc-200 px-3 py-2.5 text-[11px] text-zinc-600 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800/90 dark:text-zinc-400",
        className,
      )}
    >
      <p>
        Showing{" "}
        <span className="font-semibold text-zinc-800 dark:text-zinc-200">
          {start}–{end}
        </span>{" "}
        of <span className="font-semibold text-zinc-800 dark:text-zinc-200">{total}</span> {itemLabel}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Previous
        </button>
        <span className="tabular-nums text-zinc-500 dark:text-zinc-500">
          Page {safePage} / {totalPages}
        </span>
        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Next
        </button>
      </div>
    </div>
  );
}
