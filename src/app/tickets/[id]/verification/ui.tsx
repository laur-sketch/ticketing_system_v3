"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TicketVerificationForm({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [choice, setChoice] = useState<"verify" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitVerification() {
    if (!choice) {
      setError("Please choose Verify or Do not verify.");
      return;
    }
    if (choice === "reject" && !reason.trim()) {
      setError("Please provide your reason for not verifying.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "resolution_verification",
        verified: choice === "verify",
        reason: choice === "reject" ? reason.trim() : null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not submit verification.");
      return;
    }
    if (choice === "verify") {
      router.push(`/tickets/${ticketId}/rate`);
      return;
    }
    router.push(`/tickets/${ticketId}`);
  }

  return (
    <article className="rounded-md border border-zinc-200 bg-white p-5 shadow-[0_14px_28px_rgba(0,0,0,0.06)] dark:border-zinc-700/80 dark:bg-[#10100f] dark:shadow-[0_14px_28px_rgba(0,0,0,0.24)]">
      <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-100">Resolution verification</h2>
      <p className="mt-1 text-sm text-zinc-400">
        Choose whether the resolution is valid. Rating is enabled only after verification.
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setChoice("verify")}
          className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
            choice === "verify"
              ? "border-orange-400 bg-orange-500/20 text-orange-100"
              : "border-zinc-300 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-[#181716] dark:text-zinc-200"
          }`}
        >
          Verify
        </button>
        <button
          type="button"
          onClick={() => setChoice("reject")}
          className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
            choice === "reject"
              ? "border-rose-400 bg-rose-500/20 text-rose-100"
              : "border-zinc-300 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-[#181716] dark:text-zinc-200"
          }`}
        >
          Do not verify
        </button>
      </div>

      {choice === "reject" ? (
        <label className="mt-4 block text-sm text-zinc-300">
          Reason (required)
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-[#181716] dark:text-zinc-100"
            placeholder="Tell us why the issue is not yet resolved."
          />
        </label>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={submitVerification}
        className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
      >
        Submit verification
      </button>

      {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
    </article>
  );
}
