"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { BRAND_TITLE } from "@/lib/brand";
import {
  MetricsBarChart,
  MetricsGauge,
  MetricsPieChart,
  MetricsQueueStrip,
  MetricsTrendChart,
} from "@/components/metrics/MetricsCharts";
import { KpiDefinitionConsole } from "@/components/KpiDefinitionConsole";
import { taskKanbanDerivedStatus } from "@/lib/kpi-cycle-state";
import { type KpiFrequencyCode } from "@/lib/kpi-recurrence";
import {
  collectAllSubKpiItems,
  normalizeSubKpis,
} from "@/lib/kpi-subkpis";

type KpiPayload = {
  range: { from: string; to: string };
  operational: {
    ticketVolume: number;
    backlogSize: number;
    firstResponseTimeMsAvg: number | null;
    resolutionTimeMsAvg: number | null;
    firstContactResolutionApprox: number | null;
  };
  sla: {
    firstResponseComplianceRate: number | null;
    resolutionComplianceRate: number | null;
    escalationRate: number | null;
    reopenRate: number | null;
    ticketsClosedInRange: number;
  };
  quality: {
    csatAvg: number | null;
    npsAvg: number | null;
    cesAvg: number | null;
    feedbackCount: number;
  };
  agents: {
    ticketsClosedByAgent: { agentId: string; name: string; ticketsClosed: number }[];
  };
  charts?: {
    days: string[];
    createdByDay: number[];
    closedByDay: number[];
    queueStatusMix: { status: string; count: number }[];
  };
  kpiManagement?: {
    kpisAdded: number;
  };
};

type MaintenanceRecord = {
  id: string;
  title: string;
  isRecurring?: boolean;
  nonRecurringStartAt?: string | null;
  nonRecurringEndAt?: string | null;
  frequency: KpiFrequencyCode;
  createdAt: string;
  updatedAt: string;
  subKpis: unknown;
  recurrenceWeekday?: number | null;
  recurrenceMonthDay?: number | null;
  periodCycleStartAt?: string | null;
  periodKey?: string | null;
  assignedAgent?: {
    id: string;
    name: string;
    team?: { name?: string | null } | null;
  } | null;
};

function formatDuration(ms: number | null) {
  if (ms === null) return "—";
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.round(ms / 60_000)} min avg`;
  return `${hours.toFixed(1)} h avg`;
}

function pct(n: number | null) {
  if (n === null) return "—";
  return `${Math.round(n * 1000) / 10}%`;
}

export default function InsightsPage() {
  const { data: session } = useSession();
  const isPersonnel = session?.user?.role === "Personnel";
  const [activeTab, setActiveTab] = useState<"ticket-metrics" | "task-metrics" | "kpi-mgmt">(
    "ticket-metrics",
  );
  const [data, setData] = useState<KpiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sweepInfo, setSweepInfo] = useState<string | null>(null);
  const [sweepBusy, setSweepBusy] = useState(false);
  const [throughputView, setThroughputView] = useState<"cards" | "table">("table");
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);
  const [canAssignKpi, setCanAssignKpi] = useState(false);
  /** IANA zone for KPI period boundaries (browser); starts UTC until hydrated on client. */
  const [recurrenceTz, setRecurrenceTz] = useState("UTC");

  useEffect(() => {
    try {
      const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (z) setRecurrenceTz(z);
    } catch {
      setRecurrenceTz("UTC");
    }
  }, []);

  const kpiMaintenanceSearch = useMemo(
    () => `?tz=${encodeURIComponent(recurrenceTz)}`,
    [recurrenceTz],
  );
  /** Personnel with coordinator access: keep KPI definition tab on Insights. SuperAdmin/Admin use Task Board. */
  const showKpiTasksTab = isPersonnel && canAssignKpi;

  const defaultRange = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  }, []);

  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);

  const loadKpis = useCallback(async () => {
    setError(null);
    const qs = new URLSearchParams({ from, to });
    const res = await fetch(`/api/kpis?${qs.toString()}`, { cache: "no-store" });
    if (!res.ok) {
      setError("Could not load KPIs. Is the database running and migrated?");
      setData(null);
      return;
    }
    const json = (await res.json()) as KpiPayload;
    setData(json);
  }, [from, to]);

  async function runSlaSweep() {
    setSweepBusy(true);
    setSweepInfo(null);
    const res = await fetch("/api/sla/sweep", { method: "POST" });
    setSweepBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setSweepInfo(body.error ?? "Could not run SLA sweep.");
      return;
    }
    const body = (await res.json()) as { scanned: number; escalated: number };
    setSweepInfo(
      `SLA sweep complete: scanned ${body.scanned}, escalated ${body.escalated}.`,
    );
    await loadKpis();
  }

  useEffect(() => {
    void loadKpis();
  }, [loadKpis]);

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "visible") void loadKpis();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [loadKpis]);

  useEffect(() => {
    if (activeTab !== "ticket-metrics") return;
    const id = setInterval(() => void loadKpis(), 45_000);
    return () => clearInterval(id);
  }, [activeTab, loadKpis]);

  useEffect(() => {
    let cancelled = false;
    async function loadMaintenanceForMetrics() {
      const role = session?.user?.role;
      if (!role) return;
      const permissionRes = await fetch("/api/me/permissions", { cache: "no-store" });
      const permission = permissionRes.ok
        ? ((await permissionRes.json()) as {
            canAccessAssignmentBoard?: boolean;
          })
        : { canAccessAssignmentBoard: false };
      if (role === "SuperAdmin" || role === "Admin") {
        if (!cancelled) setCanAssignKpi(false);
      } else {
        if (!cancelled) setCanAssignKpi(!!permission.canAccessAssignmentBoard);
      }

      const kpiRes = await fetch(`/api/kpi-maintenance${kpiMaintenanceSearch}`, { cache: "no-store" });
      if (!cancelled && kpiRes.ok) {
        const payload = (await kpiRes.json()) as {
          rows: MaintenanceRecord[];
        };
        setMaintenanceRecords(payload.rows);
      }
    }
    void loadMaintenanceForMetrics();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.role, kpiMaintenanceSearch]);

  useEffect(() => {
    if (!showKpiTasksTab && activeTab === "kpi-mgmt") {
      setActiveTab("ticket-metrics");
    }
  }, [showKpiTasksTab, activeTab]);

  const charts = data?.charts ?? {
    days: [],
    createdByDay: [],
    closedByDay: [],
    queueStatusMix: [],
  };

  const agentBars = useMemo(() => {
    if (!data) return [];
    return data.agents.ticketsClosedByAgent.slice(0, 10).map((r) => ({
      label: r.name,
      value: r.ticketsClosed,
    }));
  }, [data]);
  const throughputRows = useMemo(
    () =>
      data
        ? [...data.agents.ticketsClosedByAgent].sort((a, b) => b.ticketsClosed - a.ticketsClosed)
        : [],
    [data],
  );
  const queuePieSegments = useMemo(
    () =>
      charts.queueStatusMix.map((seg, i) => ({
        label: seg.status.replaceAll("_", " "),
        value: seg.count,
        color: ["#f97316", "#a1a1aa", "#3b82f6", "#eab308", "#f43f5e", "#10b981"][i % 6],
      })),
    [charts.queueStatusMix],
  );
  const qualityRows = useMemo(
    () => [
      { label: "CSAT", value: data?.quality.csatAvg ?? 0, raw: data?.quality.csatAvg },
      { label: "NPS", value: data?.quality.npsAvg ?? 0, raw: data?.quality.npsAvg },
      { label: "CES", value: data?.quality.cesAvg ?? 0, raw: data?.quality.cesAvg },
    ],
    [data],
  );

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-6 text-zinc-900 sm:space-y-10 sm:py-8 md:py-10 dark:text-zinc-100">
      <header className="rounded-2xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 p-6 shadow-[0_12px_40px_rgba(0,0,0,0.06)] md:p-8 dark:border-zinc-800/90 dark:from-[#101010] dark:to-[#080808] dark:shadow-[0_20px_50px_rgba(0,0,0,0.4)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700 dark:text-orange-400/95">
              {BRAND_TITLE} · {isPersonnel ? "Personal metrics" : "Ticket metrics & reports"}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 md:text-4xl dark:text-white">
              {isPersonnel ? "Personal performance intelligence" : "Operations intelligence"}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {isPersonnel
                ? "Live charts for your assigned queue, your SLA compliance, and your own throughput in the selected window."
                : "Live charts for intake vs closure, queue composition, SLA compliance, and throughput. Adjust the reporting window to align with your review cycle."}
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-3 text-sm lg:w-auto lg:justify-end">
            <label className="flex flex-col text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
              From
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1.5 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-orange-500/30 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <label className="flex flex-col text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
              To
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1.5 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-orange-500/30 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            {session?.user?.role === "SuperAdmin" || session?.user?.role === "Admin" ? (
              <div className="flex flex-col justify-end">
                <Button
                  type="button"
                  disabled={sweepBusy}
                  onClick={() => void runSlaSweep()}
                  className="h-[42px] rounded-xl px-5"
                >
                  {sweepBusy ? "Running SLA sweep..." : "Run SLA sweep"}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-1 rounded-full border border-zinc-300 bg-zinc-100 p-1 text-xs font-semibold dark:border-zinc-700 dark:bg-zinc-900/90">
          <button
            type="button"
            onClick={() => setActiveTab("ticket-metrics")}
            className={cn(
              "rounded-full px-4 py-1.5 transition",
              activeTab === "ticket-metrics"
                ? "bg-orange-600 text-white shadow-sm"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200",
            )}
          >
            {isPersonnel ? "My Ticket Metrics and Reports" : "Ticket Metrics and Reports"}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("task-metrics")}
            className={cn(
              "rounded-full px-4 py-1.5 transition",
              activeTab === "task-metrics"
                ? "bg-orange-600 text-white shadow-sm"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200",
            )}
          >
            {isPersonnel ? "My task metrics" : "Task metrics"}
          </button>
          {showKpiTasksTab ? (
            <button
              type="button"
              onClick={() => setActiveTab("kpi-mgmt")}
              className={cn(
                "rounded-full px-4 py-1.5 transition",
                activeTab === "kpi-mgmt"
                  ? "bg-orange-600 text-white shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200",
              )}
            >
              {isPersonnel ? "My Task Management" : "Task Management"}
            </button>
          ) : null}
        </div>
      </header>

      {sweepInfo ? (
        <p className="rounded-xl border border-orange-400/40 bg-orange-500/15 px-4 py-3 text-sm text-orange-950 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-100">
          {sweepInfo}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-red-500/35 bg-red-50 px-4 py-3 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {activeTab === "kpi-mgmt" ? (
        <div className="space-y-6">
          <KpiDefinitionConsole
            onMaintenanceRecordsUpdated={(rows) => {
              setMaintenanceRecords(rows);
            }}
          />
        </div>
      ) : activeTab === "task-metrics" ? (
        <div className="space-y-6">
          <TaskMetricsPanel maintenanceRecords={maintenanceRecords} recurrenceTz={recurrenceTz} />
        </div>
      ) : !data ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-500">Loading metrics…</p>
      ) : (
        <div className="space-y-8">
          {/* Volume and throughput */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_12px_36px_rgba(0,0,0,0.06)] sm:p-7 dark:border-zinc-800/90 dark:bg-[#0a0a0a] dark:shadow-[0_16px_48px_rgba(0,0,0,0.35)]">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600 dark:text-zinc-500">
                  Volume and throughput
                </h2>
                <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  Created vs closed (daily, real-time)
                </p>
              </div>
              <div className="flex flex-wrap gap-4 text-right text-xs text-zinc-600 dark:text-zinc-500">
                <div>
                  <span className="block text-[10px] uppercase tracking-wider">Created in range</span>
                  <span className="text-lg font-bold tabular-nums text-orange-700 dark:text-orange-400">
                    {data.operational.ticketVolume}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase tracking-wider">Closed in range</span>
                  <span className="text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-200">
                    {data.sla.ticketsClosedInRange}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-6">
              <MetricsTrendChart
                labels={charts.days}
                created={charts.createdByDay}
                closed={charts.closedByDay}
              />
            </div>
            <div className="mt-6 border-t border-zinc-200 pt-6 dark:border-zinc-800/80">
              <MetricsBarChart
                title="Range summary · created vs closed"
                rows={[
                  { label: "Created", value: data.operational.ticketVolume },
                  { label: "Closed", value: data.sla.ticketsClosedInRange },
                ]}
              />
            </div>
          </section>

          {/* Queue composition + SLA performance */}
          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-7 dark:border-zinc-800/90 dark:bg-[#0a0a0a]">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600 dark:text-zinc-500">
                Queue composition
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Non-closed tickets by status ({data.operational.backlogSize} total open)
              </p>
              <div className="mt-6">
                <MetricsPieChart
                  title="Open queue distribution"
                  subtitle="Status share of the active backlog."
                  itemsLabel={(n) => `${n} open ticket${n === 1 ? "" : "s"}`}
                  emptyDescription="No active queue items."
                  showPercentages
                  pieClassName="h-44 w-44 sm:h-48 sm:w-48"
                  segments={queuePieSegments}
                />
              </div>
              <div className="mt-5 border-t border-zinc-200 pt-5 dark:border-zinc-800/80">
                <MetricsQueueStrip segments={charts.queueStatusMix} />
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-7 dark:border-zinc-800/90 dark:bg-[#0a0a0a]">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600 dark:text-zinc-500">
                SLA performance
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Sample-based in the selected window with 95% target markers.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-4 border-t border-zinc-200 pt-6 dark:border-zinc-800/80">
                <MetricsGauge
                  label="First response"
                  value={data.sla.firstResponseComplianceRate}
                  sub="Met ÷ sampled"
                  target={0.95}
                />
                <MetricsGauge
                  label="Resolution"
                  value={data.sla.resolutionComplianceRate}
                  sub="Met ÷ sampled"
                  target={0.95}
                />
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3 border-t border-zinc-200 pt-6 text-center dark:border-zinc-800/80">
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950/60">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
                    Escalation rate
                  </p>
                  <p className="mt-1 text-xl font-bold text-orange-700 dark:text-orange-300">
                    {pct(data.sla.escalationRate)}
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950/60">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
                    Reopen rate
                  </p>
                  <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-200">{pct(data.sla.reopenRate)}</p>
                </div>
              </div>
            </div>
          </section>

          {/* Operational load */}
          <section>
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-600 dark:text-zinc-500">
              Operational load
            </h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3 lg:grid-cols-5">
              <MetricTile label="Ticket volume" value={String(data.operational.ticketVolume)} accent />
              <MetricTile label="Backlog (open)" value={String(data.operational.backlogSize)} />
              <MetricTile label="Avg first response" value={formatDuration(data.operational.firstResponseTimeMsAvg)} />
              <MetricTile label="Avg resolution time" value={formatDuration(data.operational.resolutionTimeMsAvg)} />
              <MetricTile
                label="First-contact resolution"
                value={pct(data.operational.firstContactResolutionApprox)}
                hint="Approximation"
              />
              <MetricTile label="KPIs added" value={String(data.kpiManagement?.kpisAdded ?? 0)} accent />
            </div>
          </section>

          {/* Quality signals */}
          <section>
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-600 dark:text-zinc-500">
              Quality &amp; signals
            </h2>
            <div className="mt-4 grid gap-6 lg:grid-cols-[1.7fr_1fr]">
              <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_8px_28px_rgba(0,0,0,0.06)] dark:border-zinc-800/90 dark:bg-[#0a0a0a]">
                <MetricsBarChart
                  title="Customer signal index (normalized to 5.0)"
                  rows={qualityRows}
                  valueFormatter={(_, row) => {
                    const q = qualityRows.find((r) => r.label === row.label);
                    return q?.raw == null ? "—" : q.raw.toFixed(2);
                  }}
                />
              </section>
              <div className="grid gap-4">
                <MetricTile
                  label="Feedback responses"
                  value={String(data.quality.feedbackCount)}
                  accent
                />
                <MetricTile
                  label="Quality note"
                  value="Signals are directional"
                  hint="Track trends over time more than one-off values."
                />
              </div>
            </div>
          </section>

          {/* Agent performance */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-7 dark:border-zinc-800/90 dark:bg-[#0a0a0a]">
            <MetricsBarChart title="Top closers · tickets closed in range" rows={agentBars} />
          </section>

          {/* Throughput table */}
          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_8px_28px_rgba(0,0,0,0.06)] dark:border-zinc-800/90 dark:bg-[#080808] dark:shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-4 dark:border-zinc-800/80 sm:px-6">
              <div>
                <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-600 dark:text-zinc-500">
                  Agent throughput
                </h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-500">
                  Detailed roster · same window as charts above
                </p>
              </div>
              <div className="inline-flex rounded-full border border-zinc-300 bg-zinc-100 p-1 text-xs font-semibold dark:border-zinc-700 dark:bg-zinc-900/90">
                <button
                  type="button"
                  onClick={() => setThroughputView("cards")}
                  className={cn(
                    "rounded-full px-4 py-1.5 transition",
                    throughputView === "cards"
                      ? "bg-orange-600 text-white shadow-sm"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200",
                  )}
                >
                  Cards
                </button>
                <button
                  type="button"
                  onClick={() => setThroughputView("table")}
                  className={cn(
                    "rounded-full px-4 py-1.5 transition",
                    throughputView === "table"
                      ? "bg-orange-600 text-white shadow-sm"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200",
                  )}
                >
                  Table
                </button>
              </div>
            </div>

            {throughputView === "cards" ? (
              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 lg:p-6">
                {data.agents.ticketsClosedByAgent.length === 0 ? (
                  <article className="col-span-full rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-12 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/40 dark:text-zinc-500">
                    No closures in this range yet.
                  </article>
                ) : (
                  throughputRows.map((row) => (
                    <article
                      key={row.agentId}
                      className="rounded-xl border border-zinc-200 bg-gradient-to-b from-zinc-50 to-white p-5 shadow-inner dark:border-zinc-800 dark:from-zinc-900/80 dark:to-zinc-950"
                    >
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white">{row.name}</p>
                      <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
                        Tickets closed
                      </p>
                      <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-orange-700 dark:text-orange-400">
                        {row.ticketsClosed}
                      </p>
                    </article>
                  ))
                )}
              </div>
            ) : (
              <div className="overflow-x-auto px-2 pb-3 pt-1 sm:px-4 sm:pb-5">
                <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800/90">
                  <thead className="bg-zinc-100 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-600 dark:bg-zinc-900/80 dark:text-zinc-500">
                    <tr>
                      <th className="px-4 py-3.5 sm:px-6">Agent</th>
                      <th className="px-4 py-3.5 sm:px-6">Tickets closed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
                    {data.agents.ticketsClosedByAgent.length === 0 ? (
                      <tr>
                        <td className="px-4 py-14 text-center text-sm text-zinc-600 dark:text-zinc-500 sm:px-6" colSpan={2}>
                          No closures in this range yet.
                        </td>
                      </tr>
                    ) : (
                      throughputRows.map((row) => (
                        <tr
                          key={row.agentId}
                          className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                        >
                          <td className="px-4 py-3.5 font-medium text-zinc-900 dark:text-zinc-100 sm:px-6">{row.name}</td>
                          <td className="px-4 py-3.5 font-mono tabular-nums text-orange-700 dark:text-orange-300 sm:px-6">
                            {row.ticketsClosed}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <p className="border-t border-zinc-200 px-4 py-3 text-xs text-zinc-600 dark:border-zinc-800/80 dark:text-zinc-600 sm:px-6">
              Utilization and audit-quality scores require scheduling integrations beyond this schema.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}

function kpiPanelProgress(record: MaintenanceRecord) {
  const all = collectAllSubKpiItems(normalizeSubKpis(record.subKpis));
  return { total: all.length, done: all.filter((s) => s.done).length };
}

type TaskMetricsStatusView = "general" | "current" | "done" | "delayed";

const TASK_PIE_OTHER = "#a1a1aa";

function TaskMetricsPanel({
  maintenanceRecords,
  recurrenceTz,
}: {
  maintenanceRecords: MaintenanceRecord[];
  recurrenceTz: string;
}) {
  const [freq, setFreq] = useState<KpiFrequencyCode>("DAILY");
  const [statusView, setStatusView] = useState<TaskMetricsStatusView>("general");
  const scoped = useMemo(
    () => maintenanceRecords.filter((r) => r.isRecurring !== false && r.frequency === freq),
    [maintenanceRecords, freq],
  );
  const nowMs = Date.now();
  let doneN = 0;
  let delayedN = 0;
  let currentN = 0;
  for (const r of scoped) {
    const p = kpiPanelProgress(r);
    const st = taskKanbanDerivedStatus(r, {
      total: p.total,
      done: p.done,
      nowMs,
      timeZone: recurrenceTz,
    });
    if (st === "DONE") doneN += 1;
    else if (st === "DELAYED") delayedN += 1;
    else currentN += 1;
  }

  const { pieSegments, pieSubtitle } = useMemo(() => {
    switch (statusView) {
      case "general":
        return {
          pieSegments: [
            { label: "Current", value: currentN, color: "#3b82f6" },
            { label: "Done", value: doneN, color: "#10b981" },
            { label: "Delayed", value: delayedN, color: "#f43f5e" },
          ],
          pieSubtitle: "All statuses for the selected cadence (current · done · delayed).",
        };
      case "current": {
        const other = doneN + delayedN;
        return {
          pieSegments: [
            { label: "Current", value: currentN, color: "#3b82f6" },
            { label: "Other", value: other, color: TASK_PIE_OTHER },
          ],
          pieSubtitle: "Current tasks vs all other statuses in this cadence.",
        };
      }
      case "done": {
        const other = currentN + delayedN;
        return {
          pieSegments: [
            { label: "Done", value: doneN, color: "#10b981" },
            { label: "Other", value: other, color: TASK_PIE_OTHER },
          ],
          pieSubtitle: "Done tasks vs all other statuses in this cadence.",
        };
      }
      case "delayed": {
        const other = currentN + doneN;
        return {
          pieSegments: [
            { label: "Delayed", value: delayedN, color: "#f43f5e" },
            { label: "Other", value: other, color: TASK_PIE_OTHER },
          ],
          pieSubtitle: "Delayed tasks vs all other statuses in this cadence.",
        };
      }
    }
  }, [statusView, currentN, doneN, delayedN]);

  const statusToggleDefs: Array<{ id: TaskMetricsStatusView; label: string }> = [
    { id: "general", label: "General" },
    { id: "current", label: "Current" },
    { id: "done", label: "Done" },
    { id: "delayed", label: "Delayed" },
  ];

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_12px_36px_rgba(0,0,0,0.06)] sm:p-7 dark:border-zinc-800/90 dark:bg-[#0a0a0a] dark:shadow-[0_16px_48px_rgba(0,0,0,0.35)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600 dark:text-zinc-500">
            Task metrics
          </h3>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Recurring maintenance tasks by kanban status. One-off tasks are excluded from the pie.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          <div className="flex flex-col gap-1.5 sm:items-end">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">
              Cadence
            </span>
            <div className="inline-flex flex-wrap gap-1.5 rounded-xl border border-zinc-200 bg-zinc-100/80 p-1 dark:border-zinc-700 dark:bg-zinc-900/60">
              {(["DAILY", "WEEKLY", "MONTHLY"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFreq(f)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                    freq === f
                      ? "bg-orange-600 text-white shadow-sm"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
                  )}
                >
                  {f === "DAILY" ? "Daily" : f === "WEEKLY" ? "Weekly" : "Monthly"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5 sm:items-end">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">
              View
            </span>
            <div className="inline-flex flex-wrap gap-1.5 rounded-xl border border-zinc-200 bg-zinc-100/80 p-1 dark:border-zinc-700 dark:bg-zinc-900/60">
              {statusToggleDefs.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setStatusView(id)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                    statusView === id
                      ? "bg-orange-600 text-white shadow-sm"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-6">
        <MetricsPieChart
          title="Task status distribution"
          subtitle={pieSubtitle}
          itemsLabel={(n) => `${n} task${n === 1 ? "" : "s"}`}
          emptyDescription="No recurring tasks for this frequency in scope."
          pieClassName="h-52 w-52 sm:h-60 sm:w-60"
          segments={pieSegments}
        />
      </div>
    </section>
  );
}

function MetricTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <article
      className={cn(
        "rounded-2xl border p-4 shadow-sm transition",
        accent
          ? "border-orange-400/40 bg-gradient-to-br from-orange-500/15 to-zinc-50 dark:border-orange-500/35 dark:from-orange-500/10 dark:to-zinc-950"
          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950/60",
      )}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">{label}</p>
      <p
        className={cn(
          "mt-2 text-2xl font-bold tabular-nums",
          accent ? "text-orange-800 dark:text-orange-300" : "text-zinc-900 dark:text-white",
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-2 text-[11px] text-zinc-600 dark:text-zinc-600">{hint}</p>
      ) : null}
    </article>
  );
}
