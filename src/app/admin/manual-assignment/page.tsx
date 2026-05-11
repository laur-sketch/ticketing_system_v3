import type { Prisma, TicketStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/access";
import { rosterTeamNameFilter, sortByRosterOrder } from "@/lib/company-roster";
import { prisma } from "@/lib/prisma";
import { portalCompanyAdminPrivilegesForEmail } from "@/lib/portal-staff";
import { isStaffPortalRole, normalizePortalRole } from "@/lib/staff-role";
import { ManualAssignmentBoard } from "./ui";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "PENDING_INFO", "ESCALATED"];

export default async function ManualAssignmentPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string | string[] }>;
}) {
  const session = await requireSession();
  if (!session?.user) redirect("/signin");
  if (!["SuperAdmin", "Admin", "Personnel"].includes(session.user.role)) redirect("/");

  const params = await searchParams;
  const requestedCompanyFilter = (Array.isArray(params.company) ? params.company[0] : params.company)?.trim() ?? "";

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

  const [teams, companyTeams, unassigned, portalStaff] = await Promise.all([
    prisma.team.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
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
    prisma.portalAccount.findMany({
      select: {
        email: true,
        name: true,
        role: true,
        headPrivileges: true,
        staffDesignatedCompanyId: true,
        companyId: true,
        staffDesignatedCompany: { select: { name: true } },
        company: { select: { name: true } },
      },
    }),
  ]);
  const orderedCompanyTeams = sortByRosterOrder(companyTeams);
  const validRequestedFilterId = requestedCompanyFilter
    ? orderedCompanyTeams.find((t) => t.id === requestedCompanyFilter)?.id ?? null
    : null;
  const effectiveCompanyFilterId = isPersonnelCompanyLock
    ? scopedCompanyFilterTeamId
    : validRequestedFilterId;
  const effectiveCompanyFilterLabel = isPersonnelCompanyLock
    ? scopedCompanyFilterLabel
    : orderedCompanyTeams.find((t) => t.id === effectiveCompanyFilterId)?.name ?? null;
  const scopedUnassigned = scopeUnavailable
    ? []
    : effectiveCompanyFilterId
      ? unassigned.filter((t) => t.teamId === effectiveCompanyFilterId)
      : unassigned;

  const defaultTeamId =
    teams.find((t) => t.name.toLowerCase().includes("general"))?.id ??
    teams[0]?.id ??
    null;
  /**
   * SBU filter uses **staff designation only** (`staffDesignatedCompanyId`).
   * Do not fall back to `companyId` — that is the customer/signup company and stays out of sync,
   * which caused personnel moved to ALI to still appear under AGC.
   */
  const staffPortal = portalStaff.filter((p) => {
    if (!isStaffPortalRole(p.role)) return false;
    if (scopeUnavailable) return false;
    if (!effectiveCompanyFilterId) return true;
    return p.staffDesignatedCompanyId === effectiveCompanyFilterId;
  });
  const staffEmails = Array.from(
    new Set(staffPortal.map((p) => p.email.trim().toLowerCase()).filter(Boolean)),
  );
  const existingAgents = staffEmails.length
    ? await prisma.agent.findMany({
        where: { email: { in: staffEmails } },
        select: { email: true },
      })
    : [];
  const existingAgentEmails = new Set(existingAgents.map((a) => a.email.trim().toLowerCase()));
  if (defaultTeamId) {
    const missingStaff = staffPortal.filter(
      (p) => !existingAgentEmails.has(p.email.trim().toLowerCase()),
    );
    if (missingStaff.length) {
      await Promise.all(
        missingStaff.map((p) =>
          prisma.agent
            .create({
              data: {
                name: p.name,
                email: p.email.trim().toLowerCase(),
                teamId: defaultTeamId,
              },
            })
            .catch(() => null),
        ),
      );
    }
  }
  const personnelAgents = await prisma.agent.findMany({
    where: staffEmails.length
      ? {
          email: { in: staffEmails },
        }
      : undefined,
    orderBy: { name: "asc" },
    include: { team: true },
  });
  const normalizeName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  const portalByEmail = new Map(portalStaff.map((p) => [p.email.trim().toLowerCase(), p]));

  let agentsForBoard = personnelAgents;
  if (effectiveCompanyFilterId) {
    agentsForBoard = personnelAgents.filter((a) => {
      const row = portalByEmail.get(a.email.trim().toLowerCase());
      return row?.staffDesignatedCompanyId === effectiveCompanyFilterId;
    });
  }

  const assignedByAgent = await prisma.ticket.findMany({
    where: {
      status: { in: ACTIVE_STATUSES },
      assignedAgentId: { in: agentsForBoard.map((a) => a.id) },
      ...(effectiveCompanyFilterId ? { teamId: effectiveCompanyFilterId } : {}),
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
    const tickets = grouped.get(a.id) ?? [];
    const portalRow =
      portalByEmail.get(a.email.trim().toLowerCase()) ??
      portalStaff.find((p) => normalizeName(p.name) === normalizeName(a.name));
    const roleLabel = normalizePortalRole(portalRow?.role ?? "") ?? "Personnel";
    const teamLabel =
      portalRow?.staffDesignatedCompany?.name?.trim() ||
      portalRow?.company?.name?.trim() ||
      a.team?.name ||
      "Unassigned company/SBU";
    return {
      agentId: a.id,
      name: a.name,
      role: roleLabel,
      teamLabel,
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
      companyFilterTeamId={effectiveCompanyFilterId}
      showFullRosterFilter={session.user.role === "SuperAdmin" || session.user.role === "Admin"}
      companyFilterOptions={
        session.user.role === "SuperAdmin" || session.user.role === "Admin"
          ? orderedCompanyTeams.map((t) => ({ id: t.id, name: t.name }))
          : []
      }
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
