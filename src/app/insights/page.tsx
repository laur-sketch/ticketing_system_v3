"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DatePickerField } from "@/components/ui/DatePickerField";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { PersonnelTaskMetricsGrid } from "@/components/metrics/PersonnelTaskMetricsGrid";
import type {
  PersonnelCombinedMetricCard,
  PersonnelDelayPenaltyRow,
} from "@/lib/task-personnel-metrics";
import type { PersonnelTicketMetric } from "@/lib/kpis";
import { KpiDefinitionConsole } from "@/components/KpiDefinitionConsole";
import { resolveRosterCompanyName } from "@/lib/hris-company-aliases";
import { DEFAULT_TIME_ZONE, type KpiFrequencyCode, isKpiMetricsWorkingYmd } from "@/lib/kpi-recurrence";
import type {
  CsatStarDistributionRow,
  TaskChecklistPillarMetrics,
  TaskMetricsHelpdeskTickets,
  TaskMetricsUserSupportTickets,
} from "@/lib/kpis";
import {
  defaultTaskMetricsRangeForCadence,
  formatTaskMetricsPeriodLabel,
  resolveTaskMetricsQueryRange,
  taskMetricsMergedPeriod,
} from "@/lib/task-metrics-range";

type KpiPayload = {
  range: { from: string; to: string };
  operational: {
    ticketVolume: number;
    backlogSize: number;
    forConfirmationSize: number;
    firstResponseTimeMsAvg: number | null;
    resolutionTimeMsAvg: number | null;
    confirmationTimeMsAvg: number | null;
    firstContactResolutionApprox: number | null;
  };
  sla: {
    firstResponseComplianceRate: number | null;
    resolutionComplianceRate: number | null;
    transferRequestRate: number | null;
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

type TaskMetricsViewMode = "company" | "personnel";

type InsightsTab = "ticket-metrics" | "task-metrics" | "kpi-mgmt";

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
  const isAdminRole = session?.user?.role === "SuperAdmin" || session?.user?.role === "Admin";
  const isCompanyScopedAdmin = session?.user?.role === "Admin";
  const [activeTab, setActiveTab] = useState<InsightsTab>("ticket-metrics");
  const [data, setData] = useState<KpiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [volumeChartView, setVolumeChartView] = useState<"density" | "line">("density");
  /** IANA zone for KPI period boundaries. */
  const [recurrenceTz, setRecurrenceTz] = useState(DEFAULT_TIME_ZONE);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        setRecurrenceTz(DEFAULT_TIME_ZONE);
      } catch {
        setRecurrenceTz(DEFAULT_TIME_ZONE);
      }
    });
  }, []);

  /** Personnel only see personal ticket metrics. SuperAdmin/Admin see task reporting tabs. */
  const showTaskReportingTabs = isAdminRole;
  const showKpiTasksTab = false;

  const defaultRange = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  }, []);

  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);

  const taskMetricsDefaults = useMemo(() => defaultTaskMetricsRangeForCadence("MONTHLY"), []);
  const [taskMetricsCadence, setTaskMetricsCadence] = useState<KpiFrequencyCode>("MONTHLY");
  const [taskMetricsDailyDate, setTaskMetricsDailyDate] = useState(taskMetricsDefaults.dailyDate);
  const [taskMetricsFrom, setTaskMetricsFrom] = useState(taskMetricsDefaults.from);
  const [taskMetricsTo, setTaskMetricsTo] = useState(taskMetricsDefaults.to);
  const [taskMetricsHelpdesk, setTaskMetricsHelpdesk] = useState<TaskMetricsHelpdeskTickets | null>(null);
  const [taskMetricsUserSupport, setTaskMetricsUserSupport] = useState<TaskMetricsUserSupportTickets | null>(
    null,
  );
  const [taskMetricCompanies, setTaskMetricCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedTaskMetricCompany, setSelectedTaskMetricCompany] = useState("");
  const [selectedTicketMetricCompany, setSelectedTicketMetricCompany] = useState("");
  const [taskChecklistPillars, setTaskChecklistPillars] = useState<TaskChecklistPillarMetrics | null>(null);
  const [personnelTicketMetrics, setPersonnelTicketMetrics] = useState<PersonnelTicketMetric[]>([]);
  const [personnelDelayPenalties, setPersonnelDelayPenalties] = useState<PersonnelDelayPenaltyRow[]>([]);
  const [taskMetricsLoading, setTaskMetricsLoading] = useState(false);
  const [taskMetricsError, setTaskMetricsError] = useState<string | null>(null);
  const [taskMetricsViewMode, setTaskMetricsViewMode] = useState<TaskMetricsViewMode>("company");

  const loadKpis = useCallback(async () => {
    setError(null);
    if (isAdminRole && !selectedTicketMetricCompany) {
      setData(null);
      return;
    }
    const qs = new URLSearchParams({ from, to });
    if (isAdminRole) {
      qs.set("companyId", selectedTicketMetricCompany);
    }
    const res = await fetch(`/api/kpis?${qs.toString()}`, { cache: "no-store" });
    if (!res.ok) {
      setError("Could not load KPIs. Is the database running and migrated?");
      setData(null);
      return;
    }
    const json = (await res.json()) as KpiPayload;
    setData(json);
  }, [from, to, isAdminRole, selectedTicketMetricCompany]);

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
    if (selectedTaskMetricCompany) {
      qs.set("companyId", selectedTaskMetricCompany);
    }
    try {
      const res = await fetch(`/api/kpis/task-metrics?${qs.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        setTaskMetricsError("Could not load task metrics for the selected dates.");
        setTaskMetricsHelpdesk(null);
        setTaskMetricsUserSupport(null);
        setTaskChecklistPillars(null);
        setPersonnelTicketMetrics([]);
        setPersonnelDelayPenalties([]);
        return;
      }
      const json = (await res.json()) as {
        taskMetricsHelpdesk: TaskMetricsHelpdeskTickets;
        taskMetricsUserSupport: TaskMetricsUserSupportTickets;
        taskChecklistPillars: TaskChecklistPillarMetrics;
        personnelTicketMetrics: PersonnelTicketMetric[];
        personnelDelayPenalties?: PersonnelDelayPenaltyRow[];
      };
      setTaskMetricsHelpdesk(json.taskMetricsHelpdesk);
      setTaskMetricsUserSupport(json.taskMetricsUserSupport);
      setTaskChecklistPillars(json.taskChecklistPillars);
      setPersonnelTicketMetrics(json.personnelTicketMetrics ?? []);
      setPersonnelDelayPenalties(json.personnelDelayPenalties ?? []);
    } finally {
      setTaskMetricsLoading(false);
    }
  }, [
    taskMetricsCadence,
    taskMetricsDailyDate,
    taskMetricsFrom,
    taskMetricsTo,
    recurrenceTz,
    selectedTaskMetricCompany,
  ]);

  function handleTaskMetricsCadenceChange(next: KpiFrequencyCode) {
    setTaskMetricsCadence(next);
    const defaults = defaultTaskMetricsRangeForCadence(next);
    setTaskMetricsDailyDate(defaults.dailyDate);
    setTaskMetricsFrom(defaults.from);
    setTaskMetricsTo(defaults.to);
  }

  useEffect(() => {
    queueMicrotask(() => void loadKpis());
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
    if (activeTab !== "task-metrics") {
      return;
    }
    queueMicrotask(() => void loadTaskMetrics());
  }, [activeTab, loadTaskMetrics]);

  useEffect(() => {
    if (!showTaskReportingTabs) return;
    let cancelled = false;
    async function loadTaskMetricCompanies() {
      const res = await fetch("/api/kpis/task-project-tracker-options", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { companies: Array<{ id: string; name: string }> };
      if (cancelled) return;
      setTaskMetricCompanies(json.companies ?? []);
      setSelectedTaskMetricCompany((current) => {
        if (json.companies.some((company) => company.id === current)) return current;
        return json.companies[0]?.id ?? "";
      });
      setSelectedTicketMetricCompany((current) => {
        if (json.companies.some((company) => company.id === current)) return current;
        return json.companies[0]?.id ?? "";
      });
    }
    void loadTaskMetricCompanies();
    const id = window.setInterval(() => void loadTaskMetricCompanies(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [showTaskReportingTabs]);

  useEffect(() => {
    function onVisibility() {
      if (
        document.visibilityState === "visible" &&
        activeTab === "task-metrics"
      ) {
        void loadTaskMetrics();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [activeTab, loadTaskMetrics]);

  useEffect(() => {
    if (activeTab !== "task-metrics") {
      return;
    }
    const id = setInterval(() => void loadTaskMetrics(), 15_000);
    return () => clearInterval(id);
  }, [activeTab, loadTaskMetrics]);

  useEffect(() => {
    if (!showKpiTasksTab && activeTab === "kpi-mgmt") {
      queueMicrotask(() => setActiveTab("ticket-metrics"));
    }
    if (!showTaskReportingTabs && activeTab === "task-metrics") {
      queueMicrotask(() => setActiveTab("ticket-metrics"));
    }
  }, [showKpiTasksTab, showTaskReportingTabs, activeTab]);

  const charts = data?.charts ?? {
    days: [],
    createdByDay: [],
    closedByDay: [],
    queueStatusMix: [],
  };

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
    <main className="mx-auto max-w-[112rem] space-y-8 px-3 py-6 text-zinc-900 sm:space-y-10 sm:px-5 sm:py-8 lg:px-6 md:py-10 dark:text-zinc-100">
      <header className="rounded-2xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 p-6 shadow-[0_12px_40px_rgba(0,0,0,0.06)] md:p-8 dark:border-zinc-800/90 dark:from-[#101010] dark:to-[#080808] dark:shadow-[0_20px_50px_rgba(0,0,0,0.4)]">
        <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700 dark:text-orange-400/95">
              {BRAND_TITLE} · {isPersonnel ? "Personal metrics" : "Ticket metrics & reports"}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 md:text-4xl dark:text-white">
              {isPersonnel ? "Personal performance intelligence" : "Operations intelligence"}
            </h1>
        </div>
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as InsightsTab)} className="mt-6">
          <TabsList className="flex flex-wrap rounded-full border border-zinc-300 bg-zinc-100 p-1 text-xs font-semibold dark:border-zinc-700 dark:bg-zinc-900/90">
            <TabsTrigger value="ticket-metrics" className="rounded-full px-4 py-1.5 text-xs font-semibold data-[state=active]:bg-orange-600 data-[state=active]:text-white">
              {isPersonnel ? "My Ticket Metrics and Reports" : "Ticket Metrics and Reports"}
            </TabsTrigger>
            {showTaskReportingTabs ? (
              <TabsTrigger value="task-metrics" className="rounded-full px-4 py-1.5 text-xs font-semibold data-[state=active]:bg-orange-600 data-[state=active]:text-white">
                Task Metrics
              </TabsTrigger>
            ) : null}
            {showKpiTasksTab ? (
              <TabsTrigger value="kpi-mgmt" className="rounded-full px-4 py-1.5 text-xs font-semibold data-[state=active]:bg-orange-600 data-[state=active]:text-white">
                {isPersonnel ? "My Task Management" : "Task Management"}
              </TabsTrigger>
            ) : null}
          </TabsList>
        </Tabs>
      </header>

      {error && activeTab === "ticket-metrics" ? (
        <p className="rounded-xl border border-red-500/35 bg-red-50 px-4 py-3 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {activeTab === "kpi-mgmt" ? (
        <div className="space-y-6">
          <KpiDefinitionConsole onMaintenanceRecordsUpdated={() => {}} />
        </div>
      ) : activeTab === "task-metrics" && showTaskReportingTabs ? (
        <div className="space-y-6">
          <TaskMetricsPanel
            checklistPillars={taskChecklistPillars}
            personnelTicketMetrics={personnelTicketMetrics}
            personnelDelayPenalties={personnelDelayPenalties}
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
            reportingTimeZone={recurrenceTz}
            companies={taskMetricCompanies}
            selectedCompany={selectedTaskMetricCompany}
            onSelectedCompanyChange={setSelectedTaskMetricCompany}
            lockCompanySelection={isCompanyScopedAdmin}
            metricsViewMode={taskMetricsViewMode}
            onMetricsViewModeChange={setTaskMetricsViewMode}
            allowAllCompaniesInPersonnel={true}
          />
        </div>
      
      ) : (
        <div className="space-y-8">
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
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MetricTile
                  label="Ticket volume"
                  value={String(data.operational.ticketVolume)}
                  accent
                />
                <MetricTile
                  label="Backlog"
                  value={String(data.operational.backlogSize)}
                />
                <MetricTile
                  label="For Confirmation"
                  value={String(data.operational.forConfirmationSize)}
                />
                <MetricTile
                  label="Closed"
                  value={String(data.sla.ticketsClosedInRange)}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <MetricTile
                  label="Avg first response"
                  value={formatDuration(data.operational.firstResponseTimeMsAvg)}
                />
                <MetricTile
                  label="Avg resolution time"
                  value={formatDuration(data.operational.resolutionTimeMsAvg)}
                />
                <MetricTile
                  label="Avg confirmation time"
                  value={formatDuration(data.operational.confirmationTimeMsAvg)}
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
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    Created vs closed (daily, real-time)
                  </p>
                  <Tabs value={volumeChartView} onValueChange={(value) => setVolumeChartView(value as typeof volumeChartView)}>
                    <TabsList className="rounded-full border border-zinc-300 bg-zinc-100 p-1 text-[10px] font-bold uppercase tracking-[0.12em] dark:border-zinc-700 dark:bg-zinc-900/90">
                      <TabsTrigger value="density" className="rounded-full px-3 py-1 text-[10px] font-bold uppercase data-[state=active]:bg-orange-600 data-[state=active]:text-white">
                        Density
                      </TabsTrigger>
                      <TabsTrigger value="line" className="rounded-full px-3 py-1 text-[10px] font-bold uppercase data-[state=active]:bg-orange-600 data-[state=active]:text-white">
                        Line chart
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </div>
              <div className="flex flex-wrap items-end justify-end gap-3 text-xs text-zinc-600 dark:text-zinc-500">
                {isAdminRole ? (
                  isCompanyScopedAdmin ? (
                    <CompanyValueLabel
                      label="Company"
                      value={
                        taskMetricCompanies.find((company) => company.id === selectedTicketMetricCompany)?.name ??
                        "No assigned company"
                      }
                      className="min-w-[12rem]"
                    />
                  ) : (
                    <label className="flex min-w-[12rem] flex-col text-left text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
                      Company
                      <select
                        value={selectedTicketMetricCompany}
                        onChange={(e) => setSelectedTicketMetricCompany(e.target.value)}
                        className="mt-1.5 min-h-10 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-zinc-900 outline-none transition focus:border-orange-400/70 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700/80 dark:bg-zinc-900/60 dark:text-zinc-100"
                      >
                        {taskMetricCompanies.map((company) => (
                          <option key={company.id} value={company.id}>
                            {company.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )
                ) : null}
                <label className="flex flex-col text-left text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
                  From
                  <DatePickerField
                    value={from}
                    max={to || undefined}
                    onChange={(e) => setFrom(e.target.value)}
                    wrapperClassName="mt-1.5 min-w-[10.5rem]"
                  />
                </label>
                <label className="flex flex-col text-left text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
                  To
                  <DatePickerField
                    value={to}
                    min={from || undefined}
                    onChange={(e) => setTo(e.target.value)}
                    wrapperClassName="mt-1.5 min-w-[10.5rem]"
                  />
                </label>
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
                variant={volumeChartView}
              />
            </div>
          </section>

          {/* Queue composition + SLA performance */}
          <section className="grid gap-6 lg:grid-cols-2">
            <div className="stoic-card p-5 sm:p-7">
              <h2 className="stoic-label">Queue composition</h2>
              <div className="mt-6">
                <MetricsPieChart
                  title="Open queue distribution"
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
              <div className="mt-6 grid grid-cols-2 gap-6 sm:gap-8">
                <MetricsGauge
                  label="First response"
                  value={data.sla.firstResponseComplianceRate}
                  target={0.95}
                />
                <MetricsGauge
                  label="Resolution"
                  value={data.sla.resolutionComplianceRate}
                  target={0.95}
                />
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3 border-t border-border pt-6">
                <div className="rounded-xl border border-border bg-surface-muted px-3 py-4 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Transfer request rate
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-brand">
                    {pct(data.sla.transferRequestRate)}
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
                />
              </div>
            </div>
          </section>
            </>
          )}
        </div>
      )}
    </main>
  );
}

function CompanyValueLabel({
  label,
  value,
  className,
  valueClassName,
}: {
  label: string;
  value: string;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5 text-left", className)}>
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">
        {label}
      </span>
      <span
        className={cn(
          "flex min-h-9 items-center rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm font-semibold text-zinc-900 dark:border-zinc-700/80 dark:bg-zinc-900/60 dark:text-zinc-100",
          valueClassName,
        )}
      >
        {value}
      </span>
    </div>
  );
}



function TaskMetricsPanel({
  checklistPillars,
  personnelTicketMetrics,
  personnelDelayPenalties,
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
  reportingTimeZone,
  companies,
  selectedCompany,
  onSelectedCompanyChange,
  lockCompanySelection,
  metricsViewMode,
  onMetricsViewModeChange,
  allowAllCompaniesInPersonnel,
}: {
  checklistPillars: TaskChecklistPillarMetrics | null;
  personnelTicketMetrics: PersonnelTicketMetric[];
  personnelDelayPenalties: PersonnelDelayPenaltyRow[];
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
  reportingTimeZone: string;
  companies: Array<{ id: string; name: string }>;
  selectedCompany: string;
  onSelectedCompanyChange: (v: string) => void;
  lockCompanySelection: boolean;
  metricsViewMode: TaskMetricsViewMode;
  onMetricsViewModeChange: (mode: TaskMetricsViewMode) => void;
  allowAllCompaniesInPersonnel: boolean;
}) {
  const freq = taskMetricsCadence;
  const isDaily = freq === "DAILY";
  const isMonthly = freq === "MONTHLY";
  const reportingDayIsSunday =
    isDaily && dailyDate.trim() !== "" && !isKpiMetricsWorkingYmd(dailyDate, reportingTimeZone);

  const reportingPeriodLabel = formatTaskMetricsPeriodLabel(freq, {
    dailyDate,
    rangeFrom,
    rangeTo,
  });
  const showCompanyTaskMetrics = metricsViewMode === "company" && selectedCompany !== "";
  const selectedCompanyName =
    selectedCompany === ""
      ? null
      : companies.find((company) => company.id === selectedCompany)?.name ?? null;
  const showPersonnelCompanyFilter = metricsViewMode === "personnel";
  const showCompanyScopeFilter = metricsViewMode === "company";

  // Personnel view reads the stored KPI from mergedatabase-demo (merged_users +
  // merged_user_efficiency_breakdowns) so stored values can be verified.
  const [mergedPersonnelRows, setMergedPersonnelRows] = useState<MergedPersonnelEfficiencyRow[]>([]);
  type MergedPersonnelEfficiencyRow = {
    sourceUserId: string;
    name: string;
    companyName: string | null;
    totalTasks: number;
    completedTasks: number;
    delayedTasks: number;
    ticketsClosed: number;
    ticketsPending: number;
    taskEfficiency: number | null;
    ticketEfficiency: number | null;
    overallEfficiency: number;
    onTimeCompletionRate: number | null;
    computedAt: string;
  };
  const [mergedPersonnelLoading, setMergedPersonnelLoading] = useState(false);
  const [mergedPersonnelError, setMergedPersonnelError] = useState<string | null>(null);
  const mergedPeriod = taskMetricsMergedPeriod(freq, { dailyDate, rangeFrom, rangeTo });

  useEffect(() => {
    if (metricsViewMode !== "personnel") return;
    let cancelled = false;
    async function loadMergedPersonnel() {
      setMergedPersonnelLoading(true);
      setMergedPersonnelError(null);
      try {
        const qs = new URLSearchParams({
          mode: "personnel",
          periodKey: mergedPeriod.periodKey,
          frequency: mergedPeriod.frequency,
        });
        const res = await fetch(`/api/admin/efficiency?${qs.toString()}`, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) {
            setMergedPersonnelRows([]);
            setMergedPersonnelError("Could not load merged KPI rows for this period.");
          }
          return;
        }
        const json = (await res.json()) as { rows?: MergedPersonnelEfficiencyRow[] };
        if (!cancelled) setMergedPersonnelRows(json.rows ?? []);
      } catch {
        if (!cancelled) {
          setMergedPersonnelRows([]);
          setMergedPersonnelError("Could not load merged KPI rows for this period.");
        }
      } finally {
        if (!cancelled) setMergedPersonnelLoading(false);
      }
    }
    void loadMergedPersonnel();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricsViewMode, mergedPeriod.periodKey, mergedPeriod.frequency]);

  const mergedPersonnelCards = useMemo<PersonnelCombinedMetricCard[]>(() => {
    let rows = mergedPersonnelRows;
    if (selectedCompanyName) {
      const target = resolveRosterCompanyName(selectedCompanyName) ?? selectedCompanyName;
      rows = rows.filter((row) => {
        const rowCompany =
          resolveRosterCompanyName(row.companyName) ?? row.companyName?.trim() ?? "";
        return rowCompany.toLowerCase() === target.toLowerCase();
      });
    }
    return rows.map((row) => ({
      id: row.sourceUserId,
      name: row.name,
      role: "Assignee",
      tickets:
        row.ticketEfficiency != null || row.ticketsClosed + row.ticketsPending > 0
          ? {
              closed: row.ticketsClosed,
              pending: row.ticketsPending,
              efficiency: Math.round(row.ticketEfficiency ?? 0),
            }
          : null,
      tasks:
        row.totalTasks > 0 || row.taskEfficiency != null
          ? {
              closed: row.completedTasks,
              pending: Math.max(0, row.totalTasks - row.completedTasks),
              efficiency: Math.round(row.taskEfficiency ?? 0),
              pillarsContributed: 0,
            }
          : null,
    }));
  }, [mergedPersonnelRows, selectedCompanyName]);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_12px_36px_rgba(0,0,0,0.06)] sm:p-7 dark:border-zinc-800/90 dark:bg-[#0a0a0a] dark:shadow-[0_16px_48px_rgba(0,0,0,0.35)]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600 dark:text-zinc-500">
            Task metrics
          </h3>
          <div className="mt-3 inline-flex rounded-xl border border-zinc-200 bg-zinc-100/80 p-1 dark:border-zinc-700 dark:bg-zinc-900/60">
            {(
              [
                { id: "company", label: "Company" },
                { id: "personnel", label: "Personnel" },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  onMetricsViewModeChange(option.id);
                  if (option.id === "personnel" && allowAllCompaniesInPersonnel) {
                    onSelectedCompanyChange("");
                  } else if (option.id === "company" && !selectedCompany && companies[0]) {
                    onSelectedCompanyChange(companies[0].id);
                  }
                }}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                  metricsViewMode === option.id
                    ? "bg-orange-600 text-white shadow-sm"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-4 lg:w-auto lg:items-end">
          <div
            className={cn(
              "grid w-full gap-3 sm:items-end",
              showPersonnelCompanyFilter || showCompanyScopeFilter
                ? "sm:grid-cols-[minmax(12rem,18rem)_auto]"
                : "sm:grid-cols-1",
            )}
          >
            {showCompanyScopeFilter ? (
              lockCompanySelection ? (
                <CompanyValueLabel
                  label="Company"
                  value={companies.find((company) => company.id === selectedCompany)?.name ?? "No assigned company"}
                />
              ) : (
                <label className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">
                    Company
                  </span>
                  <select
                    value={selectedCompany}
                    onChange={(e) => onSelectedCompanyChange(e.target.value)}
                    className="min-h-9 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm font-semibold text-zinc-900 outline-none transition focus:border-orange-400/70 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700/80 dark:bg-zinc-900/60 dark:text-zinc-100"
                  >
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </label>
              )
            ) : null}
            {showPersonnelCompanyFilter ? (
              lockCompanySelection ? (
                <CompanyValueLabel
                  label="Company"
                  value={companies.find((company) => company.id === selectedCompany)?.name ?? "No assigned company"}
                />
              ) : (
                <label className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">
                    Company
                  </span>
                  <select
                    value={selectedCompany}
                    onChange={(e) => onSelectedCompanyChange(e.target.value)}
                    className="min-h-9 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm font-semibold text-zinc-900 outline-none transition focus:border-orange-400/70 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700/80 dark:bg-zinc-900/60 dark:text-zinc-100"
                  >
                    {allowAllCompaniesInPersonnel ? <option value="">All companies</option> : null}
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </label>
              )
            ) : null}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">
                Cadence
              </span>
              <div className="inline-flex flex-wrap gap-1.5 rounded-xl border border-zinc-200 bg-zinc-100/80 p-1 dark:border-zinc-700 dark:bg-zinc-900/60">
                {(["WEEKLY", "MONTHLY", "QUARTERLY"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => onTaskMetricsCadenceChange(f)}
                    className={cn(
                      "rounded-lg px-2.5 py-1.5 text-xs font-semibold transition",
                      freq === f
                        ? "bg-orange-600 text-white shadow-sm"
                        : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
                    )}
                  >
                    {f === "WEEKLY" ? "Weekly" : f === "MONTHLY" ? "Monthly" : "Quarterly"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div
            className={cn(
              "w-full rounded-xl border border-zinc-200 bg-zinc-50/90 p-2.5 dark:border-zinc-700/80 dark:bg-zinc-900/50",
              isDaily || isMonthly ? "sm:max-w-[12rem]" : "sm:max-w-[20rem]",
            )}
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">
              {isDaily ? "Reporting day" : isMonthly ? "Reporting month" : "Reporting range"}
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
            ) : isMonthly ? (
              <label className="mt-2 flex flex-col text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500">
                Month
                <DatePickerField
                  granularity="month"
                  value={rangeFrom}
                  onChange={(e) => {
                    const ym = e.target.value;
                    onRangeFromChange(ym);
                    onRangeToChange(ym);
                  }}
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
            {loading ? (
              <p className="mt-3 text-xs font-semibold text-orange-700 dark:text-orange-300">Updating metrics…</p>
            ) : null}
          </div>
        </div>
      </div>
      {error ? (
        <p className="mt-4 rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-900 dark:border-rose-500/30 dark:text-rose-100">
          {error}
        </p>
      ) : null}
      {reportingDayIsSunday ? (
        <p className="mt-4 rounded-xl border border-zinc-300 bg-zinc-100 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900/60 dark:text-zinc-300">
          Sundays are not counted for task metrics (checklist KPIs, helpdesk, and user support). Pick a
          Monday–Saturday reporting day, or use weekly / monthly cadence.
        </p>
      ) : null}
      <div className={cn("mt-6", loading && "pointer-events-none opacity-60")}>
        {metricsViewMode === "company" ? (
          <TaskPillarMetricsGrid
            checklistPillars={checklistPillars}
            metricsCadence={freq}
            reportingPeriodLabel={reportingPeriodLabel}
            helpdeskTickets={helpdeskTickets}
            userSupportTickets={userSupportTickets}
            includeChecklistPillars={showCompanyTaskMetrics}
          />
        ) : (
          <>
            {mergedPersonnelError ? (
              <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-900 dark:border-rose-500/30 dark:text-rose-100">
                {mergedPersonnelError}
              </p>
            ) : null}
            <PersonnelTaskMetricsGrid
              rows={mergedPersonnelCards}
              reportingPeriodLabel={reportingPeriodLabel}
              companyLabel={selectedCompanyName}
              loading={mergedPersonnelLoading}
            />
          </>
        )}
      </div>
    </section>
  );
}

function MetricTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
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
    </article>
  );
}
