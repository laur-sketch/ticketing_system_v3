import type { Prisma } from "@prisma/client/primary";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { loadOnDutyAgentIdSet } from "@/lib/load-on-duty-snapshot";
import { prisma } from "@/lib/prisma";
import { resolveOpsPermissions } from "@/lib/ops-permissions";
import { resolveAgentDesignatedCompanyId } from "@/lib/staff-company-scope";

export async function GET(req: Request) {
  const { session, unauthorized } = await requireRole(["Admin", "Personnel"]);
  if (unauthorized || !session) return unauthorized;

  const perms = await resolveOpsPermissions(session);
  const searchParams = new URL(req.url).searchParams;
  const companyTeamId = searchParams.get("company")?.trim();
  const forMainAgentId = searchParams.get("forMainAgentId")?.trim();
  /** When `onDutyOnly=1`, omit Offline assignees (merged DB clock-in). */
  const onDutyOnly = searchParams.get("onDutyOnly") === "1" || searchParams.get("onDutyOnly") === "true";

  const portalWhere: Prisma.PortalAccountWhereInput = {
    role: { in: ["Admin", "Personnel"] },
    accountStatus: "ACTIVE",
    mergedSourceUserId: { not: null },
    staffDesignatedCompanyId: { not: null },
  };
  if (forMainAgentId) {
    const mainCompanyId = await resolveAgentDesignatedCompanyId(forMainAgentId);
    if (!mainCompanyId) return NextResponse.json([]);
    portalWhere.staffDesignatedCompanyId = mainCompanyId;
  } else if (perms.canAssignWork && companyTeamId && companyTeamId !== "ALL") {
    portalWhere.staffDesignatedCompanyId = companyTeamId;
  }

  const portals = await prisma.portalAccount.findMany({
    where: portalWhere,
    select: {
      email: true,
      role: true,
      headPrivileges: true,
      staffDesignatedCompany: { select: { id: true, name: true } },
    },
  });
  const staffEmails = portals.map((p) => p.email.trim().toLowerCase()).filter(Boolean);

  const agents = await prisma.agent.findMany({
    where: staffEmails.length > 0 ? { email: { in: staffEmails } } : { id: "__none__" },
    orderBy: { name: "asc" },
    include: { team: true },
  });

  const onDutyIds = await loadOnDutyAgentIdSet(agents.map((a) => a.id));

  const headByEmail = new Map(portals.map((p) => [p.email.toLowerCase(), p.headPrivileges]));
  const roleByEmail = new Map(portals.map((p) => [p.email.toLowerCase(), p.role] as const));
  const assignmentCompanyByEmail = new Map(
    portals.map((p) => [p.email.toLowerCase(), p.staffDesignatedCompany ?? null] as const),
  );

  let payload = agents.map((a) => {
    const isOnDuty = onDutyIds.has(a.id);
    return {
      ...a,
      portalRole: roleByEmail.get(a.email.toLowerCase()) ?? null,
      headPrivileges: headByEmail.get(a.email.toLowerCase()) ?? false,
      assignmentCompany: assignmentCompanyByEmail.get(a.email.toLowerCase()) ?? null,
      isOnDuty,
      dutyStatus: isOnDuty ? ("ON_DUTY" as const) : ("OFFLINE" as const),
    };
  });

  if (onDutyOnly) {
    payload = payload.filter((a) => a.isOnDuty);
  }

  return NextResponse.json(payload, {
    headers: { "cache-control": "private, max-age=5, stale-while-revalidate=10" },
  });
}
