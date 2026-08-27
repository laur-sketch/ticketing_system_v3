import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "default" | "primary" | "accent" | "outline" | "secondary" | "ghost" | "destructive";

type ButtonSize = "default" | "sm" | "lg" | "icon";

const variantClasses: Record<ButtonVariant, string> = {
  default:
    "bg-black text-white shadow-sm hover:bg-brand disabled:opacity-60 dark:bg-zinc-950 dark:hover:bg-brand",
  primary:
    "bg-black text-white shadow-sm hover:bg-brand disabled:opacity-60 dark:bg-zinc-950 dark:hover:bg-brand",
  accent:
    "bg-black text-white shadow-sm hover:bg-brand disabled:opacity-60 dark:bg-zinc-950 dark:hover:bg-brand",
  outline:
    "border border-border bg-surface text-foreground hover:bg-surface-muted",
  secondary:
    "border border-border bg-surface-muted text-foreground hover:bg-surface",
  ghost:
    "text-muted hover:bg-surface-muted hover:text-foreground",
  destructive:
    "bg-rose-600 text-white shadow-sm hover:bg-rose-500",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "px-4 py-2",
  sm: "px-2.5 py-1 text-xs",
  lg: "px-6 py-3 text-base",
  icon: "size-9 p-0",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "default", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "shine-hover inline-flex items-center justify-center rounded-[var(--radius-stoic)] text-sm font-semibold transition-colors duration-200 disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
});
