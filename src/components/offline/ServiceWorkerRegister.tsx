"use client";

import { useEffect } from "react";
import { Workbox } from "workbox-window";
import { flushTravelOrderPendingQueue } from "@/lib/offline/travel-order-sync";

/**
 * Registers the Workbox service worker and listens for Background Sync wakeups.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const wb = new Workbox("/sw.js", { scope: "/" });

    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data?.type === "TRAVEL_ORDER_SYNC") {
        void flushTravelOrderPendingQueue();
      }
    };

    wb.addEventListener("waiting", () => {
      wb.messageSkipWaiting();
    });

    navigator.serviceWorker.addEventListener("message", onMessage);

    void wb.register().catch((err) => {
      console.warn("[sw] registration failed", err);
    });

    const onOnline = () => {
      void flushTravelOrderPendingQueue();
    };
    window.addEventListener("online", onOnline);

    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return null;
}
