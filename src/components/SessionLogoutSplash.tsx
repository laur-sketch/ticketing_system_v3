"use client";

import { useEffect, useRef } from "react";
import { RedirectLoadingIndicator } from "@/components/ui/redirect-loading-indicator";
import { logoutExpiredSession } from "@/lib/session-expiry-client";

type SessionLogoutSplashProps = {
  message?: string;
  /** When true (default), clear the NextAuth session and send the user to sign-in. */
  logout?: boolean;
  reason?: "idle" | "midnight";
};

export function SessionLogoutSplash({
  message = "Session ended — signing you out…",
  logout = true,
  reason = "midnight",
}: SessionLogoutSplashProps) {
  const startedRef = useRef(false);

  useEffect(() => {
    if (!logout || startedRef.current) return;
    startedRef.current = true;
    logoutExpiredSession(reason);
  }, [logout, reason]);

  return (
    <div className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-3 bg-background px-4 text-foreground">
      <RedirectLoadingIndicator />
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}
