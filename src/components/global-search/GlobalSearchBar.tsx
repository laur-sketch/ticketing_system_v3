"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, PlusSquare, Search, Zap } from "lucide-react";
import { cn } from "@/lib/cn";
import { useGlobalSearch } from "@/components/global-search/GlobalSearchProvider";
import { SearchResultRow } from "@/components/global-search/SearchResultRow";
import { SearchHighlight } from "@/components/global-search/SearchHighlight";
import { useDebouncedGlobalSearch } from "@/components/global-search/useDebouncedGlobalSearch";
import {
  filterQuickActions,
  groupLabelForKind,
  type GlobalSearchResult,
  type QuickAction,
} from "@/lib/global-search";

type FlatItem =
  | { type: "result"; item: GlobalSearchResult }
  | { type: "action"; item: QuickAction };

type DropdownBox = { top: number; left: number; width: number };

export function GlobalSearchBar({ className }: { className?: string }) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { openPalette, navigateToResult, recentItems, quickActions } = useGlobalSearch();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [expandedMobile, setExpandedMobile] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [box, setBox] = useState<DropdownBox | null>(null);
  const [mounted, setMounted] = useState(false);
  const trimmed = query.trim();
  const hasQuery = trimmed.length >= 2;
  const { loading, error, data } = useDebouncedGlobalSearch(query, open && hasQuery, 8);

  const filteredActions = useMemo(
    () => filterQuickActions(quickActions, query).slice(0, hasQuery ? 6 : 8),
    [quickActions, query, hasQuery],
  );

  const showRecent = open && !hasQuery && recentItems.length > 0;
  const showActions = open && filteredActions.length > 0;
  const apiResults = data?.results ?? [];

  const groups = useMemo(() => {
    const map = new Map<string, GlobalSearchResult[]>();
    for (const row of apiResults) {
      const key = groupLabelForKind(row.kind);
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return map;
  }, [apiResults]);

  const flatItems = useMemo((): FlatItem[] => {
    const items: FlatItem[] = [];
    if (showRecent) {
      for (const item of recentItems.slice(0, 5)) {
        items.push({ type: "result", item });
      }
    }
    if (showActions) {
      for (const item of filteredActions) {
        items.push({ type: "action", item });
      }
    }
    if (hasQuery) {
      for (const item of apiResults) {
        items.push({ type: "result", item });
      }
    }
    return items;
  }, [showRecent, showActions, hasQuery, recentItems, filteredActions, apiResults]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open, flatItems.length]);

  const updateBox = () => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setBox({
      top: rect.bottom + 6,
      left: rect.left,
      width: rect.width,
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setBox(null);
      return;
    }
    updateBox();
    function onReposition() {
      updateBox();
    }
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, query, flatItems.length]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
      setExpandedMobile(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function handleSelectResult(item: GlobalSearchResult) {
    setQuery("");
    setOpen(false);
    setExpandedMobile(false);
    navigateToResult(item);
  }

  function handleSelectAction(item: QuickAction) {
    setQuery("");
    setOpen(false);
    setExpandedMobile(false);
    navigateToResult(item);
  }

  function activateFlatItem(index: number) {
    const row = flatItems[index];
    if (!row) return;
    if (row.type === "action") handleSelectAction(row.item);
    else handleSelectResult(row.item);
  }

  const emptyAfterSearch =
    hasQuery && !loading && !error && apiResults.length === 0 && filteredActions.length === 0;

  const dropdown =
    open && mounted && box
      ? createPortal(
          <div
            ref={panelRef}
            id={listboxId}
            role="listbox"
            style={{
              position: "fixed",
              top: box.top,
              left: box.left,
              width: box.width,
            }}
            className="command-scroll z-[300] max-h-[min(360px,50vh)] overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl dark:border-zinc-700 dark:bg-zinc-950"
          >
            {!hasQuery && !showRecent && !showActions ? (
              <p className="px-2 py-3 text-xs text-zinc-500">
                Type to search tickets, tasks, and users — or pick a quick action below.
              </p>
            ) : null}
            {trimmed.length > 0 && !hasQuery ? (
              <p className="px-2 py-3 text-xs text-zinc-500">Type at least 2 characters to search…</p>
            ) : null}
            {error ? (
              <p className="px-2 py-3 text-xs text-rose-600 dark:text-rose-300">{error}</p>
            ) : null}
            {emptyAfterSearch ? (
              <p className="px-2 py-3 text-xs text-zinc-500">No results found.</p>
            ) : null}

            {showRecent ? (
              <div className="mb-1">
                <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                  Recent
                </p>
                {recentItems.slice(0, 5).map((item, index) => (
                  <div key={`recent-${item.id}-${item.href}`} id={`${listboxId}-opt-${index}`}>
                    <SearchResultRow
                      item={item}
                      query={query}
                      compact
                      selected={activeIndex === index}
                      onSelect={handleSelectResult}
                    />
                  </div>
                ))}
              </div>
            ) : null}

            {showActions ? (
              <div className="mb-1">
                <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                  Quick actions
                </p>
                {filteredActions.map((action, actionIndex) => {
                  const index =
                    (showRecent ? Math.min(recentItems.length, 5) : 0) + actionIndex;
                  const Icon = action.label.toLowerCase().includes("create") ? PlusSquare : Zap;
                  return (
                    <button
                      key={action.id}
                      id={`${listboxId}-opt-${index}`}
                      type="button"
                      role="option"
                      aria-selected={activeIndex === index}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => handleSelectAction(action)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition",
                        activeIndex === index
                          ? "bg-orange-50 dark:bg-orange-950/40"
                          : "hover:bg-zinc-100 dark:hover:bg-zinc-800/70",
                      )}
                    >
                      <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-orange-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-orange-300">
                        <Icon className="size-3.5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-zinc-900 dark:text-zinc-100">
                          <SearchHighlight text={action.label} query={query} />
                        </span>
                        {action.subtitle ? (
                          <span className="mt-0.5 block truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                            <SearchHighlight text={action.subtitle} query={query} />
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {hasQuery
              ? [...groups.entries()].map(([label, rows]) => {
                  const offset =
                    (showRecent ? Math.min(recentItems.length, 5) : 0) +
                    (showActions ? filteredActions.length : 0);
                  return (
                    <div key={label} className="mb-1 last:mb-0">
                      <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                        {label}
                      </p>
                      {rows.map((item) => {
                        const index =
                          offset +
                          apiResults.findIndex(
                            (row) => row.id === item.id && row.href === item.href,
                          );
                        return (
                          <div key={item.id} id={`${listboxId}-opt-${index}`}>
                            <SearchResultRow
                              item={item}
                              query={query}
                              compact
                              selected={activeIndex === index}
                              onSelect={handleSelectResult}
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              : null}

            <button
              type="button"
              onClick={() => {
                openPalette(query);
                setOpen(false);
              }}
              className="mt-1 w-full rounded-lg border border-dashed border-zinc-200 px-2 py-2 text-left text-xs font-medium text-orange-700 hover:bg-orange-50 dark:border-zinc-700 dark:text-orange-300 dark:hover:bg-orange-950/30"
            >
              {hasQuery
                ? `Open full command palette for “${trimmed}”`
                : "Open full command palette"}
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative w-full min-w-0",
        expandedMobile ? "max-sm:absolute max-sm:inset-x-3 max-sm:top-1/2 max-sm:z-20 max-sm:-translate-y-1/2" : "",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-xl border border-zinc-300 bg-white px-2.5 shadow-sm transition focus-within:border-orange-500/60 dark:border-zinc-700 dark:bg-zinc-900",
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
              return;
            }
            if (!open) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((i) => Math.min(i + 1, Math.max(flatItems.length - 1, 0)));
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              if (flatItems.length > 0) {
                activateFlatItem(activeIndex);
              } else if (hasQuery) {
                openPalette(query);
                setOpen(false);
              }
            }
          }}
          placeholder="Search tickets, requests, users…"
          aria-label="Search tickets, requests, and users"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && flatItems[activeIndex]
              ? `${listboxId}-opt-${activeIndex}`
              : undefined
          }
          role="combobox"
          className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-600 dark:text-zinc-100 dark:placeholder:text-zinc-400"
          autoComplete="off"
        />
        {loading ? <Loader2 className="size-3.5 animate-spin text-zinc-500" aria-hidden /> : null}
        <kbd
          className="hidden shrink-0 rounded-md border border-zinc-300 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-700 sm:inline dark:border-zinc-600 dark:text-zinc-300"
          title="Open full command palette (Ctrl+K)"
        >
          Ctrl K
        </kbd>
      </div>
      {dropdown}
    </div>
  );
}
