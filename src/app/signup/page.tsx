"use client";

import { FormEvent, Suspense, useEffect, useLayoutEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Shield } from "lucide-react";
import {
  AuthShell,
  PasswordRequirement,
  authInputClass,
  authLabelClass,
  authPrimaryButtonClass,
} from "@/components/auth/AuthShell";

type CompanyOption = { id: string; name: string };
type RegistrationKind = "staff" | "company";

function parseKind(raw: string | null): RegistrationKind {
  const q = (raw ?? "").toLowerCase();
  if (q === "company" || q === "customer" || q === "portal") return "company";
  return "staff";
}

function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [kind, setKind] = useState<RegistrationKind>("staff");

  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [staffRole, setStaffRole] = useState("Personnel");
  const [companyId, setCompanyId] = useState("");
  const [customerOrgRole, setCustomerOrgRole] = useState<"Head" | "Personnel">("Personnel");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lenOk = password.length >= 8;
  const upperNumOk = /[A-Z]/.test(password) && /[0-9]/.test(password);

  useLayoutEffect(() => {
    setKind(parseKind(searchParams.get("kind") ?? searchParams.get("type")));
  }, [searchParams]);

  useEffect(() => {
    if (kind !== "company") return;
    let cancelled = false;
    void fetch("/api/public/companies", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: CompanyOption[]) => {
        if (!cancelled && Array.isArray(rows)) setCompanies(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [kind]);

  function setKindAndUrl(next: RegistrationKind) {
    setKind(next);
    setError(null);
    router.replace(next === "company" ? "/signup?kind=company" : "/signup?kind=staff", { scroll: false });
  }

  const bottomBanner = useMemo(
    () => (
      <div className="mt-6 space-y-3 border-t border-zinc-200 pt-6 dark:border-zinc-800/60">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {["AR", "SK", "JL"].map((initials, i) => (
              <span
                key={initials}
                className="flex size-8 items-center justify-center rounded-full border-2 border-zinc-200 bg-gradient-to-br from-zinc-100 to-zinc-300 text-[9px] font-bold text-zinc-800 shadow-md dark:border-zinc-950 dark:from-zinc-600 dark:to-zinc-800 dark:text-zinc-100"
                style={{ zIndex: 3 - i }}
              >
                {initials}
              </span>
            ))}
          </div>
          <p className="text-[9px] font-bold uppercase leading-snug tracking-[0.18em] text-zinc-600 dark:text-zinc-600">
            Trusted by 2k+ ops leads
          </p>
        </div>
        <p className="text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-500">
          {kind === "company"
            ? "Your company and org role are stored on your account and used for routing and visibility."
            : "Your staff role is stored on your account. Personnel join until an administrator assigns a team in the personnel registry."}
        </p>
      </div>
    ),
    [kind],
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!lenOk || !upperNumOk) {
      setError("Please meet all password requirements.");
      return;
    }
    if (kind === "company" && !companyId) {
      setError("Select the company you belong to.");
      return;
    }
    setBusy(true);
    try {
      const body =
        kind === "company"
          ? {
              username,
              name: displayName,
              email,
              password,
              role: "Customer",
              companyId,
              customerOrgRole,
            }
          : {
              username,
              name: displayName,
              email,
              password,
              role: staffRole,
            };

      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not create account.");
        return;
      }
      router.push("/signin?registered=1");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const kindToggleClass = (active: boolean) =>
    `flex flex-1 flex-col items-center gap-1 rounded-xl border px-3 py-3 text-left transition sm:flex-row sm:items-center sm:gap-2 sm:px-3.5 sm:py-2.5 ${
      active
        ? "border-orange-500/50 bg-orange-500/[0.12] ring-1 ring-orange-500/25 dark:border-orange-400/35 dark:bg-orange-500/15"
        : "border-zinc-200 bg-white/60 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/40 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/50"
    }`;

  return (
    <AuthShell mode="signup" bottomBanner={bottomBanner}>
      <h1 className="text-[1.5rem] font-bold leading-tight tracking-tight text-zinc-900 dark:text-white sm:text-[1.65rem]">
        Create account
      </h1>
      <p className="mt-1.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-500 sm:text-[13px]">
        Pick how you will use Help Desk, then complete one form. Everyone signs in later at the same page.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-2" role="tablist" aria-label="Account type">
        <button
          type="button"
          role="tab"
          aria-selected={kind === "staff"}
          className={kindToggleClass(kind === "staff")}
          onClick={() => setKindAndUrl("staff")}
        >
          <Shield className="size-5 shrink-0 text-orange-600 dark:text-orange-400" aria-hidden />
          <span>
            <span className="block text-xs font-bold text-zinc-900 dark:text-white">Staff</span>
            <span className="mt-0.5 block text-[10px] font-medium leading-snug text-zinc-600 dark:text-zinc-500">
              Queue &amp; operations
            </span>
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={kind === "company"}
          className={kindToggleClass(kind === "company")}
          onClick={() => setKindAndUrl("company")}
        >
          <Building2 className="size-5 shrink-0 text-orange-600 dark:text-orange-400" aria-hidden />
          <span>
            <span className="block text-xs font-bold text-zinc-900 dark:text-white">Company</span>
            <span className="mt-0.5 block text-[10px] font-medium leading-snug text-zinc-600 dark:text-zinc-500">
              Request portal
            </span>
          </span>
        </button>
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="flex flex-col gap-1.5">
          <span className={authLabelClass}>Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            placeholder={kind === "company" ? "your_username" : "ops_lead"}
            className={authInputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={authLabelClass}>Display name</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            autoComplete="name"
            placeholder="How you appear when signed in"
            className={authInputClass}
          />
        </label>

        {kind === "company" ? (
          <>
            <label className="flex flex-col gap-1.5">
              <span className={authLabelClass}>Company</span>
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                required
                className={`${authInputClass} cursor-pointer`}
              >
                <option value="">Select company…</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id} className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className={authLabelClass}>Your role in the organization</span>
              <select
                value={customerOrgRole}
                onChange={(e) => setCustomerOrgRole(e.target.value as "Head" | "Personnel")}
                className={`${authInputClass} cursor-pointer`}
              >
                <option value="Head" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
                  Head
                </option>
                <option value="Personnel" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
                  Personnel
                </option>
              </select>
            </label>
            <p className="-mt-1 text-[10px] leading-snug text-zinc-600 dark:text-zinc-600">
              Head vs Personnel is your role in your organization (not staff assignment).
            </p>
          </>
        ) : (
          <>
            <label className="flex flex-col gap-1.5">
              <span className={authLabelClass}>Role</span>
              <select
                value={staffRole}
                onChange={(e) => setStaffRole(e.target.value)}
                className={`${authInputClass} cursor-pointer`}
              >
                <option className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Personnel</option>
              </select>
            </label>
            <p className="-mt-1 text-[10px] leading-snug text-zinc-600 dark:text-zinc-600">
              This role is stored on your account and used on every sign-in.
            </p>
          </>
        )}

        <label className="flex flex-col gap-1.5">
          <span className={authLabelClass}>Work email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder={kind === "company" ? "you@company.com" : "m.aurelius@stoicops.com"}
            className={authInputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={authLabelClass}>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            placeholder="••••••••"
            className={authInputClass}
          />
        </label>

        <div className="rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2.5 dark:border-zinc-800/80 dark:bg-zinc-900/35">
          <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-700 dark:text-zinc-600">
            Password requirements
          </p>
          <ul className="mt-2 space-y-1.5">
            <PasswordRequirement met={lenOk} label="At least 8 characters" />
            <PasswordRequirement met={upperNumOk} label="One uppercase & one numerical value" />
          </ul>
        </div>

        {error ? (
          <p className="rounded-lg border border-red-500/30 bg-red-500/[0.07] px-2.5 py-2 text-xs text-red-700 dark:text-red-200/90 sm:text-[13px]">
            {error}
          </p>
        ) : null}

        <button type="submit" disabled={busy} className={authPrimaryButtonClass}>
          {busy ? "Creating account…" : kind === "company" ? "Create company account" : "Create staff account"}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-zinc-600 dark:text-zinc-500 sm:text-[13px]">
        Already have an account?{" "}
        <Link href="/signin" className="font-semibold text-[#f97316] hover:text-[#fb923c]">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}

export default function SignUpPage() {
  return (
    <Suspense
      fallback={
        <AuthShell mode="signup">
          <p className="text-sm text-zinc-500">Loading…</p>
        </AuthShell>
      }
    >
      <SignUpForm />
    </Suspense>
  );
}
