import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { customerCanAccessTicket, requireSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { formatTicketPriorityLabel } from "@/lib/ticket-priority-label";
import { formatPaymentPeso } from "@/lib/request-for-payment";
import { requestTypeLabel as formatRequestTypeLabel } from "@/lib/request-types";
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
  if (
    session.user.role === "Customer" &&
    !customerCanAccessTicket(
      { contactEmail: ticket.contactEmail, requestorEmail: ticket.requestorEmail },
      session.user.email,
    )
  ) {
    redirect("/");
  }

  const requestorEmail = (ticket.requestorEmail ?? ticket.contactEmail ?? "").trim();
  const requestorAccount = requestorEmail
    ? await prisma.portalAccount.findFirst({
        where: { email: { equals: requestorEmail, mode: "insensitive" } },
        select: {
          company: { select: { name: true } },
          staffDesignatedCompany: { select: { name: true } },
        },
      })
    : null;
  const requestorCompanyName =
    requestorAccount?.company?.name?.trim() ||
    requestorAccount?.staffDesignatedCompany?.name?.trim() ||
    null;
  const branchActivity = ticket.activities.find((a) => a.summary === "Branch");
  const branch = branchActivity?.detail?.trim() ?? null;
  const departmentActivity = ticket.activities.find((a) => a.summary === "Department");
  const department = departmentActivity?.detail?.trim() ?? null;
  const payee = ticket.activities.find((a) => a.summary === "Payee")?.detail?.trim() ?? null;
  const inPaymentOf = ticket.activities.find((a) => a.summary === "In payment of")?.detail?.trim() ?? null;
  const accountTitle = ticket.activities.find((a) => a.summary === "Account title")?.detail?.trim() ?? null;
  const amount = ticket.activities.find((a) => a.summary === "Amount")?.detail?.trim() ?? null;
  const modeOfPayment =
    ticket.activities.find((a) => a.summary === "Mode of payment")?.detail?.trim() ?? null;
  const deliveryOfCheck =
    ticket.activities.find((a) => a.summary === "Delivery of check")?.detail?.trim() ?? null;
  const bankNameAccountNumber =
    ticket.activities.find((a) => a.summary === "Bank name / account number")?.detail?.trim() ?? null;
  const requestTypeActivity = ticket.activities.find((a) => a.summary === "Request type");
  const requestTypeDisplay =
    requestTypeActivity?.detail?.trim() ||
    formatRequestTypeLabel(
      "requestType" in ticket ? String((ticket as { requestType?: string }).requestType ?? "") : "",
    );
  const isRequestorSession = customerCanAccessTicket(
    { contactEmail: ticket.contactEmail, requestorEmail: ticket.requestorEmail },
    session.user.email,
  );
  const canCancelRequest =
    isRequestorSession && !ticket.assignedAgentId && ticket.status !== "CLOSED";

  return (
    <main className="mx-auto max-w-[1440px] space-y-4 bg-zinc-50 px-3 py-4 text-zinc-900 dark:bg-[#0e0e0d] dark:text-zinc-100 sm:px-4">
      <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-300">
            Request ID
          </p>
          <h1 className="mt-1 break-all text-2xl font-semibold text-zinc-950 dark:text-white">
            {ticket.ticketNumber}
          </h1>
          <p className="mt-2 max-w-2xl break-words text-sm text-zinc-600 dark:text-zinc-300">{ticket.title}</p>
        </div>
        <div className="rounded-full bg-zinc-800 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-200">
          {ticket.status.replaceAll("_", " ")}
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <article className="rounded-md border border-zinc-200 bg-white p-4 shadow-[0_14px_28px_rgba(0,0,0,0.06)] dark:border-zinc-700/80 dark:bg-[#10100f] dark:shadow-[0_14px_28px_rgba(0,0,0,0.24)] sm:p-5">
            <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">Description</h2>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
              {ticket.description}
            </p>
          </article>

          <TicketIntakeScreenshotsBlock ticketId={ticket.id} meta={ticket.intakeScreenshotMeta} />

          <article className="rounded-md border border-zinc-200 bg-white p-4 shadow-[0_14px_28px_rgba(0,0,0,0.06)] dark:border-zinc-700/80 dark:bg-[#10100f] dark:shadow-[0_14px_28px_rgba(0,0,0,0.24)] sm:p-5">
            <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">Conversation</h2>
            <div className="mt-4 space-y-3">
              {ticket.messages.length === 0 ? (
                <p className="text-sm text-zinc-500">No messages yet.</p>
              ) : (
                ticket.messages.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-[#181716]"
                  >
                    <div className="flex flex-col gap-1 text-xs text-zinc-500 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
                      <span className="break-words font-semibold text-zinc-900 dark:text-zinc-100">
                        {m.author}{" "}
                        <span className="font-normal text-zinc-500">({m.actor})</span>
                      </span>
                      <time dateTime={m.createdAt.toISOString()}>
                        {m.createdAt.toLocaleString()}
                      </time>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-zinc-700 dark:text-zinc-200">{m.body}</p>
                  </div>
                ))
              )}
            </div>
          </article>
        </div>

        <aside className="min-w-0 space-y-3">
          <article className="rounded-md border border-zinc-200 bg-white p-4 shadow-[0_14px_28px_rgba(0,0,0,0.06)] dark:border-zinc-700/80 dark:bg-[#10100f] dark:shadow-[0_14px_28px_rgba(0,0,0,0.24)] sm:p-5">
            <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">Acknowledgment</h2>
            <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
              Your ticket is logged with SLA targets for first response and resolution. Share this link with your team
              for status checks.
            </p>
            <dl className="mt-4 space-y-3 text-sm text-zinc-700 dark:text-zinc-200">
              <div className="flex flex-col gap-1 min-[420px]:flex-row min-[420px]:justify-between min-[420px]:gap-3">
                <dt className="text-zinc-500 shrink-0">Requestor</dt>
                <dd className="font-medium min-[420px]:max-w-[60%] min-[420px]:text-right break-words">{ticket.contactName}</dd>
              </div>
              <div className="flex flex-col gap-1 min-[420px]:flex-row min-[420px]:justify-between min-[420px]:gap-3">
                <dt className="text-zinc-500 shrink-0">Requestor email</dt>
                <dd className="break-all font-medium min-[420px]:max-w-[60%] min-[420px]:text-right">{ticket.requestorEmail ?? ticket.contactEmail}</dd>
              </div>
              <div className="flex flex-col gap-1 min-[420px]:flex-row min-[420px]:justify-between min-[420px]:gap-3">
                <dt className="text-zinc-500 shrink-0">Account email</dt>
                <dd className="break-all font-medium min-[420px]:max-w-[60%] min-[420px]:text-right">{ticket.contactEmail}</dd>
              </div>
              <div className="flex flex-col gap-1 min-[420px]:flex-row min-[420px]:justify-between min-[420px]:gap-3">
                <dt className="text-zinc-500 shrink-0">Request type</dt>
                <dd className="font-medium min-[420px]:text-right break-words">{requestTypeDisplay}</dd>
              </div>
              <div className="flex flex-col gap-1 min-[420px]:flex-row min-[420px]:justify-between min-[420px]:gap-3">
                <dt className="text-zinc-500 shrink-0">Priority</dt>
                <dd className="font-medium min-[420px]:text-right">{formatTicketPriorityLabel(ticket.priority)}</dd>
              </div>
              <div className="flex flex-col gap-1 min-[420px]:flex-row min-[420px]:justify-between min-[420px]:gap-3">
                <dt className="text-zinc-500 shrink-0">Agent</dt>
                <dd className="font-medium min-[420px]:text-right">{ticket.assignedAgent?.name ?? "Queued"}</dd>
              </div>
              <div className="flex flex-col gap-1 min-[420px]:flex-row min-[420px]:justify-between min-[420px]:gap-3">
                <dt className="text-zinc-500 shrink-0">Company</dt>
                <dd className="font-medium min-[420px]:text-right break-words">{requestorCompanyName ?? "Not assigned"}</dd>
              </div>
              {branch ? (
                <div className="flex flex-col gap-1 min-[420px]:flex-row min-[420px]:justify-between min-[420px]:gap-3">
                  <dt className="text-zinc-500 shrink-0">Branch</dt>
                  <dd className="font-medium min-[420px]:text-right break-words">{branch}</dd>
                </div>
              ) : null}
              {department ? (
                <div className="flex flex-col gap-1 min-[420px]:flex-row min-[420px]:justify-between min-[420px]:gap-3">
                  <dt className="text-zinc-500 shrink-0">Department</dt>
                  <dd className="font-medium min-[420px]:text-right break-words">{department}</dd>
                </div>
              ) : null}
              {payee ? (
                <div className="flex flex-col gap-1 min-[420px]:flex-row min-[420px]:justify-between min-[420px]:gap-3">
                  <dt className="text-zinc-500 shrink-0">Payee</dt>
                  <dd className="font-medium min-[420px]:text-right break-words">{payee}</dd>
                </div>
              ) : null}
              {inPaymentOf ? (
                <div className="flex flex-col gap-1 min-[420px]:flex-row min-[420px]:justify-between min-[420px]:gap-3">
                  <dt className="text-zinc-500 shrink-0">In payment of</dt>
                  <dd className="font-medium min-[420px]:text-right break-words">{inPaymentOf}</dd>
                </div>
              ) : null}
              {accountTitle ? (
                <div className="flex flex-col gap-1 min-[420px]:flex-row min-[420px]:justify-between min-[420px]:gap-3">
                  <dt className="text-zinc-500 shrink-0">Account title</dt>
                  <dd className="font-medium min-[420px]:text-right break-words">{accountTitle}</dd>
                </div>
              ) : null}
              {amount ? (
                <div className="flex flex-col gap-1 min-[420px]:flex-row min-[420px]:justify-between min-[420px]:gap-3">
                  <dt className="text-zinc-500 shrink-0">Amount</dt>
                  <dd className="font-medium min-[420px]:text-right break-words">
                    {formatPaymentPeso(amount) || amount}
                  </dd>
                </div>
              ) : null}
              {modeOfPayment ? (
                <div className="flex flex-col gap-1 min-[420px]:flex-row min-[420px]:justify-between min-[420px]:gap-3">
                  <dt className="text-zinc-500 shrink-0">Mode of payment</dt>
                  <dd className="font-medium min-[420px]:text-right break-words">{modeOfPayment}</dd>
                </div>
              ) : null}
              {deliveryOfCheck ? (
                <div className="flex flex-col gap-1 min-[420px]:flex-row min-[420px]:justify-between min-[420px]:gap-3">
                  <dt className="text-zinc-500 shrink-0">Delivery of check</dt>
                  <dd className="font-medium min-[420px]:text-right break-words">{deliveryOfCheck}</dd>
                </div>
              ) : null}
              {bankNameAccountNumber ? (
                <div className="flex flex-col gap-1 min-[420px]:flex-row min-[420px]:justify-between min-[420px]:gap-3">
                  <dt className="text-zinc-500 shrink-0">Bank name / account number</dt>
                  <dd className="font-medium min-[420px]:text-right break-words">{bankNameAccountNumber}</dd>
                </div>
              ) : null}
              <div className="flex flex-col gap-1 min-[420px]:flex-row min-[420px]:justify-between min-[420px]:gap-3">
                <dt className="text-zinc-500 shrink-0">First response due</dt>
                <dd className="font-medium min-[420px]:text-right">{ticket.firstResponseDueAt.toLocaleString()}</dd>
              </div>
              <div className="flex flex-col gap-1 min-[420px]:flex-row min-[420px]:justify-between min-[420px]:gap-3">
                <dt className="text-zinc-500 shrink-0">Resolution due</dt>
                <dd className="font-medium min-[420px]:text-right">{ticket.resolutionDueAt.toLocaleString()}</dd>
              </div>
            </dl>
          </article>

          <CustomerTicketPanel ticket={ticket} canCancelRequest={canCancelRequest} />

          {session.user.role !== "Customer" ? (
            <Link
              href="/agent"
              className="block text-center text-sm font-medium text-orange-300 underline-offset-4 hover:underline"
            >
              Agent view for this ticket
            </Link>
          ) : null}
        </aside>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-[0_14px_28px_rgba(0,0,0,0.06)] dark:border-zinc-700/80 dark:bg-[#10100f] dark:shadow-[0_14px_28px_rgba(0,0,0,0.24)] sm:p-5">
        <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">Activity timeline</h2>
        <ol className="mt-4 space-y-3">
          {ticket.activities.map((a) => (
            <li key={a.id} className="border-l-2 border-orange-800 pl-3">
              <p className="text-xs text-zinc-500">{a.createdAt.toLocaleString()}</p>
              <p className="text-sm font-medium text-zinc-950 dark:text-white">{a.summary}</p>
              {a.detail ? (
                <p className="break-words text-sm text-zinc-700 dark:text-zinc-300">{a.detail}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
