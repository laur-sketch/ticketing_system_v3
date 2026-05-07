"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCircle2, Circle, Headphones, LineChart } from "lucide-react";
import { BrandLockup } from "@/components/BrandLockup";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

/** Brand accent — high contrast on dark UI */
export const AUTH_ACCENT = "#f97316";
export const AUTH_ACCENT_HOVER = "#fb923c";
export const authLabelClass =
  "text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-600 dark:text-zinc-500";

export const authInputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm leading-snug text-zinc-900 shadow-[inset_0_1px_0_rgba(0,0,0,0.02)] placeholder:text-zinc-500 transition outline-none " +
  "hover:border-zinc-400 hover:bg-zinc-50 " +
  "focus:border-[#f97316] focus:bg-white focus:ring-2 focus:ring-[#f97316]/25 " +
  "dark:border-zinc-700/70 dark:bg-zinc-900/55 dark:text-zinc-100 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] dark:placeholder:text-zinc-600 dark:hover:border-zinc-600 dark:hover:bg-zinc-900/70 dark:focus:bg-zinc-950/80";

export const authPrimaryButtonClass =
  "flex h-11 w-full items-center justify-center rounded-lg text-sm font-semibold text-white shadow-[0_6px_20px_rgba(249,115,22,0.32)] transition " +
  "bg-[#f97316] hover:bg-[#fb923c] active:translate-y-px disabled:pointer-events-none disabled:opacity-55";

export const authSecondaryButtonClass =
  "flex h-9 w-full items-center justify-center rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-800 shadow-sm transition " +
  "hover:border-zinc-400 hover:bg-zinc-50 active:translate-y-px dark:border-zinc-700/80 dark:bg-zinc-900/50 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/60";

type AuthMode = "signin" | "signup";

const authNavLinkClass =
  "font-semibold text-[#f97316] transition hover:text-[#fb923c]";

export function AuthShell({
  mode,
  children,
  bottomBanner,
}: {
  mode: AuthMode;
  children: React.ReactNode;
  bottomBanner?: React.ReactNode;
}) {
  const pathname = usePathname();
  const signupWide = pathname === "/signup";

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-clip bg-zinc-50 text-zinc-900 antialiased dark:bg-[#030304] dark:text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(92%_72%_at_8%_12%,rgba(249,115,22,0.28),transparent_60%),radial-gradient(80%_70%_at_92%_86%,rgba(14,165,233,0.20),transparent_66%),linear-gradient(90deg,#f8fafc_0%,#f1f5ff_48%,#edf7ff_100%)] dark:bg-[radial-gradient(92%_72%_at_8%_12%,rgba(249,115,22,0.44),transparent_60%),radial-gradient(80%_70%_at_92%_86%,rgba(14,165,233,0.30),transparent_66%),linear-gradient(90deg,#020408_0%,#050b16_46%,#07152b_100%)]"
      />
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-[linear-gradient(90deg,rgba(255,255,255,0.84),rgba(248,250,252,0.72))] px-5 py-3.5 backdrop-blur dark:border-zinc-800/50 dark:bg-[linear-gradient(90deg,rgba(2,4,8,0.84),rgba(7,17,36,0.72))] sm:px-10">
        <BrandLockup variant="auth-header" href="/" />
        <nav className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2 text-[13px]">
          <ThemeToggle />
          <Link href="/process" className="text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-300">
            Support
          </Link>
          {mode === "signin" ? (
            <Link href="/signup" className={authNavLinkClass}>
              Create account
            </Link>
          ) : (
            <Link href="/signin" className={authNavLinkClass}>
              Sign in
            </Link>
          )}
        </nav>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_1fr]">
        <aside className="relative hidden overflow-hidden border-zinc-200/70 dark:border-zinc-800/40 lg:block lg:border-r">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.01))] dark:bg-[linear-gradient(180deg,rgba(3,8,16,0.08),rgba(3,8,16,0.00))]" />
          <div className="relative flex min-h-[min(100vh,880px)] flex-col justify-center px-10 py-16 xl:px-16 xl:py-20">
            <div className="max-w-[26rem]">
              <h1 className="text-[2rem] font-bold leading-[1.12] tracking-tight text-zinc-900 dark:text-white xl:text-[2.35rem] xl:leading-[1.1]">
                The command center for modern support.
              </h1>
              <p className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-200 xl:text-[15px]">
                Elevate your operational orchestration. Simple. Systematic. Stoic.
              </p>
            </div>
            <ul className="mt-10 max-w-md space-y-6">
              <li className="flex gap-4">
                <span className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-full bg-[#f97316] text-white shadow-lg shadow-[#f97316]/25">
                  <Headphones className="size-[22px]" strokeWidth={2} aria-hidden />
                </span>
                <div className="pt-0.5">
                  <p className="text-[15px] font-semibold text-zinc-900 dark:text-white">Centralize your support</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-200">
                    One intake surface for tickets, SLAs, and escalations across departments.
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-full bg-[#f97316] text-white shadow-lg shadow-[#f97316]/25">
                  <LineChart className="size-[22px]" strokeWidth={2} aria-hidden />
                </span>
                <div className="pt-0.5">
                  <p className="text-[15px] font-semibold text-zinc-900 dark:text-white">Automated reporting</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-200">
                    KPIs and throughput visibility without spreadsheet gymnastics.
                  </p>
                </div>
              </li>
            </ul>
          </div>
        </aside>

        <div className="relative flex flex-col justify-center bg-transparent px-4 py-8 sm:px-8 lg:px-10 lg:py-12">
          <div className="mb-6 lg:hidden">
            <BrandLockup variant="auth-mobile" />
            <h2 className="mt-2 text-xl font-bold leading-snug tracking-tight text-zinc-900 dark:text-white">
              The command center for modern support.
            </h2>
            <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-500">Simple. Systematic. Stoic.</p>
          </div>

          <div className={`relative mx-auto w-full ${signupWide ? "max-w-[420px]" : "max-w-[360px]"}`}>
            <div className="rounded-xl border border-zinc-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.94))] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)] backdrop-blur-sm dark:border-zinc-700/80 dark:bg-[linear-gradient(180deg,rgba(7,11,22,0.96),rgba(4,8,16,0.94))] dark:shadow-[0_16px_48px_rgba(0,0,0,0.45)] sm:p-6">
              {children}
              {bottomBanner}
            </div>
          </div>
        </div>
      </div>

      <footer className="flex shrink-0 flex-col gap-2.5 border-t border-zinc-200 bg-[linear-gradient(90deg,rgba(255,255,255,0.82),rgba(248,250,252,0.70))] px-5 py-3.5 text-[10px] uppercase tracking-[0.14em] text-zinc-600 dark:border-zinc-800/50 dark:bg-[linear-gradient(90deg,rgba(2,4,8,0.82),rgba(7,17,36,0.70))] sm:flex-row sm:items-center sm:justify-between sm:px-10">
        <span className="normal-case tracking-normal text-zinc-600 dark:text-zinc-600">
          © {new Date().getFullYear()} AGC Technologies & Business Solutions. All rights reserved.
        </span>
        <div className="flex flex-wrap gap-x-6 gap-y-1 normal-case tracking-normal">
          <span className="cursor-default transition hover:text-zinc-700 dark:hover:text-zinc-500">Privacy Policy</span>
          <span className="cursor-default transition hover:text-zinc-700 dark:hover:text-zinc-500">Terms of Service</span>
          <span className="cursor-default transition hover:text-zinc-700 dark:hover:text-zinc-500">Security Architecture</span>
        </div>
      </footer>
    </div>
  );
}

export function PasswordRequirement({
  met,
  label,
}: {
  met: boolean;
  label: string;
}) {
  return (
    <li className="flex items-start gap-2 text-xs leading-snug text-zinc-600 dark:text-zinc-500">
      {met ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#f97316]" aria-hidden />
      ) : (
        <Circle className="mt-0.5 size-4 shrink-0 text-zinc-500 dark:text-zinc-600" aria-hidden />
      )}
      <span className={met ? "text-zinc-800 dark:text-zinc-300" : undefined}>{label}</span>
    </li>
  );
}
