import type { Prisma, TicketPriority, TicketStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { customerCanAccessTicket, ensureTicketOwnership, requireSession } from "@/lib/access";
import { sendResolutionEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { findSessionAgentWithTeam } from "@/lib/session-agent";
import { logActivity, touchFirstResponse } from "@/lib/ticket-actions";
import { portalCompanyAdminPrivilegesForEmail } from "@/lib/portal-staff";
import { parseTransferRequestDetail, serializeTransferRequest } from "@/lib/ticket-transfer-request";
import { getTicketSlaState } from "@/lib/sla";
import { isAwaitingCustomerConfirmation } from "@/lib/customer-pending-resolution";
import { loadStaffAssignmentColorsForAgents } from "@/lib/assignee-assignment-color";
import { normalizeFeedbackComment, validateFeedbackForRating } from "@/lib/ticket-feedback-policy";
import { isAdminPortalRole } from "@/lib/staff-role";
import { rosterTeamNameFilter } from "@/lib/company-roster";
import { resolveStaffCompanyTeamId } from "@/lib/staff-company-scope";

async function ticketJsonWithAssigneeColor<T extends { assignedAgent: { email: string; name?: string } | null }>(
  ticket: T,
): Promise<
  Omit<T, "assignedAgent"> & {
    assignedAgent: (NonNullable<T["assignedAgent"]> & { staffAssignmentColor: string | null }) | null;
  }
> {
  const email = ticket.assignedAgent?.email;
  if (!email) {
    return {
      ...ticket,
      assignedAgent: ticket.assignedAgent
        ? { ...ticket.assignedAgent, staffAssignmentColor: null }
        : null,
    };
  }
  const map = await loadStaffAssignmentColorsForAgents([
    { email, name: ticket.assignedAgent?.name ?? null },
  ]);
  const staffAssignmentColor = map.get(email.trim().toLowerCase()) ?? null;
  return {
    ...ticket,
    assignedAgent: ticket.assignedAgent
      ? { ...ticket.assignedAgent, staffAssignmentColor }
      : null,
  };
}

function canTransition(from: TicketStatus, to: TicketStatus) {
  const allowed: [TicketStatus, TicketStatus][] = [
    ["OPEN", "IN_PROGRESS"],
    ["OPEN", "RESOLVED"],
    ["OPEN", "FOR_CONFIRMATION"],
    ["IN_PROGRESS", "PENDING_INFO"],
    ["IN_PROGRESS", "RESOLVED"],
    ["IN_PROGRESS", "FOR_CONFIRMATION"],
    ["PENDING_INFO", "IN_PROGRESS"],
    ["PENDING_INFO", "RESOLVED"],
    ["PENDING_INFO", "FOR_CONFIRMATION"],
    ["ESCALATED", "IN_PROGRESS"],
    ["ESCALATED", "PENDING_INFO"],
    ["ESCALATED", "RESOLVED"],
    ["ESCALATED", "FOR_CONFIRMATION"],
    ["RESOLVED", "CLOSED"],
    ["RESOLVED", "IN_PROGRESS"],
    ["FOR_CONFIRMATION", "IN_PROGRESS"],
  ];
  return allowed.some(([a, b]) => a === from && b === to);
}

function transferPendingFromActivities(
  activities: Array<{ summary: string }>,
) {
  let pending = false;
  for (const a of activities) {
    if (a.summary === "Transfer requested") pending = true;
    if (a.summary === "Transfer approved" || a.summary === "Transfer rejected") pending = false;
  }
  return pending;
}

function resolutionVerifiedFromActivities(
  activities: Array<{ summary: string }>,
) {
  let verified = false;
  for (const a of activities) {
    if (a.summary === "Resolution verification approved") verified = true;
    if (a.summary === "Resolution verification rejected") verified = false;
  }
  return verified;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      team: { select: { id: true, name: true } },
      assignedAgent: { select: { id: true, name: true, email: true, teamId: true } },
      activities: { orderBy: { createdAt: "asc" } },
      messages: { orderBy: { createdAt: "asc" } },
      feedback: true,
    },
  });
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (
    session.user.role === "Customer" &&
    !customerCanAccessTicket(
      { contactEmail: ticket.contactEmail, requestorEmail: ticket.requestorEmail },
      session.user.email,
    )
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (session.user.role === "Personnel") {
    const operator = await findSessionAgentWithTeam({ email: session.user.email, name: session.user.name });
    const companyCoordinator = await portalCompanyAdminPrivilegesForEmail(session.user.email);
    const coordinatorTeamId = companyCoordinator ? await resolveStaffCompanyTeamId(session.user.email) : null;
    const ticketInCoordinatorScope =
      !!coordinatorTeamId &&
      (ticket.teamId === coordinatorTeamId || ticket.assignedAgent?.teamId === coordinatorTeamId);
    const ticketInOperatorCompany =
      !!operator?.teamId && (ticket.teamId === operator.teamId || ticket.assignedAgent?.teamId === operator.teamId);
    if ((!operator || operator.id !== ticket.assignedAgentId) && !ticketInCoordinatorScope && !ticketInOperatorCompany) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  const payload = await ticketJsonWithAssigneeColor(ticket);
  return NextResponse.json({ ...payload, slaState: getTicketSlaState(ticket) });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: { assignedAgent: { select: { email: true, teamId: true } } },
  });
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const isOwner =
    session.user.role === "Customer"
      ? customerCanAccessTicket(
          { contactEmail: ticket.contactEmail, requestorEmail: ticket.requestorEmail },
          session.user.email,
        )
      : ensureTicketOwnership(ticket.contactEmail, session.user.email);
  const isAdminOrAgent = ["SuperAdmin", "Admin", "Personnel"].includes(session.user.role);
  const roleIsAdmin = ["SuperAdmin", "Admin"].includes(session.user.role);
  const operator = await findSessionAgentWithTeam({ email: session.user.email, name: session.user.name });
  const roleIsCompanyAdmin = await portalCompanyAdminPrivilegesForEmail(session.user.email);
  const isAssignedOperator =
    (!!operator && operator.id === ticket.assignedAgentId) ||
    (!!ticket.assignedAgent?.email &&
      !!session.user.email &&
      ticket.assignedAgent.email.trim().toLowerCase() === session.user.email.trim().toLowerCase());
  const canPrioritize = roleIsAdmin || isAssignedOperator;
  if (session.user.role === "Customer" && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const action = body.action as string;
    const loadTransferPending = async () => {
      const transferAudit = await prisma.ticketActivity.findMany({
        where: {
          ticketId: id,
          summary: { in: ["Transfer requested", "Transfer approved", "Transfer rejected"] },
        },
        orderBy: { createdAt: "asc" },
        select: { summary: true },
      });
      return transferPendingFromActivities(transferAudit);
    };
    const loadResolutionVerified = async () => {
      const verificationAudit = await prisma.ticketActivity.findMany({
        where: {
          ticketId: id,
          summary: { in: ["Resolution verification approved", "Resolution verification rejected"] },
        },
        orderBy: { createdAt: "asc" },
        select: { summary: true },
      });
      return resolutionVerifiedFromActivities(verificationAudit);
    };

    if (action === "assign") {
      return NextResponse.json(
        { error: "Assignment updates are only available on the Assignment Board." },
        { status: 403 },
      );
    }

    if (action === "status") {
      if (!isAdminOrAgent && !(isOwner && body.status === "IN_PROGRESS")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const nextStatus = body.status as TicketStatus;
      if (nextStatus === "CLOSED") {
        return NextResponse.json(
          { error: "Tickets can only be fully closed after requestor verification and star review." },
          { status: 400 },
        );
      }

      // Unassigned tickets cannot enter the work cycle.
      // This prevents setting IN_PROGRESS / FOR_CONFIRMATION when assignedAgentId is null.
      if (!ticket.assignedAgentId && (nextStatus === "IN_PROGRESS" || nextStatus === "FOR_CONFIRMATION")) {
        return NextResponse.json(
          { error: "A ticket must be assigned to personnel before it can move into In progress / For confirmation." },
          { status: 400 },
        );
      }

      if (!canTransition(ticket.status, nextStatus)) {
        return NextResponse.json(
          { error: `Cannot move from ${ticket.status} to ${nextStatus}` },
          { status: 400 },
        );
      }

      if (nextStatus === "IN_PROGRESS" && ticket.priority === "UNSET") {
        return NextResponse.json(
          {
            error:
              "Set a priority level before moving this ticket to In progress. Use Ticket controls → Priority level.",
          },
          { status: 400 },
        );
      }

      if (ticket.status === "OPEN" && nextStatus === "IN_PROGRESS") {
        if (!(roleIsAdmin || roleIsCompanyAdmin || isAssignedOperator)) {
          return NextResponse.json(
            { error: "Only the assigned personnel can start working on this ticket." },
            { status: 403 },
          );
        }
      }

      const data: Prisma.TicketUpdateInput = { status: nextStatus };

      if (nextStatus === "IN_PROGRESS" && ticket.status === "OPEN") {
        await touchFirstResponse(ticket, "AGENT");
      }

      if (nextStatus === "RESOLVED" || nextStatus === "FOR_CONFIRMATION") {
        data.resolvedAt = new Date();
        data.resolutionNotes =
          (body.resolutionNotes as string | undefined) ?? ticket.resolutionNotes;
        await touchFirstResponse(ticket, "AGENT");
      }

      if (nextStatus === "IN_PROGRESS" && isAwaitingCustomerConfirmation(ticket.status)) {
        data.reopenCount = ticket.reopenCount + 1;
        data.resolvedAt = null;
      }

      if (nextStatus === "ESCALATED") {
        return NextResponse.json(
          {
            error:
              "Use Request for transfer instead of changing status to escalated. Transfer requests are submitted from the ticket workspace.",
          },
          { status: 400 },
        );
      }

      const updated = await prisma.ticket.update({
        where: { id },
        data,
        include: { team: true, assignedAgent: true },
      });

      const actor =
        isAwaitingCustomerConfirmation(ticket.status) && nextStatus === "IN_PROGRESS"
          ? "USER"
          : "AGENT";

      await logActivity(
        id,
        actor,
        `Status → ${nextStatus}`,
        typeof body.note === "string" ? body.note : undefined,
      );

      if (nextStatus === "RESOLVED" || nextStatus === "FOR_CONFIRMATION") {
        const smtpRecipient =
          (updated as unknown as { requestorEmail?: string | null }).requestorEmail?.trim() ||
          updated.contactEmail;
        await sendResolutionEmail({
          ticketId: updated.id,
          ticketNumber: updated.ticketNumber,
          title: updated.title,
          recipientEmail: smtpRecipient,
          recipientName: updated.contactName,
          resolutionNotes: updated.resolutionNotes,
        });
        await logActivity(
          id,
          "SYSTEM",
          "Resolution email sent",
          `Mandatory rating request sent to ${smtpRecipient}.`,
        );
      }

      return NextResponse.json(await ticketJsonWithAssigneeColor(updated));
    }

    if (action === "request_more_info") {
      if (!isAdminOrAgent) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!["OPEN", "IN_PROGRESS", "ESCALATED"].includes(ticket.status)) {
        return NextResponse.json(
          { error: "More information can only be requested while the ticket is open, in progress, or transfer pending." },
          { status: 400 },
        );
      }
      const note =
        typeof body.note === "string" && body.note.trim()
          ? body.note.trim()
          : "Personnel requested additional details from the requestor.";
      await logActivity(id, "AGENT", "More information requested", note);
      const unchanged = await prisma.ticket.findUnique({
        where: { id },
        include: { team: true, assignedAgent: true },
      });
      if (!unchanged) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(await ticketJsonWithAssigneeColor(unchanged));
    }

    if (action === "priority") {
      if (!canPrioritize) {
        return NextResponse.json(
          { error: "Only Admin or the assigned personnel can change priority." },
          { status: 403 },
        );
      }
      const nextPriority = body.priority as TicketPriority;
      const allowedPriorities: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
      if (!allowedPriorities.includes(nextPriority)) {
        return NextResponse.json({ error: "Invalid priority." }, { status: 400 });
      }
      const updated = await prisma.ticket.update({
        where: { id },
        data: { priority: nextPriority },
        include: { team: true, assignedAgent: true },
      });
      await logActivity(
        id,
        "AGENT",
        `Priority → ${nextPriority}`,
        typeof body.note === "string" ? body.note : undefined,
      );
      return NextResponse.json(await ticketJsonWithAssigneeColor(updated));
    }

    if (action === "request_transfer") {
      if (!isAssignedOperator || roleIsAdmin) {
        return NextResponse.json(
          { error: "Only the assigned personnel can request transfer." },
          { status: 403 },
        );
      }
      const transferPending = await loadTransferPending();
      if (transferPending) {
        return NextResponse.json({ error: "A transfer request is already pending approval." }, { status: 400 });
      }
      const recipientPortalAccountId =
        typeof body.recipientPortalAccountId === "string" ? body.recipientPortalAccountId.trim() : "";
      const recipientSuperAdmin = Boolean(body.recipientSuperAdmin);
      const targetTeamId = typeof body.targetTeamId === "string" ? body.targetTeamId.trim() : "";
      if ((!recipientPortalAccountId && !recipientSuperAdmin) || (recipientPortalAccountId && recipientSuperAdmin)) {
        return NextResponse.json(
          {
            error:
              "Choose exactly one reviewer: a company Admin from the list, or SuperAdmin (not both).",
          },
          { status: 400 },
        );
      }
      const targetTeam = targetTeamId
        ? await prisma.team.findFirst({
            where: {
              id: targetTeamId,
              ...rosterTeamNameFilter(),
            },
            select: { id: true, name: true },
          })
        : null;
      if (targetTeamId && !targetTeam) {
        return NextResponse.json({ error: "Choose a valid destination company." }, { status: 400 });
      }
      if (targetTeam && targetTeam.id === ticket.assignedAgent?.teamId) {
        return NextResponse.json(
          { error: "Choose a different company for a cross-company transfer." },
          { status: 400 },
        );
      }
      const reasonText =
        typeof body.reason === "string" && body.reason.trim()
          ? body.reason.trim()
          : "Unable to resolve with current assignment.";
      if (recipientPortalAccountId) {
        const reviewer = await prisma.portalAccount.findUnique({
          where: { id: recipientPortalAccountId },
          select: { accountStatus: true, staffDesignatedCompanyId: true, role: true },
        });
        if (
          !reviewer ||
          reviewer.accountStatus !== "ACTIVE" ||
          reviewer.staffDesignatedCompanyId !== ticket.assignedAgent?.teamId ||
          !isAdminPortalRole(reviewer.role)
        ) {
          return NextResponse.json(
            { error: "Choose an active company Admin from the assigned personnel's company." },
            { status: 400 },
          );
        }
      }
      await logActivity(
        id,
        "AGENT",
        "Transfer requested",
        serializeTransferRequest({
          recipientPortalAccountId: recipientPortalAccountId || null,
          recipientSuperAdmin,
          targetTeamId: targetTeam?.id ?? null,
          targetTeamName: targetTeam?.name ?? null,
          reason: reasonText,
        }),
      );
      const updated = await prisma.ticket.update({
        where: { id },
        data: {
          status: ticket.status === "OPEN" ? "ESCALATED" : ticket.status,
        },
        include: { team: true, assignedAgent: true },
      });
      return NextResponse.json(await ticketJsonWithAssigneeColor(updated));
    }

    if (action === "approve_transfer") {
      const transferPending = await loadTransferPending();
      if (!transferPending) {
        return NextResponse.json({ error: "No pending transfer request." }, { status: 400 });
      }
      const transferAudit = await prisma.ticketActivity.findMany({
        where: {
          ticketId: id,
          summary: { in: ["Transfer requested", "Transfer approved", "Transfer rejected"] },
        },
        orderBy: { createdAt: "asc" },
        select: { summary: true, detail: true },
      });
      let lastRequestDetail: string | null = null;
      for (const row of transferAudit) {
        if (row.summary === "Transfer requested") lastRequestDetail = row.detail ?? null;
        if (row.summary === "Transfer approved" || row.summary === "Transfer rejected") lastRequestDetail = null;
      }
      const parsed = parseTransferRequestDetail(lastRequestDetail);
      let mayApprove = false;
      if (session.user.role === "SuperAdmin") {
        mayApprove = true;
      } else if (parsed?.recipientSuperAdmin) {
        /** Only SuperAdmin — already ruled out above when false */
        mayApprove = false;
      } else if (parsed?.recipientPortalAccountId) {
        const reviewer = await prisma.portalAccount.findFirst({
          where: { email: { equals: session.user.email ?? "", mode: "insensitive" } },
          select: { id: true },
        });
        mayApprove = reviewer?.id === parsed.recipientPortalAccountId;
      } else {
        /** Legacy requests without structured recipient — Admin / SuperAdmin only */
        mayApprove = roleIsAdmin;
      }
      if (!mayApprove) {
        return NextResponse.json(
          { error: "Only the selected reviewer (or SuperAdmin) can approve this transfer." },
          { status: 403 },
        );
      }
      const targetTeam = parsed?.targetTeamId
        ? await prisma.team.findFirst({
            where: {
              id: parsed.targetTeamId,
              ...rosterTeamNameFilter(),
            },
            select: { id: true },
          })
        : null;
      if (parsed?.targetTeamId && !targetTeam) {
        return NextResponse.json({ error: "Transfer destination company no longer exists." }, { status: 400 });
      }
      const destinationTeamId = targetTeam?.id ?? ticket.assignedAgent?.teamId ?? null;
      const updated = await prisma.ticket.update({
        where: { id },
        data: {
          assignedAgentId: null,
          ...(destinationTeamId ? { teamId: destinationTeamId } : {}),
          status: "OPEN",
        },
        include: { team: true, assignedAgent: true },
      });
      await logActivity(
        id,
        "SYSTEM",
        "Transfer approved",
        typeof body.note === "string" ? body.note : "Admin approved reassignment request.",
      );
      return NextResponse.json(await ticketJsonWithAssigneeColor(updated));
    }

    if (action === "feedback") {
      if (!isOwner && !["SuperAdmin", "Admin"].includes(session.user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!["FOR_CONFIRMATION", "RESOLVED", "CLOSED"].includes(ticket.status)) {
        return NextResponse.json(
          { error: "Feedback allowed only for tickets awaiting confirmation or closed." },
          { status: 400 },
        );
      }
      const resolutionVerified = await loadResolutionVerified();
      if (!resolutionVerified) {
        return NextResponse.json(
          { error: "Email verification is required before submitting a star review." },
          { status: 400 },
        );
      }
      const csat = Number(body.csat);
      if (!Number.isFinite(csat) || csat < 1 || csat > 5) {
        return NextResponse.json({ error: "csat must be 1-5" }, { status: 400 });
      }
      const comment = normalizeFeedbackComment(body.comment);
      const feedbackError = validateFeedbackForRating(csat, comment);
      if (feedbackError) {
        return NextResponse.json({ error: feedbackError }, { status: 400 });
      }
      const nps =
        body.nps === undefined || body.nps === null
          ? null
          : Number(body.nps);
      if (nps !== null && (!Number.isFinite(nps) || nps < 0 || nps > 10)) {
        return NextResponse.json({ error: "nps must be 0-10" }, { status: 400 });
      }
      const ces =
        body.ces === undefined || body.ces === null
          ? null
          : Number(body.ces);
      if (ces !== null && (!Number.isFinite(ces) || ces < 1 || ces > 7)) {
        return NextResponse.json({ error: "ces must be 1-7" }, { status: 400 });
      }

      const existingFeedback = await prisma.ticketFeedback.findUnique({ where: { ticketId: id } });
      const fb = await prisma.ticketFeedback.upsert({
        where: { ticketId: id },
        create: {
          ticketId: id,
          csat,
          nps,
          ces,
          comment,
        },
        update: {
          csat,
          nps,
          ces,
          comment,
        },
      });

      if (!existingFeedback && (ticket.status === "RESOLVED" || ticket.status === "FOR_CONFIRMATION")) {
        await prisma.ticket.update({
          where: { id },
          data: { status: "CLOSED", closedAt: new Date() },
        });
        await logActivity(
          id,
          "USER",
          "Status → CLOSED",
          "Ticket closed automatically after mandatory rating.",
        );
      }

      await logActivity(id, "USER", "Feedback captured", "CSAT / optional NPS & CES recorded.");

      return NextResponse.json(fb);
    }

    if (action === "resolution_verification") {
      if (!isOwner && !["SuperAdmin", "Admin"].includes(session.user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!isAwaitingCustomerConfirmation(ticket.status)) {
        return NextResponse.json(
          { error: "Verification is only allowed while the ticket awaits your confirmation." },
          { status: 400 },
        );
      }
      const verified = Boolean(body.verified);
      if (!verified) {
        const reason = (body.reason as string | undefined)?.trim();
        if (!reason) {
          return NextResponse.json(
            { error: "Reason is required when not verifying resolution." },
            { status: 400 },
          );
        }
        const updated = await prisma.ticket.update({
          where: { id },
          data: {
            status: "OPEN",
            resolvedAt: null,
            reopenCount: ticket.reopenCount + 1,
          },
          include: { team: true, assignedAgent: true },
        });
        await logActivity(
          id,
          "USER",
          "Resolution verification rejected",
          reason,
        );
        return NextResponse.json(await ticketJsonWithAssigneeColor(updated));
      }
      await logActivity(
        id,
        "USER",
        "Resolution verification approved",
        "Requestor confirmed resolution via email verification.",
      );
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
