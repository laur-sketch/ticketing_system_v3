"use client";

import { useCallback, useEffect, useState } from "react";
import { isBrowserOnline } from "@/lib/offline/travel-order-sync";

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    function refresh() {
      setOnline(isBrowserOnline());
    }
    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, []);
  return online;
}

export function useOnlineStatusCallback() {
  const online = useOnlineStatus();
  const getOnline = useCallback(() => isBrowserOnline(), []);
  return { online, getOnline };
}
