import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import {
  computeTaskMetrics,
  parseHelpdeskCadence,
  parseKpiRangeFromQuery,
} from "@/lib/kpis";
import { normalizeTimeZone } from "@/lib/kpi-recurrence";
import { prisma } from "@/lib/prisma";
import { findSessionAgentId } from "@/lib/session-agent";
import { resolveStaffCompanyTeamId } from "@/lib/staff-company-scope";

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
    const companyId =
    session?.user?.role === "Admin"
      ? (await resolveStaffCompanyTeamId(session.user.email)) ?? "__none__"
      : session?.user?.role === "SuperAdmin"
        ? searchParams.get("companyId")?.trim() || null
        : null;
  const assignedAgentIds = companyId && companyId !== "ALL" && session?.user?.role !== "SuperAdmin" ? await agentIdsForCompany(companyId) : undefined;

  const timeZone = normalizeTimeZone(searchParams.get("tz"));
  const payload = await computeTaskMetrics(
    { from, to },
    { assignedAgentId, assignedAgentIds },
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

async function agentIdsForCompany(companyId: string) {
  const accounts = await prisma.portalAccount.findMany({
    where: { staffDesignatedCompanyId: companyId },
    select: { email: true },
  });
  const emails = accounts.map((account) => account.email.trim().toLowerCase()).filter(Boolean);
  if (emails.length === 0) return [];
  const agents = await prisma.agent.findMany({
    where: { email: { in: emails } },
    select: { id: true },
  });
  return agents.map((agent) => agent.id);
}
