"use client";

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

export function GoogleMark({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.8-5.5 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.3 14.7 2.4 12 2.4A9.6 9.6 0 0 0 2.4 12 9.6 9.6 0 0 0 12 21.6c5.6 0 9.3-3.9 9.3-9.4 0-.6-.1-1.1-.2-2H12z"
      />
      <path fill="#34A853" d="M2.4 12c0 3.7 2.1 7 5.2 8.6l3-2.5c-.8-.2-1.5-.7-2.1-1.2C7.7 16 7.2 14.9 7 13.8l-3-.2V12z" />
      <path fill="#4285F4" d="M12 21.6c2.7 0 4.9-.9 6.6-2.5l-3.2-2.6c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.2l-3 .2A9.6 9.6 0 0 0 12 21.6z" />
      <path fill="#FBBC05" d="M7 13.8a5.8 5.8 0 0 1 0-3.6V7.9l-3-.2A9.6 9.6 0 0 0 2.4 12c0 1.5.3 2.9.9 4.2l3.7-2.4z" />
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
