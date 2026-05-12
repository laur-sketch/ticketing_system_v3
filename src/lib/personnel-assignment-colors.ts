import type { CSSProperties } from "react";

/** Rainbow assignment tags for personnel (admin-set in Personnel registry). */

export const PERSONNEL_ASSIGNMENT_COLORS = [
  { key: "RED", label: "Red", hex: "#e53935" },
  { key: "ORANGE", label: "Orange", hex: "#fb8c00" },
  { key: "YELLOW", label: "Yellow", hex: "#fdd835" },
  { key: "GREEN", label: "Green", hex: "#43a047" },
  { key: "BLUE", label: "Blue", hex: "#1e88e5" },
  { key: "INDIGO", label: "Indigo", hex: "#3949ab" },
  { key: "VIOLET", label: "Violet", hex: "#8e24aa" },
] as const;

export type PersonnelAssignmentColorKey = (typeof PERSONNEL_ASSIGNMENT_COLORS)[number]["key"];

const KEY_SET = new Set<string>(PERSONNEL_ASSIGNMENT_COLORS.map((c) => c.key));

export function isPersonnelAssignmentColorKey(
  s: string | null | undefined,
): s is PersonnelAssignmentColorKey {
  return s != null && s !== "" && KEY_SET.has(s);
}

export function personnelAssignmentHex(key: string | null | undefined): string | null {
  if (!isPersonnelAssignmentColorKey(key)) return null;
  const row = PERSONNEL_ASSIGNMENT_COLORS.find((c) => c.key === key);
  return row?.hex ?? null;
}

/** Readable text (dark or light) on top of a solid `hex` chip background. */
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

/**
 * Full-surface highlight for ticket surfaces (uses `backgroundImage` + `outline` so
 * Tailwind `ring-*` on the same node still works — avoids fighting `box-shadow`).
 */
export function personnelAssigneeHighlightStyle(hex: string | null): CSSProperties | undefined {
  if (!hex) return undefined;
  const wash = `color-mix(in srgb, ${hex} 18%, transparent)`;
  const frame = `color-mix(in srgb, ${hex} 42%, transparent)`;
  return {
    backgroundImage: `linear-gradient(${wash}, ${wash})`,
    outline: `1px solid ${frame}`,
    outlineOffset: -1,
  };
}
