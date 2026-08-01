"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Full-viewport centered modal shell for agent ticket detail.
 * Portals to document.body so `fixed` is not trapped by AppChrome overflow /
 * sidebar layout (same pattern as Patch Notes).
 */
export function AgentTicketModalShell({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (!mounted) {
    return (
      <main
        className="min-h-dvh bg-zinc-950/40 dark:bg-black/55"
        aria-busy="true"
        aria-label="Loading request details"
      />
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/45 p-2 backdrop-blur-[2px] sm:p-5 dark:bg-black/65"
      role="dialog"
      aria-modal="true"
      aria-label="Request details"
    >
      <div className="flex h-[min(94dvh,960px)] w-full max-w-[1200px] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white/80 p-1.5 shadow-[0_30px_90px_rgba(15,23,42,0.35)] backdrop-blur-sm sm:rounded-3xl sm:p-2 dark:border-zinc-700/80 dark:bg-black/40 dark:shadow-[0_30px_90px_rgba(0,0,0,0.65)]">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.16)] sm:rounded-2xl dark:border-zinc-800 dark:bg-surface dark:shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
