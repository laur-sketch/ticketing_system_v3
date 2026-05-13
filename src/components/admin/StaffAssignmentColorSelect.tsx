"use client";

import { cn } from "@/lib/cn";
import { useTheme } from "@/components/theme/ThemeProvider";
import {
  PERSONNEL_ASSIGNMENT_COLORS,
  personnelAssignmentContrastText,
  personnelAssignmentCssVars,
  personnelAssignmentHex,
} from "@/lib/personnel-assignment-colors";

type Props = {
  value: string | null | undefined;
  disabled?: boolean;
  onChange: (nextKey: string) => void;
  selectClassName: string;
};

/**
 * Native select plus a visible color swatch (closed state shows assignment color clearly).
 * Swatch uses theme CSS variables; select chrome uses resolved hex for the active value.
 */
export function StaffAssignmentColorSelect({ value, disabled, onChange, selectClassName }: Props) {
  const { theme } = useTheme();
  const swatchVars = personnelAssignmentCssVars(value);
  const hex = personnelAssignmentHex(value, theme);
  const wash = hex ? `color-mix(in srgb, ${hex} 30%, transparent)` : null;
  const label = value
    ? (PERSONNEL_ASSIGNMENT_COLORS.find((c) => c.key === value)?.label ?? value)
    : "None";

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span
        aria-hidden
        title={label}
        className={cn(
          "size-4 shrink-0 rounded-full border-2 shadow-sm",
          swatchVars
            ? "border-zinc-400/50 dark:border-zinc-500/50"
            : "border-dashed border-zinc-400 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800/90",
        )}
        style={swatchVars ? { backgroundColor: swatchVars.bg } : undefined}
      />
      <select
        disabled={disabled}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={selectClassName}
        style={
          hex && wash
            ? {
                borderColor: hex,
                color: personnelAssignmentContrastText(hex),
                backgroundImage: `linear-gradient(${wash}, ${wash})`,
              }
            : undefined
        }
      >
        <option value="">None</option>
        {PERSONNEL_ASSIGNMENT_COLORS.map((c) => {
          const optHex = personnelAssignmentHex(c.key, theme);
          return (
            <option
              key={c.key}
              value={c.key}
              style={{
                backgroundColor: optHex ?? undefined,
                color: optHex ? personnelAssignmentContrastText(optHex) : undefined,
              }}
            >
              {c.label}
            </option>
          );
        })}
      </select>
    </div>
  );
}
