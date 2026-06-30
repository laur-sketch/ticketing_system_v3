import { DateTime } from "luxon";
import { DEFAULT_TIME_ZONE, normalizeTimeZone } from "@/lib/kpi-recurrence";

/** Idle timeout for Personnel, Customer, and other non-admin staff sessions. */
export const SESSION_IDLE_MAX_AGE_SECONDS = 30 * 60;

/** JWT cookie upper bound (admin sessions may run until midnight). */
export const SESSION_JWT_MAX_AGE_SECONDS = 24 * 60 * 60;

export function isMidnightLogoutRole(role: string | null | undefined): boolean {
  return role === "SuperAdmin" || role === "Admin";
}

/** Next local midnight (start of tomorrow) in the app timezone, as Unix seconds. */
export function nextMidnightUnixSeconds(
  nowUnixSeconds: number,
  timeZone: string = DEFAULT_TIME_ZONE,
): number {
  const zone = normalizeTimeZone(timeZone);
  const now = DateTime.fromSeconds(nowUnixSeconds, { zone });
  return Math.floor(now.startOf("day").plus({ days: 1 }).toSeconds());
}

export function computeSessionExpiresAt(args: {
  role: string | null | undefined;
  nowUnixSeconds: number;
  existingSessionExpiresAt?: number;
  isNewLogin: boolean;
  timeZone?: string;
}): number {
  const { role, nowUnixSeconds, existingSessionExpiresAt, isNewLogin, timeZone } = args;

  if (isMidnightLogoutRole(role)) {
    if (
      !isNewLogin &&
      typeof existingSessionExpiresAt === "number" &&
      nowUnixSeconds < existingSessionExpiresAt
    ) {
      return existingSessionExpiresAt;
    }
    return nextMidnightUnixSeconds(nowUnixSeconds, timeZone);
  }

  if (isNewLogin) {
    return nowUnixSeconds + SESSION_IDLE_MAX_AGE_SECONDS;
  }

  if (typeof existingSessionExpiresAt === "number") {
    return existingSessionExpiresAt;
  }

  return nowUnixSeconds + SESSION_IDLE_MAX_AGE_SECONDS;
}
