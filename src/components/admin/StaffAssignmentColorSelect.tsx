"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import {
  isValidPersonnelAssignmentColor,
  normalizePersonnelAssignmentColor,
  personnelAssignmentContrastText,
  personnelAssignmentCssVars,
  personnelAssignmentHex,
} from "@/lib/personnel-assignment-colors";

type Props = {
  value: string | null | undefined;
  disabled?: boolean;
  /** Called with normalized `#rrggbb` or `""` to clear. */
  onChange: (nextColor: string) => void;
  /** Input className (legacy prop name `selectClassName` kept for call sites). */
  selectClassName: string;
};

function displayValueFromStored(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  return personnelAssignmentHex(value) ?? value.trim();
}

/**
 * Free-text color code input with live swatch preview.
 * Accepts hex (`#RGB` / `#RRGGBB`); empty clears. Saves on blur / Enter when valid.
 */
export function StaffAssignmentColorSelect({ value, disabled, onChange, selectClassName }: Props) {
  const [draft, setDraft] = useState(() => displayValueFromStored(value));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(displayValueFromStored(value));
    setError(null);
  }, [value]);

  const swatchVars = personnelAssignmentCssVars(draft.trim() || value);
  const resolvedPreview = personnelAssignmentHex(draft.trim() || value);
  const wash = resolvedPreview
    ? `color-mix(in srgb, ${resolvedPreview} 30%, transparent)`
    : null;

  function commit() {
    const trimmed = draft.trim();
    if (!trimmed) {
      setError(null);
      setDraft("");
      if (value) onChange("");
      return;
    }
    if (!isValidPersonnelAssignmentColor(trimmed)) {
      setError("Use a hex color like #FF5733");
      return;
    }
    const normalized = normalizePersonnelAssignmentColor(trimmed) ?? "";
    setError(null);
    setDraft(normalized);
    const current = normalizePersonnelAssignmentColor(value) ?? "";
    if (normalized !== current) {
      onChange(normalized);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          aria-hidden
          title={resolvedPreview ?? "No color"}
          className={cn(
            "size-4 shrink-0 rounded-full border-2 shadow-sm",
            resolvedPreview
              ? "border-zinc-400/50 dark:border-zinc-500/50"
              : "border-dashed border-zinc-400 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800/90",
          )}
          style={
            resolvedPreview
              ? { backgroundColor: swatchVars?.bg ?? resolvedPreview }
              : undefined
          }
        />
        <input
          type="text"
          inputMode="text"
          spellCheck={false}
          disabled={disabled}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onBlur={() => commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === "Escape") {
              setDraft(displayValueFromStored(value));
              setError(null);
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="#FF5733"
          aria-label="Assignment color code"
          aria-invalid={error ? true : undefined}
          className={cn(selectClassName, "font-mono uppercase")}
          style={
            resolvedPreview && wash
              ? {
                  borderColor: resolvedPreview,
                  color: personnelAssignmentContrastText(resolvedPreview),
                  backgroundImage: `linear-gradient(${wash}, ${wash})`,
                }
              : undefined
          }
        />
        {/* Native color picker as a convenience; syncs hex into the text field */}
        <input
          type="color"
          disabled={disabled}
          value={resolvedPreview && HEX6_OK(resolvedPreview) ? resolvedPreview : "#888888"}
          onChange={(e) => {
            const next = e.target.value.toLowerCase();
            setDraft(next);
            setError(null);
            const current = normalizePersonnelAssignmentColor(value) ?? "";
            if (next !== current) onChange(next);
          }}
          aria-label="Pick assignment color"
          className="h-7 w-7 shrink-0 cursor-pointer rounded border border-zinc-300 bg-transparent p-0 dark:border-zinc-600"
          title="Pick color"
        />
      </div>
      {error ? (
        <p className="text-[10px] font-medium text-rose-600 dark:text-rose-300">{error}</p>
      ) : null}
    </div>
  );
}

function HEX6_OK(hex: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(hex);
}
