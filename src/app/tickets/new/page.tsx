"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/field";
import { RequestTypeSelection } from "@/components/tickets/RequestTypeSelection";
import { BRAND_TITLE } from "@/lib/brand";
import { issueConcernIntakeLockMessage } from "@/lib/issue-concern-intake-lock";
import {
  DEFAULT_REQUEST_TYPE,
  isIssueConcernTicket,
  parseRequestTypeId,
  requestTypeLabel,
  type RequestTypeId,
} from "@/lib/request-types";
import {
  DELIVERY_OF_CHECK_ONLINE_DEPOSIT,
  DELIVERY_OF_CHECK_OPTIONS,
  MODE_OF_PAYMENT_CHECK,
  MODE_OF_PAYMENT_OPTIONS,
} from "@/lib/request-for-payment";
import {
  emptyRequisitionLineItem,
  REQUISITION_UNIT_OPTIONS,
  validateItemRequisitionFields,
  type RequisitionLineItem,
} from "@/lib/item-requisition";
import { validateFundTransferRequestFields } from "@/lib/fund-transfer-request";
import {
  JOB_ORDER_NATURE_OPTIONS,
  computeJobOrderDurationDays,
  formatJobOrderDurationLabel,
  validateJobOrderFields,
} from "@/lib/job-order";
import { MAX_SCREENSHOT_BYTES, MAX_SCREENSHOT_COUNT } from "@/lib/ticket-intake-screenshots-constants";
import { isTicketRequestorRole } from "@/lib/ticket-requestor";
import { DatePickerField } from "@/components/ui/DatePickerField";
import { Paperclip, Plus, Trash2 } from "lucide-react";

function pickImageFiles(list: File[]) {
  return list.filter((f) => {
    const t = (f.type || "").toLowerCase();
    if (t.startsWith("image/")) return true;
    return /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(f.name);
  });
}

export default function NewTicketPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-[calc(100vh-56px)] bg-zinc-50 px-3 py-8 text-zinc-900 dark:bg-[#0e0e0d] dark:text-zinc-100">
          <p className="mx-auto max-w-5xl text-sm text-zinc-600 dark:text-zinc-400">Loading request intake…</p>
        </main>
      }
    >
      <NewTicketPageInner />
    </Suspense>
  );
}

function NewTicketPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status: sessionStatus } = useSession();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [modeOfPayment, setModeOfPayment] = useState("");
  const [deliveryOfCheck, setDeliveryOfCheck] = useState("");
  const [draftRequestType, setDraftRequestType] =
    useState<RequestTypeId>(DEFAULT_REQUEST_TYPE);
  const activeRequestType = useMemo(() => {
    const raw = searchParams.get("type");
    return raw ? parseRequestTypeId(raw) : null;
  }, [searchParams]);
  const showTypeSelection = activeRequestType == null;
  const showRequestForm = activeRequestType != null;
  const isPaymentRequest = activeRequestType === "REQUEST_FOR_PAYMENT";
  const isRequisitionRequest = activeRequestType === "ITEM_REQUISITION_SLIP";
  const isFundTransferRequest = activeRequestType === "FUND_TRANSFER_REQUEST";
  const isJobOrderRequest = activeRequestType === "JOB_ORDER";
  const [requisitionItems, setRequisitionItems] = useState<RequisitionLineItem[]>([
    emptyRequisitionLineItem(0),
  ]);
  const [jobOrderNatures, setJobOrderNatures] = useState<string[]>([]);
  const [jobOrderStartDate, setJobOrderStartDate] = useState("");
  const [jobOrderTargetDate, setJobOrderTargetDate] = useState("");
  const [jobOrderExpectedDuration, setJobOrderExpectedDuration] = useState("");

  useEffect(() => {
    if (!isJobOrderRequest) return;
    const days = computeJobOrderDurationDays(jobOrderStartDate, jobOrderTargetDate);
    const label = formatJobOrderDurationLabel(days);
    if (label) setJobOrderExpectedDuration(label);
  }, [isJobOrderRequest, jobOrderStartDate, jobOrderTargetDate]);
  const [purposeOfRequest, setPurposeOfRequest] = useState("");
  const detailsField = useMemo(
    () => ({
      label: "Issue",
      placeholder: "Describe the issue, impact, and any steps already taken.",
    }),
    [],
  );
  const [intake, setIntake] = useState<{
    canCreateIssueConcern: boolean;
    authProvider: string | null;
    pendingConfirmation: { verificationHref: string; ticketNumber: string } | null;
    message: string | null;
  }>({ canCreateIssueConcern: true, authProvider: null, pendingConfirmation: null, message: null });
  /** False until `/api/me/intake-lock` returns (Customer + Personnel as requestor). */
  const [intakeGateReady, setIntakeGateReady] = useState(true);
  const [companyTeams, setCompanyTeams] = useState<{ id: string; name: string }[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [staffDesignatedCompany, setStaffDesignatedCompany] = useState<{ id: string; name: string } | null>(null);
  const [staffDesignatedLoading, setStaffDesignatedLoading] = useState(false);

  const screenshotPreviews = useMemo(
    () =>
      screenshots.map((file, index) => ({
        key: `${index}-${file.name}-${file.size}-${file.lastModified}`,
        name: file.name,
        url: URL.createObjectURL(file),
      })),
    [screenshots],
  );

  useEffect(
    () => () => {
      screenshotPreviews.forEach((s) => URL.revokeObjectURL(s.url));
    },
    [screenshotPreviews],
  );

  useEffect(() => {
    let cancelled = false;
    async function loadIntakeLock() {
      if (sessionStatus !== "authenticated") return;
      const role = session?.user?.role;
      if (!isTicketRequestorRole(role)) {
        setIntakeGateReady(true);
        return;
      }
      setIntakeGateReady(false);
      try {
        const res = await fetch("/api/me/intake-lock", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const j = (await res.json().catch(() => ({}))) as {
          canCreateTickets?: boolean;
          canCreateIssueConcern?: boolean;
          authProvider?: string | null;
          pendingConfirmation?: { verificationHref: string; ticketNumber: string } | null;
          message?: string | null;
        };
        if (cancelled) return;
        const canCreateIssueConcern =
          typeof j.canCreateIssueConcern === "boolean"
            ? j.canCreateIssueConcern
            : Boolean(j.canCreateTickets);
        setIntake({
          canCreateIssueConcern,
          authProvider: typeof j.authProvider === "string" ? j.authProvider : null,
          pendingConfirmation: j.pendingConfirmation ?? null,
          message:
            typeof j.message === "string" && j.message.trim()
              ? j.message
              : canCreateIssueConcern
                ? null
                : issueConcernIntakeLockMessage(j.pendingConfirmation?.ticketNumber),
        });
      } finally {
        if (!cancelled) setIntakeGateReady(true);
      }
    }
    void loadIntakeLock();
    return () => {
      cancelled = true;
    };
  }, [sessionStatus, session?.user?.role]);

  useEffect(() => {
    let cancelled = false;
    async function loadCompanies() {
      if (sessionStatus !== "authenticated") return;
      setCompaniesLoading(true);
      const res = await fetch("/api/public/companies", { cache: "no-store" });
      setCompaniesLoading(false);
      if (!res.ok || cancelled) return;
      const list = (await res.json().catch(() => [])) as { id: string; name: string }[];
      if (cancelled || !Array.isArray(list)) return;
      setCompanyTeams(list);
    }
    void loadCompanies();
    return () => {
      cancelled = true;
    };
  }, [sessionStatus, session?.user?.role]);

  useEffect(() => {
    let cancelled = false;
    async function loadStaffDesignatedCompany() {
      if (sessionStatus !== "authenticated") return;
      if (session?.user?.role === "Customer") return;
      setStaffDesignatedLoading(true);
      try {
        const res = await fetch("/api/me/staff-designated-company", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const j = (await res.json().catch(() => ({}))) as {
          designatedCompanyTeamId?: string | null;
          designatedCompanyName?: string | null;
        };
        const id = typeof j.designatedCompanyTeamId === "string" ? j.designatedCompanyTeamId.trim() : null;
        const name = typeof j.designatedCompanyName === "string" ? j.designatedCompanyName.trim() : null;
        setStaffDesignatedCompany(
          id ? { id, name: name || id } : null,
        );
      } finally {
        setStaffDesignatedLoading(false);
      }
    }
    void loadStaffDesignatedCompany();
    return () => {
      cancelled = true;
    };
  }, [sessionStatus, session?.user?.role, session?.user?.email]);

  const isCustomer = session?.user?.role === "Customer";
  const isPersonnelIntake = session?.user?.role === "Personnel";
  const isAdminStaffIntake =
    session?.user?.role === "SuperAdmin" || session?.user?.role === "Admin";
  /** Admin/SuperAdmin use the same intake field layout as Personnel. */
  const isStaffRequestorIntake = isPersonnelIntake || isAdminStaffIntake;
  const isRequestorIntakeLockRole = isTicketRequestorRole(session?.user?.role);
  /** Issue/Concern only — other request types stay creatable. */
  const issueConcernLocked =
    isRequestorIntakeLockRole && intakeGateReady && !intake.canCreateIssueConcern;
  const issueConcernSubmitLocked =
    isIssueConcernTicket(activeRequestType) &&
    isRequestorIntakeLockRole &&
    (!intakeGateReady || !intake.canCreateIssueConcern);
  const myTicketsHref = isCustomer ? "/my-tickets" : "/my-requests";

  useEffect(() => {
    if (!issueConcernLocked) return;
    if (!isIssueConcernTicket(activeRequestType)) return;
    setError(
      intake.message ??
        issueConcernIntakeLockMessage(intake.pendingConfirmation?.ticketNumber),
    );
    router.replace("/tickets/new");
  }, [
    issueConcernLocked,
    activeRequestType,
    intake.message,
    intake.pendingConfirmation?.ticketNumber,
    router,
  ]);

  const portalCustomer = (session?.user ?? {}) as {
    companyName?: string | null;
    customerOrgRole?: string | null;
    companyId?: string | null;
  };
  const googleOAuthCustomer =
    Boolean(isCustomer) &&
    typeof session?.user?.authProvider === "string" &&
    session.user.authProvider.trim().toLowerCase() === "google";

  function goToRequestType(id: RequestTypeId) {
    if (isIssueConcernTicket(id) && issueConcernLocked) {
      setError(
        intake.message ??
          issueConcernIntakeLockMessage(intake.pendingConfirmation?.ticketNumber),
      );
      return;
    }
    setError(null);
    setModeOfPayment("");
    setDeliveryOfCheck("");
    setRequisitionItems([emptyRequisitionLineItem(0)]);
    setPurposeOfRequest("");
    setScreenshots([]);
    router.push(`/tickets/new?type=${encodeURIComponent(id)}`);
  }

  function goToTypeSelection() {
    setError(null);
    router.push("/tickets/new");
  }

  async function redirectAfterCreate() {
    const role = session?.user?.role;
    if (role === "Customer") {
      router.push("/my-tickets?submitted=1");
    } else if (isTicketRequestorRole(role)) {
      router.push("/my-requests?submitted=1");
    } else {
      router.push("/");
    }
  }

  /** Send-to roster: Admin/SuperAdmin see full company list; Personnel use public roster. */
  const sendRequestToOptions = useMemo(() => {
    if (!isStaffRequestorIntake) return [];
    const teams = [...companyTeams];
    if (
      isAdminStaffIntake &&
      staffDesignatedCompany &&
      !teams.some((t) => t.id === staffDesignatedCompany.id)
    ) {
      return [{ id: staffDesignatedCompany.id, name: staffDesignatedCompany.name }, ...teams];
    }
    return teams;
  }, [isStaffRequestorIntake, isAdminStaffIntake, companyTeams, staffDesignatedCompany]);

  const mergeScreenshotFiles = useCallback((picked: File[]) => {
    setScreenshots((prev) => {
      const next = [...prev];
      for (const f of picked) {
        const dup = next.some(
          (p) => p.name === f.name && p.size === f.size && p.lastModified === f.lastModified,
        );
        if (!dup) next.push(f);
      }
      return next.slice(0, MAX_SCREENSHOT_COUNT);
    });
  }, []);

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items?.length) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind !== "file") continue;
        const f = item.getAsFile();
        if (f) files.push(f);
      }
      const images = pickImageFiles(files);
      if (images.length === 0) return;
      e.preventDefault();
      mergeScreenshotFiles(images);
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [mergeScreenshotFiles]);

  function renderOptionalFieldAttachments(inputId: string) {
    return (
      <div className="mt-2 space-y-2">
        <input
          ref={fileInputRef}
          id={inputId}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            mergeScreenshotFiles(pickImageFiles(Array.from(e.target.files ?? [])));
            e.target.value = "";
          }}
          className="sr-only"
          aria-label="Attach screenshots or images"
        />
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor={inputId}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-800 shadow-sm transition hover:border-orange-500/60 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <Paperclip className="size-3.5 shrink-0" aria-hidden />
            {screenshots.length === 0 ? "Attach screenshots / files" : "Add more attachments"}
          </label>
          {screenshots.length > 0 ? (
            <button
              type="button"
              onClick={() => setScreenshots([])}
              className="rounded-md border border-zinc-300 bg-transparent px-2.5 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Remove all
            </button>
          ) : null}
          <span className="text-[11px] text-zinc-500 dark:text-zinc-500">
            Optional · up to {MAX_SCREENSHOT_COUNT} images, 5MB each
            {screenshots.length > 0
              ? ` · ${screenshots.length} attached`
              : ""}
          </span>
        </div>
        {screenshotPreviews.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {screenshotPreviews.map((s, index) => (
              <div
                key={s.key}
                className="rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <div className="relative h-16 w-full overflow-hidden rounded">
                  <Image
                    src={s.url}
                    alt={s.name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, 33vw"
                    unoptimized
                  />
                </div>
                <div className="mt-1 flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-[11px] text-zinc-400">{s.name}</p>
                  <button
                    type="button"
                    onClick={() => setScreenshots((prev) => prev.filter((_, i) => i !== index))}
                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 hover:underline dark:text-orange-400"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (issueConcernSubmitLocked) {
      if (issueConcernLocked) {
        setError(
          intake.message ??
            issueConcernIntakeLockMessage(intake.pendingConfirmation?.ticketNumber),
        );
      } else {
        setError("Checking whether you can open a new Issue/Concern ticket… try again in a moment.");
      }
      return;
    }
    if (screenshots.length > MAX_SCREENSHOT_COUNT) {
      setError(`You can attach at most ${MAX_SCREENSHOT_COUNT} screenshots.`);
      return;
    }
    for (const f of screenshots) {
      if (f.size > MAX_SCREENSHOT_BYTES) {
        setError("Each screenshot must be at most 5MB.");
        return;
      }
    }

    setLoading(true);
    try {
      const form = new FormData(e.currentTarget);
      const issue = String(form.get("issue") || "");
      const payee = String(form.get("payee") || "").trim();
      const inPaymentOf = String(form.get("inPaymentOf") || "").trim();
      const accountTitle = String(form.get("accountTitle") || "").trim();
      const amount = String(form.get("amount") || "").trim();
      const modeOfPaymentValue = String(form.get("modeOfPayment") || "").trim();
      const deliveryOfCheckValue = String(form.get("deliveryOfCheck") || "").trim();
      const bankNameAccountNumber = String(form.get("bankNameAccountNumber") || "").trim();
      const fundTransferAmount = String(form.get("fundTransferAmount") || "").trim();
      const requestingDepartmentBusinessUnit = String(
        form.get("requestingDepartmentBusinessUnit") || "",
      ).trim();
      const fromAccountName = String(form.get("fromAccountName") || "").trim();
      const fromAccountNumber = String(form.get("fromAccountNumber") || "").trim();
      const toAccountName = String(form.get("toAccountName") || "").trim();
      const toAccountNumber = String(form.get("toAccountNumber") || "").trim();
      const bankName = String(form.get("bankName") || "").trim();
      const bankAddress = String(form.get("bankAddress") || "").trim();

      if (isPaymentRequest) {
        if (!payee || !inPaymentOf || !accountTitle || !amount || !modeOfPaymentValue) {
          setError("Payee, In payment of, Account title, Amount, and Mode of payment are required.");
          setLoading(false);
          return;
        }
        if (modeOfPaymentValue === MODE_OF_PAYMENT_CHECK && !deliveryOfCheckValue) {
          setError("Delivery of check is required when Mode of payment is Check.");
          setLoading(false);
          return;
        }
        if (
          modeOfPaymentValue === MODE_OF_PAYMENT_CHECK &&
          deliveryOfCheckValue === DELIVERY_OF_CHECK_ONLINE_DEPOSIT &&
          !bankNameAccountNumber
        ) {
          setError("Bank name / account number is required for Online Deposit.");
          setLoading(false);
          return;
        }
      } else if (isRequisitionRequest) {
        const requisitionCheck = validateItemRequisitionFields({
          items: requisitionItems,
          purposeOfRequest,
        });
        if (!requisitionCheck.ok) {
          setError(requisitionCheck.error);
          setLoading(false);
          return;
        }
      } else if (isFundTransferRequest) {
        const fundCheck = validateFundTransferRequestFields({
          requestingDepartmentBusinessUnit,
          fundTransferAmount,
          fromAccountName,
          fromAccountNumber,
          toAccountName,
          toAccountNumber,
          bankName,
          bankAddress,
          reason: issue,
        });
        if (!fundCheck.ok) {
          setError(fundCheck.error);
          setLoading(false);
          return;
        }
      } else if (isJobOrderRequest) {
        const building = String(form.get("building") || "").trim();
        const jobCheck = validateJobOrderFields({
          natureOfConcern: jobOrderNatures,
          building,
          startDate: jobOrderStartDate,
          targetDate: jobOrderTargetDate,
          expectedDuration: jobOrderExpectedDuration,
          notes: issue,
        });
        if (!jobCheck.ok) {
          setError(jobCheck.error);
          setLoading(false);
          return;
        }
      } else if (!issue.trim()) {
        setError("Please describe the request.");
        setLoading(false);
        return;
      }

      const appendPaymentFields = (target: FormData | Record<string, unknown>) => {
        if (!isPaymentRequest) return;
        if (target instanceof FormData) {
          target.append("payee", payee);
          target.append("inPaymentOf", inPaymentOf);
          target.append("accountTitle", accountTitle);
          target.append("amount", amount);
          target.append("modeOfPayment", modeOfPaymentValue);
          if (deliveryOfCheckValue) target.append("deliveryOfCheck", deliveryOfCheckValue);
          if (bankNameAccountNumber) target.append("bankNameAccountNumber", bankNameAccountNumber);
        } else {
          target.payee = payee;
          target.inPaymentOf = inPaymentOf;
          target.accountTitle = accountTitle;
          target.amount = amount;
          target.modeOfPayment = modeOfPaymentValue;
          if (deliveryOfCheckValue) target.deliveryOfCheck = deliveryOfCheckValue;
          if (bankNameAccountNumber) target.bankNameAccountNumber = bankNameAccountNumber;
        }
      };

      const appendRequisitionFields = (target: FormData | Record<string, unknown>) => {
        if (!isRequisitionRequest) return;
        const itemsJson = JSON.stringify(requisitionItems);
        if (target instanceof FormData) {
          target.append("requisitionItems", itemsJson);
          target.append("purposeOfRequest", purposeOfRequest.trim());
          target.append("issue", purposeOfRequest.trim());
        } else {
          target.requisitionItems = requisitionItems;
          target.purposeOfRequest = purposeOfRequest.trim();
          target.issue = purposeOfRequest.trim();
        }
      };

      const appendFundTransferFields = (target: FormData | Record<string, unknown>) => {
        if (!isFundTransferRequest) return;
        if (target instanceof FormData) {
          target.append("requestingDepartmentBusinessUnit", requestingDepartmentBusinessUnit);
          target.append("fundTransferAmount", fundTransferAmount);
          target.append("fromAccountName", fromAccountName);
          target.append("fromAccountNumber", fromAccountNumber);
          target.append("toAccountName", toAccountName);
          target.append("toAccountNumber", toAccountNumber);
          target.append("bankName", bankName);
          target.append("bankAddress", bankAddress);
        } else {
          target.requestingDepartmentBusinessUnit = requestingDepartmentBusinessUnit;
          target.fundTransferAmount = fundTransferAmount;
          target.fromAccountName = fromAccountName;
          target.fromAccountNumber = fromAccountNumber;
          target.toAccountName = toAccountName;
          target.toAccountNumber = toAccountNumber;
          target.bankName = bankName;
          target.bankAddress = bankAddress;
        }
      };

      const appendJobOrderFields = (target: FormData | Record<string, unknown>) => {
        if (!isJobOrderRequest) return;
        const building = String(form.get("building") || "").trim();
        const naturesJson = JSON.stringify(jobOrderNatures);
        if (target instanceof FormData) {
          target.append("natureOfConcern", naturesJson);
          target.append("building", building);
          target.append("startDate", jobOrderStartDate);
          target.append("targetDate", jobOrderTargetDate);
          target.append("expectedDuration", jobOrderExpectedDuration.trim());
        } else {
          target.natureOfConcern = jobOrderNatures;
          target.building = building;
          target.startDate = jobOrderStartDate;
          target.targetDate = jobOrderTargetDate;
          target.expectedDuration = jobOrderExpectedDuration.trim();
        }
      };

      let res: Response;
      if (screenshots.length > 0) {
        const fd = new FormData();
        if (!isRequisitionRequest) {
          fd.append("issue", issue);
        }
        fd.append("requestType", activeRequestType ?? DEFAULT_REQUEST_TYPE);
        appendPaymentFields(fd);
        appendRequisitionFields(fd);
        appendFundTransferFields(fd);
        appendJobOrderFields(fd);
        if (isCustomer) {
          fd.append("requestToCompanySbu", String(form.get("requestToCompanySbu") || "").trim());
          fd.append("branch", String(form.get("branch") || "").trim());
          fd.append(
            "department",
            isFundTransferRequest
              ? requestingDepartmentBusinessUnit
              : String(form.get("department") || "").trim(),
          );
          fd.append("assignedCompanyText", String(form.get("assignedCompanyText") || "").trim());
          if (googleOAuthCustomer) {
            fd.append("customerOrgRole", String(form.get("customerOrgRole") || "").trim() || "Personnel");
          }
        } else if (isStaffRequestorIntake) {
          fd.append("contactName", String(form.get("contactName") || "").trim());
          fd.append("contactEmail", String(form.get("contactEmail") || "").trim());
          fd.append("companyTeamId", String(form.get("companyTeamId") || "").trim());
          fd.append("branch", String(form.get("branch") || "").trim());
          fd.append(
            "department",
            isFundTransferRequest
              ? requestingDepartmentBusinessUnit
              : String(form.get("department") || "").trim(),
          );
        } else {
          fd.append("companyTeamId", String(form.get("companyTeamId") || ""));
          fd.append("contactName", String(form.get("contactName") || "").trim());
          fd.append("contactEmail", String(form.get("contactEmail") || "").trim());
        }
        for (const f of screenshots) {
          fd.append("screenshots", f);
        }
        res = await fetch("/api/tickets", {
          method: "POST",
          body: fd,
        });
      } else {
        const payload: Record<string, unknown> = {
          issue,
          requestType: activeRequestType ?? DEFAULT_REQUEST_TYPE,
        };
        appendPaymentFields(payload);
        appendRequisitionFields(payload);
        appendFundTransferFields(payload);
        appendJobOrderFields(payload);
        if (isCustomer) {
          payload.requestToCompanySbu = String(form.get("requestToCompanySbu") || "").trim();
          payload.branch = String(form.get("branch") || "").trim();
          payload.department = isFundTransferRequest
            ? requestingDepartmentBusinessUnit
            : String(form.get("department") || "").trim();
          payload.assignedCompanyText = String(form.get("assignedCompanyText") || "").trim();
          if (googleOAuthCustomer) {
            payload.customerOrgRole = String(form.get("customerOrgRole") || "").trim() || "Personnel";
          }
        } else if (isStaffRequestorIntake) {
          payload.contactName = String(form.get("contactName") || "").trim();
          payload.contactEmail = String(form.get("contactEmail") || "").trim();
          payload.companyTeamId = String(form.get("companyTeamId") || "").trim();
          payload.branch = String(form.get("branch") || "").trim();
          payload.department = isFundTransferRequest
            ? requestingDepartmentBusinessUnit
            : String(form.get("department") || "").trim();
        } else {
          payload.companyTeamId = String(form.get("companyTeamId") || "");
          payload.contactName = String(form.get("contactName") || "").trim();
          payload.contactEmail = String(form.get("contactEmail") || "").trim();
        }
        res = await fetch("/api/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          res.status === 409 && typeof data.error === "string"
            ? data.error
            : data.error ?? "Could not create ticket.",
        );
        return;
      }
      await res.json();
      await redirectAfterCreate();
    } catch {
      setError("Could not create ticket.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-56px)] bg-zinc-50 text-zinc-900 dark:bg-[#0e0e0d] dark:text-zinc-100">
      <div className="mx-auto max-w-5xl px-3 py-4 sm:px-4">
        <div className="mb-4 rounded-md border border-zinc-200 bg-white p-4 shadow-[0_14px_28px_rgba(0,0,0,0.06)] dark:border-zinc-700/80 dark:bg-[#10100f] dark:shadow-[0_14px_28px_rgba(0,0,0,0.24)]">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-orange-400">
            {BRAND_TITLE} · Request intake
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-100">
            {showTypeSelection ? "Choose request type" : "Submit a request"}
          </h1>
          {!showTypeSelection && activeRequestType ? (
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Type:{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-200">
                {requestTypeLabel(activeRequestType)}
              </span>
              {" · "}
              <button
                type="button"
                onClick={goToTypeSelection}
                className="font-semibold text-orange-700 underline-offset-2 hover:underline dark:text-orange-300"
              >
                Change type
              </button>
            </p>
          ) : null}
        </div>

        {isRequestorIntakeLockRole && !intakeGateReady ? (
          <div className="mb-4 rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 dark:border-zinc-700/80 dark:bg-[#10100f] dark:text-zinc-300">
            Checking whether you already have an Issue/Concern ticket in progress…
          </div>
        ) : null}

        {issueConcernLocked && intake.pendingConfirmation ? (
          <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
            <p className="font-semibold">
              Issue/Concern locked — ticket {intake.pendingConfirmation.ticketNumber}
            </p>
            <p className="mt-1 text-xs text-amber-900/90 dark:text-amber-200/90">
              {intake.message ??
                issueConcernIntakeLockMessage(intake.pendingConfirmation.ticketNumber)}
            </p>
            <Link
              href={intake.pendingConfirmation.verificationHref}
              className="mt-3 inline-flex text-sm font-semibold text-orange-700 underline-offset-4 hover:underline dark:text-orange-300"
            >
              {intake.pendingConfirmation.verificationHref.includes("/verification")
                ? "Go to confirmation"
                : "Open ticket"}
            </Link>
          </div>
        ) : issueConcernLocked ? (
          <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
            <p className="font-semibold">Issue/Concern tickets are temporarily locked</p>
            <p className="mt-1 text-xs text-amber-900/90 dark:text-amber-200/90">
              {intake.message ?? issueConcernIntakeLockMessage()}
            </p>
            <Link
              href={myTicketsHref}
              className="mt-3 inline-flex text-sm font-semibold text-orange-700 underline-offset-4 hover:underline dark:text-orange-300"
            >
              {isPersonnelIntake ? "Open my ticket dashboard" : "Open my tickets"}
            </Link>
          </div>
        ) : null}

        <Card className="rounded-md border-zinc-200 bg-white p-4 shadow-[0_14px_28px_rgba(0,0,0,0.06)] dark:border-zinc-700/80 dark:bg-[#10100f] dark:shadow-[0_14px_28px_rgba(0,0,0,0.24)] sm:p-5">
          {showTypeSelection ? (
            <RequestTypeSelection
              value={draftRequestType}
              onChange={setDraftRequestType}
              onContinue={goToRequestType}
              disabled={!intakeGateReady && isRequestorIntakeLockRole}
              disabledTypeIds={issueConcernLocked ? (["ISSUE_CONCERN_TICKET"] as const) : []}
              disabledTypeHint={
                issueConcernLocked
                  ? (intake.message ?? issueConcernIntakeLockMessage(intake.pendingConfirmation?.ticketNumber))
                  : null
              }
            />
          ) : showRequestForm && activeRequestType ? (
          <form onSubmit={onSubmit} className="space-y-4">
            <input type="hidden" name="requestType" value={activeRequestType ?? DEFAULT_REQUEST_TYPE} />
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950/40">
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Step 2 · {requestTypeLabel(activeRequestType)}
              </p>
              <button
                type="button"
                onClick={goToTypeSelection}
                className="text-xs font-semibold text-orange-700 hover:underline dark:text-orange-300"
              >
                Back to type selection
              </button>
            </div>
            {isStaffRequestorIntake ? (
              <>
                <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  {isFundTransferRequest ? "Prepared By" : "Requestor"}
                  <Input
                    name="contactName"
                    required
                    maxLength={200}
                    defaultValue={
                      session?.user?.name?.trim() ||
                      (session?.user?.email?.includes("@") ? session.user.email.split("@")[0] : "") ||
                      ""
                    }
                    autoComplete="name"
                    className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>
                <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Email
                  <Input
                    type="email"
                    name="contactEmail"
                    required
                    defaultValue={session?.user?.email?.trim() ?? ""}
                    autoComplete="email"
                    className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <span className="flex h-5 items-center text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      Company
                    </span>
                    <div className="box-border flex h-10 w-full items-center truncate rounded-lg border border-zinc-300 bg-zinc-50 px-3 text-sm leading-none text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-100">
                      {staffDesignatedLoading
                        ? "Loading…"
                        : staffDesignatedCompany?.name?.trim() || "Not yet assigned"}
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-col gap-1.5">
                    <label
                      htmlFor="intake-branch"
                      className="flex h-5 items-center text-sm font-medium text-zinc-800 dark:text-zinc-200"
                    >
                      Branch{" "}
                      <span className="ml-1 font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
                    </label>
                    <input
                      id="intake-branch"
                      name="branch"
                      maxLength={120}
                      placeholder="e.g. Main Office, Cebu Branch"
                      className="box-border h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm leading-none text-zinc-900 outline-none ring-orange-500/40 placeholder:text-zinc-500 focus:border-orange-500 focus:ring dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <label
                      htmlFor="intake-send-request-to"
                      className="flex h-5 items-center text-sm font-medium text-zinc-800 dark:text-zinc-200"
                    >
                      Send request to:
                    </label>
                    <select
                      id="intake-send-request-to"
                      name="companyTeamId"
                      required
                      disabled={companiesLoading}
                      className="box-border h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm leading-none text-zinc-900 outline-none ring-orange-500/40 focus:border-orange-500 focus:ring disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    >
                      <option value="">
                        {companiesLoading ? "Loading companies..." : "Select a company/SBU"}
                      </option>
                      {sendRequestToOptions.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                          {staffDesignatedCompany?.id === team.id ? " · designated" : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex min-w-0 flex-col gap-1.5">
                    <label
                      htmlFor={isFundTransferRequest ? "intake-requesting-department" : "intake-department"}
                      className="flex h-5 items-center text-sm font-medium text-zinc-800 dark:text-zinc-200"
                    >
                      {isFundTransferRequest
                        ? "Requesting department/business unit"
                        : "Department"}
                    </label>
                    <input
                      id={isFundTransferRequest ? "intake-requesting-department" : "intake-department"}
                      name={
                        isFundTransferRequest
                          ? "requestingDepartmentBusinessUnit"
                          : "department"
                      }
                      required={isFundTransferRequest}
                      maxLength={isFundTransferRequest ? 200 : 120}
                      placeholder="e.g. IT, Finance, Operations"
                      className="box-border h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm leading-none text-zinc-900 outline-none ring-orange-500/40 placeholder:text-zinc-500 focus:border-orange-500 focus:ring dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {isFundTransferRequest ? "Prepared By" : "Requestor"}
                  </span>
                  <div className="mt-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-100">
                    {session?.user?.name?.trim() ||
                      (session?.user?.email?.includes("@") ? session.user.email.split("@")[0] : null) ||
                      "—"}
                  </div>
                </div>
                <div>
                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Email</span>
                  <div className="mt-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-100">
                    {session?.user?.email?.trim() || "—"}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <label
                      htmlFor="intake-assigned-company"
                      className="flex h-5 items-center text-sm font-medium text-zinc-800 dark:text-zinc-200"
                    >
                      Assigned Company
                    </label>
                    <input
                      id="intake-assigned-company"
                      name="assignedCompanyText"
                      required
                      maxLength={500}
                      autoComplete="organization"
                      defaultValue={portalCustomer?.companyName?.trim() ?? ""}
                      placeholder="Type your company / SBU (e.g. AGC, ALI, MCHISI)"
                      className="box-border h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm leading-none text-zinc-900 outline-none ring-orange-500/40 placeholder:text-zinc-500 focus:border-orange-500 focus:ring dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </div>

                  <div className="flex min-w-0 flex-col gap-1.5">
                    <label
                      htmlFor="intake-customer-branch"
                      className="flex h-5 items-center text-sm font-medium text-zinc-800 dark:text-zinc-200"
                    >
                      Branch{" "}
                      <span className="ml-1 font-normal text-zinc-500 dark:text-zinc-400">
                        (optional — outside clients)
                      </span>
                    </label>
                    <input
                      id="intake-customer-branch"
                      name="branch"
                      maxLength={120}
                      placeholder="Optional"
                      className="box-border h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm leading-none text-zinc-900 outline-none ring-orange-500/40 placeholder:text-zinc-500 focus:border-orange-500 focus:ring dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </div>
                </div>
                <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                  Use a roster SBU name when you can (e.g. AGC, ALI). If it does not match, your request still
                  registers and is triaged under <strong className="font-medium text-zinc-600 dark:text-zinc-300">OUTSIDE COMPANY</strong> on the company board. Your profile company is updated when you submit.
                </p>
                {googleOAuthCustomer ? (
                  <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    Your role in your organization
                    <Input
                      name="customerOrgRole"
                      maxLength={120}
                      autoComplete="organization-title"
                      placeholder="e.g. Operations lead, Analyst"
                      defaultValue={portalCustomer?.customerOrgRole?.trim() || "Personnel"}
                      className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </label>
                ) : null}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-start">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <label
                      htmlFor="intake-customer-send-to"
                      className="flex h-5 items-center text-sm font-medium text-zinc-800 dark:text-zinc-200"
                    >
                      Send request to:
                    </label>
                    <textarea
                      id="intake-customer-send-to"
                      name="requestToCompanySbu"
                      required
                      rows={2}
                      placeholder="Type the company or SBU you are requesting (e.g. AGC, ALI, or IT support)."
                      className="box-border min-h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-orange-500/40 placeholder:text-zinc-500 focus:border-orange-500 focus:ring dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </div>

                  <div className="flex min-w-0 flex-col gap-1.5">
                    <label
                      htmlFor={
                        isFundTransferRequest
                          ? "intake-customer-requesting-department"
                          : "intake-customer-department"
                      }
                      className="flex h-5 items-center text-sm font-medium text-zinc-800 dark:text-zinc-200"
                    >
                      {isFundTransferRequest
                        ? "Requesting department/business unit"
                        : "Department"}
                    </label>
                    <input
                      id={
                        isFundTransferRequest
                          ? "intake-customer-requesting-department"
                          : "intake-customer-department"
                      }
                      name={
                        isFundTransferRequest
                          ? "requestingDepartmentBusinessUnit"
                          : "department"
                      }
                      required={isFundTransferRequest}
                      maxLength={isFundTransferRequest ? 200 : 120}
                      placeholder="e.g. IT, Finance, Operations"
                      className="box-border h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm leading-none text-zinc-900 outline-none ring-orange-500/40 placeholder:text-zinc-500 focus:border-orange-500 focus:ring dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </div>
                </div>
              </>
            )}

            {isPaymentRequest ? (
              <div className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-700 dark:bg-zinc-950/30 sm:p-4">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Payment details</p>

                <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Payee
                  <Input
                    name="payee"
                    required
                    maxLength={200}
                    placeholder="Name of payee"
                    className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>

                <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  In payment of:
                  <Textarea
                    name="inPaymentOf"
                    required
                    rows={3}
                    placeholder="Purpose or description of what this payment is for"
                    className="mt-1.5 border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    Account title
                    <Input
                      name="accountTitle"
                      required
                      maxLength={200}
                      placeholder="Account / expense title"
                      className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </label>
                  <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    Amount
                    <Input
                      name="amount"
                      required
                      maxLength={80}
                      placeholder="e.g. ₱1,500.00"
                      className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </label>
                </div>

                <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Mode of payment:
                  <Select
                    name="modeOfPayment"
                    required
                    value={modeOfPayment}
                    onChange={(e) => {
                      const next = e.target.value;
                      setModeOfPayment(next);
                      if (next !== MODE_OF_PAYMENT_CHECK) {
                        setDeliveryOfCheck("");
                      }
                    }}
                    className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    <option value="">Select mode of payment</option>
                    {MODE_OF_PAYMENT_OPTIONS.map((mode) => (
                      <option key={mode} value={mode}>
                        {mode}
                      </option>
                    ))}
                  </Select>
                </label>

                {modeOfPayment === MODE_OF_PAYMENT_CHECK ? (
                  <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    Delivery of check
                    <Select
                      name="deliveryOfCheck"
                      required
                      value={deliveryOfCheck}
                      onChange={(e) => setDeliveryOfCheck(e.target.value)}
                      className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    >
                      <option value="">Select delivery of check</option>
                      {DELIVERY_OF_CHECK_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </Select>
                  </label>
                ) : null}

                {modeOfPayment === MODE_OF_PAYMENT_CHECK &&
                deliveryOfCheck === DELIVERY_OF_CHECK_ONLINE_DEPOSIT ? (
                  <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    Bank name / account number
                    <Input
                      name="bankNameAccountNumber"
                      required
                      maxLength={200}
                      placeholder="e.g. BDO · 0012-3456-7890"
                      className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </label>
                ) : null}

                <div>
                  <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    Additional notes{" "}
                    <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
                    <Textarea
                      name="issue"
                      rows={3}
                      placeholder="Any other context for this payment request"
                      className="mt-1.5 border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </label>
                  {renderOptionalFieldAttachments("ticket-screenshots-payment")}
                </div>
              </div>
            ) : isRequisitionRequest ? (
              <div className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-700 dark:bg-zinc-950/30 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Requisition details</p>
                  <button
                    type="button"
                    onClick={() =>
                      setRequisitionItems((prev) => [...prev, emptyRequisitionLineItem(prev.length)])
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-orange-500/40 bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-500"
                  >
                    <Plus className="size-3.5" aria-hidden />
                    Add item
                  </button>
                </div>

                <div className="space-y-3">
                  {requisitionItems.map((item, index) => (
                    <div
                      key={`req-item-${index}`}
                      className="space-y-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950/50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                          Line item {index + 1}
                        </p>
                        {requisitionItems.length > 1 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setRequisitionItems((prev) => prev.filter((_, i) => i !== index))
                            }
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                            aria-label={`Remove line item ${index + 1}`}
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                            Remove
                          </button>
                        ) : null}
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                          ITEM #
                          <Input
                            required
                            maxLength={80}
                            value={item.itemNumber}
                            onChange={(e) =>
                              setRequisitionItems((prev) =>
                                prev.map((row, i) =>
                                  i === index ? { ...row, itemNumber: e.target.value } : row,
                                ),
                              )
                            }
                            placeholder={String(index + 1)}
                            className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                          />
                        </label>
                        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                          QUANTITY
                          <Input
                            type="number"
                            required
                            min={0}
                            step="any"
                            value={item.quantity}
                            onChange={(e) =>
                              setRequisitionItems((prev) =>
                                prev.map((row, i) =>
                                  i === index ? { ...row, quantity: e.target.value } : row,
                                ),
                              )
                            }
                            placeholder="e.g. 10"
                            className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                          />
                        </label>
                        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                          UNIT
                          <Select
                            required
                            value={item.unit}
                            onChange={(e) =>
                              setRequisitionItems((prev) =>
                                prev.map((row, i) =>
                                  i === index ? { ...row, unit: e.target.value } : row,
                                ),
                              )
                            }
                            className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                          >
                            {REQUISITION_UNIT_OPTIONS.map((unit) => (
                              <option key={unit} value={unit}>
                                {unit}
                              </option>
                            ))}
                          </Select>
                        </label>
                      </div>

                      <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        PARTICULAR / MATERIAL / SPECIFICATION
                        <Textarea
                          required
                          rows={2}
                          value={item.particular}
                          onChange={(e) =>
                            setRequisitionItems((prev) =>
                              prev.map((row, i) =>
                                i === index ? { ...row, particular: e.target.value } : row,
                              ),
                            )
                          }
                          placeholder="Describe the item, material, or specification"
                          className="mt-1.5 border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                        />
                      </label>
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    PURPOSE OF REQUEST
                    <Textarea
                      required
                      rows={4}
                      value={purposeOfRequest}
                      onChange={(e) => setPurposeOfRequest(e.target.value)}
                      placeholder="Explain why these items are needed"
                      className="mt-1.5 border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </label>
                  {renderOptionalFieldAttachments("ticket-screenshots-requisition")}
                </div>
              </div>
            ) : isFundTransferRequest ? (
              <div className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-700 dark:bg-zinc-950/30 sm:p-4">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Fund transfer details
                </p>

                <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Fund transfer amount
                  <Input
                    name="fundTransferAmount"
                    required
                    inputMode="decimal"
                    maxLength={80}
                    placeholder="e.g. 15000.00"
                    className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>

                <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950/50">
                  <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    From
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      Account name
                      <Input
                        name="fromAccountName"
                        required
                        maxLength={200}
                        placeholder="Source account name"
                        className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                      />
                    </label>
                    <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      Account number
                      <Input
                        name="fromAccountNumber"
                        required
                        maxLength={80}
                        placeholder="Source account number"
                        className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                      />
                    </label>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950/50">
                  <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    To
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      Account name
                      <Input
                        name="toAccountName"
                        required
                        maxLength={200}
                        placeholder="Destination account name"
                        className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                      />
                    </label>
                    <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      Account number
                      <Input
                        name="toAccountNumber"
                        required
                        maxLength={80}
                        placeholder="Destination account number"
                        className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                      />
                    </label>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950/50">
                  <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Bank detail
                  </p>
                  <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    Bank name
                    <Input
                      name="bankName"
                      required
                      maxLength={200}
                      placeholder="e.g. BDO, BPI, Metrobank"
                      className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </label>
                  <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    Bank address
                    <Textarea
                      name="bankAddress"
                      required
                      rows={2}
                      placeholder="Bank branch / address"
                      className="mt-1.5 border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    Reason for the transfer / special instruction{" "}
                    <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
                    <Textarea
                      name="issue"
                      rows={4}
                      placeholder="Reason for transfer or any special instructions"
                      className="mt-1.5 border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </label>
                  {renderOptionalFieldAttachments("ticket-screenshots-fund-transfer")}
                </div>
              </div>
            ) : isJobOrderRequest ? (
              <div className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-700 dark:bg-zinc-950/30 sm:p-4">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Project / task information
                </p>

                <fieldset>
                  <legend className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    Nature of Concern
                  </legend>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Select all that apply.
                  </p>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {JOB_ORDER_NATURE_OPTIONS.map((option) => {
                      const checked = jobOrderNatures.includes(option);
                      return (
                        <label
                          key={option}
                          className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setJobOrderNatures((prev) =>
                                checked ? prev.filter((v) => v !== option) : [...prev, option],
                              );
                            }}
                            className="size-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500/30 dark:border-zinc-600"
                          />
                          {option}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Building
                  <Input
                    name="building"
                    required
                    maxLength={200}
                    placeholder="Building / location"
                    className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    Start Date
                    <DatePickerField
                      name="startDate"
                      required
                      value={jobOrderStartDate}
                      max={jobOrderTargetDate || undefined}
                      onChange={(e) => setJobOrderStartDate(e.target.value)}
                      wrapperClassName="mt-1.5"
                    />
                  </label>
                  <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    Target Date
                    <DatePickerField
                      name="targetDate"
                      required
                      value={jobOrderTargetDate}
                      min={jobOrderStartDate || undefined}
                      onChange={(e) => setJobOrderTargetDate(e.target.value)}
                      wrapperClassName="mt-1.5"
                    />
                  </label>
                </div>

                <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Expected Duration
                  <Input
                    name="expectedDuration"
                    required
                    maxLength={80}
                    value={jobOrderExpectedDuration}
                    onChange={(e) => setJobOrderExpectedDuration(e.target.value)}
                    placeholder="Auto-filled from dates (editable)"
                    className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                  <span className="mt-1 block text-xs font-normal text-zinc-500 dark:text-zinc-400">
                    Calculated from Start and Target dates; you can edit this value.
                  </span>
                </label>

                <div>
                  <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    Additional notes{" "}
                    <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
                    <Textarea
                      name="issue"
                      rows={3}
                      placeholder="Any extra context for this job order"
                      className="mt-1.5 border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </label>
                  {renderOptionalFieldAttachments("ticket-screenshots-job-order")}
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  {detailsField.label}
                  <Textarea
                    name="issue"
                    required
                    rows={5}
                    placeholder={detailsField.placeholder}
                    className="mt-1.5 border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>
                {renderOptionalFieldAttachments("ticket-screenshots-issue")}
              </div>
            )}

            {error ? (
              <p className="text-sm text-red-300" role="alert">
                {error}
              </p>
            ) : null}

            <Button
              type="submit"
              variant="accent"
              disabled={loading || issueConcernSubmitLocked}
              className="w-full rounded-full sm:w-auto sm:px-8"
            >
              {loading
                ? screenshots.length > 0
                  ? `Submitting… (uploading ${screenshots.length} image${screenshots.length === 1 ? "" : "s"})`
                  : "Submitting…"
                : issueConcernSubmitLocked
                  ? !intakeGateReady
                    ? "Checking open requests…"
                    : "Finish existing Issue/Concern first"
                  : "Create request"}
            </Button>
          </form>
          ) : null}
        </Card>
      </div>
    </main>
  );
}
