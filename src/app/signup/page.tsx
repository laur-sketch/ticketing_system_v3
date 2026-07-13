"use client";

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  AuthShell,
  authInputClass,
  authLabelClass,
  authPrimaryButtonClass,
} from "@/components/auth/AuthShell";
import { AuthDivider, GoogleAuthButton } from "@/components/auth/GoogleAuthButton";

type CompanyOption = { id: string; name: string };

async function fetchPublicCompanies(): Promise<CompanyOption[] | null> {
  try {
    const r = await fetch("/api/public/companies", { cache: "no-store" });
    if (!r.ok) return null;
    const rows = (await r.json()) as CompanyOption[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return null;
  }
}

function SignUpForm() {
  const router = useRouter();

  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companiesStatus, setCompaniesStatus] = useState<"loading" | "ready" | "error">("loading");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [customerOrgRole, setCustomerOrgRole] = useState<"Admin" | "Personnel">("Personnel");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "email_mismatch") {
      setError(
        "The Google email does not match the work email on your signup form. Use the same address or start again.",
      );
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadProviders() {
      const res = await fetch("/api/auth/providers", { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const providers = (await res.json()) as Record<string, unknown>;
      if (!cancelled) setGoogleEnabled(!!providers.google);
    }
    void loadProviders();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyCompanyList = useCallback((list: CompanyOption[] | null) => {
    if (list === null) {
      setCompanies([]);
      setCompaniesStatus("error");
      return;
    }
    setCompanies(list);
    setCompaniesStatus("ready");
    setCompanyId((prev) => (prev && list.some((c) => c.id === prev) ? prev : ""));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await fetchPublicCompanies();
      if (!cancelled) applyCompanyList(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [applyCompanyList]);

  const retryLoadCompanies = useCallback(async () => {
    setCompaniesStatus("loading");
    applyCompanyList(await fetchPublicCompanies());
  }, [applyCompanyList]);

  const selectedCompanyId =
    companyId && companies.some((c) => c.id === companyId) ? companyId : "";

  const signupPayload = useMemo(
    () => ({
      username,
      name: displayName,
      email,
      role: "Customer",
      companyId,
      customerOrgRole,
    }),
    [username, displayName, email, companyId, customerOrgRole],
  );

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
          Your company and org role are stored on your account and used for routing and visibility.
        </p>
      </div>
    ),
    [],
  );

  function validateCompanySelection(): boolean {
    if (companiesStatus !== "ready" || companies.length === 0) {
      setError("Company list is still loading or unavailable. Try again in a moment.");
      return false;
    }
    if (!companyId) {
      setError("Select the company you belong to.");
      return false;
    }
    return true;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!validateCompanySelection()) return;
    if (password.length === 0) {
      setError("Enter a password.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...signupPayload, password, mode: "password" }),
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

  async function onGoogleSignup() {
    setError(null);
    if (!googleEnabled) {
      setError("Google sign-in is not configured. Contact your administrator.");
      return;
    }
    if (!validateCompanySelection()) return;

    setGoogleBusy(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...signupPayload, mode: "google" }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not start Google signup.");
        return;
      }
      await signIn("google", { callbackUrl: "/" });
    } catch {
      setError("Network error. Try again.");
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <AuthShell mode="signup" bottomBanner={bottomBanner}>
      <h1 className="text-[1.5rem] font-bold leading-tight tracking-tight text-zinc-900 dark:text-white sm:text-[1.65rem]">
        Create company account
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        Register with a username and password, or continue with Google.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="flex flex-col gap-1.5">
          <span className={authLabelClass}>Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            placeholder="your_username"
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

        <label className="flex flex-col gap-1.5">
          <span className={authLabelClass}>Company</span>
          {companiesStatus === "loading" ? (
            <p className={`${authInputClass} flex items-center text-xs text-zinc-500`}>
              Loading companies…
            </p>
          ) : companiesStatus === "error" ? (
            <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 text-xs text-amber-900 dark:text-amber-100/90">
              <p>Could not load the company list.</p>
              <button
                type="button"
                onClick={() => void retryLoadCompanies()}
                className="rounded-md border border-amber-600/50 bg-white px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-50 dark:border-amber-500/40 dark:bg-zinc-900 dark:text-amber-200 dark:hover:bg-zinc-800"
              >
                Retry
              </button>
            </div>
          ) : (
            <select
              value={selectedCompanyId}
              onChange={(e) => setCompanyId(e.target.value)}
              required
              className={`${authInputClass} cursor-pointer`}
            >
              <option value="">Select company…</option>
              {companies.map((c) => (
                <option
                  key={c.id}
                  value={c.id}
                  className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={authLabelClass}>Your role in the organization</span>
          <select
            value={customerOrgRole}
            onChange={(e) => setCustomerOrgRole(e.target.value as "Admin" | "Personnel")}
            className={`${authInputClass} cursor-pointer`}
          >
            <option value="Admin" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
              Admin
            </option>
            <option value="Personnel" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
              Personnel
            </option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={authLabelClass}>Work email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@company.com"
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

        {error ? (
          <p className="rounded-lg border border-red-500/30 bg-red-500/[0.07] px-2.5 py-2 text-xs text-red-700 dark:text-red-200/90 sm:text-[13px]">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy || companiesStatus !== "ready" || companies.length === 0}
          className={authPrimaryButtonClass}
        >
          {busy ? "Creating account…" : "Create company account"}
        </button>

        {googleEnabled ? (
          <>
            <AuthDivider />
            <GoogleAuthButton
              variant="secondary"
              disabled={googleBusy || companiesStatus !== "ready" || companies.length === 0}
              label={googleBusy ? "Redirecting to Google…" : "Continue with Google"}
              onClick={() => void onGoogleSignup()}
            />
            <p className="text-center text-[11px] text-zinc-500">
              For Google signup, your work email must match your Google account.
            </p>
          </>
        ) : null}
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
