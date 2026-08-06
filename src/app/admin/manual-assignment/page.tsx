import { Prisma, type TicketStatus } from "@prisma/client/primary";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/access";
import { rosterTeamNameFilter, sortByRosterOrder } from "@/lib/company-roster";
import { loadHrisAssignableStaff } from "@/lib/hris-staff-roster";
import { prisma } from "@/lib/prisma";
import { loadStaffAssignmentColorsForAgents } from "@/lib/assignee-assignment-color";
import { ensureRosterTeamsInDb } from "@/lib/roster-teams";
import { ManualAssignmentBoard } from "./ui";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "PENDING_INFO", "ESCALATED"];

export default async function ManualAssignmentPage() {
  const session = await requireSession();
  if (!session?.user) redirect("/signin");
  if (!["SuperAdmin", "HighAdmin", "Admin"].includes(session.user.role)) redirect("/agent");

  /** SuperAdmin and JWT Admin use the company dropdown to narrow personnel lanes. */
  const isPersonnelCompanyLock = false;
  const scopedCompanyFilterTeamId: string | null = null;
  const scopedCompanyFilterLabel: string | null = null;
  const scopeUnavailable = false;

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

  const requestTypeById = new Map<string, string>();
  const allTicketIds = [
    ...new Set([...scopedUnassigned.map((t) => t.id), ...assignedByAgent.map((t) => t.id)]),
  ];
  if (allTicketIds.length > 0) {
    const rows = await prisma.$queryRaw<Array<{ id: string; request_type: string | null }>>`
      SELECT id, request_type FROM tickets WHERE id IN (${Prisma.join(allTicketIds)})
    `;
    for (const row of rows) {
      requestTypeById.set(row.id, row.request_type ?? "ISSUE_CONCERN_TICKET");
    }
  }

  const toCard = (t: {
    id: string;
    ticketNumber: string;
    title: string;
    description: string;
    priority: string;
    updatedAt: Date;
  }) => ({
    id: t.id,
    ticketNumber: t.ticketNumber,
    title: t.title,
    description: t.description,
    priority: t.priority,
    updatedAt: t.updatedAt.toISOString(),
    requestType: requestTypeById.get(t.id) ?? "ISSUE_CONCERN_TICKET",
  });

  const personnel = agentsForBoard.map((a) => {
    const tickets = grouped.get(a.agentId) ?? [];
    return {
      agentId: a.agentId,
      name: a.name,
      role: a.portalRole ?? "Personnel",
      teamLabel: a.teamLabel,
      companyId: a.assignmentCompany?.id ?? null,
      assigneeColorKey: assigneeColorByEmail.get(a.email.trim().toLowerCase()) ?? null,
      cards: tickets.map(toCard),
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
      unassigned={scopedUnassigned.map(toCard)}
      personnel={personnel}
    />
  );
}
