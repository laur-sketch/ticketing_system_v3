"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  AuthShell,
  authInputClass,
  authLabelClass,
  authPrimaryButtonClass,
  authSecondaryButtonClass,
} from "@/components/auth/AuthShell";

function safeCallbackUrl(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/";
}

function SignInForm() {
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered") === "1";
  const callbackUrl = safeCallbackUrl(searchParams.get("callbackUrl"));
  const banner = registered ? "Account created. Sign in with your username and password." : null;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [googleEnabled, setGoogleEnabled] = useState(false);

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
    window.location.href = res?.url ?? callbackUrl;
  }

  return (
    <AuthShell mode="signin">
      <h1 className="text-[1.5rem] font-bold leading-tight tracking-tight text-zinc-900 dark:text-white sm:text-[1.65rem]">
        Sign in
      </h1>
      <p className="mt-1.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-500 sm:text-[13px]">
        One sign-in for everyone. After you authenticate, you are taken to the workspace that matches your account—
        operations console, admin tools, or your company portal.
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
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className={authInputClass}
          />
        </label>

        <p className="rounded-md bg-zinc-100 px-2.5 py-2 text-[11px] leading-relaxed text-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-500">
          Use your <span className="text-zinc-700 dark:text-zinc-400">username</span> or{" "}
          <span className="text-zinc-700 dark:text-zinc-400">email</span> and password. Need an account?{" "}
          <Link href="/signup" className="font-medium text-[#f97316] hover:text-[#fb923c]">
            Create account
          </Link>{" "}
          (choose staff or company on the next screen).
        </p>

        {error ? (
          <p className="rounded-lg border border-red-500/30 bg-red-500/[0.07] px-2.5 py-2 text-xs text-red-700 dark:text-red-200/90 sm:text-[13px]">
            {error}
          </p>
        ) : null}

        <button type="submit" className={authPrimaryButtonClass}>
          Sign in
        </button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-zinc-300 dark:bg-zinc-800/90" />
        <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-600 dark:text-zinc-600">
          External identity providers
        </span>
        <span className="h-px flex-1 bg-zinc-300 dark:bg-zinc-800/90" />
      </div>

      <div className="grid grid-cols-1 gap-2.5">
        <button
          type="button"
          className={authSecondaryButtonClass}
          disabled={!googleEnabled}
          onClick={() => void signIn("google", { callbackUrl })}
        >
          <span className="inline-flex items-center gap-2">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
              <path
                fill="#EA4335"
                d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.8-5.5 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.3 14.7 2.4 12 2.4A9.6 9.6 0 0 0 2.4 12 9.6 9.6 0 0 0 12 21.6c5.6 0 9.3-3.9 9.3-9.4 0-.6-.1-1.1-.2-2H12z"
              />
              <path fill="#34A853" d="M2.4 12c0 3.7 2.1 7 5.2 8.6l3-2.5c-.8-.2-1.5-.7-2.1-1.2C7.7 16 7.2 14.9 7 13.8l-3-.2V12z" />
              <path fill="#4285F4" d="M12 21.6c2.7 0 4.9-.9 6.6-2.5l-3.2-2.6c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.2l-3 .2A9.6 9.6 0 0 0 12 21.6z" />
              <path fill="#FBBC05" d="M7 13.8a5.8 5.8 0 0 1 0-3.6V7.9l-3-.2A9.6 9.6 0 0 0 2.4 12c0 1.5.3 2.9.9 4.2l3.7-2.4z" />
            </svg>
            {googleEnabled ? "Google" : "Google (not configured)"}
          </span>
        </button>
        {googleEnabled ? (
          <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-600">
            Company portal users who rely on org-linked routing may prefer username and password if Google does not match
            your provisioned profile.
          </p>
        ) : null}
      </div>

      <p className="mt-6 text-center text-xs text-zinc-600 dark:text-zinc-500 sm:text-[13px]">
        First time here?{" "}
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
