"use client";

import { CompanyUserSearchField } from "@/components/tickets/CompanyUserSearchField";
import type { Agent, Team, Ticket, TicketActivity, TicketMessage } from "@prisma/client/primary";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatTicketPriorityLabel } from "@/lib/ticket-priority-label";
import { parseIntakeScreenshotMeta } from "@/lib/ticket-intake-screenshots-meta";
import { parsePaymentRequestDescription, formatPaymentPeso, formatPaymentRequestTitle } from "@/lib/request-for-payment";
import {
  parseItemRequisitionDescription,
  computeRequisitionPriceQuotation,
  applyRequisitionPricingDerivedFields,
  sanitizeRequisitionFloatInput,
  sanitizeRequisitionIntegerInput,
  sumRequisitionListedItemsTotal,
  formatRequisitionPeso,
  normalizeRequisitionMoneyInput,
} from "@/lib/item-requisition";
import {
  assigneeIdForStep,
  PAYMENT_APPROVAL_STEPS,
  PAYMENT_APPROVAL_STEP_LABELS,
  paymentApprovalParticipantIds,
  paymentProceduralStatusLabel,
  type PaymentApprovalAssignees,
  type PaymentApprovalMeta,
  type PaymentApprovalStep,
} from "@/lib/request-for-payment-approval";
import {
  itemRequisitionAssigneeIdForStep,
  ITEM_REQUISITION_APPROVAL_STEPS,
  ITEM_REQUISITION_APPROVAL_STEP_LABELS,
  itemRequisitionProceduralStatusLabel,
  type ItemRequisitionApprovalAssignees,
  type ItemRequisitionApprovalMeta,
  type ItemRequisitionApprovalStep,
} from "@/lib/item-requisition-approval";
import {
  fundTransferAssigneeIdForStep,
  FUND_TRANSFER_APPROVAL_STEPS,
  FUND_TRANSFER_APPROVAL_STEP_LABELS,
  fundTransferProceduralStatusLabel,
  type FundTransferApprovalAssignees,
  type FundTransferApprovalMeta,
  type FundTransferApprovalStep,
} from "@/lib/fund-transfer-approval";
import { parseFundTransferRequestDescription, formatFundTransferPeso } from "@/lib/fund-transfer-request";
import { parseJobOrderDescription } from "@/lib/job-order";
import { parseTransferRequestDetail } from "@/lib/ticket-transfer-request";
import { JobOrderProjectLinkPanel } from "@/components/tickets/JobOrderProjectLinkPanel";

type TransferRecipient = { id: string; name: string; email: string };

type TicketDetail = Ticket & {
  team: Team | null;
  assignedAgent: Agent | null;
  activities: TicketActivity[];
  messages: TicketMessage[];
  feedback?: {
    csat: number;
    comment: string | null;
  } | null;
};

export function AgentWorkspace({
  ticket,
  canUpdatePriority,
  canRequestTransfer,
  canApproveTransfer,
  transferPending,
  isPaymentRequest = false,
  paymentApprovalMeta = null,
  paymentApprovalAgentNames = {},
  isRequisitionRequest = false,
  itemRequisitionApprovalMeta = null,
  itemRequisitionApprovalAgentNames = {},
  isFundTransferRequest = false,
  fundTransferApprovalMeta = null,
  fundTransferApprovalAgentNames = {},
  sessionAgentId = null,
  isSuperAdmin = false,
  isPersonnel = false,
  canCreateJobOrderProject = false,
  canRequestJobOrderProject = false,
}: {
  ticket: TicketDetail;
  canUpdatePriority: boolean;
  canRequestTransfer: boolean;
  canApproveTransfer: boolean;
  transferPending: boolean;
  isPaymentRequest?: boolean;
  paymentApprovalMeta?: PaymentApprovalMeta | null;
  /** Agent id → display name for payment approval roles. */
  paymentApprovalAgentNames?: Record<string, string>;
  isRequisitionRequest?: boolean;
  itemRequisitionApprovalMeta?: ItemRequisitionApprovalMeta | null;
  itemRequisitionApprovalAgentNames?: Record<string, string>;
  isFundTransferRequest?: boolean;
  fundTransferApprovalMeta?: FundTransferApprovalMeta | null;
  fundTransferApprovalAgentNames?: Record<string, string>;
  sessionAgentId?: string | null;
  isSuperAdmin?: boolean;
  isPersonnel?: boolean;
  /** Admin / SuperAdmin / company coordinator: create Task Board project from this Job Order. */
  canCreateJobOrderProject?: boolean;
  /** Assigned Personnel: request a company Admin to create the Task Project. */
  canRequestJobOrderProject?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priority, setPriority] = useState(ticket.priority);
  const [transferReason, setTransferReason] = useState("");
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [transferRecipients, setTransferRecipients] = useState<TransferRecipient[]>([]);
  const [transferRecipientId, setTransferRecipientId] = useState("");
  const [approvalAgents, setApprovalAgents] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [approvalDraft, setApprovalDraft] = useState<PaymentApprovalAssignees>({
    preparedByAgentId: paymentApprovalMeta?.preparedByAgentId ?? null,
    notedByAgentId: paymentApprovalMeta?.notedByAgentId ?? null,
    approvedByAgentId: paymentApprovalMeta?.approvedByAgentId ?? null,
    accountingAgentId: paymentApprovalMeta?.accountingAgentId ?? null,
    financeAgentId: paymentApprovalMeta?.financeAgentId ?? null,
  });
  const [requisitionApprovalDraft, setRequisitionApprovalDraft] =
    useState<ItemRequisitionApprovalAssignees>({
      canvassedByAgentId: itemRequisitionApprovalMeta?.canvassedByAgentId ?? null,
      approvedByAgentId: itemRequisitionApprovalMeta?.approvedByAgentId ?? null,
    });
  const [fundTransferApprovalDraft, setFundTransferApprovalDraft] =
    useState<FundTransferApprovalAssignees>({
      preparedByAgentId: fundTransferApprovalMeta?.preparedByAgentId ?? null,
      recommendingApprovalAgentId: fundTransferApprovalMeta?.recommendingApprovalAgentId ?? null,
      approvedByAgentId: fundTransferApprovalMeta?.approvedByAgentId ?? null,
    });
  const [requestApproverId, setRequestApproverId] = useState("");
  const [pricingDraft, setPricingDraft] = useState<
    Array<{
      priceQuotation: string;
      unitPrice: string;
      total: string;
      nameOfSupplier: string;
      terms: string;
    }>
  >([]);

  useEffect(() => {
    setApprovalDraft({
      preparedByAgentId: paymentApprovalMeta?.preparedByAgentId ?? null,
      notedByAgentId: paymentApprovalMeta?.notedByAgentId ?? null,
      approvedByAgentId: paymentApprovalMeta?.approvedByAgentId ?? null,
      accountingAgentId: paymentApprovalMeta?.accountingAgentId ?? null,
      financeAgentId: paymentApprovalMeta?.financeAgentId ?? null,
    });
  }, [paymentApprovalMeta]);

  useEffect(() => {
    setRequisitionApprovalDraft({
      canvassedByAgentId: itemRequisitionApprovalMeta?.canvassedByAgentId ?? null,
      approvedByAgentId: itemRequisitionApprovalMeta?.approvedByAgentId ?? null,
    });
  }, [itemRequisitionApprovalMeta]);

  useEffect(() => {
    setFundTransferApprovalDraft({
      preparedByAgentId: fundTransferApprovalMeta?.preparedByAgentId ?? null,
      recommendingApprovalAgentId: fundTransferApprovalMeta?.recommendingApprovalAgentId ?? null,
      approvedByAgentId: fundTransferApprovalMeta?.approvedByAgentId ?? null,
    });
  }, [fundTransferApprovalMeta]);

  const needsApprovalAgentList =
    (isPaymentRequest || isRequisitionRequest || isFundTransferRequest) &&
    (isSuperAdmin ||
      isPersonnel ||
      Boolean(sessionAgentId && ticket.assignedAgentId === sessionAgentId));

  useEffect(() => {
    if (!needsApprovalAgentList) return;
    let cancelled = false;
    // SuperAdmin: ticket company roster. Personnel: auto-scoped to their company by /api/agents.
    const company =
      isSuperAdmin && ticket.teamId ? `?company=${encodeURIComponent(ticket.teamId)}` : "";
    void fetch(`/api/agents${company}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Array<{ id: string; name: string; email: string }>) => {
        if (!cancelled && Array.isArray(rows)) setApprovalAgents(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [needsApprovalAgentList, isSuperAdmin, ticket.teamId]);

  useEffect(() => {
    if (!canRequestTransfer || transferPending) return;
    let cancelled = false;
    void fetch(`/api/tickets/${ticket.id}/transfer-recipients`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { recipients?: TransferRecipient[] } | null) => {
        if (cancelled) return;
        const recipients = data?.recipients ?? [];
        setTransferRecipients(recipients);
        setTransferRecipientId(recipients[0]?.id ?? "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canRequestTransfer, transferPending, ticket.id]);

  const cleanedDescription = useMemo(() => {
    return ticket.description
      .replace(/\s*Request to Company\/SBU:\s*.+$/i, "")
      .replace(/\s*Department\/Business Unit:\s*.+$/i, "")
      .trim();
  }, [ticket.description]);

  const paymentDetails = useMemo(
    () => parsePaymentRequestDescription(ticket.description),
    [ticket.description],
  );

  const requisitionDetails = useMemo(
    () => parseItemRequisitionDescription(ticket.description),
    [ticket.description],
  );

  const fundTransferDetails = useMemo(
    () => parseFundTransferRequestDescription(ticket.description),
    [ticket.description],
  );

  const jobOrderDetails = useMemo(
    () => parseJobOrderDescription(ticket.description),
    [ticket.description],
  );
  const isJobOrderRequest = ticket.requestType === "JOB_ORDER" || Boolean(jobOrderDetails);

  const canEditRequisitionPricing = Boolean(
    isRequisitionRequest &&
      sessionAgentId &&
      ticket.assignedAgentId === sessionAgentId &&
      itemRequisitionApprovalMeta &&
      itemRequisitionApprovalMeta.proceduralStep !== "DONE",
  );
  const showRequisitionPricingColumns = Boolean(
    canEditRequisitionPricing ||
      (requisitionDetails?.items.some(
        (i) =>
          i.priceQuotation || i.unitPrice || i.total || i.nameOfSupplier || i.terms,
      ) ??
        false) ||
      (isRequisitionRequest && ticket.assignedAgentId),
  );

  const requisitionListedItemsTotal = useMemo(() => {
    if (!requisitionDetails) return "";
    const lines = requisitionDetails.items.map((item, index) => {
      const draft = pricingDraft[index];
      if (!draft) return item;
      return {
        ...item,
        priceQuotation: draft.priceQuotation,
        unitPrice: draft.unitPrice,
        total: draft.total,
      };
    });
    return sumRequisitionListedItemsTotal(lines);
  }, [requisitionDetails, pricingDraft]);

  useEffect(() => {
    if (!requisitionDetails) {
      setPricingDraft([]);
      return;
    }
    setPricingDraft(
      requisitionDetails.items.map((item) => {
        const derived = applyRequisitionPricingDerivedFields(item);
        return {
          priceQuotation: derived.priceQuotation ?? "",
          unitPrice: derived.unitPrice ?? "",
          total: derived.total ?? "",
          nameOfSupplier: derived.nameOfSupplier ?? "",
          terms: derived.terms ?? "",
        };
      }),
    );
  }, [requisitionDetails]);

  const intakeScreenshots = useMemo(
    () => parseIntakeScreenshotMeta(ticket.intakeScreenshotMeta),
    [ticket.intakeScreenshotMeta],
  );

  const pendingTransfer = useMemo(() => {
    let detail: string | null = null;
    for (const a of ticket.activities) {
      if (a.summary === "Transfer requested") detail = a.detail ?? null;
      if (a.summary === "Transfer approved" || a.summary === "Transfer rejected") detail = null;
    }
    return parseTransferRequestDetail(detail);
  }, [ticket.activities]);

  const paymentProceduralLabel = paymentApprovalMeta
    ? paymentProceduralStatusLabel(paymentApprovalMeta.proceduralStep)
    : null;
  const currentPaymentStep =
    paymentApprovalMeta && paymentApprovalMeta.proceduralStep !== "DONE"
      ? (paymentApprovalMeta.proceduralStep as PaymentApprovalStep)
      : null;
  const isTicketAssignee = Boolean(sessionAgentId && ticket.assignedAgentId === sessionAgentId);
  const currentStepAssigneeId = currentPaymentStep
    ? assigneeIdForStep(paymentApprovalMeta!, currentPaymentStep)
    : null;
  /** Prior RFP role holders — excluded from “Submit for Next Approval” (one person, one step). */
  const paymentPriorApproverIds = useMemo(() => {
    if (!paymentApprovalMeta || !currentPaymentStep) return new Set<string>();
    const ids = paymentApprovalParticipantIds(paymentApprovalMeta);
    const current = assigneeIdForStep(paymentApprovalMeta, currentPaymentStep);
    if (current) ids.delete(current);
    return ids;
  }, [paymentApprovalMeta, currentPaymentStep]);

  /** True when the signed-in user already holds another approval role on this RFP. */
  const sessionAlreadyApprovedThisRequest = Boolean(
    sessionAgentId && paymentPriorApproverIds.has(sessionAgentId),
  );

  const canCompleteCurrentPaymentStep = Boolean(
    currentPaymentStep &&
      sessionAgentId &&
      ticket.assignedAgentId === sessionAgentId &&
      !sessionAlreadyApprovedThisRequest,
  );
  /** Assignee (or Personnel) can submit the current step to the next approver without returning to Unassigned. */
  const canRequestPaymentApproval = Boolean(
    currentPaymentStep && (isPersonnel || isTicketAssignee || isSuperAdmin),
  );

  useEffect(() => {
    if (!requestApproverId) return;
    if (paymentPriorApproverIds.has(requestApproverId)) {
      setRequestApproverId("");
    }
  }, [paymentPriorApproverIds, requestApproverId]);

  const requisitionProceduralLabel = itemRequisitionApprovalMeta
    ? itemRequisitionProceduralStatusLabel(itemRequisitionApprovalMeta.proceduralStep)
    : null;
  const currentRequisitionStep =
    itemRequisitionApprovalMeta && itemRequisitionApprovalMeta.proceduralStep !== "DONE"
      ? (itemRequisitionApprovalMeta.proceduralStep as ItemRequisitionApprovalStep)
      : null;
  const canCompleteCurrentRequisitionStep = Boolean(
    currentRequisitionStep &&
      currentRequisitionStep !== "CANVASSED_BY" &&
      sessionAgentId &&
      ticket.assignedAgentId === sessionAgentId,
  );
  const canRequestRequisitionApproval = Boolean(
    currentRequisitionStep && (isPersonnel || isTicketAssignee || isSuperAdmin),
  );
  const canUndoRequisitionCanvass = Boolean(
    isSuperAdmin &&
      itemRequisitionApprovalMeta &&
      (itemRequisitionApprovalMeta.completed.CANVASSED_BY ||
        itemRequisitionApprovalMeta.canvassedByAgentId) &&
      !itemRequisitionApprovalMeta.completed.APPROVED_BY &&
      itemRequisitionApprovalMeta.proceduralStep !== "DONE",
  );
  const currentRequisitionStepAssigneeId = currentRequisitionStep
    ? itemRequisitionAssigneeIdForStep(itemRequisitionApprovalMeta!, currentRequisitionStep)
    : null;

  const fundTransferProceduralLabel = fundTransferApprovalMeta
    ? fundTransferProceduralStatusLabel(fundTransferApprovalMeta.proceduralStep)
    : null;
  const currentFundTransferStep =
    fundTransferApprovalMeta && fundTransferApprovalMeta.proceduralStep !== "DONE"
      ? (fundTransferApprovalMeta.proceduralStep as FundTransferApprovalStep)
      : null;
  const canCompleteCurrentFundTransferStep = Boolean(
    currentFundTransferStep && sessionAgentId && ticket.assignedAgentId === sessionAgentId,
  );
  const canRequestFundTransferApproval = Boolean(
    currentFundTransferStep && (isPersonnel || isTicketAssignee || isSuperAdmin),
  );
  const currentFundTransferStepAssigneeId = currentFundTransferStep
    ? fundTransferAssigneeIdForStep(fundTransferApprovalMeta!, currentFundTransferStep)
    : null;

  function updatePricingRow(
    index: number,
    patch: Partial<{
      priceQuotation: string;
      unitPrice: string;
      total: string;
      nameOfSupplier: string;
      terms: string;
    }>,
  ) {
    setPricingDraft((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const qty = requisitionDetails?.items[index]?.quantity ?? "";
        let next = { ...row, ...patch };
        // PRICE QUOTATION = QUANTITY × UNIT PRICE (unit price is editable).
        if (patch.unitPrice !== undefined) {
          const quote = computeRequisitionPriceQuotation({
            quantity: qty,
            unitPrice: next.unitPrice,
            priceQuotation: next.priceQuotation,
            total: next.total,
          });
          next.priceQuotation = quote;
          next.total = quote;
        }
        return next;
      }),
    );
  }

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tickets/${ticket.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Request failed");
      return;
    }
    router.refresh();
  }

  const verificationState = useMemo(() => {
    let state: "pending" | "verified" | "rejected" = "pending";
    let rejectedReason: string | null = null;
    for (const a of ticket.activities) {
      if (a.summary === "Resolution verification approved") {
        state = "verified";
        rejectedReason = null;
      }
      if (a.summary === "Resolution verification rejected") {
        state = "rejected";
        rejectedReason = a.detail?.trim() || "No reason provided.";
      }
    }
    return { state, rejectedReason };
  }, [ticket.activities]);

  return (
    <div className="grid min-w-0 gap-4 pb-1 sm:gap-5 xl:grid-cols-[minmax(0,1.85fr)_minmax(280px,1fr)] xl:items-start">
      <div className="min-w-0 space-y-4">
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.10)] dark:border-zinc-800 dark:bg-[#0a101d] dark:shadow-[0_14px_40px_rgba(0,0,0,0.3)]">
        <div className="flex flex-col">
        <div className="border-b border-zinc-200 px-3 py-3 sm:px-5 sm:py-4 dark:border-zinc-800/90">
          <div className="flex flex-wrap items-start justify-between gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="break-all text-zinc-700 dark:text-zinc-300">{ticket.ticketNumber}</span>
            <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] text-zinc-700 dark:bg-zinc-700/70 dark:text-zinc-200">
              {formatTicketPriorityLabel(ticket.priority)}
            </span>
          </div>
            <time
              dateTime={
                ticket.createdAt instanceof Date
                  ? ticket.createdAt.toISOString()
                  : new Date(ticket.createdAt).toISOString()
              }
              className="shrink-0 text-right text-xs font-semibold normal-case tracking-normal text-zinc-600 dark:text-zinc-300 sm:text-sm"
              title="Request created"
            >
              {(ticket.createdAt instanceof Date
                ? ticket.createdAt
                : new Date(ticket.createdAt)
              ).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </time>
          </div>
          <h2 className="mt-2 break-words text-lg font-bold tracking-tight text-zinc-950 sm:text-2xl md:text-3xl dark:text-zinc-100">
            {paymentDetails
              ? formatPaymentRequestTitle({
                  payee: paymentDetails.payee,
                  inPaymentOf: paymentDetails.inPaymentOf,
                  amount: paymentDetails.amount,
                }) || ticket.title
              : ticket.title}
          </h2>
          {paymentProceduralLabel ? (
            <p className="mt-2 inline-flex rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-800 dark:text-amber-200">
              {paymentProceduralLabel}
            </p>
          ) : requisitionProceduralLabel ? (
            <p className="mt-2 inline-flex rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-800 dark:text-amber-200">
              {requisitionProceduralLabel}
            </p>
          ) : fundTransferProceduralLabel ? (
            <p className="mt-2 inline-flex rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-800 dark:text-amber-200">
              {fundTransferProceduralLabel}
            </p>
          ) : null}
          {paymentDetails ? (
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                    Payee
                  </dt>
                  <dd className="mt-0.5 break-words font-medium text-zinc-800 dark:text-zinc-200">
                    {paymentDetails.payee || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                    In payment of
                  </dt>
                  <dd className="mt-0.5 break-words font-medium text-zinc-800 dark:text-zinc-200">
                    {paymentDetails.inPaymentOf || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                    Account title
                  </dt>
                  <dd className="mt-0.5 break-words font-medium text-zinc-800 dark:text-zinc-200">
                    {paymentDetails.accountTitle || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                    Amount
                  </dt>
                  <dd className="mt-0.5 break-words font-medium text-zinc-800 dark:text-zinc-200">
                    {paymentDetails.amount
                      ? formatPaymentPeso(paymentDetails.amount) || paymentDetails.amount
                      : "—"}
                  </dd>
                </div>
              </dl>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                    Mode of payment
                  </dt>
                  <dd className="mt-0.5 break-words font-medium text-zinc-800 dark:text-zinc-200">
                    {paymentDetails.modeOfPayment || "—"}
                  </dd>
                </div>
                {paymentDetails.deliveryOfCheck ? (
                  <div>
                    <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                      Delivery of check
                    </dt>
                    <dd className="mt-0.5 break-words font-medium text-zinc-800 dark:text-zinc-200">
                      {paymentDetails.deliveryOfCheck}
                    </dd>
                  </div>
                ) : null}
                {paymentDetails.bankNameAccountNumber ? (
                  <div>
                    <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                      Bank name / account number
                    </dt>
                    <dd className="mt-0.5 break-words font-medium text-zinc-800 dark:text-zinc-200">
                      {paymentDetails.bankNameAccountNumber}
                    </dd>
                  </div>
                ) : null}
                {paymentDetails.notes ? (
                  <div>
                    <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                      Additional notes
                    </dt>
                    <dd className="mt-0.5 whitespace-pre-wrap break-words font-medium text-zinc-800 dark:text-zinc-200">
                      {paymentDetails.notes}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ) : requisitionDetails ? (
            <div className="mt-3 space-y-4">
              <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-zinc-100 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:bg-zinc-900/60 dark:text-zinc-400">
                    <tr>
                      <th className="px-3 py-2">Item #</th>
                      <th className="px-3 py-2">Qty</th>
                      <th className="px-3 py-2">Unit</th>
                      <th className="px-3 py-2">Particular / material / specification</th>
                      {showRequisitionPricingColumns ? (
                        <>
                          <th className="px-3 py-2">Unit price</th>
                          <th className="px-3 py-2">Price quotation</th>
                          <th className="px-3 py-2">Name of supplier</th>
                          <th className="px-3 py-2">Terms</th>
                        </>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {requisitionDetails.items.map((item, index) => {
                      const draft = pricingDraft[index];
                      return (
                        <tr key={`req-view-${index}`} className="align-top">
                          <td className="px-3 py-2 font-medium text-zinc-800 dark:text-zinc-200">
                            {item.itemNumber || "—"}
                          </td>
                          <td className="px-3 py-2 text-zinc-800 dark:text-zinc-200">
                            {item.quantity || "—"}
                          </td>
                          <td className="px-3 py-2 text-zinc-800 dark:text-zinc-200">
                            {item.unit || "—"}
                          </td>
                          <td className="px-3 py-2 whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">
                            {item.particular || "—"}
                          </td>
                          {showRequisitionPricingColumns ? (
                            canEditRequisitionPricing ? (
                              <>
                                <td className="px-3 py-2">
                                  <div className="flex min-w-[6.5rem] items-center gap-1">
                                    <span className="shrink-0 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                                      ₱
                                    </span>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={draft?.unitPrice ?? ""}
                                      onChange={(e) =>
                                        updatePricingRow(index, {
                                          unitPrice: sanitizeRequisitionFloatInput(e.target.value),
                                        })
                                      }
                                      onBlur={() => {
                                        const normalized = normalizeRequisitionMoneyInput(
                                          draft?.unitPrice ?? "",
                                        );
                                        if (normalized !== (draft?.unitPrice ?? "")) {
                                          updatePricingRow(index, { unitPrice: normalized });
                                        }
                                      }}
                                      className="min-w-0 flex-1 rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                                      placeholder="0.00"
                                    />
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex min-w-[7.5rem] items-center gap-1">
                                    <span className="shrink-0 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                                      ₱
                                    </span>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={draft?.priceQuotation ?? ""}
                                      readOnly
                                      title="Auto-computed: Quantity × Unit Price"
                                      className="min-w-0 flex-1 cursor-default rounded border border-zinc-300 bg-zinc-100 px-2 py-1 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                                      placeholder="0.00"
                                    />
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="text"
                                    value={draft?.nameOfSupplier ?? ""}
                                    onChange={(e) =>
                                      updatePricingRow(index, { nameOfSupplier: e.target.value })
                                    }
                                    className="min-w-[8rem] rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                                    placeholder="—"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={draft?.terms ?? ""}
                                    onChange={(e) =>
                                      updatePricingRow(index, {
                                        terms: sanitizeRequisitionIntegerInput(e.target.value),
                                      })
                                    }
                                    className="min-w-[5rem] rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                                    placeholder="0"
                                  />
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-3 py-2 text-zinc-800 dark:text-zinc-200">
                                  {formatRequisitionPeso(item.unitPrice) || "—"}
                                </td>
                                <td className="px-3 py-2 text-zinc-800 dark:text-zinc-200">
                                  {formatRequisitionPeso(
                                    item.priceQuotation || computeRequisitionPriceQuotation(item),
                                  ) || "—"}
                                </td>
                                <td className="px-3 py-2 text-zinc-800 dark:text-zinc-200">
                                  {item.nameOfSupplier || "—"}
                                </td>
                                <td className="px-3 py-2 text-zinc-800 dark:text-zinc-200">
                                  {item.terms || "—"}
                                </td>
                              </>
                            )
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {canEditRequisitionPricing ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      patch({
                        action: "update_item_requisition_pricing",
                        items: pricingDraft,
                      })
                    }
                    className="min-h-9 rounded-lg border border-orange-500/40 bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
                  >
                    Save Pricing
                  </button>
                  {currentRequisitionStep === "CANVASSED_BY" ? (
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Saving pricing stamps you as Canvassed By and returns this request to the
                      Assignment Board for Approved By.
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                  Grand Total
                </p>
                <p className="mt-1 break-words text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatRequisitionPeso(requisitionListedItemsTotal) || "—"}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                  Purpose of request
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  {requisitionDetails.purposeOfRequest || "—"}
                </p>
              </div>
            </div>
          ) : fundTransferDetails ? (
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                    Requesting department/business unit
                  </dt>
                  <dd className="mt-0.5 break-words font-medium text-zinc-800 dark:text-zinc-200">
                    {fundTransferDetails.requestingDepartmentBusinessUnit || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                    Fund transfer amount
                  </dt>
                  <dd className="mt-0.5 break-words font-medium text-zinc-800 dark:text-zinc-200">
                    {formatFundTransferPeso(fundTransferDetails.fundTransferAmount) || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                    From account
                  </dt>
                  <dd className="mt-0.5 break-words font-medium text-zinc-800 dark:text-zinc-200">
                    {fundTransferDetails.fromAccountName || "—"}
                    {fundTransferDetails.fromAccountNumber
                      ? ` · ${fundTransferDetails.fromAccountNumber}`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                    To account
                  </dt>
                  <dd className="mt-0.5 break-words font-medium text-zinc-800 dark:text-zinc-200">
                    {fundTransferDetails.toAccountName || "—"}
                    {fundTransferDetails.toAccountNumber
                      ? ` · ${fundTransferDetails.toAccountNumber}`
                      : ""}
                  </dd>
                </div>
              </dl>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                    Bank name
                  </dt>
                  <dd className="mt-0.5 break-words font-medium text-zinc-800 dark:text-zinc-200">
                    {fundTransferDetails.bankName || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                    Bank address
                  </dt>
                  <dd className="mt-0.5 break-words font-medium text-zinc-800 dark:text-zinc-200">
                    {fundTransferDetails.bankAddress || "—"}
                  </dd>
                </div>
                {fundTransferDetails.reason ? (
                  <div>
                    <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                      Reason / special instruction
                    </dt>
                    <dd className="mt-0.5 whitespace-pre-wrap break-words font-medium text-zinc-800 dark:text-zinc-200">
                      {fundTransferDetails.reason}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ) : isJobOrderRequest ? (
            <div className="mt-3 space-y-4">
              {jobOrderDetails ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                    Nature of concern
                  </dt>
                  <dd className="mt-0.5 break-words font-medium text-zinc-800 dark:text-zinc-200">
                    {jobOrderDetails.natureOfConcern.length > 0
                      ? jobOrderDetails.natureOfConcern.join(", ")
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                    Building
                  </dt>
                  <dd className="mt-0.5 break-words font-medium text-zinc-800 dark:text-zinc-200">
                    {jobOrderDetails.building || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                    Expected duration
                  </dt>
                  <dd className="mt-0.5 break-words font-medium text-zinc-800 dark:text-zinc-200">
                    {jobOrderDetails.expectedDuration || "—"}
                  </dd>
                </div>
              </dl>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                    Start date
                  </dt>
                  <dd className="mt-0.5 break-words font-medium text-zinc-800 dark:text-zinc-200">
                    {jobOrderDetails.startDate || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                    Target date
                  </dt>
                  <dd className="mt-0.5 break-words font-medium text-zinc-800 dark:text-zinc-200">
                    {jobOrderDetails.targetDate || "—"}
                  </dd>
                </div>
                {jobOrderDetails.notes ? (
                  <div>
                    <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                      Additional notes
                    </dt>
                    <dd className="mt-0.5 whitespace-pre-wrap break-words font-medium text-zinc-800 dark:text-zinc-200">
                      {jobOrderDetails.notes}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
              ) : (
                <p className="max-w-4xl whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-700 sm:text-base dark:text-zinc-300">
                  {cleanedDescription}
                </p>
              )}
            <JobOrderProjectLinkPanel
              ticketId={ticket.id}
              canCreateProject={canCreateJobOrderProject}
              canRequestProject={canRequestJobOrderProject}
              sessionAgentId={sessionAgentId}
            />
            </div>
          ) : (
            <p className="mt-2 max-w-4xl whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-700 sm:text-base dark:text-zinc-300">
              {cleanedDescription}
            </p>
          )}
          {paymentDetails && paymentApprovalMeta ? (
            <div className="mt-4 grid grid-cols-1 items-start gap-x-4 gap-y-3 border-t border-zinc-200 pt-4 sm:grid-cols-2 lg:grid-cols-5 dark:border-zinc-800/80">
              {PAYMENT_APPROVAL_STEPS.map((step) => {
                const completedAt = paymentApprovalMeta.completed[step];
                const agentId = assigneeIdForStep(paymentApprovalMeta, step);
                const name =
                  completedAt && agentId
                    ? paymentApprovalAgentNames[agentId]?.trim() || "Unknown"
                    : null;
                return (
                  <div key={step} className="min-w-0 self-start">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                      {PAYMENT_APPROVAL_STEP_LABELS[step]}
                    </p>
                    <p
                      className={`mt-1 break-words text-sm font-medium leading-snug ${
                        name
                          ? "text-emerald-800 dark:text-emerald-300"
                          : "text-zinc-400 dark:text-zinc-600"
                      }`}
                    >
                      {name ?? "—"}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : null}
          {requisitionDetails && itemRequisitionApprovalMeta ? (
            <div className="mt-4 grid grid-cols-1 items-start gap-x-4 gap-y-3 border-t border-zinc-200 pt-4 sm:grid-cols-2 dark:border-zinc-800/80">
              {ITEM_REQUISITION_APPROVAL_STEPS.map((step) => {
                const completedAt = itemRequisitionApprovalMeta.completed[step];
                const agentId = itemRequisitionAssigneeIdForStep(itemRequisitionApprovalMeta, step);
                const name =
                  completedAt && agentId
                    ? itemRequisitionApprovalAgentNames[agentId]?.trim() || "Unknown"
                    : null;
                return (
                  <div key={step} className="min-w-0 self-start">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                      {ITEM_REQUISITION_APPROVAL_STEP_LABELS[step]}
                    </p>
                    <p
                      className={`mt-1 break-words text-sm font-medium leading-snug ${
                        name
                          ? "text-emerald-800 dark:text-emerald-300"
                          : "text-zinc-400 dark:text-zinc-600"
                      }`}
                    >
                      {name ?? "—"}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : null}
          {fundTransferDetails && fundTransferApprovalMeta ? (
            <div className="mt-4 grid grid-cols-1 items-start gap-x-4 gap-y-3 border-t border-zinc-200 pt-4 sm:grid-cols-2 lg:grid-cols-3 dark:border-zinc-800/80">
              {FUND_TRANSFER_APPROVAL_STEPS.map((step) => {
                const completedAt = fundTransferApprovalMeta.completed[step];
                const agentId = fundTransferAssigneeIdForStep(fundTransferApprovalMeta, step);
                const assigneeName = agentId
                  ? fundTransferApprovalAgentNames[agentId]?.trim() || null
                  : null;
                // Creator is always Prepared By (stamped on create / backfilled on open).
                const name =
                  step === "PREPARED_BY"
                    ? assigneeName || ticket.contactName?.trim() || null
                    : completedAt
                      ? assigneeName || "Unknown"
                      : null;
                return (
                  <div key={step} className="min-w-0 self-start">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                      {FUND_TRANSFER_APPROVAL_STEP_LABELS[step]}
                    </p>
                    <p
                      className={`mt-1 break-words text-sm font-medium leading-snug ${
                        name
                          ? "text-emerald-800 dark:text-emerald-300"
                          : "text-zinc-400 dark:text-zinc-600"
                      }`}
                    >
                      {name ?? "—"}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : null}
          {intakeScreenshots.length > 0 ? (
            <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800/80">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-500">
                Screenshots from request
              </p>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {intakeScreenshots.map((m) => {
                  const href = `/api/tickets/${ticket.id}/screenshots/${encodeURIComponent(m.storedFileName)}`;
                  return (
                    <li
                      key={m.storedFileName}
                      className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700/80 dark:bg-zinc-950/50"
                    >
                      <a href={href} target="_blank" rel="noreferrer" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={href}
                          alt={m.originalName}
                          className="h-28 w-full object-cover object-top"
                          loading="lazy"
                        />
                      </a>
                      <p className="truncate px-1.5 py-1 text-[10px] text-zinc-600 dark:text-zinc-500" title={m.originalName}>
                        {m.originalName}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>

        {ticket.status === "FOR_CONFIRMATION" ? (
          <>
        <div className="border-b border-zinc-200 px-3 sm:px-5 dark:border-zinc-800/90">
          <div className="flex gap-5 text-sm font-medium">
                <span className="border-b-2 border-orange-500 py-3 text-orange-700 dark:text-orange-300">
                  Verification outcome
                </span>
          </div>
        </div>

        <div className="space-y-3 px-3 py-3 sm:px-5 sm:py-4">
          {verificationState.state === "verified" ? (
            <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-700/50 dark:bg-emerald-950/20">
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Verified by requestor</p>
              <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-200">
                {ticket.feedback
                  ? "Star rating and feedback have been submitted."
                  : "Verification complete. Waiting for star rating and feedback."}
              </p>
              {ticket.feedback ? (
                <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900/60">
                  <p className="text-sm text-zinc-900 dark:text-zinc-100">
                    Star rating: <span className="font-semibold">{ticket.feedback.csat}/5</span>
                  </p>
                  <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                    {ticket.feedback.comment?.trim() || "No written feedback submitted."}
                  </p>
                </div>
              ) : null}
            </article>
          ) : null}

          {verificationState.state === "rejected" ? (
            <article className="rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-700/50 dark:bg-rose-950/20">
              <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">Not verified by requestor</p>
              <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-200">
                    The requestor did not verify the resolution. Request workflow returns to active handling.
              </p>
              <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900/60">
                <p className="text-xs uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">Reason provided</p>
                <p className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">{verificationState.rejectedReason}</p>
              </div>
            </article>
          ) : null}

          {verificationState.state === "pending" ? (
            <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/60">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Awaiting requestor verification</p>
              <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                A verification email was sent. This tab will automatically reflect rating and feedback once verified,
                or show the requestor&apos;s rejection reason when not verified.
              </p>
            </article>
          ) : null}
        </div>
          </>
        ) : null}

        <div className="border-t border-zinc-200 bg-zinc-50 px-3 py-3 sm:px-5 sm:py-4 dark:border-zinc-800/90 dark:bg-zinc-950/35">
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            Use the right-side controls to request more information, update priority, or transfer this request to a colleague.
          </div>
        </div>
        </div>
      </div>

      <article className="rounded-2xl border border-zinc-200 bg-white p-4 text-xs text-zinc-600 shadow-[0_12px_32px_rgba(15,23,42,0.08)] sm:p-5 dark:border-zinc-800 dark:bg-surface dark:text-zinc-300 dark:shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">Audit log</h2>
          <button
            type="button"
            onClick={() => setLogModalOpen(true)}
            className="rounded-full border border-zinc-300 bg-zinc-900 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white hover:bg-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            View all log
          </button>
        </div>
        <ul className="mt-3 space-y-2">
          {ticket.activities.slice(-6).map((a) => (
            <li key={a.id}>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">{a.summary}</span>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{a.createdAt.toLocaleString()}</div>
            </li>
          ))}
        </ul>
      </article>
      </div>

      <aside className="min-w-0 space-y-4">
        <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.08)] sm:p-5 dark:border-zinc-800 dark:bg-surface dark:shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
          <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">
            Request more information
          </h2>
          {["IN_PROGRESS", "ESCALATED", "OPEN"].includes(ticket.status) ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                patch({ action: "request_more_info", note: "Requested more information from the requestor." })
              }
              className="mt-3 min-h-10 w-full rounded-lg border border-amber-500 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60 dark:bg-transparent dark:text-amber-200 dark:hover:bg-amber-500/10"
            >
              Request more information
            </button>
          ) : ticket.status === "PENDING_INFO" ? (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                Waiting for the requestor to reply.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => patch({ action: "status", status: "IN_PROGRESS", note: "Customer replied" })}
                className="min-h-10 w-full rounded-lg border border-zinc-300 bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                Resume after customer reply
              </button>
            </div>
          ) : (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              More-information requests are available while the ticket is open or in progress.
          </p>
          )}
        </article>

        <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.08)] sm:p-5 dark:border-zinc-800 dark:bg-surface dark:shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
          <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">Request controls</h2>
          <div className="mt-3 flex flex-col gap-2">
            {canUpdatePriority ? (
              <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Priority level</label>
                <div className="flex min-w-0 flex-col gap-2">
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as typeof ticket.priority)}
                    className="min-h-10 w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    {(ticket.priority === "UNSET"
                      ? (["UNSET", "LOW", "MEDIUM", "HIGH", "URGENT"] as const)
                      : (["LOW", "MEDIUM", "HIGH", "URGENT"] as const)
                    ).map((p) => (
                      <option key={p} value={p}>
                        {formatTicketPriorityLabel(p)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy || priority === ticket.priority}
                    onClick={() =>
                      patch({
                        action: "priority",
                        priority,
                        note: "Priority updated",
                      })
                    }
                    className="min-h-10 w-full shrink-0 rounded-lg border border-orange-500/40 bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-500 disabled:opacity-60 dark:border-orange-500/60 dark:bg-orange-600/20 dark:text-orange-100 dark:hover:bg-orange-600/30"
                  >
                    Update
                  </button>
                </div>
              </div>
            ) : null}

            {transferPending ? (
              <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-700/60 dark:bg-amber-950/20">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                  {pendingTransfer?.recipientAgentName
                    ? `Transfer pending — waiting for ${pendingTransfer.recipientAgentName} to accept.`
                    : "Transfer request pending."}
                </p>
                {pendingTransfer?.reason ? (
                  <p className="text-xs text-amber-700 dark:text-amber-100/80">{pendingTransfer.reason}</p>
                ) : null}
                {canApproveTransfer ? (
                  <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                        patch({
                          action: "approve_transfer",
                          note: "Transfer accepted — request assigned to me.",
                        })
                }
                      className="min-h-10 w-full rounded-lg border border-emerald-500/70 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                      Accept transfer
              </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        patch({
                          action: "reject_transfer",
                          note: "Transfer declined.",
                        })
                      }
                      className="min-h-10 w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    >
                      Decline transfer
                    </button>
                  </div>
                ) : (
                  <p className="text-[11px] text-amber-700 dark:text-amber-200/80">
                    The selected colleague must open this ticket and accept to take the assignment.
                  </p>
                )}
              </div>
            ) : null}

            {canRequestTransfer && !transferPending ? (
              <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Request for transfer
                </label>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Send this request to a colleague. If they accept, it becomes assigned to them.
                </p>
                <CompanyUserSearchField
                  label="Transfer to"
                  users={transferRecipients}
                  value={transferRecipientId}
                  onChange={setTransferRecipientId}
                  placeholder="Search company users…"
                  disabled={busy || transferRecipients.length === 0}
                />
                <textarea
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  placeholder="Why this request needs transfer"
                />
              <button
                type="button"
                  disabled={busy || !transferRecipientId}
                  onClick={() =>
                    patch({
                      action: "request_transfer",
                      reason: transferReason || "Unable to resolve with current assignment.",
                      recipientAgentId: transferRecipientId,
                    })
                  }
                  className="min-h-10 w-full rounded-lg border border-orange-500/40 bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
                >
                  Send transfer request
              </button>
              </div>
            ) : null}


            {isPaymentRequest && isSuperAdmin ? (
              <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
                <div>
                  <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Payment approval roles</p>
                  {paymentProceduralLabel ? (
                    <p className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                      {paymentProceduralLabel}
                    </p>
                  ) : paymentApprovalMeta?.proceduralStep === "DONE" ? (
                    <p className="mt-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                      All approval roles complete
                  </p>
                ) : null}
                </div>
                {(
                  [
                    ["preparedByAgentId", "Prepared By"],
                    ["notedByAgentId", "Noted By"],
                    ["approvedByAgentId", "Approved By"],
                    ["accountingAgentId", "Received By (Accounting)"],
                    ["financeAgentId", "Received By (Finance)"],
                  ] as const
                ).map(([key, label]) => {
                  const takenElsewhere = new Set(
                    (
                      [
                        approvalDraft.preparedByAgentId,
                        approvalDraft.notedByAgentId,
                        approvalDraft.approvedByAgentId,
                        approvalDraft.accountingAgentId,
                        approvalDraft.financeAgentId,
                      ] as Array<string | null>
                    ).filter((id): id is string => Boolean(id) && id !== approvalDraft[key]),
                  );
                  return (
                    <label key={key} className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                      {label}
                      <select
                        value={approvalDraft[key] ?? ""}
                        onChange={(e) =>
                          setApprovalDraft((prev) => ({
                            ...prev,
                            [key]: e.target.value || null,
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                      >
                        <option value="">Select assignee</option>
                        {approvalAgents
                          .filter((a) => !takenElsewhere.has(a.id))
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                              {a.email ? ` (${a.email})` : ""}
                            </option>
                          ))}
                      </select>
                    </label>
                  );
                })}
                <p className="text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                  Each person may only hold one approval role on this request.
                </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      patch({
                      action: "set_payment_approval_assignees",
                      preparedByAgentId: approvalDraft.preparedByAgentId,
                      notedByAgentId: approvalDraft.notedByAgentId,
                      approvedByAgentId: approvalDraft.approvedByAgentId,
                      accountingAgentId: approvalDraft.accountingAgentId,
                      financeAgentId: approvalDraft.financeAgentId,
                    })
                  }
                  className="min-h-10 w-full rounded-lg border border-orange-500/40 bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
                >
                  Save approval assignees
                  </button>
                {currentPaymentStep && canCompleteCurrentPaymentStep ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => patch({ action: "complete_payment_approval_step" })}
                    className="min-h-10 w-full rounded-lg border border-emerald-500/50 bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                  >
                    Complete {PAYMENT_APPROVAL_STEP_LABELS[currentPaymentStep]}
                  </button>
                ) : currentPaymentStep && sessionAlreadyApprovedThisRequest && isTicketAssignee ? (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">
                    You already approved an earlier step on this request, so Complete is hidden. Use
                    Submit for Next Approval to send it to a different person.
                  </p>
                ) : currentPaymentStep ? (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Only the Assignment Board assignee can complete this step. After completion, use
                    Submit for Next Approval to send the request to the next role (it stays assigned).
                  </p>
                ) : null}
                {canRequestPaymentApproval && currentPaymentStep ? (
                  <div className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
                    <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Submit for Next Approval
                    </p>
                    <p className="text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                      Each person may only approve once on this request. Prior role holders are hidden.
                    </p>
                    <CompanyUserSearchField
                      label={`${PAYMENT_APPROVAL_STEP_LABELS[currentPaymentStep]} — company user`}
                      users={approvalAgents}
                      value={requestApproverId || currentStepAssigneeId || ""}
                      onChange={setRequestApproverId}
                      disabled={busy}
                      excludedIds={paymentPriorApproverIds}
                      placeholder="Search company users…"
                      emptyMessage="No eligible users (or all matches already approved this request)."
                    />
                    <button
                      type="button"
                      disabled={busy || !(requestApproverId || currentStepAssigneeId)}
                      onClick={() =>
                        patch({
                          action: "request_payment_approval",
                          approverAgentId: requestApproverId || currentStepAssigneeId,
                        })
                      }
                      className="min-h-10 w-full rounded-lg border border-orange-500/40 bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
                    >
                      Submit for Next Approval
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {isPaymentRequest && canRequestPaymentApproval && !isSuperAdmin ? (
              <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
                <div>
                  <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Submit for Next Approval
                  </p>
                  {paymentProceduralLabel ? (
                    <p className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                      {paymentProceduralLabel}
                    </p>
                  ) : paymentApprovalMeta?.proceduralStep === "DONE" ? (
                    <p className="mt-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                      All approval roles complete — awaiting customer confirmation
                    </p>
                  ) : null}
                </div>
                {currentPaymentStep ? (
                  <>
                    <p className="text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                      Each person may only approve once on this request. Prior role holders are hidden.
                    </p>
                    <CompanyUserSearchField
                      label={`${PAYMENT_APPROVAL_STEP_LABELS[currentPaymentStep]} — company user`}
                      users={approvalAgents}
                      value={requestApproverId || currentStepAssigneeId || ""}
                      onChange={setRequestApproverId}
                      disabled={busy}
                      excludedIds={paymentPriorApproverIds}
                      placeholder="Search company users…"
                      emptyMessage="No eligible users (or all matches already approved this request)."
                    />
                    <button
                      type="button"
                      disabled={busy || !(requestApproverId || currentStepAssigneeId)}
                      onClick={() =>
                        patch({
                          action: "request_payment_approval",
                          approverAgentId: requestApproverId || currentStepAssigneeId,
                        })
                      }
                      className="min-h-10 w-full rounded-lg border border-orange-500/40 bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
                    >
                      Submit for Next Approval
                    </button>
                    {canCompleteCurrentPaymentStep ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => patch({ action: "complete_payment_approval_step" })}
                        className="min-h-10 w-full rounded-lg border border-emerald-500/50 bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                      >
                        Complete {PAYMENT_APPROVAL_STEP_LABELS[currentPaymentStep]}
                      </button>
                    ) : sessionAlreadyApprovedThisRequest && isTicketAssignee ? (
                      <p className="text-[11px] text-amber-700 dark:text-amber-300">
                        You already approved an earlier step on this request, so Complete is hidden.
                        Use Submit for Next Approval to send it to a different person.
                      </p>
                    ) : ticket.assignedAgentId ? (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        Waiting on the assigned personnel to complete{" "}
                        {PAYMENT_APPROVAL_STEP_LABELS[currentPaymentStep]}. After completion, they
                        can submit for the next approval without returning to Unassigned.
                      </p>
                    ) : (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        Choose a company user and submit for approval, or wait for Admin to assign
                        this request on the Assignment Board.
                      </p>
                    )}
                  </>
                ) : null}
              </div>
            ) : null}

            {isPaymentRequest && canCompleteCurrentPaymentStep && !isSuperAdmin && !canRequestPaymentApproval ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => patch({ action: "complete_payment_approval_step" })}
                className="min-h-10 rounded-lg border border-emerald-500/50 bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                Complete {currentPaymentStep ? PAYMENT_APPROVAL_STEP_LABELS[currentPaymentStep] : "approval"}
              </button>
            ) : null}

            {isPaymentRequest && !isSuperAdmin && !canRequestPaymentApproval && paymentProceduralLabel ? (
              <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] font-medium text-amber-800 dark:text-amber-200">
                {paymentProceduralLabel} — assign on the Assignment Board. After each approval, the
                assignee can submit for the next role from Ticket Controls (request stays assigned).
              </p>
            ) : null}

            {isRequisitionRequest && isSuperAdmin ? (
              <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
                <div>
                  <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Item requisition approval roles
                  </p>
                  {requisitionProceduralLabel ? (
                    <p className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                      {requisitionProceduralLabel}
                    </p>
                  ) : itemRequisitionApprovalMeta?.proceduralStep === "DONE" ? (
                    <p className="mt-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                      All approval roles complete
                    </p>
                  ) : null}
                </div>
                {(
                  [
                    ["canvassedByAgentId", "Canvassed By"],
                    ["approvedByAgentId", "Approved By"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                    {label}
                  <select
                      value={requisitionApprovalDraft[key] ?? ""}
                      onChange={(e) =>
                        setRequisitionApprovalDraft((prev) => ({
                          ...prev,
                          [key]: e.target.value || null,
                        }))
                      }
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                      <option value="">Select assignee</option>
                      {approvalAgents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                          {a.email ? ` (${a.email})` : ""}
                        </option>
                      ))}
                  </select>
                </label>
                ))}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    patch({
                      action: "set_item_requisition_approval_assignees",
                      canvassedByAgentId: requisitionApprovalDraft.canvassedByAgentId,
                      approvedByAgentId: requisitionApprovalDraft.approvedByAgentId,
                    })
                  }
                  className="min-h-10 w-full rounded-lg border border-orange-500/40 bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
                >
                  Save approval assignees
                </button>
                {canUndoRequisitionCanvass ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => patch({ action: "undo_item_requisition_canvass" })}
                    className="min-h-10 w-full rounded-lg border border-rose-500/50 bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-60"
                  >
                    Undo Canvassed By
                  </button>
                ) : null}
                {currentRequisitionStep === "CANVASSED_BY" ? (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Canvassed By completes automatically when the assignee saves pricing.
                  </p>
                ) : currentRequisitionStep && canCompleteCurrentRequisitionStep ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      patch({
                        action: "complete_item_requisition_approval_step",
                        items: pricingDraft,
                      })
                    }
                    className="min-h-10 w-full rounded-lg border border-emerald-500/50 bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                  >
                    Complete {ITEM_REQUISITION_APPROVAL_STEP_LABELS[currentRequisitionStep]}
                  </button>
                ) : currentRequisitionStep ? (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Only the Assignment Board assignee can complete Approved By. After completion, use
                    Submit for Next Approval to advance (request stays assigned).
                  </p>
                ) : null}
                {canRequestRequisitionApproval && currentRequisitionStep ? (
                  <div className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
                    <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Submit for Next Approval
                    </p>
                  <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                      {ITEM_REQUISITION_APPROVAL_STEP_LABELS[currentRequisitionStep]} — company user
                    <select
                        value={requestApproverId || currentRequisitionStepAssigneeId || ""}
                        onChange={(e) => setRequestApproverId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    >
                        <option value="">Select user from company</option>
                        {approvalAgents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                            {a.email ? ` (${a.email})` : ""}
                          </option>
                        ))}
                    </select>
                  </label>
                    <button
                      type="button"
                      disabled={busy || !(requestApproverId || currentRequisitionStepAssigneeId)}
                      onClick={() =>
                        patch({
                          action: "request_item_requisition_approval",
                          approverAgentId: requestApproverId || currentRequisitionStepAssigneeId,
                        })
                      }
                      className="min-h-10 w-full rounded-lg border border-orange-500/40 bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
                    >
                      Submit for Next Approval
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {isRequisitionRequest && canRequestRequisitionApproval && !isSuperAdmin ? (
              <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
                <div>
                  <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Submit for Next Approval
                  </p>
                  {requisitionProceduralLabel ? (
                    <p className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                      {requisitionProceduralLabel}
                    </p>
                  ) : itemRequisitionApprovalMeta?.proceduralStep === "DONE" ? (
                    <p className="mt-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                      All approval roles complete — awaiting customer confirmation
                    </p>
                  ) : null}
                </div>
                {currentRequisitionStep ? (
                  <>
                    <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                      {ITEM_REQUISITION_APPROVAL_STEP_LABELS[currentRequisitionStep]} — company user
                      <select
                        value={requestApproverId || currentRequisitionStepAssigneeId || ""}
                        onChange={(e) => setRequestApproverId(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                      >
                        <option value="">Select user from your company</option>
                        {approvalAgents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                            {a.email ? ` (${a.email})` : ""}
                            </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={busy || !(requestApproverId || currentRequisitionStepAssigneeId)}
                      onClick={() =>
                        patch({
                          action: "request_item_requisition_approval",
                          approverAgentId: requestApproverId || currentRequisitionStepAssigneeId,
                        })
                      }
                      className="min-h-10 w-full rounded-lg border border-orange-500/40 bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
                    >
                      Submit for Next Approval
                    </button>
                    {currentRequisitionStep === "CANVASSED_BY" ? (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {ticket.assignedAgentId
                          ? "Fill pricing on the left, then use Save Pricing. After that, submit for the next approval."
                          : "Assign this request on the Assignment Board so the assignee can save pricing and complete Canvassed By."}
                      </p>
                    ) : canCompleteCurrentRequisitionStep ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          patch({
                            action: "complete_item_requisition_approval_step",
                            items: pricingDraft,
                          })
                        }
                        className="min-h-10 w-full rounded-lg border border-emerald-500/50 bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                      >
                        Complete {ITEM_REQUISITION_APPROVAL_STEP_LABELS[currentRequisitionStep]}
                      </button>
                    ) : ticket.assignedAgentId ? (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        Waiting on the assigned personnel to complete{" "}
                        {ITEM_REQUISITION_APPROVAL_STEP_LABELS[currentRequisitionStep]}.
                      </p>
                    ) : (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        Choose a company user and submit for approval, or wait for Admin to assign
                        this request on the Assignment Board.
                      </p>
                    )}
                  </>
                  ) : null}
                </div>
            ) : null}

            {isRequisitionRequest &&
            canCompleteCurrentRequisitionStep &&
            !isSuperAdmin &&
            !canRequestRequisitionApproval ? (
                <button
                  type="button"
                disabled={busy}
                onClick={() =>
                  patch({
                    action: "complete_item_requisition_approval_step",
                    items: pricingDraft,
                  })
                }
                className="min-h-10 rounded-lg border border-emerald-500/50 bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                Complete{" "}
                {currentRequisitionStep
                  ? ITEM_REQUISITION_APPROVAL_STEP_LABELS[currentRequisitionStep]
                  : "approval"}
              </button>
            ) : null}

            {isRequisitionRequest &&
            !isSuperAdmin &&
            !canRequestRequisitionApproval &&
            requisitionProceduralLabel ? (
              <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] font-medium text-amber-800 dark:text-amber-200">
                {currentRequisitionStep === "CANVASSED_BY"
                  ? `${requisitionProceduralLabel} — assign on the Assignment Board; Canvassed By completes when the assignee saves pricing.`
                  : `${requisitionProceduralLabel} — assign on the Assignment Board; after Approved By, submit for the next role from Ticket Controls.`}
              </p>
            ) : null}

            {isFundTransferRequest && isSuperAdmin ? (
              <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 pb-4 dark:border-zinc-700 dark:bg-zinc-900/50">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Fund transfer approval roles
                  </p>
                  {fundTransferProceduralLabel ? (
                    <p className="inline-flex max-w-full rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[11px] font-medium leading-snug text-amber-800 dark:text-amber-200">
                      {fundTransferProceduralLabel}
                    </p>
                  ) : fundTransferApprovalMeta?.proceduralStep === "DONE" ? (
                    <p className="inline-flex max-w-full rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium leading-snug text-emerald-800 dark:text-emerald-300">
                      All approval roles complete
                    </p>
                  ) : null}
                </div>
                {(
                  [
                    ["preparedByAgentId", "Prepared By"],
                    ["recommendingApprovalAgentId", "Recommending Approval"],
                    ["approvedByAgentId", "Approved By"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex flex-col gap-1.5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400"
                  >
                    {label}
                    <select
                      value={fundTransferApprovalDraft[key] ?? ""}
                      onChange={(e) =>
                        setFundTransferApprovalDraft((prev) => ({
                          ...prev,
                          [key]: e.target.value || null,
                        }))
                      }
                      className="min-h-10 w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    >
                      <option value="">Select assignee</option>
                      {approvalAgents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                          {a.email ? ` (${a.email})` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    patch({
                      action: "set_fund_transfer_approval_assignees",
                      preparedByAgentId: fundTransferApprovalDraft.preparedByAgentId,
                      recommendingApprovalAgentId:
                        fundTransferApprovalDraft.recommendingApprovalAgentId,
                      approvedByAgentId: fundTransferApprovalDraft.approvedByAgentId,
                    })
                  }
                  className="min-h-10 w-full rounded-lg border border-orange-500/40 bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
                >
                  Save approval assignees
                </button>
                {currentFundTransferStep && canCompleteCurrentFundTransferStep ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => patch({ action: "complete_fund_transfer_approval_step" })}
                    className="min-h-10 w-full rounded-lg border border-emerald-500/50 bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                  >
                    Complete {FUND_TRANSFER_APPROVAL_STEP_LABELS[currentFundTransferStep]}
                  </button>
                ) : currentFundTransferStep ? (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Only the Assignment Board assignee can complete this step. After completion, use
                    Submit for Next Approval to send the request to the next role (it stays assigned).
                  </p>
                ) : null}
                {canRequestFundTransferApproval && currentFundTransferStep ? (
                  <div className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
                    <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Submit for Next Approval
                    </p>
                    <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                      {FUND_TRANSFER_APPROVAL_STEP_LABELS[currentFundTransferStep]} — company user
                      <select
                        value={requestApproverId || currentFundTransferStepAssigneeId || ""}
                        onChange={(e) => setRequestApproverId(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                      >
                        <option value="">Select user from company</option>
                        {approvalAgents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                            {a.email ? ` (${a.email})` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={busy || !(requestApproverId || currentFundTransferStepAssigneeId)}
                      onClick={() =>
                        patch({
                          action: "request_fund_transfer_approval",
                          approverAgentId: requestApproverId || currentFundTransferStepAssigneeId,
                        })
                      }
                      className="min-h-10 w-full rounded-lg border border-orange-500/40 bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
                    >
                      Submit for Next Approval
                </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {isFundTransferRequest && canRequestFundTransferApproval && !isSuperAdmin ? (
              <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
                <div>
                  <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Submit for Next Approval
                  </p>
                  {fundTransferProceduralLabel ? (
                    <p className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                      {fundTransferProceduralLabel}
                    </p>
                  ) : fundTransferApprovalMeta?.proceduralStep === "DONE" ? (
                    <p className="mt-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                      All approval roles complete — awaiting customer confirmation
                    </p>
                  ) : null}
              </div>
                {currentFundTransferStep ? (
                  <>
                    <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                      {FUND_TRANSFER_APPROVAL_STEP_LABELS[currentFundTransferStep]} — company user
                      <select
                        value={requestApproverId || currentFundTransferStepAssigneeId || ""}
                        onChange={(e) => setRequestApproverId(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                      >
                        <option value="">Select user from your company</option>
                        {approvalAgents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                            {a.email ? ` (${a.email})` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={busy || !(requestApproverId || currentFundTransferStepAssigneeId)}
                      onClick={() =>
                        patch({
                          action: "request_fund_transfer_approval",
                          approverAgentId: requestApproverId || currentFundTransferStepAssigneeId,
                        })
                      }
                      className="min-h-10 w-full rounded-lg border border-orange-500/40 bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
                    >
                      Submit for Next Approval
                    </button>
                    {canCompleteCurrentFundTransferStep ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => patch({ action: "complete_fund_transfer_approval_step" })}
                        className="min-h-10 w-full rounded-lg border border-emerald-500/50 bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                      >
                        Complete {FUND_TRANSFER_APPROVAL_STEP_LABELS[currentFundTransferStep]}
                      </button>
                    ) : ticket.assignedAgentId ? (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        Waiting on the assigned personnel to complete{" "}
                        {FUND_TRANSFER_APPROVAL_STEP_LABELS[currentFundTransferStep]}. After
                        completion, they can submit for the next approval without returning to
                        Unassigned.
                      </p>
                    ) : (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        Choose a company user and submit for approval, or wait for Admin to assign
                        this request on the Assignment Board.
                      </p>
                    )}
                  </>
            ) : null}
          </div>
            ) : null}

            {isFundTransferRequest &&
            canCompleteCurrentFundTransferStep &&
            !isSuperAdmin &&
            !canRequestFundTransferApproval ? (
            <button
              type="button"
                disabled={busy}
                onClick={() => patch({ action: "complete_fund_transfer_approval_step" })}
                className="min-h-10 rounded-lg border border-emerald-500/50 bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
            >
                Complete{" "}
                {currentFundTransferStep
                  ? FUND_TRANSFER_APPROVAL_STEP_LABELS[currentFundTransferStep]
                  : "approval"}
            </button>
            ) : null}

            {isFundTransferRequest &&
            !isSuperAdmin &&
            !canRequestFundTransferApproval &&
            fundTransferProceduralLabel ? (
              <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] font-medium text-amber-800 dark:text-amber-200">
                {fundTransferProceduralLabel} — assign on the Assignment Board. After each approval,
                the assignee can submit for the next role from Ticket Controls (request stays
                assigned).
              </p>
            ) : null}

          </div>
        </article>

        {error ? <p className="text-sm text-red-600 dark:text-red-300">{error}</p> : null}
      </aside>

      {logModalOpen ? (
        <div className="fixed inset-0 z-[70]">
          <button
            type="button"
            onClick={() => setLogModalOpen(false)}
            className="absolute inset-0 bg-zinc-950/55 dark:bg-black/70"
            aria-label="Close request logs"
          />
          <section className="absolute inset-x-2 bottom-2 top-2 flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_25px_90px_rgba(15,23,42,0.35)] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[80vh] sm:w-[min(920px,94vw)] sm:-translate-x-1/2 sm:-translate-y-1/2 dark:border-zinc-700 dark:bg-surface dark:shadow-[0_25px_90px_rgba(0,0,0,0.65)]">
            <header className="flex items-center justify-between gap-3 border-b border-zinc-200 px-3 py-3 sm:px-5 sm:py-4 dark:border-zinc-800">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">Request logs</p>
                <h3 className="mt-1 break-all text-base font-semibold text-zinc-950 dark:text-zinc-100">{ticket.ticketNumber}</h3>
              </div>
              <button
                type="button"
                onClick={() => setLogModalOpen(false)}
                className="rounded-md border border-zinc-300 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Close
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5 sm:py-4">
              <ul className="space-y-3">
                {ticket.activities.map((a) => (
                  <li key={a.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                    <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">{a.summary}</p>
                    {a.detail ? <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{a.detail}</p> : null}
                    <p className="mt-2 text-[11px] uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                      {a.actor} · {a.createdAt.toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
