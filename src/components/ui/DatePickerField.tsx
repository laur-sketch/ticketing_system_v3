"use client";

import { Calendar } from "lucide-react";
import { useRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const datePickerShellClass =
  "flex h-[42px] w-full items-center justify-between gap-2 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

type DatePickerFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  wrapperClassName?: string;
  shellClassName?: string;
  /** @deprecated Use shellClassName */
  inputClassName?: string;
};

export function DatePickerField({
  wrapperClassName,
  shellClassName,
  inputClassName,
  className,
  disabled,
  value,
  ...props
}: DatePickerFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const displayValue = typeof value === "string" ? value : "";

  function openPicker() {
    const el = inputRef.current;
    if (!el || disabled) return;
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
        return;
      } catch {
        /* showPicker can throw if not user-gesture in some browsers */
      }
    }
    el.focus();
  }

  return (
    <div
      className={cn(
        "relative focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/20",
        wrapperClassName,
        className,
      )}
      onClick={() => openPicker()}
      role="presentation"
    >
      <div
        aria-hidden
        className={cn(datePickerShellClass, "pointer-events-none", disabled && "opacity-50", shellClassName, inputClassName)}
      >
        <span className={cn("min-w-0 flex-1 tabular-nums", !displayValue && "text-zinc-400 dark:text-zinc-500")}>
          {displayValue || "YYYY-MM-DD"}
        </span>
        <Calendar className="size-4 shrink-0 text-zinc-600 dark:text-zinc-200" strokeWidth={2} aria-hidden />
      </div>
      <input
        ref={inputRef}
        type="date"
        disabled={disabled}
        value={value}
        tabIndex={disabled ? -1 : 0}
        aria-label={props["aria-label"] ?? props.name ?? "Date"}
        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        {...props}
      />
    </div>
  );
}
