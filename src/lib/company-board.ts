import type { Prisma, TicketPriority, TicketStatus } from "@prisma/client";
import type { Session } from "next-auth";
import { rosterTeamNameFilter, sortByRosterOrder } from "@/lib/company-roster";
import { ensureOutsideCompanyTeam } from "@/lib/outside-company-team";
import { ensureRosterTeamsInDb } from "@/lib/roster-teams";
import { prisma } from "@/lib/prisma";
import { findSessionAgentWithTeam } from "@/lib/session-agent";
import { portalCompanyAdminPrivilegesForEmail } from "@/lib/portal-staff";
import { resolveStaffCompanyTeamId } from "@/lib/staff-company-scope";
import { loadStaffAssignmentColorsForAgents } from "@/lib/assignee-assignment-color";

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
  /** Portal registry rainbow tag for assigned staff (Admin/Personnel). */
  assigneeColorKey: string | null;
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
  await ensureRosterTeamsInDb();
  const { session, searchQuery, priorityFilter, companyTeamIds } = opts;
  const q = (searchQuery ?? "").trim();
  const role = session.user.role;
  const companyAdminPrivileges = await portalCompanyAdminPrivilegesForEmail(session.user.email);
  const operator = await findSessionAgentWithTeam({ email: session.user.email, name: session.user.name });
  const staffCompanyId = await resolveStaffCompanyTeamId(session.user.email);
  const outsideTeamRow = await ensureOutsideCompanyTeam();

  const cardMode: CompanyBoardCardMode =
    role === "SuperAdmin" || role === "Admin" || companyAdminPrivileges ? "staff" : "personnel";

  /** Admin scope: see other roster companies, hide own queue, group by requestor's company. */
  const isAdminScope = role !== "SuperAdmin" && (role === "Admin" || companyAdminPrivileges);

  let teamWhere: Prisma.TeamWhereInput | undefined;
  let excludedTeamIds: string[] = [];
  /** Hard limit on which routed-to teams (ticket.teamId) the viewer is allowed to see. */
  let restrictTicketTeamIds: string[] | null = null;

  if (role === "SuperAdmin") {
    teamWhere = undefined;
  } else if (isAdminScope) {
    if (!staffCompanyId) {
      return {
        columns: [],
        cardMode,
        emptyHint:
          "Set a designated company for your account (Personnel) to view the company board.",
      };
    }
    /**
     * Admin scope:
     *  - Visible tickets are limited to the admin's own queue (ticket.teamId == staffCompanyId).
     *  - Columns represent the **requestor's** company (not where the ticket is routed).
     *  - The admin's own SBU is hidden from the requestor columns; tickets whose requestor
     *    belongs to the admin's own company are bucketed into OUTSIDE COMPANY instead.
     */
    teamWhere = undefined;
    excludedTeamIds = [staffCompanyId];
    restrictTicketTeamIds = [staffCompanyId];
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

  const mergedTeamWhere = mergeTeamWhereWithRoster(teamWhere);
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

  /** Admin-only: never include tickets routed to teams outside the admin's queue. */
  if (restrictTicketTeamIds && restrictTicketTeamIds.length > 0) {
    ticketWhereBase.teamId = { in: restrictTicketTeamIds };
  }

  const allowedTeamIds = teams.map((t) => t.id);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const selectedFilterTeamIds =
    selectedNonAll.length > 0
      ? selectedNonAll.filter((id) => allowedTeamIds.includes(id))
      : [];

  let displayTeamIds: string[];
  if (isAdminScope) {
    /** Admin: every roster team minus own queue, optionally narrowed by company filter. */
    const baseDisplay = allowedTeamIds.filter((id) => !excludedTeamIds.includes(id));
    displayTeamIds = filterBySpecificCompany
      ? baseDisplay.filter((id) => selectedFilterTeamIds.includes(id))
      : baseDisplay;
    if (filterBySpecificCompany && displayTeamIds.length === 0) {
      return { columns: [], cardMode, emptyHint: "No matching company filter in your scope." };
    }
  } else if (filterBySpecificCompany) {
    /** Existing semantics for SuperAdmin/Personnel: hide selected lanes, group by requestor. */
    if (selectedFilterTeamIds.length === 0) {
      return { columns: [], cardMode, emptyHint: "No matching company filter in your scope." };
    }
    displayTeamIds = allowedTeamIds.filter((id) => !selectedFilterTeamIds.includes(id));
    ticketWhereBase.teamId = { in: selectedFilterTeamIds };
  } else {
    displayTeamIds = allowedTeamIds;
  }

  /** Admin & filtered modes group cards by requestor company; default groups by routed-to team. */
  const groupByRequestor = isAdminScope || filterBySpecificCompany;

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
      assignedAgent: { select: { name: true, email: true } },
      requestorEmail: true,
      contactEmail: true,
    },
  });
  const assigneeColorByEmail = await loadStaffAssignmentColorsForAgents(
    rawTickets.map((x) => ({ email: x.assignedAgent?.email, name: x.assignedAgent?.name })),
  );
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

  const outsideId = outsideTeamRow.id;
  const seenTicketIds = new Set<string>();

  for (const x of rawTickets) {
    if (seenTicketIds.has(x.id)) continue;

    let teamIdForColumn: string | null;
    if (groupByRequestor) {
      const email = (x.requestorEmail?.trim() || x.contactEmail?.trim() || "").toLowerCase();
      const requestorCompanyId = email ? requestorCompanyByEmail.get(email) : undefined;
      if (requestorCompanyId && !excludedTeamIds.includes(requestorCompanyId)) {
        teamIdForColumn = requestorCompanyId;
        /**
         * Company filter hides the selected SBU as a column; tickets whose requestor
         * maps to that SBU would otherwise be dropped (including unassigned work).
         * Fall back to OUTSIDE COMPANY when that lane is not in view.
         */
        if (!displayTeamIds.includes(teamIdForColumn) && displayTeamIds.includes(outsideId)) {
          teamIdForColumn = outsideId;
        } else if (!displayTeamIds.includes(teamIdForColumn)) {
          continue;
        }
      } else if (displayTeamIds.includes(outsideId)) {
        /**
         * No known requestor company (or requestor is from the admin's own queue) →
         * bucket into OUTSIDE COMPANY so nothing routed to the admin gets lost.
         */
        teamIdForColumn = outsideId;
      } else {
        continue;
      }
    } else {
      teamIdForColumn = x.teamId;
    }

    if (!teamIdForColumn || !displayTeamIds.includes(teamIdForColumn)) continue;
    const team = teamById.get(teamIdForColumn);
    if (!team) continue;
    const col = columnsByTeam.get(team.id);
    if (!col) continue;

    const assigneeEmail = x.assignedAgent?.email?.trim().toLowerCase();
    const assigneeColorKey = assigneeEmail ? (assigneeColorByEmail.get(assigneeEmail) ?? null) : null;
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
      assigneeColorKey,
    };
    const b = bucketFor(card);
    if (b === "closed" && col.buckets.closed.length >= CLOSED_CAP) continue;
    col.buckets[b].push(card);
    seenTicketIds.add(x.id);
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
  await ensureRosterTeamsInDb();
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

  /** Admin scope: see other roster companies, hide own queue, group by requestor's company. */
  const isAdminScope = role !== "SuperAdmin" && (role === "Admin" || companyAdminPrivileges);

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
  let excludedTeamIds: string[] = [];
  let restrictTicketTeamIds: string[] | null = null;

  if (role === "SuperAdmin") {
    teamIds = null;
  } else if (isAdminScope) {
    if (!staffCompanyId) return empty;
    /** Admin: count only tickets routed to own queue, classified by requestor company. */
    teamIds = null;
    excludedTeamIds = [staffCompanyId];
    restrictTicketTeamIds = [staffCompanyId];
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

  let displayTeamIds: string[];
  if (isAdminScope) {
    const baseDisplay = allowedTeamIds.filter((id) => !excludedTeamIds.includes(id));
    displayTeamIds = filterBySpecificCompany
      ? baseDisplay.filter((id) => selectedFilterTeamIds.includes(id))
      : baseDisplay;
    if (displayTeamIds.length === 0) return empty;
  } else if (filterBySpecificCompany) {
    if (selectedFilterTeamIds.length === 0) return empty;
    displayTeamIds = allowedTeamIds.filter((id) => !selectedFilterTeamIds.includes(id));
    where.teamId = { in: selectedFilterTeamIds };
    if (displayTeamIds.length === 0) return empty;
  } else {
    displayTeamIds = allowedTeamIds;
  }

  /** Admin & filter mode count by requestor company; default counts by routed-to team. */
  const groupByRequestor = isAdminScope || filterBySpecificCompany;

  const baseTicketWhere: Prisma.TicketWhereInput = groupByRequestor
    ? {
        ...where,
        ...(restrictTicketTeamIds && restrictTicketTeamIds.length > 0
          ? { teamId: { in: restrictTicketTeamIds } }
          : {}),
      }
    : { ...where, teamId: { in: displayTeamIds } };

  const tickets = await prisma.ticket.findMany({
    where: baseTicketWhere,
    select: {
      id: true,
      priority: true,
      status: true,
      teamId: true,
      requestorEmail: true,
      contactEmail: true,
    },
    take: 1200,
  });
  if (tickets.length === 0) return empty;

  let scoped = tickets;
  if (groupByRequestor) {
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
    const outsideId = outsideTeamRow.id;
    scoped = tickets.filter((t) => {
      const email = (t.requestorEmail?.trim() || t.contactEmail?.trim() || "").toLowerCase();
      const cid = email ? companyByEmail.get(email) : undefined;
      if (cid && !excludedTeamIds.includes(cid)) {
        if (displayTeamIds.includes(cid)) return true;
        /** Match board logic: hidden requestor SBU (filter) still counts if OUTSIDE is visible. */
        return displayTeamIds.includes(outsideId);
      }
      /** Unknown / own-queue requestors: count under OUTSIDE if shown. */
      return displayTeamIds.includes(outsideId);
    });
  }

  const total = scoped.length;
  const critical = scoped.filter((t) => t.priority === "URGENT").length;
  const openPipeline = scoped.filter((t) => ["OPEN", "IN_PROGRESS", "PENDING_INFO"].includes(t.status)).length;
  const slaEscalated = scoped.filter((t) => t.status === "ESCALATED").length;

  return { total, critical, openPipeline, slaEscalated };
}
