import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { loadHrisAssignableStaff } from "@/lib/hris-staff-roster";
import { loadOnDutyAgentIdSet } from "@/lib/load-on-duty-snapshot";
import { prisma } from "@/lib/prisma";
import { resolveOpsPermissions } from "@/lib/ops-permissions";
import { resolveAgentDesignatedCompanyId } from "@/lib/staff-company-scope";
import { rosterTeamNameFilter } from "@/lib/company-roster";

export async function GET(req: Request) {
  const { session, unauthorized } = await requireRole(["Admin", "Personnel"]);
  if (unauthorized || !session) return unauthorized;

  const perms = await resolveOpsPermissions(session);
  const searchParams = new URL(req.url).searchParams;
  const companyTeamId = searchParams.get("company")?.trim();
  const forMainAgentId = searchParams.get("forMainAgentId")?.trim();
  /** When `onDutyOnly=1`, omit Offline assignees (merged DB clock-in). */
  const onDutyOnly = searchParams.get("onDutyOnly") === "1" || searchParams.get("onDutyOnly") === "true";

  let companyIdFilter: string | null = null;
  const anyCompany =
    searchParams.get("anyCompany") === "1" || searchParams.get("anyCompany") === "true";
  if (anyCompany) {
    // Explicit cross-company listing (Travel Order approvers/confirmers/travelers, etc.).
    companyIdFilter = null;
  } else if (forMainAgentId) {
    const mainCompanyId = await resolveAgentDesignatedCompanyId(forMainAgentId);
    if (!mainCompanyId) return NextResponse.json([]);
    companyIdFilter = mainCompanyId;
  } else if (companyTeamId && companyTeamId !== "ALL") {
    // Honor explicit company for Admin and Personnel (RFP send-to Accounting/Finance, etc.).
    const team = await prisma.team.findFirst({
      where: { id: companyTeamId, ...rosterTeamNameFilter() },
      select: { id: true },
    });
    if (!team) return NextResponse.json([]);
    companyIdFilter = team.id;
  } else if (!perms.canAssignWork && perms.operator?.id) {
    // Personnel with no company param: colleagues in their own company only.
    companyIdFilter = await resolveAgentDesignatedCompanyId(perms.operator.id);
    if (!companyIdFilter) return NextResponse.json([]);
  }

  // HRIS merged_users is the roster SoT (same as Activities / Personnel).
  const staff = await loadHrisAssignableStaff({
    companyTeamId: companyIdFilter,
  });

  const agentIds = staff.map((s) => s.agentId);
  const agents = agentIds.length
    ? await prisma.agent.findMany({
        where: { id: { in: agentIds } },
        include: { team: true },
      })
    : [];
  const agentById = new Map(agents.map((a) => [a.id, a]));
  const onDutyIds = await loadOnDutyAgentIdSet(agentIds);

  let payload = staff
    .map((s) => {
      const agent = agentById.get(s.agentId);
      if (!agent) return null;
      const isOnDuty = onDutyIds.has(s.agentId);
      return {
        ...agent,
        portalRole: s.portalRole,
        headPrivileges: s.headPrivileges,
        assignmentCompany: s.assignmentCompany,
        isOnDuty,
        dutyStatus: isOnDuty ? ("ON_DUTY" as const) : ("OFFLINE" as const),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  if (onDutyOnly) {
    payload = payload.filter((a) => a.isOnDuty);
  }

  return NextResponse.json(payload, {
    headers: { "cache-control": "private, max-age=5, stale-while-revalidate=10" },
  });
}
