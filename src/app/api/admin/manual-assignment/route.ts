import { NextResponse } from "next/server";
import { requireSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { portalCompanyAdminPrivilegesForEmail } from "@/lib/portal-staff";
import { resolveStaffCompanyTeamId } from "@/lib/staff-company-scope";
import { isStaffPortalRole } from "@/lib/staff-role";
import { logActivity, touchFirstResponse } from "@/lib/ticket-actions";

type AssignBody = {
  ticketId?: string;
  agentId?: string;
  portalAccountId?: string;
};

async function getDefaultTeamId() {
  const teams = await prisma.team.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  const preferred = teams.find((t) => t.name.toLowerCase().includes("general"));
  return preferred?.id ?? teams[0]?.id ?? null;
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isSuperAdmin = session.user.role === "SuperAdmin";
  const isJwtAdmin = session.user.role === "Admin";
  const requesterIsCompanyAdmin = await portalCompanyAdminPrivilegesForEmail(session.user.email);

  if (!(isSuperAdmin || isJwtAdmin || requesterIsCompanyAdmin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await req.json()) as AssignBody;
    const ticketId = body.ticketId?.trim();
    const agentId = body.agentId?.trim();
    const portalAccountId = body.portalAccountId?.trim();
    if (!ticketId || (!portalAccountId && !agentId)) {
      return NextResponse.json({ error: "ticketId and (agentId or portalAccountId) are required." }, { status: 400 });
    }

    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });

    if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });

    let agent = null as null | { id: string; name: string; email: string; teamId: string };
    if (agentId) {
      const direct = await prisma.agent.findUnique({
        where: { id: agentId },
        select: {
          id: true,
          name: true,
          email: true,
          teamId: true,
          team: { select: { name: true } },
        },
      });
      if (!direct) return NextResponse.json({ error: "Personnel not found." }, { status: 404 });
      const targetPortal = await prisma.portalAccount.findFirst({
        where: { email: { equals: direct.email, mode: "insensitive" } },
        select: { role: true },
      });
      if (!isSuperAdmin && !isStaffPortalRole(targetPortal?.role)) {
        return NextResponse.json({ error: "Company coordinators can assign only to staff agents." }, { status: 403 });
      }
      agent = direct;
    } else {
      const account = await prisma.portalAccount.findUnique({
        where: { id: portalAccountId! },
        select: { id: true, name: true, email: true, role: true },
      });
      if (!account) return NextResponse.json({ error: "Personnel account not found." }, { status: 404 });
      if (!isStaffPortalRole(account.role)) {
        return NextResponse.json({ error: "Account must use a staff role." }, { status: 400 });
      }

      const defaultTeamId = await getDefaultTeamId();
      if (!defaultTeamId) {
        return NextResponse.json({ error: "Create at least one team before assigning." }, { status: 400 });
      }

      const existing = await prisma.agent.findUnique({ where: { email: account.email } });
      agent =
        existing ??
        (await prisma.agent.create({
          data: {
            name: account.name,
            email: account.email,
            teamId: defaultTeamId,
          },
        }));
      if (!isSuperAdmin && !isStaffPortalRole(account.role)) {
        return NextResponse.json({ error: "Company coordinators can assign only to staff agents." }, { status: 403 });
      }
    }

    /** Company-scoped admins assign only within their designated company queue. */
    if (!isSuperAdmin) {
      const scopeTeamId = await resolveStaffCompanyTeamId(session.user.email);
      if (!scopeTeamId) {
        return NextResponse.json(
          { error: "Your account needs a designated company (Portal Accounts) before assigning tickets." },
          { status: 403 },
        );
      }
      if (agent.teamId !== scopeTeamId) {
        return NextResponse.json(
          { error: "You can only assign tickets to personnel within your designated company." },
          { status: 403 },
        );
      }
    }

    const updated = await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        assignedAgentId: agent.id,
        teamId: ticket.teamId ?? agent.teamId,
      },
      include: {
        assignedAgent: true,
        team: true,
      },
    });

    await touchFirstResponse(ticket, "AGENT");
    await logActivity(
      ticketId,
      "AGENT",
      "Manual assignment",
      `Assigned to ${updated.assignedAgent?.name ?? agent.name}`,
    );

    return NextResponse.json({
      ok: true,
      ticketId,
      assignedAgentId: updated.assignedAgentId,
      assignedAgentName: updated.assignedAgent?.name ?? agent.name,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Could not assign ticket." }, { status: 500 });
  }
}
