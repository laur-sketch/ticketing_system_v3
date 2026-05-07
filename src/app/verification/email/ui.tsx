"use client";

import { useState } from "react";

export function EmailVerificationClient({
  token,
  ticketNumber,
  title,
  greetingName,
  initialAction = null,
}: {
  token: string;
  ticketNumber: string;
  title: string;
  greetingName: string;
  initialAction?: "reject" | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [rejected, setRejected] = useState(initialAction === "reject");
  const [rejectSubmitted, setRejectSubmitted] = useState(false);
  const [reason, setReason] = useState("");
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const [rated, setRated] = useState(false);

  async function submit(action: "verify" | "reject" | "rate") {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/tickets/email-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        action,
        reason,
        stars,
        comment,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Action failed.");
      return;
    }
    if (action === "verify") setVerified(true);
    if (action === "reject") {
      setRejected(true);
      setRejectSubmitted(true);
    }
    if (action === "rate") setRated(true);
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-10 text-zinc-100">
      <article className="rounded-2xl border border-zinc-800 bg-[#0b1220] p-6">
        <p className="text-sm text-zinc-200">Greeting, {greetingName}</p>
        <p className="mt-4 text-sm text-zinc-200">
          Your ticket ({ticketNumber})
          <br />
          ({title})
          <br />
          is for your confirmation (resolution proposed).
        </p>
        <p className="mt-4 text-sm text-zinc-300">
          Please choose whether you verify or do not verify this resolution:
        </p>

        {!verified && !rejected ? (
          <div className="mt-3 space-y-3">
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void submit("verify")}
                className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
              >
                Verify
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setRejected(true)}
                className="rounded-lg border border-rose-400 px-4 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-900/30 disabled:opacity-60"
              >
                Do not verify
              </button>
            </div>
          </div>
        ) : null}

        {rejected && !verified && !rated && !rejectSubmitted ? (
          <div className="mt-4 space-y-2">
            <label className="block text-sm text-zinc-300">
              Reason (required)
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit("reject")}
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-60"
            >
              Submit reason and reopen ticket
            </button>
          </div>
        ) : null}

        {rejectSubmitted ? (
          <div className="mt-5 rounded-xl border border-emerald-600/40 bg-emerald-950/20 p-4">
            <p className="text-sm font-semibold text-emerald-300">Reason received</p>
            <p className="mt-1 text-sm text-zinc-200">
              Your ticket was marked as not verified and has been reopened with status <strong>OPEN</strong>.
            </p>
          </div>
        ) : null}

        {verified ? (
          <div className="mt-5 rounded-xl border border-zinc-700 bg-zinc-900/40 p-4">
            <p className="text-sm text-zinc-200">star rating becomes available only after verification</p>
            <div className="mt-3 flex gap-2">
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setStars(v)}
                  className={`rounded-md px-3 py-1.5 text-lg ${
                    v <= stars ? "bg-amber-500/20 text-amber-200" : "bg-zinc-950 text-zinc-500"
                  }`}
                >
                  ★
                </button>
              ))}
            </div>
            <label className="mt-3 block text-sm text-zinc-300">
              Comment (optional)
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              />
            </label>
            <button
              type="button"
              disabled={busy || rated}
              onClick={() => void submit("rate")}
              className="mt-3 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
            >
              {rated ? "Rating submitted" : "Submit star rating"}
            </button>
          </div>
        ) : null}

        {rated ? <p className="mt-3 text-sm text-orange-300">Ticket is fully resolved and closed.</p> : null}
        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      </article>
    </main>
  );
}
