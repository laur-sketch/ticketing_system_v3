"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCircle2, Circle, Headphones, LineChart } from "lucide-react";
import { BrandLockup } from "@/components/BrandLockup";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

/** StoicOps brand accent */
export const AUTH_ACCENT = "#ff5c00";
export const AUTH_ACCENT_HOVER = "#ff7a2f";
export const authLabelClass = "stoic-label";

export const authInputClass =
  "w-full rounded-[var(--radius-stoic)] border border-border bg-surface px-3.5 py-2.5 text-sm leading-snug text-foreground shadow-[inset_0_1px_0_rgba(0,0,0,0.02)] placeholder:text-muted transition outline-none " +
  "hover:border-[color-mix(in_srgb,var(--border)_70%,var(--foreground)_30%)] hover:bg-surface-muted " +
  "focus:border-brand focus:bg-surface focus:ring-2 focus:ring-[color-mix(in_srgb,var(--brand)_28%,transparent)] " +
  "dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]";

export const authPrimaryButtonClass =
  "stoic-btn-primary flex h-11 w-full text-sm shadow-[0_6px_20px_color-mix(in_srgb,var(--brand)_35%,transparent)] active:translate-y-px disabled:pointer-events-none disabled:opacity-55";

export const authSecondaryButtonClass =
  "stoic-btn-outline flex h-9 w-full text-xs active:translate-y-px";

type AuthMode = "signin" | "signup";

const authNavLinkClass = "font-semibold text-brand transition hover:text-brand-hover";

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
    <div className="relative flex min-h-screen flex-col overflow-x-clip bg-background text-foreground antialiased">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_12%_8%,color-mix(in_srgb,var(--brand)_14%,transparent),transparent_58%)] dark:bg-[radial-gradient(80%_60%_at_12%_8%,color-mix(in_srgb,var(--brand)_22%,transparent),transparent_58%)]"
      />
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-surface/90 px-5 py-3.5 backdrop-blur-md sm:px-10">
        <BrandLockup variant="auth-header" href="/" />
        <nav className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2 text-[13px]">
          <ThemeToggle />
          <Link href="/process" className="text-muted transition hover:text-foreground">
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
        <aside className="relative hidden overflow-hidden border-border lg:block lg:border-r">
          <div className="absolute inset-0 bg-surface-muted/50" aria-hidden />
          <div className="relative flex min-h-[min(100vh,880px)] flex-col justify-center px-10 py-16 xl:px-16 xl:py-20">
            <div className="max-w-[26rem]">
              <h1 className="text-[2rem] font-bold leading-[1.12] tracking-tight text-foreground xl:text-[2.35rem] xl:leading-[1.1]">
                The command center for modern support.
              </h1>
              <p className="mt-4 text-sm leading-relaxed text-muted xl:text-[15px]">
                Elevate your operational orchestration. Simple. Systematic. Stoic.
              </p>
            </div>
            <ul className="mt-10 max-w-md space-y-6">
              <li className="flex gap-4">
                <span className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-stoic)] bg-brand text-brand-ink shadow-lg shadow-[color-mix(in_srgb,var(--brand)_30%,transparent)]">
                  <Headphones className="size-[22px]" strokeWidth={2} aria-hidden />
                </span>
                <div className="pt-0.5">
                  <p className="text-[15px] font-semibold text-foreground">Centralize your support</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    One intake surface for tickets, SLAs, and escalations across departments.
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-stoic)] bg-brand text-brand-ink shadow-lg shadow-[color-mix(in_srgb,var(--brand)_30%,transparent)]">
                  <LineChart className="size-[22px]" strokeWidth={2} aria-hidden />
                </span>
                <div className="pt-0.5">
                  <p className="text-[15px] font-semibold text-foreground">Automated reporting</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">
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
            <h2 className="mt-2 text-xl font-bold leading-snug tracking-tight text-foreground">
              The command center for modern support.
            </h2>
            <p className="mt-1.5 text-xs text-muted">Simple. Systematic. Stoic.</p>
          </div>

          <div className={`relative mx-auto w-full ${signupWide ? "max-w-[420px]" : "max-w-[360px]"}`}>
            <div className="stoic-card-elevated p-5 sm:p-6">
              {children}
              {bottomBanner}
            </div>
          </div>
        </div>
      </div>

      <footer className="flex shrink-0 flex-col gap-2.5 border-t border-border bg-surface/90 px-5 py-3.5 text-[10px] uppercase tracking-[0.14em] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-10">
        <span className="normal-case tracking-normal text-muted">
          © {new Date().getFullYear()} AGC Technologies & Business Solutions. All rights reserved.
        </span>
        <div className="flex flex-wrap gap-x-6 gap-y-1 normal-case tracking-normal">
          <span className="cursor-default transition hover:text-foreground">Privacy Policy</span>
          <span className="cursor-default transition hover:text-foreground">Terms of Service</span>
          <span className="cursor-default transition hover:text-foreground">Security Architecture</span>
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
    <li className="flex items-start gap-2 text-xs leading-snug text-muted">
      {met ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
      ) : (
        <Circle className="mt-0.5 size-4 shrink-0 text-muted-subtle" aria-hidden />
      )}
      <span className={met ? "text-foreground" : undefined}>{label}</span>
    </li>
  );
}
