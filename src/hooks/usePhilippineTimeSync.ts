"use client";

import { useEffect, useRef, useState } from "react";

const SYNC_INTERVAL_MS = 5 * 60_000;

/** Server-synced epoch ms in Asia/Manila, ticked every second. */
export function usePhilippineTimeSync(): number | null {
  const [displayMs, setDisplayMs] = useState<number | null>(null);
  const offsetRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function syncFromServer() {
      try {
        const res = await fetch("/api/time/philippines", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { epochMs?: number };
        if (typeof body.epochMs === "number" && Number.isFinite(body.epochMs)) {
          offsetRef.current = body.epochMs - Date.now();
        }
      } catch {
        offsetRef.current = 0;
      }
      if (!cancelled) {
        setDisplayMs(Date.now() + offsetRef.current);
      }
    }

    void syncFromServer();
    const tickId = window.setInterval(() => {
      setDisplayMs(Date.now() + offsetRef.current);
    }, 1000);
    const syncId = window.setInterval(() => {
      void syncFromServer();
    }, SYNC_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(tickId);
      window.clearInterval(syncId);
    };
  }, []);

  return displayMs;
}
