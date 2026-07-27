"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

export type CompanyUserOption = {
  id: string;
  name: string;
  email?: string | null;
};

type CompanyUserSearchFieldProps = {
  label: string;
  users: CompanyUserOption[];
  value: string;
  onChange: (agentId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Agent ids that must not be selectable (e.g. prior approvers on this request). */
  excludedIds?: ReadonlySet<string> | string[];
  emptyMessage?: string;
};

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

export function CompanyUserSearchField({
  label,
  users,
  value,
  onChange,
  disabled = false,
  placeholder = "Search company users…",
  excludedIds,
  emptyMessage = "No matching users.",
}: CompanyUserSearchFieldProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const excluded = useMemo(() => {
    if (!excludedIds) return new Set<string>();
    return excludedIds instanceof Set ? excludedIds : new Set(excludedIds);
  }, [excludedIds]);

  const selected = useMemo(
    () => users.find((u) => u.id === value) ?? null,
    [users, value],
  );

  const selectable = useMemo(
    () => users.filter((u) => !excluded.has(u.id) || u.id === value),
    [users, excluded, value],
  );

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return selectable.slice(0, 40);
    return selectable
      .filter((u) => {
        const hay = `${u.name} ${u.email ?? ""}`;
        return normalize(hay).includes(q);
      })
      .slice(0, 40);
  }, [selectable, query]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    if (selected) {
      setQuery(selected.name);
    } else if (!value) {
      setQuery("");
    }
  }, [selected, value]);

  return (
    <div ref={rootRef} className="relative block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
      {label}
      <div className="relative mt-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (value) onChange("");
          }}
          className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-9 pr-9 text-sm font-normal text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
        {value ? (
          <button
            type="button"
            disabled={disabled}
            aria-label="Clear selection"
            onClick={() => {
              onChange("");
              setQuery("");
              setOpen(true);
            }}
            className="absolute right-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      {selected && !open ? (
        <p className="mt-1 truncate text-[11px] font-normal text-zinc-600 dark:text-zinc-400">
          Selected: {selected.name}
          {selected.email ? ` · ${selected.email}` : ""}
        </p>
      ) : null}

      {open && !disabled ? (
        <div className="absolute z-30 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-950">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs font-normal text-zinc-500">{emptyMessage}</p>
          ) : (
            filtered.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  onChange(u.id);
                  setQuery(u.name);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full flex-col items-start border-b border-zinc-100 px-3 py-2 text-left last:border-b-0 hover:bg-orange-50 dark:border-zinc-800 dark:hover:bg-orange-950/30",
                  u.id === value && "bg-orange-50 dark:bg-orange-950/40",
                )}
              >
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{u.name}</span>
                {u.email ? (
                  <span className="text-[11px] font-normal text-zinc-500">{u.email}</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
