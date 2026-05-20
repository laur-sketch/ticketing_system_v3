"use client";

import type { LucideIcon } from "lucide-react";
import {
  Cloud,
  Headphones,
  LayoutGrid,
  Router,
  Server,
  Shield,
  Smile,
  Wrench,
} from "lucide-react";
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

const PILLAR_ICONS: Record<ItTaskPillarTitle, LucideIcon> = {
  "SYSTEM AVAILABILITY": Server,
  "HELPDESK SUPPORT": Headphones,
  CYBERSECURITY: Shield,
  "DATA BACKUP": Cloud,
  "SYSTEM MAINTENANCE": Wrench,
  "USER SUPPORT": Smile,
  "IT PROJECT IMPLEMENTATION": LayoutGrid,
  "NETWORK PERFORMANCE": Router,
};

/** Helpdesk pillar: closed vs remainder of denominator (cadence-specific). */
const SEG_COLORS_HELPDESK = {
  closed: "#166534",
  remainder: "#71717a",
} as const;

/** User support pillar: ticket status mix */
const SEG_COLORS_USER_SUPPORT = {
  forConfirmation: "#d97706",
  closed: "#166534",
} as const;

/** Two-bucket pillars: on-track + on-time vs overdue (same underlying kanban logic). */
const SEG_COLORS_BINARY_KPI = {
  positive: "#166534",
  negative: "#e11d48",
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

function PillarDonutCard({
  pillar,
  segments,
  headline,
  subline,
}: {
  pillar: ItTaskPillarTitle;
  segments: DonutSegment[];
  headline: string;
  subline: string;
}) {
  const Icon = PILLAR_ICONS[pillar];
  const total = segments.reduce((a, s) => a + s.value, 0);
  const cx = 50;
  const cy = 50;
  const rOut = 36;
  const rIn = 22;
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
    <article className="flex flex-col rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)] dark:border-zinc-700/80 dark:bg-zinc-900/40 dark:shadow-[0_12px_32px_rgba(0,0,0,0.35)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">
            {pillar}
          </p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
            {headline}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">{subline}</p>
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
                stroke="#e4e4e7"
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
                      stroke="#f4f4f5"
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
                    stroke="#f4f4f5"
                    strokeWidth="0.35"
                    className="dark:stroke-zinc-950"
                  />
                ),
              )}
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

function checklistPeriodNote(
  metricsCadence: KpiFrequencyCode,
  counted: number,
  inRange: number,
): string {
  if (inRange <= 1 && counted <= 1) {
    if (metricsCadence === "DAILY") return " · this day";
    if (metricsCadence === "WEEKLY") return " · this week";
    return " · this month";
  }
  if (metricsCadence === "DAILY") {
    return inRange > 1 ? ` · ${counted}/${inRange} days` : " · recorded snapshot";
  }
  if (metricsCadence === "WEEKLY") {
    if (inRange <= 1) return " · monthly snapshot in week";
    return ` · avg of ${counted}/${inRange} working day${inRange === 1 ? "" : "s"} in week`;
  }
  if (inRange <= 1) return " · monthly snapshot";
  return ` · avg of ${counted}/${inRange} working day${inRange === 1 ? "" : "s"} in month`;
}

function checklistEmptySubline(metricsCadence: KpiFrequencyCode, inRange: number): string {
  if (metricsCadence === "DAILY") {
    return inRange > 0 ? "No recorded checklist data for this day" : "No daily checklist KPI for this pillar";
  }
  if (metricsCadence === "WEEKLY") {
    return inRange > 0 ? "No recorded checklist data for this week" : "No daily checklist KPI for this pillar";
  }
  return inRange > 0 ? "No recorded checklist data for this month" : "No daily checklist KPI for this pillar";
}

function checklistSubline(
  metricsCadence: KpiFrequencyCode,
  agg: KpiChecklistProgress & { periodsCounted?: number; periodsInRange?: number },
  view: { positive: number; negative: number; percent: number; inverted: boolean },
  cfg: { positiveLabel: string; negativeLabel: string },
): string {
  const counted = agg.periodsCounted ?? 0;
  const inRange = agg.periodsInRange ?? 0;
  const periodNote = checklistPeriodNote(metricsCadence, counted, inRange);
  if (agg.total === 0) {
    return checklistEmptySubline(metricsCadence, inRange);
  }
  if (view.inverted) {
    return `${view.positive}/${agg.total} ${cfg.positiveLabel.toLowerCase()} · ${view.negative} ${cfg.negativeLabel.toLowerCase()} · ${view.percent}%${periodNote}`;
  }
  if (cfg.positiveLabel === "On time" && cfg.negativeLabel === "Delayed") {
    return `${agg.done}/${agg.total} on time · ${agg.missing} delayed · ${view.percent}%${periodNote}`;
  }
  return `${agg.done}/${agg.total} checked · ${agg.missing} missing · ${view.percent}%${periodNote}`;
}

function userSupportSegments(us: TaskMetricsUserSupportTickets): DonutSegment[] {
  return [
    {
      key: "forConfirmation",
      label: "For Confirmation",
      value: us.forConfirmation,
      color: SEG_COLORS_USER_SUPPORT.forConfirmation,
    },
    {
      key: "closed",
      label: "Closed",
      value: us.closed,
      color: SEG_COLORS_USER_SUPPORT.closed,
    },
  ];
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
  const cadenceHeadline =
    metricsCadence === "DAILY" ? "Daily" : metricsCadence === "WEEKLY" ? "Weekly" : "Monthly";

  return (
    <div className="space-y-3">
      {reportingPeriodLabel ? (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          <span className="font-semibold text-zinc-800 dark:text-zinc-200">{cadenceHeadline} view</span>
          {" · "}
          {reportingPeriodLabel}
        </p>
      ) : null}
      <div
        className={cn(
          "grid gap-4",
          "sm:grid-cols-2",
          "xl:grid-cols-4",
        )}
      >
      {IT_TASK_PILLAR_TITLES.map((pillar) => {
        if (pillar === "HELPDESK SUPPORT") {
          const ht = helpdeskTickets;
          const segments = ht ? helpdeskRatioSegments(ht) : [];
          const headline =
            ht?.ratio != null ? `${Math.round(ht.ratio * 100)}%` : "—";
          const rangeLabel =
            metricsCadence === "DAILY"
              ? "this day"
              : metricsCadence === "WEEKLY"
                ? "this week"
                : "this month";
          const subline =
            !ht ? "" : `${ht.closedCount} closed ÷ ${ht.openTicketsInPeriod} open · ${rangeLabel}`;
          return (
            <PillarDonutCard
              key={pillar}
              pillar={pillar}
              segments={segments}
              headline={headline}
              subline={subline}
            />
          );
        }

        if (pillar === "USER SUPPORT") {
          const us = userSupportTickets;
          const segments = us ? userSupportSegments(us) : [];
          const total = us?.total ?? 0;
          const headline = total === 0 ? "—" : `${total} ticket${total === 1 ? "" : "s"}`;
          const rangeLabel =
            metricsCadence === "DAILY"
              ? "this day"
              : metricsCadence === "WEEKLY"
                ? "this week"
                : "this month";
          const subline =
            total === 0
              ? `No For Confirmation or Closed tickets updated in ${rangeLabel}`
              : `For Confirmation · Closed · updated in ${rangeLabel}`;
          return (
            <PillarDonutCard
              key={pillar}
              pillar={pillar}
              segments={segments}
              headline={headline}
              subline={subline}
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
          const segments = checklistProgressSegments(view, cfg.positiveLabel, cfg.negativeLabel, {
            hideZeroNegative: invert,
          });
          const headline = agg.total === 0 ? "—" : `${view.percent}% ${cfg.metricName}`;
          return (
            <PillarDonutCard
              key={pillar}
              pillar={pillar}
              segments={segments}
              headline={headline}
              subline={checklistSubline(metricsCadence, agg, view, cfg)}
            />
          );
        }

        return null;
      })}
      </div>
    </div>
  );
}
