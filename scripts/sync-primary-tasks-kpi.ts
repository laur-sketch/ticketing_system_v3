#!/usr/bin/env npx tsx
/**
 * Sync Task + KPI monitoring tables from primary PostgreSQL → secondary mergeddatabase-dev.
 * Usage: npx tsx scripts/sync-primary-tasks-kpi.ts
 */
import { PrismaClient as PrismaClientSecondary } from "@prisma/client/secondary";
import type { KpiFrequency, TaskStatus } from "@prisma/client/primary";
import { prismaPrimary } from "../src/lib/prisma";

type PgKpiMaintenance = {
  id: string;
  title: string;
  mainTask: string | null;
  isRecurring: boolean;
  nonRecurringStartAt: Date | null;
  nonRecurringEndAt: Date | null;
  frequency: KpiFrequency;
  subKpis: unknown;
  assignedAgentId: string | null;
  assignedRole: string | null;
  recurrenceWeekday: number | null;
  recurrenceMonthDay: number | null;
  periodCycleStartAt: Date | null;
  lastFullCompletionAt: Date | null;
  periodKey: string | null;
  rolledOverIncomplete: boolean;
  itProjectName: string | null;
  itProjectPhase: string | null;
  scopedCompanyTeamId: string | null;
  createdBy: string;
  createdByRole: string;
  createdAt: Date;
  updatedAt: Date;
};

type PgKpiSnapshot = {
  id: string;
  kpiMaintenanceId: string;
  periodKey: string;
  frequency: KpiFrequency;
  timeZone: string;
  total: number;
  done: number;
  missing: number;
  percent: number;
  fullyComplete: boolean;
  contributorProgress: unknown | null;
  capturedAt: Date;
};

type PgTaskItem = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  assignedAgentId: string | null;
  priority: string | null;
  dueAt: Date | null;
  createdBy: string;
  createdByRole: string;
  createdAt: Date;
  updatedAt: Date;
};

type PgTaskActivity = {
  id: string;
  taskId: string;
  author: string;
  action: string;
  detail: string | null;
  createdAt: Date;
};

function resolveSecondaryWriteUrl(): string {
  const explicit = process.env.DATABASE_URL_SECONDARY_SYNC?.trim();
  if (explicit) return explicit;

  const appUrl = process.env.DATABASE_URL_SECONDARY?.trim();
  if (appUrl && !appUrl.includes("merge_app@")) return appUrl;

  return "mysql://root:root@localhost:3306/mergeddatabase-dev";
}

async function readPrimaryTaskKpi() {
  const [kpis, snapshots, tasks, activities] = await Promise.all([
    prismaPrimary.$queryRaw<PgKpiMaintenance[]>`
      SELECT id, title, "mainTask", "isRecurring", "nonRecurringStartAt", "nonRecurringEndAt",
             frequency, "subKpis", "assignedAgentId", "assignedRole", "recurrenceWeekday",
             "recurrenceMonthDay", "periodCycleStartAt", "lastFullCompletionAt", "periodKey",
             "rolledOverIncomplete", "itProjectName", "itProjectPhase", "scopedCompanyTeamId",
             "createdBy", "createdByRole", "createdAt", "updatedAt"
      FROM "KpiMaintenance"
    `,
    prismaPrimary.$queryRaw<PgKpiSnapshot[]>`
      SELECT id, "kpiMaintenanceId", "periodKey", frequency, "timeZone", total, done, missing,
             percent, "fullyComplete", "contributorProgress", "capturedAt"
      FROM "KpiMaintenancePeriodSnapshot"
    `,
    prismaPrimary.$queryRaw<PgTaskItem[]>`
      SELECT id, title, description, status, "assignedAgentId", priority, "dueAt",
             "createdBy", "createdByRole", "createdAt", "updatedAt"
      FROM "TaskItem"
    `,
    prismaPrimary.$queryRaw<PgTaskActivity[]>`
      SELECT id, "taskId", author, action, detail, "createdAt"
      FROM "TaskActivity"
    `,
  ]);

  return { kpis, snapshots, tasks, activities };
}

async function main() {
  const writeUrl = resolveSecondaryWriteUrl();
  const prismaWrite = new PrismaClientSecondary({
    datasources: { db: { url: writeUrl } },
  });

  try {
    await Promise.all([prismaPrimary.$connect(), prismaWrite.$connect()]);

    console.log("Reading Task/KPI data from primary (PostgreSQL)…");
    const { kpis, snapshots, tasks, activities } = await readPrimaryTaskKpi();

    console.log(
      JSON.stringify(
        {
          source: {
            KpiMaintenance: kpis.length,
            KpiMaintenancePeriodSnapshot: snapshots.length,
            TaskItem: tasks.length,
            TaskActivity: activities.length,
          },
        },
        null,
        2,
      ),
    );

    console.log("\nReplacing merged Task/KPI tables in mergeddatabase-dev…");
    await prismaWrite.$transaction([
      prismaWrite.mergedTaskActivity.deleteMany(),
      prismaWrite.mergedTaskItem.deleteMany(),
      prismaWrite.mergedKpiPeriodSnapshot.deleteMany(),
      prismaWrite.mergedKpiMaintenance.deleteMany(),
    ]);

    if (kpis.length) {
      await prismaWrite.mergedKpiMaintenance.createMany({
        data: kpis.map((k) => ({
          sourceId: k.id,
          title: k.title,
          mainTask: k.mainTask,
          isRecurring: k.isRecurring,
          nonRecurringStartAt: k.nonRecurringStartAt,
          nonRecurringEndAt: k.nonRecurringEndAt,
          frequency: k.frequency,
          subKpis: k.subKpis as object,
          assignedAgentId: k.assignedAgentId,
          assignedRole: k.assignedRole,
          recurrenceWeekday: k.recurrenceWeekday,
          recurrenceMonthDay: k.recurrenceMonthDay,
          periodCycleStartAt: k.periodCycleStartAt,
          lastFullCompletionAt: k.lastFullCompletionAt,
          periodKey: k.periodKey,
          rolledOverIncomplete: k.rolledOverIncomplete,
          itProjectName: k.itProjectName,
          itProjectPhase: k.itProjectPhase,
          scopedCompanyTeamId: k.scopedCompanyTeamId,
          createdBy: k.createdBy,
          createdByRole: k.createdByRole,
          createdAt: k.createdAt,
          updatedAt: k.updatedAt,
        })),
      });
    }

    if (snapshots.length) {
      await prismaWrite.mergedKpiPeriodSnapshot.createMany({
        data: snapshots.map((s) => ({
          sourceId: s.id,
          kpiMaintenanceId: s.kpiMaintenanceId,
          periodKey: s.periodKey,
          frequency: s.frequency,
          timeZone: s.timeZone,
          total: s.total,
          done: s.done,
          missing: s.missing,
          percent: s.percent,
          fullyComplete: s.fullyComplete,
          contributorProgress: s.contributorProgress as object | null,
          capturedAt: s.capturedAt,
        })),
      });
    }

    if (tasks.length) {
      await prismaWrite.mergedTaskItem.createMany({
        data: tasks.map((t) => ({
          sourceId: t.id,
          title: t.title,
          description: t.description,
          status: t.status,
          assignedAgentId: t.assignedAgentId,
          priority: t.priority,
          dueAt: t.dueAt,
          createdBy: t.createdBy,
          createdByRole: t.createdByRole,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        })),
      });
    }

    if (activities.length) {
      await prismaWrite.mergedTaskActivity.createMany({
        data: activities.map((a) => ({
          sourceId: a.id,
          taskId: a.taskId,
          author: a.author,
          action: a.action,
          detail: a.detail,
          createdAt: a.createdAt,
        })),
      });
    }

    const [mergedKpis, mergedSnaps, mergedTasks, mergedActs] = await Promise.all([
      prismaWrite.mergedKpiMaintenance.count(),
      prismaWrite.mergedKpiPeriodSnapshot.count(),
      prismaWrite.mergedTaskItem.count(),
      prismaWrite.mergedTaskActivity.count(),
    ]);

    console.log(
      "\nSync complete:\n" +
        JSON.stringify(
          {
            merged: {
              MergedKpiMaintenance: mergedKpis,
              MergedKpiPeriodSnapshot: mergedSnaps,
              MergedTaskItem: mergedTasks,
              MergedTaskActivity: mergedActs,
            },
          },
          null,
          2,
        ),
    );

    if (kpis.length === 0 && tasks.length === 0) {
      console.log(
        "\nNote: Primary PostgreSQL has no Task/KPI rows yet. Add data in ticketing_system first, then re-run:",
      );
      console.log("  npm run db:sync:tasks-kpi");
    }
  } finally {
    await prismaWrite.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error("Sync failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prismaPrimary.$disconnect();
  });
