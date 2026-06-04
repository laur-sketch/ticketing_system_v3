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

  let agentWhere: Prisma.AgentWhereInput | undefined;
  if (perms.canAssignWork && companyTeamId && companyTeamId !== "ALL") {
    const portals = await prisma.portalAccount.findMany({
      where: { staffDesignatedCompanyId: companyTeamId },
      select: { email: true },
    });
    const emails = portals.map((p) => p.email.trim().toLowerCase()).filter(Boolean);
    agentWhere = emails.length > 0 ? { email: { in: emails } } : { id: "__none__" };
  }

  const agents = await prisma.agent.findMany({
    where: agentWhere,
    orderBy: { name: "asc" },
    include: { team: true },
  });
  const portals = await prisma.portalAccount.findMany({
    where: { email: { in: agents.map((a) => a.email) } },
    select: {
      email: true,
      headPrivileges: true,
      staffDesignatedCompany: { select: { id: true, name: true } },
    },
  });
  const headByEmail = new Map(portals.map((p) => [p.email.toLowerCase(), p.headPrivileges]));
  const assignmentCompanyByEmail = new Map(
    portals.map((p) => [p.email.toLowerCase(), p.staffDesignatedCompany ?? null] as const),
  );
  const payload = agents.map((a) => ({
    ...a,
    headPrivileges: headByEmail.get(a.email.toLowerCase()) ?? false,
    assignmentCompany: assignmentCompanyByEmail.get(a.email.toLowerCase()) ?? null,
  }));
  return NextResponse.json(payload);
}
