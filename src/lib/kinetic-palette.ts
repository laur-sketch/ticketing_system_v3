/** Kinetic Oversight — Electric palette (DESIGN.md). Shared by CSS tokens and SVG/chart code. */
export const KINETIC_PALETTE = {
  background: "#0a0a0a",
  foreground: "#e2e2e2",
  muted: "#e4beb1",
  mutedSubtle: "#ab897d",
  surface: "#131313",
  surfaceElevated: "#1f1f1f",
  surfaceMuted: "#1b1b1b",
  border: "#353535",
  brand: "#ff5c00",
  brandHover: "#ff7a2f",
  brandSoft: "#ffb59a",
  accentBlue: "#4b8eff",
  accentBlueSoft: "#adc6ff",
  accentTeal: "#00a49c",
  accentTealBright: "#39dcd2",
  danger: "#ffb4ab",
  dangerStrong: "#93000a",
  warning: "#ffb59a",
  neutral: "#6f6f6f",
  gridLight: "#e4e4e7",
  gridDark: "#353535",
  donutTrack: "#353535",
  donutStroke: "#e2e2e2",
  onSurface: "#e2e2e2",
} as const;

/** Task / KPI donut segments */
export const KPI_DONUT_COLORS = {
  positive: KINETIC_PALETTE.accentTealBright,
  negative: KINETIC_PALETTE.danger,
  neutral: KINETIC_PALETTE.neutral,
  closed: KINETIC_PALETTE.accentTeal,
  remainder: KINETIC_PALETTE.neutral,
} as const;

/** User support satisfaction stars (1 = worst, 5 = best) */
export const USER_SUPPORT_STAR_COLORS: Record<number, string> = {
  1: KINETIC_PALETTE.dangerStrong,
  2: KINETIC_PALETTE.brand,
  3: KINETIC_PALETTE.brandSoft,
  4: KINETIC_PALETTE.accentTeal,
  5: KINETIC_PALETTE.accentTealBright,
};

/** Rotating palette for multi-series pie charts */
export const PIE_CHART_CYCLE = [
  KINETIC_PALETTE.brand,
  KINETIC_PALETTE.accentTealBright,
  KINETIC_PALETTE.accentBlue,
  KINETIC_PALETTE.brandSoft,
  KINETIC_PALETTE.accentBlueSoft,
  KINETIC_PALETTE.danger,
] as const;

export function pieChartColor(index: number) {
  return PIE_CHART_CYCLE[index % PIE_CHART_CYCLE.length]!;
}

/** Ticket status chart colors */
export const TICKET_STATUS_CHART_COLORS: Record<string, string> = {
  IN_PROGRESS: KINETIC_PALETTE.brand,
  OPEN: KINETIC_PALETTE.danger,
  PENDING_INFO: KINETIC_PALETTE.accentTealBright,
  ESCALATED: KINETIC_PALETTE.accentBlue,
  FOR_CONFIRMATION: KINETIC_PALETTE.muted,
  RESOLVED: KINETIC_PALETTE.accentBlueSoft,
  CLOSED: KINETIC_PALETTE.neutral,
};

export function ticketStatusChartColor(status: string) {
  return TICKET_STATUS_CHART_COLORS[status] ?? KINETIC_PALETTE.neutral;
}
