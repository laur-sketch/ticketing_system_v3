import type { Prisma } from "@prisma/client/primary";
import { TicketCategory, TicketPriority } from "@prisma/client/primary";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/access";
import {
  customerTicketWhereBySessionEmail,
  issueConcernIntakeLockMessage,
  requestorHasIntakeBlockingTicket,
} from "@/lib/customer-pending-resolution";
import { ensureOutsideCompanyTeam } from "@/lib/outside-company-team";
import { logActivity } from "@/lib/ticket-actions";
import { prisma } from "@/lib/prisma";
import { findSessionAgentId } from "@/lib/session-agent";
import { personnelRequestBoardWhere } from "@/lib/rfp-request-board";
import { addHours, getSlaPolicy } from "@/lib/sla";
import { nextTicketNumber } from "@/lib/ticket-number";
import { shouldNotifyAdminOnCreate, shouldNotifySuperAdminOnCreate } from "@/lib/triggers";
import {
  IntakeContactError,
  isValidWorkEmail,
  resolveTicketContactFields,
} from "@/lib/ticket-intake-contact";
import { resolveCustomerRequestTeam, resolveRosterTeamByExactName, resolveRosterTeamById } from "@/lib/ticket-intake-request-team";
import type { IntakeScreenshotMetaItem } from "@/lib/ticket-intake-screenshots-meta";
import { persistTicketScreenshots, validateScreenshotFiles } from "@/lib/ticket-intake-screenshots";
import { loadStaffAssignmentColorsForAgents } from "@/lib/assignee-assignment-color";
import { runForConfirmationReminderSweep } from "@/lib/confirmation-reminders";
import { parseRequestTypeId, requestTypeLabel } from "@/lib/request-types";
import {
  formatPaymentRequestDescription,
  formatPaymentRequestTitle,
  formatPaymentPeso,
  normalizePaymentAmountInput,
  DELIVERY_OF_CHECK_ONLINE_DEPOSIT,
  MODE_OF_PAYMENT_CHECK,
} from "@/lib/request-for-payment";
import {
  formatItemRequisitionDescription,
  formatItemRequisitionTitle,
  parseRequisitionItemsPayload,
  validateItemRequisitionFields,
} from "@/lib/item-requisition";
import { paymentProceduralStatusLabel } from "@/lib/request-for-payment-approval";
import { initPaymentApprovalMetaIfNeeded } from "@/lib/payment-approval-db";
import { itemRequisitionProceduralStatusLabel } from "@/lib/item-requisition-approval";
import { initItemRequisitionApprovalMetaIfNeeded } from "@/lib/item-requisition-approval-db";
import {
  formatFundTransferRequestDescription,
  formatFundTransferRequestTitle,
  validateFundTransferRequestFields,
} from "@/lib/fund-transfer-request";
import {
  formatJobOrderDescription,
  formatJobOrderTitle,
  parseJobOrderNatureList,
  validateJobOrderFields,
} from "@/lib/job-order";
import { fundTransferProceduralStatusLabel } from "@/lib/fund-transfer-approval";
import {
  stampFundTransferCreatorOnCreate,
} from "@/lib/fund-transfer-approval-db";

const categories = new Set(Object.values(TicketCategory));
const priorities = new Set(Object.values(TicketPriority));

export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await requireSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  void runForConfirmationReminderSweep().catch((error) => {
    console.error("Confirmation reminder sweep failed", error);
  });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const teamId = searchParams.get("teamId");
  const limitParam = Number.parseInt(searchParams.get("limit") ?? "50", 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 50;
  const operator =
    session.user.role === "Personnel"
      ? await findSessionAgentId({ email: session.user.email, name: session.user.name })
      : null;

  const personnelWhere =
    session.user.role === "Personnel" ? await personnelRequestBoardWhere(operator?.id) : null;

  const tickets = await prisma.ticket.findMany({
    where: {
      ...(status ? { status: status as never } : {}),
      ...(teamId ? { teamId } : {}),
      ...(personnelWhere ?? {}),
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
    let customerOrgRoleRaw: string | undefined;
    let branchRaw: string | undefined;
    let departmentRaw: string | undefined;
    let assignedCompanyTextRaw: string | undefined;
    let contactNameRaw: string | undefined;
    let contactEmailRaw: string | undefined;
    let requestToCompanySbuRaw: string | undefined;
    let requestTypeRaw: string | undefined;
    let payeeRaw: string | undefined;
    let inPaymentOfRaw: string | undefined;
    let accountTitleRaw: string | undefined;
    let amountRaw: string | undefined;
    let modeOfPaymentRaw: string | undefined;
    let deliveryOfCheckRaw: string | undefined;
    let bankNameAccountNumberRaw: string | undefined;
    let requisitionItemsRaw: unknown;
    let purposeOfRequestRaw: string | undefined;
    let fundTransferAmountRaw: string | undefined;
    let requestingDepartmentBusinessUnitRaw: string | undefined;
    let fromAccountNameRaw: string | undefined;
    let fromAccountNumberRaw: string | undefined;
    let toAccountNameRaw: string | undefined;
    let toAccountNumberRaw: string | undefined;
    let bankNameRaw: string | undefined;
    let bankAddressRaw: string | undefined;
    let natureOfConcernRaw: unknown;
    let buildingRaw: string | undefined;
    let startDateRaw: string | undefined;
    let targetDateRaw: string | undefined;
    let expectedDurationRaw: string | undefined;
    let screenshotFiles: File[] | undefined;

    if (contentType.includes("multipart/form-data")) {
      const fd = await req.formData();
      issue = String(fd.get("issue") || "");
      const ct = fd.get("companyTeamId");
      companyTeamIdRaw = ct != null ? String(ct) : undefined;
      const pct = fd.get("portalCompanyTeamId");
      if (!companyTeamIdRaw && pct != null) {
        companyTeamIdRaw = String(pct);
      }
      const cor = fd.get("customerOrgRole");
      customerOrgRoleRaw = cor != null ? String(cor) : undefined;
      const br = fd.get("branch");
      branchRaw = br != null ? String(br) : undefined;
      const dep = fd.get("department");
      departmentRaw = dep != null ? String(dep) : undefined;
      const ac = fd.get("assignedCompanyText");
      assignedCompanyTextRaw = ac != null ? String(ac) : undefined;
      const cn = fd.get("contactName");
      contactNameRaw = cn != null ? String(cn) : undefined;
      const cem = fd.get("contactEmail");
      contactEmailRaw = cem != null ? String(cem) : undefined;
      const rts = fd.get("requestToCompanySbu");
      requestToCompanySbuRaw = rts != null ? String(rts) : undefined;
      const rt = fd.get("requestType");
      requestTypeRaw = rt != null ? String(rt) : undefined;
      const py = fd.get("payee");
      payeeRaw = py != null ? String(py) : undefined;
      const ipo = fd.get("inPaymentOf");
      inPaymentOfRaw = ipo != null ? String(ipo) : undefined;
      const at = fd.get("accountTitle");
      accountTitleRaw = at != null ? String(at) : undefined;
      const amt = fd.get("amount");
      amountRaw = amt != null ? String(amt) : undefined;
      const mop = fd.get("modeOfPayment");
      modeOfPaymentRaw = mop != null ? String(mop) : undefined;
      const doc = fd.get("deliveryOfCheck");
      deliveryOfCheckRaw = doc != null ? String(doc) : undefined;
      const bna = fd.get("bankNameAccountNumber");
      bankNameAccountNumberRaw = bna != null ? String(bna) : undefined;
      const ri = fd.get("requisitionItems");
      if (typeof ri === "string" && ri.trim()) {
        try {
          requisitionItemsRaw = JSON.parse(ri);
        } catch {
          return NextResponse.json({ error: "Invalid requisition items payload." }, { status: 400 });
        }
      }
      const por = fd.get("purposeOfRequest");
      purposeOfRequestRaw = por != null ? String(por) : undefined;
      const fta = fd.get("fundTransferAmount");
      fundTransferAmountRaw = fta != null ? String(fta) : undefined;
      const rdbu = fd.get("requestingDepartmentBusinessUnit");
      requestingDepartmentBusinessUnitRaw = rdbu != null ? String(rdbu) : undefined;
      const fan = fd.get("fromAccountName");
      fromAccountNameRaw = fan != null ? String(fan) : undefined;
      const fac = fd.get("fromAccountNumber");
      fromAccountNumberRaw = fac != null ? String(fac) : undefined;
      const tan = fd.get("toAccountName");
      toAccountNameRaw = tan != null ? String(tan) : undefined;
      const tac = fd.get("toAccountNumber");
      toAccountNumberRaw = tac != null ? String(tac) : undefined;
      const bn = fd.get("bankName");
      bankNameRaw = bn != null ? String(bn) : undefined;
      const ba = fd.get("bankAddress");
      bankAddressRaw = ba != null ? String(ba) : undefined;
      const noc = fd.get("natureOfConcern");
      if (typeof noc === "string" && noc.trim()) {
        try {
          natureOfConcernRaw = JSON.parse(noc);
        } catch {
          natureOfConcernRaw = noc;
        }
      }
      const bld = fd.get("building");
      buildingRaw = bld != null ? String(bld) : undefined;
      const sd = fd.get("startDate");
      startDateRaw = sd != null ? String(sd) : undefined;
      const td = fd.get("targetDate");
      targetDateRaw = td != null ? String(td) : undefined;
      const ed = fd.get("expectedDuration");
      expectedDurationRaw = ed != null ? String(ed) : undefined;
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
        typeof body.companyTeamId === "string"
          ? body.companyTeamId
          : typeof body.portalCompanyTeamId === "string"
            ? body.portalCompanyTeamId
            : undefined;
      customerOrgRoleRaw =
        typeof body.customerOrgRole === "string" ? body.customerOrgRole : undefined;
      branchRaw = typeof body.branch === "string" ? body.branch : undefined;
      departmentRaw = typeof body.department === "string" ? body.department : undefined;
      assignedCompanyTextRaw =
        typeof body.assignedCompanyText === "string" ? body.assignedCompanyText : undefined;
      contactNameRaw = typeof body.contactName === "string" ? body.contactName : undefined;
      contactEmailRaw = typeof body.contactEmail === "string" ? body.contactEmail : undefined;
      requestToCompanySbuRaw =
        typeof body.requestToCompanySbu === "string" ? body.requestToCompanySbu : undefined;
      requestTypeRaw = typeof body.requestType === "string" ? body.requestType : undefined;
      payeeRaw = typeof body.payee === "string" ? body.payee : undefined;
      inPaymentOfRaw = typeof body.inPaymentOf === "string" ? body.inPaymentOf : undefined;
      accountTitleRaw = typeof body.accountTitle === "string" ? body.accountTitle : undefined;
      amountRaw = typeof body.amount === "string" ? body.amount : undefined;
      modeOfPaymentRaw = typeof body.modeOfPayment === "string" ? body.modeOfPayment : undefined;
      deliveryOfCheckRaw =
        typeof body.deliveryOfCheck === "string" ? body.deliveryOfCheck : undefined;
      bankNameAccountNumberRaw =
        typeof body.bankNameAccountNumber === "string" ? body.bankNameAccountNumber : undefined;
      requisitionItemsRaw = body.requisitionItems;
      purposeOfRequestRaw =
        typeof body.purposeOfRequest === "string" ? body.purposeOfRequest : undefined;
      fundTransferAmountRaw =
        typeof body.fundTransferAmount === "string" ? body.fundTransferAmount : undefined;
      requestingDepartmentBusinessUnitRaw =
        typeof body.requestingDepartmentBusinessUnit === "string"
          ? body.requestingDepartmentBusinessUnit
          : undefined;
      fromAccountNameRaw =
        typeof body.fromAccountName === "string" ? body.fromAccountName : undefined;
      fromAccountNumberRaw =
        typeof body.fromAccountNumber === "string" ? body.fromAccountNumber : undefined;
      toAccountNameRaw = typeof body.toAccountName === "string" ? body.toAccountName : undefined;
      toAccountNumberRaw =
        typeof body.toAccountNumber === "string" ? body.toAccountNumber : undefined;
      bankNameRaw = typeof body.bankName === "string" ? body.bankName : undefined;
      bankAddressRaw = typeof body.bankAddress === "string" ? body.bankAddress : undefined;
      natureOfConcernRaw = body.natureOfConcern;
      buildingRaw = typeof body.building === "string" ? body.building : undefined;
      startDateRaw = typeof body.startDate === "string" ? body.startDate : undefined;
      targetDateRaw = typeof body.targetDate === "string" ? body.targetDate : undefined;
      expectedDurationRaw =
        typeof body.expectedDuration === "string" ? body.expectedDuration : undefined;
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

    const effectiveCategory = (category || "GENERAL").trim();
    const effectivePriority = (priority && String(priority).trim() ? String(priority).trim() : "LOW");
    const issueText = (issue || description || "").trim();
    const branch = (branchRaw ?? "").trim();
    if (branch.length > 120) {
      return NextResponse.json({ error: "Branch must be at most 120 characters." }, { status: 400 });
    }
    const requestType = parseRequestTypeId(requestTypeRaw);

    // Intake lock applies only to Issue/Concern tickets.
    if (requestType === "ISSUE_CONCERN_TICKET") {
      const blocking = await requestorHasIntakeBlockingTicket(identityEmails);
      if (blocking) {
        return NextResponse.json(
          {
            error: issueConcernIntakeLockMessage(blocking.ticketNumber),
            pendingTicketId: blocking.id,
            pendingTicketNumber: blocking.ticketNumber,
          },
          { status: 409 },
        );
      }
    }

    const departmentFromRequest =
      requestType === "FUND_TRANSFER_REQUEST"
        ? (requestingDepartmentBusinessUnitRaw ?? departmentRaw ?? "").trim()
        : (departmentRaw ?? "").trim();
    const department = departmentFromRequest;
    if (department.length > 200) {
      return NextResponse.json({ error: "Department must be at most 200 characters." }, { status: 400 });
    }
    const payee = (payeeRaw ?? "").trim();
    const inPaymentOf = (inPaymentOfRaw ?? "").trim();
    const accountTitle = (accountTitleRaw ?? "").trim();
    const amount = (amountRaw ?? "").trim();
    const modeOfPayment = (modeOfPaymentRaw ?? "").trim();
    const deliveryOfCheck = (deliveryOfCheckRaw ?? "").trim();
    const bankNameAccountNumber = (bankNameAccountNumberRaw ?? "").trim();
    if (requestType === "REQUEST_FOR_PAYMENT") {
      if (!payee || !inPaymentOf || !accountTitle || !amount || !modeOfPayment) {
        return NextResponse.json(
          {
            error:
              "Payee, In payment of, Account title, Amount, and Mode of payment are required for a payment request.",
          },
          { status: 400 },
        );
      }
      if (modeOfPayment === MODE_OF_PAYMENT_CHECK && !deliveryOfCheck) {
        return NextResponse.json(
          { error: "Delivery of check is required when Mode of payment is Check." },
          { status: 400 },
        );
      }
      if (
        modeOfPayment === MODE_OF_PAYMENT_CHECK &&
        deliveryOfCheck === DELIVERY_OF_CHECK_ONLINE_DEPOSIT &&
        !bankNameAccountNumber
      ) {
        return NextResponse.json(
          { error: "Bank name / account number is required for Online Deposit." },
          { status: 400 },
        );
      }
      if (
        payee.length > 200 ||
        inPaymentOf.length > 500 ||
        accountTitle.length > 200 ||
        amount.length > 80 ||
        modeOfPayment.length > 120 ||
        deliveryOfCheck.length > 80 ||
        bankNameAccountNumber.length > 200
      ) {
        return NextResponse.json({ error: "A payment field exceeds the maximum length." }, { status: 400 });
      }
    }

    const requisitionFields =
      requestType === "ITEM_REQUISITION_SLIP"
        ? {
            items: parseRequisitionItemsPayload(requisitionItemsRaw),
            purposeOfRequest: (purposeOfRequestRaw ?? issueText).trim(),
          }
        : null;
    if (requisitionFields) {
      const check = validateItemRequisitionFields(requisitionFields);
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: 400 });
      }
    }

    const fundTransferFields =
      requestType === "FUND_TRANSFER_REQUEST"
        ? {
            requestingDepartmentBusinessUnit: (requestingDepartmentBusinessUnitRaw ?? "").trim(),
            fundTransferAmount: (fundTransferAmountRaw ?? "").trim(),
            fromAccountName: (fromAccountNameRaw ?? "").trim(),
            fromAccountNumber: (fromAccountNumberRaw ?? "").trim(),
            toAccountName: (toAccountNameRaw ?? "").trim(),
            toAccountNumber: (toAccountNumberRaw ?? "").trim(),
            bankName: (bankNameRaw ?? "").trim(),
            bankAddress: (bankAddressRaw ?? "").trim(),
            reason: issueText,
          }
        : null;
    if (fundTransferFields) {
      const check = validateFundTransferRequestFields(fundTransferFields);
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: 400 });
      }
    }

    const jobOrderFields =
      requestType === "JOB_ORDER"
        ? {
            natureOfConcern: parseJobOrderNatureList(natureOfConcernRaw),
            building: (buildingRaw ?? "").trim(),
            startDate: (startDateRaw ?? "").trim(),
            targetDate: (targetDateRaw ?? "").trim(),
            expectedDuration: (expectedDurationRaw ?? "").trim(),
            notes: issueText,
          }
        : null;
    if (jobOrderFields) {
      const check = validateJobOrderFields(jobOrderFields);
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: 400 });
      }
    }

    const sessionCompanyId =
      typeof session.user.companyId === "string" && session.user.companyId.trim()
        ? session.user.companyId.trim()
        : null;
    const screenshotList = Array.isArray(screenshotNames)
      ? screenshotNames.map((v) => String(v).trim()).filter(Boolean)
      : [];
    let normalizedTitle = (
      title ||
      issueText.split("\n")[0]?.trim() ||
      `${effectiveName} request`
    ).trim();
    let normalizedDescription = issueText;

    if (requestType === "REQUEST_FOR_PAYMENT") {
      const amountNormalized = normalizePaymentAmountInput(amount) || amount;
      const paymentFields = {
        payee,
        inPaymentOf,
        accountTitle,
        amount: amountNormalized,
        modeOfPayment,
        deliveryOfCheck,
        bankNameAccountNumber,
        notes: issueText,
      };
      normalizedTitle = (title || formatPaymentRequestTitle(paymentFields)).trim();
      normalizedDescription = formatPaymentRequestDescription(paymentFields);
    } else if (requisitionFields) {
      normalizedTitle = (title || formatItemRequisitionTitle(requisitionFields)).trim();
      normalizedDescription = formatItemRequisitionDescription(requisitionFields);
    } else if (fundTransferFields) {
      normalizedTitle = (title || formatFundTransferRequestTitle(fundTransferFields)).trim();
      normalizedDescription = formatFundTransferRequestDescription(fundTransferFields);
    } else if (jobOrderFields) {
      normalizedTitle = (title || formatJobOrderTitle(jobOrderFields)).trim();
      normalizedDescription = formatJobOrderDescription(jobOrderFields);
    }

    if (!normalizedTitle || !normalizedDescription || !effectiveName || !effectiveRequestorEmail || !effectiveContactEmail) {
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

      // Target queue = "Send request to" only — never fall back to the requestor's company.
      const routed = await resolveCustomerRequestTeam({
        requestText: requestToCompanySbu,
        fallbackTeamId: null,
      });
      customerRequestOutsideQueue = !routed?.matched;
      team = routed?.matched ? routed.team : outsideTeam;
    } else {
      const rawCompanyTeamId = (companyTeamIdRaw || "").trim();
      const requestToCompanySbu = (requestToCompanySbuRaw ?? "").trim();
      if (requestToCompanySbu.length > 500) {
        return NextResponse.json(
          { error: "Request to Company/SBU must be at most 500 characters." },
          { status: 400 },
        );
      }

      const isStaffIntake =
        session.user.role === "Personnel" ||
        session.user.role === "Admin" ||
        session.user.role === "SuperAdmin";

      if (rawCompanyTeamId) {
        const selectedTeam = await resolveRosterTeamById(rawCompanyTeamId);
        if (!selectedTeam) {
          return NextResponse.json({ error: "Invalid company/SBU selection." }, { status: 400 });
        }
        team = selectedTeam;
        customerRequestSbuText = selectedTeam.name;
      } else if (isStaffIntake && requestToCompanySbu) {
        // Legacy / name-only payloads: exact roster match only (no creator-company fallback).
        const exact = await resolveRosterTeamByExactName(requestToCompanySbu);
        if (!exact) {
          return NextResponse.json(
            { error: "Invalid company/SBU selection. Choose a roster company from Send request to." },
            { status: 400 },
          );
        }
        team = exact;
        customerRequestSbuText = requestToCompanySbu;
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

    // Persist request type via raw SQL so this works even if Prisma Client wasn't regenerated yet.
    await prisma.$executeRaw`
      UPDATE tickets
      SET request_type = ${requestType}
      WHERE id = ${ticket.id}
    `;

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
    await logActivity(ticket.id, "USER", "Request type", requestTypeLabel(requestType));
    if (requestType === "REQUEST_FOR_PAYMENT") {
      const meta = await initPaymentApprovalMetaIfNeeded(ticket.id);
      await logActivity(
        ticket.id,
        "SYSTEM",
        "Payment approval started",
        paymentProceduralStatusLabel(meta.proceduralStep) ?? "PREPARED BY IS MISSING",
      );
    }
    if (requestType === "ITEM_REQUISITION_SLIP") {
      const meta = await initItemRequisitionApprovalMetaIfNeeded(ticket.id);
      await logActivity(
        ticket.id,
        "SYSTEM",
        "Item requisition approval started",
        itemRequisitionProceduralStatusLabel(meta.proceduralStep) ??
          "CANVASSED BY IS MISSING",
      );
    }
    if (requestType === "FUND_TRANSFER_REQUEST") {
      const meta = await stampFundTransferCreatorOnCreate({
        ticketId: ticket.id,
        email: session.user.email ?? effectiveRequestorEmail ?? effectiveContactEmail,
        name: session.user.name ?? effectiveName,
        teamId: team?.id ?? null,
      });
      await logActivity(
        ticket.id,
        "SYSTEM",
        "Fund transfer approval started",
        fundTransferProceduralStatusLabel(meta.proceduralStep) ??
          "RECOMMENDING APPROVAL IS MISSING",
      );
    }
    const requestSbuFreeText = customerRequestSbuText;
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
    if (department) {
      await logActivity(
        ticket.id,
        "USER",
        requestType === "FUND_TRANSFER_REQUEST"
          ? "Requesting department/business unit"
          : "Department",
        department,
      );
    }
    if (requestType === "REQUEST_FOR_PAYMENT") {
      await logActivity(ticket.id, "USER", "Payee", payee);
      await logActivity(ticket.id, "USER", "In payment of", inPaymentOf);
      await logActivity(ticket.id, "USER", "Account title", accountTitle);
      await logActivity(
        ticket.id,
        "USER",
        "Amount",
        formatPaymentPeso(amount) || amount,
      );
      await logActivity(ticket.id, "USER", "Mode of payment", modeOfPayment);
      if (deliveryOfCheck) {
        await logActivity(ticket.id, "USER", "Delivery of check", deliveryOfCheck);
      }
      if (bankNameAccountNumber) {
        await logActivity(ticket.id, "USER", "Bank name / account number", bankNameAccountNumber);
      }
    }
    if (fundTransferFields) {
      await logActivity(ticket.id, "USER", "Fund transfer amount", fundTransferFields.fundTransferAmount);
      await logActivity(ticket.id, "USER", "From account name", fundTransferFields.fromAccountName);
      await logActivity(ticket.id, "USER", "From account number", fundTransferFields.fromAccountNumber);
      await logActivity(ticket.id, "USER", "To account name", fundTransferFields.toAccountName);
      await logActivity(ticket.id, "USER", "To account number", fundTransferFields.toAccountNumber);
      await logActivity(ticket.id, "USER", "Bank name", fundTransferFields.bankName);
      await logActivity(ticket.id, "USER", "Bank address", fundTransferFields.bankAddress);
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
        "Priority alert sent",
        "Priority-based trigger notified Admin visibility channel.",
      );
    }
    if (await shouldNotifySuperAdminOnCreate(effectivePriority as TicketPriority)) {
      await logActivity(
        ticket.id,
        "SYSTEM",
        "Priority alert sent",
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
