"use client";

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  SignInLaunchPadShell,
  launchPadInputClass,
  launchPadLabelClass,
  launchPadOutlineButtonClass,
  launchPadPrimaryButtonClass,
} from "@/components/auth/SignInLaunchPadShell";
import { GoogleMark } from "@/components/auth/GoogleAuthButton";

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

function LaunchPadDivider() {
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
      <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-400 dark:text-gray-500">
        or
      </span>
      <span className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
    </div>
  );
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

  async function retryLoadCompanies() {
    setCompaniesStatus("loading");
    applyCompanyList(await fetchPublicCompanies());
  }

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
    <SignInLaunchPadShell wide>
      <div className="mb-6 text-center">
        <h2 className="mb-2 text-2xl font-semibold text-zinc-900 dark:text-white">Create company account</h2>
        <p className="text-sm text-zinc-500 dark:text-[#888888]">
          Register with a username and password, or continue with Google.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="signup-username" className={launchPadLabelClass}>
            Username
          </label>
          <input
            id="signup-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            placeholder="your_username"
            className={`${launchPadInputClass} mt-2`}
          />
        </div>

        <div>
          <label htmlFor="signup-display-name" className={launchPadLabelClass}>
            Display name
          </label>
          <input
            id="signup-display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            autoComplete="name"
            placeholder="How you appear when signed in"
            className={`${launchPadInputClass} mt-2`}
          />
        </div>

        <div>
          <label htmlFor="signup-company" className={launchPadLabelClass}>
            Company
          </label>
          {companiesStatus === "loading" ? (
            <p className={`${launchPadInputClass} mt-2 flex items-center text-xs text-zinc-500 dark:text-[#888]`}>
              Loading companies…
            </p>
          ) : companiesStatus === "error" ? (
            <div className="mt-2 space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-100">
              <p>Could not load the company list.</p>
              <button
                type="button"
                onClick={() => void retryLoadCompanies()}
                className="rounded-lg border border-amber-500/40 bg-white/80 px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-white dark:bg-black/40 dark:text-amber-100 dark:hover:bg-black/60"
              >
                Retry
              </button>
            </div>
          ) : (
            <select
              id="signup-company"
              value={selectedCompanyId}
              onChange={(e) => setCompanyId(e.target.value)}
              required
              className={`${launchPadInputClass} mt-2 cursor-pointer`}
            >
              <option value="">Select company…</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label htmlFor="signup-org-role" className={launchPadLabelClass}>
            Your role in the organization
          </label>
          <select
            id="signup-org-role"
            value={customerOrgRole}
            onChange={(e) => setCustomerOrgRole(e.target.value as "Admin" | "Personnel")}
            className={`${launchPadInputClass} mt-2 cursor-pointer`}
          >
            <option value="Admin">Admin</option>
            <option value="Personnel">Personnel</option>
          </select>
        </div>

        <div>
          <label htmlFor="signup-email" className={launchPadLabelClass}>
            Work email
          </label>
          <input
            id="signup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@company.com"
            className={`${launchPadInputClass} mt-2`}
          />
        </div>

        <div>
          <label htmlFor="signup-password" className={launchPadLabelClass}>
            Password
          </label>
          <input
            id="signup-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            placeholder="••••••••"
            className={`${launchPadInputClass} mt-2`}
          />
        </div>

        {error ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-200">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy || companiesStatus !== "ready" || companies.length === 0}
          className={`${launchPadPrimaryButtonClass} mt-2`}
        >
          {busy ? "Creating account…" : "Create company account"}
        </button>

        {googleEnabled ? (
          <>
            <LaunchPadDivider />
            <button
              type="button"
              disabled={googleBusy || companiesStatus !== "ready" || companies.length === 0}
              onClick={() => void onGoogleSignup()}
              className={launchPadOutlineButtonClass}
            >
              <span className="inline-flex items-center justify-center gap-2">
                <GoogleMark />
                {googleBusy ? "Redirecting to Google…" : "Continue with Google"}
              </span>
            </button>
            <p className="text-center text-[11px] text-zinc-500 dark:text-gray-500">
              For Google signup, your work email must match your Google account.
            </p>
          </>
        ) : null}
      </form>

      <p className="mt-6 text-center text-xs text-zinc-500 dark:text-gray-500">
        Already have an account?{" "}
        <Link href="/signin" className="font-medium text-[#ff6b00] transition-colors hover:text-orange-400">
          Sign in
        </Link>
      </p>

      <div className="mt-6 space-y-2 border-t border-zinc-200 pt-5 dark:border-white/10">
        <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-gray-500">
          Your company and org role are stored on your account and used for routing and visibility.
        </p>
      </div>
    </SignInLaunchPadShell>
  );
}

export default function SignUpPage() {
  return (
    <Suspense
      fallback={
        <SignInLaunchPadShell wide>
          <p className="text-center text-sm text-zinc-500 dark:text-gray-400">Loading…</p>
        </SignInLaunchPadShell>
      }
    >
      <SignUpForm />
    </Suspense>
  );
}
