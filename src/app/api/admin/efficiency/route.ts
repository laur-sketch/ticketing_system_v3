import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import type { EfficiencyFrequency } from "@/lib/efficiency/user-efficiency-breakdown";
import {
  createEfficiencyQueryClient,
  getEfficiencyLeaderboard,
  getUserEfficiencyForPeriod,
  getUserEfficiencyTaskBreakdown,
} from "@/lib/efficiency/user-efficiency-queries";

const FREQ = new Set(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "LIFETIME"]);

/**
 * GET /api/admin/efficiency?mode=leaderboard|user|details
 *  &periodKey=2026-07&frequency=MONTHLY
 *  &sourceUserId=1671 (for user/details)
 *
 * Reads from MySQL mergedatabase (task / user efficiencies).
 * Ticket activity + ticket metrics remain in PostgreSQL.
 */
export async function GET(req: Request) {
  const { unauthorized } = await requireRole(["SuperAdmin", "Admin"]);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(req.url);
  const mode = (searchParams.get("mode") ?? "leaderboard").trim().toLowerCase();
  const periodKey = searchParams.get("periodKey")?.trim() ?? "";
  const frequencyRaw = (searchParams.get("frequency") ?? "MONTHLY").trim().toUpperCase();
  if (!periodKey || !FREQ.has(frequencyRaw)) {
    return NextResponse.json(
      {
        error:
          "periodKey and frequency (DAILY|WEEKLY|MONTHLY|QUARTERLY|LIFETIME) are required.",
      },
      { status: 400 },
    );
  }
  const frequency = frequencyRaw as EfficiencyFrequency | "LIFETIME";
  const db = createEfficiencyQueryClient();

  try {
    if (mode === "personnel") {
      // Personnel verification view: breakdown rows joined to merged_users so
      // names/companies come straight from mergedatabase-demo.
      const rows = await db.mergedUserEfficiencyBreakdown.findMany({
        where: { periodKey, frequency },
        orderBy: [{ overallEfficiency: "desc" }, { displayName: "asc" }],
        include: { user: { select: { name: true, companyName: true } } },
      });
      return NextResponse.json({
        periodKey,
        frequency,
        source: "mergedatabase",
        rows: rows.map((r) => ({
          sourceUserId: r.sourceUserId.toString(),
          name: r.user?.name?.trim() || r.displayName,
          companyName: r.user?.companyName ?? null,
          totalTasks: r.totalTasks,
          completedTasks: r.completedTasks,
          delayedTasks: r.delayedTasks,
          ticketsClosed: r.ticketsClosed,
          ticketsPending: r.ticketsPending,
          taskEfficiency: r.taskEfficiency != null ? Number(r.taskEfficiency) : null,
          ticketEfficiency: r.ticketEfficiency != null ? Number(r.ticketEfficiency) : null,
          overallEfficiency: Number(r.overallEfficiency),
          onTimeCompletionRate:
            r.onTimeCompletionRate != null ? Number(r.onTimeCompletionRate) : null,
          delayPenaltyTotal: r.delayPenaltyTotal ?? 0,
          taskEfficiencyBeforePenalty:
            r.taskEfficiencyBeforePenalty != null
              ? Number(r.taskEfficiencyBeforePenalty)
              : null,
          computedAt: r.computedAt.toISOString(),
        })),
      });
    }

    if (mode === "leaderboard") {
      const limit = Number(searchParams.get("limit") ?? "50");
      const rows = await getEfficiencyLeaderboard(db, {
        periodKey,
        frequency,
        limit: Number.isFinite(limit) ? limit : 50,
      });
      return NextResponse.json({
        periodKey,
        frequency,
        source: "mergedatabase",
        rows: rows.map((r) => ({
          ...r,
          sourceUserId: r.sourceUserId.toString(),
          overallEfficiency: Number(r.overallEfficiency),
          taskEfficiency: r.taskEfficiency != null ? Number(r.taskEfficiency) : null,
          ticketEfficiency: r.ticketEfficiency != null ? Number(r.ticketEfficiency) : null,
          onTimeCompletionRate:
            r.onTimeCompletionRate != null ? Number(r.onTimeCompletionRate) : null,
        })),
      });
    }

    const sourceUserId = searchParams.get("sourceUserId")?.trim() ?? "";
    if (!/^\d+$/.test(sourceUserId)) {
      return NextResponse.json({ error: "sourceUserId is required." }, { status: 400 });
    }

    if (mode === "details") {
      const details = await getUserEfficiencyTaskBreakdown(db, {
        sourceUserId,
        periodKey,
        frequency,
      });
      return NextResponse.json({
        sourceUserId,
        periodKey,
        frequency,
        source: "mergedatabase",
        details: details.map((d: (typeof details)[number]) => ({
          ...d,
          efficiencyContribution:
            d.efficiencyContribution != null ? Number(d.efficiencyContribution) : null,
        })),
      });
    }

    const row = await getUserEfficiencyForPeriod(db, {
      sourceUserId,
      periodKey,
      frequency,
      includeDetails: searchParams.get("includeDetails") === "1",
    });
    if (!row) {
      return NextResponse.json({ error: "No breakdown for this user/period." }, { status: 404 });
    }
    return NextResponse.json({
      ...row,
      source: "mergedatabase",
      sourceUserId: row.sourceUserId.toString(),
      overallEfficiency: Number(row.overallEfficiency),
      taskEfficiency: row.taskEfficiency != null ? Number(row.taskEfficiency) : null,
      ticketEfficiency: row.ticketEfficiency != null ? Number(row.ticketEfficiency) : null,
      onTimeCompletionRate:
        row.onTimeCompletionRate != null ? Number(row.onTimeCompletionRate) : null,
      averageTaskCompletionHours:
        row.averageTaskCompletionHours != null
          ? Number(row.averageTaskCompletionHours)
          : null,
      efficiencyScore: row.efficiencyScore != null ? Number(row.efficiencyScore) : null,
      delayPenaltyTotal: row.delayPenaltyTotal ?? 0,
      taskEfficiencyBeforePenalty:
        row.taskEfficiencyBeforePenalty != null
          ? Number(row.taskEfficiencyBeforePenalty)
          : null,
    });
  } finally {
    await db.$disconnect();
  }
}
