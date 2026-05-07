"use client";

import { useEffect, useState } from "react";

/** Relative time like "5m ago"; updates every minute. Clock starts after mount to satisfy render purity rules. */
export function ElapsedFromIso({ iso, className }: { iso: string; className?: string }) {
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    queueMicrotask(() => setNowMs(Date.now()));
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  if (nowMs == null) {
    return (
      <span className={className} suppressHydrationWarning>
        …
      </span>
    );
  }

  const diff = nowMs - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  let text: string;
  if (mins < 1) text = "just now";
  else if (mins < 60) text = `${mins}m ago`;
  else {
    const hours = Math.floor(mins / 60);
    if (hours < 24) text = `${hours}h ago`;
    else text = `${Math.floor(hours / 24)}d ago`;
  }

  return (
    <span className={className} suppressHydrationWarning>
      {text}
    </span>
  );
}
