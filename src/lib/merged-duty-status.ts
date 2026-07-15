/**
 * On Duty / Offline from mergeddatabase-dev attendance (HRIS clock-in).
 *
 * Source of truth: `merged_attendance_clock_in` via `prismaSecondary`.
 * There is no clock-out table in the merge schema today — On Duty means the
 * employee has at least one clock-in whose `clock_in_at` falls on the current
 * Philippine calendar day. Offline otherwise.
 */

import { DateTime } from "luxon";
import { DEFAULT_TIME_ZONE } from "@/lib/kpi-recurrence";
import { prismaSecondary } from "@/lib/prisma";

export type DutyStatus = "ON_DUTY" | "OFFLINE";

export type MergedDutyClockIn = {
  sourceUserId: bigint;
  clockInAt: Date;
};

/** Inclusive start / exclusive end of "today" in Asia/Manila (UTC instants). */
export function philippineDayBounds(now: Date = new Date(), timeZone = DEFAULT_TIME_ZONE): {
  start: Date;
  endExclusive: Date;
  ymd: string;
} {
  const day = DateTime.fromJSDate(now, { zone: timeZone }).startOf("day");
  return {
    start: day.toJSDate(),
    endExclusive: day.plus({ days: 1 }).toJSDate(),
    ymd: day.toISODate() ?? "",
  };
}

export function dutyStatusFromLatestClockIn(
  latestClockInAt: Date | null | undefined,
  now: Date = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
): DutyStatus {
  if (!latestClockInAt) return "OFFLINE";
  const { start, endExclusive } = philippineDayBounds(now, timeZone);
  const t = latestClockInAt.getTime();
  if (t >= start.getTime() && t < endExclusive.getTime()) return "ON_DUTY";
  return "OFFLINE";
}

export function isOnDutyStatus(status: DutyStatus): boolean {
  return status === "ON_DUTY";
}

/**
 * Latest clock-in today per `source_user_id` from the merged DB.
 * Keys are decimal string forms of BigInt ids for easy Map lookups.
 */
export async function loadTodayClockInsBySourceUserId(
  sourceUserIds: ReadonlyArray<bigint | number | string>,
  now: Date = new Date(),
): Promise<Map<string, Date>> {
  const ids = [
    ...new Set(
      sourceUserIds
        .map((id) => {
          try {
            return BigInt(id);
          } catch {
            return null;
          }
        })
        .filter((id): id is bigint => id != null),
    ),
  ];
  if (ids.length === 0) return new Map();

  const { start, endExclusive } = philippineDayBounds(now);

  const rows = await prismaSecondary.mergedAttendanceClockIn.findMany({
    where: {
      sourceUserId: { in: ids },
      clockInAt: { gte: start, lt: endExclusive },
    },
    orderBy: { clockInAt: "desc" },
    select: { sourceUserId: true, clockInAt: true },
  });

  const latest = new Map<string, Date>();
  for (const row of rows) {
    const key = row.sourceUserId.toString();
    if (!latest.has(key)) {
      latest.set(key, row.clockInAt);
    }
  }
  return latest;
}

/**
 * Active merged personnel with today's duty status (pure merge-DB query).
 * Useful for tooling; Activities prefers portal-linked agents for assignment IDs.
 */
export async function listMergedPersonnelDutyStatuses(options?: {
  companyName?: string;
  now?: Date;
}) {
  const now = options?.now ?? new Date();
  const { start, endExclusive } = philippineDayBounds(now);

  const users = await prismaSecondary.mergedUser.findMany({
    where: {
      isActive: true,
      ...(options?.companyName ? { companyName: options.companyName } : {}),
    },
    orderBy: { name: "asc" },
    select: {
      sourceUserId: true,
      name: true,
      email: true,
      companyName: true,
      username: true,
      employeeCode: true,
    },
  });

  const clockIns = await prismaSecondary.mergedAttendanceClockIn.findMany({
    where: {
      sourceUserId: { in: users.map((u) => u.sourceUserId) },
      clockInAt: { gte: start, lt: endExclusive },
    },
    orderBy: { clockInAt: "desc" },
    select: { sourceUserId: true, clockInAt: true },
  });

  const latestByUser = new Map<string, Date>();
  for (const row of clockIns) {
    const key = row.sourceUserId.toString();
    if (!latestByUser.has(key)) latestByUser.set(key, row.clockInAt);
  }

  return users.map((u) => {
    const lastClockInAt = latestByUser.get(u.sourceUserId.toString()) ?? null;
    const dutyStatus = dutyStatusFromLatestClockIn(lastClockInAt, now);
    return {
      sourceUserId: u.sourceUserId.toString(),
      name: u.name,
      email: u.email,
      companyName: u.companyName,
      username: u.username,
      employeeCode: u.employeeCode,
      dutyStatus,
      isOnDuty: isOnDutyStatus(dutyStatus),
      lastClockInAt,
    };
  });
}
