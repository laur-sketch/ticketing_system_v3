import type { Prisma, TicketStatus } from "@prisma/client/primary";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/access";
import { rosterTeamNameFilter, sortByRosterOrder } from "@/lib/company-roster";
import { loadHrisAssignableStaff } from "@/lib/hris-staff-roster";
import { prisma } from "@/lib/prisma";
import { portalCompanyAdminPrivilegesForEmail } from "@/lib/portal-staff";
import { loadStaffAssignmentColorsForAgents } from "@/lib/assignee-assignment-color";
import { ensureRosterTeamsInDb } from "@/lib/roster-teams";
import { ManualAssignmentBoard } from "./ui";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "PENDING_INFO", "ESCALATED"];

export default async function ManualAssignmentPage() {
  const session = await requireSession();
  if (!session?.user) redirect("/signin");
  if (!["SuperAdmin", "Admin", "Personnel"].includes(session.user.role)) redirect("/");

  const meEmail = (session.user.email ?? "").trim().toLowerCase();
  /**
   * Personnel (company coordinators) stay locked to their designated SBU — no roster filter.
   * SuperAdmin and JWT Admin use the company dropdown to narrow unassigned tickets and personnel lanes.
   */
  const isPersonnelCompanyLock = session.user.role === "Personnel";
  let scopedCompanyFilterTeamId: string | null = null;
  let scopedCompanyFilterLabel: string | null = null;

  if (isPersonnelCompanyLock) {
    const mePortal = await prisma.portalAccount.findFirst({
      where: { email: { equals: meEmail, mode: "insensitive" } },
      select: {
        staffDesignatedCompanyId: true,
        companyId: true,
        staffDesignatedCompany: { select: { name: true } },
        company: { select: { name: true } },
      },
    });

    scopedCompanyFilterTeamId = mePortal?.staffDesignatedCompanyId ?? mePortal?.companyId ?? null;
    scopedCompanyFilterLabel =
      mePortal?.staffDesignatedCompany?.name?.trim() ?? mePortal?.company?.name?.trim() ?? null;
  }
  /**
   * Company-scoped roles without a designated company should land on an empty
   * board with a notice rather than seeing everyone.
   */
  const scopeUnavailable = isPersonnelCompanyLock && !scopedCompanyFilterTeamId;

  if (!["SuperAdmin", "Admin"].includes(session.user.role)) {
    const normalizedEmail = (session.user.email ?? "").trim().toLowerCase();
    const normalizedName = (session.user.name ?? "").trim();
    const operator = await prisma.agent.findFirst({
      where: {
        OR: [
          normalizedEmail ? { email: normalizedEmail } : undefined,
          normalizedName ? { name: normalizedName } : undefined,
        ].filter(Boolean) as Prisma.AgentWhereInput[],
      },
      include: { team: true },
    });
    const companyCoordinator = await portalCompanyAdminPrivilegesForEmail(session.user.email);
    if (!operator || !companyCoordinator) {
      redirect("/agent");
    }
  }

  await ensureRosterTeamsInDb();

  const [companyTeams, unassigned, hrisStaff] = await Promise.all([
    prisma.team.findMany({
      where: rosterTeamNameFilter(),
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.ticket.findMany({
      where: {
        status: { in: ACTIVE_STATUSES },
        assignedAgentId: null,
        ...(scopedCompanyFilterTeamId ? { teamId: scopedCompanyFilterTeamId } : {}),
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        description: true,
        priority: true,
        updatedAt: true,
        teamId: true,
      },
    }),
    scopeUnavailable
      ? Promise.resolve([])
      : loadHrisAssignableStaff({
          companyTeamId: isPersonnelCompanyLock ? scopedCompanyFilterTeamId : null,
        }),
  ]);
  const orderedCompanyTeams = sortByRosterOrder(companyTeams);
  /** Personnel stay locked to their designated SBU; SuperAdmin/Admin see all companies in the board UI. */
  const personnelScopeCompanyId = isPersonnelCompanyLock ? scopedCompanyFilterTeamId : null;
  const effectiveCompanyFilterLabel = isPersonnelCompanyLock ? scopedCompanyFilterLabel : null;
  const scopedUnassigned = scopeUnavailable ? [] : unassigned;

  const agentsForBoard = hrisStaff;
  const assigneeColorByEmail = await loadStaffAssignmentColorsForAgents(
    agentsForBoard.map((a) => ({ email: a.email, name: a.name })),
  );

  const assignedByAgent = await prisma.ticket.findMany({
    where: {
      status: { in: ACTIVE_STATUSES },
      assignedAgentId: { in: agentsForBoard.map((a) => a.agentId) },
      ...(personnelScopeCompanyId ? { teamId: personnelScopeCompanyId } : {}),
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      description: true,
      priority: true,
      updatedAt: true,
      assignedAgentId: true,
    },
  });
  const grouped = new Map<string, typeof assignedByAgent>();
  for (const t of assignedByAgent) {
    const key = t.assignedAgentId ?? "";
    grouped.set(key, [...(grouped.get(key) ?? []), t]);
  }

  const personnel = agentsForBoard.map((a) => {
    const tickets = grouped.get(a.agentId) ?? [];
    return {
      agentId: a.agentId,
      name: a.name,
      role: a.portalRole ?? "Personnel",
      teamLabel: a.teamLabel,
      companyId: a.assignmentCompany?.id ?? null,
      assigneeColorKey: assigneeColorByEmail.get(a.email.trim().toLowerCase()) ?? null,
      cards: tickets.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        title: t.title,
        description: t.description,
        priority: t.priority,
        updatedAt: t.updatedAt.toISOString(),
      })),
    };
  });

  return (
    <ManualAssignmentBoard
      companyFilterLabel={effectiveCompanyFilterLabel}
      showCompanyFilter={!isPersonnelCompanyLock}
      rosterCompanies={orderedCompanyTeams.map((t) => ({ id: t.id, name: t.name }))}
      notice={
        scopeUnavailable
          ? "Your portal account doesn't have a designated company yet. A SuperAdmin can set one in Personnel → Portal Accounts so you can see your team's lanes."
          : null
      }
      unassigned={scopedUnassigned.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        title: t.title,
        description: t.description,
        priority: t.priority,
        updatedAt: t.updatedAt.toISOString(),
      }))}
      personnel={personnel}
    />
  );
}
