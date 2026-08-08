"use client";

import { useCallback, useEffect, useState } from "react";
import {
  isBrowserOnline,
  subscribeTravelOrderConnectivity,
} from "@/lib/offline/travel-order-sync";

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    function refresh() {
      setOnline(isBrowserOnline());
    }
    refresh();
    return subscribeTravelOrderConnectivity(refresh);
  }, []);
  return online;
}

export function useOnlineStatusCallback() {
  const online = useOnlineStatus();
  const getOnline = useCallback(() => isBrowserOnline(), []);
  return { online, getOnline };
}
