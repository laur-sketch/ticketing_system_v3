"use client";

import { RedirectLoadingIndicator } from "@/components/ui/redirect-loading-indicator";

type SessionLogoutSplashProps = {
  message?: string;
};

export function SessionLogoutSplash({
  message = "Session ended — signing you out…",
}: SessionLogoutSplashProps) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-3 bg-background px-4 text-foreground">
      <RedirectLoadingIndicator />
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}
