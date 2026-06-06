import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { resolveOpsPermissions } from "@/lib/ops-permissions";

export async function GET(req: Request) {
  const { session, unauthorized } = await requireRole(["Admin", "Personnel"]);
  if (unauthorized || !session) return unauthorized;

  const perms = await resolveOpsPermissions(session);
  const companyTeamId = new URL(req.url).searchParams.get("company")?.trim();

  const portalWhere: Prisma.PortalAccountWhereInput = {
    role: { in: ["Admin", "Personnel"] },
    accountStatus: "ACTIVE",
    staffDesignatedCompanyId: { not: null },
  };
  if (perms.canAssignWork && companyTeamId && companyTeamId !== "ALL") {
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
  const headByEmail = new Map(portals.map((p) => [p.email.toLowerCase(), p.headPrivileges]));
  const roleByEmail = new Map(portals.map((p) => [p.email.toLowerCase(), p.role] as const));
  const assignmentCompanyByEmail = new Map(
    portals.map((p) => [p.email.toLowerCase(), p.staffDesignatedCompany ?? null] as const),
  );
  const payload = agents.map((a) => ({
    ...a,
    portalRole: roleByEmail.get(a.email.toLowerCase()) ?? null,
    headPrivileges: headByEmail.get(a.email.toLowerCase()) ?? false,
    assignmentCompany: assignmentCompanyByEmail.get(a.email.toLowerCase()) ?? null,
  }));
  return NextResponse.json(payload);
}
