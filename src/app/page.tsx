import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, LogIn, Shield, Users } from "lucide-react";
import { LandingAccessVisual } from "@/components/landing/LandingAccessVisual";
import { LandingHeroVisual } from "@/components/landing/LandingHeroVisual";
import { LandingWorkflowVisual } from "@/components/landing/LandingWorkflowVisual";
import { LandingGallery } from "@/components/landing/LandingGallery";
import { TaskCommandLanding } from "@/components/landing/TaskCommandLanding";
import type { TicketPriority, TicketStatus } from "@prisma/client/primary";
import { CustomerHomeDashboard } from "@/components/portal/CustomerHomeDashboard";
import { RecentActivityPanel } from "@/components/dashboard/RecentActivityPanel";
import { BrandLockup } from "@/components/BrandLockup";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import {
  customerHasPendingResolvedTicket,
  customerPendingTicketHref,
  listTicketsAwaitingCustomerConfirmation,
} from "@/lib/customer-pending-resolution";
import { prisma } from "@/lib/prisma";
import { BRAND_TITLE } from "@/lib/brand";
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

  if (session?.user?.role === "Personnel") {
    redirect("/agent");
  }

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

  if (session?.user?.role === "SuperAdmin" || session?.user?.role === "Admin") {
    const adminEmail = (session.user.email ?? "").trim().toLowerCase();
    const pendingRequestorTickets = adminEmail
      ? await listTicketsAwaitingCustomerConfirmation(adminEmail, session.user.authProvider)
      : [];

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
      prisma.ticket.count({ where: { createdAt: { gte: yesterday } } }),
      prisma.ticket.count({
        where: {
          status: { in: ["FOR_CONFIRMATION", "RESOLVED", "CLOSED"] },
          resolvedAt: { gte: yesterday },
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

    return (
      <main className="min-h-[calc(100vh-56px)] bg-zinc-50 px-3 py-6 text-zinc-900 sm:px-4 sm:py-8 dark:bg-[#070d19] dark:text-zinc-100">
        <div className="mx-auto max-w-6xl space-y-6">
          <header className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-700 dark:text-orange-400/95">
                {BRAND_TITLE} Â· Ticket dashboard
              </p>
              <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl md:text-4xl dark:text-white">
                Operational Oversight
              </h1>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {now.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })} Â·{" "}
                {now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              {pendingRequestorTickets.length > 0 ? (
                <Link
                  href="/my-requests"
                  className="inline-flex justify-center rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-4 py-2 text-center text-sm font-semibold text-emerald-950 shadow-sm transition hover:bg-emerald-500/25 dark:text-emerald-100"
                >
                  Confirm {pendingRequestorTickets.length} request
                  {pendingRequestorTickets.length === 1 ? "" : "s"}
                </Link>
              ) : null}
              <Link
                href="/my-requests"
                className="inline-flex justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-center text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                My requests
              </Link>
              <Link
                href="/agent"
                className="inline-flex justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-center text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Ticket Queue
              </Link>
              <Link
                href="/admin/ticket-requests"
                className="inline-flex justify-center rounded-lg bg-orange-600 px-4 py-2 text-center text-sm font-semibold text-white shadow-[0_10px_28px_rgba(234,88,12,0.28)] transition hover:bg-orange-500"
              >
                Create requests
              </Link>
            </div>
          </header>

          {pendingRequestorTickets.length > 0 ? (
            <section className="rounded-2xl border border-emerald-500/35 bg-gradient-to-br from-emerald-500/12 via-white to-white p-5 shadow-sm dark:border-emerald-500/30 dark:from-emerald-500/10 dark:via-[#0b1220] dark:to-[#0b1220]">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-800 dark:text-emerald-300">
                Action required
              </p>
              <h2 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                {pendingRequestorTickets.length} of your submitted ticket
                {pendingRequestorTickets.length === 1 ? " needs" : "s need"} confirmation
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Verify the resolution and submit your star rating to close each request.
              </p>
              <ul className="mt-4 space-y-2">
                {pendingRequestorTickets.slice(0, 4).map((ticket) => (
                  <li key={ticket.id}>
                    <Link
                      href={customerPendingTicketHref(ticket)}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/25 bg-white/80 px-4 py-3 text-sm transition hover:border-emerald-500/50 hover:bg-emerald-50/60 dark:border-emerald-500/20 dark:bg-zinc-950/40 dark:hover:bg-emerald-500/10"
                    >
                      <span className="font-mono text-xs font-bold text-emerald-800 dark:text-emerald-300">
                        {ticket.ticketNumber}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium text-zinc-900 dark:text-zinc-100">
                        {ticket.title}
                      </span>
                      <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                        Confirm →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {pendingRequestorTickets.length > 4 ? (
                <Link
                  href="/my-requests"
                  className="mt-3 inline-block text-sm font-semibold text-emerald-800 hover:underline dark:text-emerald-300"
                >
                  View all on My requests
                </Link>
              ) : null}
            </section>
          ) : null}

          <section className="grid gap-4 md:grid-cols-3">
            <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-[#0b1220]">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Open Tickets</p>
              <p className="mt-3 text-3xl font-bold leading-none text-zinc-900 sm:text-4xl md:text-5xl dark:text-zinc-100">{openTickets}</p>
            </article>
            <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-[#0b1220]">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Avg. Response</p>
              <p className="mt-3 text-3xl font-bold leading-none text-zinc-900 sm:text-4xl md:text-5xl dark:text-zinc-100">{formatResponseDuration(avgMins)}</p>
            </article>
            <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-[#0b1220]">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Resolution Rate</p>
              <p className="mt-3 text-3xl font-bold leading-none text-zinc-900 sm:text-4xl md:text-5xl dark:text-zinc-100">
                {resolutionRate.toFixed(1)}%
              </p>
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

  if (!session?.user) {
    return <TaskCommandLanding />;
  }

  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_50%_at_15%_0%,color-mix(in_srgb,var(--brand)_12%,transparent),transparent_55%)] dark:bg-[radial-gradient(70%_50%_at_15%_0%,color-mix(in_srgb,var(--brand)_18%,transparent),transparent_55%)]"
      />
      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:py-3.5">
          <BrandLockup variant="landing-header" href="/" />
          <nav className="hidden items-center gap-5 text-xs font-medium text-muted md:flex">
            <a href="#platform" className="transition hover:text-foreground">
              Platform
            </a>
            <a href="#access" className="transition hover:text-foreground">
              Access
            </a>
            <a href="#principles" className="transition hover:text-foreground">
              Principles
            </a>
            <a href="#workflow" className="transition hover:text-foreground">
              Workflow
            </a>
            <a href="#pricing" className="transition hover:text-foreground">
              Get started
            </a>
          </nav>
          <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
            <ThemeToggle />
            <div className="flex items-center gap-2 rounded-[var(--radius-stoic)] border border-border bg-surface p-0.5 shadow-sm">
              <Link
                href="/signin"
                className="stoic-btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:px-3.5"
              >
                <LogIn className="size-3.5 shrink-0 opacity-95" aria-hidden />
                Sign in
              </Link>
              <Link
                href="/signup"
                className="rounded-[var(--radius-stoic)] px-2.5 py-1.5 text-xs font-semibold text-muted transition hover:bg-surface-muted hover:text-foreground sm:px-3"
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
            <p className="stoic-label">
              Access model
            </p>
            <h1 className="mt-4 text-4xl font-extrabold leading-[1.08] tracking-tight text-foreground sm:text-5xl">
              Sign in once.
              <br />
              We place you in the correct experience.
            </h1>
            <div className="mt-8 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/signin"
                  className="stoic-btn-primary group inline-flex items-center gap-2 px-5 py-2.5 text-sm shadow-[0_8px_28px_color-mix(in_srgb,var(--brand)_35%,transparent)]"
                >
                  Sign in
                  <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden />
                </Link>
                <a
                  href="#access"
                  className="text-sm font-semibold text-muted underline-offset-4 transition hover:text-foreground hover:underline"
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
          <LandingHeroVisual />
        </section>

        <section id="access" className="stoic-card scroll-mt-24 px-5 py-8 sm:px-8 sm:py-10">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-orange-700 dark:text-orange-400">Access model</p>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl dark:text-white">
              Sign in once. We place you in the correct experience.
            </h2>
          </div>
          <LandingAccessVisual />
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
            ].map(({ step, title, Icon }) => (
              <article
                key={step}
                className="stoic-card relative bg-surface-elevated p-5"
              >
                <span className="text-[10px] font-bold tabular-nums text-orange-600 dark:text-orange-400">{step}</span>
                <div className="mt-3 flex size-10 items-center justify-center rounded-xl bg-orange-500/15 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300">
                  <Icon className="size-5" aria-hidden />
                </div>
                <h3 className="mt-3 text-sm font-bold text-zinc-900 dark:text-white">{title}</h3>
              </article>
            ))}
          </div>
        </section>

        <section id="principles">
          <p className="stoic-label text-center">| Core principles</p>
          <h2 className="mt-2 text-center text-2xl font-bold text-foreground">
            The Three Pillars of AGC Operations
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              ["Radical Focus", "Prioritize ticket signal over noise. SATS flow and triage windows protect calm operations."],
              ["Manual Precision", "Operator-assigned controls with disciplined workflows built for systemic challenge."],
              ["Systemic Health", "Built for longevity and support readiness with deeply auditable ticket trails."],
            ].map(([title]) => (
              <article
                key={title}
                className="stoic-card p-5"
              >
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
              </article>
            ))}
          </div>
        </section>

        <section id="workflow" className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="stoic-card p-6">
            <h2 className="text-2xl font-bold text-foreground">
              The Workflow of the <span className="text-brand underline decoration-brand decoration-2 underline-offset-4">Disciplined</span>
            </h2>
            <ol className="mt-5 space-y-3 text-sm">
              <li className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">1. The Kanban Sanctuary</p>
              </li>
              <li className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">2. Focused Incident Resolution</p>
              </li>
              <li className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">3. Asymmetric Insight</p>
              </li>
            </ol>
          </article>
          <LandingWorkflowVisual />
        </section>

        <LandingGallery />

        <section
          id="pricing"
          className="stoic-card-elevated scroll-mt-24 p-8 text-center sm:p-10"
        >
          <div className="mx-auto max-w-2xl">
            <div className="mx-auto flex size-12 items-center justify-center rounded-[var(--radius-stoic-lg)] border border-border bg-surface shadow-sm">
              <LogIn className="size-6 text-brand" aria-hidden />
            </div>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Ready when you are.
            </h2>
          </div>
          <div className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row sm:items-stretch sm:justify-center sm:gap-3">
            <Link
              href="/signin"
              className="stoic-btn-primary inline-flex flex-1 items-center justify-center gap-2 px-5 py-3 text-sm sm:flex-initial sm:min-w-[140px]"
            >
              Sign in now
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link
              href="/signup"
              className="stoic-btn-outline inline-flex flex-1 items-center justify-center gap-2 px-5 py-3 text-sm sm:flex-initial sm:min-w-[160px]"
            >
              Create account
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-[11px] text-muted">
          <p>AGCTek Help Desk Â· 2026</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-foreground">
              Privacy Policy
            </a>
            <a href="#" className="hover:text-foreground">
              Terms of Service
            </a>
            <a href="#" className="hover:text-foreground">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
