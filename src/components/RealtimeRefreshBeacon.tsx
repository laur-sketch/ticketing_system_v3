"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getRealtimeSocket } from "@/lib/realtime-client";

export function RealtimeRefreshBeacon() {
  const router = useRouter();
  useEffect(() => {
    const socket = getRealtimeSocket();
    const onUpdate = () => {
      router.refresh();
    };
    socket.on("lifecycle:update", onUpdate);
    return () => {
      socket.off("lifecycle:update", onUpdate);
    };
  }, [router]);
  return null;
}

