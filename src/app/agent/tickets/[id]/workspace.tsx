"use client";

import { AssigneeColorHighlight } from "@/components/ticket/AssigneeColorHighlight";
import type { Agent, Team, Ticket, TicketActivity, TicketMessage } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatTicketPriorityLabel } from "@/lib/ticket-priority-label";
import { parseIntakeScreenshotMeta } from "@/lib/ticket-intake-screenshots-meta";
import { parseTransferRequestDetail } from "@/lib/ticket-transfer-request";

type AgentWithAssigneeColor = Agent & { staffAssignmentColor?: string | null };
type TransferRecipient = { id: string; name: string; email: string };
type DestinationCompany = { id: string; name: string };

type TicketDetail = Ticket & {
  team: Team | null;
  assignedAgent: AgentWithAssigneeColor | null;
  activities: TicketActivity[];
  messages: TicketMessage[];
  feedback?: {
    csat: number;
    comment: string | null;
  } | null;
};

export function AgentWorkspace({
  ticket,
  canUpdatePriority,
  canRequestTransfer,
  canApproveTransfer,
  transferPending,
}: {
  ticket: TicketDetail;
  canUpdatePriority: boolean;
  canRequestTransfer: boolean;
  canApproveTransfer: boolean;
  transferPending: boolean;
}) {
  const router = useRouter();
  const [resolution, setResolution] = useState(ticket.resolutionNotes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priority, setPriority] = useState(ticket.priority);
  const [transferReason, setTransferReason] = useState("");
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [transferRecipients, setTransferRecipients] = useState<TransferRecipient[]>([]);
  const [transferRecipientId, setTransferRecipientId] = useState("");
  const [destinationCompanies, setDestinationCompanies] = useState<DestinationCompany[]>([]);
  const [transferDestinationMode, setTransferDestinationMode] = useState<"same_company" | "other_company">(
    "same_company",
  );
  const [transferTargetTeamId, setTransferTargetTeamId] = useState("");

  useEffect(() => {
    if (!canRequestTransfer || transferPending) return;
    let cancelled = false;
    void fetch(`/api/tickets/${ticket.id}/transfer-recipients`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { recipients?: TransferRecipient[]; destinationCompanies?: DestinationCompany[] } | null) => {
        if (cancelled) return;
        const recipients = data?.recipients ?? [];
        const companies = data?.destinationCompanies ?? [];
        setTransferRecipients(recipients);
        setTransferRecipientId(recipients[0]?.id ?? "");
        setDestinationCompanies(companies);
        setTransferTargetTeamId(companies[0]?.id ?? "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canRequestTransfer, transferPending, ticket.id]);

  const cleanedDescription = useMemo(() => {
    return ticket.description
      .replace(/\s*Request to Company\/SBU:\s*.+$/i, "")
      .replace(/\s*Department\/Business Unit:\s*.+$/i, "")
      .trim();
  }, [ticket.description]);

  const intakeScreenshots = useMemo(
    () => parseIntakeScreenshotMeta(ticket.intakeScreenshotMeta),
    [ticket.intakeScreenshotMeta],
  );

  const pendingTransfer = useMemo(() => {
    let detail: string | null = null;
    for (const a of ticket.activities) {
      if (a.summary === "Transfer requested") detail = a.detail ?? null;
      if (a.summary === "Transfer approved" || a.summary === "Transfer rejected") detail = null;
    }
    return parseTransferRequestDetail(detail);
  }, [ticket.activities]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tickets/${ticket.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Request failed");
      return;
    }
    router.refresh();
  }

  const verificationState = useMemo(() => {
    let state: "pending" | "verified" | "rejected" = "pending";
    let rejectedReason: string | null = null;
    for (const a of ticket.activities) {
      if (a.summary === "Resolution verification approved") {
        state = "verified";
        rejectedReason = null;
      }
      if (a.summary === "Resolution verification rejected") {
        state = "rejected";
        rejectedReason = a.detail?.trim() || "No reason provided.";
      }
    }
    return { state, rejectedReason };
  }, [ticket.activities]);

  return (
    <div className="grid min-w-0 gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1.9fr)_minmax(280px,1fr)] xl:items-start">
      <AssigneeColorHighlight
        assigneeColorKey={ticket.assignedAgent?.staffAssignmentColor}
        className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#0a101d] shadow-[0_14px_40px_rgba(0,0,0,0.3)]"
      >
        <div className="flex flex-col">
        <div className="border-b border-zinc-800/90 px-3 py-3 sm:px-5 sm:py-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500">
            <span>Incident</span>
            <span className="break-all text-zinc-300">{ticket.ticketNumber}</span>
            <span className="rounded-full bg-zinc-700/70 px-2 py-0.5 text-[10px] text-zinc-200">
              {formatTicketPriorityLabel(ticket.priority)}
            </span>
          </div>
          <h2 className="mt-2 break-words text-lg font-bold tracking-tight text-zinc-100 sm:text-2xl md:text-3xl">{ticket.title}</h2>
          <p className="mt-2 max-w-4xl whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-300 sm:text-base">{cleanedDescription}</p>
          {ticket.team?.name ? (
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Company Requested to:{" "}
              <span className="normal-case tracking-normal text-zinc-300">{ticket.team.name}</span>
            </p>
          ) : null}
          {intakeScreenshots.length > 0 ? (
            <div className="mt-4 border-t border-zinc-800/80 pt-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                Screenshots from request
              </p>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {intakeScreenshots.map((m) => {
                  const href = `/api/tickets/${ticket.id}/screenshots/${encodeURIComponent(m.storedFileName)}`;
                  return (
                    <li
                      key={m.storedFileName}
                      className="overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-950/50"
                    >
                      <a href={href} target="_blank" rel="noreferrer" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={href}
                          alt={m.originalName}
                          className="h-28 w-full object-cover object-top"
                          loading="lazy"
                        />
                      </a>
                      <p className="truncate px-1.5 py-1 text-[10px] text-zinc-500" title={m.originalName}>
                        {m.originalName}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="border-b border-zinc-800/90 px-3 sm:px-5">
          <div className="flex gap-5 text-sm font-medium">
            <span className="border-b-2 border-orange-500 py-3 text-orange-300">Verification outcome</span>
          </div>
        </div>

        <div className="space-y-3 px-3 py-3 sm:px-5 sm:py-4">
          {verificationState.state === "verified" ? (
            <article className="rounded-xl border border-emerald-700/50 bg-emerald-950/20 p-4">
              <p className="text-sm font-semibold text-emerald-300">Verified by requestor</p>
              <p className="mt-2 text-sm text-zinc-200">
                {ticket.feedback
                  ? "Star rating and feedback have been submitted."
                  : "Verification complete. Waiting for star rating and feedback."}
              </p>
              {ticket.feedback ? (
                <div className="mt-3 rounded-lg border border-zinc-700 bg-zinc-900/60 p-3">
                  <p className="text-sm text-zinc-100">
                    Star rating: <span className="font-semibold">{ticket.feedback.csat}/5</span>
                  </p>
                  <p className="mt-1 text-sm text-zinc-300">
                    {ticket.feedback.comment?.trim() || "No written feedback submitted."}
                  </p>
                </div>
              ) : null}
            </article>
          ) : null}

          {verificationState.state === "rejected" ? (
            <article className="rounded-xl border border-rose-700/50 bg-rose-950/20 p-4">
              <p className="text-sm font-semibold text-rose-300">Not verified by requestor</p>
              <p className="mt-2 text-sm text-zinc-200">
                The requestor did not verify the resolution. Ticket workflow returns to active handling.
              </p>
              <div className="mt-3 rounded-lg border border-zinc-700 bg-zinc-900/60 p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-zinc-400">Reason provided</p>
                <p className="mt-1 text-sm text-zinc-100">{verificationState.rejectedReason}</p>
              </div>
            </article>
          ) : null}

          {verificationState.state === "pending" ? (
            <article className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-4">
              <p className="text-sm font-semibold text-zinc-100">Awaiting requestor verification</p>
              <p className="mt-2 text-sm text-zinc-300">
                A verification email was sent. This tab will automatically reflect rating and feedback once verified,
                or show the requestor&apos;s rejection reason when not verified.
              </p>
            </article>
          ) : null}
        </div>

        <div className="border-t border-zinc-800/90 bg-zinc-950/35 px-3 py-3 sm:px-5 sm:py-4">
          <div className="text-sm text-zinc-400">
            Use the right-side controls to request transfer, update priority, or complete resolution workflow.
          </div>
        </div>
        </div>
      </AssigneeColorHighlight>

      <aside className="min-w-0 space-y-4">
        <article className="rounded-2xl border border-zinc-800 bg-surface p-4 shadow-[0_10px_30px_rgba(0,0,0,0.25)] sm:p-5">
          <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Assignment</h2>
          <p className="mt-2 text-sm text-zinc-300">
            Ticket assignment is managed on the Assignment Board Kanban flow.
          </p>
        </article>

        <article className="rounded-2xl border border-zinc-800 bg-surface p-4 shadow-[0_10px_30px_rgba(0,0,0,0.25)] sm:p-5">
          <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Ticket controls</h2>
          <div className="mt-3 flex flex-col gap-2">
            {canUpdatePriority ? (
              <div className="space-y-2 rounded-xl border border-zinc-700 bg-zinc-900/50 p-3">
                <label className="text-xs font-semibold text-zinc-300">Priority level</label>
                <div className="flex flex-col gap-2 min-[420px]:flex-row">
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as typeof ticket.priority)}
                    className="min-h-10 min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                  >
                    {(ticket.priority === "UNSET"
                      ? (["UNSET", "LOW", "MEDIUM", "HIGH", "URGENT"] as const)
                      : (["LOW", "MEDIUM", "HIGH", "URGENT"] as const)
                    ).map((p) => (
                      <option key={p} value={p}>
                        {formatTicketPriorityLabel(p)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy || priority === ticket.priority}
                    onClick={() =>
                      patch({
                        action: "priority",
                        priority,
                        note: "Priority updated",
                      })
                    }
                    className="min-h-10 rounded-lg border border-orange-500/60 bg-orange-600/20 px-4 py-2 text-xs font-semibold text-orange-100 hover:bg-orange-600/30 disabled:opacity-60"
                  >
                    Update
                  </button>
                </div>
              </div>
            ) : null}

            {["IN_PROGRESS", "ESCALATED", "OPEN"].includes(ticket.status) ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  patch({ action: "request_more_info", note: "Requested more information from the requestor." })
                }
                className="min-h-10 rounded-lg border border-amber-500 px-4 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-500/10 disabled:opacity-60"
              >
                Request more information
              </button>
            ) : null}

            {ticket.status === "PENDING_INFO" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => patch({ action: "status", status: "IN_PROGRESS", note: "Customer replied" })}
                className="min-h-10 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-800 disabled:opacity-60"
              >
                Resume after customer reply
              </button>
            ) : null}

            {transferPending ? (
              <div className="space-y-2 rounded-xl border border-amber-700/60 bg-amber-950/20 p-3">
                <p className="text-xs font-semibold text-amber-200">Transfer request pending admin approval.</p>
                {pendingTransfer?.targetTeamName ? (
                  <p className="text-xs text-amber-100/80">
                    Destination: {pendingTransfer.targetTeamName} unassigned queue.
                  </p>
                ) : null}
                {canApproveTransfer ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      patch({
                        action: "approve_transfer",
                        note: "Admin approved transfer request.",
                      })
                    }
                    className="min-h-10 w-full rounded-lg border border-amber-500/70 bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/30 disabled:opacity-60"
                  >
                    Approve transfer
                  </button>
                ) : null}
              </div>
            ) : null}

            {canRequestTransfer && !transferPending ? (
              <div className="space-y-2 rounded-xl border border-zinc-700 bg-zinc-900/50 p-3">
                <label className="text-xs font-semibold text-zinc-300">Request for transfer</label>
                <label className="block text-[11px] font-semibold text-zinc-400">
                  Send approval request to
                  <select
                    value={transferRecipientId}
                    onChange={(e) => setTransferRecipientId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                  >
                    {transferRecipients.length === 0 ? (
                      <option value="">Loading reviewers…</option>
                    ) : (
                      transferRecipients.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                          {r.email ? ` (${r.email})` : ""}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/40 p-2.5">
                  <label className="block text-[11px] font-semibold text-zinc-400">
                    Transfer destination
                    <select
                      value={transferDestinationMode}
                      onChange={(e) =>
                        setTransferDestinationMode(e.target.value as "same_company" | "other_company")
                      }
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                    >
                      <option value="same_company">Same company unassigned queue</option>
                      <option value="other_company">Different company unassigned queue</option>
                    </select>
                  </label>
                  {transferDestinationMode === "other_company" ? (
                    <label className="block text-[11px] font-semibold text-zinc-400">
                      Destination company
                      <select
                        value={transferTargetTeamId}
                        onChange={(e) => setTransferTargetTeamId(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                      >
                        {destinationCompanies.length === 0 ? (
                          <option value="">No other companies available</option>
                        ) : (
                          destinationCompanies.map((company) => (
                            <option key={company.id} value={company.id}>
                              {company.name}
                            </option>
                          ))
                        )}
                      </select>
                    </label>
                  ) : null}
                </div>
                <textarea
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                  placeholder="Why this ticket needs transfer"
                />
                <button
                  type="button"
                  disabled={
                    busy ||
                    !transferRecipientId ||
                    (transferDestinationMode === "other_company" && !transferTargetTeamId)
                  }
                  onClick={() => {
                    const isSuper = transferRecipientId === "__SUPERADMIN__";
                    patch({
                      action: "request_transfer",
                      reason: transferReason || "Unable to resolve with current assignment.",
                      recipientSuperAdmin: isSuper,
                      recipientPortalAccountId: isSuper ? undefined : transferRecipientId,
                      targetTeamId:
                        transferDestinationMode === "other_company" ? transferTargetTeamId : undefined,
                    });
                  }}
                  className="min-h-10 w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-800 disabled:opacity-60"
                >
                  Request transfer
                </button>
              </div>
            ) : null}

            {["IN_PROGRESS", "PENDING_INFO", "ESCALATED", "OPEN"].includes(ticket.status) ? (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-300">Resolution notes</label>
                <textarea
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                />
                <p className="text-xs text-zinc-400">
                  Move the ticket to the For confirmation lane in Kanban to trigger the requestor confirmation email.
                </p>
              </div>
            ) : null}
          </div>
        </article>

        <article className="rounded-2xl border border-zinc-800 bg-surface p-4 text-xs text-zinc-300 shadow-[0_10px_30px_rgba(0,0,0,0.25)] sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Audit log</h2>
            <button
              type="button"
              onClick={() => setLogModalOpen(true)}
              className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-200 hover:bg-zinc-800"
            >
              View all log
            </button>
          </div>
          <ul className="mt-3 space-y-2">
            {ticket.activities.slice(-6).map((a) => (
              <li key={a.id}>
                <span className="font-semibold text-zinc-100">{a.summary}</span>
                <div className="text-[11px] text-zinc-400">{a.createdAt.toLocaleString()}</div>
              </li>
            ))}
          </ul>
        </article>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}
      </aside>

      {logModalOpen ? (
        <div className="fixed inset-0 z-[70]">
          <button
            type="button"
            onClick={() => setLogModalOpen(false)}
            className="absolute inset-0 bg-black/70"
            aria-label="Close ticket logs"
          />
          <section className="absolute inset-x-2 bottom-2 top-2 flex flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-surface shadow-[0_25px_90px_rgba(0,0,0,0.65)] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[80vh] sm:w-[min(920px,94vw)] sm:-translate-x-1/2 sm:-translate-y-1/2">
            <header className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-3 sm:px-5 sm:py-4">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500">Ticket logs</p>
                <h3 className="mt-1 break-all text-base font-semibold text-zinc-100">{ticket.ticketNumber}</h3>
              </div>
              <button
                type="button"
                onClick={() => setLogModalOpen(false)}
                className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
              >
                Close
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5 sm:py-4">
              <ul className="space-y-3">
                {ticket.activities.map((a) => (
                  <li key={a.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                    <p className="text-sm font-semibold text-zinc-100">{a.summary}</p>
                    {a.detail ? <p className="mt-1 text-sm text-zinc-300">{a.detail}</p> : null}
                    <p className="mt-2 text-[11px] uppercase tracking-[0.12em] text-zinc-500">
                      {a.actor} · {a.createdAt.toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
