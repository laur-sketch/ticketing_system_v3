import { prismaSecondary } from "@/lib/prisma";

/** Employees with company from mergeddatabase-dev (HRIS ETL). */
export async function listMergedEmployees(options?: {
  companyName?: string;
  activeOnly?: boolean;
  limit?: number;
}) {
  return prismaSecondary.mergedUser.findMany({
    where: {
      ...(options?.companyName ? { companyName: options.companyName } : {}),
      ...(options?.activeOnly ? { isActive: true } : {}),
    },
    orderBy: { name: "asc" },
    take: options?.limit ?? 100,
    select: {
      sourceUserId: true,
      employeeCode: true,
      name: true,
      email: true,
      companyName: true,
      department: true,
      position: true,
      role: true,
      isActive: true,
    },
  });
}

/** Latest clock-in events from mergeddatabase-dev. */
export async function listRecentMergedClockIns(limit = 50) {
  return prismaSecondary.mergedAttendanceClockIn.findMany({
    orderBy: { clockInAt: "desc" },
    take: limit,
    select: {
      sourceLogId: true,
      employeeName: true,
      companyName: true,
      clockInAt: true,
      geofenceStatus: true,
    },
  });
}

/**
 * Today's clock-ins only (Asia/Manila day bounds) — preferred for On Duty checks.
 * Prefer `loadTodayClockInsBySourceUserId` / `listMergedPersonnelDutyStatuses` from
 * `@/lib/merged-duty-status` for bulk status maps.
 */
export async function listMergedClockInsToday(limit = 500) {
  const { philippineDayBounds } = await import("@/lib/merged-duty-status");
  const { start, endExclusive } = philippineDayBounds();
  return prismaSecondary.mergedAttendanceClockIn.findMany({
    where: { clockInAt: { gte: start, lt: endExclusive } },
    orderBy: { clockInAt: "desc" },
    take: limit,
    select: {
      sourceLogId: true,
      sourceUserId: true,
      employeeName: true,
      companyName: true,
      clockInAt: true,
      geofenceStatus: true,
    },
  });
}

/** Task/KPI rows synced from ticketing_system into mergeddatabase-dev. */
export async function listMergedTaskItems(limit = 50) {
  return prismaSecondary.mergedTaskItem.findMany({
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: {
      activities: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });
}
