import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/access";
import { computeKpis, parseKpiRangeFromQuery } from "@/lib/kpis";
import { prisma } from "@/lib/prisma";
import { BRAND_TITLE } from "@/lib/brand";
import { resolveStaffCompanyTeamId } from "@/lib/staff-company-scope";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const session = await requireSession();
  if (!session?.user) redirect("/signin");
  if (!["SuperAdmin", "Admin"].includes(session.user.role)) redirect("/");

  const { from, to } = parseKpiRangeFromQuery(null, null);
  const scopedTeamId =
    session.user.role === "Admin" ? await resolveStaffCompanyTeamId(session.user.email) : null;
  const reportScopeWhere: Prisma.TicketWhereInput =
    session.user.role === "Admin" ? { teamId: scopedTeamId ?? "__none__" } : {};
  const kpiScope = session.user.role === "Admin" ? { teamId: scopedTeamId ?? "__none__" } : {};
  const resolvedScopeSql =
    session.user.role === "Admin"
      ? Prisma.sql`AND "teamId" = ${scopedTeamId ?? "__none__"}`
      : Prisma.empty;

  const [kpis, transferPending, openByPriority, resolvedToday, statusMix, openByTeam, recentClosed] = await Promise.all([
    computeKpis({ from, to }, kpiScope),
    prisma.ticket.count({ where: { status: "ESCALATED", ...reportScopeWhere } }),
    prisma.ticket.groupBy({
      by: ["priority"],
      where: { status: { in: ["OPEN", "IN_PROGRESS", "PENDING_INFO", "ESCALATED"] }, ...reportScopeWhere },
      _count: true,
    }),
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "Ticket"
      WHERE "resolvedAt" >= NOW() - INTERVAL '24 hours'
      ${resolvedScopeSql}
    `,
    prisma.ticket.groupBy({
      by: ["status"],
      where: reportScopeWhere,
      _count: true,
    }),
    prisma.ticket.groupBy({
      by: ["teamId"],
      where: { status: { in: ["OPEN", "IN_PROGRESS", "PENDING_INFO", "ESCALATED"] }, ...reportScopeWhere },
      _count: true,
    }),
    prisma.ticket.findMany({
      where: { status: { in: ["FOR_CONFIRMATION", "RESOLVED", "CLOSED"] }, ...reportScopeWhere },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        status: true,
        updatedAt: true,
      },
    }),
  ]);

  const teams = await prisma.team.findMany({ select: { id: true, name: true } });
  const teamMap = new Map(teams.map((t) => [t.id, t.name]));
  const scopeLabel =
    session.user.role === "Admin"
      ? scopedTeamId
        ? (teamMap.get(scopedTeamId) ?? "Your assigned company")
        : "No assigned company"
      : "All companies";

  const resolvedN = String(resolvedToday[0]?.count ?? 0);
  const openBands = String(openByPriority.length);
  const statusTotal = statusMix.reduce((sum, row) => sum + row._count, 0);
  const topTeams = [...openByTeam]
    .sort((a, b) => b._count - a._count)
    .slice(0, 6)
    .map((row) => ({
      teamName: row.teamId ? teamMap.get(row.teamId) ?? "Unknown team" : "Unassigned queue",
      count: row._count,
    }));

  return (
    <main className="min-h-[calc(100vh-56px)] bg-[#0a0b0d] px-4 py-8 text-zinc-100 md:py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-2xl border border-zinc-800/90 bg-[#111214] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.35)] md:p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-400/95">
            {BRAND_TITLE} · Executive reporting
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white md:text-4xl">Metrics & reports</h1>
          <p className="mt-2 text-sm font-medium text-zinc-400">
            Scope: <span className="text-orange-300">{scopeLabel}</span>
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          <ReportCard label="Transfer pending" value={String(transferPending)} />
          <ReportCard label="Resolved in last 24 hours" value={resolvedN} />
          <ReportCard label="Open priority bands" value={openBands} />
          <ReportCard label="30-day ticket volume" value={String(kpis.operational.ticketVolume)} />
          <ReportCard label="Open backlog" value={String(kpis.operational.backlogSize)} />
          <ReportCard label="For confirmation" value={String(kpis.operational.forConfirmationSize)} />
          <ReportCard label="Resolution SLA compliance" value={kpis.sla.resolutionComplianceRate === null ? "—" : `${Math.round(kpis.sla.resolutionComplianceRate * 100)}%`} />
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-zinc-800/90 bg-[#111214] p-5">
            <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Open queue by priority</h2>
            <div className="mt-4 space-y-2">
              {openByPriority.length === 0 ? (
                <p className="text-sm text-zinc-500">No open tickets across priorities.</p>
              ) : (
                openByPriority.map((row) => (
                  <div key={row.priority} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2">
                    <p className="text-xs font-semibold uppercase text-zinc-300">{row.priority}</p>
                    <p className="font-mono text-sm text-zinc-100">{row._count}</p>
                  </div>
                ))
              )}
            </div>
          </article>

          <article className="rounded-2xl border border-zinc-800/90 bg-[#111214] p-5">
            <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Status mix</h2>
            <div className="mt-4 space-y-2">
              {statusMix.map((row) => {
                const pct = statusTotal === 0 ? 0 : Math.round((row._count / statusTotal) * 100);
                return (
                  <div key={row.status}>
                    <div className="mb-1 flex items-center justify-between text-xs text-zinc-300">
                      <span>{row.status.replaceAll("_", " ")}</span>
                      <span className="font-mono">{row._count} ({pct}%)</span>
                    </div>
                    <div className="h-2 rounded bg-zinc-800">
                      <div className="h-2 rounded bg-orange-500/80" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-zinc-800/90 bg-[#111214] p-5">
            <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Top team queues</h2>
            <div className="mt-4 space-y-2">
              {topTeams.length === 0 ? (
                <p className="text-sm text-zinc-500">No open team queues.</p>
              ) : (
                topTeams.map((row) => (
                  <div key={row.teamName} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2">
                    <p className="text-sm text-zinc-200">{row.teamName}</p>
                    <p className="font-mono text-sm text-zinc-100">{row.count}</p>
                  </div>
                ))
              )}
            </div>
          </article>

          <article className="rounded-2xl border border-zinc-800/90 bg-[#111214] p-5">
            <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Recent closures</h2>
            <div className="mt-4 space-y-2">
              {recentClosed.length === 0 ? (
                <p className="text-sm text-zinc-500">No recently closed tickets.</p>
              ) : (
                recentClosed.map((row) => (
                  <div key={row.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2">
                    <p className="text-sm font-semibold text-zinc-100">{row.ticketNumber}</p>
                    <p className="text-xs text-zinc-400">{row.title}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-wide text-zinc-500">
                      {row.status.replaceAll("_", " ")} · {row.updatedAt.toLocaleString()}
                    </p>
                  </div>
                ))
              )}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}

function ReportCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="relative flex min-h-[128px] flex-col justify-between overflow-hidden rounded-2xl border border-zinc-200/30 bg-white p-5 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
      <p className="max-w-[12rem] text-[10px] font-bold uppercase leading-snug tracking-[0.14em] text-zinc-500">
        {label}
      </p>
      <p className="self-start text-4xl font-semibold tabular-nums tracking-tight text-zinc-900 sm:text-5xl">{value}</p>
    </article>
  );
}
