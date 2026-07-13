"use client";

import type { Ticket, TicketFeedback } from "@prisma/client/primary";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type TicketWithRelations = Ticket & { feedback: TicketFeedback | null };

export function CustomerTicketPanel({ ticket }: { ticket: TicketWithRelations }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function postMessage() {
    if (!message.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tickets/${ticket.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actor: "USER",
        author: ticket.contactName,
        body: message.trim(),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not send message.");
      return;
    }
    setMessage("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <article className="rounded-md border border-zinc-200 bg-white p-4 shadow-[0_14px_28px_rgba(0,0,0,0.06)] dark:border-zinc-700/80 dark:bg-[#10100f] dark:shadow-[0_14px_28px_rgba(0,0,0,0.24)] sm:p-5">
        <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">Add information</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Mirrors the “Need more info?” branch: your reply returns the ticket to active work.
        </p>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          className="mt-3 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-orange-500/40 focus:border-orange-500 focus:ring dark:border-zinc-700 dark:bg-[#181716] dark:text-zinc-100"
          placeholder="Provide missing details or answer agent questions"
        />
        <button
          type="button"
          disabled={busy}
          onClick={postMessage}
          className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-500 disabled:opacity-60"
        >
          Send update
        </button>
      </article>

      {ticket.status === "FOR_CONFIRMATION" || ticket.status === "RESOLVED" ? (
        <article className="rounded-md border border-orange-500/30 bg-orange-500/10 p-4 shadow-[0_14px_28px_rgba(0,0,0,0.18)] sm:p-5">
          <h2 className="text-sm font-semibold text-orange-100">Verification required</h2>
          <p className="mt-2 text-sm text-orange-100/80">
            A confirmation email was sent to your requestor email. Verify first, then submit your star rating.
          </p>
          <Link
            href={`/tickets/${ticket.id}/verification`}
            className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-500"
          >
            Verify resolution
          </Link>
        </article>
      ) : null}

      {ticket.feedback ? (
        <article className="rounded-md border border-zinc-200 bg-white p-4 shadow-[0_14px_28px_rgba(0,0,0,0.06)] dark:border-zinc-700/80 dark:bg-[#10100f] dark:shadow-[0_14px_28px_rgba(0,0,0,0.24)] sm:p-5">
          <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">Recorded feedback</h2>
          <p className="mt-2 text-sm text-zinc-300">CSAT: {ticket.feedback.csat}/5</p>
          {ticket.feedback.comment ? (
            <p className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm break-words text-zinc-700 dark:border-zinc-800 dark:bg-[#181716] dark:text-zinc-200">
              {ticket.feedback.comment}
            </p>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">No additional comment was submitted.</p>
          )}
        </article>
      ) : null}

      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
