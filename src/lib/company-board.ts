import { isElevatedUserRole } from "@/lib/auth";
import type { Prisma, TicketPriority, TicketStatus } from "@prisma/client/primary";
import type { Session } from "next-auth";
import { ACTIVE_REQUEST_STATUSES, OPEN_PIPELINE_STATUSES } from "@/lib/active-request-statuses";
import { companyHasLocalLogo } from "@/lib/company-logo";
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
  /** True when a logo path or inlined image is stored for this company. */
  hasLogo: boolean;
  buckets: Record<CompanyBucketId, CompanyTicketCard[]>;
};

const PERSONNEL_STATUS_FILTER: TicketStatus[] = ACTIVE_REQUEST_STATUSES;

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

type CompanyBoardScopeOpts = {
  session: Session;
  searchQuery?: string;
  priorityFilter?: TicketPriority | "ALL";
  companyTeamIds?: string[];
  requestTypeFilter?: string | "ALL";
};

type CompanyBoardScope =
  | {
      ok: true;
      cardMode: CompanyBoardCardMode;
      ticketWhereBase: Prisma.TicketWhereInput;
      displayTeamIds: string[];
      teams: { id: string; name: string; hasLogo: boolean }[];
      groupByRequestor: boolean;
      excludedTeamIds: string[];
      outsideId: string;
    }
  | { ok: false; cardMode: CompanyBoardCardMode; emptyHint: string | null };

async function resolveCompanyBoardScope(opts: CompanyBoardScopeOpts): Promise<CompanyBoardScope> {
  await ensureRosterTeamsInDb();
  const { session, searchQuery, priorityFilter, companyTeamIds, requestTypeFilter } = opts;
  const q = (searchQuery ?? "").trim();
  const role = session.user.role;
  const companyAdminPrivileges = await portalCompanyAdminPrivilegesForEmail(session.user.email);
  const operator = await findSessionAgentWithTeam({ email: session.user.email, name: session.user.name });
  const staffCompanyId = await resolveStaffCompanyTeamId(session.user.email);
  const outsideTeamRow = await ensureOutsideCompanyTeam();

  const cardMode: CompanyBoardCardMode =
    isElevatedUserRole(role) || role === "Admin" || companyAdminPrivileges ? "staff" : "personnel";

  const isAdminScope = !isElevatedUserRole(role) && (role === "Admin" || companyAdminPrivileges);

  let teamWhere: Prisma.TeamWhereInput | undefined;
  let excludedTeamIds: string[] = [];
  let restrictTicketTeamIds: string[] | null = null;

  if (isElevatedUserRole(role)) {
    teamWhere = undefined;
  } else if (isAdminScope) {
    if (!staffCompanyId) {
      return {
        ok: false,
        cardMode,
        emptyHint:
          "Set a designated company for your account (Personnel) to view the company board.",
      };
    }
    teamWhere = undefined;
    excludedTeamIds = [staffCompanyId];
    restrictTicketTeamIds = [staffCompanyId];
  } else if (role === "Personnel") {
    if (!operator?.teamId) {
      return {
        ok: false,
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
    return { ok: false, cardMode, emptyHint: null };
  }

  const mergedTeamWhere = mergeTeamWhereWithRoster(teamWhere);
  const selectedIds = (companyTeamIds ?? []).map((s) => s.trim()).filter(Boolean);
  const selectedNonAll = selectedIds.filter((s) => s !== "ALL");
  const filterBySpecificCompany = selectedNonAll.length > 0;

  const teamsRaw = sortByRosterOrder(
    await prisma.team.findMany({
      where: mergedTeamWhere,
      select: { id: true, name: true },
    }),
  );

  // Logo columns may exist before Prisma client is regenerated — use raw SQL.
  const logoRows =
    teamsRaw.length > 0
      ? await prisma.$queryRawUnsafe<{ id: string; has_logo: boolean }[]>(
          `SELECT id,
                  (COALESCE(NULLIF(TRIM(logo_path), ''), NULL) IS NOT NULL
                   OR COALESCE(NULLIF(TRIM(logo_image), ''), NULL) IS NOT NULL) AS has_logo
           FROM teams
           WHERE id = ANY($1::text[])`,
          teamsRaw.map((t) => t.id),
        )
      : [];
  const hasLogoById = new Map(logoRows.map((r) => [r.id, Boolean(r.has_logo)]));
  const teams = teamsRaw.map((t) => ({
    ...t,
    hasLogo: companyHasLocalLogo(t.name) || (hasLogoById.get(t.id) ?? false),
  }));

  const ticketWhereBase: Prisma.TicketWhereInput = {};
  if (priorityFilter && priorityFilter !== "ALL" && cardMode === "staff") {
    ticketWhereBase.priority = priorityFilter;
  }
  if (requestTypeFilter && requestTypeFilter !== "ALL") {
    ticketWhereBase.requestType = requestTypeFilter;
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

  if (restrictTicketTeamIds && restrictTicketTeamIds.length > 0) {
    ticketWhereBase.teamId = { in: restrictTicketTeamIds };
  }

  const allowedTeamIds = teams.map((t) => t.id);
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
    if (filterBySpecificCompany && displayTeamIds.length === 0) {
      return { ok: false, cardMode, emptyHint: "No matching company filter in your scope." };
    }
  } else if (filterBySpecificCompany) {
    if (selectedFilterTeamIds.length === 0) {
      return { ok: false, cardMode, emptyHint: "No matching company filter in your scope." };
    }
    displayTeamIds = selectedFilterTeamIds.filter((id) => allowedTeamIds.includes(id));
    ticketWhereBase.teamId = { in: selectedFilterTeamIds };
  } else {
    displayTeamIds = allowedTeamIds;
  }

  const groupByRequestor = isAdminScope || filterBySpecificCompany;

  if (!groupByRequestor) {
    ticketWhereBase.teamId =
      displayTeamIds.length > 0 ? { in: displayTeamIds } : { in: ["__none__"] };
  }

  return {
    ok: true,
    cardMode,
    ticketWhereBase,
    displayTeamIds,
    teams,
    groupByRequestor,
    excludedTeamIds,
    outsideId: outsideTeamRow.id,
  };
}

/** Counts cards actually placed on the board (includes capped closed cards). */
export function summarizeCompanyBoardColumns(columns: CompanyBoardColumn[]): {
  total: number;
  critical: number;
  openPipeline: number;
  slaEscalated: number;
} {
  let total = 0;
  let critical = 0;
  let openPipeline = 0;
  let slaEscalated = 0;
  for (const col of columns) {
    for (const cards of Object.values(col.buckets)) {
      for (const t of cards) {
        total += 1;
        if (t.priority === "URGENT") critical += 1;
        if ((OPEN_PIPELINE_STATUSES as TicketStatus[]).includes(t.status)) {
          openPipeline += 1;
        }
        if (t.status === "ESCALATED") slaEscalated += 1;
      }
    }
  }
  return { total, critical, openPipeline, slaEscalated };
}

export async function loadCompanyBoard(opts: CompanyBoardScopeOpts): Promise<{
  columns: CompanyBoardColumn[];
  cardMode: CompanyBoardCardMode;
  emptyHint: string | null;
}> {
  const scope = await resolveCompanyBoardScope(opts);
  if (!scope.ok) {
    return { columns: [], cardMode: scope.cardMode, emptyHint: scope.emptyHint };
  }

  const {
    cardMode,
    ticketWhereBase,
    displayTeamIds,
    teams,
    groupByRequestor,
    excludedTeamIds,
    outsideId,
  } = scope;
  const teamById = new Map(teams.map((t) => [t.id, t]));

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
      hasLogo: t.hasLogo,
      buckets: emptyBuckets(),
    });
  }

  const seenTicketIds = new Set<string>();

  for (const x of rawTickets) {
    if (seenTicketIds.has(x.id)) continue;

    let teamIdForColumn: string | null;
    if (groupByRequestor) {
      const email = (x.requestorEmail?.trim() || x.contactEmail?.trim() || "").toLowerCase();
      const requestorCompanyId = email ? requestorCompanyByEmail.get(email) : undefined;
      if (requestorCompanyId && !excludedTeamIds.includes(requestorCompanyId)) {
        teamIdForColumn = requestorCompanyId;
        if (!displayTeamIds.includes(teamIdForColumn) && displayTeamIds.includes(outsideId)) {
          teamIdForColumn = outsideId;
        } else if (!displayTeamIds.includes(teamIdForColumn)) {
          continue;
        }
      } else if (displayTeamIds.includes(outsideId)) {
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

/**
 * Active pipeline totals for the company board (excludes CLOSED).
 * Matches Request Board “active events” / Insights active requests for the same team scope.
 */
export async function getCompanyBoardAggregates(opts: CompanyBoardScopeOpts): Promise<{
  total: number;
  critical: number;
  openPipeline: number;
  slaEscalated: number;
}> {
  const empty = { total: 0, critical: 0, openPipeline: 0, slaEscalated: 0 };
  const scope = await resolveCompanyBoardScope(opts);
  if (!scope.ok) return empty;

  const activeWhere: Prisma.TicketWhereInput = {
    ...scope.ticketWhereBase,
    ...(scope.cardMode === "personnel"
      ? {}
      : { status: { in: ACTIVE_REQUEST_STATUSES } }),
  };

  const [total, critical, openPipeline, slaEscalated] = await Promise.all([
    prisma.ticket.count({ where: activeWhere }),
    prisma.ticket.count({ where: { ...activeWhere, priority: "URGENT" } }),
    prisma.ticket.count({
      where: { ...activeWhere, status: { in: OPEN_PIPELINE_STATUSES } },
    }),
    prisma.ticket.count({ where: { ...activeWhere, status: "ESCALATED" } }),
  ]);

  return { total, critical, openPipeline, slaEscalated };
}
