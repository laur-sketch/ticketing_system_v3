"use client";

import { useEffect, useMemo, useState } from "react";
import type { GlobalSearchResponse } from "@/lib/global-search";

export function useDebouncedGlobalSearch(query: string, enabled: boolean, limit = 10) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<GlobalSearchResponse | null>(null);

  const trimmed = query.trim();

  useEffect(() => {
    if (!enabled || trimmed.length < 2) {
      setLoading(false);
      setError(null);
      setData(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void fetch(`/api/search?q=${encodeURIComponent(trimmed)}&limit=${limit}`, {
        cache: "no-store",
      })
        .then(async (res) => {
          const body = (await res.json().catch(() => ({}))) as GlobalSearchResponse & {
            error?: string;
          };
          if (!res.ok) throw new Error(body.error ?? "Search failed.");
          if (!cancelled) setData(body);
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setData(null);
            setError(err instanceof Error ? err.message : "Search failed.");
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, trimmed, limit]);

  return useMemo(
    () => ({
      loading,
      error,
      data,
      trimmed,
      hasQuery: trimmed.length >= 2,
    }),
    [loading, error, data, trimmed],
  );
}
