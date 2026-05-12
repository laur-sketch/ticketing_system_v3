"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/field";
import { BRAND_TITLE } from "@/lib/brand";
import { MAX_SCREENSHOT_BYTES, MAX_SCREENSHOT_COUNT } from "@/lib/ticket-intake-screenshots-constants";

function pickImageFiles(list: File[]) {
  return list.filter((f) => {
    const t = (f.type || "").toLowerCase();
    if (t.startsWith("image/")) return true;
    return /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(f.name);
  });
}

export default function NewTicketPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [intake, setIntake] = useState<{
    canCreateTickets: boolean;
    authProvider: string | null;
    pendingConfirmation: { verificationHref: string; ticketNumber: string } | null;
  }>({ canCreateTickets: true, authProvider: null, pendingConfirmation: null });
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
      if (role !== "Customer" && role !== "Personnel") {
        setIntakeGateReady(true);
        return;
      }
      setIntakeGateReady(false);
      try {
        const res = await fetch("/api/me/intake-lock", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const j = (await res.json().catch(() => ({}))) as {
          canCreateTickets?: boolean;
          authProvider?: string | null;
          pendingConfirmation?: { verificationHref: string; ticketNumber: string } | null;
        };
        if (cancelled) return;
        setIntake({
          canCreateTickets: Boolean(j.canCreateTickets),
          authProvider: typeof j.authProvider === "string" ? j.authProvider : null,
          pendingConfirmation: j.pendingConfirmation ?? null,
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
  const isRequestorIntakeLockRole = isCustomer || isPersonnelIntake;
  const intakeBlocked = isRequestorIntakeLockRole && !intake.canCreateTickets;
  const intakeSubmitLocked = isRequestorIntakeLockRole && (!intakeGateReady || intakeBlocked);
  const myTicketsHref = isPersonnelIntake ? "/my-requests" : "/my-tickets";
  const portalCustomer = session?.user as {
    companyName?: string | null;
    customerOrgRole?: string | null;
    companyId?: string | null;
  };
  const googleOAuthCustomer =
    Boolean(isCustomer) &&
    typeof session?.user?.authProvider === "string" &&
    session.user.authProvider.trim().toLowerCase() === "google";

  const isAdminStaffIntake =
    session?.user?.role === "SuperAdmin" || session?.user?.role === "Admin";
  const isStaffIntake = isAdminStaffIntake || isPersonnelIntake;

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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (intakeSubmitLocked) {
      if (intakeBlocked) {
        setError(
          "You already have a ticket in progress or awaiting your confirmation. Confirm and close it before creating a new request.",
        );
      } else {
        setError("Checking whether you can open a new request… try again in a moment.");
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

      let res: Response;
      if (screenshots.length > 0) {
        const fd = new FormData();
        fd.append("issue", issue);
        if (isCustomer) {
          fd.append("requestToCompanySbu", String(form.get("requestToCompanySbu") || "").trim());
          fd.append("branch", String(form.get("branch") || "").trim());
          fd.append("assignedCompanyText", String(form.get("assignedCompanyText") || "").trim());
          if (googleOAuthCustomer) {
            fd.append("customerOrgRole", String(form.get("customerOrgRole") || "").trim() || "Personnel");
          }
        } else if (isPersonnelIntake) {
          fd.append("contactName", String(form.get("contactName") || "").trim());
          fd.append("contactEmail", String(form.get("contactEmail") || "").trim());
          fd.append("requestToCompanySbu", String(form.get("requestToCompanySbu") || "").trim());
          fd.append("branch", String(form.get("branch") || "").trim());
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
        const payload: Record<string, unknown> = { issue };
        if (isCustomer) {
          payload.requestToCompanySbu = String(form.get("requestToCompanySbu") || "").trim();
          payload.branch = String(form.get("branch") || "").trim();
          payload.assignedCompanyText = String(form.get("assignedCompanyText") || "").trim();
          if (googleOAuthCustomer) {
            payload.customerOrgRole = String(form.get("customerOrgRole") || "").trim() || "Personnel";
          }
        } else if (isPersonnelIntake) {
          payload.contactName = String(form.get("contactName") || "").trim();
          payload.contactEmail = String(form.get("contactEmail") || "").trim();
          payload.requestToCompanySbu = String(form.get("requestToCompanySbu") || "").trim();
          payload.branch = String(form.get("branch") || "").trim();
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
      router.push(
        isPersonnelIntake ? "/my-requests?submitted=1" : "/my-tickets?submitted=1",
      );
    } catch {
      setError("Could not create ticket.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-56px)] bg-zinc-50 text-zinc-900 dark:bg-[#070d19] dark:text-zinc-100">
      <div className="mx-auto max-w-3xl px-3 py-6 sm:px-4 sm:py-8 md:py-10">
        <div className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_12px_40px_rgba(0,0,0,0.06)] dark:border-zinc-800 dark:bg-[#0b1220] dark:shadow-[0_16px_45px_rgba(0,0,0,0.35)] sm:mb-8 sm:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-orange-700 dark:text-orange-400/95">
            {BRAND_TITLE} · Request intake
          </p>
          <h1 className="text-xl font-semibold text-zinc-900 sm:text-2xl dark:text-zinc-100">Submit a request</h1>
        </div>

        {isRequestorIntakeLockRole && !intakeGateReady ? (
          <div className="mb-4 rounded-xl border border-zinc-300/80 bg-zinc-100/80 px-4 py-3 text-sm text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800/40 dark:text-zinc-200">
            Checking whether you already have a ticket in progress…
          </div>
        ) : null}

        {intakeBlocked && intake.pendingConfirmation ? (
          <div className="mb-4 rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
            <p className="font-semibold">Action required: ticket {intake.pendingConfirmation.ticketNumber}</p>
            <p className="mt-1 text-xs text-amber-900/90 dark:text-amber-200/90">
              You already have a ticket in progress or waiting on your confirmation. Confirm and close that ticket
              before submitting a new request.
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
        ) : intakeBlocked ? (
          <div className="mb-4 rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
            <p className="font-semibold">You already have a ticket in progress or awaiting confirmation</p>
            <p className="mt-1 text-xs text-amber-900/90 dark:text-amber-200/90">
              Confirm and close your existing ticket before submitting a new request.
            </p>
            <Link
              href={myTicketsHref}
              className="mt-3 inline-flex text-sm font-semibold text-orange-700 underline-offset-4 hover:underline dark:text-orange-300"
            >
              {isPersonnelIntake ? "Open my ticket dashboard" : "Open my tickets"}
            </Link>
          </div>
        ) : null}

        <Card className="border-zinc-200 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.06)] dark:border-zinc-800 dark:bg-[#0b1220] dark:shadow-[0_16px_45px_rgba(0,0,0,0.35)]">
          <form onSubmit={onSubmit} className="space-y-5">
            {isAdminStaffIntake ? (
              <>
                <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Name
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
                <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Request to Company/SBU
                  <Select
                    key={`staff-company-${staffDesignatedCompany?.id ?? "all"}`}
                    name="companyTeamId"
                    required
                    disabled={
                      companiesLoading && (!staffDesignatedCompany || staffDesignatedCompany.id.length === 0)
                    }
                    defaultValue={staffDesignatedCompany?.id ?? ""}
                    className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    {staffDesignatedCompany ? (
                      <option value={staffDesignatedCompany.id}>{staffDesignatedCompany.name}</option>
                    ) : (
                      <>
                        <option value="">
                          {companiesLoading || staffDesignatedLoading
                            ? "Loading companies…"
                            : "Select a company/SBU"}
                        </option>
                        {companyTeams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </>
                    )}
                  </Select>
                </label>
              </>
            ) : isPersonnelIntake ? (
              <>
                <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Name
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

                <div>
                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Company</span>
                  <div className="mt-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-100">
                    {staffDesignatedLoading
                      ? "Loading…"
                      : staffDesignatedCompany?.name?.trim() || "Not yet assigned"}
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                    Your company is assigned at signup or by a SuperAdmin/Admin and cannot be changed here.
                  </p>
                </div>

                <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Branch{" "}
                  <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
                  <Input
                    name="branch"
                    maxLength={120}
                    placeholder="e.g. Main Office, Cebu Branch"
                    className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>

                <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Company Requested to
                  <Textarea
                    name="requestToCompanySbu"
                    required
                    rows={3}
                    maxLength={500}
                    placeholder="Type the company or SBU you are requesting (e.g. AGC, ALI, IT support)."
                    className="mt-1.5 border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>
                <p className="-mt-1 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                  Use a roster SBU name when you can. If it does not match, your request still registers and is triaged
                  under <strong className="font-medium text-zinc-600 dark:text-zinc-300">OUTSIDE COMPANY</strong> on the
                  company board.
                </p>
              </>
            ) : (
              <>
                <div>
                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Name</span>
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

                <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Assigned Company
                  <Input
                    name="assignedCompanyText"
                    required
                    maxLength={500}
                    autoComplete="organization"
                    defaultValue={portalCustomer.companyName?.trim() ?? ""}
                    placeholder="Type your company / SBU (e.g. AGC, ALI, MCONPINCO)"
                    className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>
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
                      defaultValue={portalCustomer.customerOrgRole?.trim() || "Personnel"}
                      className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </label>
                ) : null}

                <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Branch{" "}
                  <span className="font-normal text-zinc-500 dark:text-zinc-400">
                    (optional — outside clients)
                  </span>
                  <Input
                    name="branch"
                    maxLength={120}
                    placeholder="Optional"
                    className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>

                <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Request to Company/SBU
                  <Textarea
                    name="requestToCompanySbu"
                    required
                    rows={3}
                    placeholder="Type the company or SBU you are requesting (e.g. AGC, ALI, or IT support)."
                    className="mt-1.5 border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>
              </>
            )}

            <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Issue
              <Textarea
                name="issue"
                required
                rows={5}
                placeholder="Describe the issue, impact, and any steps already taken."
                className="mt-1.5 border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>

            <div className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Screenshots
              <input
                ref={fileInputRef}
                id="ticket-screenshots-input"
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  mergeScreenshotFiles(pickImageFiles(Array.from(e.target.files ?? [])));
                  e.target.value = "";
                }}
                className="sr-only"
                aria-label="Choose screenshot image files"
              />
              <div
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                  setIsDragging(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(false);
                  const dropped = pickImageFiles(Array.from(e.dataTransfer.files ?? []));
                  if (dropped.length) mergeScreenshotFiles(dropped);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`mt-3 flex min-h-[112px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition sm:min-h-[128px] ${
                  isDragging
                    ? "border-orange-500 bg-orange-50/80 dark:border-orange-400 dark:bg-orange-950/30"
                    : "border-zinc-300 bg-zinc-50/50 hover:border-orange-400/70 hover:bg-zinc-100/80 dark:border-zinc-600 dark:bg-zinc-900/20 dark:hover:border-orange-500/40 dark:hover:bg-zinc-900/40"
                }`}
              >
                <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  {isDragging ? "Drop images to attach" : "Drop images here or click to browse"}
                </span>
                <span className="max-w-md text-xs text-zinc-600 dark:text-zinc-400">Up to {MAX_SCREENSHOT_COUNT} images, 5MB each.</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label
                  htmlFor="ticket-screenshots-input"
                  className="cursor-pointer rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 shadow-sm transition hover:border-orange-500/60 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  {screenshots.length === 0 ? "Choose screenshots" : "Add more files"}
                </label>
                {screenshots.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setScreenshots([])}
                    className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  >
                    Remove all
                  </button>
                ) : null}
                <span className="text-xs text-zinc-600 dark:text-zinc-500">
                  {screenshots.length === 0
                    ? "No files selected"
                    : `${screenshots.length} image${screenshots.length === 1 ? "" : "s"} attached`}
                </span>
              </div>
            </div>
            {screenshotPreviews.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {screenshotPreviews.map((s, index) => (
                  <div
                    key={s.key}
                    className="rounded-lg border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <div className="relative h-20 w-full overflow-hidden rounded">
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

            {error ? (
              <p className="text-sm text-red-300" role="alert">
                {error}
              </p>
            ) : null}

            <Button
              type="submit"
              variant="accent"
              disabled={loading || intakeSubmitLocked}
              className="w-full rounded-full sm:w-auto sm:px-8"
            >
              {loading
                ? screenshots.length > 0
                  ? `Submitting… (uploading ${screenshots.length} image${screenshots.length === 1 ? "" : "s"})`
                  : "Submitting…"
                : intakeSubmitLocked
                  ? !intakeGateReady
                    ? "Checking open requests…"
                    : "Finish existing ticket first"
                  : "Create ticket"}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
