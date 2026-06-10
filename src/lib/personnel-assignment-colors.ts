import type { CSSProperties } from "react";

/**
 * Registry keys for `PortalAccount.staffAssignmentColor`.
 * Actual fill colors come from CSS variables in `globals.css` (saturated in light and dark).
 */
export const PERSONNEL_ASSIGNMENT_COLORS = [
  { key: "RED", label: "Red" },
  { key: "ORANGE", label: "Orange" },
  { key: "YELLOW", label: "Yellow" },
  { key: "GREEN", label: "Green" },
  { key: "BLUE", label: "Blue" },
  { key: "INDIGO", label: "Indigo" },
  { key: "VIOLET", label: "Violet" },
] as const;

export type PersonnelAssignmentColorKey = (typeof PERSONNEL_ASSIGNMENT_COLORS)[number]["key"];

const KEY_SET = new Set<string>(PERSONNEL_ASSIGNMENT_COLORS.map((c) => c.key));

export function isPersonnelAssignmentColorKey(
  s: string | null | undefined,
): s is PersonnelAssignmentColorKey {
  return s != null && s !== "" && KEY_SET.has(s);
}

/** CSS custom properties from `globals.css`. */
export function personnelAssignmentCssVars(key: string | null | undefined): {
  bg: string;
  fg: string;
} | null {
  if (!isPersonnelAssignmentColorKey(key)) return null;
  const k = key.toLowerCase();
  return {
    bg: `var(--personnel-assign-${k})`,
    fg: `var(--personnel-assign-${k}-fg)`,
  };
}

/**
 * Resolved hex for native `<option>` / select chrome where CSS variables are unreliable.
 * Same saturated palette as `globals.css`. The `theme` parameter is ignored (kept for call sites).
 * Prefer {@link personnelAssignmentCssVars} for chips and highlights.
 */
const HEX_SATURATED: Record<PersonnelAssignmentColorKey, string> = {
  RED: "#e53935",
  ORANGE: "#fb8c00",
  YELLOW: "#fdd835",
  GREEN: "#43a047",
  BLUE: "#4b8eff",
  INDIGO: "#3949ab",
  VIOLET: "#8e24aa",
};

export function personnelAssignmentHex(
  key: string | null | undefined,
  _theme: "light" | "dark",
): string | null {
  if (!isPersonnelAssignmentColorKey(key)) return null;
  return HEX_SATURATED[key];
}

/** Readable text on top of a solid `hex` chip (used with {@link personnelAssignmentHex}). */
export function personnelAssignmentContrastText(hex: string): string {
  const raw = hex.trim();
  const normalized = raw.startsWith("#") ? raw : `#${raw}`;
  const m = /^#([0-9a-f]{6})$/i.exec(normalized);
  if (!m) return "#fafafa";
  const n = (s: string) => parseInt(s, 16) / 255;
  const r = n(m[1].slice(0, 2));
  const g = n(m[1].slice(2, 4));
  const b = n(m[1].slice(4, 6));
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.42 ? "#0f172a" : "#fafafa";
}

/** Full-surface highlight for ticket rows/cards (tint from assignment CSS variables). */
export function personnelAssigneeHighlightStyleFromKey(
  key: string | null | undefined,
): CSSProperties | undefined {
  if (!isPersonnelAssignmentColorKey(key)) return undefined;
  const v = `var(--personnel-assign-${key.toLowerCase()})`;
  const wash = `color-mix(in srgb, ${v} 28%, transparent)`;
  const frame = `color-mix(in srgb, ${v} 52%, transparent)`;
  return {
    backgroundImage: `linear-gradient(${wash}, ${wash})`,
    outline: `1px solid ${frame}`,
    outlineOffset: -1,
  };
}

/** @deprecated Use {@link personnelAssigneeHighlightStyleFromKey} with a registry key. */
export function personnelAssigneeHighlightStyle(hex: string | null): CSSProperties | undefined {
  if (!hex) return undefined;
  const wash = `color-mix(in srgb, ${hex} 28%, transparent)`;
  const frame = `color-mix(in srgb, ${hex} 52%, transparent)`;
  return {
    backgroundImage: `linear-gradient(${wash}, ${wash})`,
    outline: `1px solid ${frame}`,
    outlineOffset: -1,
  };
}
