import type { Prisma } from "@prisma/client";
import { TicketCategory, TicketPriority } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/access";
import {
  customerTicketWhereBySessionEmail,
  requestorHasIntakeBlockingTicket,
} from "@/lib/customer-pending-resolution";
import { COMPANY_ROSTER } from "@/lib/company-roster";
import { ensureOutsideCompanyTeam } from "@/lib/outside-company-team";
import { logActivity } from "@/lib/ticket-actions";
import { prisma } from "@/lib/prisma";
import { findSessionAgentId } from "@/lib/session-agent";
import { addHours, getSlaPolicy } from "@/lib/sla";
import { nextTicketNumber } from "@/lib/ticket-number";
import { shouldNotifyAdminOnCreate, shouldNotifySuperAdminOnCreate } from "@/lib/triggers";
import {
  IntakeContactError,
  isValidWorkEmail,
  resolveTicketContactFields,
} from "@/lib/ticket-intake-contact";
import { resolveCustomerRequestTeam } from "@/lib/ticket-intake-request-team";
import type { IntakeScreenshotMetaItem } from "@/lib/ticket-intake-screenshots-meta";
import { persistTicketScreenshots, validateScreenshotFiles } from "@/lib/ticket-intake-screenshots";
import { resolveStaffCompanyTeamId } from "@/lib/staff-company-scope";
import { loadStaffAssignmentColorsForAgents } from "@/lib/assignee-assignment-color";

const categories = new Set(Object.values(TicketCategory));
const priorities = new Set(Object.values(TicketPriority));

export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await requireSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const teamId = searchParams.get("teamId");
  const limitParam = Number.parseInt(searchParams.get("limit") ?? "50", 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 50;
  const operator =
    session.user.role === "Personnel"
      ? await findSessionAgentId({ email: session.user.email, name: session.user.name })
      : null;

  const tickets = await prisma.ticket.findMany({
    where: {
      ...(status ? { status: status as never } : {}),
      ...(teamId ? { teamId } : {}),
      ...(session.user.role === "Personnel" ? { assignedAgentId: operator?.id ?? "__none__" } : {}),
      ...(session.user.role === "Customer"
        ? customerTicketWhereBySessionEmail(session.user.email ?? "")
        : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      category: true,
      contactName: true,
      contactEmail: true,
      createdAt: true,
      updatedAt: true,
      teamId: true,
      assignedAgentId: true,
      team: { select: { id: true, name: true } },
      assignedAgent: { select: { id: true, name: true, email: true } },
    },
    take: limit,
  });

  const colorMap = await loadStaffAssignmentColorsForAgents(
    tickets.map((t) => ({ email: t.assignedAgent?.email, name: t.assignedAgent?.name })),
  );
  const enriched = tickets.map((t) => {
    const email = t.assignedAgent?.email?.trim().toLowerCase();
    const staffAssignmentColor = email ? (colorMap.get(email) ?? null) : null;
    return {
      ...t,
      assignedAgent: t.assignedAgent
        ? { ...t.assignedAgent, staffAssignmentColor }
        : null,
    };
  });

  if (process.env.NODE_ENV === "development") {
    console.info(
      `[perf] GET /api/tickets ${Date.now() - startedAt}ms role=${session.user.role} rows=${enriched.length}`,
    );
  }
  return NextResponse.json(enriched);
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const session = await requireSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";
    let title: string | undefined;
    let description: string | undefined;
    let issue: string | undefined;
    let screenshotNames: unknown;
    let category: string | undefined;
    let priority: string | undefined;
    let contactPhone: string | undefined;
    let companyTeamIdRaw: string | undefined;
    let portalCompanyTeamIdRaw: string | undefined;
    let customerOrgRoleRaw: string | undefined;
    let branchRaw: string | undefined;
    let assignedCompanyTextRaw: string | undefined;
    let contactNameRaw: string | undefined;
    let contactEmailRaw: string | undefined;
    let requestToCompanySbuRaw: string | undefined;
    let screenshotFiles: File[] | undefined;

    if (contentType.includes("multipart/form-data")) {
      const fd = await req.formData();
      issue = String(fd.get("issue") || "");
      const ct = fd.get("companyTeamId");
      companyTeamIdRaw = ct != null ? String(ct) : undefined;
      const pct = fd.get("portalCompanyTeamId");
      portalCompanyTeamIdRaw = pct != null ? String(pct) : undefined;
      const cor = fd.get("customerOrgRole");
      customerOrgRoleRaw = cor != null ? String(cor) : undefined;
      const br = fd.get("branch");
      branchRaw = br != null ? String(br) : undefined;
      const ac = fd.get("assignedCompanyText");
      assignedCompanyTextRaw = ac != null ? String(ac) : undefined;
      const cn = fd.get("contactName");
      contactNameRaw = cn != null ? String(cn) : undefined;
      const cem = fd.get("contactEmail");
      contactEmailRaw = cem != null ? String(cem) : undefined;
      const rts = fd.get("requestToCompanySbu");
      requestToCompanySbuRaw = rts != null ? String(rts) : undefined;
      const raw = fd.getAll("screenshots");
      screenshotFiles = raw.filter((x): x is File => x instanceof File && x.size > 0);
      const v = validateScreenshotFiles(screenshotFiles);
      if (!v.ok) {
        return NextResponse.json({ error: v.error }, { status: 400 });
      }
    } else {
      const body = (await req.json()) as Record<string, unknown>;
      title = typeof body.title === "string" ? body.title : undefined;
      description = typeof body.description === "string" ? body.description : undefined;
      issue = typeof body.issue === "string" ? body.issue : undefined;
      screenshotNames = body.screenshotNames;
      category = typeof body.category === "string" ? body.category : undefined;
      priority = typeof body.priority === "string" ? body.priority : undefined;
      contactPhone = typeof body.contactPhone === "string" ? body.contactPhone : undefined;
      companyTeamIdRaw =
        typeof body.companyTeamId === "string" ? body.companyTeamId : undefined;
      portalCompanyTeamIdRaw =
        typeof body.portalCompanyTeamId === "string" ? body.portalCompanyTeamId : undefined;
      customerOrgRoleRaw =
        typeof body.customerOrgRole === "string" ? body.customerOrgRole : undefined;
      branchRaw = typeof body.branch === "string" ? body.branch : undefined;
      assignedCompanyTextRaw =
        typeof body.assignedCompanyText === "string" ? body.assignedCompanyText : undefined;
      contactNameRaw = typeof body.contactName === "string" ? body.contactName : undefined;
      contactEmailRaw = typeof body.contactEmail === "string" ? body.contactEmail : undefined;
      requestToCompanySbuRaw =
        typeof body.requestToCompanySbu === "string" ? body.requestToCompanySbu : undefined;
    }

    const accountEmail = (session.user.email || "").trim().toLowerCase();
    if (!accountEmail) {
      return NextResponse.json({ error: "Signed-in account email is required." }, { status: 400 });
    }

    let effectiveContactEmail: string;
    let effectiveRequestorEmail: string;
    try {
      const resolved = await resolveTicketContactFields({
        sessionEmail: accountEmail,
        authProvider: session.user.authProvider,
        bodyRequestorEmail: undefined,
      });
      effectiveContactEmail = resolved.contactEmail;
      effectiveRequestorEmail = resolved.requestorEmail;
    } catch (e) {
      if (e instanceof IntakeContactError) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }

    let effectiveName =
      (session.user.name || "").trim() ||
      (effectiveRequestorEmail.includes("@") ? effectiveRequestorEmail.split("@")[0] : "") ||
      "User";

    const staffIntakeRoles = new Set(["SuperAdmin", "Admin", "Personnel"]);
    const intakeNameTrimmed = (contactNameRaw ?? "").trim();
    const intakeEmailTrimmed = (contactEmailRaw ?? "").trim().toLowerCase();
    if (staffIntakeRoles.has(session.user.role)) {
      if (intakeNameTrimmed) {
        effectiveName = intakeNameTrimmed.slice(0, 200);
      }
      if (intakeEmailTrimmed && isValidWorkEmail(intakeEmailTrimmed)) {
        effectiveContactEmail = intakeEmailTrimmed;
        effectiveRequestorEmail = intakeEmailTrimmed;
      }
    }

    const identityEmails = [
      ...new Set(
        [effectiveRequestorEmail, effectiveContactEmail]
          .map((e) => e.trim().toLowerCase())
          .filter((e) => e.length > 0),
      ),
    ];
    const blocking = await requestorHasIntakeBlockingTicket(identityEmails);
    if (blocking) {
      return NextResponse.json(
        {
          error:
            "This requestor already has a ticket that is in progress or awaiting confirmation. Confirm and close that ticket before submitting a new one.",
          pendingTicketId: blocking.id,
          pendingTicketNumber: blocking.ticketNumber,
        },
        { status: 409 },
      );
    }

    const effectiveCategory = (category || "GENERAL").trim();
    const effectivePriority = (priority && String(priority).trim() ? String(priority).trim() : "LOW");
    const issueText = (issue || description || "").trim();
    const branch = (branchRaw ?? "").trim();
    if (branch.length > 120) {
      return NextResponse.json({ error: "Branch must be at most 120 characters." }, { status: 400 });
    }
    const sessionCompanyId =
      typeof session.user.companyId === "string" && session.user.companyId.trim()
        ? session.user.companyId.trim()
        : null;
    const screenshotList = Array.isArray(screenshotNames)
      ? screenshotNames.map((v) => String(v).trim()).filter(Boolean)
      : [];
    const normalizedTitle = (
      title ||
      issueText.split("\n")[0]?.trim() ||
      `${effectiveName} request`
    ).trim();
    const normalizedDescription = issueText;

    if (!normalizedTitle || !issueText || !effectiveName || !effectiveRequestorEmail || !effectiveContactEmail) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 },
      );
    }
    if (!categories.has(effectiveCategory as TicketCategory)) {
      return NextResponse.json({ error: "Invalid category." }, { status: 400 });
    }
    if (!priorities.has(effectivePriority as TicketPriority)) {
      return NextResponse.json({ error: "Invalid priority." }, { status: 400 });
    }

    const policy = await getSlaPolicy(effectivePriority as TicketPriority);
    const now = new Date();
    const firstResponseDueAt = addHours(now, policy.firstResponseHours);
    const resolutionDueAt = addHours(now, policy.resolutionHours);

    const googleOAuthCustomer =
      session.user.role === "Customer" &&
      (session.user.authProvider ?? "").trim().toLowerCase() === "google";

    let team: { id: string; name: string } | null = null;
    let customerRequestSbuText: string | null = null;
    let customerSbuRoutingMatched: boolean | null = null;
    let customerAssignedCompanyText: string | null = null;
    let customerAssignedOutsideQueue = false;
    let customerRequestOutsideQueue = false;

    if (session.user.role === "Customer") {
      const assignedCompanyText = (assignedCompanyTextRaw ?? "").trim();
      if (!assignedCompanyText) {
        return NextResponse.json({ error: "Assigned company is required." }, { status: 400 });
      }
      if (assignedCompanyText.length > 500) {
        return NextResponse.json(
          { error: "Assigned company must be at most 500 characters." },
          { status: 400 },
        );
      }
      customerAssignedCompanyText = assignedCompanyText;

      const resolvedAssigned = await resolveCustomerRequestTeam({
        requestText: assignedCompanyText,
        fallbackTeamId: sessionCompanyId,
      });
      const outsideTeam = await ensureOutsideCompanyTeam();
      customerAssignedOutsideQueue = !resolvedAssigned;
      const effectivePortalCompanyId = resolvedAssigned?.team.id ?? outsideTeam.id;

      if (googleOAuthCustomer) {
        const trimmedOrgRole =
          (customerOrgRoleRaw ?? "").trim() ||
          (typeof session.user.customerOrgRole === "string" ? session.user.customerOrgRole.trim() : "");
        const effectiveOrgRole = trimmedOrgRole || "Personnel";
        if (effectiveOrgRole.length > 120) {
          return NextResponse.json({ error: "Your role must be at most 120 characters." }, { status: 400 });
        }
        await prisma.portalAccount.updateMany({
          where: { email: { equals: accountEmail, mode: "insensitive" } },
          data: {
            companyId: effectivePortalCompanyId,
            customerOrgRole: effectiveOrgRole,
          },
        });
      } else {
        await prisma.portalAccount.updateMany({
          where: { email: { equals: accountEmail, mode: "insensitive" } },
          data: { companyId: effectivePortalCompanyId },
        });
      }

      const requestToCompanySbu = (requestToCompanySbuRaw ?? "").trim();
      if (!requestToCompanySbu) {
        return NextResponse.json({ error: "Request to Company/SBU is required." }, { status: 400 });
      }
      if (requestToCompanySbu.length > 500) {
        return NextResponse.json(
          { error: "Request to Company/SBU must be at most 500 characters." },
          { status: 400 },
        );
      }
      customerRequestSbuText = requestToCompanySbu;

      const routed = await resolveCustomerRequestTeam({
        requestText: requestToCompanySbu,
        fallbackTeamId: effectivePortalCompanyId,
      });
      customerRequestOutsideQueue = !routed;
      team = routed?.team ?? outsideTeam;
      customerSbuRoutingMatched = routed?.matched ?? false;
    } else {
      const rawCompanyTeamId = (companyTeamIdRaw || "").trim();
      const requestToCompanySbu = (requestToCompanySbuRaw ?? "").trim();
      if (requestToCompanySbu.length > 500) {
        return NextResponse.json(
          { error: "Request to Company/SBU must be at most 500 characters." },
          { status: 400 },
        );
      }
      if (rawCompanyTeamId) {
        const selectedTeam = await prisma.team.findUnique({
          where: { id: rawCompanyTeamId },
          select: { id: true, name: true },
        });
        if (!selectedTeam || !(COMPANY_ROSTER as readonly string[]).includes(selectedTeam.name)) {
          return NextResponse.json({ error: "Invalid company/SBU selection." }, { status: 400 });
        }
        team = selectedTeam;
      } else if (session.user.role === "Personnel" && requestToCompanySbu) {
        const fallbackTeamId = await resolveStaffCompanyTeamId(accountEmail);
        const outsideTeam = await ensureOutsideCompanyTeam();
        const routed = await resolveCustomerRequestTeam({
          requestText: requestToCompanySbu,
          fallbackTeamId,
        });
        team = routed?.team ?? outsideTeam;
        customerRequestSbuText = requestToCompanySbu;
        customerRequestOutsideQueue = !routed;
        customerSbuRoutingMatched = routed?.matched ?? false;
      } else {
        return NextResponse.json(
          { error: "Request to Company/SBU is required." },
          { status: 400 },
        );
      }
    }

    const ticketNumber = await nextTicketNumber();

    const createData: Prisma.TicketCreateInput = {
      ticketNumber,
      title: normalizedTitle,
      description: normalizedDescription,
      category: effectiveCategory as TicketCategory,
      priority: effectivePriority as TicketPriority,
      contactName: effectiveName,
      contactEmail: effectiveContactEmail,
      contactPhone: contactPhone || null,
      team: team ? { connect: { id: team.id } } : undefined,
      firstResponseDueAt,
      resolutionDueAt,
    };
    (createData as Record<string, unknown>).requestorEmail = effectiveRequestorEmail;

    const ticket = await prisma.ticket.create({ data: createData });

    let uploadedMeta: IntakeScreenshotMetaItem[] | null = null;
    if (screenshotFiles && screenshotFiles.length > 0) {
      uploadedMeta = await persistTicketScreenshots(ticket.id, screenshotFiles);
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { intakeScreenshotMeta: uploadedMeta },
      });
    }

    await logActivity(
      ticket.id,
      "SYSTEM",
      "Ticket logged",
      `Queued for ${team?.name ?? "triage"}. SLA: first response by ${firstResponseDueAt.toISOString()}, resolution by ${resolutionDueAt.toISOString()}.`,
    );
    const requestSbuFreeText =
      (session.user.role === "Customer" || session.user.role === "Personnel") && customerRequestSbuText
        ? customerRequestSbuText
        : null;
    if (team) {
      if (requestSbuFreeText) {
        await logActivity(ticket.id, "USER", "Request to Company/SBU", requestSbuFreeText);
        if (customerRequestOutsideQueue) {
          await logActivity(
            ticket.id,
            "SYSTEM",
            "Routing note",
            `No roster SBU matched the request text; ticket queued under ${team.name}.`,
          );
        } else if (customerSbuRoutingMatched === false) {
          const fallbackLabel =
            session.user.role === "Personnel" ? "designated company" : "assigned company";
          await logActivity(
            ticket.id,
            "SYSTEM",
            "Routing note",
            `Ticket queued under ${team.name} (${fallbackLabel} fallback); refine SBU keywords if needed.`,
          );
        }
      } else {
        await logActivity(ticket.id, "USER", "Request to Company/SBU", team.name);
      }
    }
    if (session.user.role === "Customer") {
      if (customerAssignedOutsideQueue) {
        await logActivity(
          ticket.id,
          "SYSTEM",
          "Assigned company routing",
          "Could not map typed assigned company to a roster SBU; account company set to OUTSIDE COMPANY for triage.",
        );
      }
      if (customerAssignedCompanyText) {
        await logActivity(ticket.id, "USER", "Assigned company", customerAssignedCompanyText);
      }
      const orgRole = googleOAuthCustomer
        ? (customerOrgRoleRaw ?? "").trim() ||
          (typeof session.user.customerOrgRole === "string" ? session.user.customerOrgRole.trim() : "") ||
          "Personnel"
        : session.user.customerOrgRole?.trim();
      if (orgRole) {
        await logActivity(ticket.id, "USER", "Customer org role", orgRole);
      }
    }
    if (branch) {
      await logActivity(ticket.id, "USER", "Branch", branch);
    }
    if (uploadedMeta && uploadedMeta.length > 0) {
      const label = uploadedMeta.map((m) => m.originalName).join(", ");
      await logActivity(ticket.id, "USER", "Screenshots attached", label);
    } else if (screenshotList.length > 0) {
      await logActivity(
        ticket.id,
        "USER",
        "Screenshots attached",
        screenshotList.join(", "),
      );
    }

    if (team) {
      await logActivity(
        ticket.id,
        "SYSTEM",
        "Auto-routed to team queue",
        team.name,
      );
    }
    if (await shouldNotifyAdminOnCreate(effectivePriority as TicketPriority)) {
      await logActivity(
        ticket.id,
        "SYSTEM",
        "Escalation trigger fired",
        "Priority-based trigger notified Admin visibility channel.",
      );
    }
    if (await shouldNotifySuperAdminOnCreate(effectivePriority as TicketPriority)) {
      await logActivity(
        ticket.id,
        "SYSTEM",
        "Escalation trigger fired",
        "Priority-based trigger notified SuperAdmin visibility channel.",
      );
    }

    if (process.env.NODE_ENV === "development") {
      console.info(
        `[perf] POST /api/tickets ${Date.now() - startedAt}ms ticket=${ticket.ticketNumber}`,
      );
    }
    const responsePayload =
      uploadedMeta && uploadedMeta.length > 0 ? { ...ticket, intakeScreenshotMeta: uploadedMeta } : ticket;
    return NextResponse.json(responsePayload, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Could not create ticket." },
      { status: 500 },
    );
  }
}
