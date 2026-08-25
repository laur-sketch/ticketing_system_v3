"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  buildQuickActions,
  filterQuickActions,
  readRecentSearchItems,
  rememberSearchItem,
  type GlobalSearchResult,
  type QuickAction,
} from "@/lib/global-search";
import { GlobalCommandPalette } from "@/components/global-search/GlobalCommandPalette";

type GlobalSearchContextValue = {
  paletteOpen: boolean;
  openPalette: (initialQuery?: string) => void;
  closePalette: () => void;
  togglePalette: () => void;
  navigateToResult: (item: GlobalSearchResult | QuickAction) => void;
  recentItems: GlobalSearchResult[];
  quickActions: QuickAction[];
  refreshRecent: () => void;
};

const GlobalSearchContext = createContext<GlobalSearchContextValue | null>(null);

export function GlobalSearchProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data } = useSession();
  const role = data?.user?.role;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [recentItems, setRecentItems] = useState<GlobalSearchResult[]>([]);

  const quickActions = useMemo(() => buildQuickActions(role), [role]);

  const refreshRecent = useCallback(() => {
    setRecentItems(readRecentSearchItems());
  }, []);

  useEffect(() => {
    refreshRecent();
  }, [refreshRecent, paletteOpen]);

  const navigateToResult = useCallback(
    (item: GlobalSearchResult | QuickAction) => {
      if ("kind" in item) {
        rememberSearchItem(item);
        refreshRecent();
      }
      setPaletteOpen(false);
      router.push(item.href);
    },
    [router, refreshRecent],
  );

  const openPalette = useCallback((initialQuery = "") => {
    setPaletteQuery(initialQuery);
    setPaletteOpen(true);
  }, []);

  const closePalette = useCallback(() => {
    setPaletteOpen(false);
  }, []);

  const togglePalette = useCallback(() => {
    setPaletteOpen((open) => !open);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteQuery("");
        setPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo(
    () => ({
      paletteOpen,
      openPalette,
      closePalette,
      togglePalette,
      navigateToResult,
      recentItems,
      quickActions,
      refreshRecent,
    }),
    [
      paletteOpen,
      openPalette,
      closePalette,
      togglePalette,
      navigateToResult,
      recentItems,
      quickActions,
      refreshRecent,
    ],
  );

  return (
    <GlobalSearchContext.Provider value={value}>
      {children}
      <GlobalCommandPalette
        open={paletteOpen}
        initialQuery={paletteQuery}
        onOpenChange={setPaletteOpen}
        recentItems={recentItems}
        quickActions={quickActions}
        onNavigate={navigateToResult}
        filterQuickActions={filterQuickActions}
      />
    </GlobalSearchContext.Provider>
  );
}

export function useGlobalSearch() {
  const ctx = useContext(GlobalSearchContext);
  if (!ctx) {
    throw new Error("useGlobalSearch must be used within GlobalSearchProvider");
  }
  return ctx;
}
