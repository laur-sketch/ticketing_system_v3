"use client";

import { cn } from "@/lib/cn";

const ORANGE = "#f97316";
const ZINC_AXIS = "#3f3f46";
const ZINC_LINE = "#a1a1aa";

function formatStatus(status: string) {
  return status.replaceAll("_", " ");
}

/** Created vs closed tickets per day (UTC buckets). */
export function MetricsTrendChart({
  labels,
  created,
  closed,
}: {
  labels: string[];
  created: number[];
  closed: number[];
}) {
  if (labels.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 py-14 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-500">
        Expand the reporting window or add ticket activity to plot trends.
      </div>
    );
  }

  const padX = 2;
  const padY = 4;
  const w = 100;
  const h = 42;
  const n = Math.max(labels.length, 1);
  const max = Math.max(1, ...created, ...closed);
  const xAt = (i: number) => (n <= 1 ? w / 2 : padX + ((w - 2 * padX) * i) / Math.max(n - 1, 1));
  const yAt = (v: number) => h - padY - ((h - 2 * padY) * v) / max;

  const createdPts = created.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");
  const closedPts = closed.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");

  const areaD =
    n === 0
      ? ""
      : `M ${xAt(0)} ${h - padY} L ${created.map((v, i) => `${xAt(i)} ${yAt(v)}`).join(" L ")} L ${xAt(n - 1)} ${h - padY} Z`;

  const tickIdx =
    n <= 5
      ? [...Array(n).keys()]
      : [0, Math.floor(n / 2), n - 1].filter((i, idx, a) => a.indexOf(i) === idx);

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-44 w-full overflow-visible sm:h-52"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="metricsTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ORANGE} stopOpacity="0.35" />
            <stop offset="100%" stopColor={ORANGE} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1={padX}
            x2={w - padX}
            y1={padY + (h - 2 * padY) * (1 - t)}
            y2={padY + (h - 2 * padY) * (1 - t)}
            stroke={ZINC_AXIS}
            strokeWidth={0.15}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {n > 0 && areaD ? <path d={areaD} fill="url(#metricsTrendFill)" /> : null}
        {n > 0 ? (
          <polyline fill="none" stroke={ORANGE} strokeWidth={0.45} points={createdPts} vectorEffect="non-scaling-stroke" />
        ) : null}
        {n > 0 ? (
          <polyline fill="none" stroke={ZINC_LINE} strokeWidth={0.4} points={closedPts} vectorEffect="non-scaling-stroke" />
        ) : null}
      </svg>
      <div className="mt-2 flex flex-wrap justify-between gap-x-2 text-[10px] font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-500">
        {tickIdx.map((i) => (
          <span key={labels[i] ?? i}>{labels[i]?.slice(5) ?? "—"}</span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-600 dark:text-zinc-400">
        <span className="inline-flex items-center gap-2">
          <span className="size-2 rounded-sm bg-orange-500" /> Created
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-2 rounded-sm bg-zinc-400" /> Closed
        </span>
      </div>
    </div>
  );
}

/** Semi-circular gauge 0–100% for SLA-style metrics. */
export function MetricsGauge({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | null;
  sub?: string;
}) {
  const pct = value == null ? null : Math.max(0, Math.min(1, value));
  const r = 36;
  const cx = 50;
  const cy = 52;
  /** Half-arc length along the semicircle path */
  const arcLen = Math.PI * r;
  const dash = pct == null ? 0 : pct * arcLen;

  return (
    <div className="flex flex-col items-center text-center">
      <svg viewBox="0 0 100 60" className="h-24 w-full max-w-[140px]" aria-hidden>
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="#27272a"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={ORANGE}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${arcLen}`}
          className={cn(pct == null && "opacity-25")}
        />
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-zinc-100 text-[14px] font-bold">
          {pct == null ? "—" : `${Math.round(pct * 100)}%`}
        </text>
      </svg>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{label}</p>
      {sub ? <p className="mt-0.5 text-[10px] text-zinc-600">{sub}</p> : null}
    </div>
  );
}

/** Pie chart for task / KPI board mix (Current / Done / Delayed). */
export function MetricsPieChart({
  segments,
  title,
  subtitle,
  itemsLabel,
  emptyDescription,
  pieClassName,
}: {
  title: string;
  subtitle?: string;
  segments: { label: string; value: number; color: string }[];
  /** Badge text for total count, e.g. `(n) => \`${n} tasks\`` */
  itemsLabel?: (total: number) => string;
  emptyDescription?: string;
  pieClassName?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const cx = 50;
  const cy = 50;
  const r = 38;
  let angle = -Math.PI / 2;
  /** Full 100% slice: SVG elliptical arc collapses when start === end; use a circle instead. */
  const slices: { d: string; color: string; label: string; value: number; full?: boolean }[] = [];

  if (total > 0) {
    for (const seg of segments) {
      if (seg.value <= 0) continue;
      const sliceAngle = (seg.value / total) * 2 * Math.PI;
      const isFullDisk = sliceAngle >= 2 * Math.PI - 1e-3;
      if (isFullDisk) {
        slices.push({ d: "", color: seg.color, label: seg.label, value: seg.value, full: true });
        angle += sliceAngle;
        continue;
      }
      const end = angle + sliceAngle;
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(end);
      const y2 = cy + r * Math.sin(end);
      const largeArc = sliceAngle > Math.PI ? 1 : 0;
      const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
      slices.push({ d, color: seg.color, label: seg.label, value: seg.value, full: false });
      angle = end;
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-600 dark:text-zinc-500">{title}</p>
          {subtitle ? (
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{subtitle}</p>
          ) : null}
        </div>
        {total > 0 ? (
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-200">
            {itemsLabel ? itemsLabel(total) : `${total} KPI${total === 1 ? "" : "s"}`}
          </span>
        ) : null}
      </div>
      {total === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-zinc-300 py-12 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-500">
          {emptyDescription ?? "No recurring KPIs for this frequency in scope."}
        </p>
      ) : (
        <div className="mt-5 flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-8">
          <svg
            viewBox="0 0 100 100"
            className={cn("mx-auto shrink-0 sm:mx-0", pieClassName ?? "h-48 w-48")}
            aria-hidden
          >
            {slices.map((s, i) =>
              s.full ? (
                <circle
                  key={`${s.label}-${i}-full`}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={s.color}
                  stroke="#18181b"
                  strokeWidth="0.35"
                />
              ) : (
                <path key={`${s.label}-${i}`} d={s.d} fill={s.color} stroke="#18181b" strokeWidth="0.35" />
              ),
            )}
            <circle cx={cx} cy={cy} r={10} className="fill-white dark:fill-zinc-950" />
            <text
              x={cx}
              y={cy + 2}
              textAnchor="middle"
              className="fill-zinc-900 text-[7px] font-bold dark:fill-zinc-100"
            >
              {total}
            </text>
          </svg>
          <ul className="grid w-full gap-2 text-sm sm:max-w-xs">
            {segments.map((seg) => (
              <li key={seg.label} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                  <span className="size-3 rounded-sm" style={{ backgroundColor: seg.color }} />
                  {seg.label}
                </span>
                <span className="tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">{seg.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Horizontal bars — normalized to max row. */
export function MetricsBarChart({
  rows,
  title,
}: {
  title: string;
  rows: { label: string; value: number }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-600 dark:text-zinc-500">{title}</p>
      <div className="mt-4 space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-500">No data in this range.</p>
        ) : (
          rows.map((row) => (
            <div key={row.label}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="truncate font-medium text-zinc-800 dark:text-zinc-300">{row.label}</span>
                <span className="tabular-nums text-zinc-600 dark:text-zinc-400">{row.value}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-700 to-orange-500 transition-[width]"
                  style={{ width: `${(row.value / max) * 100}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** Stacked segments for open-queue status mix. */
export function MetricsQueueStrip({
  segments,
}: {
  segments: { status: string; count: number }[];
}) {
  const total = segments.reduce((s, x) => s + x.count, 0);
  if (total === 0) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-500">No active queue items.</p>;
  }

  const tones = [
    "bg-orange-600",
    "bg-orange-500/80",
    "bg-zinc-600",
    "bg-amber-600/90",
    "bg-rose-600/90",
  ];

  return (
    <div>
      <div className="flex h-4 overflow-hidden rounded-full ring-1 ring-zinc-300 dark:ring-zinc-700/80">
        {segments.map((seg, i) => (
          <div
            key={seg.status}
            className={cn(tones[i % tones.length], "min-w-[4px] transition-[width]")}
            style={{ width: `${(seg.count / total) * 100}%` }}
            title={`${formatStatus(seg.status)}: ${seg.count}`}
          />
        ))}
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {segments.map((seg, i) => (
          <li key={seg.status} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-2 text-zinc-700 dark:text-zinc-400">
              <span className={cn("size-2 rounded-full", tones[i % tones.length])} />
              {formatStatus(seg.status)}
            </span>
            <span className="tabular-nums font-semibold text-zinc-900 dark:text-zinc-200">{seg.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
