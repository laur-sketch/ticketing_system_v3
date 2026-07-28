"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export type TravelOrderFormPage = 1 | 2;

type TravelOrderPageNavProps = {
  page: TravelOrderFormPage;
  onPageChange: (page: TravelOrderFormPage) => void;
  /** When false, omit Back/Next (tabs only). Default true. */
  showStepButtons?: boolean;
  /** Disable Next (e.g. while busy). */
  nextDisabled?: boolean;
  /** Disable Back. */
  backDisabled?: boolean;
  className?: string;
};

/** Tab switcher + optional Back/Next for Travel Order two-page forms. */
export function TravelOrderPageNav({
  page,
  onPageChange,
  showStepButtons = true,
  nextDisabled = false,
  backDisabled = false,
  className,
}: TravelOrderPageNavProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-800",
        className,
      )}
    >
      <div
        className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-700 dark:bg-zinc-900/60"
        role="tablist"
        aria-label="Travel order pages"
      >
        <button
          type="button"
          role="tab"
          aria-selected={page === 1}
          onClick={() => onPageChange(1)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
            page === 1
              ? "bg-orange-600 text-white shadow-sm"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
          )}
        >
          1 · Details
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={page === 2}
          onClick={() => onPageChange(2)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
            page === 2
              ? "bg-orange-600 text-white shadow-sm"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
          )}
        >
          2 · Approvals
        </button>
      </div>

      {showStepButtons ? (
        <div className="flex flex-wrap gap-1.5">
          {page === 2 ? (
            <button
              type="button"
              disabled={backDisabled}
              onClick={() => onPageChange(1)}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <ChevronLeft className="size-3.5" aria-hidden />
              Back
            </button>
          ) : null}
          {page === 1 ? (
            <button
              type="button"
              disabled={nextDisabled}
              onClick={() => onPageChange(2)}
              className="inline-flex items-center gap-1 rounded-lg bg-orange-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
              <ChevronRight className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Tailwind grid columns for horizontal approval stamp rows. */
export function travelOrderApprovalGridClass(count: number): string {
  const n = Math.min(Math.max(count, 1), 5);
  if (n <= 1) return "grid grid-cols-1 items-start gap-x-4 gap-y-3";
  if (n === 2) return "grid grid-cols-1 items-start gap-x-4 gap-y-3 sm:grid-cols-2";
  if (n === 3) return "grid grid-cols-1 items-start gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3";
  if (n === 4) return "grid grid-cols-1 items-start gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4";
  return "grid grid-cols-1 items-start gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-5";
}
