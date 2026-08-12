"use client";

import { cn } from "@/lib/cn";
import { authPrimaryButtonClass, authSecondaryButtonClass } from "@/components/auth/AuthShell";

type GoogleAuthButtonProps = {
  disabled?: boolean;
  onClick: () => void;
  label?: string;
  variant?: "primary" | "secondary";
  className?: string;
};

export function GoogleAuthButton({
  disabled = false,
  onClick,
  label = "Continue with Google",
  variant = "primary",
  className = "",
}: GoogleAuthButtonProps) {
  const baseClass = variant === "primary" ? authPrimaryButtonClass : authSecondaryButtonClass;

  return (
    <button
      type="button"
      className={`${baseClass} ${className}`.trim()}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="inline-flex items-center justify-center gap-2">
        <GoogleMark />
        {disabled && label.includes("not configured") ? "Google sign-in not configured" : label}
      </span>
    </button>
  );
}

/** Monochrome Google "G" — black in light mode, white in dark mode. */
export function GoogleMark({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("text-zinc-900 dark:text-white", className)}
    >
      <path
        fill="currentColor"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09zM12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23zM5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62zM12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export function AuthDivider() {
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="h-px flex-1 bg-zinc-300 dark:bg-zinc-800/90" />
      <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-600 dark:text-zinc-500">
        or
      </span>
      <span className="h-px flex-1 bg-zinc-300 dark:bg-zinc-800/90" />
    </div>
  );
}
