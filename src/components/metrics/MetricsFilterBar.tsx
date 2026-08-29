"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import Filters, {
  Filter,
  FilterIcon,
  FilterOperator,
  FilterOption,
  FiltersTrigger,
  SavedFilter,
  loadSavedFilters,
  persistSavedFilters,
} from "@/components/ui/filters";
import { cn } from "@/lib/cn";

export type MetricsFilterFieldDef = {
  id: string;
  type: string;
  param: string;
  visible: boolean;
  value: string;
  options: Array<{ value: string; label: string }>;
  /** Value treated as unfiltered — hidden from chips and omitted from URL. Default `ALL`. */
  emptyValue?: string;
};

export type MetricsSearchSuggestion = {
  id: string;
  label: string;
};

type MetricsFilterBarProps = {
  initialQuery: string;
  placeholder: string;
  fields: MetricsFilterFieldDef[];
  savedFilterStorageKey?: string;
  /** Params kept when filters change (e.g. tab, from, to). */
  preserveParams?: string[];
  /** Extra params captured when saving a favorite filter. */
  extraCaptureParams?: string[];
  /** Typeahead matches for the search input (e.g. personnel). */
  searchSuggestions?: MetricsSearchSuggestion[];
  /** When true, show a loading row until suggestions arrive. */
  searchSuggestionsLoading?: boolean;
  /** URL param set when a suggestion is chosen (e.g. `agentId`). */
  searchSuggestionParam?: string;
  className?: string;
};

function isEmptyValue(field: MetricsFilterFieldDef, value: string) {
  const empty = field.emptyValue ?? "ALL";
  return value === empty || value === "";
}

/** Make option labels unique so filter UI keys/selection stay unambiguous. */
function withUniqueOptionLabels(
  options: Array<{ value: string; label: string }>,
): Array<{ value: string; label: string }> {
  const counts = new Map<string, number>();
  for (const o of options) {
    counts.set(o.label, (counts.get(o.label) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return options.map((o) => {
    if ((counts.get(o.label) ?? 0) <= 1) return o;
    const n = (seen.get(o.label) ?? 0) + 1;
    seen.set(o.label, n);
    return { value: o.value, label: `${o.label} (${n})` };
  });
}

/**
 * Board-style search + chip filters for metrics pages (Request / Task M&R).
 * Syncs q and filter params to the URL via router.replace.
 */
export function MetricsFilterBar({
  initialQuery,
  placeholder,
  fields,
  savedFilterStorageKey,
  preserveParams = [],
  extraCaptureParams = [],
  searchSuggestions,
  searchSuggestionsLoading = false,
  searchSuggestionParam,
  className,
}: MetricsFilterBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [listPos, setListPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const searchRootRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const skipBlurApplyRef = useRef(false);
  const listboxId = useId();
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>(() =>
    savedFilterStorageKey ? loadSavedFilters(savedFilterStorageKey) : [],
  );

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    function onDocDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (searchRootRef.current?.contains(target)) return;
      if (listboxRef.current?.contains(target)) return;
      setSuggestionsOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  const personnelSearchEnabled = Boolean(searchSuggestionParam);

  const filteredSuggestions = useMemo(() => {
    if (!searchSuggestions?.length) return [];
    const q = query.trim().toLowerCase();
    if (!q) return searchSuggestions;
    return searchSuggestions.filter((item) => item.label.toLowerCase().includes(q));
  }, [searchSuggestions, query]);

  const showingGeneralPersonnelList = personnelSearchEnabled && !query.trim();

  const computeListPos = useCallback(() => {
    const el = searchRootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const listHeight = listboxRef.current?.getBoundingClientRect().height ?? 256;
    const gap = 4;
    const below = rect.bottom + gap;
    const top =
      below + listHeight <= window.innerHeight - 8
        ? below
        : Math.max(8, rect.top - gap - listHeight);
    const width = Math.min(Math.max(rect.width, 280), window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    setListPos((prev) =>
      prev &&
      Math.abs(prev.top - top) < 0.5 &&
      Math.abs(prev.left - left) < 0.5 &&
      Math.abs(prev.width - width) < 0.5
        ? prev
        : { top, left, width },
    );
  }, []);

  useEffect(() => {
    if (!suggestionsOpen || !personnelSearchEnabled) {
      setListPos(null);
      return;
    }
    computeListPos();
    window.addEventListener("scroll", computeListPos, true);
    window.addEventListener("resize", computeListPos);
    return () => {
      window.removeEventListener("scroll", computeListPos, true);
      window.removeEventListener("resize", computeListPos);
    };
  }, [suggestionsOpen, personnelSearchEnabled, computeListPos]);

  useLayoutEffect(() => {
    if (suggestionsOpen && personnelSearchEnabled) computeListPos();
  }, [suggestionsOpen, personnelSearchEnabled, computeListPos, filteredSuggestions.length, query]);

  function updateSavedFilters(next: SavedFilter[] | ((prev: SavedFilter[]) => SavedFilter[])) {
    setSavedFilters((prev) => {
      const updated = typeof next === "function" ? next(prev) : next;
      if (savedFilterStorageKey) persistSavedFilters(savedFilterStorageKey, updated);
      return updated;
    });
  }

  const normalizedFields = fields.map((field) => ({
    ...field,
    options: withUniqueOptionLabels(field.options),
  }));

  const fieldByParam = new Map(normalizedFields.map((f) => [f.param, f]));

  useEffect(() => {
    setHighlight(0);
  }, [query, suggestionsOpen]);

  function optionLabel(field: MetricsFilterFieldDef, value: string) {
    return field.options.find((o) => o.value === value)?.label ?? value;
  }

  function optionValue(field: MetricsFilterFieldDef, label: string) {
    const exact = field.options.find((o) => o.label === label);
    if (exact) return exact.value;
    const lower = label.trim().toLowerCase();
    const byLabel = field.options.find((o) => o.label.toLowerCase() === lower);
    if (byLabel) return byLabel.value;
    const byValue = field.options.find(
      (o) => o.value === label || o.value.toLowerCase() === lower,
    );
    if (byValue) return byValue.value;
    return field.emptyValue ?? "ALL";
  }

  function navigate(patch: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(window.location.search);
    for (const key of preserveParams) {
      const current = new URLSearchParams(window.location.search).get(key);
      if (current != null) params.set(key, current);
    }
    patch(params);
    const qs = params.toString();
    router.replace(`${window.location.pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  function resolveSuggestionParam(value: string): string | null {
    if (!searchSuggestionParam || !searchSuggestions?.length) return null;
    const q = value.trim().toLowerCase();
    if (!q) return null;
    const exact = searchSuggestions.filter((item) => item.label.toLowerCase() === q);
    if (exact.length === 1) return exact[0]!.id;
    const partial = searchSuggestions.filter((item) => item.label.toLowerCase().includes(q));
    if (partial.length === 1) return partial[0]!.id;
    return null;
  }

  function applySearch(nextQuery = query) {
    const value = nextQuery.trim().replace(/^#/, "").trim();
    navigate((params) => {
      if (value) params.set("q", value);
      else params.delete("q");
      if (searchSuggestionParam) {
        const matchedId = resolveSuggestionParam(value);
        if (matchedId) params.set(searchSuggestionParam, matchedId);
        else params.delete(searchSuggestionParam);
      }
    });
    setSuggestionsOpen(false);
  }

  function selectSuggestion(item: MetricsSearchSuggestion) {
    skipBlurApplyRef.current = true;
    setQuery(item.label);
    navigate((params) => {
      params.set("q", item.label);
      if (searchSuggestionParam) params.set(searchSuggestionParam, item.id);
    });
    setSuggestionsOpen(false);
  }

  const visibleFields = normalizedFields.filter((f) => f.visible);

  const filters: Filter[] = visibleFields.flatMap((field) => {
    if (isEmptyValue(field, field.value)) return [];
    return [
      {
        id: field.type,
        type: field.type,
        operator: FilterOperator.IS,
        value: [optionLabel(field, field.value)],
      },
    ];
  });

  const filterOptions: Partial<Record<string, FilterOption[]>> = {};
  for (const field of visibleFields) {
    filterOptions[field.type] = field.options
      .filter((o) => !isEmptyValue(field, o.value))
      .map((o) => ({ name: o.label, icon: undefined, id: o.value }));
  }

  const viewOptions: FilterOption[][] = [
    visibleFields.map((field) => ({
      name: field.type,
      icon: <FilterIcon type={field.type} />,
      id: field.id,
    })),
  ];

  function applyToUrl(updated: Filter[]) {
    navigate((params) => {
      const byType = new Map(updated.map((f) => [f.type, f.value[f.value.length - 1]]));
      for (const field of normalizedFields) {
        if (!field.visible) continue;
        const label = byType.get(field.type);
        if (label === undefined) {
          params.delete(field.param);
          continue;
        }
        const code = optionValue(field, label);
        if (isEmptyValue(field, code)) params.delete(field.param);
        else params.set(field.param, code);
      }
    });
  }

  function setFilters(next: Filter[] | ((prev: Filter[]) => Filter[])) {
    const updated = typeof next === "function" ? next(filters) : next;
    applyToUrl(updated);
  }

  function addFilter(type: string, value: string) {
    setFilters((prev) => [
      ...prev.filter((f) => f.type !== type),
      { id: type, type, operator: FilterOperator.IS, value: [value] },
    ]);
  }

  function saveCurrentFilter(name: string) {
    const params = new URLSearchParams(window.location.search);
    const captured: Record<string, string> = {};
    for (const field of normalizedFields) {
      const value = params.get(field.param);
      if (value && !isEmptyValue(field, value)) captured[field.param] = value;
    }
    const q = params.get("q");
    if (q) captured.q = q;
    for (const key of extraCaptureParams) {
      const value = params.get(key);
      if (value) captured[key] = value;
    }
    if (Object.keys(captured).length === 0) return;
    updateSavedFilters((prev) => [
      ...prev,
      {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name,
        params: captured,
        createdAt: Date.now(),
      },
    ]);
  }

  function applySavedFilter(filter: SavedFilter) {
    setQuery(filter.params.q ?? "");
    navigate((params) => {
      for (const field of normalizedFields) params.delete(field.param);
      params.delete("q");
      for (const key of extraCaptureParams) params.delete(key);
      for (const [key, value] of Object.entries(filter.params)) {
        if (fieldByParam.has(key) || key === "q" || extraCaptureParams.includes(key)) {
          params.set(key, value);
        }
      }
    });
  }

  function deleteSavedFilter(id: string) {
    updateSavedFilters((prev) => prev.filter((f) => f.id !== id));
  }

  const canSaveCurrent = filters.length > 0 || query.trim().length > 0;
  const showSuggestionList = personnelSearchEnabled && suggestionsOpen;
  const suggestionLoading = showSuggestionList && searchSuggestionsLoading;
  const suggestionEmpty =
    showSuggestionList &&
    !searchSuggestionsLoading &&
    filteredSuggestions.length === 0 &&
    query.trim().length > 0;

  const suggestionList =
    showSuggestionList && listPos && typeof document !== "undefined" ? (
      createPortal(
        <div
          id={listboxId}
          ref={listboxRef}
          role="listbox"
          className="fixed z-[400] max-h-80 overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-950"
          style={{ top: listPos.top, left: listPos.left, width: listPos.width }}
        >
          {suggestionLoading ? (
            <p className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">Loading personnel…</p>
          ) : suggestionEmpty ? (
            <p className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">
              No personnel match “{query.trim()}”
            </p>
          ) : filteredSuggestions.length === 0 ? (
            <p className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">No personnel found.</p>
          ) : (
            <>
              {showingGeneralPersonnelList ? (
                <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                  All personnel
                </p>
              ) : null}
              {filteredSuggestions.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={index === highlight}
                className={cn(
                  "flex w-full items-center px-3 py-2 text-left text-sm text-zinc-800 dark:text-zinc-100",
                  index === highlight
                    ? "bg-orange-50 text-orange-900 dark:bg-orange-950/40 dark:text-orange-100"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-900",
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectSuggestion(item);
                }}
                onMouseEnter={() => setHighlight(index)}
              >
                {item.label}
              </button>
              ))}
            </>
          )}
        </div>,
        document.body,
      )
    ) : null;

  return (
    <div
      className={cn(
        "flex w-full flex-col overflow-visible rounded-xl border border-zinc-300 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900 sm:flex-row sm:items-center sm:gap-2 sm:p-2.5",
        className,
      )}
    >
      <div ref={searchRootRef} className="relative min-w-0 flex-1 p-2.5 sm:p-0">
        <label className="flex min-w-0 items-center rounded-lg border border-zinc-200 bg-zinc-50/90 px-2.5 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-400 sm:border-0 sm:bg-transparent sm:px-2 sm:py-1">
          <Search className="mr-2 size-4 shrink-0 opacity-60" aria-hidden />
          <input
            type="text"
            value={query}
            role="combobox"
            aria-expanded={showSuggestionList}
            aria-controls={showSuggestionList ? listboxId : undefined}
            aria-autocomplete="list"
            onFocus={() => {
              setSuggestionsOpen(true);
              const el = searchRootRef.current;
              if (el) {
                const rect = el.getBoundingClientRect();
                setListPos({
                  top: rect.bottom + 4,
                  left: 8,
                  width: Math.min(Math.max(rect.width, 280), window.innerWidth - 16),
                });
              }
            }}
            onChange={(event) => {
              setQuery(event.target.value);
              setSuggestionsOpen(true);
              const el = searchRootRef.current;
              if (el) {
                const rect = el.getBoundingClientRect();
                setListPos({
                  top: rect.bottom + 4,
                  left: 8,
                  width: Math.min(Math.max(rect.width, 280), window.innerWidth - 16),
                });
              }
            }}
            onBlur={() => {
              window.setTimeout(() => {
                if (skipBlurApplyRef.current) {
                  skipBlurApplyRef.current = false;
                  return;
                }
                applySearch();
              }, 150);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                if (!filteredSuggestions.length) return;
                event.preventDefault();
                setSuggestionsOpen(true);
                setHighlight((prev) => (prev + 1) % filteredSuggestions.length);
                return;
              }
              if (event.key === "ArrowUp") {
                if (!filteredSuggestions.length) return;
                event.preventDefault();
                setSuggestionsOpen(true);
                setHighlight((prev) =>
                  prev <= 0 ? filteredSuggestions.length - 1 : prev - 1,
                );
                return;
              }
              if (event.key === "Escape") {
                setSuggestionsOpen(false);
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                if (suggestionsOpen && filteredSuggestions[highlight]) {
                  selectSuggestion(filteredSuggestions[highlight]!);
                } else {
                  applySearch();
                }
              }
            }}
            placeholder={placeholder}
            className="w-full min-w-0 bg-transparent text-zinc-900 outline-none placeholder:text-zinc-500 dark:text-zinc-200"
          />
        </label>
        {suggestionList}
      </div>

      {visibleFields.length > 0 || query.trim().length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-zinc-200 px-2.5 py-2 dark:border-zinc-700 sm:border-t-0 sm:px-0 sm:py-0">
          {visibleFields.length > 0 ? (
            <>
              <Filters
                filters={filters}
                setFilters={setFilters}
                filterOptions={filterOptions}
                showOperators={false}
              />
              <FiltersTrigger
                viewOptions={viewOptions}
                filterOptions={filterOptions}
                onSelect={addFilter}
                savedFilters={savedFilterStorageKey ? savedFilters : undefined}
                onSaveFilter={saveCurrentFilter}
                onApplySavedFilter={applySavedFilter}
                onDeleteSavedFilter={deleteSavedFilter}
                canSaveCurrent={canSaveCurrent}
              />
            </>
          ) : null}
          {filters.length > 0 || query.trim().length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              className="transition group h-6 items-center rounded-sm text-xs"
              onClick={() => {
                setQuery("");
                navigate((params) => {
                  for (const field of normalizedFields) {
                    if (field.visible) params.delete(field.param);
                  }
                  params.delete("q");
                  if (searchSuggestionParam) params.delete(searchSuggestionParam);
                });
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
