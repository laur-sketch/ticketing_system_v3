import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { canViewerApproveTransfer, parseTransferRequestDetail } from "@/lib/ticket-transfer-request";
import { formatTicketStatusLabel } from "@/lib/ticket-status-label";
import { safeReturnToParam } from "@/lib/safe-return-to";
import { portalCompanyAdminPrivilegesForEmail } from "@/lib/portal-staff";
import { AgentWorkspace } from "./workspace";
import { AgentTicketModalShell } from "@/components/ticket/AgentTicketModalShell";
import { requestTypeLabel } from "@/lib/request-types";
import { paymentProceduralStatusLabel } from "@/lib/request-for-payment-approval";
import { initPaymentApprovalMetaIfNeeded, loadPaymentApprovalMeta } from "@/lib/payment-approval-db";
import { itemRequisitionProceduralStatusLabel } from "@/lib/item-requisition-approval";
import {
  initItemRequisitionApprovalMetaIfNeeded,
  loadItemRequisitionApprovalMeta,
} from "@/lib/item-requisition-approval-db";
import { fundTransferProceduralStatusLabel } from "@/lib/fund-transfer-approval";
import { stampFundTransferCreatorOnCreate } from "@/lib/fund-transfer-approval-db";

export const dynamic = "force-dynamic";

export default async function AgentTicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const session = await requireSession();
  if (!session?.user) redirect("/signin");
  if (!["SuperAdmin", "Admin", "Personnel"].includes(session.user.role)) redirect("/");

  const { id } = await params;
  const sp = await searchParams;
  const backHref = safeReturnToParam(sp.returnTo, "/agent");

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      team: true,
      assignedAgent: true,
      activities: { orderBy: { createdAt: "asc" } },
      messages: { orderBy: { createdAt: "asc" } },
      feedback: { select: { csat: true, comment: true } },
    },
  });
  if (!ticket) notFound();

  const ticketForWorkspace = ticket;
  const requestorEmail = (ticketForWorkspace.requestorEmail ?? ticketForWorkspace.contactEmail ?? "").trim();
  const requestorAccount = requestorEmail
    ? await prisma.portalAccount.findFirst({
        where: { email: { equals: requestorEmail, mode: "insensitive" } },
        select: {
          company: { select: { name: true } },
          staffDesignatedCompany: { select: { name: true } },
        },
      })
    : null;
  const requestorCompanyName =
    requestorAccount?.company?.name?.trim() ||
    requestorAccount?.staffDesignatedCompany?.name?.trim() ||
    null;
  const branchActivity = ticketForWorkspace.activities.find((a) => a.summary === "Branch");
  const branch = branchActivity?.detail?.trim() ?? null;
  const departmentActivity = ticketForWorkspace.activities.find(
    (a) =>
      a.summary === "Department" || a.summary === "Requesting department/business unit",
  );
  const department = departmentActivity?.detail?.trim() ?? null;
  const requestTypeActivity = ticketForWorkspace.activities.find((a) => a.summary === "Request type");
  const requestTypeId =
    "requestType" in ticketForWorkspace &&
    typeof (ticketForWorkspace as { requestType?: string }).requestType === "string"
      ? (ticketForWorkspace as { requestType: string }).requestType
      : null;
  const isPaymentRequest =
    requestTypeId === "REQUEST_FOR_PAYMENT" ||
    (requestTypeActivity?.detail?.trim().toUpperCase() ?? "").includes("REQUEST FOR PAYMENT");
  const isRequisitionRequest =
    requestTypeId === "ITEM_REQUISITION_SLIP" ||
    (requestTypeActivity?.detail?.trim().toUpperCase() ?? "").includes("ITEM REQUISITION");
  const isFundTransferRequest =
    requestTypeId === "FUND_TRANSFER_REQUEST" ||
    (requestTypeActivity?.detail?.trim().toUpperCase() ?? "").includes("FUND TRANSFER");
  const paymentApprovalMeta = isPaymentRequest
    ? ((await loadPaymentApprovalMeta(ticketForWorkspace.id)) ??
      (await initPaymentApprovalMetaIfNeeded(ticketForWorkspace.id)))
    : null;
  const itemRequisitionApprovalMeta = isRequisitionRequest
    ? ((await loadItemRequisitionApprovalMeta(ticketForWorkspace.id)) ??
      (await initItemRequisitionApprovalMetaIfNeeded(ticketForWorkspace.id)))
    : null;
  const fundTransferApprovalMeta = isFundTransferRequest
    ? await stampFundTransferCreatorOnCreate({
        ticketId: ticketForWorkspace.id,
        email:
          ticketForWorkspace.requestorEmail ??
          ticketForWorkspace.contactEmail ??
          null,
        name: ticketForWorkspace.contactName,
        teamId: ticketForWorkspace.teamId,
      })
    : null;
  const paymentProceduralLabel = paymentApprovalMeta
    ? paymentProceduralStatusLabel(paymentApprovalMeta.proceduralStep)
    : null;
  const requisitionProceduralLabel = itemRequisitionApprovalMeta
    ? itemRequisitionProceduralStatusLabel(itemRequisitionApprovalMeta.proceduralStep)
    : null;
  const fundTransferProceduralLabel = fundTransferApprovalMeta
    ? fundTransferProceduralStatusLabel(fundTransferApprovalMeta.proceduralStep)
    : null;
  const proceduralStatusLabel =
    paymentProceduralLabel ?? requisitionProceduralLabel ?? fundTransferProceduralLabel;
  const paymentApprovalAgentNames: Record<string, string> = {};
  if (paymentApprovalMeta) {
    const ids = [
      paymentApprovalMeta.preparedByAgentId,
      paymentApprovalMeta.notedByAgentId,
      paymentApprovalMeta.approvedByAgentId,
      paymentApprovalMeta.accountingAgentId,
      paymentApprovalMeta.financeAgentId,
    ].filter((v): v is string => Boolean(v));
    if (ids.length > 0) {
      const agents = await prisma.agent.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      });
      for (const a of agents) paymentApprovalAgentNames[a.id] = a.name;
    }
  }
  const itemRequisitionApprovalAgentNames: Record<string, string> = {};
  if (itemRequisitionApprovalMeta) {
    const ids = [
      itemRequisitionApprovalMeta.canvassedByAgentId,
      itemRequisitionApprovalMeta.approvedByAgentId,
    ].filter((v): v is string => Boolean(v));
    if (ids.length > 0) {
      const agents = await prisma.agent.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      });
      for (const a of agents) itemRequisitionApprovalAgentNames[a.id] = a.name;
    }
  }
  const fundTransferApprovalAgentNames: Record<string, string> = {};
  if (fundTransferApprovalMeta) {
    const ids = [
      fundTransferApprovalMeta.preparedByAgentId,
      fundTransferApprovalMeta.recommendingApprovalAgentId,
      fundTransferApprovalMeta.approvedByAgentId,
    ].filter((v): v is string => Boolean(v));
    if (ids.length > 0) {
      const agents = await prisma.agent.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      });
      for (const a of agents) fundTransferApprovalAgentNames[a.id] = a.name;
    }
  }
  const requestTypeLabelText =
    requestTypeActivity?.detail?.trim() ||
    requestTypeLabel(requestTypeId ?? "");
  let transferPending = false;
  let lastTransferDetail: string | null = null;
  for (const a of ticketForWorkspace.activities) {
    if (a.summary === "Transfer requested") {
      transferPending = true;
      lastTransferDetail = a.detail ?? null;
    }
    if (a.summary === "Transfer approved" || a.summary === "Transfer rejected") {
      transferPending = false;
      lastTransferDetail = null;
    }
  }

  const normalizedEmail = (session.user.email ?? "").trim().toLowerCase();
  const normalizedName = (session.user.name ?? "").trim();
  const operatorByEmail = normalizedEmail
    ? await prisma.agent.findUnique({
        where: { email: normalizedEmail },
        include: { team: true },
      })
    : null;
  const operatorByName =
    !operatorByEmail && normalizedName
      ? await prisma.agent.findFirst({
          where: { name: normalizedName },
          include: { team: true },
        })
      : null;
  const operator = operatorByEmail ?? operatorByName;
  const companyCoordinator = await portalCompanyAdminPrivilegesForEmail(session.user.email);
  const isAdmin = session.user.role === "SuperAdmin" || session.user.role === "Admin";
  const isSuperAdmin = session.user.role === "SuperAdmin";
  const isPersonnel = session.user.role === "Personnel";
  const isAssignedOperator = !!operator && operator.id === ticketForWorkspace.assignedAgentId;
  const canUpdatePriority = isAdmin || companyCoordinator || isAssignedOperator;
  const canRequestTransfer = isAssignedOperator;
  const myPortal = normalizedEmail
    ? await prisma.portalAccount.findFirst({
        where: { email: { equals: normalizedEmail, mode: "insensitive" } },
        select: { id: true },
      })
    : null;
  const canApproveTransfer = transferPending
    ? canViewerApproveTransfer({
        sessionRole: session.user.role,
        reviewerPortalAccountId: myPortal?.id ?? null,
        sessionAgentId: operator?.id ?? null,
        parsed: parseTransferRequestDetail(lastTransferDetail),
      })
    : false;

  return (
    <AgentTicketModalShell>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 text-zinc-950 sm:p-6 dark:text-zinc-100">
        <div className="mb-4 flex shrink-0 flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-950 p-3 text-white shadow-sm sm:mb-5 sm:rounded-2xl sm:p-5 dark:border-zinc-800/90 dark:bg-[#181716]/80">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <Link href={backHref} className="text-xs font-semibold text-orange-300 hover:text-orange-200 hover:underline">
                {backHref === "/agent" ? "← Back to queue" : "← Back"}
              </Link>
              <h1 className="mt-2 break-words text-lg font-semibold leading-tight text-zinc-100 sm:text-2xl">
                {ticketForWorkspace.ticketNumber}{" "}
                <span className="text-sm font-normal text-zinc-400 sm:text-base">· {ticketForWorkspace.title}</span>
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
              <span className="w-fit rounded-full bg-white/12 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-100 dark:bg-zinc-700 dark:text-zinc-200">
                {formatTicketStatusLabel(ticketForWorkspace.status)}
              </span>
              <Link
                href={backHref}
                className="inline-flex h-8 items-center justify-center rounded-full border border-white/15 bg-black/30 px-3 text-xs font-semibold text-zinc-100 hover:bg-black/45 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Close
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 border-t border-white/10 pt-3 sm:grid-cols-2 sm:gap-6">
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
                {isFundTransferRequest ? "Prepared By: " : "Requestor: "}
                <span className="text-zinc-300 normal-case tracking-normal">{ticketForWorkspace.contactName}</span>
              </p>
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
                Email:{" "}
                <span className="break-all text-zinc-300 normal-case tracking-normal">
                  {ticketForWorkspace.requestorEmail ?? ticketForWorkspace.contactEmail}
                </span>
              </p>
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
                Company:{" "}
                <span className="text-zinc-300 normal-case tracking-normal">
                  {requestorCompanyName ?? "Not assigned"}
                </span>
              </p>
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
                Branch:{" "}
                <span className="text-zinc-300 normal-case tracking-normal">{branch ?? "—"}</span>
              </p>
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
                Send request to:{" "}
                <span className="text-zinc-300 normal-case tracking-normal">
                  {ticketForWorkspace.team?.name ?? "—"}
                </span>
              </p>
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
                {isFundTransferRequest
                  ? "Requesting department/business unit: "
                  : "Department: "}
                <span className="text-zinc-300 normal-case tracking-normal">{department ?? "—"}</span>
              </p>
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
                Request type:{" "}
                <span className="text-zinc-300 normal-case tracking-normal">{requestTypeLabelText}</span>
              </p>
              {proceduralStatusLabel ? (
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-amber-400/90">
                  Procedural status:{" "}
                  <span className="normal-case tracking-normal text-amber-200">{proceduralStatusLabel}</span>
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          <AgentWorkspace
            ticket={ticketForWorkspace}
            canUpdatePriority={canUpdatePriority}
            canRequestTransfer={canRequestTransfer}
            canApproveTransfer={canApproveTransfer}
            transferPending={transferPending}
            isPaymentRequest={isPaymentRequest}
            paymentApprovalMeta={paymentApprovalMeta}
            paymentApprovalAgentNames={paymentApprovalAgentNames}
            isRequisitionRequest={isRequisitionRequest}
            itemRequisitionApprovalMeta={itemRequisitionApprovalMeta}
            itemRequisitionApprovalAgentNames={itemRequisitionApprovalAgentNames}
            isFundTransferRequest={isFundTransferRequest}
            fundTransferApprovalMeta={fundTransferApprovalMeta}
            fundTransferApprovalAgentNames={fundTransferApprovalAgentNames}
            sessionAgentId={operator?.id ?? null}
            isSuperAdmin={isSuperAdmin}
            isPersonnel={isPersonnel}
            canCreateJobOrderProject={isAdmin || companyCoordinator}
            canRequestJobOrderProject={isPersonnel && isAssignedOperator && !isAdmin && !companyCoordinator}
          />
        </div>
      </div>
    </AgentTicketModalShell>
  );
}
