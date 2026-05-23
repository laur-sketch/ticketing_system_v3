import { NextResponse } from "next/server";
import { requireSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { findSessionAgentWithTeam } from "@/lib/session-agent";
import { isAdminPortalRole } from "@/lib/staff-role";
import { rosterTeamNameFilter, sortByRosterOrder } from "@/lib/company-roster";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: {
      id: true,
      assignedAgentId: true,
      assignedAgent: { select: { teamId: true } },
    },
  });
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const operator = await findSessionAgentWithTeam({ email: session.user.email, name: session.user.name });
  if (session.user.role !== "Personnel" || !operator || operator.id !== ticket.assignedAgentId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const companyTeamId = ticket.assignedAgent?.teamId ?? operator.teamId;
  if (!companyTeamId) {
    return NextResponse.json({ recipients: [{ id: "__SUPERADMIN__", name: "SuperAdmin", email: "" }] });
  }

  const portalRows = await prisma.portalAccount.findMany({
    where: {
      staffDesignatedCompanyId: companyTeamId,
      accountStatus: "ACTIVE",
    },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });

  const admins = portalRows.filter((p) => isAdminPortalRole(p.role));
  const destinationCompanies = sortByRosterOrder(
    await prisma.team.findMany({
      where: {
        ...rosterTeamNameFilter(),
        id: { not: companyTeamId },
      },
      select: { id: true, name: true },
    }),
  );

  return NextResponse.json({
    recipients: [
      ...admins.map((a) => ({ id: a.id, name: a.name, email: a.email })),
      { id: "__SUPERADMIN__", name: "SuperAdmin (operations)", email: "" },
    ],
    destinationCompanies,
  });
}
