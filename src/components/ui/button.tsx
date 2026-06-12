import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "default" | "primary" | "accent" | "outline" | "ghost";

const variantClasses: Record<ButtonVariant, string> = {
  default:
    "bg-black text-white shadow-sm hover:bg-brand disabled:opacity-60 dark:bg-zinc-950 dark:hover:bg-brand",
  primary:
    "bg-black text-white shadow-sm hover:bg-brand disabled:opacity-60 dark:bg-zinc-950 dark:hover:bg-brand",
  accent:
    "bg-black text-white shadow-sm hover:bg-brand disabled:opacity-60 dark:bg-zinc-950 dark:hover:bg-brand",
  outline:
    "border border-border bg-surface text-foreground hover:bg-surface-muted",
  ghost:
    "text-muted hover:bg-surface-muted hover:text-foreground",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "shine-hover inline-flex items-center justify-center rounded-[var(--radius-stoic)] px-4 py-2 text-sm font-semibold transition-colors duration-200 disabled:cursor-not-allowed",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
});
