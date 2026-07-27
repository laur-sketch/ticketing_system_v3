import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { rosterTeamNameFilter } from "@/lib/company-roster";
import { computeKpis, parseHelpdeskCadence, parseKpiRangeFromQuery } from "@/lib/kpis";
import { prisma } from "@/lib/prisma";
import { resolveStaffCompanyTeamId } from "@/lib/staff-company-scope";
import { findSessionAgentId } from "@/lib/session-agent";

export async function GET(req: Request) {
  const startedAt = Date.now();
  const { session, unauthorized } = await requireRole(["SuperAdmin", "Admin", "Personnel"]);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(req.url);
  const { from, to } = parseKpiRangeFromQuery(searchParams.get("from"), searchParams.get("to"));

  const operator =
    session?.user?.role === "Personnel"
      ? await findSessionAgentId({ email: session.user.email, name: session.user.name })
      : null;
  const assignedAgentId = session?.user?.role === "Personnel" ? operator?.id ?? "__none__" : undefined;

  /**
   * Company scope uses routed-to team (`ticket.teamId`) — same as Request / Company boards —
   * not assignee designated-company membership.
   */
  let teamId: string | undefined;
  let teamIds: string[] | undefined;
  if (session?.user?.role === "Admin") {
    const scoped = await resolveStaffCompanyTeamId(session.user.email);
    const requested = searchParams.get("companyId")?.trim() || null;
    teamId = scoped ?? requested ?? undefined;
  } else if (session?.user?.role === "SuperAdmin") {
    const requested = searchParams.get("companyId")?.trim() || null;
    if (requested && requested !== "ALL") {
      teamId = requested;
    } else {
      const teams = await prisma.team.findMany({
        where: rosterTeamNameFilter(),
        select: { id: true },
      });
      teamIds = teams.map((t) => t.id);
    }
  }

  const helpdeskCadence = parseHelpdeskCadence(searchParams.get("helpdeskCadence"));
  const kpis = await computeKpis({ from, to }, { assignedAgentId, teamId, teamIds }, { helpdeskCadence });
  if (process.env.NODE_ENV === "development") {
    console.info(
      `[perf] GET /api/kpis ${Date.now() - startedAt}ms from=${from.toISOString()} to=${to.toISOString()}`,
    );
  }
  return NextResponse.json(kpis, {
    headers: {
      "cache-control": "private, no-store, max-age=0",
    },
  });
}
