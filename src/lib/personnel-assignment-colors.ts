import type { CSSProperties } from "react";

/**
 * Legacy named keys for `PortalAccount.staffAssignmentColor`.
 * New assignments prefer free-form hex (`#RRGGBB`). Named keys remain readable for existing rows.
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

/** Resolved hex for legacy named keys (same palette as `globals.css`). */
const HEX_SATURATED: Record<PersonnelAssignmentColorKey, string> = {
  RED: "#e53935",
  ORANGE: "#fb8c00",
  YELLOW: "#fdd835",
  GREEN: "#43a047",
  BLUE: "#4b8eff",
  INDIGO: "#3949ab",
  VIOLET: "#8e24aa",
};

const HEX6 = /^#([0-9a-f]{6})$/i;
const HEX3 = /^#([0-9a-f]{3})$/i;

export function isPersonnelAssignmentColorKey(
  s: string | null | undefined,
): s is PersonnelAssignmentColorKey {
  return s != null && s !== "" && KEY_SET.has(s);
}

/** Expand `#RGB` → `#RRGGBB` and normalize casing. */
export function normalizeAssignmentColorHex(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  if (!s.startsWith("#")) s = `#${s}`;
  const m6 = HEX6.exec(s);
  if (m6) return `#${m6[1]!.toLowerCase()}`;
  const m3 = HEX3.exec(s);
  if (m3) {
    const [r, g, b] = m3[1]!.toLowerCase().split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return null;
}

/**
 * Normalize a stored or typed assignment color for persistence.
 * Accepts legacy keys (RED…) or hex (`#f00`, `#ff0000`). Returns `#rrggbb` or null.
 */
export function normalizePersonnelAssignmentColor(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const asKey = trimmed.toUpperCase();
  if (isPersonnelAssignmentColorKey(asKey)) {
    return HEX_SATURATED[asKey];
  }
  return normalizeAssignmentColorHex(trimmed);
}

export function isValidPersonnelAssignmentColor(raw: string | null | undefined): boolean {
  if (raw == null || String(raw).trim() === "") return true; // empty clears
  return normalizePersonnelAssignmentColor(raw) != null;
}

/** CSS custom properties from `globals.css`, or direct hex when a free-form code is stored. */
export function personnelAssignmentCssVars(key: string | null | undefined): {
  bg: string;
  fg: string;
} | null {
  const hex = personnelAssignmentHex(key);
  if (!hex) return null;
  if (isPersonnelAssignmentColorKey(key)) {
    const k = key.toLowerCase();
    return {
      bg: `var(--personnel-assign-${k})`,
      fg: `var(--personnel-assign-${k}-fg)`,
    };
  }
  return {
    bg: hex,
    fg: personnelAssignmentContrastText(hex),
  };
}

/**
 * Resolved hex for chips / inputs. Supports legacy named keys and free-form hex.
 * The unused `theme` parameter is kept for call-site compatibility where present.
 */
export function personnelAssignmentHex(key: string | null | undefined): string | null {
  if (key == null || String(key).trim() === "") return null;
  const trimmed = String(key).trim();
  if (isPersonnelAssignmentColorKey(trimmed.toUpperCase())) {
    return HEX_SATURATED[trimmed.toUpperCase() as PersonnelAssignmentColorKey];
  }
  return normalizeAssignmentColorHex(trimmed);
}

/** Readable text on top of a solid `hex` chip (used with {@link personnelAssignmentHex}). */
export function personnelAssignmentContrastText(hex: string): string {
  const normalized = normalizeAssignmentColorHex(hex);
  if (!normalized) return "#fafafa";
  const m = HEX6.exec(normalized);
  if (!m) return "#fafafa";
  const n = (s: string) => parseInt(s, 16) / 255;
  const r = n(m[1].slice(0, 2));
  const g = n(m[1].slice(2, 4));
  const b = n(m[1].slice(4, 6));
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.42 ? "#0f172a" : "#fafafa";
}

/** Full-surface highlight for ticket rows/cards (tint from assignment color). */
export function personnelAssigneeHighlightStyleFromKey(
  key: string | null | undefined,
): CSSProperties | undefined {
  const hex = personnelAssignmentHex(key);
  if (!hex) return undefined;
  if (isPersonnelAssignmentColorKey(key)) {
    const v = `var(--personnel-assign-${key.toLowerCase()})`;
    const wash = `color-mix(in srgb, ${v} 48%, transparent)`;
    const frame = `color-mix(in srgb, ${v} 76%, transparent)`;
    return {
      backgroundImage: `linear-gradient(${wash}, ${wash})`,
      outline: `1px solid ${frame}`,
      outlineOffset: -1,
    };
  }
  const wash = `color-mix(in srgb, ${hex} 48%, transparent)`;
  const frame = `color-mix(in srgb, ${hex} 76%, transparent)`;
  return {
    backgroundImage: `linear-gradient(${wash}, ${wash})`,
    outline: `1px solid ${frame}`,
    outlineOffset: -1,
  };
}

/** @deprecated Use {@link personnelAssigneeHighlightStyleFromKey}. */
export function personnelAssigneeHighlightStyle(hex: string | null): CSSProperties | undefined {
  if (!hex) return undefined;
  const wash = `color-mix(in srgb, ${hex} 48%, transparent)`;
  const frame = `color-mix(in srgb, ${hex} 76%, transparent)`;
  return {
    backgroundImage: `linear-gradient(${wash}, ${wash})`,
    outline: `1px solid ${frame}`,
    outlineOffset: -1,
  };
}
