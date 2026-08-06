import { isElevatedUserRole } from "@/lib/auth";
﻿import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma, TicketPriority, TicketStatus } from "@prisma/client/primary";
import { CustomerHomeDashboard } from "@/components/portal/CustomerHomeDashboard";
import { RecentActivityPanel } from "@/components/dashboard/RecentActivityPanel";
import {
  customerHasPendingResolvedTicket,
  customerPendingTicketHref,
} from "@/lib/customer-pending-resolution";
import { prisma } from "@/lib/prisma";
import { BRAND_TITLE } from "@/lib/brand";
import { resolveStaffCompanyTeamId } from "@/lib/staff-company-scope";
import { findSessionAgentId } from "@/lib/session-agent";
import { personnelRequestBoardWhere } from "@/lib/rfp-request-board";
import { formatTicketPriorityLabel } from "@/lib/ticket-priority-label";
import { safeGetServerSession } from "@/lib/server-session";

export const dynamic = "force-dynamic";

function minsBetween(a: Date, b: Date) {
  return Math.max(0, (a.getTime() - b.getTime()) / 60000);
}

function formatResponseDuration(totalMinutes: number) {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;
  if (hours === 0) return `${remainderMinutes}m`;
  if (remainderMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainderMinutes}m`;
}

function priorityTone(priority: TicketPriority) {
  if (priority === "URGENT") return "border-l-rose-400";
  if (priority === "UNSET") return "border-l-amber-400";
  return "border-l-orange-400";
}

export default async function Home() {
  const session = await safeGetServerSession();

  if (session?.user?.role === "Customer") {
    const email = session.user.email ?? "";
    const first = session.user.name?.split(" ")[0] ?? "there";
    const pending = email
      ? await customerHasPendingResolvedTicket(email, session.user.authProvider)
      : null;
    return (
      <CustomerHomeDashboard
        email={email}
        firstName={first}
        canCreateTickets={!pending}
        pendingVerificationHref={pending ? customerPendingTicketHref(pending) : null}
      />
    );
  }

  if (
    isElevatedUserRole(session?.user?.role) ||
    session?.user?.role === "Admin" ||
    session?.user?.role === "Personnel"
  ) {
    const user = session!.user;
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const isSuperAdmin = isElevatedUserRole(user.role);
    const isPersonnel = user.role === "Personnel";
    const scopedCompanyTeamId =
      isSuperAdmin || isPersonnel ? null : await resolveStaffCompanyTeamId(user.email);
    const personnelAgent = isPersonnel
      ? await findSessionAgentId({ email: user.email, name: user.name })
      : null;
    // SuperAdmin / HighAdmin: all tickets. Admin: assigned company. Personnel: own assignments + current-step RFPs/ACAs.
    const ticketScope: Prisma.TicketWhereInput = isPersonnel
      ? await personnelRequestBoardWhere(personnelAgent?.id)
      : isSuperAdmin
        ? {}
        : { teamId: scopedCompanyTeamId ?? "__none__" };
    const scopedCompanyName =
      !isSuperAdmin && !isPersonnel && scopedCompanyTeamId
        ? (
            await prisma.team.findUnique({
              where: { id: scopedCompanyTeamId },
              select: { name: true },
            })
          )?.name ?? null
        : null;

    const activeStatuses: TicketStatus[] = ["OPEN", "IN_PROGRESS", "PENDING_INFO", "ESCALATED"];
    const activeWhere = { status: { in: activeStatuses }, ...ticketScope } as const;
    /** Priority Stack: only live queue work — exclude done / confirmation / delayed side states. */
    const priorityStackStatuses: TicketStatus[] = ["OPEN", "IN_PROGRESS"];

    const [
      openTickets,
      totalTickets,
      resolvedClosed,
      firstResponses,
      activityLog,
      priorityStackSeed,
      newLast24h,
      resolvedLast24h,
    ] = await Promise.all([
      prisma.ticket.count({ where: activeWhere }),
      prisma.ticket.count({ where: ticketScope }),
      prisma.ticket.count({
        where: { status: { in: ["FOR_CONFIRMATION", "RESOLVED", "CLOSED"] }, ...ticketScope },
      }),
      prisma.ticket.findMany({
        where: { firstResponseAt: { not: null }, ...ticketScope },
        select: { createdAt: true, firstResponseAt: true },
        take: 60,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.ticketActivity.findMany({
        where: { ticket: ticketScope },
        orderBy: { createdAt: "desc" },
        take: 250,
        select: {
          id: true,
          summary: true,
          detail: true,
          actor: true,
          createdAt: true,
          ticket: {
            select: {
              id: true,
              ticketNumber: true,
              title: true,
              status: true,
            },
          },
        },
      }),
      prisma.ticket.findMany({
        where: {
          status: { in: priorityStackStatuses },
          priority: { in: ["URGENT", "HIGH"] },
          ...ticketScope,
        },
        orderBy: { updatedAt: "desc" },
        take: 6,
        select: { id: true, title: true, priority: true, category: true },
      }),
      prisma.ticket.count({ where: { createdAt: { gte: yesterday }, ...ticketScope } }),
      prisma.ticket.count({
        where: {
          status: { in: ["FOR_CONFIRMATION", "RESOLVED", "CLOSED"] },
          resolvedAt: { gte: yesterday },
          ...ticketScope,
        },
      }),
    ]);

    const avgMins =
      firstResponses.length === 0
        ? 0
        : Math.round(
            firstResponses.reduce(
              (sum, r) => sum + minsBetween(r.firstResponseAt ?? r.createdAt, r.createdAt),
              0,
            ) / firstResponses.length,
          );

    const resolutionRate = totalTickets === 0 ? 0 : (resolvedClosed / totalTickets) * 100;
    const priorityStack = priorityStackSeed
      .sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "URGENT" ? -1 : 1))
      .slice(0, 3);
    const scopeLabel = isPersonnel
      ? "Your assigned work"
      : isSuperAdmin
        ? "All companies"
        : scopedCompanyName ?? (scopedCompanyTeamId ? "Your assigned company" : "No assigned company");
    const dashboardTitle = isPersonnel ? "My Work" : "Operational Oversight";
    const openLabel = isPersonnel ? "My open" : "Open Tickets";
    const responseLabel = isPersonnel ? "My avg. response" : "Avg. Response";
    const resolutionLabel = isPersonnel ? "My resolution" : "Resolution Rate";
    const newVolumeLabel = isPersonnel ? "New in my queue (24h)" : "New Tickets (24h)";
    const resolvedVolumeLabel = isPersonnel ? "Closed from my queue (24h)" : "Resolved (24h)";
    const volumeBlurb = isPersonnel
      ? "Activity on tickets assigned to you over the last 24 hours"
      : "Ticket distribution over the last 24 hours";
    const priorityEmpty = isPersonnel
      ? "No high-priority items in your queue."
      : "No high-priority active items.";

    return (
      <main className="min-h-full bg-zinc-50 px-3 py-3 text-zinc-900 sm:px-5 sm:py-4 dark:bg-zinc-950 dark:text-zinc-100">
        <div className="w-full max-w-none space-y-5">
          <header className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-700 sm:text-[11px] dark:text-orange-400/95">
              {BRAND_TITLE} · Dashboard
            </p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl dark:text-white">
              {dashboardTitle}
            </h1>
            <p className="mt-1 text-xs text-zinc-600 sm:text-sm dark:text-zinc-400">
              {now.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })} ·{" "}
              {now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
              {" · "}
              {scopeLabel}
            </p>
          </header>

          <section className="grid grid-cols-3 gap-2 sm:gap-4">
            <article className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm sm:rounded-2xl sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500 sm:text-xs">
                {openLabel}
              </p>
              <p className="mt-2 text-2xl font-bold leading-none text-zinc-900 sm:mt-3 sm:text-4xl md:text-5xl dark:text-zinc-100">
                {openTickets}
              </p>
            </article>
            <article className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm sm:rounded-2xl sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500 sm:text-xs">
                {responseLabel}
              </p>
              <p className="mt-2 text-lg font-bold leading-none text-zinc-900 sm:mt-3 sm:text-4xl md:text-5xl dark:text-zinc-100">
                {formatResponseDuration(avgMins)}
              </p>
            </article>
            <article className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm sm:rounded-2xl sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500 sm:text-xs">
                {resolutionLabel}
              </p>
              <p className="mt-2 text-lg font-bold leading-none text-zinc-900 sm:mt-3 sm:text-4xl md:text-5xl dark:text-zinc-100">
                {resolutionRate.toFixed(1)}%
              </p>
            </article>
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
            <div className="min-w-0">
            <RecentActivityPanel
              nowMs={now.getTime()}
              activities={activityLog.flatMap((a) =>
                a.ticket
                  ? [
                      {
                        id: a.id,
                        ticketId: a.ticket.id,
                        summary: a.summary,
                        detail: a.detail,
                        actor: a.actor,
                        createdAt: a.createdAt.toISOString(),
                        ticketNumber: a.ticket.ticketNumber,
                        ticketTitle: a.ticket.title,
                        ticketStatus: a.ticket.status,
                      },
                    ]
                  : [],
              )}
            />
            </div>

            <aside className="min-w-0 space-y-5">
              <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">Priority Stack</h3>
                <div className="mt-4 space-y-3">
                  {priorityStack.length === 0 ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-500">{priorityEmpty}</p>
                  ) : (
                    priorityStack.map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-xl border border-zinc-200 border-l-4 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900 ${priorityTone(item.priority)}`}
                      >
                        <p
                          className={`text-[11px] font-bold tracking-wide text-zinc-600 dark:text-zinc-500 ${item.priority === "UNSET" ? "normal-case" : "uppercase"}`}
                        >
                          {formatTicketPriorityLabel(item.priority)}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{item.title}</p>
                        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-500">Impact: {item.category}</p>
                      </div>
                    ))
                  )}
                </div>
              </article>
            </aside>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Volume Trends</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-500">{volumeBlurb}</p>
              </div>
              <div className="flex items-center gap-4 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block size-2 rounded-full bg-orange-600" />
                  New
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block size-2 rounded-full bg-zinc-400 dark:bg-zinc-300" />
                  Resolved
                </span>
              </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
                  {newVolumeLabel}
                </p>
                <p className="mt-2 text-3xl font-bold text-zinc-900 dark:text-zinc-100">{newLast24h}</p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
                  {resolvedVolumeLabel}
                </p>
                <p className="mt-2 text-3xl font-bold text-zinc-900 dark:text-zinc-100">{resolvedLast24h}</p>
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (session?.user) {
    return (
      <main className="min-h-[calc(100vh-56px)] bg-zinc-50 px-4 py-10 text-zinc-900 dark:bg-[#0a0b12] dark:text-zinc-100">
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-[0_12px_40px_rgba(0,0,0,0.06)] md:p-10 dark:border-zinc-800/90 dark:bg-[#12161c] dark:shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-700 dark:text-orange-400">
              General-purpose ticketing
            </p>
            <h1 className="mt-3 max-w-3xl text-3xl font-bold leading-tight tracking-tight text-zinc-900 md:text-4xl dark:text-white">
              Capture requests, honor SLAs, and close the loop with customers.
            </h1>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/tickets/new"
                className="inline-flex items-center justify-center rounded-full bg-orange-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-500"
              >
                Submit a ticket
              </Link>
              <Link
                href="/agent"
                className="inline-flex items-center justify-center rounded-full border border-zinc-400 px-6 py-2.5 text-sm font-semibold text-zinc-800 transition hover:border-zinc-600 hover:text-zinc-950 dark:border-zinc-500 dark:text-zinc-100 dark:hover:border-zinc-300 dark:hover:text-white"
              >
                Open agent console
              </Link>
              <Link
                href="/insights"
                className="inline-flex items-center justify-center rounded-full border border-zinc-400 px-6 py-2.5 text-sm font-semibold text-zinc-800 transition hover:border-zinc-600 hover:text-zinc-950 dark:border-zinc-500 dark:text-zinc-100 dark:hover:border-zinc-300 dark:hover:text-white"
              >
                View KPIs
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  redirect("/signin");
}
