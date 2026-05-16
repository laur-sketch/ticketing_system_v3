"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/DatePickerField";
import { cn } from "@/lib/cn";
import { BRAND_TITLE } from "@/lib/brand";
import {
  MetricsBarChart,
  MetricsGauge,
  MetricsPieChart,
  MetricsQueueStrip,
  MetricsTrendChart,
  colorForTicketStatus,
  queueSegmentsForCharts,
} from "@/components/metrics/MetricsCharts";
import { TaskPillarMetricsGrid } from "@/components/metrics/TaskPillarMetricsGrid";
import { KpiDefinitionConsole } from "@/components/KpiDefinitionConsole";
import { type KpiFrequencyCode } from "@/lib/kpi-recurrence";
import type {
  CsatStarDistributionRow,
  TaskChecklistPillarMetrics,
  TaskMetricsHelpdeskTickets,
  TaskMetricsUserSupportTickets,
} from "@/lib/kpis";
import {
  defaultTaskMetricsRangeForCadence,
  resolveTaskMetricsQueryRange,
} from "@/lib/task-metrics-range";

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
    csatByStar: CsatStarDistributionRow[];
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

  const taskMetricsDefaults = useMemo(() => defaultTaskMetricsRangeForCadence("DAILY"), []);
  const [taskMetricsCadence, setTaskMetricsCadence] = useState<KpiFrequencyCode>("DAILY");
  const [taskMetricsDailyDate, setTaskMetricsDailyDate] = useState(taskMetricsDefaults.dailyDate);
  const [taskMetricsFrom, setTaskMetricsFrom] = useState(taskMetricsDefaults.from);
  const [taskMetricsTo, setTaskMetricsTo] = useState(taskMetricsDefaults.to);
  const [taskMetricsHelpdesk, setTaskMetricsHelpdesk] = useState<TaskMetricsHelpdeskTickets | null>(null);
  const [taskMetricsUserSupport, setTaskMetricsUserSupport] = useState<TaskMetricsUserSupportTickets | null>(
    null,
  );
  const [taskChecklistPillars, setTaskChecklistPillars] = useState<TaskChecklistPillarMetrics | null>(null);
  const [taskMetricsLoading, setTaskMetricsLoading] = useState(false);
  const [taskMetricsError, setTaskMetricsError] = useState<string | null>(null);

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

  const loadTaskMetrics = useCallback(async () => {
    setTaskMetricsError(null);
    setTaskMetricsLoading(true);
    const { from: tf, to: tt } = resolveTaskMetricsQueryRange(
      taskMetricsCadence,
      taskMetricsDailyDate,
      taskMetricsFrom,
      taskMetricsTo,
    );
    const qs = new URLSearchParams({
      from: tf,
      to: tt,
      helpdeskCadence: taskMetricsCadence,
      tz: recurrenceTz,
    });
    try {
      const res = await fetch(`/api/kpis/task-metrics?${qs.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        setTaskMetricsError("Could not load task metrics for the selected dates.");
        setTaskMetricsHelpdesk(null);
        setTaskMetricsUserSupport(null);
        setTaskChecklistPillars(null);
        return;
      }
      const json = (await res.json()) as {
        taskMetricsHelpdesk: TaskMetricsHelpdeskTickets;
        taskMetricsUserSupport: TaskMetricsUserSupportTickets;
        taskChecklistPillars: TaskChecklistPillarMetrics;
      };
      setTaskMetricsHelpdesk(json.taskMetricsHelpdesk);
      setTaskMetricsUserSupport(json.taskMetricsUserSupport);
      setTaskChecklistPillars(json.taskChecklistPillars);
    } finally {
      setTaskMetricsLoading(false);
    }
  }, [taskMetricsCadence, taskMetricsDailyDate, taskMetricsFrom, taskMetricsTo, recurrenceTz]);

  function handleTaskMetricsCadenceChange(next: KpiFrequencyCode) {
    setTaskMetricsCadence(next);
    const defaults = defaultTaskMetricsRangeForCadence(next);
    setTaskMetricsDailyDate(defaults.dailyDate);
    setTaskMetricsFrom(defaults.from);
    setTaskMetricsTo(defaults.to);
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
    if (activeTab !== "task-metrics") return;
    void loadTaskMetrics();
  }, [activeTab, loadTaskMetrics]);

  useEffect(() => {
    if (activeTab !== "task-metrics") return;
    const id = setInterval(() => void loadTaskMetrics(), 45_000);
    return () => clearInterval(id);
  }, [activeTab, loadTaskMetrics]);

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
      id: r.agentId,
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
      queueSegmentsForCharts(charts.queueStatusMix).map((seg) => ({
        label: seg.status.replaceAll("_", " "),
        value: seg.count,
        color: colorForTicketStatus(seg.status),
      })),
    [charts.queueStatusMix],
  );
  const satisfactionRows = useMemo(() => {
    const dist = data?.quality?.csatByStar;
    if (!dist?.length) {
      return ([1, 2, 3, 4, 5] as const).map((star) => ({
        label:
          star === 1
            ? "1★ — Very Poor"
            : star === 2
              ? "2★ — Poor"
              : star === 3
                ? "3★ — Neutral"
                : star === 4
                  ? "4★ — Good"
                  : "5★ — Very Good",
        value: 0,
      }));
    }
    return dist.map((r) => ({
      label: `${r.star}★ — ${r.label}`,
      value: r.count,
    }));
  }, [data]);

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-6 text-zinc-900 sm:space-y-10 sm:py-8 md:py-10 dark:text-zinc-100">
      <header className="rounded-2xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 p-6 shadow-[0_12px_40px_rgba(0,0,0,0.06)] md:p-8 dark:border-zinc-800/90 dark:from-[#101010] dark:to-[#080808] dark:shadow-[0_20px_50px_rgba(0,0,0,0.4)]">
        <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700 dark:text-orange-400/95">
              {BRAND_TITLE} · {isPersonnel ? "Personal metrics" : "Ticket metrics & reports"}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 md:text-4xl dark:text-white">
              {isPersonnel ? "Personal performance intelligence" : "Operations intelligence"}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {isPersonnel
                ? "Live charts for your assigned queue, SLA compliance, and throughput."
                : "Live charts for intake vs closure, queue composition, SLA compliance, and throughput."}
            </p>
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
          <TaskMetricsPanel
            checklistPillars={taskChecklistPillars}
            helpdeskTickets={taskMetricsHelpdesk}
            userSupportTickets={taskMetricsUserSupport}
            loading={taskMetricsLoading}
            error={taskMetricsError}
            taskMetricsCadence={taskMetricsCadence}
            onTaskMetricsCadenceChange={handleTaskMetricsCadenceChange}
            dailyDate={taskMetricsDailyDate}
            onDailyDateChange={setTaskMetricsDailyDate}
            rangeFrom={taskMetricsFrom}
            rangeTo={taskMetricsTo}
            onRangeFromChange={setTaskMetricsFrom}
            onRangeToChange={setTaskMetricsTo}
            onApplyDates={() => void loadTaskMetrics()}
          />
        </div>
      ) : (
        <div className="space-y-8">
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_12px_36px_rgba(0,0,0,0.06)] sm:p-7 dark:border-zinc-800/90 dark:bg-[#0a0a0a] dark:shadow-[0_16px_48px_rgba(0,0,0,0.35)]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600 dark:text-zinc-500">
                  Reporting window
                </h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Ticket metrics and charts below use this date range.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-sm">
                <label className="flex flex-col text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
                  From
                  <DatePickerField
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    wrapperClassName="mt-1.5 min-w-[10.5rem]"
                  />
                </label>
                <label className="flex flex-col text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
                  To
                  <DatePickerField
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    wrapperClassName="mt-1.5 min-w-[10.5rem]"
                  />
                </label>
              </div>
            </div>
          </section>

          {!data ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-500">Loading metrics…</p>
          ) : (
            <>
          {/* Operational load */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_12px_36px_rgba(0,0,0,0.06)] sm:p-7 dark:border-zinc-800/90 dark:bg-[#0a0a0a] dark:shadow-[0_16px_48px_rgba(0,0,0,0.35)]">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-600 dark:text-zinc-500">
              Operational load
            </h2>
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <MetricTile
                  label="Ticket volume"
                  value={String(data.operational.ticketVolume)}
                  hint="Total number of tickets"
                  accent
                />
                <MetricTile label="Backlog (open)" value={String(data.operational.backlogSize)} />
                <MetricTile
                  label="Closed"
                  value={String(data.sla.ticketsClosedInRange)}
                  hint="Closed in selected period"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <MetricTile
                  label="Avg first response"
                  value={formatDuration(data.operational.firstResponseTimeMsAvg)}
                />
                <MetricTile
                  label="Avg resolution time"
                  value={formatDuration(data.operational.resolutionTimeMsAvg)}
                />
              </div>
            </div>
          </section>

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
            <div className="stoic-card p-5 sm:p-7">
              <h2 className="stoic-label">Queue composition</h2>
              <p className="mt-1 text-sm text-muted">
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
              <div className="mt-5 border-t border-border pt-5">
                <MetricsQueueStrip segments={charts.queueStatusMix} />
              </div>
            </div>

            <div className="stoic-card p-5 sm:p-7">
              <h2 className="stoic-label">SLA performance</h2>
              <p className="mt-1 text-sm text-muted">
                Sample-based in the selected window with 95% target markers.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-6 sm:gap-8">
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
              <div className="mt-6 grid grid-cols-2 gap-3 border-t border-border pt-6">
                <div className="rounded-xl border border-border bg-surface-muted px-3 py-4 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Escalation rate
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-brand">
                    {pct(data.sla.escalationRate)}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-surface-muted px-3 py-4 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Reopen rate</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
                    {pct(data.sla.reopenRate)}
                  </p>
                </div>
              </div>
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
                  title="User satisfaction (CSAT star ratings)"
                  rows={satisfactionRows}
                  valueFormatter={(v) =>
                    v === 0 ? "0" : `${v} response${v === 1 ? "" : "s"}`
                  }
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
                  value="CSAT = 1–5 stars"
                  hint="Counts are ratings submitted in the selected window."
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
            </>
          )}
        </div>
      )}
    </main>
  );
}

function TaskMetricsPanel({
  checklistPillars,
  helpdeskTickets,
  userSupportTickets,
  loading,
  error,
  taskMetricsCadence,
  onTaskMetricsCadenceChange,
  dailyDate,
  onDailyDateChange,
  rangeFrom,
  rangeTo,
  onRangeFromChange,
  onRangeToChange,
  onApplyDates,
}: {
  checklistPillars: TaskChecklistPillarMetrics | null;
  helpdeskTickets: TaskMetricsHelpdeskTickets | null;
  userSupportTickets: TaskMetricsUserSupportTickets | null;
  loading: boolean;
  error: string | null;
  taskMetricsCadence: KpiFrequencyCode;
  onTaskMetricsCadenceChange: (v: KpiFrequencyCode) => void;
  dailyDate: string;
  onDailyDateChange: (v: string) => void;
  rangeFrom: string;
  rangeTo: string;
  onRangeFromChange: (v: string) => void;
  onRangeToChange: (v: string) => void;
  onApplyDates: () => void;
}) {
  const freq = taskMetricsCadence;
  const isDaily = freq === "DAILY";

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_12px_36px_rgba(0,0,0,0.06)] sm:p-7 dark:border-zinc-800/90 dark:bg-[#0a0a0a] dark:shadow-[0_16px_48px_rgba(0,0,0,0.35)]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600 dark:text-zinc-500">
            Task metrics
          </h3>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Daily checklist pillars are recorded when completed (before the next recurrence). Weekly and monthly views
            average those daily scores across the range; weekly/monthly KPIs use their own period snapshots.{" "}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Helpdesk</span> and{" "}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">User support</span> use ticket counts in the
            reporting window below.
          </p>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-4 sm:min-w-[17rem] lg:w-auto lg:items-end">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">
              Cadence
            </span>
            <div className="inline-flex flex-wrap gap-1.5 rounded-xl border border-zinc-200 bg-zinc-100/80 p-1 dark:border-zinc-700 dark:bg-zinc-900/60">
              {(["DAILY", "WEEKLY", "MONTHLY"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => onTaskMetricsCadenceChange(f)}
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
          <div
            className={cn(
              "w-full rounded-xl border border-zinc-200 bg-zinc-50/90 p-3 dark:border-zinc-700/80 dark:bg-zinc-900/50",
              isDaily ? "sm:max-w-[14rem]" : "sm:max-w-[22rem]",
            )}
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">
              {isDaily ? "Reporting day" : "Reporting range"}
            </span>
            {isDaily ? (
              <label className="mt-2 flex flex-col text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
                Date
                <DatePickerField
                  value={dailyDate}
                  onChange={(e) => onDailyDateChange(e.target.value)}
                  wrapperClassName="mt-1.5"
                  inputClassName="min-w-[10.5rem]"
                />
              </label>
            ) : (
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
                  Start
                  <DatePickerField
                    value={rangeFrom}
                    max={rangeTo || undefined}
                    onChange={(e) => onRangeFromChange(e.target.value)}
                    wrapperClassName="mt-1.5"
                    inputClassName="min-w-0"
                  />
                </label>
                <label className="flex flex-col text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
                  End
                  <DatePickerField
                    value={rangeTo}
                    min={rangeFrom || undefined}
                    onChange={(e) => onRangeToChange(e.target.value)}
                    wrapperClassName="mt-1.5"
                    inputClassName="min-w-0"
                  />
                </label>
              </div>
            )}
            <Button
              type="button"
              onClick={onApplyDates}
              disabled={loading}
              className="mt-3 h-9 w-full rounded-lg text-xs font-semibold"
            >
              {loading ? "Updating…" : "Apply dates"}
            </Button>
          </div>
        </div>
      </div>
      {error ? (
        <p className="mt-4 rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-900 dark:border-rose-500/30 dark:text-rose-100">
          {error}
        </p>
      ) : null}
      <div className={cn("mt-6", loading && "pointer-events-none opacity-60")}>
        <TaskPillarMetricsGrid
          checklistPillars={checklistPillars}
          frequency={freq}
          helpdeskTickets={helpdeskTickets}
          userSupportTickets={userSupportTickets}
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
