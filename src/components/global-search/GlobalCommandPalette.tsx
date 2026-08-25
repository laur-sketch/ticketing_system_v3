"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Zap } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { SearchHighlight } from "@/components/global-search/SearchHighlight";
import { SearchResultRow } from "@/components/global-search/SearchResultRow";
import { useDebouncedGlobalSearch } from "@/components/global-search/useDebouncedGlobalSearch";
import type { GlobalSearchResult, QuickAction } from "@/lib/global-search";
import { groupLabelForKind } from "@/lib/global-search";

const GROUP_ORDER = [
  "Recent",
  "Actions",
  "Tickets",
  "Tasks",
  "Travel Orders",
  "Projects",
  "Users",
] as const;

export function GlobalCommandPalette({
  open,
  initialQuery = "",
  onOpenChange,
  recentItems,
  quickActions,
  onNavigate,
  filterQuickActions,
}: {
  open: boolean;
  initialQuery?: string;
  onOpenChange: (open: boolean) => void;
  recentItems: GlobalSearchResult[];
  quickActions: QuickAction[];
  onNavigate: (item: GlobalSearchResult | QuickAction) => void;
  filterQuickActions: (actions: QuickAction[], query: string) => QuickAction[];
}) {
  const [query, setQuery] = useState(initialQuery);
  const { loading, error, data, trimmed, hasQuery } = useDebouncedGlobalSearch(query, open, 10);

  useEffect(() => {
    if (open) setQuery(initialQuery);
  }, [open, initialQuery]);

  const filteredActions = useMemo(
    () => filterQuickActions(quickActions, query),
    [quickActions, query, filterQuickActions],
  );

  const groupedResults = useMemo(() => {
    const map = new Map<string, GlobalSearchResult[]>();
    for (const row of data?.results ?? []) {
      const label = groupLabelForKind(row.kind);
      const list = map.get(label) ?? [];
      list.push(row);
      map.set(label, list);
    }
    return map;
  }, [data?.results]);

  const showRecent = !hasQuery && recentItems.length > 0;
  const showActions = !hasQuery || filteredActions.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search tickets, requests, users…"
        aria-label="Global search"
      />
      <CommandList className="max-h-[min(420px,60vh)]">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-500">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Searching…
          </div>
        ) : null}
        {!loading && error ? (
          <div className="px-3 py-6 text-center text-sm text-rose-600 dark:text-rose-300">
            {error}
          </div>
        ) : null}
        {!loading && !error && hasQuery && (data?.results.length ?? 0) === 0 ? (
          <CommandEmpty>No results for “{trimmed}”.</CommandEmpty>
        ) : null}

        {showRecent ? (
          <CommandGroup heading="Recent">
            {recentItems.map((item) => (
              <CommandItem
                key={`recent-${item.id}-${item.href}`}
                value={`recent ${item.title} ${item.subtitle ?? ""}`}
                onSelect={() => onNavigate(item)}
                className="p-0 aria-selected:bg-transparent"
              >
                <SearchResultRow asDiv item={item} query={query} onSelect={onNavigate} />
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {showActions ? (
          <>
            {showRecent ? <CommandSeparator /> : null}
            <CommandGroup heading="Quick Actions">
              {filteredActions.map((action) => (
                <CommandItem
                  key={action.id}
                  value={`${action.label} ${action.subtitle ?? ""} ${(action.keywords ?? []).join(" ")}`}
                  onSelect={() => onNavigate(action)}
                  className="flex items-center gap-2"
                >
                  <Zap className="size-3.5 shrink-0 text-orange-600" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      <SearchHighlight text={action.label} query={query} />
                    </span>
                    {action.subtitle ? (
                      <span className="block truncate text-[11px] text-zinc-500">
                        <SearchHighlight text={action.subtitle} query={query} />
                      </span>
                    ) : null}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}

        {!loading && !error && hasQuery
          ? GROUP_ORDER.filter((label) => label !== "Recent" && label !== "Actions").map((label) => {
              const rows = groupedResults.get(label);
              if (!rows?.length) return null;
              return (
                <div key={label}>
                  <CommandSeparator />
                  <CommandGroup heading={label}>
                    {rows.map((item) => (
                      <CommandItem
                        key={item.id}
                        value={`${item.kind} ${item.title} ${item.subtitle ?? ""} ${item.status ?? ""}`}
                        onSelect={() => onNavigate(item)}
                        className="p-0 aria-selected:bg-transparent"
                      >
                        <SearchResultRow asDiv item={item} query={query} onSelect={onNavigate} />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </div>
              );
            })
          : null}
      </CommandList>
      <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[11px] text-zinc-500">
        <span>Use ↑ ↓ to navigate · Enter to open · Esc to close</span>
        <CommandShortcut>Ctrl K</CommandShortcut>
      </div>
    </CommandDialog>
  );
}
