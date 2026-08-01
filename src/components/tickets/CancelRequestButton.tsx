"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";

type CancelRequestButtonProps = {
  ticketId: string;
  ticketNumber?: string;
  className?: string;
  /** When true, stop click from bubbling (e.g. inside a card link). */
  stopPropagation?: boolean;
};

export function CancelRequestButton({
  ticketId,
  ticketNumber,
  className,
  stopPropagation = false,
}: CancelRequestButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancelRequest(e: React.MouseEvent) {
    if (stopPropagation) {
      e.preventDefault();
      e.stopPropagation();
    }
    const label = ticketNumber ? `request ${ticketNumber}` : "this request";
    if (
      !window.confirm(
        `Cancel ${label}? You can only do this while it has no assignee. This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel_request" }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Could not cancel request.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not cancel request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("space-y-1", className)}>
      <button
        type="button"
        disabled={busy}
        onClick={(e) => void cancelRequest(e)}
        className="inline-flex w-full items-center justify-center rounded-lg border border-rose-400/50 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-800 transition hover:bg-rose-500/20 disabled:opacity-60 dark:border-rose-500/40 dark:text-rose-200 dark:hover:bg-rose-500/15"
      >
        {busy ? "Cancelling…" : "Cancel request"}
      </button>
      {error ? <p className="text-xs text-rose-700 dark:text-rose-300">{error}</p> : null}
    </div>
  );
}
