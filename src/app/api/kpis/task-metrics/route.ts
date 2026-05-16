import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import {
  computeTaskMetrics,
  parseHelpdeskCadence,
  parseKpiRangeFromQuery,
} from "@/lib/kpis";
import { normalizeTimeZone } from "@/lib/kpi-recurrence";
import { findSessionAgentId } from "@/lib/session-agent";

export async function GET(req: Request) {
  const startedAt = Date.now();
  const { session, unauthorized } = await requireRole(["SuperAdmin", "Admin", "Personnel"]);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(req.url);
  const { from, to } = parseKpiRangeFromQuery(searchParams.get("from"), searchParams.get("to"));
  const helpdeskCadence = parseHelpdeskCadence(searchParams.get("helpdeskCadence"));

  const operator =
    session?.user?.role === "Personnel"
      ? await findSessionAgentId({ email: session.user.email, name: session.user.name })
      : null;
  const assignedAgentId = session?.user?.role === "Personnel" ? operator?.id ?? "__none__" : undefined;

  const timeZone = normalizeTimeZone(searchParams.get("tz"));
  const payload = await computeTaskMetrics(
    { from, to },
    { assignedAgentId },
    helpdeskCadence,
    { timeZone },
  );
  if (process.env.NODE_ENV === "development") {
    console.info(
      `[perf] GET /api/kpis/task-metrics ${Date.now() - startedAt}ms cadence=${helpdeskCadence} from=${from.toISOString()} to=${to.toISOString()}`,
    );
  }
  return NextResponse.json(payload, {
    headers: {
      "cache-control": "private, no-store, max-age=0",
    },
  });
}
