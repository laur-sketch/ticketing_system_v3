"use client";

import { useState } from "react";
import { normalizeOptionalUsDate, parseUsDateInput, ymdToUsDisplay } from "@/lib/us-date-format";
import { cn } from "@/lib/cn";

type UsDateFieldProps = {
  value?: string;
  onChange: (ymd: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
};

export function UsDateField({
  value,
  onChange,
  disabled,
  placeholder = "MM/DD/YYYY",
  className,
  "aria-label": ariaLabel,
}: UsDateFieldProps) {
  const ymd = normalizeOptionalUsDate(value) ?? "";
  const [editingText, setEditingText] = useState<string | null>(null);
  const text = editingText ?? ymdToUsDisplay(ymd);

  function commit(nextText: string) {
    const parsed = parseUsDateInput(nextText);
    if (parsed) {
      onChange(parsed);
      setEditingText(null);
      return;
    }
    if (!nextText.trim()) {
      onChange(null);
      setEditingText(null);
      return;
    }
    setEditingText(null);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      disabled={disabled}
      value={text}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => setEditingText(e.target.value)}
      onBlur={() => commit(text)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit(text);
        }
      }}
      className={cn(
        "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-900 outline-none ring-orange-500/30 focus:border-orange-500 focus:ring-2 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100",
        className,
      )}
    />
  );
}
