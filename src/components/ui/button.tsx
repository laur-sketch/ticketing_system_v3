import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "accent" | "outline" | "ghost";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-brand-ink shadow-sm hover:bg-brand-hover disabled:opacity-60",
  accent:
    "bg-brand text-brand-ink shadow-sm hover:bg-brand-hover disabled:opacity-60",
  outline:
    "border border-border bg-surface text-foreground hover:bg-surface-muted",
  ghost:
    "text-muted hover:bg-surface-muted hover:text-foreground",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export function Button({ className, variant = "primary", ...props }: Props) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-[var(--radius-stoic)] px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
