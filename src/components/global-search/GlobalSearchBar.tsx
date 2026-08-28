"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { useGlobalSearch } from "@/components/global-search/GlobalSearchProvider";
import { SearchResultRow } from "@/components/global-search/SearchResultRow";
import { useDebouncedGlobalSearch } from "@/components/global-search/useDebouncedGlobalSearch";
import type { GlobalSearchResult } from "@/lib/global-search";
import { groupLabelForKind } from "@/lib/global-search";

export function GlobalSearchBar({ className }: { className?: string }) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { openPalette, navigateToResult } = useGlobalSearch();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [expandedMobile, setExpandedMobile] = useState(false);
  const trimmed = query.trim();
  const hasQuery = trimmed.length >= 2;
  const { loading, error, data } = useDebouncedGlobalSearch(query, open && hasQuery, 8);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setExpandedMobile(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function handleSelect(item: GlobalSearchResult) {
    setQuery("");
    setOpen(false);
    setExpandedMobile(false);
    navigateToResult(item);
  }

  const grouped = data?.results ?? [];
  const groups = new Map<string, GlobalSearchResult[]>();
  for (const row of grouped) {
    const key = groupLabelForKind(row.kind);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative min-w-0 flex-1",
        expandedMobile ? "max-sm:absolute max-sm:inset-x-3 max-sm:top-1/2 max-sm:z-20 max-sm:-translate-y-1/2" : "",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-9 items-center gap-2 rounded-xl border border-zinc-300 bg-white px-2.5 shadow-sm transition focus-within:border-orange-500/60 dark:border-zinc-700 dark:bg-zinc-900",
          expandedMobile ? "max-sm:shadow-lg" : "max-sm:cursor-pointer",
        )}
        onClick={() => {
          if (window.matchMedia("(max-width: 639px)").matches && !expandedMobile) {
            setExpandedMobile(true);
            window.setTimeout(() => inputRef.current?.focus(), 0);
          }
        }}
      >
        <Search className="size-4 shrink-0 text-zinc-400" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
              event.preventDefault();
              openPalette(query);
              setOpen(false);
              return;
            }
            if (event.key === "Escape") {
              setOpen(false);
              setExpandedMobile(false);
              inputRef.current?.blur();
            }
          }}
          placeholder="Search tickets, requests, users… (Ctrl+K)"
          aria-label="Search tickets, requests, and users"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          role="combobox"
          className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-500 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          autoComplete="off"
        />
        {loading ? <Loader2 className="size-3.5 animate-spin text-zinc-400" aria-hidden /> : null}
        <button
          type="button"
          onClick={() => openPalette(query)}
          className="hidden shrink-0 rounded-md border border-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500 sm:inline dark:border-zinc-700 dark:text-zinc-400"
        >
          Ctrl K
        </button>
      </div>

      {open && trimmed.length > 0 ? (
        <div
          id={listboxId}
          role="listbox"
          className="command-scroll absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 max-h-[min(360px,50vh)] overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl dark:border-zinc-700 dark:bg-zinc-950"
        >
          {!hasQuery ? (
            <p className="px-2 py-3 text-xs text-zinc-500">Type at least 2 characters…</p>
          ) : null}
          {error ? (
            <p className="px-2 py-3 text-xs text-rose-600 dark:text-rose-300">{error}</p>
          ) : null}
          {!loading && hasQuery && grouped.length === 0 ? (
            <p className="px-2 py-3 text-xs text-zinc-500">No results found.</p>
          ) : null}
          {[...groups.entries()].map(([label, rows]) => (
            <div key={label} className="mb-1 last:mb-0">
              <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                {label}
              </p>
              {rows.map((item) => (
                <SearchResultRow
                  key={item.id}
                  item={item}
                  query={query}
                  compact
                  onSelect={handleSelect}
                />
              ))}
            </div>
          ))}
          {hasQuery ? (
            <button
              type="button"
              onClick={() => {
                openPalette(query);
                setOpen(false);
              }}
              className="mt-1 w-full rounded-lg border border-dashed border-zinc-200 px-2 py-2 text-left text-xs font-medium text-orange-700 hover:bg-orange-50 dark:border-zinc-700 dark:text-orange-300 dark:hover:bg-orange-950/30"
            >
              Open full command palette for “{trimmed}”
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
