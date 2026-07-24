import type { Prisma } from "@prisma/client/primary";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { loadOnDutyAgentIdSet } from "@/lib/load-on-duty-snapshot";
import { prisma } from "@/lib/prisma";
import { resolveOpsPermissions } from "@/lib/ops-permissions";
import {
  loadEffectiveCompaniesByPortalEmail,
  resolveAgentDesignatedCompanyId,
  type EffectiveAssignmentCompany,
} from "@/lib/staff-company-scope";

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
  };

  const portals = await prisma.portalAccount.findMany({
    where: portalWhere,
    select: {
      email: true,
      role: true,
      headPrivileges: true,
      mergedSourceUserId: true,
      staffDesignatedCompany: { select: { id: true, name: true } },
    },
  });

  // Company per staff member follows the personnel tab (merged_users.company_name
  // first, portal designated company as legacy fallback).
  const companiesByEmail = await loadEffectiveCompaniesByPortalEmail(portals);

  let companyIdFilter: string | null = null;
  const anyCompany =
    searchParams.get("anyCompany") === "1" || searchParams.get("anyCompany") === "true";
  if (anyCompany) {
    // Explicit cross-company listing (e.g. Travel Order Level 2+ approvers).
    companyIdFilter = null;
  } else if (forMainAgentId) {
    const mainCompanyId = await resolveAgentDesignatedCompanyId(forMainAgentId);
    if (!mainCompanyId) return NextResponse.json([]);
    companyIdFilter = mainCompanyId;
  } else if (perms.canAssignWork && companyTeamId && companyTeamId !== "ALL") {
    companyIdFilter = companyTeamId;
  } else if (!perms.canAssignWork && perms.operator?.id) {
    // Personnel only see colleagues in their own company.
    companyIdFilter = await resolveAgentDesignatedCompanyId(perms.operator.id);
    if (!companyIdFilter) return NextResponse.json([]);
  }

  const eligiblePortals = portals.filter((p) => {
    const email = p.email.trim().toLowerCase();
    if (!email) return false;
    const company = companiesByEmail.get(email);
    // Assignees must belong to a company (merged or designated) to appear.
    if (!company) return false;
    if (companyIdFilter) return company.id === companyIdFilter;
    return true;
  });

  const staffEmails = eligiblePortals.map((p) => p.email.trim().toLowerCase()).filter(Boolean);

  const agents = await prisma.agent.findMany({
    where: staffEmails.length > 0 ? { email: { in: staffEmails } } : { id: "__none__" },
    orderBy: { name: "asc" },
    include: { team: true },
  });

  const onDutyIds = await loadOnDutyAgentIdSet(agents.map((a) => a.id));

  const headByEmail = new Map(eligiblePortals.map((p) => [p.email.toLowerCase(), p.headPrivileges]));
  const roleByEmail = new Map(eligiblePortals.map((p) => [p.email.toLowerCase(), p.role] as const));

  let payload = agents.map((a) => {
    const emailKey = a.email.toLowerCase();
    const isOnDuty = onDutyIds.has(a.id);
    const assignmentCompany: EffectiveAssignmentCompany | null = companiesByEmail.get(emailKey) ?? null;
    return {
      ...a,
      portalRole: roleByEmail.get(emailKey) ?? null,
      headPrivileges: headByEmail.get(emailKey) ?? false,
      assignmentCompany,
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
