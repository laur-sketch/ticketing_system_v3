"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/cn";

type BoardSearchBarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  /** When set, search applies on Enter / blur (Request & Task boards). Omit for instant filter. */
  onSearchSubmit?: () => void;
  placeholder: string;
  ariaLabel: string;
  className?: string;
};

/** Search field shared by Request Board, Task Board, and Insights personnel metrics. */
export function BoardSearchBar({
  query,
  onQueryChange,
  onSearchSubmit,
  placeholder,
  ariaLabel,
  className,
}: BoardSearchBarProps) {
  function submit() {
    onSearchSubmit?.();
  }

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-1.5 rounded-xl border border-zinc-300 bg-white p-2 shadow-sm sm:flex-row sm:items-center sm:gap-2 sm:p-2.5 dark:border-zinc-700 dark:bg-zinc-900",
        className,
      )}
    >
      <label className="flex min-w-0 flex-1 items-center px-1.5 py-1 text-sm text-zinc-700 sm:px-2 dark:text-zinc-300">
        <Search className="mr-2 size-4 shrink-0 text-zinc-600 opacity-90 dark:text-zinc-400" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onBlur={onSearchSubmit ? submit : undefined}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          className="w-full min-w-0 bg-transparent text-zinc-900 outline-none placeholder:text-zinc-600 dark:text-zinc-100 dark:placeholder:text-zinc-400"
          aria-label={ariaLabel}
        />
      </label>
    </div>
  );
}
