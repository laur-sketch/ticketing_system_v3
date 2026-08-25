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
import type { BreadcrumbSegment } from "@/lib/breadcrumbs";

type BreadcrumbContextValue = {
  override: BreadcrumbSegment[] | null;
  setOverride: (segments: BreadcrumbSegment[] | null) => void;
};

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [override, setOverrideState] = useState<BreadcrumbSegment[] | null>(null);

  const setOverride = useCallback((segments: BreadcrumbSegment[] | null) => {
    setOverrideState(segments);
  }, []);

  const value = useMemo(
    () => ({
      override,
      setOverride,
    }),
    [override, setOverride],
  );

  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

export function useBreadcrumbContext() {
  const ctx = useContext(BreadcrumbContext);
  if (!ctx) {
    throw new Error("useBreadcrumbContext must be used within BreadcrumbProvider");
  }
  return ctx;
}

/** Replace the auto-generated trail on detail pages. */
export function SetBreadcrumbs({ segments }: { segments: BreadcrumbSegment[] }) {
  const { setOverride } = useBreadcrumbContext();

  useEffect(() => {
    setOverride(segments);
    return () => setOverride(null);
  }, [segments, setOverride]);

  return null;
}
