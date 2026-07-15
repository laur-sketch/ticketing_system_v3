/**
 * User Efficiency Breakdown — period rollups + task drill-down.
 *
 * ## Overall efficiency calculation
 *
 * For each (merged user × periodKey × frequency):
 *
 * 1. **Board tasks (TaskItem)** in `[periodStart, periodEnd)` assigned to the user's agent:
 *    - `totalTasks` = CURRENT + DONE + DELAYED
 *    - `completedTasks` = DONE
 *    - `delayedTasks` = DELAYED
 *    - `taskEfficiency` = DONE / (DONE + CURRENT) × 100  (DELAYED tracked but not in denom)
 *    - `onTimeCompletionRate` = on-time DONE / DONE × 100
 *      (on-time = completedAt ≤ dueAt, or no dueAt → counts as on-time)
 *    - `averageTaskCompletionHours` = mean (completedAt − createdAt) hours for DONE
 *    - Per-task `efficiencyContribution` = equal share of taskEfficiency across DONE tasks
 *      (CURRENT/DELAYED contribute 0; DELAYED notes include delay flag)
 *
 * 2. **Ticket efficiency** (Insights parity, tickets stay in primary PG):
 *    - closed / (open_or_in_progress + closed) × 100 in the period window
 *
 * 3. **overallEfficiency** = mean of available {taskEfficiency, ticketEfficiency},
 *    then floor at 50 (see `combinedPersonnelEfficiency` / `PERSONNEL_AVERAGE_EFFICIENCY_FLOOR`).
 *
 * 4. When TaskItem is empty for the window, taskEfficiency / details fall back to
 *    Insights KPI checklist contributor totals for that same period range.
 *
 * Idempotent: unique (sourceUserId, periodKey, frequency); replace-in-place per period.
 */
import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { Prisma, PrismaClient as PrismaClientSecondary } from "@prisma/client/secondary";
import {
  bootstrapMysqlUrl,
  ensureUserEfficiencyBreakdownTables,
  parseMysqlDatabaseName,
} from "../../../scripts/ensure-merged-task-kpi-tables";
import { helpdeskSupportPercent } from "@/lib/kpis";
import { normalizeTimeZone, type KpiFrequencyCode } from "@/lib/kpi-recurrence";
import { prismaPrimary } from "@/lib/prisma";
import {
  applyPersonnelAverageEfficiencyFloor,
  normalizePersonnelTaskTotals,
} from "@/lib/task-personnel-metrics";

export type EfficiencyFrequency = KpiFrequencyCode;

export type ComputeUserEfficiencyOptions = {
  dryRun?: boolean;
  /** Frequencies to materialize. Default: MONTHLY + WEEKLY. */
  frequencies?: EfficiencyFrequency[];
  /** How many periods back from "now" to recompute (inclusive of current). */
  lookbackPeriods?: number;
  timeZone?: string;
  sourceTag?: string;
};

export type ComputeUserEfficiencyResult = {
  dryRun: boolean;
  targetDb: string;
  periods: Array<{ frequency: EfficiencyFrequency; periodKey: string }>;
  upsertedBreakdowns: number;
  upsertedDetails: number;
  skippedNoMergedUser: number;
};

type AgentEnrichment = {
  agentId: string;
  email: string;
  name: string;
  mergedSourceUserId: bigint;
  portalAccountId: string | null;
};

type TaskRow = {
  id: string;
  title: string;
  status: "CURRENT" | "DONE" | "DELAYED";
  dueAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  assignedAgentId: string | null;
};

type PeriodWindow = {
  frequency: EfficiencyFrequency;
  periodKey: string;
  start: Date;
  end: Date;
};

function env(name: string, fallback: string): string {
  const v = process.env[name]?.trim();
  return v || fallback;
}

function resolveSecondaryWriteUrl(): string {
  const explicit = process.env.DATABASE_URL_SECONDARY_SYNC?.trim();
  if (explicit) return explicit;
  const appUrl = process.env.DATABASE_URL_SECONDARY?.trim();
  if (appUrl && !appUrl.includes("merge_app@")) return appUrl;
  return "mysql://root@localhost:3306/mergedatabase-demo";
}

/** Reporting period keys: 2026-07-14 | 2026-W28 | 2026-07 | 2026-Q3 */
export function buildReportingPeriodKey(
  frequency: EfficiencyFrequency,
  at: DateTime,
): string {
  switch (frequency) {
    case "DAILY":
      return at.toISODate() ?? at.toFormat("yyyy-MM-dd");
    case "WEEKLY": {
      const week = at.weekNumber.toString().padStart(2, "0");
      return `${at.weekYear}-W${week}`;
    }
    case "MONTHLY":
      return at.toFormat("yyyy-MM");
    case "QUARTERLY":
      return `${at.year}-Q${at.quarter}`;
    default:
      return at.toFormat("yyyy-MM");
  }
}

export function periodWindowFor(
  frequency: EfficiencyFrequency,
  at: DateTime,
): PeriodWindow {
  const z = at.zoneName ?? "Asia/Manila";
  let start: DateTime;
  let end: DateTime;
  switch (frequency) {
    case "DAILY":
      start = at.startOf("day");
      end = start.plus({ days: 1 });
      break;
    case "WEEKLY":
      start = at.startOf("week"); // Monday in Luxon ISO
      end = start.plus({ weeks: 1 });
      break;
    case "MONTHLY":
      start = at.startOf("month");
      end = start.plus({ months: 1 });
      break;
    case "QUARTERLY":
      start = at.startOf("quarter");
      end = start.plus({ months: 3 });
      break;
    default:
      start = at.startOf("month");
      end = start.plus({ months: 1 });
  }
  return {
    frequency,
    periodKey: buildReportingPeriodKey(frequency, start.setZone(z)),
    start: start.toJSDate(),
    end: end.toJSDate(),
  };
}

export function listRecentPeriods(
  frequency: EfficiencyFrequency,
  lookbackPeriods: number,
  timeZone: string,
  now = new Date(),
): PeriodWindow[] {
  const zone = normalizeTimeZone(timeZone);
  let cursor = DateTime.fromJSDate(now, { zone });
  const out: PeriodWindow[] = [];
  const n = Math.max(1, lookbackPeriods);
  for (let i = 0; i < n; i++) {
    out.push(periodWindowFor(frequency, cursor));
    switch (frequency) {
      case "DAILY":
        cursor = cursor.minus({ days: 1 });
        break;
      case "WEEKLY":
        cursor = cursor.minus({ weeks: 1 });
        break;
      case "MONTHLY":
        cursor = cursor.minus({ months: 1 });
        break;
      case "QUARTERLY":
        cursor = cursor.minus({ months: 3 });
        break;
    }
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function loadAgentEnrichment(): Promise<AgentEnrichment[]> {
  const agents = await prismaPrimary.agent.findMany({
    select: { id: true, email: true, name: true },
  });
  const portals = await prismaPrimary.portalAccount.findMany({
    where: { mergedSourceUserId: { not: null } },
    select: {
      id: true,
      email: true,
      name: true,
      mergedSourceUserId: true,
      accountStatus: true,
    },
  });

  const byEmail = new Map<string, (typeof portals)[number]>();
  const sorted = [...portals].sort((a, b) => {
    const aL = a.accountStatus === "LEGACY_CONFLICT" ? 1 : 0;
    const bL = b.accountStatus === "LEGACY_CONFLICT" ? 1 : 0;
    return aL - bL;
  });
  for (const p of sorted) {
    const key = p.email.trim().toLowerCase();
    if (!byEmail.has(key)) byEmail.set(key, p);
  }

  const personTokens = (name: string) =>
    new Set(
      name
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[,.]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 1),
    );

  const linked = portals.filter((p) => p.mergedSourceUserId != null);
  const out: AgentEnrichment[] = [];

  for (const agent of agents) {
    let portal = byEmail.get(agent.email.trim().toLowerCase()) ?? null;
    if (!portal?.mergedSourceUserId) {
      const at = personTokens(agent.name);
      let best: (typeof linked)[number] | null = null;
      let bestScore = 0;
      for (const p of linked) {
        const overlap = [...at].filter((t) => personTokens(p.name).has(t)).length;
        if (overlap >= 2 && overlap > bestScore) {
          best = p;
          bestScore = overlap;
        }
      }
      portal = best;
    }
    if (!portal?.mergedSourceUserId) continue;
    out.push({
      agentId: agent.id,
      email: agent.email,
      name: agent.name,
      mergedSourceUserId: portal.mergedSourceUserId,
      portalAccountId: portal.id,
    });
  }
  return out;
}

async function loadTasksInWindow(start: Date, end: Date): Promise<TaskRow[]> {
  const rows = await prismaPrimary.taskItem.findMany({
    where: {
      OR: [
        { createdAt: { gte: start, lt: end } },
        { updatedAt: { gte: start, lt: end } },
        { dueAt: { gte: start, lt: end } },
      ],
    },
    select: {
      id: true,
      title: true,
      status: true,
      dueAt: true,
      createdAt: true,
      updatedAt: true,
      assignedAgentId: true,
    },
  });
  return rows as TaskRow[];
}

async function loadTicketEfficiencyByAgent(
  start: Date,
  end: Date,
): Promise<Map<string, number>> {
  const [closedByAgent, pendingByAgent] = await Promise.all([
    prismaPrimary.ticket.groupBy({
      by: ["assignedAgentId"],
      where: {
        assignedAgentId: { not: null },
        closedAt: { gte: start, lt: end },
      },
      _count: true,
    }),
    prismaPrimary.ticket.groupBy({
      by: ["assignedAgentId"],
      where: {
        assignedAgentId: { not: null },
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
      _count: true,
    }),
  ]);

  const agentIds = new Set<string>();
  for (const row of closedByAgent) if (row.assignedAgentId) agentIds.add(row.assignedAgentId);
  for (const row of pendingByAgent) if (row.assignedAgentId) agentIds.add(row.assignedAgentId);

  const closedMap = new Map(
    closedByAgent
      .filter((r) => r.assignedAgentId)
      .map((r) => [r.assignedAgentId!, r._count] as const),
  );
  const pendingMap = new Map(
    pendingByAgent
      .filter((r) => r.assignedAgentId)
      .map((r) => [r.assignedAgentId!, r._count] as const),
  );

  const out = new Map<string, number>();
  for (const id of agentIds) {
    const closed = closedMap.get(id) ?? 0;
    const pending = pendingMap.get(id) ?? 0;
    const pct = helpdeskSupportPercent(closed, pending);
    if (pct != null) out.set(id, pct);
  }
  return out;
}

/**
 * Fallback when board TaskItem is empty: use latest KPI checklist contributor
 * totals from period snapshots overlapping the window.
 */
async function loadChecklistFallbackByAgent(
  start: Date,
  end: Date,
): Promise<
  Map<
    string,
    {
      total: number;
      done: number;
      details: Array<{ title: string; done: number; total: number }>;
    }
  >
> {
  const snapshots = await prismaPrimary.kpiMaintenancePeriodSnapshot.findMany({
    where: { capturedAt: { gte: start, lt: end } },
    select: { contributorProgress: true },
  });

  const byAgent = new Map<
    string,
    { total: number; done: number; details: Array<{ title: string; done: number; total: number }> }
  >();

  for (const snap of snapshots) {
    const raw = snap.contributorProgress;
    if (!Array.isArray(raw)) continue;
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id : "";
      const name = typeof row.name === "string" ? row.name : "";
      const total = Number(row.total);
      const done = Number(row.done);
      if (!id || id === "__unassigned__" || !Number.isFinite(total) || total <= 0) continue;
      const current = byAgent.get(id) ?? { total: 0, done: 0, details: [] };
      current.total += total;
      current.done += Math.min(done, total);
      current.details.push({
        title: name ? `KPI checklist · ${name}` : "KPI checklist contribution",
        done: Math.min(done, total),
        total,
      });
      byAgent.set(id, current);
    }
  }
  return byAgent;
}

function computeOverall(
  taskEfficiency: number | null,
  ticketEfficiency: number | null,
): number {
  const values = [taskEfficiency, ticketEfficiency].filter(
    (v): v is number => v != null && Number.isFinite(v),
  );
  if (values.length === 0) return applyPersonnelAverageEfficiencyFloor(0);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return applyPersonnelAverageEfficiencyFloor(avg);
}

export async function runComputeUserEfficiencyBreakdowns(
  options?: ComputeUserEfficiencyOptions,
): Promise<ComputeUserEfficiencyResult> {
  const dryRun = options?.dryRun ?? false;
  const frequencies = options?.frequencies ?? (["MONTHLY", "WEEKLY"] as EfficiencyFrequency[]);
  const lookbackPeriods = options?.lookbackPeriods ?? 3;
  const timeZone = normalizeTimeZone(options?.timeZone ?? "Asia/Manila");
  const sourceTag = options?.sourceTag ?? env("TICKETING_MERGE_SOURCE_TAG", "ticketing_system");

  const writeUrl = resolveSecondaryWriteUrl();
  const targetDb = parseMysqlDatabaseName(writeUrl) ?? "mergedatabase-demo";
  const bootstrapUrl = bootstrapMysqlUrl(writeUrl);

  const prismaBootstrap = new PrismaClientSecondary({
    datasources: { db: { url: bootstrapUrl } },
  });
  const prismaWrite = new PrismaClientSecondary({
    datasources: { db: { url: writeUrl } },
  });

  const periods = frequencies.flatMap((f) => listRecentPeriods(f, lookbackPeriods, timeZone));

  const result: ComputeUserEfficiencyResult = {
    dryRun,
    targetDb,
    periods: periods.map((p) => ({ frequency: p.frequency, periodKey: p.periodKey })),
    upsertedBreakdowns: 0,
    upsertedDetails: 0,
    skippedNoMergedUser: 0,
  };

  try {
    await prismaBootstrap.$connect();
    await ensureUserEfficiencyBreakdownTables(prismaBootstrap, targetDb);
    await prismaBootstrap.$disconnect();

    await prismaWrite.$connect();
    await prismaPrimary.$connect();

    const agents = await loadAgentEnrichment();
    const agentById = new Map(agents.map((a) => [a.agentId, a]));

    const existingUsers = await prismaWrite.mergedUser.findMany({
      select: { sourceUserId: true, name: true },
    });
    const mergedUserIds = new Set(existingUsers.map((u) => u.sourceUserId.toString()));

    for (const period of periods) {
      const tasks = await loadTasksInWindow(period.start, period.end);
      const ticketEff = await loadTicketEfficiencyByAgent(period.start, period.end);
      const checklistFallback =
        tasks.length === 0
          ? await loadChecklistFallbackByAgent(period.start, period.end)
          : new Map();

      const tasksByAgent = new Map<string, TaskRow[]>();
      for (const t of tasks) {
        if (!t.assignedAgentId) continue;
        const list = tasksByAgent.get(t.assignedAgentId) ?? [];
        list.push(t);
        tasksByAgent.set(t.assignedAgentId, list);
      }

      const agentIds = new Set<string>([
        ...tasksByAgent.keys(),
        ...ticketEff.keys(),
        ...checklistFallback.keys(),
      ]);

      for (const agentId of agentIds) {
        const enriched = agentById.get(agentId);
        if (!enriched) continue;
        if (!mergedUserIds.has(enriched.mergedSourceUserId.toString())) {
          result.skippedNoMergedUser++;
          continue;
        }

        const agentTasks = tasksByAgent.get(agentId) ?? [];
        let totalTasks = agentTasks.length;
        let completedTasks = agentTasks.filter((t) => t.status === "DONE").length;
        let delayedTasks = agentTasks.filter((t) => t.status === "DELAYED").length;
        let currentTasks = agentTasks.filter((t) => t.status === "CURRENT").length;

        let taskEfficiency: number | null = null;
        let onTimeCompletionRate: number | null = null;
        let averageTaskCompletionHours: number | null = null;
        let details: Array<{
          taskId: string | null;
          taskSource: string;
          taskTitle: string;
          status: string;
          dueAt: Date | null;
          completedAt: Date | null;
          efficiencyContribution: number | null;
          notes: string | null;
        }> = [];

        if (agentTasks.length > 0) {
          const activeDenom = completedTasks + currentTasks;
          taskEfficiency =
            activeDenom > 0
              ? Math.min(100, Math.round((completedTasks / activeDenom) * 100))
              : delayedTasks > 0
                ? 0
                : null;

          const doneTasks = agentTasks.filter((t) => t.status === "DONE");
          if (doneTasks.length > 0) {
            let onTime = 0;
            let hoursSum = 0;
            for (const t of doneTasks) {
              const completedAt = t.updatedAt;
              if (!t.dueAt || completedAt.getTime() <= t.dueAt.getTime()) onTime++;
              hoursSum += Math.max(0, (completedAt.getTime() - t.createdAt.getTime()) / 3_600_000);
            }
            onTimeCompletionRate = round2((onTime / doneTasks.length) * 100);
            averageTaskCompletionHours = round2(hoursSum / doneTasks.length);
          }

          const perDone =
            taskEfficiency != null && completedTasks > 0
              ? round2(taskEfficiency / completedTasks)
              : 0;
          details = agentTasks.map((t) => ({
            taskId: t.id,
            taskSource: "TASK_ITEM",
            taskTitle: t.title.slice(0, 512),
            status: t.status,
            dueAt: t.dueAt,
            completedAt: t.status === "DONE" ? t.updatedAt : null,
            efficiencyContribution: t.status === "DONE" ? perDone : 0,
            notes:
              t.status === "DELAYED"
                ? "Delayed board task — counted in delayedTasks, excluded from taskEfficiency denominator."
                : null,
          }));
        } else {
          const fb = checklistFallback.get(agentId);
          if (fb && fb.total > 0) {
            const normalized = normalizePersonnelTaskTotals(fb.total, fb.done);
            totalTasks = normalized.pending + normalized.closed;
            completedTasks = normalized.closed;
            delayedTasks = 0;
            currentTasks = normalized.pending;
            taskEfficiency = normalized.efficiency;
            details = fb.details.map((d: { title: string; done: number; total: number }) => ({
              taskId: null,
              taskSource: "KPI_CHECKLIST",
              taskTitle: d.title.slice(0, 512),
              status: d.done >= d.total ? "DONE" : "CURRENT",
              dueAt: null,
              completedAt: null,
              efficiencyContribution:
                totalTasks > 0 ? round2((d.done / d.total) * (taskEfficiency ?? 0)) : null,
              notes:
                "Board TaskItem empty for this window — efficiency derived from KPI checklist contributor progress.",
            }));
          }
        }

        const ticketEfficiency = ticketEff.get(agentId) ?? null;
        if (ticketEfficiency != null && details.every((d) => d.taskSource !== "TICKET_SUMMARY")) {
          details.push({
            taskId: null,
            taskSource: "TICKET_SUMMARY",
            taskTitle: "Ticket efficiency (period)",
            status: "DONE",
            dueAt: null,
            completedAt: null,
            efficiencyContribution: round2(ticketEfficiency),
            notes: "Aggregated ticket closed/(open+closed) for the period; ticket rows stay in primary PG.",
          });
        }

        const overallEfficiency = computeOverall(taskEfficiency, ticketEfficiency);
        if (
          taskEfficiency == null &&
          ticketEfficiency == null &&
          totalTasks === 0 &&
          details.length === 0
        ) {
          continue;
        }

        const efficiencyScore = round2(
          overallEfficiency * 0.7 + (onTimeCompletionRate ?? overallEfficiency) * 0.3,
        );

        if (dryRun) {
          result.upsertedBreakdowns++;
          result.upsertedDetails += details.length;
          continue;
        }

        const existing = await prismaWrite.mergedUserEfficiencyBreakdown.findUnique({
          where: {
            sourceUserId_periodKey_frequency: {
              sourceUserId: enriched.mergedSourceUserId,
              periodKey: period.periodKey,
              frequency: period.frequency,
            },
          },
          select: { id: true },
        });

        const breakdownId = existing?.id ?? randomUUID();
        const payload = {
          portalAccountId: enriched.portalAccountId,
          displayName: enriched.name,
          periodStartAt: period.start,
          periodEndAt: period.end,
          overallEfficiency: new Prisma.Decimal(round2(overallEfficiency)),
          taskEfficiency:
            taskEfficiency != null ? new Prisma.Decimal(round2(taskEfficiency)) : null,
          ticketEfficiency:
            ticketEfficiency != null ? new Prisma.Decimal(round2(ticketEfficiency)) : null,
          totalTasks,
          completedTasks,
          delayedTasks,
          onTimeCompletionRate:
            onTimeCompletionRate != null
              ? new Prisma.Decimal(onTimeCompletionRate)
              : null,
          averageTaskCompletionHours:
            averageTaskCompletionHours != null
              ? new Prisma.Decimal(averageTaskCompletionHours)
              : null,
          efficiencyScore: new Prisma.Decimal(efficiencyScore),
          sourceDatabase: sourceTag,
          computedAt: new Date(),
        };

        if (existing) {
          await prismaWrite.mergedUserEfficiencyTaskDetail.deleteMany({
            where: { breakdownId: existing.id },
          });
          await prismaWrite.mergedUserEfficiencyBreakdown.update({
            where: { id: existing.id },
            data: payload,
          });
        } else {
          await prismaWrite.mergedUserEfficiencyBreakdown.create({
            data: {
              id: breakdownId,
              sourceUserId: enriched.mergedSourceUserId,
              periodKey: period.periodKey,
              frequency: period.frequency,
              ...payload,
            },
          });
        }

        if (details.length > 0) {
          await prismaWrite.mergedUserEfficiencyTaskDetail.createMany({
            data: details.map((d) => ({
              id: randomUUID(),
              breakdownId,
              taskId: d.taskId,
              taskSource: d.taskSource,
              taskTitle: d.taskTitle,
              status: d.status,
              dueAt: d.dueAt,
              completedAt: d.completedAt,
              efficiencyContribution:
                d.efficiencyContribution != null
                  ? new Prisma.Decimal(d.efficiencyContribution)
                  : null,
              notes: d.notes,
            })),
          });
        }

        result.upsertedBreakdowns++;
        result.upsertedDetails += details.length;
      }
    }
  } finally {
    await prismaBootstrap.$disconnect().catch(() => undefined);
    await prismaWrite.$disconnect().catch(() => undefined);
  }

  return result;
}
