"use client";

import { io, type Socket } from "socket.io-client";

let socketSingleton: Socket | null = null;

export function getRealtimeSocket() {
  if (socketSingleton) return socketSingleton;
  socketSingleton = io({
    path: "/socket.io",
    transports: ["websocket", "polling"],
  });
  return socketSingleton;
}

