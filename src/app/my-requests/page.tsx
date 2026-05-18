import type { TicketPriority, TicketStatus } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { AssigneeColorHighlight } from "@/components/ticket/AssigneeColorHighlight";
import { AssigneeInitialsBadge } from "@/components/ticket/AssigneeInitialsBadge";
import { requireSession } from "@/lib/access";
import {
  customerHasPendingResolvedTicket,
  customerPendingTicketHref,
} from "@/lib/customer-pending-resolution";
import { loadStaffAssignmentColorsForAgents } from "@/lib/assignee-assignment-color";
import { BRAND_TITLE } from "@/lib/brand";
import { cn } from "@/lib/cn";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type ColumnId = "open" | "inProgress" | "forConfirmation";

type ColumnDef = {
  id: ColumnId;
  title: string;
  description: string;
  match: (s: TicketStatus) => boolean;
  /** Tailwind tone token for the column header chip. */
  tone:
    | { dot: string; label: string; ring: string };
};

const COLUMNS: ColumnDef[] = [
  {
    id: "open",
    title: "Open",
    description: "New requests waiting to be picked up.",
    match: (s) => s === "OPEN",
    tone: {
      dot: "bg-orange-500",
      label: "text-orange-800 dark:text-orange-300",
      ring: "ring-orange-500/30",
    },
  },
  {
    id: "inProgress",
    title: "In progress",
    description: "Being worked on or waiting on more info.",
    match: (s) => s === "IN_PROGRESS" || s === "PENDING_INFO" || s === "ESCALATED",
    tone: {
      dot: "bg-amber-500",
      label: "text-amber-800 dark:text-amber-300",
      ring: "ring-amber-500/30",
    },
  },
  {
    id: "forConfirmation",
    title: "For confirmation",
    description: "Resolved by support · awaiting your sign-off.",
    match: (s) => s === "FOR_CONFIRMATION" || s === "RESOLVED",
    tone: {
      dot: "bg-emerald-500",
      label: "text-emerald-800 dark:text-emerald-300",
      ring: "ring-emerald-500/30",
    },
  },
];

function firstQuery(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function statusPillClass(status: TicketStatus) {
  if (status === "ESCALATED")
    return "bg-rose-500/15 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200";
  if (status === "IN_PROGRESS")
    return "bg-amber-500/15 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200";
  if (status === "PENDING_INFO")
    return "bg-zinc-300 text-zinc-800 dark:bg-zinc-700/70 dark:text-zinc-200";
  if (status === "OPEN")
    return "bg-orange-500/15 text-orange-900 dark:bg-orange-500/20 dark:text-orange-200";
  if (status === "FOR_CONFIRMATION" || status === "RESOLVED")
    return "bg-emerald-500/15 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200";
  return "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200";
}

function priorityPillClass(priority: TicketPriority) {
  if (priority === "URGENT")
    return "border-rose-400/60 bg-rose-500/15 text-rose-900 dark:bg-rose-500/20 dark:text-rose-200";
  if (priority === "HIGH")
    return "border-orange-400/60 bg-orange-500/15 text-orange-900 dark:bg-orange-500/20 dark:text-orange-200";
  if (priority === "MEDIUM")
    return "border-amber-300/70 bg-amber-500/10 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200";
  if (priority === "LOW")
    return "border-emerald-400/60 bg-emerald-500/10 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200";
  return "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300";
}

function priorityLabel(priority: TicketPriority) {
  if (priority === "UNSET") return "Set priority";
  return priority.charAt(0) + priority.slice(1).toLowerCase();
}

function statusLabel(status: TicketStatus) {
  switch (status) {
    case "FOR_CONFIRMATION":
      return "Awaiting sign-off";
    case "PENDING_INFO":
      return "Pending info";
    case "IN_PROGRESS":
      return "In progress";
    case "ESCALATED":
      return "Transfer pending";
    case "RESOLVED":
      return "Resolved";
    case "OPEN":
      return "Open";
    case "CLOSED":
      return "Closed";
    default:
      return String(status).replaceAll("_", " ");
  }
}

function relativeTime(d: Date) {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString();
}

export default async function MyRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; submitted?: string | string[] }>;
}) {
  const session = await requireSession();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "Personnel") redirect("/");

  const me = (session.user.email ?? "").trim().toLowerCase();
  if (!me) redirect("/");

  const params = await searchParams;
  const query = firstQuery(params.q)?.trim() ?? "";
  const submitted = firstQuery(params.submitted) === "1";

  const baseFilter = {
    OR: [
      { contactEmail: { equals: me, mode: "insensitive" as const } },
      { requestorEmail: { equals: me, mode: "insensitive" as const } },
    ],
  };

  const where = query
    ? {
        AND: [
          baseFilter,
          {
            OR: [
              { ticketNumber: { contains: query, mode: "insensitive" as const } },
              { title: { contains: query, mode: "insensitive" as const } },
            ],
          },
        ],
      }
    : baseFilter;

  const tickets = await prisma.ticket.findMany({
    where,
    orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
    include: { team: true, assignedAgent: true },
    take: 200,
  });

  const assigneeColorByEmail =
    tickets.length > 0
      ? await loadStaffAssignmentColorsForAgents(
          tickets.map((t) => ({ email: t.assignedAgent?.email, name: t.assignedAgent?.name })),
        )
      : new Map<string, string | null>();

  const counts = {
    total: tickets.length,
    open: tickets.filter((t) => t.status === "OPEN").length,
    inProgress: tickets.filter(
      (t) => t.status === "IN_PROGRESS" || t.status === "PENDING_INFO" || t.status === "ESCALATED",
    ).length,
    forConfirmation: tickets.filter(
      (t) => t.status === "FOR_CONFIRMATION" || t.status === "RESOLVED",
    ).length,
    closed: tickets.filter((t) => t.status === "CLOSED").length,
  };

  const intakeBlock = await customerHasPendingResolvedTicket(me, session.user.authProvider);

  return (
    <main className="min-h-[calc(100vh-56px)] bg-zinc-50 px-3 py-5 text-zinc-900 dark:bg-[#070d19] dark:text-zinc-100 sm:px-5 md:py-8">
      <div className="mx-auto flex max-w-[min(100%,1480px)] flex-col gap-5">
        {submitted ? (
          <div className="rounded-xl border border-orange-400/50 bg-orange-500/15 px-4 py-3 text-sm text-orange-950 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-200">
            Ticket submitted successfully. It appears below in your dashboard.
          </div>
        ) : null}
        {/* Hero */}
        <header className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-white via-white to-orange-50/40 p-5 shadow-[0_12px_36px_rgba(0,0,0,0.05)] dark:border-zinc-800/90 dark:from-[#0d1629] dark:via-[#0b1322] dark:to-[#0b1322] dark:shadow-[0_18px_48px_rgba(0,0,0,0.35)] md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-orange-700 dark:text-orange-400/95">
                {BRAND_TITLE} · Personnel
              </p>
              <h1 className="mt-1.5 text-[1.7rem] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-[2rem]">
                Ticket dashboard
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                Track every request you&apos;ve submitted &mdash; from the moment it&apos;s opened, through the team&apos;s
                progress, to the final confirmation step. Click any card to open the conversation.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <form
                method="get"
                action="/my-requests"
                className="relative hidden w-[260px] sm:block"
              >
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500 dark:text-zinc-500" />
                <input
                  type="search"
                  name="q"
                  defaultValue={query}
                  placeholder="Search ticket # or title"
                  className="h-10 w-full rounded-lg border border-zinc-300 bg-white pl-9 pr-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-500 focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/25 dark:border-zinc-700/70 dark:bg-zinc-900/55 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                />
              </form>
              {intakeBlock != null ? (
                <Link
                  href={customerPendingTicketHref(intakeBlock)}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/15 px-4 text-sm font-semibold text-amber-950 shadow-sm transition hover:bg-amber-500/25 dark:text-amber-100"
                  title="Finish this request before opening another."
                >
                  <Plus className="size-4" aria-hidden />
                  Resume {intakeBlock.ticketNumber}
                </Link>
              ) : (
                <Link
                  href="/tickets/new"
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#f97316] px-4 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(249,115,22,0.32)] transition hover:bg-[#fb923c] active:translate-y-px"
                >
                  <Plus className="size-4" />
                  Create ticket
                </Link>
              )}
            </div>
          </div>

          {/* Mobile search */}
          <form method="get" action="/my-requests" className="mt-4 sm:hidden">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="search"
                name="q"
                defaultValue={query}
                placeholder="Search ticket # or title"
                className="h-10 w-full rounded-lg border border-zinc-300 bg-white pl-9 pr-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-500 focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/25 dark:border-zinc-700/70 dark:bg-zinc-900/55 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
            </div>
          </form>

          {query ? (
            <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
              Filtering by &ldquo;<span className="font-medium text-zinc-800 dark:text-zinc-200">{query}</span>&rdquo;.{" "}
              <Link href="/my-requests" className="font-semibold text-orange-700 hover:underline dark:text-orange-400">
                Clear
              </Link>
            </p>
          ) : null}
        </header>

        {/* Stat tiles */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Total" value={counts.total} sub={query ? "matching results" : "all my tickets"} accent={false} />
          <StatTile label="Open" value={counts.open} sub="Awaiting pickup" accent="orange" />
          <StatTile label="In progress" value={counts.inProgress} sub="Being worked on" accent="amber" />
          <StatTile label="For confirmation" value={counts.forConfirmation} sub="Awaiting your sign-off" accent="emerald" />
        </section>

        {/* Kanban */}
        <section className="-mx-1 grid gap-4 px-1 md:mx-0 md:px-0 md:grid-cols-3">
          {COLUMNS.map((col) => {
            const list = tickets.filter((t) => col.match(t.status));
            return (
              <div
                key={col.id}
                className={cn(
                  "flex min-h-[280px] flex-col rounded-2xl border border-zinc-200 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.04)] dark:border-zinc-800/90 dark:bg-[#0c1525] dark:shadow-[0_14px_36px_rgba(0,0,0,0.32)]",
                )}
              >
                <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800/80">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className={cn("size-2.5 shrink-0 rounded-full ring-4", col.tone.dot, col.tone.ring)} />
                    <div className="min-w-0">
                      <h2
                        className={cn(
                          "text-[11px] font-bold uppercase tracking-[0.18em]",
                          col.tone.label,
                        )}
                      >
                        {col.title}
                      </h2>
                      <p className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-500">
                        {col.description}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-300">
                    {list.length}
                  </span>
                </div>
                <div className="flex max-h-[min(60vh,640px)] min-h-[160px] flex-col gap-2.5 overflow-y-auto p-3">
                  {list.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-zinc-200 px-3 py-8 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-500">
                      {col.id === "open"
                        ? "No open tickets. Submit a request to get started."
                        : col.id === "inProgress"
                          ? "Nothing being worked on right now."
                          : "Nothing waiting on your confirmation."}
                    </div>
                  ) : (
                    list.map((t) => {
                      const assigneeKey = t.assignedAgent?.email
                        ? (assigneeColorByEmail.get(t.assignedAgent.email.trim().toLowerCase()) ?? null)
                        : null;
                      return (
                      <AssigneeColorHighlight
                        key={t.id}
                        assigneeColorKey={assigneeKey}
                        className="group block rounded-xl border border-zinc-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-orange-400/60 hover:bg-orange-50/40 hover:shadow-md dark:border-zinc-700/80 dark:bg-[#0f172a] dark:hover:border-orange-500/40 dark:hover:bg-[#111c33]"
                      >
                      <Link
                        href={`/tickets/${t.id}`}
                        className="block p-3.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-mono text-[11px] font-bold text-orange-700 dark:text-orange-300">
                            {t.ticketNumber}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                              statusPillClass(t.status),
                            )}
                          >
                            {statusLabel(t.status)}
                          </span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm font-semibold text-zinc-900 transition group-hover:text-orange-900 dark:text-zinc-100 dark:group-hover:text-orange-100">
                          {t.title}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span
                            className={cn(
                              "inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold",
                              priorityPillClass(t.priority),
                            )}
                          >
                            {priorityLabel(t.priority)}
                          </span>
                          {t.team?.name ? (
                            <span className="inline-flex rounded-md border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300">
                              {t.team.name}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-zinc-600 dark:text-zinc-400">
                          <span className="flex min-w-0 items-center gap-1.5 truncate">
                            {t.assignedAgent?.name ? (
                              <>
                                <AssigneeInitialsBadge
                                  agentName={t.assignedAgent.name}
                                  assigneeColorKey={assigneeKey}
                                  className="shrink-0"
                                />
                                <span className="truncate">
                                  Assigned:{" "}
                                  <span className="font-medium text-zinc-800 dark:text-zinc-200">{t.assignedAgent.name}</span>
                                </span>
                              </>
                            ) : (
                              <span className="text-zinc-500">No assignee yet</span>
                            )}
                          </span>
                          <span className="shrink-0 text-zinc-500 dark:text-zinc-500">
                            {relativeTime(t.updatedAt)}
                          </span>
                        </div>
                      </Link>
                      </AssigneeColorHighlight>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </section>

        {/* Closed footnote */}
        {counts.closed > 0 ? (
          <p className="text-[11px] text-zinc-600 dark:text-zinc-500">
            {counts.closed} closed ticket{counts.closed === 1 ? "" : "s"} not shown.{" "}
            <Link
              href="/my-tickets"
              className="font-semibold text-orange-700 hover:underline dark:text-orange-400"
            >
              View full history
            </Link>
          </p>
        ) : null}
      </div>
    </main>
  );
}

function StatTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number;
  sub: string;
  accent: false | "orange" | "amber" | "emerald";
}) {
  const valueClass =
    accent === "orange"
      ? "text-orange-700 dark:text-orange-300"
      : accent === "amber"
        ? "text-amber-700 dark:text-amber-300"
        : accent === "emerald"
          ? "text-emerald-700 dark:text-emerald-300"
          : "text-zinc-900 dark:text-zinc-100";
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800/90 dark:bg-[#0c1525]">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-600 dark:text-zinc-500">
        {label}
      </p>
      <p className={cn("mt-1 text-3xl font-semibold tabular-nums", valueClass)}>{value}</p>
      <p className="mt-0.5 text-[11px] text-zinc-600 dark:text-zinc-500">{sub}</p>
    </div>
  );
}
