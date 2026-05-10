import type { TicketStatus } from "@prisma/client";
import { prisma } from "./prisma";

export type KpiRange = { from: Date; to: Date };

function utcStartOfCalendarDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function utcEndOfCalendarDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

/** Parse `YYYY-MM-DD` query params as inclusive UTC days (end-of-day for `to`, not midnight). */
export function parseKpiRangeFromQuery(fromParam: string | null, toParam: string | null): KpiRange {
  const now = new Date();
  const defaultTo = utcEndOfCalendarDay(now);
  const fromAnchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  fromAnchor.setUTCDate(fromAnchor.getUTCDate() - 30);
  const defaultFrom = utcStartOfCalendarDay(fromAnchor);

  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  let from =
    fromParam && ymd.test(fromParam.trim())
      ? utcStartOfCalendarDay(new Date(`${fromParam.trim()}T12:00:00.000Z`))
      : defaultFrom;
  let to =
    toParam && ymd.test(toParam.trim())
      ? utcEndOfCalendarDay(new Date(`${toParam.trim()}T12:00:00.000Z`))
      : defaultTo;

  if (from.getTime() > to.getTime()) {
    const t = from;
    from = to;
    to = t;
  }
  return { from, to };
}
export type KpiScope = {
  assignedAgentId?: string;
};

function rangeFilter(range: KpiRange) {
  return { gte: range.from, lte: range.to };
}

/**
 * Reporting timezone — defaults to Asia/Manila so volume trends line up with
 * what operators see locally instead of UTC midnights. Can be overridden with
 * the REPORT_TZ env var.
 */
const REPORT_TZ = process.env.REPORT_TZ || "Asia/Manila";
const localDayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: REPORT_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function localDayKey(d: Date): string {
  /** en-CA returns YYYY-MM-DD which is also what we use as the bucket label. */
  return localDayFmt.format(d);
}

/** Local-time calendar days inclusive between `from` and `to` (DST-safe). */
function enumerateDaysLocal(from: Date, to: Date): string[] {
  const startKey = localDayKey(from);
  const endKey = localDayKey(to);
  const labels: string[] = [];
  /**
   * Walk by parsing each YYYY-MM-DD as a UTC midnight and stepping 24h. This is
   * deterministic and avoids DST ambiguity since we never re-cross timezone
   * offsets while iterating.
   */
  const startMs = Date.UTC(
    Number(startKey.slice(0, 4)),
    Number(startKey.slice(5, 7)) - 1,
    Number(startKey.slice(8, 10)),
  );
  const endMs = Date.UTC(
    Number(endKey.slice(0, 4)),
    Number(endKey.slice(5, 7)) - 1,
    Number(endKey.slice(8, 10)),
  );
  for (let t = startMs; t <= endMs; t += 86400000) {
    labels.push(new Date(t).toISOString().slice(0, 10));
  }
  return labels;
}

function countPerDay(labels: string[], timestamps: Date[], dayOf: (d: Date) => string): number[] {
  const map = new Map(labels.map((l) => [l, 0]));
  for (const dt of timestamps) {
    const k = dayOf(dt);
    if (map.has(k)) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return labels.map((l) => map.get(l) ?? 0);
}

export async function computeKpis(range: KpiRange, scope: KpiScope = {}) {
  const scoped = scope.assignedAgentId
    ? ({ assignedAgentId: scope.assignedAgentId } as const)
    : {};
  const createdInRange = { createdAt: rangeFilter(range), ...scoped };
  const closedInRangeWhere = { closedAt: rangeFilter(range), ...scoped };

  const [
    volume,
    backlog,
    escalated,
    reopened,
    firstResponseSamples,
    resolutionSamples,
    feedbackAgg,
    perAgent,
    closedTickets,
    createdTimestamps,
    closedTimestamps,
    queueByStatus,
    kpisAdded,
  ] = await Promise.all([
    prisma.ticket.count({ where: createdInRange }),
    prisma.ticket.count({
      where: { status: { not: "CLOSED" }, ...scoped },
    }),
    prisma.ticket.count({
      where: { ...createdInRange, escalationType: { not: null } },
    }),
    prisma.ticket.count({
      where: { ...createdInRange, reopenCount: { gt: 0 } },
    }),
    prisma.ticket.findMany({
      where: {
        ...createdInRange,
        firstResponseAt: { not: null },
      },
      select: {
        createdAt: true,
        firstResponseAt: true,
        firstResponseDueAt: true,
      },
    }),
    prisma.ticket.findMany({
      where: {
        ...createdInRange,
        resolvedAt: { not: null },
      },
      select: {
        createdAt: true,
        resolvedAt: true,
        resolutionDueAt: true,
      },
    }),
    prisma.ticketFeedback.aggregate({
      where: {
        createdAt: rangeFilter(range),
        ...(scope.assignedAgentId ? { ticket: { assignedAgentId: scope.assignedAgentId } } : {}),
      },
      _avg: { csat: true, nps: true, ces: true },
      _count: true,
    }),
    prisma.ticket.groupBy({
      by: ["assignedAgentId"],
      where: closedInRangeWhere,
      _count: true,
    }),
    prisma.ticket.findMany({
      where: closedInRangeWhere,
      select: { reopenCount: true, messages: { select: { id: true } } },
    }),
    prisma.ticket.findMany({
      where: createdInRange,
      select: { createdAt: true },
    }),
    prisma.ticket.findMany({
      where: closedInRangeWhere,
      select: { closedAt: true },
    }),
    prisma.ticket.groupBy({
      by: ["status"],
      where: { status: { not: "CLOSED" }, ...scoped },
      _count: true,
    }),
    prisma.kpiMaintenance.count({
      where: {
        createdAt: rangeFilter(range),
        ...(scope.assignedAgentId ? { assignedAgentId: scope.assignedAgentId } : {}),
      },
    }),
  ]);

  const dayLabels = enumerateDaysLocal(range.from, range.to);
  const createdByDay = countPerDay(
    dayLabels,
    createdTimestamps.map((t) => t.createdAt),
    localDayKey,
  );
  const closedDates = closedTimestamps.map((t) => t.closedAt).filter((d): d is Date => d != null);
  const closedByDay = countPerDay(dayLabels, closedDates, localDayKey);

  const queueStatusMix = queueByStatus
    .map((row) => ({
      status: row.status as TicketStatus,
      count: row._count,
    }))
    .sort((a, b) => b.count - a.count);

  const ms = (a: Date, b: Date) => b.getTime() - a.getTime();

  const frtValues = firstResponseSamples.map((t) =>
    ms(t.createdAt, t.firstResponseAt!),
  );
  const avgFrtMs =
    frtValues.length === 0
      ? null
      : frtValues.reduce((a, b) => a + b, 0) / frtValues.length;

  const artValues = resolutionSamples.map((t) =>
    ms(t.createdAt, t.resolvedAt!),
  );
  const avgArtMs =
    artValues.length === 0
      ? null
      : artValues.reduce((a, b) => a + b, 0) / artValues.length;

  const firstResponseSlaMet = firstResponseSamples.filter(
    (t) => t.firstResponseAt! <= t.firstResponseDueAt,
  ).length;
  const firstResponseSlaRate =
    firstResponseSamples.length === 0
      ? null
      : firstResponseSlaMet / firstResponseSamples.length;

  const resolutionSlaMet = resolutionSamples.filter(
    (t) => t.resolvedAt! <= t.resolutionDueAt,
  ).length;
  const resolutionSlaRate =
    resolutionSamples.length === 0
      ? null
      : resolutionSlaMet / resolutionSamples.length;

  const closedCount = closedTickets.length;

  const fcrEligible = closedTickets.filter((t) => t.reopenCount === 0);
  const fcrApprox =
    fcrEligible.length === 0
      ? null
      : fcrEligible.filter((t) => t.messages.length <= 2).length /
        fcrEligible.length;

  const escalationRate = volume === 0 ? null : escalated / volume;
  const reopenRate = volume === 0 ? null : reopened / volume;

  const agentIds = perAgent
    .map((row) => row.assignedAgentId)
    .filter((id): id is string => Boolean(id));
  const agents = agentIds.length
    ? await prisma.agent.findMany({
        where: { id: { in: agentIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const agentMap = new Map(agents.map((a) => [a.id, a]));

  const agentRows = perAgent
    .filter((row) => row.assignedAgentId)
    .map((row) => ({
      agentId: row.assignedAgentId!,
      name: agentMap.get(row.assignedAgentId!)?.name ?? "Unknown",
      ticketsClosed: row._count,
    }))
    .sort((a, b) => b.ticketsClosed - a.ticketsClosed);

  return {
    range,
    operational: {
      ticketVolume: volume,
      backlogSize: backlog,
      firstResponseTimeMsAvg: avgFrtMs,
      resolutionTimeMsAvg: avgArtMs,
      firstContactResolutionApprox: fcrApprox,
    },
    sla: {
      firstResponseComplianceRate: firstResponseSlaRate,
      resolutionComplianceRate: resolutionSlaRate,
      escalationRate,
      reopenRate,
      ticketsClosedInRange: closedCount,
    },
    quality: {
      csatAvg: feedbackAgg._avg.csat,
      npsAvg: feedbackAgg._avg.nps,
      cesAvg: feedbackAgg._avg.ces,
      feedbackCount: feedbackAgg._count,
    },
    agents: {
      ticketsClosedByAgent: agentRows,
    },
    charts: {
      days: dayLabels,
      createdByDay,
      closedByDay,
      queueStatusMix,
    },
    kpiManagement: {
      kpisAdded,
    },
  };
}
