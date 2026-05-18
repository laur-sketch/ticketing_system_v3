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
  /** `month` uses YYYY-MM (no day); default is full calendar date. */
  granularity?: "date" | "month";
};

function formatMonthLabel(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym.trim());
  if (!m) return ym;
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const mi = Number(m[2]) - 1;
  if (mi < 0 || mi > 11) return ym;
  return `${monthNames[mi]} ${m[1]}`;
}

export function DatePickerField({
  wrapperClassName,
  shellClassName,
  inputClassName,
  className,
  disabled,
  value,
  granularity = "date",
  ...props
}: DatePickerFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const displayValue = typeof value === "string" ? value : "";
  const isMonth = granularity === "month";
  const placeholder = isMonth ? "YYYY-MM" : "YYYY-MM-DD";
  const shown =
    isMonth && /^\d{4}-\d{2}$/.test(displayValue) ? formatMonthLabel(displayValue) : displayValue;

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
          {shown || placeholder}
        </span>
        <Calendar className="size-4 shrink-0 text-zinc-600 dark:text-zinc-200" strokeWidth={2} aria-hidden />
      </div>
      <input
        ref={inputRef}
        type={isMonth ? "month" : "date"}
        disabled={disabled}
        value={value}
        tabIndex={disabled ? -1 : 0}
        aria-label={props["aria-label"] ?? props.name ?? (isMonth ? "Month" : "Date")}
        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        {...props}
      />
    </div>
  );
}
