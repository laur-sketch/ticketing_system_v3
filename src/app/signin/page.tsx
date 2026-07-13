"use client";

import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { Eye, EyeOff } from "lucide-react";
import {
  AuthShell,
  authInputClass,
  authLabelClass,
  authPrimaryButtonClass,
} from "@/components/auth/AuthShell";
import { AuthDivider, GoogleAuthButton } from "@/components/auth/GoogleAuthButton";
import { isSessionExpired } from "@/lib/session-expiry-client";
import { sanitizeCallbackUrl } from "@/lib/session-expiry";
import { RedirectLoadingIndicator } from "@/components/ui/redirect-loading-indicator";

function postLoginDestination(resUrl: string | null | undefined, fallback: string): string {
  if (resUrl) {
    try {
      const parsed = new URL(resUrl, window.location.origin);
      if (parsed.origin === window.location.origin) {
        return sanitizeCallbackUrl(`${parsed.pathname}${parsed.search}${parsed.hash}`);
      }
    } catch {
      /* ignore */
    }
  }
  return sanitizeCallbackUrl(fallback);
}

function oauthErrorMessage(code: string | null): string | null {
  if (!code) return null;
  switch (code) {
    case "OAuthSignin":
    case "OAuthCallback":
      return "Google sign-in could not complete. Check that NEXTAUTH_URL matches the site URL and the Google OAuth redirect URI is configured.";
    case "OAuthAccountNotLinked":
      return "This Google account is not linked to your portal login. Use the same email as your customer account, or sign in with username and password.";
    case "AccessDenied":
      return "Sign-in was denied. If the Google app is in Testing mode, add this user as a test user in Google Cloud Console.";
    case "Configuration":
      return "Sign-in is misconfigured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET or NEXTAUTH_URL). Contact your administrator.";
    default:
      return "Sign-in failed. Try again or use username and password.";
  }
}

function SignInForm() {
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const registered = searchParams.get("registered") === "1";
  const sessionExpiredReason = searchParams.get("reason");
  const sessionExpiredMidnight = sessionExpiredReason === "session-expired-midnight";
  const sessionExpiredIdle = sessionExpiredReason === "session-expired";
  const callbackUrl = sanitizeCallbackUrl(searchParams.get("callbackUrl"));
  const oauthError = oauthErrorMessage(searchParams.get("error"));
  const wantsGoogle = searchParams.get("google") === "1";
  const googleRedirectStarted = useRef(false);
  const banner = registered
    ? "Account created. Sign in with your username and password."
    : sessionExpiredMidnight
      ? "Your session ended at midnight. Please sign in again."
      : sessionExpiredIdle
        ? "Your session ended after 30 minutes. Please sign in again."
        : oauthError;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetIdentifier, setResetIdentifier] = useState("");
  const [resetReason, setResetReason] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

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

  useEffect(() => {
    if (status !== "authenticated" || !session || isSessionExpired(session)) return;
    setRedirecting(true);
    window.location.replace(callbackUrl);
  }, [status, session, callbackUrl]);

  useEffect(() => {
    if (!googleEnabled || !wantsGoogle || googleRedirectStarted.current) return;
    googleRedirectStarted.current = true;
    void signIn("google", { callbackUrl });
  }, [googleEnabled, wantsGoogle, callbackUrl]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const res = await signIn("credentials", {
      username,
      password,
      callbackUrl,
      redirect: false,
    });
    if (res?.error) {
      setError("Invalid username or password.");
      return;
    }
    setRedirecting(true);
    window.location.href = postLoginDestination(res?.url, callbackUrl);
  }

  function openResetPanel() {
    setResetOpen(true);
    setResetMessage(null);
    setResetError(null);
    if (!resetIdentifier && username) setResetIdentifier(username);
  }

  async function submitResetRequest(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResetError(null);
    setResetMessage(null);
    const identifier = resetIdentifier.trim();
    if (!identifier) {
      setResetError("Enter your username or email.");
      return;
    }
    setResetBusy(true);
    try {
      const res = await fetch("/api/auth/password-reset-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, reason: resetReason.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        setResetError(data.error ?? "Could not submit request. Try again.");
        return;
      }
      setResetMessage(
        data.message ??
          "Request sent. A SuperAdmin will review it and notify you when the password is reset.",
      );
      setResetReason("");
    } catch {
      setResetError("Network error. Try again.");
    } finally {
      setResetBusy(false);
    }
  }

  if (redirecting) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-4 text-foreground">
        <RedirectLoadingIndicator />
        <p className="text-sm font-medium">Redirecting…</p>
      </div>
    );
  }

  return (
    <AuthShell mode="signin">
      <h1 className="text-[1.5rem] font-bold leading-tight tracking-tight text-zinc-900 dark:text-white sm:text-[1.65rem]">
        Sign in
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        Use your HRIS username and password from the employee directory, or continue with Google.
      </p>

      {banner ? (
        <p className="mt-4 rounded-lg border border-orange-500/25 bg-orange-500/[0.08] px-3 py-2 text-xs leading-snug text-orange-900 dark:text-orange-100/90 sm:text-[13px]">
          {banner}
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="flex flex-col gap-1.5">
          <span className={authLabelClass}>Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            placeholder="you or name@company.com"
            className={authInputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={authLabelClass}>Password</span>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className={`${authInputClass} pr-11`}
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Press and hold to show password"}
              title="Press and hold to reveal"
              onPointerDown={(e) => {
                e.preventDefault();
                setShowPassword(true);
              }}
              onPointerUp={() => setShowPassword(false)}
              onPointerLeave={() => setShowPassword(false)}
              onPointerCancel={() => setShowPassword(false)}
              onBlur={() => setShowPassword(false)}
              tabIndex={-1}
              className="absolute right-1.5 top-1/2 inline-flex size-8 -translate-y-1/2 select-none items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316]/40 active:scale-95 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-200"
            >
              {showPassword ? (
                <EyeOff className="size-4" aria-hidden />
              ) : (
                <Eye className="size-4" aria-hidden />
              )}
            </button>
          </div>
        </label>

        {error ? (
          <p className="rounded-lg border border-red-500/30 bg-red-500/[0.07] px-2.5 py-2 text-xs text-red-700 dark:text-red-200/90 sm:text-[13px]">
            {error}
          </p>
        ) : null}

        <button type="submit" className={authPrimaryButtonClass}>
          Sign in
        </button>

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={openResetPanel}
            className="text-[12px] font-medium text-[#f97316] transition hover:text-[#fb923c] sm:text-[13px]"
          >
            Forgot password? Request reset
          </button>
        </div>
      </form>

      {resetOpen ? (
        <section className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 dark:border-zinc-800/80 dark:bg-zinc-900/40">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-[12px] font-bold uppercase tracking-[0.18em] text-zinc-700 dark:text-zinc-300">
              Request password reset
            </h2>
            <button
              type="button"
              onClick={() => setResetOpen(false)}
              className="shrink-0 rounded-md border border-zinc-300 px-2 py-0.5 text-[11px] text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800/70"
            >
              Close
            </button>
          </div>
          {resetMessage ? (
            <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.08] px-2.5 py-2 text-[12px] text-emerald-800 dark:text-emerald-100/90">
              {resetMessage}
            </p>
          ) : null}
          {resetError ? (
            <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/[0.07] px-2.5 py-2 text-[12px] text-red-700 dark:text-red-200/90">
              {resetError}
            </p>
          ) : null}
          <form onSubmit={submitResetRequest} className="mt-3 space-y-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-600 dark:text-zinc-500">
                Username or email
              </span>
              <input
                value={resetIdentifier}
                onChange={(e) => setResetIdentifier(e.target.value)}
                required
                autoComplete="username"
                placeholder="you or name@company.com"
                className={authInputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-600 dark:text-zinc-500">
                Reason (optional)
              </span>
              <textarea
                value={resetReason}
                onChange={(e) => setResetReason(e.target.value)}
                rows={2}
                placeholder="Brief context to help the SuperAdmin verify the request."
                className={`${authInputClass} resize-none`}
              />
            </label>
            <button
              type="submit"
              disabled={resetBusy}
              className={`${authPrimaryButtonClass} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {resetBusy ? "Sending request…" : "Send request to SuperAdmin"}
            </button>
          </form>
        </section>
      ) : null}

      {googleEnabled ? (
        <>
          <AuthDivider />
          <GoogleAuthButton
            variant="secondary"
            label="Continue with Google"
            onClick={() => void signIn("google", { callbackUrl })}
          />
        </>
      ) : null}

      <p className="mt-6 text-center text-xs text-zinc-600 dark:text-zinc-500 sm:text-[13px]">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-[#f97316] hover:text-[#fb923c]">
          Create account
        </Link>
      </p>
    </AuthShell>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <AuthShell mode="signin">
          <p className="text-sm text-zinc-500">Loading…</p>
        </AuthShell>
      }
    >
      <SignInForm />
    </Suspense>
  );
}
