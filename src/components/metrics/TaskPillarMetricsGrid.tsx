"use client";

import type { LucideIcon } from "lucide-react";
import {
  Cloud,
  Activity,
  Headphones,
  LayoutGrid,
  Router,
  Server,
  Shield,
  Smile,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { IT_TASK_PILLAR_TITLES, type ItTaskPillarTitle } from "@/lib/it-task-pillar-titles";
import { type KpiFrequencyCode } from "@/lib/kpi-recurrence";
import {
  isInvertedChecklistPillar,
  kpiChecklistMetricView,
  type KpiChecklistProgress,
} from "@/lib/kpi-subkpis";
import type {
  TaskChecklistPillarMetrics,
  TaskMetricsHelpdeskTickets,
  TaskMetricsUserSupportTickets,
} from "@/lib/kpis";
import {
  KPI_DONUT_COLORS,
  KINETIC_PALETTE,
  USER_SUPPORT_STAR_COLORS,
} from "@/lib/kinetic-palette";

const PILLAR_ICONS: Record<ItTaskPillarTitle, LucideIcon> = {
  "SYSTEM AVAILABILITY": Server,
  "HELPDESK SUPPORT": Headphones,
  CYBERSECURITY: Shield,
  "DATA BACKUP": Cloud,
  "SYSTEM MAINTENANCE": Wrench,
  MONITORING: Activity,
  "PREVENTIVE MAINTENANCE": Wrench,
  "USER SUPPORT": Smile,
  "IT PROJECT IMPLEMENTATION": LayoutGrid,
  "NETWORK PERFORMANCE": Router,
};

/** Helpdesk pillar: closed vs remainder of denominator (cadence-specific). */
const SEG_COLORS_HELPDESK = {
  closed: KPI_DONUT_COLORS.closed,
  remainder: KPI_DONUT_COLORS.remainder,
} as const;

/** User support pillar: ticket status mix */
const SEG_COLORS_USER_SUPPORT = USER_SUPPORT_STAR_COLORS;

/** Two-bucket pillars: on-track + on-time vs overdue (same underlying kanban logic). */
const SEG_COLORS_BINARY_KPI = {
  positive: KPI_DONUT_COLORS.positive,
  negative: KPI_DONUT_COLORS.negative,
} as const;

/** Donut wedge in viewBox centered at (50,50). */
function donutSlicePath(
  cx: number,
  cy: number,
  rOut: number,
  rIn: number,
  startAngle: number,
  endAngle: number,
): string {
  const x1 = cx + rOut * Math.cos(startAngle);
  const y1 = cy + rOut * Math.sin(startAngle);
  const x2 = cx + rOut * Math.cos(endAngle);
  const y2 = cy + rOut * Math.sin(endAngle);
  const x3 = cx + rIn * Math.cos(endAngle);
  const y3 = cy + rIn * Math.sin(endAngle);
  const x4 = cx + rIn * Math.cos(startAngle);
  const y4 = cy + rIn * Math.sin(startAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${x1} ${y1} A ${rOut} ${rOut} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${rIn} ${rIn} 0 ${largeArc} 0 ${x4} ${y4} Z`;
}

type DonutSegment = { key: string; label: string; value: number; color: string };
const IT_SALF_CSV_COLUMNS = ["DATE", "", "ALI", "ACI", "MCHISI", "AWIC", "EASYGAS", "EFF %"];
const MONITORING_CSV_COLUMNS = ["DONE", "ON GOING", "NOT STARTED", "EFF %"];
const DAILY_PROGRESS_CSV_COLUMNS = ["DATE", "DONE", "ON GOING", "NOT STARTED", "EFF %"];

function PillarDonutCard({
  pillar,
  segments,
  headline,
  onInspect,
}: {
  pillar: ItTaskPillarTitle;
  segments: DonutSegment[];
  headline: string;
  onInspect: () => void;
}) {
  const Icon = PILLAR_ICONS[pillar];
  const [lastTapMs, setLastTapMs] = useState(0);
  const total = segments.reduce((a, s) => a + s.value, 0);
  const cx = 50;
  const cy = 50;
  const rOut = 36;
  const rIn = 24;
  const centerLabel = headline.split(" ")[0] ?? headline;
  let angle = -Math.PI / 2;
  const paths: { d: string; color: string; label: string; value: number }[] = [];

  if (total > 0) {
    for (const seg of segments) {
      if (seg.value <= 0) continue;
      const sliceAngle = (seg.value / total) * 2 * Math.PI;
      const isFull = sliceAngle >= 2 * Math.PI - 1e-3;
      if (isFull) {
        paths.push({ d: "__FULL__", color: seg.color, label: seg.label, value: seg.value });
        angle += sliceAngle;
        continue;
      }
      const end = angle + sliceAngle;
      paths.push({
        d: donutSlicePath(cx, cy, rOut, rIn, angle, end),
        color: seg.color,
        label: seg.label,
        value: seg.value,
      });
      angle = end;
    }
  }

  return (
    <article
      role="button"
      tabIndex={0}
      title="Double-click or double-tap to inspect data source"
      onDoubleClick={onInspect}
      onKeyDown={(e) => {
        if (e.key === "Enter") onInspect();
      }}
      onTouchEnd={() => {
        const now = Date.now();
        if (now - lastTapMs < 350) onInspect();
        setLastTapMs(now);
      }}
      className="flex cursor-pointer flex-col rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)] outline-none transition hover:border-orange-300 focus:ring-2 focus:ring-orange-500/30 dark:border-zinc-700/80 dark:bg-zinc-900/40 dark:shadow-[0_12px_32px_rgba(0,0,0,0.35)] dark:hover:border-orange-700/70"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">
            {pillar}
          </p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
            {headline}
          </p>
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
        </span>
      </div>

      <div className="mt-4 flex flex-1 flex-col items-center">
        <svg viewBox="0 0 100 100" className="mx-auto h-36 w-36" aria-hidden>
          {total === 0 ? (
            <>
              <circle
                cx={cx}
                cy={cy}
                r={rOut}
                fill="none"
                stroke={KINETIC_PALETTE.donutTrack}
                strokeWidth={6}
                className="dark:stroke-zinc-700"
              />
              <circle
                cx={cx}
                cy={cy}
                r={rIn}
                fill="white"
                className="dark:fill-zinc-900/80"
              />
              <text
                x={cx}
                y={cy + 3}
                textAnchor="middle"
                className="fill-zinc-900 text-[9px] font-black dark:fill-zinc-100"
              >
                {centerLabel}
              </text>
            </>
          ) : (
            <>
              {paths.map((p, i) =>
                p.d === "__FULL__" ? (
                  <g key={`${p.label}-full`}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={rOut}
                      fill={p.color}
                      stroke={KINETIC_PALETTE.donutStroke}
                      strokeWidth="0.35"
                      className="dark:stroke-zinc-950"
                    />
                    <circle cx={cx} cy={cy} r={rIn} fill="white" className="dark:fill-zinc-900/80" />
                  </g>
                ) : (
                  <path
                    key={`${p.label}-${i}`}
                    d={p.d}
                    fill={p.color}
                    stroke={KINETIC_PALETTE.donutStroke}
                    strokeWidth="0.35"
                    className="dark:stroke-zinc-950"
                  />
                ),
              )}
              <circle cx={cx} cy={cy} r={rIn} fill="white" className="dark:fill-zinc-900/80" />
              <text
                x={cx}
                y={cy + 3}
                textAnchor="middle"
                className="fill-zinc-900 text-[9px] font-black dark:fill-zinc-100"
              >
                {centerLabel}
              </text>
            </>
          )}
        </svg>
        <ul className="mt-3 grid w-full gap-1.5 text-[11px]">
          {segments.map((s) => (
            <li key={s.key} className="flex items-center justify-between gap-2 text-zinc-600 dark:text-zinc-400">
              <span className="flex items-center gap-2">
                <span className="size-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                {s.label}
              </span>
              <span className="tabular-nums font-semibold text-zinc-900 dark:text-zinc-200">{s.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

const CHECKLIST_PILLAR_CONFIG: Partial<
  Record<
    ItTaskPillarTitle,
    {
      positiveLabel: string;
      negativeLabel: string;
      metricName: string;
      /** Unchecked = safe/uptime; checked on task board = breach/downtime. */
      invertChecklist?: boolean;
    }
  >
> = {
  "SYSTEM AVAILABILITY": { positiveLabel: "Uptime", negativeLabel: "Downtime", metricName: "uptime" },
  CYBERSECURITY: {
    positiveLabel: "Safe",
    negativeLabel: "Breached",
    metricName: "safe",
    invertChecklist: true,
  },
  "DATA BACKUP": { positiveLabel: "Done", negativeLabel: "Failed", metricName: "done" },
  "SYSTEM MAINTENANCE": { positiveLabel: "Done", negativeLabel: "Failed", metricName: "done" },
  MONITORING: { positiveLabel: "Done", negativeLabel: "Failed", metricName: "done" },
  "PREVENTIVE MAINTENANCE": { positiveLabel: "Done", negativeLabel: "Failed", metricName: "done" },
  "IT PROJECT IMPLEMENTATION": {
    positiveLabel: "On time",
    negativeLabel: "Delayed",
    metricName: "on time",
  },
  "NETWORK PERFORMANCE": {
    positiveLabel: "Uptime",
    negativeLabel: "Downtime",
    metricName: "uptime",
    invertChecklist: true,
  },
};

function checklistProgressSegments(
  view: { positive: number; negative: number },
  positiveLabel: string,
  negativeLabel: string,
  opts?: { hideZeroNegative?: boolean },
): DonutSegment[] {
  const segments: DonutSegment[] = [
    {
      key: "positive",
      label: positiveLabel,
      value: view.positive,
      color: SEG_COLORS_BINARY_KPI.positive,
    },
    {
      key: "negative",
      label: negativeLabel,
      value: view.negative,
      color: SEG_COLORS_BINARY_KPI.negative,
    },
  ];
  if (opts?.hideZeroNegative) {
    return segments.filter((s) => s.value > 0);
  }
  return segments;
}

function userSupportSegments(us: TaskMetricsUserSupportTickets): DonutSegment[] {
  return us.starCounts
    .filter((row) => row.count > 0)
    .map((row) => ({
      key: `${row.star}-star`,
      label: `${row.star} star${row.star === 1 ? "" : "s"}`,
      value: row.count,
      color: SEG_COLORS_USER_SUPPORT[row.star],
    }));
}

function helpdeskRatioSegments(ht: TaskMetricsHelpdeskTickets): DonutSegment[] {
  const closed = ht.closedCount;
  const open = ht.openTicketsInPeriod;
  const closedLabel =
    ht.cadence === "DAILY" ? "Closed on day" : ht.cadence === "WEEKLY" ? "Closed in week" : "Closed in month";
  const openLabel =
    ht.cadence === "DAILY" ? "Open on day" : ht.cadence === "WEEKLY" ? "Open in week" : "Open in month";
  return [
    { key: "closed", label: closedLabel, value: closed, color: SEG_COLORS_HELPDESK.closed },
    { key: "open", label: openLabel, value: open, color: SEG_COLORS_HELPDESK.remainder },
  ];
}

function incidentOnlyHeadline(agg: KpiChecklistProgress, view: { negative: number }, metricName: string): string {
  const incidentPercent = agg.total > 0 ? Math.round((view.negative / agg.total) * 100) : 0;
  return `${incidentPercent}% ${metricName}`;
}

function spreadsheetColumnLabel(index: number): string {
  let n = index + 1;
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

function monthTokenFromLabel(label: string): string {
  const months = [
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
  const compactMonths = label
    .split(/[^A-Za-z]+/)
    .filter((part) => months.some((month) => month.toLowerCase().startsWith(part.toLowerCase())))
    .map((part) => {
      const month = months.find((m) => m.toLowerCase().startsWith(part.toLowerCase()));
      return month ? month.toUpperCase() : "";
    })
    .filter(Boolean);
  const unique = [...new Set(compactMonths)];
  if (unique.length === 0) return "";
  if (unique.length === 1) return unique[0]!;
  return `${unique[0]}-${unique[unique.length - 1]}`;
}

function csvDateLabelForCadence(cadence: KpiFrequencyCode, label: string): string {
  if (cadence === "DAILY") {
    const parsed = new Date(label);
    if (Number.isFinite(parsed.getTime())) {
      return parsed.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    }
    return label;
  }
  if (cadence === "WEEKLY") return `Week: ${label}`;
  if (cadence === "MONTHLY") return label;
  if (cadence === "QUARTERLY") return `Quarterly: ${label}`;
  return label;
}

function formatDailyProgressDate(ymd: string): string {
  const parsed = new Date(`${ymd}T00:00:00`);
  if (!Number.isFinite(parsed.getTime())) return ymd;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function csvLayoutRowsForPillar(args: {
  pillar: ItTaskPillarTitle;
  metricsCadence: KpiFrequencyCode;
  reportingPeriodLabel?: string;
  helpdeskTickets: TaskMetricsHelpdeskTickets | null;
  userSupportTickets: TaskMetricsUserSupportTickets | null;
  checklistPillars: TaskChecklistPillarMetrics | null;
}): string[][] {
  const { pillar, metricsCadence, reportingPeriodLabel, helpdeskTickets, userSupportTickets, checklistPillars } = args;
  const label = reportingPeriodLabel ?? "Current report";
  const dateLabel = csvDateLabelForCadence(metricsCadence, label);
  const month = monthTokenFromLabel(label) || metricsCadence;
  if (pillar === "HELPDESK SUPPORT") {
    const closed = helpdeskTickets?.closedCount ?? 0;
    const open = helpdeskTickets?.openTicketsInPeriod ?? 0;
    const percent = helpdeskTickets?.percent == null ? "0%" : `${helpdeskTickets.percent}%`;
    return [
      [dateLabel, month, String(closed), String(open), String(helpdeskTickets?.requestsInRange ?? 0), String(helpdeskTickets?.openBacklog ?? 0), String(closed + open), percent],
    ];
  }
  if (pillar === "USER SUPPORT") {
    const average = userSupportTickets?.averageRating;
    const rated = userSupportTickets?.ratedTickets ?? 0;
    const total = userSupportTickets?.totalTickets ?? 0;
    return [
      [
        dateLabel,
        month,
        average == null ? "" : average.toFixed(2),
        String(rated),
        String(total),
        String(userSupportTickets?.unratedTickets ?? 0),
        "",
        average == null ? "No ratings" : `${average.toFixed(2)}/5`,
      ],
    ];
  }
  const agg = checklistPillars?.[pillar];
  if (pillar === "MONITORING") {
    const done = agg?.done ?? 0;
    const notStarted = agg?.missing ?? 0;
    const percent = (agg?.total ?? 0) > 0 ? `${agg?.percent ?? 0}%` : "0%";
    return [[String(done), "0", String(notStarted), percent]];
  }
  const cfg = CHECKLIST_PILLAR_CONFIG[pillar];
  const invert = cfg?.invertChecklist === true || isInvertedChecklistPillar(pillar);
  const view = kpiChecklistMetricView(
    {
      total: agg?.total ?? 0,
      done: agg?.done ?? 0,
      missing: agg?.missing ?? 0,
      percent: agg?.percent ?? 0,
    },
    invert,
  );
  const total = agg?.total ?? 0;
  const positive = view.positive;
  const negative = view.negative;
  const percent = total > 0 ? `${view.percent}%` : "0%";
  return [
    [
      dateLabel,
      month,
      positive > 0 ? "TRUE" : "FALSE",
      positive > 1 ? "TRUE" : "FALSE",
      positive > 2 ? "TRUE" : "FALSE",
      negative > 0 ? "FALSE" : positive > 3 ? "TRUE" : "",
      positive > 4 ? "TRUE" : "",
      percent,
    ],
  ];
}

function sourceDetailsForPillar(args: {
  pillar: ItTaskPillarTitle;
  metricsCadence: KpiFrequencyCode;
  reportingPeriodLabel?: string;
  helpdeskTickets: TaskMetricsHelpdeskTickets | null;
  userSupportTickets: TaskMetricsUserSupportTickets | null;
  checklistPillars: TaskChecklistPillarMetrics | null;
}): {
  title: string;
  rows: Array<{ label: string; value: string }>;
  assigneeProgress: Array<{ id: string; name: string; role: string; total: number; done: number; percent: number }>;
  tableColumns: string[];
  tableRows: string[][];
  csvColumns: string[];
  csvRows: string[][];
  showCsvPreview: boolean;
  notes: string[];
} {
  const { pillar, metricsCadence, reportingPeriodLabel, helpdeskTickets, userSupportTickets, checklistPillars } = args;
  if (pillar === "HELPDESK SUPPORT") {
    const total = (helpdeskTickets?.closedCount ?? 0) + (helpdeskTickets?.openTicketsInPeriod ?? 0);
    return {
      title: "Helpdesk Support Source",
      rows: [
        { label: "Collected from", value: "Ticket records plus imported helpdesk CSV snapshots when available" },
        { label: "Recorded as", value: "Closed vs open ticket counts for the selected working-day range" },
        { label: "Range", value: reportingPeriodLabel ?? `${helpdeskTickets?.rangeFromYmd ?? "n/a"} to ${helpdeskTickets?.rangeToYmd ?? "n/a"}` },
        { label: "Closed", value: String(helpdeskTickets?.closedCount ?? 0) },
        { label: "Open", value: String(helpdeskTickets?.openTicketsInPeriod ?? 0) },
      ],
      assigneeProgress: [],
      tableColumns: ["Metric", "Value", "How it is used"],
      tableRows: [
        ["Closed tickets", String(helpdeskTickets?.closedCount ?? 0), "Numerator for helpdesk support percent"],
        ["Open tickets in period", String(helpdeskTickets?.openTicketsInPeriod ?? 0), "Open workload counted in denominator"],
        ["Closed + open total", String(total), "Denominator for the headline percent"],
        ["Requests in range", String(helpdeskTickets?.requestsInRange ?? 0), "Ticket volume context for the same range"],
        ["Open backlog", String(helpdeskTickets?.openBacklog ?? 0), "Current non-closed backlog for the selected scope"],
        ["Headline percent", helpdeskTickets?.percent == null ? "n/a" : `${helpdeskTickets.percent}%`, "closed / (closed + open)"],
      ],
      csvColumns: IT_SALF_CSV_COLUMNS,
      csvRows: csvLayoutRowsForPillar(args),
      showCsvPreview: false,
      notes: ["The headline percent is closed / (closed + open) for the selected cadence."],
    };
  }
  if (pillar === "USER SUPPORT") {
    const average = userSupportTickets?.averageRating;
    const rated = userSupportTickets?.ratedTickets ?? 0;
    const total = userSupportTickets?.totalTickets ?? 0;
    return {
      title: "User Support Source",
      rows: [
        { label: "Collected from", value: "Ticket star ratings submitted for tickets in the selected reporting period" },
        { label: "Recorded as", value: "Average CSAT star rating across rated tickets" },
        { label: "Average rating", value: average == null ? "No ratings yet" : `${average.toFixed(2)} / 5` },
        { label: "Rated tickets", value: String(rated) },
        { label: "Total tickets", value: String(total) },
      ],
      assigneeProgress: [],
      tableColumns: ["Rating", "Count", "Recorded meaning"],
      tableRows: [
        ...(userSupportTickets?.starCounts ?? []).map((row) => [
          `${row.star} star${row.star === 1 ? "" : "s"}`,
          String(row.count),
          row.label,
        ]),
        ["Rated tickets", String(rated), "Tickets with submitted star ratings"],
        ["Unrated tickets", String(userSupportTickets?.unratedTickets ?? 0), "Tickets in the selected period without a rating"],
      ],
      csvColumns: IT_SALF_CSV_COLUMNS,
      csvRows: csvLayoutRowsForPillar(args),
      showCsvPreview: false,
      notes: ["This pillar reflects customer star ratings instead of ticket confirmation statuses."],
    };
  }
  const agg = checklistPillars?.[pillar];
  const cfg = CHECKLIST_PILLAR_CONFIG[pillar];
  const cadenceLabel = metricsCadence.toLowerCase();
  const invert = cfg?.invertChecklist === true || isInvertedChecklistPillar(pillar);
  const dailyCsvRows = (agg?.dailyProgressRows ?? []).map((row) => {
    const dailyView = kpiChecklistMetricView(row, invert);
    const donePercent = dailyView.percent;
    const notStartedPercent = Math.max(0, 100 - donePercent);
    return [
      formatDailyProgressDate(row.date),
      String(donePercent),
      "0",
      String(notStartedPercent),
      `${dailyView.percent}%`,
    ];
  });
  const sourceCsvRows =
    dailyCsvRows.length > 0
      ? dailyCsvRows
      : agg?.csvRows && agg.csvRows.length > 0
        ? agg.csvRows
        : csvLayoutRowsForPillar(args);
  const csvColumns =
    dailyCsvRows.length > 0 ? DAILY_PROGRESS_CSV_COLUMNS : pillar === "MONITORING" ? MONITORING_CSV_COLUMNS : IT_SALF_CSV_COLUMNS;
  const view = kpiChecklistMetricView(
    {
      total: agg?.total ?? 0,
      done: agg?.done ?? 0,
      missing: agg?.missing ?? 0,
      percent: agg?.percent ?? 0,
    },
    invert,
  );
  return {
    title: `${pillar} Source`,
    rows: [
      {
        label: "Collected from",
        value: dailyCsvRows.length
          ? "Daily KPI maintenance period snapshots for this reporting range"
          : agg?.csvRows?.length
          ? "Imported IT SALF CSV rows for the selected reporting range"
          : "Task Board KPI checklist rows under this pillar",
      },
      { label: "Recorded as", value: "KPI maintenance period snapshots, with the current active period read live" },
      { label: "Cadence", value: metricsCadence },
      { label: "Mapped KPI rows", value: `Recurring ${cadenceLabel} KPI rows titled "${pillar}"` },
      { label: "Counted periods", value: `${agg?.periodsCounted ?? 0} of ${agg?.periodsInRange ?? 0}` },
      { label: cfg?.positiveLabel ?? "Done", value: String(agg?.done ?? 0) },
      { label: cfg?.negativeLabel ?? "Missing", value: String(agg?.missing ?? 0) },
    ],
    assigneeProgress: agg?.assigneeProgress ?? [],
    tableColumns: ["Gathered field", "Value", "Recorded source"],
    tableRows: [
      ["Task rows counted", String(agg?.total ?? 0), `KPI checklist items for ${pillar}`],
      ["Checked / done rows", String(agg?.done ?? 0), "Task Board checkbox completions"],
      ["Unchecked / missing rows", String(agg?.missing ?? 0), "Task Board rows not checked in the counted period"],
      ["Positive bucket", String(view.positive), `${cfg?.positiveLabel ?? "Positive"} display bucket`],
      ["Negative bucket", String(view.negative), `${cfg?.negativeLabel ?? "Negative"} display bucket`],
      ["Stored checklist percent", `${agg?.percent ?? 0}%`, "Raw done / total snapshot percent"],
      ["Displayed metric percent", `${view.percent}%`, invert ? "Inverted display percent" : "Checklist display percent"],
      ["Periods with data", String(agg?.periodsCounted ?? 0), "Periods where task data or snapshots were available"],
      ["Periods in range", String(agg?.periodsInRange ?? 0), "All expected periods for the selected cadence/range"],
      ["Cadence", metricsCadence, `Recurring ${cadenceLabel} KPI rows selected for this pillar`],
    ],
    csvColumns,
    csvRows: sourceCsvRows,
    showCsvPreview: true,
    notes: [
      dailyCsvRows.length
        ? "CSV preview lists daily progress rows from the same snapshots used by this metric."
        : agg?.csvRows?.length
        ? "Weekly and monthly extended views show the matching rows from the imported IT SALF CSV files."
        : "Checkboxes on the Task Board are the source of completion data.",
      "Past periods come from immutable snapshots; only the current period uses live task card data.",
    ],
  };
}

export function TaskPillarMetricsGrid({
  checklistPillars,
  metricsCadence,
  reportingPeriodLabel,
  helpdeskTickets,
  userSupportTickets,
}: {
  /** Checklist pillar metrics from snapshots (range-aware averages). */
  checklistPillars: TaskChecklistPillarMetrics | null;
  metricsCadence: KpiFrequencyCode;
  reportingPeriodLabel?: string;
  helpdeskTickets: TaskMetricsHelpdeskTickets | null;
  userSupportTickets: TaskMetricsUserSupportTickets | null;
}) {
  const [inspectedPillar, setInspectedPillar] = useState<ItTaskPillarTitle | null>(null);
  const [extendedView, setExtendedView] = useState(false);
  const inspected = inspectedPillar
    ? sourceDetailsForPillar({
        pillar: inspectedPillar,
        metricsCadence,
        reportingPeriodLabel,
        helpdeskTickets,
        userSupportTickets,
        checklistPillars,
      })
    : null;

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "grid gap-4",
          "sm:grid-cols-2",
          "xl:grid-cols-4",
        )}
      >
      {IT_TASK_PILLAR_TITLES.map((pillar) => {
        if (pillar === "IT PROJECT IMPLEMENTATION") {
          return null;
        }

        if (pillar === "HELPDESK SUPPORT") {
          const ht = helpdeskTickets;
          const segments = ht ? helpdeskRatioSegments(ht) : [];
          const headline =
            ht?.percent != null
              ? `${Number.isInteger(ht.percent) ? ht.percent : ht.percent.toFixed(1)}%`
              : "—";
          return (
            <PillarDonutCard
              key={pillar}
              pillar={pillar}
              segments={segments}
              headline={headline}
              onInspect={() => {
                setInspectedPillar(pillar);
                setExtendedView(false);
              }}
            />
          );
        }

        if (pillar === "USER SUPPORT") {
          const us = userSupportTickets;
          const segments = us ? userSupportSegments(us) : [];
          const headline =
            us?.averageRating == null ? "—" : `${us.averageRating.toFixed(2)}/5 avg rating`;
          return (
            <PillarDonutCard
              key={pillar}
              pillar={pillar}
              segments={segments}
              headline={headline}
              onInspect={() => {
                setInspectedPillar(pillar);
                setExtendedView(false);
              }}
            />
          );
        }

        const cfg = CHECKLIST_PILLAR_CONFIG[pillar];
        if (cfg) {
          const agg = checklistPillars?.[pillar] ?? {
            total: 0,
            done: 0,
            missing: 0,
            percent: 0,
            periodsCounted: 0,
            periodsInRange: 0,
          };
          const invert =
            cfg.invertChecklist === true || isInvertedChecklistPillar(pillar);
          const view = kpiChecklistMetricView(agg, invert);
          const isNetworkPerformance = pillar === "NETWORK PERFORMANCE";
          const isCybersecurity = pillar === "CYBERSECURITY";
          const incidentOnly = isNetworkPerformance || isCybersecurity;
          const incidentMetricName = isCybersecurity ? "breached" : "downtime";
          const segments = checklistProgressSegments(view, cfg.positiveLabel, cfg.negativeLabel, {
            hideZeroNegative: invert,
          });
          const headline = incidentOnly
            ? incidentOnlyHeadline(agg, view, incidentMetricName)
            : agg.total === 0
              ? "—"
              : `${view.percent}% ${cfg.metricName}`;
          return (
            <PillarDonutCard
              key={pillar}
              pillar={pillar}
              segments={segments}
              headline={headline}
              onInspect={() => {
                setInspectedPillar(pillar);
                setExtendedView(false);
              }}
            />
          );
        }

        return null;
      })}
      </div>
      {inspected ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6"
          role="dialog"
          aria-modal="true"
          onClick={() => setInspectedPillar(null)}
        >
          <div
            className={cn(
              "flex max-h-[calc(100dvh-3rem)] w-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-950",
              extendedView ? "max-w-4xl" : "max-w-lg",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-zinc-200 p-5 pb-4 dark:border-zinc-800">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-300">
                  Task metrics source
                </p>
                <h3 className="mt-1 text-lg font-bold text-zinc-950 dark:text-zinc-50">{inspected.title}</h3>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setExtendedView((v) => !v)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-semibold",
                    extendedView
                      ? "border-orange-500 bg-orange-500/15 text-orange-800 dark:text-orange-100"
                      : "border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800",
                  )}
                >
                  {extendedView ? "Compact view" : "Extend view"}
                </button>
                <button
                  type="button"
                  onClick={() => setInspectedPillar(null)}
                  className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Close
                </button>
              </div>
            </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
            <dl className="mt-4 divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
              {inspected.rows.map((row) => (
                <div key={row.label} className="grid gap-1 py-2 sm:grid-cols-[10rem_1fr]">
                  <dt className="font-semibold text-zinc-600 dark:text-zinc-400">{row.label}</dt>
                  <dd className="text-zinc-950 dark:text-zinc-100">{row.value}</dd>
                </div>
              ))}
            </dl>
            <ul className="mt-4 space-y-1 rounded-xl bg-zinc-100 p-3 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              {inspected.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            {extendedView ? (
              <div className="mt-4 space-y-3">
                {inspected.assigneeProgress.length > 0 ? (
                  <section className="overflow-hidden rounded-xl border border-zinc-300 bg-zinc-50 shadow-inner dark:border-zinc-700 dark:bg-zinc-900/70">
                    <div className="border-b border-zinc-300 bg-zinc-100 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
                      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                        Assignee/Sub Assignee Progress
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                        Average contribution scaled to the same progress shown in this metric donut.
                      </p>
                    </div>
                    <div className="max-h-44 space-y-2 overflow-y-auto bg-white p-3 dark:bg-zinc-950">
                      {inspected.assigneeProgress.map((row) => (
                        <div key={row.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 dark:border-zinc-800 dark:bg-zinc-900/60">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">{row.name}</p>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                                {row.role}
                              </p>
                            </div>
                            <div className="text-right font-mono text-xs font-bold tabular-nums text-zinc-700 dark:text-zinc-300">
                              {row.percent}%
                            </div>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                            <div
                              className="h-full rounded-full bg-[var(--accent-teal)]"
                              style={{ width: `${Math.min(100, Math.max(0, row.percent))}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
                <div className="overflow-hidden rounded-xl border border-zinc-300 bg-zinc-50 shadow-inner dark:border-zinc-700 dark:bg-zinc-900/70">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-300 bg-zinc-100 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
                  <div>
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                      {inspected.showCsvPreview ? "CSV Preview" : "Extended Details"}
                    </p>
                    {inspected.showCsvPreview ? (
                      <p className="mt-0.5 font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        {inspected.title.replace(/\s+/g, "_").toLowerCase()}_metrics.csv
                      </p>
                    ) : null}
                  </div>
                  <p className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 font-mono text-[10px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                    {inspected.showCsvPreview
                      ? `${inspected.csvRows.length} rows · ${inspected.csvColumns.length} columns`
                      : `${inspected.tableRows.length} details`}
                  </p>
                </div>
                {inspected.showCsvPreview ? (
                  <>
                    <div className="border-b border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950">
                      <p className="truncate font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                        {inspected.csvColumns.join(",")}
                      </p>
                    </div>
                    <div className="max-h-[30vh] overflow-auto bg-white dark:bg-zinc-950">
                      <table className="w-full min-w-[760px] border-collapse text-left font-mono text-xs">
                        <thead className="bg-zinc-200 text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          <tr>
                            <th className="w-12 border-b border-r border-zinc-300 px-2 py-1.5 text-center dark:border-zinc-700">
                              #
                            </th>
                            {inspected.csvColumns.map((col, colIndex) => (
                              <th
                                key={`col-label-${col}-${colIndex}`}
                                className="border-b border-r border-zinc-300 px-3 py-1.5 text-center dark:border-zinc-700"
                              >
                                {spreadsheetColumnLabel(colIndex)}
                              </th>
                            ))}
                          </tr>
                          <tr>
                            <th className="w-12 border-b border-r border-zinc-300 bg-zinc-100 px-2 py-2 text-center dark:border-zinc-700 dark:bg-zinc-900">
                              1
                            </th>
                            {inspected.csvColumns.map((_, colIndex) => (
                              <th
                                key={`blank-1-${colIndex}`}
                                className="border-b border-r border-zinc-300 bg-white px-3 py-2 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950"
                              />
                            ))}
                          </tr>
                          <tr>
                            <th className="w-12 border-b border-r border-zinc-300 bg-zinc-100 px-2 py-2 text-center dark:border-zinc-700 dark:bg-zinc-900">
                              2
                            </th>
                            {inspected.csvColumns.map((_, colIndex) => (
                              <th
                                key={`blank-2-${colIndex}`}
                                className="border-b border-r border-zinc-300 bg-white px-3 py-2 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950"
                              />
                            ))}
                          </tr>
                          <tr>
                            <th className="w-12 border-b border-r border-zinc-300 bg-zinc-100 px-2 py-2 text-center dark:border-zinc-700 dark:bg-zinc-900">
                              3
                            </th>
                            {inspected.csvColumns.map((col, colIndex) => (
                              <th
                                key={`${col}-${colIndex}`}
                                className="border-b border-r border-zinc-300 bg-zinc-100 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
                              >
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {inspected.csvRows.map((row, rowIndex) => (
                            <tr key={`${row[0]}-${rowIndex}`} className="bg-white even:bg-zinc-50 dark:bg-zinc-950 dark:even:bg-zinc-900/40">
                              <td className="border-r border-b border-zinc-200 bg-zinc-100 px-2 py-2 text-center text-[10px] font-semibold text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
                                {rowIndex + 4}
                              </td>
                              {row.map((cell, cellIndex) => (
                                <td
                                  key={`${row[0]}-${cellIndex}`}
                                  className={cn(
                                    "border-r border-b border-zinc-200 px-3 py-2 align-top text-zinc-700 dark:border-zinc-800 dark:text-zinc-300",
                                    cellIndex === 0 && "font-semibold text-zinc-950 dark:text-zinc-100",
                                    cellIndex === 1 && "tabular-nums text-orange-700 dark:text-orange-300",
                                  )}
                                >
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : null}
                <div className={cn("bg-zinc-50 px-3 py-3 dark:bg-zinc-900/70", inspected.showCsvPreview && "border-t border-zinc-300 dark:border-zinc-700")}>
                  <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                    {inspected.showCsvPreview ? "Extra source details" : "Source details"}
                  </p>
                  <div className="max-h-40 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <table className="w-full min-w-[640px] border-collapse font-mono text-[11px]">
                      <thead className="bg-zinc-100 text-left text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                        <tr>
                          {inspected.tableColumns.map((col) => (
                            <th key={col} className="border-b border-r border-zinc-200 px-2 py-1.5 dark:border-zinc-800">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {inspected.tableRows.map((row, rowIndex) => (
                          <tr key={`extra-${row[0]}-${rowIndex}`} className="bg-white even:bg-zinc-50 dark:bg-zinc-950 dark:even:bg-zinc-900/40">
                            {row.map((cell, cellIndex) => (
                              <td
                                key={`extra-${row[0]}-${cellIndex}`}
                                className="border-b border-r border-zinc-200 px-2 py-1.5 align-top text-zinc-700 dark:border-zinc-800 dark:text-zinc-300"
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                {inspected.showCsvPreview ? (
                  <div className="flex items-center justify-between gap-2 border-t border-zinc-300 bg-zinc-100 px-3 py-2 font-mono text-[10px] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                    <span>UTF-8 · comma-separated values</span>
                    <span>Generated from current Task Metrics payload</span>
                  </div>
                ) : null}
                </div>
              </div>
            ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
