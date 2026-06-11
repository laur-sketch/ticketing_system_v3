import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { customerCanAccessTicket, requireSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { loadStaffAssignmentColorsForAgents } from "@/lib/assignee-assignment-color";
import {
  personnelAssigneeHighlightStyleFromKey,
} from "@/lib/personnel-assignment-colors";
import { formatTicketPriorityLabel } from "@/lib/ticket-priority-label";
import { TicketIntakeScreenshotsBlock } from "@/components/ticket-intake-screenshots-block";
import { CustomerTicketPanel } from "./ui";

export const dynamic = "force-dynamic";

export default async function TicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  if (!session?.user) {
    redirect("/signin");
  }

  const { id } = await params;
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      team: true,
      assignedAgent: true,
      activities: { orderBy: { createdAt: "asc" } },
      messages: { orderBy: { createdAt: "asc" } },
      feedback: true,
    },
  });
  if (!ticket) notFound();
  const assigneeColorMap = await loadStaffAssignmentColorsForAgents([
    { email: ticket.assignedAgent?.email, name: ticket.assignedAgent?.name },
  ]);
  const assigneeEmail = ticket.assignedAgent?.email?.trim().toLowerCase();
  const assigneeColorKey = assigneeEmail ? (assigneeColorMap.get(assigneeEmail) ?? null) : null;
  if (
    session.user.role === "Customer" &&
    !customerCanAccessTicket(
      { contactEmail: ticket.contactEmail, requestorEmail: ticket.requestorEmail },
      session.user.email,
    )
  ) {
    redirect("/");
  }

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-3 py-5 text-zinc-100 sm:space-y-8 sm:px-4 sm:py-10">
      <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-300">
            Ticket reference
          </p>
          <h1 className="mt-1 break-all text-2xl font-semibold text-white">
            {ticket.ticketNumber}
          </h1>
          <p className="mt-2 max-w-2xl break-words text-sm text-zinc-300">{ticket.title}</p>
        </div>
        <div className="rounded-full bg-zinc-800 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-200">
          {ticket.status.replaceAll("_", " ")}
        </div>
      </div>

      <section className="grid gap-5 sm:gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <article className="rounded-2xl border border-zinc-800 bg-[#0b1220] p-4 shadow-sm sm:p-5">
            <h2 className="text-sm font-semibold text-white">Description</h2>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-200">
              {ticket.description}
            </p>
          </article>

          <TicketIntakeScreenshotsBlock ticketId={ticket.id} meta={ticket.intakeScreenshotMeta} />

          <article className="rounded-2xl border border-zinc-800 bg-[#0b1220] p-4 shadow-sm sm:p-5">
            <h2 className="text-sm font-semibold text-white">Conversation</h2>
            <div className="mt-4 space-y-3">
              {ticket.messages.length === 0 ? (
                <p className="text-sm text-zinc-500">No messages yet.</p>
              ) : (
                ticket.messages.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-sm"
                  >
                    <div className="flex flex-col gap-1 text-xs text-zinc-500 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
                      <span className="break-words font-semibold text-zinc-100">
                        {m.author}{" "}
                        <span className="font-normal text-zinc-500">({m.actor})</span>
                      </span>
                      <time dateTime={m.createdAt.toISOString()}>
                        {m.createdAt.toLocaleString()}
                      </time>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-zinc-200">{m.body}</p>
                  </div>
                ))
              )}
            </div>
          </article>
        </div>

        <aside className="min-w-0 space-y-4">
          <article
            className="rounded-2xl border border-zinc-800 bg-[#0b1220] p-4 shadow-sm sm:p-5"
            style={personnelAssigneeHighlightStyleFromKey(assigneeColorKey)}
          >
            <h2 className="text-sm font-semibold text-white">Acknowledgment</h2>
            <p className="mt-2 text-sm text-zinc-300">
              Your ticket is logged with SLA targets for first response and resolution. Share this link with your team
              for status checks.
            </p>
            <dl className="mt-4 space-y-2 text-sm text-zinc-200">
              <div className="flex flex-col gap-1 min-[420px]:flex-row min-[420px]:justify-between min-[420px]:gap-3">
                <dt className="text-zinc-500">Requestor email</dt>
                <dd className="break-all font-medium min-[420px]:text-right">{ticket.requestorEmail ?? ticket.contactEmail}</dd>
              </div>
              <div className="flex flex-col gap-1 min-[420px]:flex-row min-[420px]:justify-between min-[420px]:gap-3">
                <dt className="text-zinc-500">Account email</dt>
                <dd className="break-all font-medium min-[420px]:text-right">{ticket.contactEmail}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Priority</dt>
                <dd className="max-w-[55%] text-right font-medium">{formatTicketPriorityLabel(ticket.priority)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Agent</dt>
                <dd className="font-medium">{ticket.assignedAgent?.name ?? "Queued"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">First response due</dt>
                <dd className="font-medium">{ticket.firstResponseDueAt.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Resolution due</dt>
                <dd className="font-medium">{ticket.resolutionDueAt.toLocaleString()}</dd>
              </div>
            </dl>
          </article>

          <CustomerTicketPanel ticket={ticket} />

          <Link
            href="/agent"
            className="block text-center text-sm font-medium text-orange-300 underline-offset-4 hover:underline"
          >
            Agent view for this ticket
          </Link>
        </aside>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-[#0b1220] p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-semibold text-white">Activity timeline</h2>
        <ol className="mt-4 space-y-3">
          {ticket.activities.map((a) => (
            <li key={a.id} className="border-l-2 border-orange-800 pl-3">
              <p className="text-xs text-zinc-500">{a.createdAt.toLocaleString()}</p>
              <p className="text-sm font-medium text-white">{a.summary}</p>
              {a.detail ? (
                <p className="break-words text-sm text-zinc-300">{a.detail}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
