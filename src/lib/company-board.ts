import type { Prisma, TicketPriority, TicketStatus } from "@prisma/client";
import type { Session } from "next-auth";
import { rosterTeamNameFilter, sortByRosterOrder } from "@/lib/company-roster";
import { ensureOutsideCompanyTeam } from "@/lib/outside-company-team";
import { prisma } from "@/lib/prisma";
import { findSessionAgentWithTeam } from "@/lib/session-agent";
import { portalCompanyAdminPrivilegesForEmail } from "@/lib/portal-staff";
import { resolveStaffCompanyTeamId } from "@/lib/staff-company-scope";

function mergeTeamWhereWithRoster(base?: Prisma.TeamWhereInput): Prisma.TeamWhereInput {
  const roster = rosterTeamNameFilter();
  if (!base) return roster;
  return { AND: [base, roster] };
}

export type CompanyBoardCardMode = "staff" | "personnel";

export type CompanyBucketId = "unassigned" | "in_progress" | "for_confirmation" | "closed";

export type CompanyTicketCard = {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  updatedAt: Date;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
};

export type CompanyBoardColumn = {
  teamId: string;
  companyName: string;
  cardMode: CompanyBoardCardMode;
  buckets: Record<CompanyBucketId, CompanyTicketCard[]>;
};

const PERSONNEL_STATUS_FILTER: TicketStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "PENDING_INFO",
  "ESCALATED",
  "FOR_CONFIRMATION",
  "RESOLVED",
];

function awaitingCustomer(status: TicketStatus) {
  return status === "FOR_CONFIRMATION" || status === "RESOLVED";
}

function bucketFor(t: CompanyTicketCard): CompanyBucketId {
  if (t.status === "CLOSED") return "closed";
  if (awaitingCustomer(t.status)) return "for_confirmation";
  if (!t.assignedAgentId) return "unassigned";
  return "in_progress";
}

function emptyBuckets(): Record<CompanyBucketId, CompanyTicketCard[]> {
  return { unassigned: [], in_progress: [], for_confirmation: [], closed: [] };
}

const CLOSED_CAP = 14;

export async function loadCompanyBoard(opts: {
  session: Session;
  searchQuery?: string;
  priorityFilter?: TicketPriority | "ALL";
  /** Company ids to filter by (requestor-assigned company scope). Empty/undefined = all in allowed scope. */
  companyTeamIds?: string[];
}): Promise<{ columns: CompanyBoardColumn[]; cardMode: CompanyBoardCardMode; emptyHint: string | null }> {
  const { session, searchQuery, priorityFilter, companyTeamIds } = opts;
  const q = (searchQuery ?? "").trim();
  const role = session.user.role;
  const companyAdminPrivileges = await portalCompanyAdminPrivilegesForEmail(session.user.email);
  const operator = await findSessionAgentWithTeam({ email: session.user.email, name: session.user.name });
  const staffCompanyId = await resolveStaffCompanyTeamId(session.user.email);
  const outsideTeamRow = await ensureOutsideCompanyTeam();

  const cardMode: CompanyBoardCardMode =
    role === "SuperAdmin" || role === "Admin" || companyAdminPrivileges ? "staff" : "personnel";

  let teamWhere: Prisma.TeamWhereInput | undefined;

  if (role === "SuperAdmin") {
    teamWhere = undefined;
  } else if (role === "Admin" || companyAdminPrivileges) {
    if (!staffCompanyId) {
      return {
        columns: [],
        cardMode,
        emptyHint:
          "Set a designated company for your account (Personnel → Portal Accounts) to view the assignment board.",
      };
    }
    teamWhere =
      staffCompanyId === outsideTeamRow.id
        ? { id: staffCompanyId }
        : { id: { in: [staffCompanyId, outsideTeamRow.id] } };
  } else if (role === "Personnel") {
    if (!operator?.teamId) {
      return {
        columns: [],
        cardMode,
        emptyHint:
          cardMode === "personnel"
            ? "Your account is not linked to a company roster yet. Ask an administrator to assign you in Personnel registry."
            : null,
      };
    }
    teamWhere =
      operator.teamId === outsideTeamRow.id
        ? { id: operator.teamId }
        : { id: { in: [operator.teamId, outsideTeamRow.id] } };
  } else {
    return { columns: [], cardMode, emptyHint: null };
  }

  let mergedTeamWhere = mergeTeamWhereWithRoster(teamWhere);
  const selectedIds = (companyTeamIds ?? []).map((s) => s.trim()).filter(Boolean);
  const selectedNonAll = selectedIds.filter((s) => s !== "ALL");
  const filterBySpecificCompany = selectedNonAll.length > 0;

  const teams = sortByRosterOrder(
    await prisma.team.findMany({
      where: mergedTeamWhere,
      select: { id: true, name: true },
    }),
  );

  const ticketWhereBase: Prisma.TicketWhereInput = {};
  if (priorityFilter && priorityFilter !== "ALL" && cardMode === "staff") {
    ticketWhereBase.priority = priorityFilter;
  }
  if (q) {
    ticketWhereBase.AND = [
      {
        OR: [
          { ticketNumber: { contains: q, mode: "insensitive" } },
          { title: { contains: q, mode: "insensitive" } },
          { contactName: { contains: q, mode: "insensitive" } },
          { contactEmail: { contains: q, mode: "insensitive" } },
        ],
      },
    ];
  }
  if (cardMode === "personnel") {
    ticketWhereBase.status = { in: PERSONNEL_STATUS_FILTER };
    ticketWhereBase.assignedAgentId = operator?.id ?? "__none__";
  }

  const allowedTeamIds = teams.map((t) => t.id);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const selectedFilterTeamIds =
    selectedNonAll.length > 0
      ? selectedNonAll.filter((id) => allowedTeamIds.includes(id))
      : [];
  const displayTeamIds = filterBySpecificCompany
    ? allowedTeamIds.filter((id) => !selectedFilterTeamIds.includes(id))
    : allowedTeamIds;
  if (filterBySpecificCompany) {
    if (selectedFilterTeamIds.length === 0) {
      return { columns: [], cardMode, emptyHint: "No matching company filter in your scope." };
    }
    ticketWhereBase.teamId = { in: selectedFilterTeamIds };
  }
  const rawTickets = await prisma.ticket.findMany({
    where: ticketWhereBase,
    orderBy: { updatedAt: "desc" },
    take: 800,
    select: {
      id: true,
      teamId: true,
      ticketNumber: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      updatedAt: true,
      assignedAgentId: true,
      assignedAgent: { select: { name: true } },
      requestorEmail: true,
      contactEmail: true,
    },
  });
  const requestorEmails = Array.from(
    new Set(
      rawTickets
        .map((x) => (x.requestorEmail?.trim() || x.contactEmail?.trim() || "").toLowerCase())
        .filter(Boolean),
    ),
  );
  const requestorAccounts =
    requestorEmails.length > 0
      ? await prisma.portalAccount.findMany({
          where: { email: { in: requestorEmails } },
          select: {
            email: true,
            companyId: true,
            staffDesignatedCompanyId: true,
          },
        })
      : [];
  const requestorCompanyByEmail = new Map<string, string>();
  for (const a of requestorAccounts) {
    const e = a.email.trim().toLowerCase();
    const cid = a.companyId ?? a.staffDesignatedCompanyId ?? null;
    if (e && cid) requestorCompanyByEmail.set(e, cid);
  }

  const columnsByTeam = new Map<string, CompanyBoardColumn>();
  for (const t of teams) {
    if (!displayTeamIds.includes(t.id)) continue;
    columnsByTeam.set(t.id, {
      teamId: t.id,
      companyName: t.name,
      cardMode,
      buckets: emptyBuckets(),
    });
  }

  const seenTicketIds = new Set<string>();
  if (!filterBySpecificCompany) {
    // Strict ALL companies mode: group only by company requested to (ticket.teamId).
    for (const x of rawTickets) {
      if (seenTicketIds.has(x.id)) continue;
      const teamIdForColumn = x.teamId;
      if (!teamIdForColumn || !displayTeamIds.includes(teamIdForColumn)) continue;
      const team = teamById.get(teamIdForColumn);
      if (!team) continue;
      const col = columnsByTeam.get(team.id);
      if (!col) continue;
      const card: CompanyTicketCard = {
        id: x.id,
        ticketNumber: x.ticketNumber,
        title: x.title,
        description: x.description,
        status: x.status,
        priority: x.priority,
        updatedAt: x.updatedAt,
        assignedAgentId: x.assignedAgentId,
        assignedAgentName: x.assignedAgent?.name ?? null,
      };
      const b = bucketFor(card);
      if (b === "closed" && col.buckets.closed.length >= CLOSED_CAP) continue;
      col.buckets[b].push(card);
      seenTicketIds.add(x.id);
    }
  } else {
    // Filtered mode: selected company lane is hidden; cards are grouped by requestor designated company.
    for (const x of rawTickets) {
      if (seenTicketIds.has(x.id)) continue;
      const email = (x.requestorEmail?.trim() || x.contactEmail?.trim() || "").toLowerCase();
      const requestorCompanyId = email ? requestorCompanyByEmail.get(email) : undefined;
      if (!requestorCompanyId) continue;
      const teamIdForColumn = requestorCompanyId;
      if (!teamIdForColumn || !displayTeamIds.includes(teamIdForColumn)) continue;
      const team = teamById.get(teamIdForColumn);
      if (!team) continue;
      const col = columnsByTeam.get(team.id);
      if (!col) continue;
      const card: CompanyTicketCard = {
        id: x.id,
        ticketNumber: x.ticketNumber,
        title: x.title,
        description: x.description,
        status: x.status,
        priority: x.priority,
        updatedAt: x.updatedAt,
        assignedAgentId: x.assignedAgentId,
        assignedAgentName: x.assignedAgent?.name ?? null,
      };
      const b = bucketFor(card);
      if (b === "closed" && col.buckets.closed.length >= CLOSED_CAP) continue;
      col.buckets[b].push(card);
      seenTicketIds.add(x.id);
    }
  }

  const columns = teams
    .map((t) => columnsByTeam.get(t.id))
    .filter((c): c is CompanyBoardColumn => Boolean(c));

  return {
    columns,
    cardMode,
    emptyHint: columns.length === 0 ? "No companies found for your account." : null,
  };
}

export async function getCompanyBoardAggregates(opts: {
  session: Session;
  searchQuery?: string;
  priorityFilter?: TicketPriority | "ALL";
  companyTeamIds?: string[];
}): Promise<{ total: number; critical: number; openPipeline: number; slaEscalated: number }> {
  const empty = { total: 0, critical: 0, openPipeline: 0, slaEscalated: 0 };
  const { session, searchQuery, priorityFilter, companyTeamIds } = opts;
  const q = (searchQuery ?? "").trim();
  const role = session.user.role;
  const companyAdminPrivileges = await portalCompanyAdminPrivilegesForEmail(session.user.email);
  const operator = await findSessionAgentWithTeam({ email: session.user.email, name: session.user.name });
  const staffCompanyId = await resolveStaffCompanyTeamId(session.user.email);
  const outsideTeamRow = await ensureOutsideCompanyTeam();

  const cardMode: CompanyBoardCardMode =
    role === "SuperAdmin" || role === "Admin" || companyAdminPrivileges ? "staff" : "personnel";

  const where: Prisma.TicketWhereInput = {};

  if (priorityFilter && priorityFilter !== "ALL" && cardMode === "staff") {
    where.priority = priorityFilter;
  }

  if (q) {
    where.AND = [
      {
        OR: [
          { ticketNumber: { contains: q, mode: "insensitive" } },
          { title: { contains: q, mode: "insensitive" } },
          { contactName: { contains: q, mode: "insensitive" } },
          { contactEmail: { contains: q, mode: "insensitive" } },
        ],
      },
    ];
  }

  if (cardMode === "personnel") {
    where.status = { in: PERSONNEL_STATUS_FILTER };
    where.assignedAgentId = operator?.id ?? "__none__";
  }

  let teamIds: string[] | null = null;

  if (role === "SuperAdmin") {
    teamIds = null;
  } else if (role === "Admin" || companyAdminPrivileges) {
    if (!staffCompanyId) return empty;
    teamIds =
      staffCompanyId === outsideTeamRow.id
        ? [staffCompanyId]
        : [staffCompanyId, outsideTeamRow.id];
  } else if (role === "Personnel") {
    if (!operator?.teamId) return empty;
    teamIds =
      operator.teamId === outsideTeamRow.id
        ? [operator.teamId]
        : [operator.teamId, outsideTeamRow.id];
  } else {
    return empty;
  }

  const rosterRows = await prisma.team.findMany({
    where: rosterTeamNameFilter(),
    select: { id: true },
  });
  const rosterIds = rosterRows.map((r) => r.id);
  if (rosterIds.length === 0) return empty;

  let allowedTeamIds = rosterIds;
  if (teamIds !== null) {
    allowedTeamIds = teamIds.filter((id) => rosterIds.includes(id));
    if (allowedTeamIds.length === 0) return empty;
  }

  const selectedIds = (companyTeamIds ?? []).map((s) => s.trim()).filter(Boolean);
  const selectedNonAll = selectedIds.filter((s) => s !== "ALL");
  const filterBySpecificCompany = selectedNonAll.length > 0;
  const selectedFilterTeamIds =
    selectedNonAll.length > 0
      ? selectedNonAll.filter((id) => allowedTeamIds.includes(id))
      : [];
  const requestedToTeamIds = filterBySpecificCompany
    ? allowedTeamIds.filter((id) => !selectedFilterTeamIds.includes(id))
    : allowedTeamIds;
  if (requestedToTeamIds.length === 0) return empty;
  if (filterBySpecificCompany) {
    if (selectedFilterTeamIds.length === 0) return empty;
    where.teamId = { in: selectedFilterTeamIds };
  }

  const tickets = await prisma.ticket.findMany({
    where: { ...where, teamId: { in: requestedToTeamIds } },
    select: {
      id: true,
      priority: true,
      status: true,
      requestorEmail: true,
      contactEmail: true,
    },
    take: 1200,
  });
  if (tickets.length === 0) return empty;
  const emails = Array.from(
    new Set(
      tickets
        .map((t) => (t.requestorEmail?.trim() || t.contactEmail?.trim() || "").toLowerCase())
        .filter(Boolean),
    ),
  );
  const accounts =
    emails.length > 0
      ? await prisma.portalAccount.findMany({
          where: { email: { in: emails } },
          select: { email: true, companyId: true, staffDesignatedCompanyId: true },
        })
      : [];
  const companyByEmail = new Map<string, string>();
  for (const a of accounts) {
    const e = a.email.trim().toLowerCase();
    const cid = a.companyId ?? a.staffDesignatedCompanyId ?? null;
    if (e && cid) companyByEmail.set(e, cid);
  }
  const scoped = filterBySpecificCompany
    ? tickets.filter((t) => {
    const email = (t.requestorEmail?.trim() || t.contactEmail?.trim() || "").toLowerCase();
    if (!email) return false;
    const cid = companyByEmail.get(email);
    return Boolean(cid && requestedToTeamIds.includes(cid));
      })
    : tickets;

  const total = scoped.length;
  const critical = scoped.filter((t) => t.priority === "URGENT").length;
  const openPipeline = scoped.filter((t) => ["OPEN", "IN_PROGRESS", "PENDING_INFO"].includes(t.status)).length;
  const slaEscalated = scoped.filter((t) => t.status === "ESCALATED").length;

  return { total, critical, openPipeline, slaEscalated };
}
