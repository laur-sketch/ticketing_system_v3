import type { Prisma, TicketStatus } from "@prisma/client";
import { DateTime } from "luxon";
import {
  computeTaskChecklistPillarMetrics,
  enumerateYmdDaysInRange,
  kpiMaintenanceWhereForTaskMetrics,
  snapshotTimeZoneForTaskMetrics,
  type TaskChecklistPillarMetrics,
} from "@/lib/kpi-period-snapshots";
import { normalizeTimeZone } from "@/lib/kpi-recurrence";
import {
  combineHelpdeskCountsByBlend,
  loadHelpdeskCsvTaskMetricCounts,
  resolveHelpdeskMetricBlend,
  type HelpdeskTaskMetricCounts,
} from "@/lib/helpdesk-csv";
import { prisma } from "./prisma";

export type { TaskChecklistPillarMetrics, TaskChecklistPillarMetric } from "@/lib/kpi-period-snapshots";

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

/** Matches KPI pillar cadence on Insights → Task metrics. */
export type HelpdeskTaskCadence = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY";

export function parseHelpdeskCadence(param: string | null): HelpdeskTaskCadence {
  const u = param?.trim().toUpperCase();
  if (u === "WEEKLY" || u === "MONTHLY" || u === "QUARTERLY") return u;
  return "DAILY";
}

export type TaskMetricsHelpdeskTickets = {
  cadence: HelpdeskTaskCadence;
  /** Numerator: closed in reporting window */
  closedCount: number;
  denominator: number;
  /** @deprecated Prefer {@link TaskMetricsHelpdeskTickets.percent}. */
  ratio: number | null;
  /** Headline %: (closed ÷ (open + closed in range)) × 100, capped at 100 — see {@link helpdeskSupportPercent}. */
  percent: number | null;
  /** Current non-closed tickets (scoped backlog) */
  openBacklog: number;
  /** Non-closed tickets active in the reporting window (denominator) */
  openTicketsInPeriod: number;
  /** Tickets created in reporting range */
  requestsInRange: number;
  /** Inclusive reporting window from the date picker (YYYY-MM-DD). */
  rangeFromYmd: string;
  rangeToYmd: string;
};

/**
 * Helpdesk Support headline: `(closed in range ÷ (open in range + closed in range)) × 100`, capped at 100%.
 */
export function helpdeskSupportPercent(closedInRange: number, openInRange: number): number | null {
  const total = openInRange + closedInRange;
  if (total <= 0) return null;
  const raw = (closedInRange / total) * 100;
  return Number(Math.min(100, raw).toFixed(1));
}

/** Task metrics → USER SUPPORT pillar (tickets by status in Insights date range). */
export type TaskMetricsUserSupportTickets = {
  forConfirmation: number;
  closed: number;
  total: number;
};

function summarizeUserSupportTickets(
  rows: { status: TicketStatus; _count: number }[],
): TaskMetricsUserSupportTickets {
  const m = new Map<TicketStatus, number>();
  for (const r of rows) {
    m.set(r.status, r._count);
  }
  const forConfirmation = m.get("FOR_CONFIRMATION") ?? 0;
  const closed = m.get("CLOSED") ?? 0;
  return { forConfirmation, closed, total: forConfirmation + closed };
}

const CSAT_STAR_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Very Poor",
  2: "Poor",
  3: "Neutral",
  4: "Good",
  5: "Very Good",
};

export type CsatStarDistributionRow = {
  star: 1 | 2 | 3 | 4 | 5;
  label: string;
  count: number;
};

function buildCsatStarDistribution(
  rows: { csat: number; _count: number }[],
): CsatStarDistributionRow[] {
  const counts = new Map<number, number>([
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
    [5, 0],
  ]);
  for (const r of rows) {
    if (r.csat >= 1 && r.csat <= 5) counts.set(r.csat, r._count);
  }
  return ([1, 2, 3, 4, 5] as const).map((star) => ({
    star,
    label: CSAT_STAR_LABELS[star],
    count: counts.get(star) ?? 0,
  }));
}

function rangeFilter(range: KpiRange) {
  return { gte: range.from, lte: range.to };
}

type WorkingDayInterval = { start: Date; end: Date };

function ymdInTimeZone(d: Date, timeZone: string): string {
  const iso = DateTime.fromJSDate(d, { zone: normalizeTimeZone(timeZone) }).toISODate();
  return iso ?? d.toISOString().slice(0, 10);
}

/** Mon–Sat local days in range (Sundays excluded). */
function workingDayIntervalsInRange(range: KpiRange, timeZone: string): WorkingDayInterval[] {
  const zone = normalizeTimeZone(timeZone);
  return enumerateYmdDaysInRange(ymdInTimeZone(range.from, zone), ymdInTimeZone(range.to, zone), zone).map(
    (ymd) => {
      const dt = DateTime.fromISO(ymd, { zone });
      return {
        start: dt.startOf("day").toJSDate(),
        end: dt.endOf("day").toJSDate(),
      };
    },
  );
}

function timestampOnWorkingDaysWhere(
  field: "createdAt" | "closedAt" | "updatedAt",
  intervals: WorkingDayInterval[],
): Prisma.TicketWhereInput {
  if (intervals.length === 0) {
    return { [field]: { lt: new Date(0) } };
  }
  if (intervals.length === 1) {
    const iv = intervals[0]!;
    return { [field]: { gte: iv.start, lte: iv.end } };
  }
  return {
    OR: intervals.map((iv) => ({
      [field]: { gte: iv.start, lte: iv.end },
    })),
  };
}

function workingDaysSpanRange(intervals: WorkingDayInterval[]): KpiRange | null {
  if (intervals.length === 0) return null;
  return { from: intervals[0]!.start, to: intervals[intervals.length - 1]!.end };
}

/** Live {@link prisma.ticket} counts for Helpdesk / User Support pillars (Mon–Sat in `timeZone`). */
async function loadLiveHelpdeskTaskMetricCounts(args: {
  workingDayIntervals: WorkingDayInterval[];
  span: KpiRange;
  scoped: Record<string, unknown>;
}): Promise<HelpdeskTaskMetricCounts> {
  const { workingDayIntervals, span, scoped } = args;
  const [closedN, openN, volumeN, userSupportRows] = await Promise.all([
    prisma.ticket.count({
      where: {
        ...scoped,
        AND: [{ closedAt: { not: null } }, timestampOnWorkingDaysWhere("closedAt", workingDayIntervals)],
      },
    }),
    prisma.ticket.count({ where: openTicketsInRangeWhere(span, scoped) }),
    prisma.ticket.count({
      where: { ...timestampOnWorkingDaysWhere("createdAt", workingDayIntervals), ...scoped },
    }),
    prisma.ticket.groupBy({
      by: ["status"],
      where: {
        status: { in: ["FOR_CONFIRMATION", "CLOSED"] },
        ...timestampOnWorkingDaysWhere("updatedAt", workingDayIntervals),
        ...scoped,
      },
      _count: true,
    }),
  ]);
  const userSupport = summarizeUserSupportTickets(
    userSupportRows.map((r) => ({
      status: r.status as TicketStatus,
      _count: r._count,
    })),
  );
  return {
    userSupport: { forConfirmation: userSupport.forConfirmation, closed: userSupport.closed },
    closedInRange: closedN,
    openTicketsInPeriod: openN,
    requestsInRange: volumeN,
  };
}

function emptyTaskMetricsUserSupport(): TaskMetricsUserSupportTickets {
  return { forConfirmation: 0, closed: 0, total: 0 };
}

function emptyTaskMetricsHelpdesk(
  cadence: HelpdeskTaskCadence,
  openBacklog: number,
  rangeFromYmd = "",
  rangeToYmd = "",
): TaskMetricsHelpdeskTickets {
  return {
    cadence,
    closedCount: 0,
    denominator: 0,
    ratio: null,
    percent: null,
    openBacklog,
    openTicketsInPeriod: 0,
    requestsInRange: 0,
    rangeFromYmd,
    rangeToYmd,
  };
}

/**
 * Reporting timezone — defaults to Asia/Manila so volume trends line up with
 * what operators see locally instead of UTC midnights. Can be overridden with
 * the REPORT_TZ env var.
 */
const REPORT_TZ = process.env.REPORT_TZ || "Asia/Manila";

function reportingTzTodayInterval(now: Date): { start: Date; end: Date } {
  const dt = DateTime.fromMillis(now.getTime(), { zone: REPORT_TZ });
  return {
    start: dt.startOf("day").toJSDate(),
    end: dt.endOf("day").toJSDate(),
  };
}

/** One calendar day in REPORT_TZ from `YYYY-MM-DD`. */
function reportingTzDayIntervalFromYmd(ymd: string): { start: Date; end: Date } {
  const dt = DateTime.fromISO(ymd, { zone: REPORT_TZ });
  if (!dt.isValid) return reportingTzTodayInterval(new Date());
  return {
    start: dt.startOf("day").toJSDate(),
    end: dt.endOf("day").toJSDate(),
  };
}

function reportingTzDayIntervalForRange(range: KpiRange): { start: Date; end: Date } {
  return reportingTzDayIntervalFromYmd(localDayKey(range.from));
}

function kpiRangeToYmd(range: KpiRange): { fromYmd: string; toYmd: string } {
  const ymd = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return { fromYmd: ymd(range.from), toYmd: ymd(range.to) };
}

async function countHelpdeskTicketsInRange(
  range: KpiRange,
  scoped: Record<string, unknown>,
): Promise<{ closed: number; open: number }> {
  const [closed, open] = await Promise.all([
    prisma.ticket.count({ where: { closedAt: rangeFilter(range), ...scoped } }),
    prisma.ticket.count({ where: openTicketsInRangeWhere(range, scoped) }),
  ]);
  return { closed, open };
}

/** Helpdesk counts + % for the full Insights date-picker window (not split by cadence). */
async function aggregateHelpdeskForReportingRange(
  range: KpiRange,
  scoped: Record<string, unknown>,
): Promise<{
  closedCount: number;
  openTicketsInPeriod: number;
  percent: number | null;
  rangeFromYmd: string;
  rangeToYmd: string;
}> {
  const { fromYmd, toYmd } = kpiRangeToYmd(range);
  const { closed, open } = await countHelpdeskTicketsInRange(range, scoped);
  return {
    closedCount: closed,
    openTicketsInPeriod: open,
    percent: helpdeskSupportPercent(closed, open),
    rangeFromYmd: fromYmd,
    rangeToYmd: toYmd,
  };
}

function computeTaskMetricsHelpdesk(args: {
  cadence: HelpdeskTaskCadence;
  openBacklog: number;
  closedInRange: number;
  openTicketsInPeriod: number;
  requestsInRange: number;
  percent: number | null;
  rangeFromYmd: string;
  rangeToYmd: string;
}): TaskMetricsHelpdeskTickets {
  const {
    cadence,
    openBacklog,
    closedInRange,
    openTicketsInPeriod,
    requestsInRange,
    percent,
    rangeFromYmd,
    rangeToYmd,
  } = args;
  const denominator = openTicketsInPeriod + closedInRange;
  const ratio = denominator > 0 ? closedInRange / denominator : null;
  return {
    cadence,
    closedCount: closedInRange,
    denominator,
    ratio,
    percent,
    openBacklog,
    openTicketsInPeriod,
    requestsInRange,
    rangeFromYmd,
    rangeToYmd,
  };
}

/** Open tickets that overlapped the reporting window (created by end, not closed before start). */
function openTicketsInRangeWhere(range: KpiRange, scoped: Record<string, unknown>) {
  return {
    ...scoped,
    status: { not: "CLOSED" as const },
    createdAt: { lte: range.to },
    OR: [{ closedAt: null }, { closedAt: { gte: range.from } }],
  };
}

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

export type TaskMetricsPayload = {
  range: KpiRange;
  taskMetricsHelpdesk: TaskMetricsHelpdeskTickets;
  taskMetricsUserSupport: TaskMetricsUserSupportTickets;
  taskChecklistPillars: TaskChecklistPillarMetrics;
};

/** Task metrics tab: helpdesk ratio + user support (scoped reporting range). */
export async function computeTaskMetrics(
  range: KpiRange,
  scope: KpiScope = {},
  helpdeskCadence: HelpdeskTaskCadence = "DAILY",
  opts: { timeZone?: string } = {},
): Promise<TaskMetricsPayload> {
  const scoped = scope.assignedAgentId
    ? ({ assignedAgentId: scope.assignedAgentId } as const)
    : {};
  /** Helpdesk / User Support use Manila working days even when the browser sends UTC before hydration. */
  const helpdeskTz = snapshotTimeZoneForTaskMetrics(opts.timeZone);
  const workingDays = workingDayIntervalsInRange(range, helpdeskTz);
  const { fromYmd, toYmd } = kpiRangeToYmd(range);

  const backlogOpen = await prisma.ticket.count({
    where: { status: "OPEN", ...scoped },
  });

  let closedInRange = 0;
  let openInRange = 0;
  let volume = 0;
  let userSupportTicketsByStatus: { status: TicketStatus; _count: number }[] = [];

  if (workingDays.length > 0) {
    const span = workingDaysSpanRange(workingDays)!;
    const globalScope = !scope.assignedAgentId;

    const [csvCounts, liveCounts] = await Promise.all([
      globalScope
        ? loadHelpdeskCsvTaskMetricCounts({ workingDayIntervals: workingDays, span })
        : Promise.resolve(null),
      loadLiveHelpdeskTaskMetricCounts({
        workingDayIntervals: workingDays,
        span,
        scoped,
      }),
    ]);

    const blend = globalScope ? resolveHelpdeskMetricBlend(fromYmd, toYmd) : "live-only";
    const combined = globalScope
      ? combineHelpdeskCountsByBlend(csvCounts, liveCounts, blend)
      : liveCounts;

    if (combined) {
      closedInRange = combined.closedInRange;
      openInRange = combined.openTicketsInPeriod;
      volume = combined.requestsInRange;
      userSupportTicketsByStatus = [
        { status: "FOR_CONFIRMATION" as const, _count: combined.userSupport.forConfirmation },
        { status: "CLOSED" as const, _count: combined.userSupport.closed },
      ];
    }
  }

  const taskMetricsHelpdesk =
    workingDays.length === 0
      ? emptyTaskMetricsHelpdesk(helpdeskCadence, backlogOpen, fromYmd, toYmd)
      : computeTaskMetricsHelpdesk({
          cadence: helpdeskCadence,
          openBacklog: backlogOpen,
          closedInRange,
          openTicketsInPeriod: openInRange,
          requestsInRange: volume,
          percent: helpdeskSupportPercent(closedInRange, openInRange),
          rangeFromYmd: fromYmd,
          rangeToYmd: toYmd,
        });
  const taskMetricsUserSupport =
    workingDays.length === 0
      ? emptyTaskMetricsUserSupport()
      : summarizeUserSupportTickets(userSupportTicketsByStatus);

  const taskChecklistPillars = await computeTaskChecklistPillarMetrics({
    metricsCadence: helpdeskCadence,
    fromYmd,
    toYmd,
    timeZone: helpdeskTz,
    kpiWhere: kpiMaintenanceWhereForTaskMetrics(scope.assignedAgentId),
  });

  return { range, taskMetricsHelpdesk, taskMetricsUserSupport, taskChecklistPillars };
}

export async function computeKpis(
  range: KpiRange,
  scope: KpiScope = {},
  opts: { helpdeskCadence?: HelpdeskTaskCadence } = {},
) {
  const helpdeskCadence = opts.helpdeskCadence ?? "DAILY";
  const scoped = scope.assignedAgentId
    ? ({ assignedAgentId: scope.assignedAgentId } as const)
    : {};
  const createdInRange = { createdAt: rangeFilter(range), ...scoped };
  const closedInRangeWhere = { closedAt: rangeFilter(range), ...scoped };

  const [
    volume,
    backlogOpen,
    forConfirmationBacklog,
    transferRequestsInRange,
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
    feedbackCsatByStar,
    confirmationClosedSamples,
  ] = await Promise.all([
    prisma.ticket.count({ where: createdInRange }),
    prisma.ticket.count({
      where: { status: "OPEN", ...scoped },
    }),
    prisma.ticket.count({
      where: { status: { in: ["FOR_CONFIRMATION", "RESOLVED"] }, ...scoped },
    }),
    prisma.ticketActivity.count({
      where: {
        summary: "Transfer requested",
        createdAt: rangeFilter(range),
        ...(scope.assignedAgentId ? { ticket: { assignedAgentId: scope.assignedAgentId } } : {}),
      },
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
    prisma.ticketFeedback.groupBy({
      by: ["csat"],
      where: {
        createdAt: rangeFilter(range),
        ...(scope.assignedAgentId ? { ticket: { assignedAgentId: scope.assignedAgentId } } : {}),
        csat: { gte: 1, lte: 5 },
      },
      _count: true,
    }),
    prisma.ticket.findMany({
      where: {
        closedAt: rangeFilter(range),
        resolvedAt: { not: null },
        ...scoped,
      },
      select: { resolvedAt: true, closedAt: true },
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

  const confirmationValues = confirmationClosedSamples
    .map((t) => (t.closedAt && t.resolvedAt ? ms(t.resolvedAt, t.closedAt) : null))
    .filter((v): v is number => v !== null && v >= 0);
  const avgConfirmationMs =
    confirmationValues.length === 0
      ? null
      : confirmationValues.reduce((a, b) => a + b, 0) / confirmationValues.length;

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

  const transferRequestRate = volume === 0 ? null : transferRequestsInRange / volume;
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

  const { taskMetricsHelpdesk, taskMetricsUserSupport } = await computeTaskMetrics(
    range,
    scope,
    helpdeskCadence,
  );
  const csatByStar = buildCsatStarDistribution(
    feedbackCsatByStar.map((r) => ({ csat: r.csat, _count: r._count })),
  );

  return {
    range,
    operational: {
      ticketVolume: volume,
      /** OPEN status only (active intake queue). */
      backlogSize: backlogOpen,
      forConfirmationSize: forConfirmationBacklog,
      firstResponseTimeMsAvg: avgFrtMs,
      resolutionTimeMsAvg: avgArtMs,
      confirmationTimeMsAvg: avgConfirmationMs,
      firstContactResolutionApprox: fcrApprox,
    },
    sla: {
      firstResponseComplianceRate: firstResponseSlaRate,
      resolutionComplianceRate: resolutionSlaRate,
      transferRequestRate,
      reopenRate,
      ticketsClosedInRange: closedCount,
    },
    quality: {
      csatAvg: feedbackAgg._avg.csat,
      npsAvg: feedbackAgg._avg.nps,
      cesAvg: feedbackAgg._avg.ces,
      feedbackCount: feedbackAgg._count,
      csatByStar,
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
    taskMetricsHelpdesk,
    taskMetricsUserSupport,
  };
}
