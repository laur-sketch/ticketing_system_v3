"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { usePhilippineTimeSync } from "@/hooks/usePhilippineTimeSync";
import { formatPhilippineBarClock } from "@/lib/philippine-time";
import { BRAND_TITLE } from "@/lib/brand";
import { cn } from "@/lib/cn";

export const launchPadLabelClass =
  "block text-[10px] font-bold uppercase tracking-[0.2em] text-[#ff6b00]";

export const launchPadInputClass =
  "w-full rounded-xl border border-[#333] bg-[rgba(10,10,10,0.6)] px-4 py-3 text-sm text-white placeholder:text-[#666] outline-none transition " +
  "focus:border-[#ff6b00] focus:shadow-[0_0_0_1px_#ff6b00]";

export const launchPadPrimaryButtonClass =
  "relative z-0 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#e66000] to-[#ff7a1a] py-3 text-sm font-semibold text-white transition " +
  "hover:from-[#ff7a1a] hover:to-[#e66000] hover:shadow-[0_4px_15px_rgba(255,107,0,0.3)] " +
  "disabled:pointer-events-none disabled:opacity-55";

export const launchPadOutlineButtonClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm font-medium text-white transition " +
  "hover:border-white/20 hover:bg-white/[0.05] disabled:pointer-events-none disabled:opacity-55";

function LaunchPadClock({ className }: { className?: string }) {
  const epochMs = usePhilippineTimeSync();
  const parts = epochMs != null ? formatPhilippineBarClock(epochMs) : null;
  const time =
    parts != null ? `${parts.hours}:${parts.minutes}:${parts.seconds}` : "--:--:--";

  return (
    <div
      className={cn("relative inline-block", className)}
      aria-live="polite"
      aria-label={parts?.ariaLabel ?? "Loading Philippine time"}
    >
      <div aria-hidden className="absolute inset-0 rounded-full bg-[#ff6b00]/20 blur-3xl" />
      <div
        className={cn(
          "relative flex animate-[launchpad-glow_3s_ease-in-out_infinite_alternate] items-center justify-center gap-6",
          "rounded-2xl border border-white/10 bg-black/60 p-6 backdrop-blur-md",
        )}
      >
        <div
          aria-hidden
          className="flex h-12 w-2 flex-col justify-between border-l border-[#ff6b00]/30 py-1"
        >
          <div className="h-px w-2 bg-[#ff6b00]/50" />
          <div className="h-px w-1 bg-[#ff6b00]/30" />
          <div className="h-px w-2 bg-[#ff6b00]/50" />
        </div>
        <div
          className={cn(
            "font-mono text-5xl font-bold tabular-nums tracking-[0.1em] text-[#ff6b00] sm:text-7xl",
            "[text-shadow:0_0_10px_rgba(255,107,0,0.5)]",
          )}
        >
          {time}
        </div>
        <div
          aria-hidden
          className="flex h-12 w-2 flex-col items-end justify-between border-r border-[#ff6b00]/30 py-1"
        >
          <div className="h-px w-2 bg-[#ff6b00]/50" />
          <div className="h-px w-1 bg-[#ff6b00]/30" />
          <div className="h-px w-2 bg-[#ff6b00]/50" />
        </div>
      </div>
    </div>
  );
}

export function SignInLaunchPadShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col bg-[#050505] text-[#e0e0e0] selection:bg-[#ff6b00] selection:text-white">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_15%_50%,rgba(255,107,0,0.05),transparent_40%),radial-gradient(circle_at_85%_30%,rgba(255,107,0,0.03),transparent_40%)]"
      />

      <header className="relative z-20 flex w-full shrink-0 items-center justify-between border-b border-white/5 bg-[#050505]/95 px-6 py-4 backdrop-blur-sm">
        <Link href="/signin" className="inline-flex items-center gap-3">
          <BrandLogo className="h-8 w-auto max-w-[180px]" />
          <span className="hidden text-base font-semibold tracking-tight text-white sm:inline">
            {BRAND_TITLE}
          </span>
        </Link>
        <nav className="flex items-center gap-4 text-sm font-medium sm:gap-6">
          <ThemeToggle />
          <Link href="/process" className="hidden text-gray-300 transition-colors hover:text-white sm:inline">
            Support
          </Link>
        </nav>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center gap-10 px-6 py-10 sm:gap-12 sm:py-14">
        <div className="px-2 pt-3 text-center">
          <div className="inline-block animate-[launchpad-float_6s_ease-in-out_infinite]">
            <LaunchPadClock />
          </div>
          <h1 className="mx-auto mt-8 max-w-2xl text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
            The command center for
            <br />
            modern support.
          </h1>
        </div>

        <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/5 bg-[rgba(26,26,26,0.4)] p-8 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] backdrop-blur-[12px] sm:p-10">
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
          />
          {children}
        </div>
      </main>

      <footer className="relative z-10 flex w-full shrink-0 flex-col items-center justify-between gap-4 border-t border-white/5 bg-[#050505]/95 px-6 py-4 text-xs text-gray-500 backdrop-blur-sm sm:flex-row sm:gap-0">
        <div>
          © {new Date().getFullYear()} AGC Technologies &amp; Business Solutions. All rights
          reserved.
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          <span className="cursor-default transition-colors hover:text-gray-300">Privacy Policy</span>
          <span className="cursor-default transition-colors hover:text-gray-300">
            Terms of Service
          </span>
          <span className="cursor-default transition-colors hover:text-gray-300">
            Security Architecture
          </span>
        </div>
      </footer>
    </div>
  );
}
