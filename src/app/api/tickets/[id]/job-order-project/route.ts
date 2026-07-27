import type { Prisma } from "@prisma/client/primary";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/access";
import {
  buildJobOrderProjectPrefill,
  projectDisplayName,
} from "@/lib/job-order-project";
import { isItProjectImplementationPillar } from "@/lib/it-task-pillar-titles";
import { isProjectTask } from "@/lib/kpi-subkpis";
import { prisma } from "@/lib/prisma";
import { loadAgentIdsForCompanyTeam } from "@/lib/staff-company-scope";
import { findSessionAgentWithTeam } from "@/lib/session-agent";
import { portalCompanyAdminPrivilegesForEmail } from "@/lib/portal-staff";

/**
 * GET /api/tickets/[id]/job-order-project
 * Prefill + optional company-scoped project list for Job Order linking.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!["SuperAdmin", "Admin", "Personnel"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const prefill = await buildJobOrderProjectPrefill(id);
  if (!prefill) {
    return NextResponse.json({ error: "Job Order not found." }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const listProjects = searchParams.get("listProjects") === "1";

  let projects: Array<{
    id: string;
    displayName: string;
    title: string;
    mainTask: string | null;
    itProjectName: string | null;
  }> = [];

  if (listProjects) {
    const roleIsAdmin = ["SuperAdmin", "Admin"].includes(session.user.role);
    const companyCoordinator = await portalCompanyAdminPrivilegesForEmail(session.user.email);
    const canAssignWork = roleIsAdmin || companyCoordinator;
    const operator = await findSessionAgentWithTeam({
      email: session.user.email,
      name: session.user.name,
    });
    const companyTeamId = prefill.teamId?.trim() || null;

    let where: Prisma.KpiMaintenanceWhereInput = {};
    if (canAssignWork && companyTeamId) {
      const agentIds = await loadAgentIdsForCompanyTeam(companyTeamId);
      const companyScopeOr: Prisma.KpiMaintenanceWhereInput[] = [
        { assignedAgentId: null, scopedCompanyTeamId: companyTeamId },
      ];
      if (agentIds.length > 0) {
        companyScopeOr.unshift({ assignedAgentId: { in: agentIds } });
      }
      where = { OR: companyScopeOr };
    } else if (!canAssignWork) {
      const operatorId = operator?.id ?? null;
      where = operatorId ? { assignedAgentId: operatorId } : { id: "__none__" };
    }

    const rows = await prisma.kpiMaintenance.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: {
        id: true,
        title: true,
        mainTask: true,
        itProjectName: true,
        subKpis: true,
      },
    });

    projects = rows
      .filter((r) => isItProjectImplementationPillar(r.title) || isProjectTask(r.subKpis))
      .map((r) => ({
        id: r.id,
        displayName: projectDisplayName(r),
        title: r.title,
        mainTask: r.mainTask,
        itProjectName: r.itProjectName,
      }));
  }

  let linkedProject = null as null | {
    id: string;
    displayName: string;
    title: string;
    mainTask: string | null;
    itProjectName: string | null;
  };
  if (prefill.alreadyLinkedProjectId) {
    const row = await prisma.kpiMaintenance.findUnique({
      where: { id: prefill.alreadyLinkedProjectId },
      select: { id: true, title: true, mainTask: true, itProjectName: true },
    });
    if (row) {
      linkedProject = {
        id: row.id,
        displayName: projectDisplayName(row),
        title: row.title,
        mainTask: row.mainTask,
        itProjectName: row.itProjectName,
      };
    }
  }

  return NextResponse.json({
    prefill,
    linkedProject,
    projects,
  });
}
