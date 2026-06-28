"use client";

import { useEffect, useState, type ReactNode } from "react";
import { MessageLoading } from "@/components/ui/message-loading";

const DEFAULT_SLOW_REDIRECT_MS = 1500;

type RedirectLoadingIndicatorProps = {
  /** Switch to MessageLoading after this delay (ms). */
  delayMs?: number;
  fallback?: ReactNode;
  className?: string;
};

/** Quick spinner first; MessageLoading when a redirect/sign-out takes longer than expected. */
export function RedirectLoadingIndicator({
  delayMs = DEFAULT_SLOW_REDIRECT_MS,
  fallback,
  className,
}: RedirectLoadingIndicatorProps) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);

  if (slow) {
    return (
      <div className={className} role="status" aria-live="polite">
        <MessageLoading />
      </div>
    );
  }

  return (
    <div className={className} role="status" aria-live="polite">
      {fallback ?? (
        <div
          className="h-9 w-9 animate-spin rounded-full border-2 border-brand/30 border-t-brand"
          aria-hidden
        />
      )}
    </div>
  );
}
