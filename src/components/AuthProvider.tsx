"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { SessionProvider, signOut, useSession } from "next-auth/react";

const DEV_SESSION_RESET_ENABLED = false;

function DevSessionReset() {
  const { status } = useSession();
  const [bootId, setBootId] = useState<string | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || !DEV_SESSION_RESET_ENABLED) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/dev/boot-id", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { bootId?: string };
        if (!cancelled && typeof data.bootId === "string") {
          setBootId(data.bootId);
        }
      } catch {
        // Intentionally no-op: this check should never block auth usage.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || !DEV_SESSION_RESET_ENABLED) return;
    if (!bootId || status === "loading") return;
    const key = "dev.server.boot-id";
    const previousBootId = window.localStorage.getItem(key);

    if (previousBootId !== bootId && status === "authenticated") {
      window.localStorage.setItem(key, bootId);
      void signOut({ callbackUrl: "/" });
      return;
    }

    window.localStorage.setItem(key, bootId);
  }, [bootId, status]);

  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <DevSessionReset />
      {children}
    </SessionProvider>
  );
}
