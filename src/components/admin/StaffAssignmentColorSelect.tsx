import { cn } from "@/lib/cn";
import {
  PERSONNEL_ASSIGNMENT_COLORS,
  personnelAssignmentContrastText,
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
 */
export function StaffAssignmentColorSelect({ value, disabled, onChange, selectClassName }: Props) {
  const hex = personnelAssignmentHex(value);
  const wash = hex ? `color-mix(in srgb, ${hex} 22%, transparent)` : null;
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
          hex
            ? "border-black/25 dark:border-white/30"
            : "border-dashed border-zinc-400 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800/90",
        )}
        style={hex ? { backgroundColor: hex } : undefined}
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
        {PERSONNEL_ASSIGNMENT_COLORS.map((c) => (
          <option
            key={c.key}
            value={c.key}
            style={{ backgroundColor: c.hex, color: personnelAssignmentContrastText(c.hex) }}
          >
            {c.label}
          </option>
        ))}
      </select>
    </div>
  );
}
