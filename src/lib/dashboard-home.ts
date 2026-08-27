import type { Session } from "next-auth";
import type { Prisma, TicketPriority, TicketStatus } from "@prisma/client/primary";
import { isElevatedUserRole } from "@/lib/auth";
import { ACTIVE_REQUEST_STATUSES, OPEN_PIPELINE_STATUSES } from "@/lib/active-request-statuses";
import { prisma } from "@/lib/prisma";
import { personnelRequestBoardWhere } from "@/lib/rfp-request-board";
import { findSessionAgentId } from "@/lib/session-agent";
import { getTicketSlaState } from "@/lib/sla";
import { resolveStaffCompanyTeamId } from "@/lib/staff-company-scope";
import {
  resolveViewerDepartmentScopeLabel,
  roleUsesOrgChartSectionBoardScope,
  sectionScopedTicketWhere,
} from "@/lib/org-chart-section-scope";
import { countTaskBoardLanes } from "@/lib/task-board-lane-counts";
import {
  listPendingTravelApprovalsForAgent,
  listPendingTravelConfirmationsForAgent,
} from "@/lib/travel-order-db";
import { requestTypeAcronym } from "@/lib/request-types";
import { formatTicketStatusLabel } from "@/lib/ticket-status-label";
import { formatTicketPriorityLabel } from "@/lib/ticket-priority-label";

export type DashboardActionItem = {
  id: string;
  kind: "ticket" | "travel_order" | "task" | "approval";
  title: string;
  subtitle?: string;
  href: string;
  status?: string;
  badge?: string;
  slaState?: "ON_TRACK" | "AT_RISK" | "BREACHED";
  priority?: string;
  updatedAt: string;
};

export type DashboardActivityItem = {
  id: string;
  ticketNumber: string;
  title: string;
  summary: string;
  createdAt: string;
  href: string;
};

export type DashboardSummary = {
  open: number;
  inProgress: number;
  forConfirmation: number;
  closed: number;
  unassigned: number;
  slaBreached: number;
  slaAtRisk: number;
  tasksDelayed: number;
  pendingApprovals: number;
  escalated: number;
  avgResponseMinutes: number;
  resolutionRate: number;
};

export type StaffDashboardHome = {
  greeting: string;
  scopeLabel: string;
  isAdminView: boolean;
  isPersonnelView: boolean;
  summary: DashboardSummary;
  needsAction: DashboardActionItem[];
  assignedPreview: DashboardActionItem[];
  overdueItems: DashboardActionItem[];
  recentActivity: DashboardActivityItem[];
};

function minsBetween(a: Date, b: Date) {
  return Math.max(0, (a.getTime() - b.getTime()) / 60000);
}

async function resolveTicketScope(session: Session): Promise<{
  ticketScope: Prisma.TicketWhereInput;
  scopedCompanyTeamId: string | null;
  scopedCompanyName: string | null;
  departmentScopeLabel: string | null;
  personnelAgentId: string | null;
  isSuperAdmin: boolean;
  isPersonnel: boolean;
  isAdminView: boolean;
}> {
  const user = session.user;
  const isSuperAdmin = isElevatedUserRole(user.role);
  const isPersonnel = user.role === "Personnel";
  const isAdminView = isSuperAdmin || user.role === "Admin";
  const personnelAgent =
    isPersonnel || user.role === "Admin"
      ? await findSessionAgentId({ email: user.email, name: user.name })
      : null;

  let ticketScope: Prisma.TicketWhereInput;
  let scopedCompanyTeamId: string | null = null;
  let departmentScopeLabel: string | null = null;

  if (isSuperAdmin) {
    ticketScope = {};
  } else if (roleUsesOrgChartSectionBoardScope(user.role)) {
    ticketScope = await sectionScopedTicketWhere({
      email: user.email,
      agentId: personnelAgent?.id,
    });
    departmentScopeLabel = await resolveViewerDepartmentScopeLabel(user.email);
    scopedCompanyTeamId = await resolveStaffCompanyTeamId(user.email);
  } else if (isPersonnel) {
    ticketScope = await personnelRequestBoardWhere(personnelAgent?.id);
  } else {
    scopedCompanyTeamId = await resolveStaffCompanyTeamId(user.email);
    ticketScope = { teamId: scopedCompanyTeamId ?? "__none__" };
  }

  const scopedCompanyName =
    !isSuperAdmin && scopedCompanyTeamId
      ? (
          await prisma.team.findUnique({
            where: { id: scopedCompanyTeamId },
            select: { name: true },
          })
        )?.name ?? null
      : null;

  return {
    ticketScope,
    scopedCompanyTeamId,
    scopedCompanyName,
    departmentScopeLabel,
    personnelAgentId: personnelAgent?.id ?? null,
    isSuperAdmin,
    isPersonnel,
    isAdminView,
  };
}

function ticketToActionItem(row: {
  id: string;
  ticketNumber: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  requestType: string;
  updatedAt: Date;
  contactName: string;
  resolutionDueAt: Date;
  firstResponseAt: Date | null;
  firstResponseDueAt: Date;
}): DashboardActionItem {
  const slaState = getTicketSlaState(row as Parameters<typeof getTicketSlaState>[0]);
  return {
    id: row.id,
    kind: "ticket",
    title: row.title?.trim() || row.ticketNumber,
    subtitle: `${row.ticketNumber} · ${row.contactName}`,
    href: `/agent/tickets/${row.id}`,
    status: formatTicketStatusLabel(row.status),
    badge: requestTypeAcronym(row.requestType),
    slaState,
    priority: formatTicketPriorityLabel(row.priority),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function loadStaffDashboardHome(session: Session): Promise<StaffDashboardHome> {
  const user = session.user;
  const now = new Date();
  const riskWindow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const firstName = user.name?.split(" ")[0] ?? "there";

  const ctx = await resolveTicketScope(session);
  const {
    ticketScope,
    personnelAgentId,
    isSuperAdmin,
    isPersonnel,
    isAdminView,
    scopedCompanyName,
    departmentScopeLabel,
  } = ctx;

  const activeWhere: Prisma.TicketWhereInput = {
    status: { in: ACTIVE_REQUEST_STATUSES },
    ...ticketScope,
  };
  const pipelineWhere: Prisma.TicketWhereInput = {
    status: { in: [...OPEN_PIPELINE_STATUSES, "ESCALATED"] },
    ...ticketScope,
  };
  const unassignedWhere: Prisma.TicketWhereInput = isAdminView
    ? {
        assignedAgentId: null,
        status: { in: [...OPEN_PIPELINE_STATUSES, "ESCALATED"] },
        ...ticketScope,
      }
    : { id: "__none__" };

  const countStatus = (status: TicketStatus | TicketStatus[]) =>
    prisma.ticket.count({
      where: {
        status: Array.isArray(status) ? { in: status } : status,
        ...ticketScope,
      },
    });

  const [
    open,
    inProgress,
    forConfirmation,
    closed,
    unassigned,
    slaBreached,
    slaAtRisk,
    escalated,
    firstResponses,
    totalTickets,
    resolvedClosed,
    taskLanes,
    pipelineTickets,
    overdueTickets,
    recentActivities,
    pendingTravelApprovals,
    pendingTravelConfirmations,
    accountRequestsPending,
  ] = await Promise.all([
    countStatus("OPEN"),
    countStatus(["IN_PROGRESS", "PENDING_INFO", "ESCALATED"]),
    countStatus(["FOR_CONFIRMATION", "RESOLVED"]),
    countStatus("CLOSED"),
    prisma.ticket.count({ where: unassignedWhere }),
    prisma.ticket.count({
      where: { ...pipelineWhere, resolutionDueAt: { lt: now } },
    }),
    prisma.ticket.count({
      where: { ...pipelineWhere, resolutionDueAt: { gte: now, lte: riskWindow } },
    }),
    countStatus("ESCALATED"),
    prisma.ticket.findMany({
      where: { firstResponseAt: { not: null }, ...ticketScope },
      select: { createdAt: true, firstResponseAt: true },
      take: 60,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.ticket.count({ where: ticketScope }),
    prisma.ticket.count({
      where: { status: { in: ["FOR_CONFIRMATION", "RESOLVED", "CLOSED"] }, ...ticketScope },
    }),
    countTaskBoardLanes({
      role: user.role ?? "Personnel",
      email: user.email,
      name: user.name,
    }),
    prisma.ticket.findMany({
      where: pipelineWhere,
      orderBy: { updatedAt: "desc" },
      take: isPersonnel ? 12 : 8,
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        status: true,
        priority: true,
        requestType: true,
        updatedAt: true,
        contactName: true,
        assignedAgentId: true,
        resolutionDueAt: true,
        firstResponseAt: true,
        firstResponseDueAt: true,
      },
    }),
    prisma.ticket.findMany({
      where: {
        ...pipelineWhere,
        OR: [
          { resolutionDueAt: { lt: now } },
          { resolutionDueAt: { gte: now, lte: riskWindow } },
        ],
        priority: { in: ["HIGH", "URGENT"] },
      },
      orderBy: { resolutionDueAt: "asc" },
      take: 6,
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        status: true,
        priority: true,
        requestType: true,
        updatedAt: true,
        contactName: true,
        resolutionDueAt: true,
        firstResponseAt: true,
        firstResponseDueAt: true,
      },
    }),
    prisma.ticketActivity.findMany({
      where: { ticket: ticketScope },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        summary: true,
        createdAt: true,
        ticket: { select: { id: true, ticketNumber: true, title: true } },
      },
    }),
    personnelAgentId
      ? listPendingTravelApprovalsForAgent(personnelAgentId).catch(() => [])
      : Promise.resolve([]),
    personnelAgentId
      ? listPendingTravelConfirmationsForAgent(personnelAgentId).catch(() => [])
      : Promise.resolve([]),
    isAdminView
      ? prisma.accountActionRequest.count({ where: { status: "PENDING" } })
      : Promise.resolve(0),
  ]);

  const avgResponseMinutes =
    firstResponses.length === 0
      ? 0
      : Math.round(
          firstResponses.reduce(
            (sum, row) => sum + minsBetween(row.firstResponseAt ?? row.createdAt, row.createdAt),
            0,
          ) / firstResponses.length,
        );

  const resolutionRate = totalTickets === 0 ? 0 : (resolvedClosed / totalTickets) * 100;
  const pendingApprovals =
    pendingTravelApprovals.length +
    pendingTravelConfirmations.length +
    (isAdminView ? accountRequestsPending : 0);

  const travelActions: DashboardActionItem[] = [
    ...pendingTravelApprovals.map((row) => ({
      id: `travel-approval-${row.id}`,
      kind: "travel_order" as const,
      title: row.orderRequest?.trim() || "Travel order approval",
      subtitle: row.kpiMainTask || row.kpiTitle || undefined,
      href: row.kpiMaintenanceId
        ? `/agent/tasks?task=${encodeURIComponent(row.kpiMaintenanceId)}`
        : "/agent/tasks",
      status: "Awaiting approval",
      badge: "T.O.",
      updatedAt: row.updatedAt?.toISOString?.() ?? now.toISOString(),
    })),
    ...pendingTravelConfirmations.map((row) => ({
      id: `travel-confirm-${row.id}`,
      kind: "travel_order" as const,
      title: row.orderRequest?.trim() || "Travel order confirmation",
      subtitle: row.kpiMainTask || row.kpiTitle || undefined,
      href: row.kpiMaintenanceId
        ? `/agent/tasks?task=${encodeURIComponent(row.kpiMaintenanceId)}`
        : "/agent/tasks",
      status: "Awaiting confirmation",
      badge: "T.O.",
      updatedAt: row.updatedAt?.toISOString?.() ?? now.toISOString(),
    })),
  ];

  const ticketActions = pipelineTickets.map(ticketToActionItem);
  const assignedPreview = isPersonnel
    ? ticketActions.filter((row) => pipelineTickets.find((t) => t.id === row.id)?.assignedAgentId === personnelAgentId)
    : ticketActions.slice(0, 5);

  const needsAction = [...travelActions, ...ticketActions]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 10);

  const scopeLabel = isPersonnel
    ? departmentScopeLabel
      ? `Your department · ${departmentScopeLabel}`
      : "Your assigned work"
    : isSuperAdmin
      ? "All companies"
      : departmentScopeLabel ?? scopedCompanyName ?? "Your assigned department";

  return {
    greeting: firstName,
    scopeLabel,
    isAdminView,
    isPersonnelView: isPersonnel,
    summary: {
      open,
      inProgress,
      forConfirmation,
      closed,
      unassigned,
      slaBreached,
      slaAtRisk,
      tasksDelayed: taskLanes.delayed,
      pendingApprovals,
      escalated,
      avgResponseMinutes,
      resolutionRate,
    },
    needsAction,
    assignedPreview: assignedPreview.slice(0, 6),
    overdueItems: overdueTickets.map(ticketToActionItem),
    recentActivity: recentActivities.map((row) => ({
      id: row.id,
      ticketNumber: row.ticket.ticketNumber,
      title: row.ticket.title,
      summary: row.summary,
      createdAt: row.createdAt.toISOString(),
      href: `/agent/tickets/${row.ticket.id}`,
    })),
  };
}

export type CustomerStatusSummary = {
  open: number;
  inProgress: number;
  forConfirmation: number;
  closed: number;
};

export function summarizeCustomerTicketStatuses(
  statuses: TicketStatus[],
): CustomerStatusSummary {
  const summary: CustomerStatusSummary = {
    open: 0,
    inProgress: 0,
    forConfirmation: 0,
    closed: 0,
  };
  for (const status of statuses) {
    if (status === "OPEN") summary.open += 1;
    else if (status === "IN_PROGRESS" || status === "PENDING_INFO" || status === "ESCALATED") {
      summary.inProgress += 1;
    } else if (status === "FOR_CONFIRMATION" || status === "RESOLVED") {
      summary.forConfirmation += 1;
    } else if (status === "CLOSED") summary.closed += 1;
  }
  return summary;
}
