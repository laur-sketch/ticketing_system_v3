import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { orgChartLayerById } from "@/app/admin/superadmin-settings/org-chart-layers";
import {
  resolveAgentIdsForPositionCode,
  resolveDirectManagerAgentId,
  resolveMergedSourceUserIdForSessionEmail,
} from "@/lib/approval-position-resolver";
import { loadHrisAssignableStaff } from "@/lib/hris-staff-roster";
import { loadOnDutyAgentIdSet } from "@/lib/load-on-duty-snapshot";
import { prisma } from "@/lib/prisma";
import { resolveOpsPermissions } from "@/lib/ops-permissions";
import { resolveAgentDesignatedCompanyId } from "@/lib/staff-company-scope";
import { rosterTeamNameFilter } from "@/lib/company-roster";
import { resolveAgentIdsForOrgChartSection } from "@/lib/org-chart-section-roster";

export async function GET(req: Request) {
  const { session, unauthorized } = await requireRole(["Admin", "Personnel"]);
  if (unauthorized || !session) return unauthorized;

  const perms = await resolveOpsPermissions(session);
  const searchParams = new URL(req.url).searchParams;
  const companyTeamId = searchParams.get("company")?.trim();
  const orgChartSectionId = searchParams.get("section")?.trim();
  const forMainAgentId = searchParams.get("forMainAgentId")?.trim();
  /** When `onDutyOnly=1`, omit Offline assignees (merged DB clock-in). */
  const onDutyOnly = searchParams.get("onDutyOnly") === "1" || searchParams.get("onDutyOnly") === "true";
  const positionCode = searchParams.get("positionCode")?.trim().toUpperCase().replace(/\s+/g, "_");
  const positionLevelRaw = searchParams.get("positionLevel")?.trim();
  const positionLevel = positionLevelRaw && /^\d+$/.test(positionLevelRaw) ? Number(positionLevelRaw) : null;
  const assignToManager =
    searchParams.get("assignToManager") === "1" || searchParams.get("assignToManager") === "true";

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

  const [staff, orgNodes] = await Promise.all([
    loadHrisAssignableStaff({
      companyTeamId: companyIdFilter,
    }),
    prisma.orgChartNode.findMany({
      select: { id: true, parentId: true, mergedSourceUserId: true },
    }),
  ]);

  const layerByNodeId = orgChartLayerById(orgNodes);
  const orgChartLayerByMergedId = new Map<string, number>();
  for (const node of orgNodes) {
    orgChartLayerByMergedId.set(node.mergedSourceUserId, layerByNodeId.get(node.id) ?? 1);
  }

  const agentIds = staff.map((s) => s.agentId);
  const agents = agentIds.length
    ? await prisma.agent.findMany({
        where: { id: { in: agentIds } },
        include: { team: true },
      })
    : [];
  const agentById = new Map(agents.map((a) => [a.id, a]));
  const agentEmails = agents
    .map((a) => a.email?.trim().toLowerCase())
    .filter((email): email is string => Boolean(email));
  const portalProfiles = agentEmails.length
    ? await prisma.portalAccount.findMany({
        where: { email: { in: agentEmails } },
        select: {
          email: true,
          profileImage: true,
          profileImageZoom: true,
          profileImagePosX: true,
          profileImagePosY: true,
        },
      })
    : [];
  const profileByEmail = new Map(portalProfiles.map((p) => [p.email.trim().toLowerCase(), p]));
  const onDutyIds = await loadOnDutyAgentIdSet(agentIds);

  let payload = staff
    .map((s) => {
      const agent = agentById.get(s.agentId);
      if (!agent) return null;
      const isOnDuty = onDutyIds.has(s.agentId);
      const profile = profileByEmail.get(agent.email?.trim().toLowerCase() ?? "");
      return {
        ...agent,
        portalRole: s.portalRole,
        headPrivileges: s.headPrivileges,
        assignmentCompany: s.assignmentCompany,
        isOnDuty,
        dutyStatus: isOnDuty ? ("ON_DUTY" as const) : ("OFFLINE" as const),
        profileImage: profile?.profileImage ?? null,
        profileImageZoom: profile?.profileImageZoom ?? 1,
        profileImagePosX: profile?.profileImagePosX ?? 50,
        profileImagePosY: profile?.profileImagePosY ?? 50,
        orgChartLayer: orgChartLayerByMergedId.get(s.mergedSourceUserId) ?? null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  if (onDutyOnly) {
    payload = payload.filter((a) => a.isOnDuty);
  }

  if (orgChartSectionId) {
    const sectionAgentIds = new Set(await resolveAgentIdsForOrgChartSection(orgChartSectionId));
    payload = payload.filter((row) => sectionAgentIds.has(row.id));
  }

  if (positionCode) {
    const positionAgentIds = await resolveAgentIdsForPositionCode({
      code: positionCode,
      companyTeamId: companyIdFilter,
    });
    const allowed = new Set(positionAgentIds);
    payload = payload.filter((row) => allowed.has(row.id));
  } else if (positionLevel != null) {
    const positionsAtLevel = await prisma.position.findMany({
      where: { level: positionLevel, isActive: true },
      select: { id: true },
    });
    if (positionsAtLevel.length === 0) {
      payload = [];
    } else {
      const assignments = await prisma.positionAssignment.findMany({
        where: { positionId: { in: positionsAtLevel.map((row) => row.id) } },
        select: { mergedSourceUserId: true, companyTeamId: true },
      });
      const mergedIds = new Set(
        assignments
          .filter((row) => !companyIdFilter || row.companyTeamId == null || row.companyTeamId === companyIdFilter)
          .map((row) => row.mergedSourceUserId),
      );
      payload = payload.filter((row) => {
        const staffRow = staff.find((s) => s.agentId === row.id);
        return staffRow ? mergedIds.has(staffRow.mergedSourceUserId) : false;
      });
    }
  }

  if (assignToManager) {
    const mergedId = await resolveMergedSourceUserIdForSessionEmail(session.user.email);
    if (!mergedId) {
      payload = [];
    } else {
      const managerAgentId = await resolveDirectManagerAgentId({
        mergedSourceUserId: mergedId,
        companyTeamId: companyIdFilter,
      });
      payload = managerAgentId ? payload.filter((row) => row.id === managerAgentId) : [];
    }
  }

  return NextResponse.json(payload, {
    headers: { "cache-control": "private, max-age=5, stale-while-revalidate=10" },
  });
}
