import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import type { Prisma, TicketPriority, TicketStatus } from "@prisma/client";
import { requireSession } from "@/lib/access";
import { rosterTeamNameFilter, sortByRosterOrder } from "@/lib/company-roster";
import {
  customerHasPendingResolvedTicket,
  customerPendingTicketHref,
} from "@/lib/customer-pending-resolution";
import { getCompanyBoardAggregates, loadCompanyBoard } from "@/lib/company-board";
import { loadTicketActivityLogForSession } from "@/lib/ticket-activity-log";
import { prisma } from "@/lib/prisma";
import { loadStaffAssignmentColorsForAgents } from "@/lib/assignee-assignment-color";
import { personnelAssigneeHighlightStyleFromKey } from "@/lib/personnel-assignment-colors";
import { portalCompanyAdminPrivilegesForEmail } from "@/lib/portal-staff";
import { resolveStaffCompanyTeamId } from "@/lib/staff-company-scope";
import { findSessionAgentWithTeam } from "@/lib/session-agent";
import { AgentTicketDeepLink } from "@/components/AgentTicketDeepLink";
import { AutoSubmitForm } from "@/components/AutoSubmitForm";
import { AssigneeColorHighlight } from "@/components/ticket/AssigneeColorHighlight";
import { OrchestrationQueueNav } from "@/components/OrchestrationQueueNav";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BRAND_TITLE } from "@/lib/brand";
import { formatTicketPriorityLabel } from "@/lib/ticket-priority-label";
import { AgentKanban, type KanbanTicket } from "./agent-kanban";
import { CompanyKanban } from "./company-kanban";
import { AgentKpiKanbanFlow } from "./kpi-kanban-flow";
import { TicketActivityLogPanel } from "./ticket-activity-log-panel";
import { TicketBoardCompanySelect } from "./ticket-board-filters";

export const dynamic = "force-dynamic";

type AgentTicketWithTeam = Prisma.TicketGetPayload<{
  include: { team: true; assignedAgent: true; feedback: { select: { csat: true } } };
}>;

type EnrichedAssignedAgent = AgentTicketWithTeam["assignedAgent"] & {
  staffAssignmentColor?: string | null;
  profileImage?: string | null;
  profileImageZoom?: number | null;
  profileImagePosX?: number | null;
  profileImagePosY?: number | null;
};

const STATUS_PIPELINE: TicketStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "PENDING_INFO",
  "ESCALATED",
  "FOR_CONFIRMATION",
  "RESOLVED",
];

const statusOptions: Array<{ label: string; value: TicketStatus | "ALL" }> = [
  { label: "All", value: "ALL" },
  { label: "Open", value: "OPEN" },
  { label: "In Progress", value: "IN_PROGRESS" },
  { label: "Pending Info", value: "PENDING_INFO" },
  { label: "Transfer pending", value: "ESCALATED" },
  { label: "For confirmation", value: "FOR_CONFIRMATION" },
  { label: "Resolved (legacy)", value: "RESOLVED" },
  { label: "Closed", value: "CLOSED" },
];

const priorityOptions: Array<{ label: string; value: TicketPriority | "ALL" }> = [
  { label: "All", value: "ALL" },
  { label: "Set Priority Level", value: "UNSET" },
  { label: "Low", value: "LOW" },
  { label: "Medium", value: "MEDIUM" },
  { label: "High", value: "HIGH" },
  { label: "Urgent", value: "URGENT" },
];

function firstQuery(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AgentHome({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string | string[];
    priority?: string | string[];
    q?: string | string[];
    sort?: string | string[];
    dir?: string | string[];
    page?: string | string[];
    logsPage?: string | string[];
    notifications?: string | string[];
    view?: string | string[];
    assigned?: string | string[];
      board?: string | string[];
    company?: string | string[];
  }>;
}) {
  const session = await requireSession();
  if (!session?.user) redirect("/signin");
  if (!["SuperAdmin", "Personnel", "Admin"].includes(session.user.role)) redirect("/");

  const params = await searchParams;
  const rawBoard = firstQuery(params.board);
  if (rawBoard === "department") {
    redirect("/agent?board=company");
  }
  if (rawBoard === "it-tasks") {
    redirect("/agent?board=kpi");
  }
  /** Personnel cannot view the Company Board: force them back to the Ticket Board. */
  if (rawBoard === "company" && session.user.role === "Personnel") {
    redirect("/agent?board=ticket");
  }
  const companyCoordinator = await portalCompanyAdminPrivilegesForEmail(session.user.email);
  const operator = await findSessionAgentWithTeam({ email: session.user.email, name: session.user.name });
  let personnelRequestorIntakeBlock: Awaited<ReturnType<typeof customerHasPendingResolvedTicket>> = null;
  if (session.user.role === "Personnel") {
    const em = (session.user.email ?? "").trim().toLowerCase();
    personnelRequestorIntakeBlock = em
      ? await customerHasPendingResolvedTicket(em, session.user.authProvider)
      : null;
  }
  // Personnel must use board view to be able to drag cards and change status inline.
  const requestedViewMode = firstQuery(params.view) === "table" ? "table" : "board";
  const boardTab = rawBoard === "kpi" ? "kpi" : rawBoard === "company" ? "company" : "ticket";
  const isCompanyBoard = boardTab === "company";
  const selectedCompany = firstQuery(params.company) ?? "ALL";
  const viewMode = session.user.role === "Personnel" ? "board" : requestedViewMode;
  const isBoard = viewMode === "board";
  const selectedAssigned = firstQuery(params.assigned) ?? "ALL";
  const selectedStatus = firstQuery(params.status) ?? "ALL";
  const selectedPriority = firstQuery(params.priority) ?? "ALL";
  const query = firstQuery(params.q)?.trim() ?? "";
  const sort = firstQuery(params.sort) ?? "updatedAt";
  const dir = firstQuery(params.dir) === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number.parseInt(firstQuery(params.page) ?? "1", 10) || 1);
  const companyLogPage = Math.max(1, Number.parseInt(firstQuery(params.logsPage) ?? "1", 10) || 1);
  const notificationsOpen = firstQuery(params.notifications) === "1";
  const boardTicketsPerStatus = 5;
  const pageSize = isBoard && boardTab === "ticket" ? boardTicketsPerStatus : 20;
  const companyLogPageSize = 10;
  const hideCompanyPriorityFilter =
    !companyCoordinator && session.user.role === "Personnel";

  let companyBoardPayload: Awaited<ReturnType<typeof loadCompanyBoard>> | null = null;
  let companyAggregates: Awaited<ReturnType<typeof getCompanyBoardAggregates>> | null = null;
  let companyActivityLogs: Awaited<ReturnType<typeof loadTicketActivityLogForSession>> = [];

  const showKpiCompanyFilter =
    boardTab === "kpi" &&
    (session.user.role === "SuperAdmin" ||
      session.user.role === "Admin" ||
      companyCoordinator);
  const showTicketCompanyFilter =
    boardTab === "ticket" &&
    session.user.role !== "Personnel" &&
    (session.user.role === "SuperAdmin" ||
      session.user.role === "Admin" ||
      companyCoordinator);
  const showTopTicketFilters = boardTab !== "kpi";
  const showKpiTaskFilters = showKpiCompanyFilter;
  const ticketCompanySelected = boardTab === "ticket" && selectedCompany !== "ALL";
  const kpiCompanySelected = boardTab === "kpi" && selectedCompany !== "ALL";
  const ticketAssignedFilterActive =
    boardTab === "ticket" && session.user.role !== "Personnel" && ticketCompanySelected;
  const kpiAssignedFilterActive = showKpiTaskFilters && kpiCompanySelected;

  const adminScopedCompanyId =
    (isCompanyBoard || showKpiCompanyFilter) &&
    session.user.role !== "SuperAdmin" &&
    (session.user.role === "Admin" || companyCoordinator)
      ? await resolveStaffCompanyTeamId(session.user.email)
      : null;

  const rosterTeamsForFilter = isCompanyBoard
    ? sortByRosterOrder(
        await prisma.team.findMany({
          where: rosterTeamNameFilter(),
          select: { id: true, name: true },
        }),
      ).filter((t) => (adminScopedCompanyId ? t.id !== adminScopedCompanyId : true))
    : [];

  const rosterTeamsForKpiFilter = showKpiCompanyFilter
    ? sortByRosterOrder(
        await prisma.team.findMany({
          where: rosterTeamNameFilter(),
          select: { id: true, name: true },
        }),
      ).filter((t) => (adminScopedCompanyId ? t.id !== adminScopedCompanyId : true))
    : [];

  const rosterTeamsForTicketFilter = showTicketCompanyFilter
    ? sortByRosterOrder(
        await prisma.team.findMany({
          where: rosterTeamNameFilter(),
          select: { id: true, name: true },
        }),
      )
    : [];

  if (isCompanyBoard) {
    const priorityForCompany = (selectedPriority === "ALL" ? "ALL" : selectedPriority) as TicketPriority | "ALL";
    const [dep, agg, logs] = await Promise.all([
      loadCompanyBoard({
        session,
        searchQuery: query,
        priorityFilter: priorityForCompany,
        companyTeamIds: selectedCompany === "ALL" ? [] : [selectedCompany],
      }),
      getCompanyBoardAggregates({
        session,
        searchQuery: query,
        priorityFilter: priorityForCompany,
        companyTeamIds: selectedCompany === "ALL" ? [] : [selectedCompany],
      }),
      loadTicketActivityLogForSession({ session, limit: 120 }),
    ]);
    companyBoardPayload = dep;
    companyAggregates = agg;
    companyActivityLogs = logs;
  }

  const fetchTicketPipeline = !isCompanyBoard && boardTab !== "kpi";

  async function loadAgentsForCompanyFilter(companyTeamId: string) {
    const portals = await prisma.portalAccount.findMany({
      where: {
        role: { in: ["Admin", "Personnel"] },
        accountStatus: "ACTIVE",
        staffDesignatedCompanyId: companyTeamId,
      },
      select: { email: true },
    });
    const emails = portals.map((p) => p.email.trim().toLowerCase()).filter(Boolean);
    if (emails.length === 0) return [];
    return prisma.agent.findMany({
      where: { email: { in: emails } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
  }

  const agentsForTicketAssigneeFilter =
    ticketCompanySelected && fetchTicketPipeline
      ? await loadAgentsForCompanyFilter(selectedCompany)
      : [];

  const agentsForKpiAssigneeFilter = kpiAssignedFilterActive
    ? await loadAgentsForCompanyFilter(selectedCompany)
    : [];

  const effectiveAssigned =
    ticketAssignedFilterActive &&
    selectedAssigned !== "ALL" &&
    selectedAssigned !== "UNASSIGNED" &&
    !agentsForTicketAssigneeFilter.some((a) => a.id === selectedAssigned)
      ? "ALL"
      : ticketAssignedFilterActive
        ? selectedAssigned
        : "ALL";

  const effectiveKpiAssigned =
    kpiAssignedFilterActive &&
    selectedAssigned !== "ALL" &&
    !agentsForKpiAssigneeFilter.some((a) => a.id === selectedAssigned)
      ? "ALL"
      : kpiAssignedFilterActive
        ? selectedAssigned
        : "ALL";

  const whereBase: Prisma.TicketWhereInput = {};
  if (session.user.role === "Personnel") {
    whereBase.assignedAgentId = operator?.id ?? "__none__";
  }
  if (ticketCompanySelected && session.user.role !== "Personnel") {
    whereBase.teamId = selectedCompany;
  }
  if (effectiveAssigned === "UNASSIGNED") {
    if (session.user.role !== "Personnel") {
      whereBase.assignedAgentId = null;
    }
  } else if (effectiveAssigned !== "ALL") {
    if (session.user.role !== "Personnel") {
      whereBase.assignedAgentId = effectiveAssigned;
    }
  }
  if (selectedPriority !== "ALL") {
    whereBase.priority = selectedPriority as TicketPriority;
  }
  if (query) {
    whereBase.OR = [
      { ticketNumber: { contains: query, mode: "insensitive" } },
      { title: { contains: query, mode: "insensitive" } },
      { contactName: { contains: query, mode: "insensitive" } },
      { contactEmail: { contains: query, mode: "insensitive" } },
    ];
  }

  const tableWhere: Prisma.TicketWhereInput = { ...whereBase };
  if (selectedStatus !== "ALL") {
    tableWhere.status = selectedStatus as TicketStatus;
  }

  const boardWhere: Prisma.TicketWhereInput = {
    ...whereBase,
    status: { in: STATUS_PIPELINE },
  };

  const dataWhere = isBoard ? boardWhere : tableWhere;

  const allowedSorts: Record<string, Prisma.TicketOrderByWithRelationInput> = {
    updatedAt: { updatedAt: dir },
    createdAt: { createdAt: dir },
    priority: { priority: dir },
    status: { status: dir },
  };
  const orderBy = allowedSorts[sort] ?? { updatedAt: "desc" };

  const [
    ticketsTable,
    ticketsBoard,
    boardStatusCounts,
    totalCount,
    critical,
    open,
    slaAtRisk,
    recentUpdated,
  ] = await Promise.all([
    fetchTicketPipeline && !isBoard
      ? prisma.ticket.findMany({
          where: tableWhere,
          orderBy,
          include: { team: true, assignedAgent: true, feedback: { select: { csat: true } } },
          skip: (page - 1) * pageSize,
          take: pageSize,
        })
      : Promise.resolve([] as AgentTicketWithTeam[]),
    fetchTicketPipeline && isBoard
      ? Promise.all(
          STATUS_PIPELINE.map((status) =>
            prisma.ticket.findMany({
              where: { ...whereBase, status },
              orderBy: { updatedAt: "desc" },
              skip: (page - 1) * boardTicketsPerStatus,
              take: boardTicketsPerStatus,
              include: { team: true, assignedAgent: true, feedback: { select: { csat: true } } },
            }),
          ),
        ).then((groups) => groups.flat())
      : Promise.resolve([] as AgentTicketWithTeam[]),
    fetchTicketPipeline && isBoard
      ? Promise.all(
          STATUS_PIPELINE.map(async (status) => {
            const count = await prisma.ticket.count({ where: { ...whereBase, status } });
            return [status, count] as const;
          }),
        ).then((entries) => Object.fromEntries(entries) as Partial<Record<TicketStatus, number>>)
      : Promise.resolve({} as Partial<Record<TicketStatus, number>>),
    fetchTicketPipeline ? prisma.ticket.count({ where: dataWhere }) : Promise.resolve(0),
    fetchTicketPipeline
      ? prisma.ticket.count({
          where: { ...dataWhere, priority: "URGENT" },
        })
      : Promise.resolve(0),
    fetchTicketPipeline
      ? prisma.ticket.count({
          where: {
            ...dataWhere,
            status: { in: ["OPEN", "IN_PROGRESS", "PENDING_INFO"] },
          },
        })
      : Promise.resolve(0),
    fetchTicketPipeline
      ? prisma.ticket.count({
          where: { ...dataWhere, status: "ESCALATED" },
        })
      : Promise.resolve(0),
    fetchTicketPipeline
      ? prisma.ticket.findMany({
          where: dataWhere,
          orderBy: { updatedAt: "desc" },
          take: 4,
          select: {
            id: true,
            ticketNumber: true,
            title: true,
            status: true,
            updatedAt: true,
            assignedAgent: { select: { email: true, name: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const pipelineRows = [...ticketsTable, ...ticketsBoard];
  const assigneeColorIdentities = [
    ...pipelineRows.map((t) => ({ email: t.assignedAgent?.email, name: t.assignedAgent?.name })),
    ...recentUpdated.map((r) => ({ email: r.assignedAgent?.email, name: r.assignedAgent?.name })),
  ];
  const assigneeColorByEmail = assigneeColorIdentities.some((x) => (x.email ?? "").trim())
    ? await loadStaffAssignmentColorsForAgents(assigneeColorIdentities)
    : new Map<string, string | null>();
  const assigneeEmails = Array.from(
    new Set(
      assigneeColorIdentities
        .map((x) => x.email?.trim().toLowerCase())
        .filter((email): email is string => Boolean(email)),
    ),
  );
  const assigneeProfiles = assigneeEmails.length
    ? await prisma.portalAccount.findMany({
        where: { email: { in: assigneeEmails } },
        select: {
          email: true,
          profileImage: true,
          profileImageZoom: true,
          profileImagePosX: true,
          profileImagePosY: true,
        },
      })
    : [];
  const assigneeProfileByEmail = new Map(
    assigneeProfiles.map((profile) => [profile.email.trim().toLowerCase(), profile]),
  );
  const withAssigneeColor = (t: AgentTicketWithTeam): AgentTicketWithTeam => {
    const email = t.assignedAgent?.email?.trim().toLowerCase();
    const staffAssignmentColor = email ? (assigneeColorByEmail.get(email) ?? null) : null;
    const profile = email ? assigneeProfileByEmail.get(email) : null;
    return {
      ...t,
      assignedAgent: t.assignedAgent
        ? {
            ...t.assignedAgent,
            staffAssignmentColor,
            profileImage: profile?.profileImage ?? null,
            profileImageZoom: profile?.profileImageZoom ?? 1,
            profileImagePosX: profile?.profileImagePosX ?? 50,
            profileImagePosY: profile?.profileImagePosY ?? 50,
          }
        : null,
    } as AgentTicketWithTeam;
  };
  const ticketsTableEnriched = ticketsTable.map(withAssigneeColor);
  const ticketsBoardEnriched = ticketsBoard.map(withAssigneeColor);

  const tickets = isBoard ? ticketsBoardEnriched : ticketsTableEnriched;
  const totalPages =
    isBoard && boardTab === "ticket"
      ? Math.max(
          1,
          ...STATUS_PIPELINE.map((status) => Math.ceil((boardStatusCounts[status] ?? 0) / boardTicketsPerStatus)),
        )
      : Math.max(1, Math.ceil(totalCount / pageSize));
  const start = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);

  function buildHref(next: Record<string, string | null>) {
    const qs = new URLSearchParams();
    if (viewMode === "table") qs.set("view", "table");
    if (ticketAssignedFilterActive && effectiveAssigned !== "ALL") {
      qs.set("assigned", effectiveAssigned);
    }
    if (kpiAssignedFilterActive && effectiveKpiAssigned !== "ALL") {
      qs.set("assigned", effectiveKpiAssigned);
    }
    if (!isBoard) {
      if (selectedStatus !== "ALL") qs.set("status", selectedStatus);
    }
    if (boardTab !== "kpi" && selectedPriority !== "ALL") qs.set("priority", selectedPriority);
    if (query) qs.set("q", query);
    if (sort !== "updatedAt") qs.set("sort", sort);
    if (dir !== "desc") qs.set("dir", dir);
    if (page !== 1) qs.set("page", String(page));
    if (isCompanyBoard && companyLogPage !== 1) qs.set("logsPage", String(companyLogPage));
    if (notificationsOpen) qs.set("notifications", "1");
    if (boardTab !== "ticket") qs.set("board", boardTab);
    if ((isCompanyBoard || boardTab === "kpi" || showTicketCompanyFilter) && selectedCompany !== "ALL") {
      qs.set("company", selectedCompany);
    }

    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "") qs.delete(key);
      else qs.set(key, value);
    }
    const s = qs.toString();
    return s ? `/agent?${s}` : "/agent";
  }

  function sortHref(column: string) {
    const nextDir = sort === column && dir === "desc" ? "asc" : "desc";
    return buildHref({ sort: column, dir: nextDir, page: "1" });
  }

  const ticketsResultLabel =
    totalCount === 0
      ? "No results"
      : isBoard && boardTab === "ticket"
        ? `Page ${page} of ${totalPages} · ${boardTicketsPerStatus} tickets per status · ${totalCount} total`
        : `Showing ${start}-${end} of ${totalCount} results`;

  const ticketsEmpty = tickets.length === 0;
  const isSorted = (column: string) => sort === column;
  const sortMarker = (column: string) => {
    if (!isSorted(column)) return "";
    return dir === "asc" ? " ▲" : " ▼";
  };
  const searchFieldQuery = query;
  const currentPage = page;
  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;
  const prevHref = buildHref({ page: String(currentPage - 1) });
  const nextHref = buildHref({ page: String(currentPage + 1) });
  const applySortClass = (column: string) =>
    `px-4 py-3 ${isSorted(column) ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-600 dark:text-zinc-400"} hover:text-zinc-950 dark:hover:text-zinc-200`;
  const tableRows = tickets;
  const ratingLabel = (csat: number | null | undefined) =>
    typeof csat === "number" ? `${"★".repeat(csat)}${"☆".repeat(5 - csat)} ${csat}/5` : "Not rated";
  const showPageLinks = totalPages > 1 && boardTab === "ticket";
  const pageLinks = Array.from(
    { length: Math.min(totalPages, 5) },
    (_, i) => Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i,
  ).filter((n, i, arr) => n >= 1 && n <= totalPages && arr.indexOf(n) === i);

  const boardColumnTotals = isBoard
    ? {
        open: boardStatusCounts.OPEN ?? 0,
        progress: (boardStatusCounts.IN_PROGRESS ?? 0) + (boardStatusCounts.ESCALATED ?? 0),
        feedback:
          (boardStatusCounts.PENDING_INFO ?? 0) +
          (boardStatusCounts.FOR_CONFIRMATION ?? 0) +
          (boardStatusCounts.RESOLVED ?? 0),
      }
    : undefined;

  const boardCards: KanbanTicket[] = isBoard
    ? ticketsBoardEnriched.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        title: t.title,
        description: t.description,
        priority: t.priority,
        status: t.status,
        updatedAt: t.updatedAt.toISOString(),
        agentName: t.assignedAgent?.name ?? null,
        assigneeColorKey:
          (t.assignedAgent as EnrichedAssignedAgent | null)?.staffAssignmentColor ?? null,
        assigneeProfileImage:
          (t.assignedAgent as EnrichedAssignedAgent | null)?.profileImage ?? null,
        assigneeProfileImageZoom:
          (t.assignedAgent as EnrichedAssignedAgent | null)?.profileImageZoom ?? null,
        assigneeProfileImagePosX:
          (t.assignedAgent as EnrichedAssignedAgent | null)?.profileImagePosX ?? null,
        assigneeProfileImagePosY:
          (t.assignedAgent as EnrichedAssignedAgent | null)?.profileImagePosY ?? null,
      }))
    : [];

  const ticketPagination = (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-800 dark:text-zinc-300">
      <p>{ticketsResultLabel}</p>
      {showPageLinks ? (
        <div className="flex items-center gap-1">
          <Link
            href={canPrev ? prevHref : "#"}
            className={`rounded-md px-2.5 py-1.5 ${
              canPrev
                ? "border border-zinc-300 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                : "cursor-not-allowed text-zinc-400 dark:text-zinc-500"
            }`}
            aria-disabled={!canPrev}
          >
            Prev
          </Link>
          {pageLinks.map((p) => (
            <Link
              key={p}
              href={buildHref({ page: String(p) })}
              className={`rounded-md px-2.5 py-1.5 ${
                p === currentPage
                  ? "bg-orange-600 text-white"
                  : "border border-zinc-300 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              }`}
            >
              {p}
            </Link>
          ))}
          <Link
            href={canNext ? nextHref : "#"}
            className={`rounded-md px-2.5 py-1.5 ${
              canNext
                ? "border border-zinc-300 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                : "cursor-not-allowed text-zinc-400 dark:text-zinc-500"
            }`}
            aria-disabled={!canNext}
          >
            Next
          </Link>
        </div>
      ) : null}
    </div>
  );

  const activeEvents = isCompanyBoard ? (companyAggregates?.total ?? 0) : totalCount;
  const statCritical = isCompanyBoard ? (companyAggregates?.critical ?? 0) : critical;
  const statOpen = isCompanyBoard ? (companyAggregates?.openPipeline ?? 0) : open;
  const statSla = isCompanyBoard ? (companyAggregates?.slaEscalated ?? 0) : slaAtRisk;
  const companyLogTotal = companyActivityLogs.length;
  const companyLogTotalPages = Math.max(1, Math.ceil(companyLogTotal / companyLogPageSize));
  const safeCompanyLogPage = Math.min(companyLogPage, companyLogTotalPages);
  const pagedCompanyActivityLogs = companyActivityLogs.slice(
    (safeCompanyLogPage - 1) * companyLogPageSize,
    safeCompanyLogPage * companyLogPageSize,
  );

  return (
    <main className="flex min-h-[calc(100vh-56px)] flex-col bg-zinc-50 px-3 py-4 text-zinc-900 dark:bg-background dark:text-zinc-100 sm:px-4">
      <div
        className={`mx-auto flex w-full flex-1 flex-col space-y-4 ${isCompanyBoard ? "max-w-none" : "max-w-[96rem]"}`}
      >
        <section className="space-y-4">
          {notificationsOpen ? (
            <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-[0_8px_28px_rgba(0,0,0,0.06)] dark:border-zinc-800 dark:bg-surface dark:shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-700 dark:text-zinc-300">
                  Notifications
                </h2>
                <Link href={buildHref({ notifications: null })} className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200">
                  Close
                </Link>
              </div>
              <div className="mt-3 space-y-2">
                {recentUpdated.length === 0 ? (
                  <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                    No recent queue activity.
                  </p>
                ) : (
                  recentUpdated.map((item) => {
                    const notifyAssigneeKey = item.assignedAgent?.email
                      ? (assigneeColorByEmail.get(item.assignedAgent.email.trim().toLowerCase()) ?? null)
                      : null;
                    return (
                      <AssigneeColorHighlight
                        key={item.id}
                        assigneeColorKey={notifyAssigneeKey}
                        className="block rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900"
                      >
                        <AgentTicketDeepLink
                          ticketId={item.id}
                          className="block px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{item.ticketNumber}</p>
                          <p className="text-xs text-zinc-700 dark:text-zinc-300">{item.title}</p>
                          <p className="mt-1 text-[11px] uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                            {item.status.replaceAll("_", " ")} · {relativeTime(item.updatedAt)}
                          </p>
                        </AgentTicketDeepLink>
                      </AssigneeColorHighlight>
                    );
                  })
                )}
              </div>
            </section>
          ) : null}

          <div className="flex flex-col gap-3">
            <OrchestrationQueueNav />

            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-700 dark:text-orange-400/95">
                  {BRAND_TITLE} · Orchestration
                </p>
                <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                  {isCompanyBoard ? "Company overview" : "Orchestration Board"}
                </h1>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  <span className="font-semibold text-orange-700 dark:text-orange-400">
                    {activeEvents.toLocaleString()}
                  </span>{" "}
                  {!isCompanyBoard
                    ? `active ${boardTab === "kpi" ? "task" : isBoard ? "pipeline" : ""} event${activeEvents !== 1 ? "s" : ""}`
                    : `ticket${activeEvents !== 1 ? "s" : ""}`}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-stretch gap-3 lg:items-end">
                {session.user.role === "Personnel" && !isCompanyBoard && boardTab === "ticket" ? (
                  personnelRequestorIntakeBlock != null ? (
                    <Link
                      href={customerPendingTicketHref(personnelRequestorIntakeBlock)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-950 shadow-sm transition hover:bg-amber-500/25 dark:text-amber-100"
                      title="Finish your own request before opening another."
                    >
                      <Plus className="size-4" aria-hidden />
                      Resume {personnelRequestorIntakeBlock.ticketNumber}
                    </Link>
                  ) : (
                    <Link
                      href="/tickets/new"
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(234,88,12,0.32)] transition hover:bg-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2 focus:ring-offset-zinc-50 dark:focus:ring-offset-background"
                    >
                      <Plus className="size-4" aria-hidden />
                      Create ticket
                    </Link>
                  )
                ) : null}
                <div className="flex flex-wrap gap-3">
                  <StatCard label="Critical" value={statCritical} valueClass="text-rose-400" />
                  <StatCard label="Open" value={statOpen} valueClass="text-orange-400" />
                  <StatCard
                    label={isCompanyBoard ? "Transfer pending" : "SLA at Risk"}
                    value={statSla}
                    valueClass="text-amber-400"
                  />
                </div>
              </div>
            </div>
          </div>

          <section
            className={
              boardTab === "kpi"
                ? "min-w-0"
                : "rounded-xl border border-zinc-200 bg-white p-2.5 shadow-[0_8px_28px_rgba(0,0,0,0.06)] sm:p-5 dark:border-zinc-800 dark:bg-surface dark:shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
            }
          >
            {showTopTicketFilters ? (
              <AutoSubmitForm className="mb-3 flex flex-col gap-2.5 sm:mb-4 sm:gap-3" method="get">
                {viewMode === "table" ? <input type="hidden" name="view" value="table" /> : null}
                {boardTab !== "ticket" ? <input type="hidden" name="board" value={boardTab} /> : null}
                <div className="flex flex-col gap-2.5 xl:flex-row xl:items-end xl:justify-between">
                  <div className="grid w-full grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:flex lg:flex-wrap xl:w-auto">
                    {isCompanyBoard || showTicketCompanyFilter ? (
                    <label className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                      <span className="shrink-0 text-zinc-600 dark:text-zinc-400">Company:</span>
                      {showTicketCompanyFilter ? (
                        <TicketBoardCompanySelect
                          defaultValue={selectedCompany}
                          options={rosterTeamsForTicketFilter}
                          className="min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-900 outline-none dark:text-zinc-200 lg:max-w-[260px]"
                        />
                      ) : (
                        <select
                          name="company"
                          key={`cc-${selectedCompany}`}
                          defaultValue={selectedCompany}
                          className="min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-900 outline-none dark:text-zinc-200 lg:max-w-[260px]"
                        >
                          <option value="ALL">All companies</option>
                          {rosterTeamsForFilter.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </label>
                    ) : null}
                    {ticketAssignedFilterActive ? (
                    <label className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                      <span className="shrink-0 text-zinc-600 dark:text-zinc-400">Assigned:</span>
                      <select
                        name="assigned"
                        key={`assigned-${selectedCompany}-${effectiveAssigned}`}
                        defaultValue={effectiveAssigned}
                        className="min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-900 outline-none dark:text-zinc-200 lg:max-w-[200px]"
                      >
                        <option value="ALL">All</option>
                        <option value="UNASSIGNED">Unassigned</option>
                        {agentsForTicketAssigneeFilter.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    ) : null}
                    {isBoard || isCompanyBoard ? null : (
                    <label className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                      <span className="shrink-0 text-zinc-600 dark:text-zinc-400">Status:</span>
                      <select
                        name="status"
                        defaultValue={selectedStatus}
                        className="min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-900 outline-none dark:text-zinc-200"
                      >
                        {statusOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    )}
                    {!(isCompanyBoard && hideCompanyPriorityFilter) ? (
                    <label className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                      <span className="shrink-0 text-zinc-600 dark:text-zinc-400">Priority:</span>
                      <select
                        name="priority"
                        defaultValue={selectedPriority}
                        className="min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-900 outline-none dark:text-zinc-200"
                      >
                        {priorityOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    ) : null}
                  </div>
                  <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:w-auto xl:justify-end">
                    <Tabs value={isCompanyBoard ? "company" : isBoard ? "board" : "table"} className="w-full sm:w-auto">
                      <TabsList className="w-full rounded-lg border border-zinc-300 bg-zinc-100 p-0.5 text-xs font-semibold sm:w-auto dark:border-zinc-700 dark:bg-zinc-900">
                      {isCompanyBoard ? (
                      <span className="rounded-md bg-orange-600 px-3 py-1.5 text-white">Company view</span>
                      ) : session.user.role === "Personnel" ? (
                      <span className="rounded-md px-3 py-1.5 bg-orange-600 text-white">Board</span>
                      ) : (
                      <>
                        <TabsTrigger
                          value="board"
                          asChild
                          className="flex-1 rounded-md px-3 py-1.5 text-center text-xs font-semibold data-[state=active]:bg-orange-600 data-[state=active]:text-white sm:flex-none"
                        >
                          <Link
                          href={buildHref({ view: null, page: "1" })}
                        >
                          Board
                          </Link>
                        </TabsTrigger>
                        <TabsTrigger
                          value="table"
                          asChild
                          className="flex-1 rounded-md px-3 py-1.5 text-center text-xs font-semibold data-[state=active]:bg-orange-600 data-[state=active]:text-white sm:flex-none"
                        >
                          <Link
                          href={buildHref({ view: "table", page: "1" })}
                        >
                          Table
                          </Link>
                        </TabsTrigger>
                      </>
                      )}
                      </TabsList>
                    </Tabs>
                    <label className="flex min-w-0 flex-1 items-center rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 sm:min-w-[280px] xl:max-w-md dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                      <span className="mr-2">Q</span>
                      <input
                        name="q"
                        defaultValue={searchFieldQuery}
                        placeholder="Search events…"
                        className="w-full bg-transparent text-zinc-900 outline-none placeholder:text-zinc-500 dark:text-zinc-200"
                      />
                    </label>
                  </div>
                </div>
                {isBoard && !isCompanyBoard ? (
                  <p className="hidden text-[11px] text-zinc-600 sm:block dark:text-zinc-500">
                    Board view uses lanes (Open, In progress, Feedback) for active pipeline work. Use Table for resolved
                    items and full filters.
                    {showTicketCompanyFilter && !ticketCompanySelected
                      ? " Select a company to filter by assignee."
                      : null}
                  </p>
                ) : isCompanyBoard ? (
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-500">
                    One column per company with a flat ticket list (number and status). Open a ticket for a read-only
                    summary; use the ticket board for full details.
                  </p>
                ) : null}
              </AutoSubmitForm>
            ) : null}

            {isCompanyBoard && companyBoardPayload ? (
              <>
                {companyBoardPayload.emptyHint ? (
                  <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-900 dark:text-amber-100/90">
                    {companyBoardPayload.emptyHint}
                  </p>
                ) : null}
                <CompanyKanban columns={companyBoardPayload.columns} />
                <TicketActivityLogPanel
                  entries={pagedCompanyActivityLogs}
                  linkTickets
                  pagination={{
                    page: safeCompanyLogPage,
                    pageSize: companyLogPageSize,
                    total: companyLogTotal,
                    prevHref: buildHref({ logsPage: String(Math.max(1, safeCompanyLogPage - 1)) }),
                    nextHref: buildHref({
                      logsPage: String(Math.min(companyLogTotalPages, safeCompanyLogPage + 1)),
                    }),
                  }}
                />
              </>
            ) : isBoard && boardTab === "ticket" ? (
              <>
                {ticketsEmpty ? (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 py-20 text-center dark:border-zinc-800">
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-400">No tickets in the pipeline</p>
                    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-600">
                      {query ||
                      selectedPriority !== "ALL" ||
                      ticketCompanySelected ||
                      (ticketAssignedFilterActive && effectiveAssigned !== "ALL")
                        ? "Adjust filters or switch to Table view for resolved tickets."
                        : "The queue is clear — new tickets will land in Open."}
                    </p>
                  </div>
                ) : (
                  <>
                    <AgentKanban tickets={boardCards} columnTotals={boardColumnTotals} />
                    {ticketPagination}
                  </>
                )}
              </>
            ) : isBoard && boardTab === "kpi" ? (
              <>
                {showKpiTaskFilters ? (
                  <AutoSubmitForm className="mb-3 flex flex-col gap-2 sm:mb-4" method="get">
                    <input type="hidden" name="board" value="kpi" />
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                      <label className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 sm:min-w-[240px]">
                        <span className="shrink-0 text-zinc-600 dark:text-zinc-400">Company:</span>
                        <TicketBoardCompanySelect
                          defaultValue={selectedCompany}
                          options={rosterTeamsForKpiFilter}
                          className="min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-900 outline-none dark:text-zinc-200"
                        />
                      </label>
                      {kpiAssignedFilterActive ? (
                        <label className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 sm:min-w-[220px]">
                          <span className="shrink-0 text-zinc-600 dark:text-zinc-400">Assigned:</span>
                          <select
                            name="assigned"
                            key={`kpi-assigned-${selectedCompany}-${effectiveKpiAssigned}`}
                            defaultValue={effectiveKpiAssigned}
                            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-900 outline-none dark:text-zinc-200"
                          >
                            <option value="ALL">All personnel</option>
                            {agentsForKpiAssigneeFilter.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-500">
                      {kpiCompanySelected
                        ? effectiveKpiAssigned !== "ALL"
                          ? "Showing running tasks assigned to the selected person."
                          : "Showing running tasks assigned to personnel in this company."
                        : "Select a company to view running tasks by assignee."}
                    </p>
                  </AutoSubmitForm>
                ) : null}
                <AgentKpiKanbanFlow
                  companyFilterTeamId={
                    showKpiCompanyFilter && selectedCompany !== "ALL" ? selectedCompany : null
                  }
                  assignedAgentFilterId={
                    kpiAssignedFilterActive && effectiveKpiAssigned !== "ALL" ? effectiveKpiAssigned : null
                  }
                  companyFilterOptions={showKpiCompanyFilter ? rosterTeamsForKpiFilter : []}
                  currentCompanyFilter={selectedCompany}
                  showAdminTaskManagement={
                    session.user.role === "SuperAdmin" || session.user.role === "Admin"
                  }
                />
              </>
            ) : (
              <>
                <div className="w-full overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                  <table className="w-full min-w-[980px] table-fixed border-collapse divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                    <colgroup>
                      <col className="w-[9%]" />
                      <col className="w-[28%]" />
                      <col className="w-[16%]" />
                      <col className="w-[10%]" />
                      <col className="w-[12%]" />
                      <col className="w-[11%]" />
                      <col className="w-[14%]" />
                    </colgroup>
                    <thead className="bg-zinc-100 text-left text-xs font-semibold uppercase tracking-[0.16em] text-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                      <tr>
                        <th className="px-4 py-3">ID</th>
                        <th className="px-4 py-3 min-w-0">Subject</th>
                        <th className="px-4 py-3">Customer</th>
                        <th className={applySortClass("priority")}>
                          <Link href={sortHref("priority")}>Priority{sortMarker("priority")}</Link>
                        </th>
                        <th className={applySortClass("status")}>
                          <Link href={sortHref("status")}>Status{sortMarker("status")}</Link>
                        </th>
                        <th className="px-4 py-3">Rating</th>
                        <th className={applySortClass("updatedAt")}>
                          <Link href={sortHref("updatedAt")}>Updated{sortMarker("updatedAt")}</Link>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-surface">
                      {ticketsEmpty ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-14 text-center">
                            <div className="flex flex-col items-center gap-2">
                              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-400">
                                No tickets match this view
                              </p>
                              <p className="text-xs text-zinc-600 dark:text-zinc-600">
                                Try different filters or return to the board.
                              </p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        tableRows.map((t) => {
                          const assigneeColorKey =
                            (t.assignedAgent as { staffAssignmentColor?: string | null } | null)
                              ?.staffAssignmentColor ?? null;
                          return (
                          <tr
                            key={t.id}
                            className="hover:bg-zinc-50 dark:hover:bg-zinc-900/80"
                            style={personnelAssigneeHighlightStyleFromKey(assigneeColorKey)}
                          >
                            <td className="px-4 py-3 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                              {t.ticketNumber}
                            </td>
                            <td className="min-w-0 px-4 py-3 break-words">
                              <AgentTicketDeepLink
                                ticketId={t.id}
                                className="font-semibold text-zinc-900 hover:underline dark:text-zinc-100"
                              >
                                {t.title}
                              </AgentTicketDeepLink>
                              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                                Company: {t.team?.name ?? "Queue"}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-zinc-800 dark:text-zinc-300">
                              {t.contactName || t.contactEmail || "Customer"}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${t.priority === "UNSET" ? "normal-case" : "uppercase"} ${priorityPill(t.priority)}`}
                              >
                                {formatTicketPriorityLabel(t.priority)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${statusTone(t.status)}`}>
                                <span className="inline-block size-1.5 rounded-full bg-current" />
                                {t.status.replaceAll("_", " ")}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`whitespace-nowrap text-sm font-medium ${
                                  t.feedback?.csat
                                    ? "text-amber-600 dark:text-amber-300"
                                    : "text-zinc-500 dark:text-zinc-500"
                                }`}
                              >
                                {ratingLabel(t.feedback?.csat)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{relativeTime(t.updatedAt)}</td>
                          </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                {ticketPagination}
              </>
            )}
          </section>
        </section>

        <footer className="mt-auto border-t border-zinc-200 pt-3 text-[11px] text-zinc-600 dark:border-zinc-800/80">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-orange-500/90">
                <span className="size-1.5 rounded-full bg-orange-500" />
                Network operational
              </span>
              <span className="text-zinc-500">Queue sync active</span>
            </div>
            <span className="text-zinc-500">AGC command · v2</span>
          </div>
        </footer>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: number;
  valueClass: string;
}) {
  return (
    <article className="min-w-[96px] rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-[0_6px_20px_rgba(0,0,0,0.06)] dark:border-zinc-800 dark:bg-surface dark:shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-500">{label}</p>
      <p className={`mt-0.5 text-2xl font-bold ${valueClass}`}>{String(value).padStart(2, "0")}</p>
    </article>
  );
}

function relativeTime(date: Date) {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function priorityPill(priority: string) {
  if (priority === "UNSET")
    return "bg-amber-500/15 text-amber-950 dark:bg-amber-500/15 dark:text-amber-200";
  if (priority === "URGENT" || priority === "HIGH")
    return "bg-rose-500/15 text-rose-900 dark:bg-rose-500/20 dark:text-rose-200";
  if (priority === "MEDIUM")
    return "bg-orange-500/15 text-orange-900 dark:bg-orange-500/20 dark:text-orange-200";
  return "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-200";
}

function statusTone(status: string) {
  if (status === "FOR_CONFIRMATION" || status === "RESOLVED" || status === "CLOSED")
    return "text-orange-800 dark:text-orange-300";
  if (status === "IN_PROGRESS") return "text-orange-800 dark:text-orange-300";
  if (status === "ESCALATED") return "text-amber-800 dark:text-amber-300";
  return "text-zinc-700 dark:text-zinc-300";
}
