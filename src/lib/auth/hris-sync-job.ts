import { runHrisAttendanceSync } from "@/lib/auth/hris-attendance-sync";
import {
  canonicalProfileFromMerged,
  syncPortalProfile,
} from "@/lib/auth/sync-portal-profile";
import { prismaAuth, prismaSecondary } from "@/lib/prisma";

type MergedRow = {
  source_user_id: bigint;
  username: string | null;
  name: string;
  email: string | null;
  role: string;
  company_name: string | null;
  company_id: bigint | null;
  position: string | null;
  updated_at: Date | null;
};

export type HrisSyncResult = {
  total: number;
  synced: number;
  failed: number;
  durationMs: number;
  attendanceUpserted?: number;
};

export async function runHrisPortalSync(): Promise<HrisSyncResult> {
  const start = Date.now();

  // Pull current clock-ins from the live HRIS DB first, so On Duty is fresh.
  let attendanceUpserted = 0;
  try {
    const att = await runHrisAttendanceSync();
    attendanceUpserted = att.upserted;
    if (att.skipped) {
      console.warn(`[hris-sync-job] attendance sync skipped: ${att.skipped}`);
    }
  } catch (e) {
    console.error("[hris-sync-job] attendance sync failed", e);
  }

  const lastSync = await prismaAuth.user.aggregate({
    _max: { lastSyncedAt: true },
  });
  const since = lastSync._max.lastSyncedAt ?? new Date(0);

  const rows = await prismaSecondary.$queryRaw<MergedRow[]>`
    SELECT
      source_user_id,
      username,
      name,
      email,
      role,
      company_name,
      company_id,
      position,
      updated_at
    FROM merged_users
    WHERE is_active = 1
      AND (updated_at IS NULL OR updated_at >= ${since})
    ORDER BY source_user_id
  `;

  let synced = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const profile = canonicalProfileFromMerged({
        sourceUserId: row.source_user_id,
        username: row.username,
        name: row.name,
        email: row.email,
        role: row.role,
        companyName: row.company_name,
        companyId: row.company_id,
        position: row.position,
      });
      await syncPortalProfile(profile, "hris");
      synced++;
    } catch (e) {
      failed++;
      console.error(`[hris-sync-job] failed source_user_id=${row.source_user_id}`, e);
    }
  }

  return { total: rows.length, synced, failed, durationMs: Date.now() - start, attendanceUpserted };
}
