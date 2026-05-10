import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Building2, LogIn, Shield, Sparkles, Users } from "lucide-react";
import { getServerSession } from "next-auth";
import type { TicketPriority, TicketStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { CustomerHomeDashboard } from "@/components/portal/CustomerHomeDashboard";
import { OnDutyPanel } from "@/components/dashboard/OnDutyPanel";
import { RecentActivityPanel } from "@/components/dashboard/RecentActivityPanel";
import { BrandLockup } from "@/components/BrandLockup";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { customerHasPendingResolvedTicket } from "@/lib/customer-pending-resolution";
import { prisma } from "@/lib/prisma";
import { BRAND_TITLE } from "@/lib/brand";
import { onDutyCompanyLine, resolveStaffOnDutyAgentIds } from "@/lib/on-duty-company-line";
import { formatTicketPriorityLabel } from "@/lib/ticket-priority-label";

export const dynamic = "force-dynamic";

function minsBetween(a: Date, b: Date) {
  return Math.max(0, (a.getTime() - b.getTime()) / 60000);
}

function priorityTone(priority: TicketPriority) {
  if (priority === "URGENT") return "border-l-rose-400";
  if (priority === "UNSET") return "border-l-amber-400";
  return "border-l-orange-400";
}

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (session?.user?.role === "Personnel") {
    redirect("/agent");
  }

  if (session?.user?.role === "Customer") {
    const email = session.user.email ?? "";
    const first = session.user.name?.split(" ")[0] ?? "there";
    const pending = email ? await customerHasPendingResolvedTicket(email) : null;
    return (
      <CustomerHomeDashboard
        email={email}
        firstName={first}
        canCreateTickets={!pending}
        pendingVerificationHref={pending ? `/tickets/${pending.id}/verification` : null}
      />
    );
  }

  if (session?.user?.role === "SuperAdmin" || session?.user?.role === "Admin") {
    const onDutyPageSize = 2;
    const onDutyPage = 1;
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const activeStatuses: TicketStatus[] = ["OPEN", "IN_PROGRESS", "PENDING_INFO", "ESCALATED"];
    const activeWhere = { status: { in: activeStatuses } } as const;

    const [
      openTickets,
      totalTickets,
      resolvedClosed,
      firstResponses,
      activityLog,
      priorityStackSeed,
      onDutyPortalAccounts,
      onDutyAgentsCanonical,
      newLast24h,
      resolvedLast24h,
    ] = await Promise.all([
      prisma.ticket.count({ where: activeWhere }),
      prisma.ticket.count(),
      prisma.ticket.count({
        where: { status: { in: ["FOR_CONFIRMATION", "RESOLVED", "CLOSED"] } },
      }),
      prisma.ticket.findMany({
        where: { firstResponseAt: { not: null } },
        select: { createdAt: true, firstResponseAt: true },
        take: 60,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.ticketActivity.findMany({
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
        where: { ...activeWhere, priority: { in: ["URGENT", "HIGH"] } },
        orderBy: { updatedAt: "desc" },
        take: 6,
        select: { id: true, title: true, priority: true, category: true },
      }),
      prisma.portalAccount.findMany({
        select: {
          email: true,
          name: true,
          role: true,
          staffDesignatedCompany: { select: { name: true } },
        },
      }),
      prisma.agent.findMany({
        orderBy: { createdAt: "asc" },
        select: { id: true, email: true, name: true, createdAt: true },
      }),
      prisma.ticket.count({ where: { createdAt: { gte: yesterday } } }),
      prisma.ticket.count({
        where: {
          status: { in: ["FOR_CONFIRMATION", "RESOLVED", "CLOSED"] },
          resolvedAt: { gte: yesterday },
        },
      }),
    ]);

    const dutyAgentIds = resolveStaffOnDutyAgentIds(onDutyPortalAccounts, onDutyAgentsCanonical);
    const onDutyTotal = dutyAgentIds.length;
    const onDutyTotalPages = Math.max(1, Math.ceil(onDutyTotal / onDutyPageSize));
    const onDutyAgents =
      dutyAgentIds.length === 0
        ? []
        : await prisma.agent.findMany({
            where: { id: { in: dutyAgentIds } },
            orderBy: { name: "asc" },
            skip: (onDutyPage - 1) * onDutyPageSize,
            take: onDutyPageSize,
            include: {
              team: true,
              tickets: {
                select: { updatedAt: true },
                orderBy: { updatedAt: "desc" },
                take: 1,
              },
            },
          });

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
    const onlineWindowMs = 15 * 60 * 1000;
    const onlineNow = now.getTime();
    const priorityStack = priorityStackSeed
      .sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "URGENT" ? -1 : 1))
      .slice(0, 3);

    return (
      <main className="min-h-[calc(100vh-56px)] bg-zinc-50 px-4 py-8 text-zinc-900 dark:bg-[#070d19] dark:text-zinc-100">
        <div className="mx-auto max-w-6xl space-y-6">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-700 dark:text-orange-400/95">
                {BRAND_TITLE} · Ticket dashboard
              </p>
              <h1 className="mt-1.5 text-4xl font-bold tracking-tight text-zinc-900 dark:text-white">
                Operational Oversight
              </h1>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {now.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })} ·{" "}
                {now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/agent"
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Ticket Queue
              </Link>
              <Link
                href="/tickets/new"
                className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500"
              >
                New Ticket
              </Link>
            </div>
          </header>

          <section className="grid gap-4 md:grid-cols-3">
            <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-[#0b1220]">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Open Tickets</p>
              <p className="mt-3 text-5xl font-bold leading-none text-zinc-900 dark:text-zinc-100">{openTickets}</p>
              <p className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-600">Active queue requiring action</p>
            </article>
            <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-[#0b1220]">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Avg. Response</p>
              <p className="mt-3 text-5xl font-bold leading-none text-zinc-900 dark:text-zinc-100">{avgMins}m</p>
              <p className="mt-2 text-xs font-semibold text-orange-700 dark:text-orange-600">
                Based on latest first responses
              </p>
            </article>
            <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-[#0b1220]">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Resolution Rate</p>
              <p className="mt-3 text-5xl font-bold leading-none text-zinc-900 dark:text-zinc-100">
                {resolutionRate.toFixed(1)}%
              </p>
              <p className="mt-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400">Target: 92.0%</p>
            </article>
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.65fr_1fr]">
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

            <aside className="space-y-5">
              <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-[#0b1220]">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">Priority Stack</h3>
                <div className="mt-4 space-y-3">
                  {priorityStack.length === 0 ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-500">No high-priority active items.</p>
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

              <OnDutyPanel
                initialAgents={onDutyAgents.map((agent) => ({
                  id: agent.id,
                  name: agent.name,
                  companyName: onDutyCompanyLine(agent, agent.team?.name, onDutyPortalAccounts, onDutyAgentsCanonical),
                  isOnline:
                    !!agent.tickets[0]?.updatedAt &&
                    onlineNow - new Date(agent.tickets[0].updatedAt).getTime() <= onlineWindowMs,
                }))}
                initialPage={onDutyPage}
                totalPages={onDutyTotalPages}
              />
            </aside>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-[#0b1220]">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Volume Trends</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-500">Ticket distribution over the last 24 hours</p>
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
                  New Tickets (24h)
                </p>
                <p className="mt-2 text-3xl font-bold text-zinc-900 dark:text-zinc-100">{newLast24h}</p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
                  Resolved (24h)
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
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-600 md:text-base dark:text-zinc-400">
              This workspace models the full lifecycle: intake from any channel, structured categorization and
              priority, queue routing, agent diagnosis, optional escalation, customer validation, and closure with
              feedback for CSAT, optional NPS, and effort scoring.
            </p>
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

  return (
    <div className="relative min-h-screen overflow-x-clip bg-zinc-50 text-zinc-900 dark:bg-[#050913] dark:text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(92%_72%_at_8%_12%,rgba(249,115,22,0.18),transparent_58%),radial-gradient(78%_68%_at_92%_88%,rgba(14,165,233,0.16),transparent_66%),linear-gradient(90deg,#f8fafc_0%,#edf2ff_48%,#eaf6ff_100%)] dark:bg-[radial-gradient(92%_72%_at_8%_12%,rgba(249,115,22,0.22),transparent_58%),radial-gradient(78%_68%_at_92%_88%,rgba(14,165,233,0.18),transparent_66%),linear-gradient(90deg,#020408_0%,#050b16_48%,#07152b_100%)]"
      />
      <header className="sticky top-0 z-20 border-b border-zinc-200/90 bg-[linear-gradient(90deg,rgba(255,255,255,0.92),rgba(248,250,252,0.85))] backdrop-blur-md dark:border-zinc-800/80 dark:bg-[linear-gradient(90deg,rgba(2,4,8,0.92),rgba(7,21,43,0.85))]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:py-3.5">
          <BrandLockup variant="landing-header" href="/" />
          <nav className="hidden items-center gap-5 text-xs font-medium text-zinc-600 dark:text-zinc-400 md:flex">
            <a href="#platform" className="transition hover:text-zinc-900 dark:hover:text-zinc-200">
              Platform
            </a>
            <a href="#access" className="transition hover:text-zinc-900 dark:hover:text-zinc-200">
              Access
            </a>
            <a href="#principles" className="transition hover:text-zinc-900 dark:hover:text-zinc-200">
              Principles
            </a>
            <a href="#workflow" className="transition hover:text-zinc-900 dark:hover:text-zinc-200">
              Workflow
            </a>
            <a href="#pricing" className="transition hover:text-zinc-900 dark:hover:text-zinc-200">
              Get started
            </a>
          </nav>
          <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
            <ThemeToggle />
            <div className="flex items-center rounded-full border border-zinc-200 bg-white/95 p-0.5 shadow-sm ring-1 ring-zinc-900/[0.04] dark:border-zinc-700 dark:bg-zinc-900/95 dark:ring-white/[0.06]">
              <Link
                href="/signin"
                className="inline-flex items-center gap-1.5 rounded-full bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-orange-500 sm:px-3.5"
              >
                <LogIn className="size-3.5 shrink-0 opacity-95" aria-hidden />
                Sign in
              </Link>
              <Link
                href="/signup"
                className="rounded-full px-2.5 py-1.5 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 sm:px-3"
                title="Create a staff or company account"
              >
                Register
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-20 px-4 py-12 sm:py-16">
        <section id="platform" className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/[0.12] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-orange-900 shadow-sm dark:border-orange-400/25 dark:bg-orange-500/[0.14] dark:text-orange-100">
              <Sparkles className="size-3.5 shrink-0 text-orange-600 dark:text-orange-300" aria-hidden />
              Unified sign-in
            </div>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight text-zinc-900 sm:text-5xl dark:text-white">
              One login.
              <br />
              <span className="bg-gradient-to-r from-orange-600 to-amber-500 bg-clip-text text-transparent dark:from-orange-400 dark:to-amber-300">
                The right desk for you.
              </span>
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              Staff, admins, and company users all authenticate at the same place. After you sign in, AGCTek routes you to
              the workspace that matches your account, with company-based routing and confirmation-driven closure.
            </p>
            <div className="mt-8 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/signin"
                  className="group inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_28px_rgba(234,88,12,0.35)] transition hover:bg-orange-500 hover:shadow-[0_10px_32px_rgba(234,88,12,0.42)] dark:shadow-[0_8px_28px_rgba(234,88,12,0.25)]"
                >
                  Sign in
                  <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden />
                </Link>
                <a
                  href="#access"
                  className="text-sm font-semibold text-zinc-600 underline-offset-4 transition hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  How routing works
                </a>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-500">
                  New here? Create your company account in one step
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <Link
                    href="/signup"
                    className="inline-flex items-center rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-800 shadow-sm transition hover:border-orange-300 hover:bg-orange-50/80 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-orange-500/40 dark:hover:bg-zinc-800"
                  >
                    Create account
                  </Link>
                  <a
                    href="#workflow"
                    className="inline-flex items-center rounded-lg border border-dashed border-zinc-300 px-3.5 py-2 text-xs font-semibold text-zinc-600 transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-900/60"
                  >
                    View workflow
                  </a>
                </div>
              </div>
            </div>
          </div>
          <div className="relative rounded-3xl border border-zinc-200 bg-[radial-gradient(130%_92%_at_10%_8%,rgba(249,115,22,0.22),transparent_52%),radial-gradient(100%_90%_at_95%_92%,rgba(14,165,233,0.14),transparent_58%),linear-gradient(180deg,#eef2ff_0%,#ffffff_100%)] p-6 shadow-[0_16px_48px_rgba(0,0,0,0.08)] dark:border-zinc-800 dark:bg-[radial-gradient(130%_92%_at_10%_8%,rgba(249,115,22,0.24),transparent_52%),radial-gradient(100%_90%_at_95%_92%,rgba(14,165,233,0.16),transparent_58%),linear-gradient(180deg,#0b1428_0%,#0a1326_100%)] dark:shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
            <p className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-500">
              Same entry for everyone
            </p>
            <div className="mt-5 rounded-2xl border border-zinc-200/90 bg-white/90 p-5 backdrop-blur-sm dark:border-zinc-700/90 dark:bg-zinc-950/60">
              <div className="flex flex-col items-center">
                <div className="flex w-full max-w-[220px] items-center justify-center gap-2 rounded-xl border-2 border-orange-500/45 bg-gradient-to-b from-orange-500/15 to-orange-500/[0.06] px-4 py-3 dark:from-orange-500/20 dark:to-orange-500/[0.08]">
                  <LogIn className="size-5 shrink-0 text-orange-600 dark:text-orange-400" aria-hidden />
                  <div className="text-left">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-orange-700 dark:text-orange-300">One URL</p>
                    <p className="text-sm font-bold text-zinc-900 dark:text-white">/signin</p>
                  </div>
                </div>
                <div className="my-2 h-8 w-px bg-gradient-to-b from-orange-400/70 via-zinc-300 to-zinc-200 dark:via-zinc-600 dark:to-zinc-800" aria-hidden />
                <div className="grid w-full grid-cols-3 gap-2 sm:gap-3">
                  {[
                    { label: "Queue", sub: "Agents", Icon: Users },
                    { label: "Console", sub: "Admins", Icon: Shield },
                    { label: "Portal", sub: "Customers", Icon: Building2 },
                  ].map(({ label, sub, Icon }) => (
                    <div
                      key={label}
                      className="rounded-xl border border-zinc-200 bg-zinc-50/90 px-2 py-3 text-center dark:border-zinc-700/80 dark:bg-zinc-900/50"
                    >
                      <Icon className="mx-auto size-4 text-orange-600 dark:text-orange-400" aria-hidden />
                      <p className="mt-2 text-[11px] font-bold text-zinc-900 dark:text-zinc-100">{label}</p>
                      <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                        {sub}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-4 text-center text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
                Your role decides the dashboard. Same sign-in and same registration screen for everyone.
              </p>
            </div>
          </div>
        </section>

        <section id="access" className="scroll-mt-24 rounded-3xl border border-zinc-200 bg-white/80 px-5 py-8 shadow-sm backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/40 sm:px-8 sm:py-10">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-orange-700 dark:text-orange-400">Access model</p>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl dark:text-white">
              Sign in once. We place you in the correct experience.
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Registration uses one screen: you choose staff or company, then we collect the right fields. Authentication
              stays unified—everyone uses <span className="font-semibold text-zinc-800 dark:text-zinc-200">/signin</span>.
            </p>
          </div>
          <div className="mx-auto mt-8 grid max-w-4xl gap-4 sm:grid-cols-3">
            {[
              {
                step: "01",
                title: "Authenticate",
                body: "Username or email and password—or Google where configured—at a single sign-in screen.",
                Icon: LogIn,
              },
              {
                step: "02",
                title: "Role routing",
                body: "Customers land in the portal; agents and heads see the queue; admins retain oversight tools.",
                Icon: Users,
              },
              {
                step: "03",
                title: "Same trust layer",
                body: "Tickets, SLAs, escalations, and verification flows stay consistent across every account type.",
                Icon: Shield,
              },
            ].map(({ step, title, body, Icon }) => (
              <article
                key={step}
                className="relative rounded-2xl border border-zinc-200 bg-[linear-gradient(165deg,rgba(255,255,255,0.95),rgba(248,250,252,0.88))] p-5 dark:border-zinc-700/80 dark:bg-[linear-gradient(165deg,rgba(15,23,42,0.5),rgba(9,12,24,0.65))]"
              >
                <span className="text-[10px] font-bold tabular-nums text-orange-600 dark:text-orange-400">{step}</span>
                <div className="mt-3 flex size-10 items-center justify-center rounded-xl bg-orange-500/15 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300">
                  <Icon className="size-5" aria-hidden />
                </div>
                <h3 className="mt-3 text-sm font-bold text-zinc-900 dark:text-white">{title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="principles">
          <p className="text-center text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">Core principles</p>
          <h2 className="mt-2 text-center text-2xl font-bold text-zinc-900 dark:text-white">
            The Three Pillars of AGC Operations
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              ["Radical Focus", "Prioritize ticket signal over noise. SATS flow and triage windows protect calm operations."],
              ["Manual Precision", "Operator-assigned controls with disciplined workflows built for systemic challenge."],
              ["Systemic Health", "Built for longevity and support readiness with deeply auditable ticket trails."],
            ].map(([title, body]) => (
              <article
                key={title}
                className="rounded-2xl border border-zinc-200 bg-[radial-gradient(120%_90%_at_12%_0%,rgba(249,115,22,0.10),transparent_56%),radial-gradient(110%_90%_at_100%_100%,rgba(14,165,233,0.06),transparent_64%),linear-gradient(180deg,rgba(255,255,255,0.95),rgba(248,250,252,0.90))] p-5 dark:border-zinc-800 dark:bg-[radial-gradient(120%_90%_at_12%_0%,rgba(249,115,22,0.12),transparent_56%),radial-gradient(110%_90%_at_100%_100%,rgba(14,165,233,0.10),transparent_64%),linear-gradient(180deg,rgba(11,18,32,0.95),rgba(8,14,26,0.90))]"
              >
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="workflow" className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-2xl border border-zinc-200 bg-[radial-gradient(126%_92%_at_10%_0%,rgba(249,115,22,0.12),transparent_55%),radial-gradient(110%_90%_at_100%_100%,rgba(14,165,233,0.08),transparent_64%),linear-gradient(180deg,rgba(255,255,255,0.95),rgba(248,250,252,0.90))] p-6 dark:border-zinc-800 dark:bg-[radial-gradient(126%_92%_at_10%_0%,rgba(249,115,22,0.14),transparent_55%),radial-gradient(110%_90%_at_100%_100%,rgba(14,165,233,0.12),transparent_64%),linear-gradient(180deg,rgba(11,18,32,0.95),rgba(8,14,26,0.90))]">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
              The Workflow of the <span className="text-orange-600 dark:text-orange-400">Disciplined</span>
            </h2>
            <ol className="mt-5 space-y-3 text-sm">
              <li className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">1. The Kanban Sanctuary</p>
                <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                  A single source of queue truth across open, in progress, pending info, and escalations.
                </p>
              </li>
              <li className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">2. Focused Incident Resolution</p>
                <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                  Tickets route by category and assignee ownership with clear visibility.
                </p>
              </li>
              <li className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">3. Asymmetric Insight</p>
                <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                  Built-in audit + feedback verification flow that keeps closure accountable.
                </p>
              </li>
            </ol>
          </article>
          <article className="space-y-3 rounded-2xl border border-zinc-200 bg-[radial-gradient(126%_92%_at_12%_0%,rgba(14,165,233,0.10),transparent_58%),radial-gradient(110%_90%_at_100%_100%,rgba(249,115,22,0.07),transparent_64%),linear-gradient(180deg,rgba(255,255,255,0.95),rgba(248,250,252,0.90))] p-6 dark:border-zinc-800 dark:bg-[radial-gradient(126%_92%_at_12%_0%,rgba(14,165,233,0.14),transparent_58%),radial-gradient(110%_90%_at_100%_100%,rgba(249,115,22,0.10),transparent_64%),linear-gradient(180deg,rgba(11,18,32,0.95),rgba(8,14,26,0.90))]">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-200">Database latency in cluster Alpha-7</p>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-500">Ticket #INC-204</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-200">API tier limit refinement</p>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-500">Ticket #OPS-318</p>
            </div>
          </article>
        </section>

        <section className="rounded-3xl border border-zinc-200 bg-[radial-gradient(130%_92%_at_50%_0%,rgba(249,115,22,0.14),transparent_58%),radial-gradient(100%_90%_at_50%_100%,rgba(14,165,233,0.10),transparent_64%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.90))] p-8 text-center dark:border-zinc-800 dark:bg-[radial-gradient(130%_92%_at_50%_0%,rgba(249,115,22,0.16),transparent_58%),radial-gradient(100%_90%_at_50%_100%,rgba(14,165,233,0.13),transparent_64%),linear-gradient(180deg,rgba(11,18,32,0.96),rgba(8,14,26,0.90))]">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
            Trusted by teams practicing deep work
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-6 text-xs font-semibold tracking-wide text-zinc-600 dark:text-zinc-400">
            <span>AETHELFLAED</span>
            <span>HYPERION</span>
            <span>VIRTUE.CO</span>
            <span>ZENITH</span>
            <span>LOGOS</span>
          </div>
        </section>

        <section
          id="pricing"
          className="scroll-mt-24 overflow-hidden rounded-3xl border border-orange-400/45 bg-gradient-to-b from-orange-500/20 via-orange-500/12 to-transparent p-8 text-center dark:border-orange-500/35 dark:from-orange-500/15 dark:via-orange-500/10 dark:to-transparent sm:p-10"
        >
          <div className="mx-auto max-w-2xl">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-white/90 shadow-sm dark:bg-zinc-900/80">
              <LogIn className="size-6 text-orange-600 dark:text-orange-400" aria-hidden />
            </div>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">
              Ready when you are
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-800 dark:text-zinc-300">
              Use <span className="font-semibold text-zinc-900 dark:text-white">/signin</span> for every account. Company
              users can register at <span className="font-semibold text-zinc-900 dark:text-white">/signup</span>. Staff
              accounts are created by an administrator.
            </p>
          </div>
          <div className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row sm:items-stretch sm:justify-center sm:gap-3">
            <Link
              href="/signin"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-orange-500 sm:flex-initial sm:min-w-[140px]"
            >
              Sign in
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link
              href="/signup"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 sm:flex-initial sm:min-w-[160px]"
            >
              Create account
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-200 bg-[radial-gradient(90%_120%_at_0%_0%,rgba(249,115,22,0.08),transparent_62%),radial-gradient(90%_120%_at_100%_100%,rgba(14,165,233,0.08),transparent_64%),linear-gradient(90deg,rgba(255,255,255,0.90),rgba(248,250,252,0.76))] dark:border-zinc-800 dark:bg-[radial-gradient(90%_120%_at_0%_0%,rgba(249,115,22,0.12),transparent_62%),radial-gradient(90%_120%_at_100%_100%,rgba(14,165,233,0.12),transparent_64%),linear-gradient(90deg,rgba(7,13,25,0.90),rgba(11,18,32,0.76))]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-[11px] text-zinc-600 dark:text-zinc-500">
          <p>AGCTek Help Desk · 2026</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-zinc-900 dark:hover:text-zinc-300">
              Privacy Policy
            </a>
            <a href="#" className="hover:text-zinc-900 dark:hover:text-zinc-300">
              Terms of Service
            </a>
            <a href="#" className="hover:text-zinc-900 dark:hover:text-zinc-300">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
