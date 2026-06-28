"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import { KINETIC_PALETTE, pieChartColor } from "@/lib/kinetic-palette";
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
import { KpiDefinitionConsole } from "@/components/KpiDefinitionConsole";
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

type TaskProjectTrackerOptions = {
  projects: Array<{ name: string }>;
  companies: Array<{ id: string; name: string }>;
  tasks: Array<{
    id: string;
    rowType: "task" | "project";
    taskId: string;
    projectName: string;
    companyId: string | null;
    companyName: string;
    taskDescription: string;
    assigneeName: string | null;
    priority: "High" | "Medium" | "Low";
    status: "Pending" | "On Going" | "Finalizing" | "Done";
    startDate: string | null;
    dueDate: string | null;
    completion: number;
    hours: number | null;
  }>;
};

type InsightsTab = "ticket-metrics" | "task-metrics" | "task-project-tracker" | "kpi-mgmt";

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

function formatTrackerHours(hours: number | null | undefined) {
  if (typeof hours !== "number" || !Number.isFinite(hours)) return "—";
  return `${hours.toFixed(1)}h`;
}

function formatMonthNameDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const timeZone = value instanceof Date ? DEFAULT_TIME_ZONE : "UTC";
  const date =
    value instanceof Date
      ? value
      : /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T12:00:00Z`)
        : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
}

export default function InsightsPage() {
  const { data: session } = useSession();
  const isPersonnel = session?.user?.role === "Personnel";
  const isAdminRole = session?.user?.role === "SuperAdmin" || session?.user?.role === "Admin";
  const isCompanyScopedAdmin = session?.user?.role === "Admin";
  const [activeTab, setActiveTab] = useState<InsightsTab>("ticket-metrics");
  const [data, setData] = useState<KpiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [throughputView, setThroughputView] = useState<"cards" | "table">("table");
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
  const [taskMetricCompanies, setTaskMetricCompanies] = useState<TaskProjectTrackerOptions["companies"]>([]);
  const [selectedTaskMetricCompany, setSelectedTaskMetricCompany] = useState("");
  const [selectedTicketMetricCompany, setSelectedTicketMetricCompany] = useState("");
  const [taskChecklistPillars, setTaskChecklistPillars] = useState<TaskChecklistPillarMetrics | null>(null);
  const [taskMetricsLoading, setTaskMetricsLoading] = useState(false);
  const [taskMetricsError, setTaskMetricsError] = useState<string | null>(null);

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
    if (activeTab !== "task-metrics" && activeTab !== "task-project-tracker") {
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
      const json = (await res.json()) as TaskProjectTrackerOptions;
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
        (activeTab === "task-metrics" || activeTab === "task-project-tracker")
      ) {
        void loadTaskMetrics();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [activeTab, loadTaskMetrics]);

  useEffect(() => {
    if (activeTab !== "task-metrics" && activeTab !== "task-project-tracker") {
      return;
    }
    const id = setInterval(() => void loadTaskMetrics(), 15_000);
    return () => clearInterval(id);
  }, [activeTab, loadTaskMetrics]);

  useEffect(() => {
    if (!showKpiTasksTab && activeTab === "kpi-mgmt") {
      queueMicrotask(() => setActiveTab("ticket-metrics"));
    }
    if (!showTaskReportingTabs && (activeTab === "task-metrics" || activeTab === "task-project-tracker")) {
      queueMicrotask(() => setActiveTab("ticket-metrics"));
    }
  }, [showKpiTasksTab, showTaskReportingTabs, activeTab]);

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
              <>
                <TabsTrigger value="task-project-tracker" className="rounded-full px-4 py-1.5 text-xs font-semibold data-[state=active]:bg-orange-600 data-[state=active]:text-white">
                  Task &amp; Project Tracker
                </TabsTrigger>
                <TabsTrigger value="task-metrics" className="rounded-full px-4 py-1.5 text-xs font-semibold data-[state=active]:bg-orange-600 data-[state=active]:text-white">
                  Task Metrics
                </TabsTrigger>
              </>
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
          />
        </div>
      ) : activeTab === "task-project-tracker" && showTaskReportingTabs ? (
        <TaskProjectTrackerPanel
          loading={taskMetricsLoading}
          taskMetricsCadence={taskMetricsCadence}
          dailyDate={taskMetricsDailyDate}
          rangeFrom={taskMetricsFrom}
          rangeTo={taskMetricsTo}
          lockCompanySelection={isCompanyScopedAdmin}
        />
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
              </div>
              <Tabs value={throughputView} onValueChange={(value) => setThroughputView(value as typeof throughputView)}>
                <TabsList className="rounded-full border border-zinc-300 bg-zinc-100 p-1 text-xs font-semibold dark:border-zinc-700 dark:bg-zinc-900/90">
                  <TabsTrigger value="cards" className="rounded-full px-4 py-1.5 text-xs font-semibold data-[state=active]:bg-orange-600 data-[state=active]:text-white">
                    Cards
                  </TabsTrigger>
                  <TabsTrigger value="table" className="rounded-full px-4 py-1.5 text-xs font-semibold data-[state=active]:bg-orange-600 data-[state=active]:text-white">
                    Table
                  </TabsTrigger>
                </TabsList>
              </Tabs>
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

function TaskProjectTrackerPanel({
  loading,
  taskMetricsCadence,
  dailyDate,
  rangeFrom,
  rangeTo,
  lockCompanySelection,
}: {
  loading: boolean;
  taskMetricsCadence: KpiFrequencyCode;
  dailyDate: string;
  rangeFrom: string;
  rangeTo: string;
  lockCompanySelection: boolean;
}) {
  const reportingPeriodLabel = formatTaskMetricsPeriodLabel(taskMetricsCadence, {
    dailyDate,
    rangeFrom,
    rangeTo,
  });
  const [trackerOptions, setTrackerOptions] = useState<TaskProjectTrackerOptions>({
    projects: [{ name: "IT PROJECT IMPLEMENTATION" }],
    companies: [],
    tasks: [],
  });
  const allProjectsValue = "ALL";
  const [selectedProject, setSelectedProject] = useState(allProjectsValue);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [detailsView, setDetailsView] = useState<"task" | "project">("task");
  const [currentDate, setCurrentDate] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;
    async function loadOptions() {
      const res = await fetch("/api/kpis/task-project-tracker-options", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as TaskProjectTrackerOptions;
      if (cancelled) return;
      setTrackerOptions(json);
      setSelectedProject((current) => {
        if (current === allProjectsValue) return current;
        if (json.projects.some((project) => project.name === current)) return current;
        return allProjectsValue;
      });
      setSelectedCompany((current) => {
        if (json.companies.some((company) => company.id === current)) return current;
        return json.companies[0]?.id ?? "";
      });
    }
    void loadOptions();
    const id = window.setInterval(() => void loadOptions(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setCurrentDate(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const projectTableRows = trackerOptions.tasks.filter((task) => {
    if (selectedProject !== allProjectsValue && task.projectName !== selectedProject) return false;
    if (selectedCompany && task.companyId !== selectedCompany) return false;
    return true;
  });
  const detailTableRows = projectTableRows.filter((task) => task.rowType === detailsView);
  const detailTotal = detailTableRows.length;
  const detailDone = detailTableRows.filter((task) => task.completion === 100).length;
  const detailMissing = Math.max(0, detailTotal - detailDone);
  const detailPercent =
    detailTotal > 0 ? Math.round(detailTableRows.reduce((sum, task) => sum + task.completion, 0) / detailTotal) : 0;
  const titleColumnLabel = detailsView === "project" ? "Project Title" : "Task Title";
  const projectTotal = projectTableRows.length;
  const projectDone = projectTableRows.filter((task) => task.completion === 100).length;
  const projectInProgress = projectTableRows.filter((task) => task.completion === 50 || task.completion === 75).length;
  const projectNotStarted = projectTableRows.filter((task) => task.completion < 50).length;
  const projectMissing = Math.max(0, projectTotal - projectDone);
  const projectSegments = [
    { label: "Project completed", value: projectDone, color: KINETIC_PALETTE.accentTealBright },
    { label: "In progress", value: projectInProgress, color: KINETIC_PALETTE.brand },
    { label: "Pending", value: projectNotStarted, color: KINETIC_PALETTE.brandSoft },
  ].filter((segment) => segment.value > 0);
  const employeeCompletionRows = Array.from(
    projectTableRows.reduce((map, task) => {
      const key = task.assigneeName?.trim() || "Unassigned";
      const current = map.get(key) ?? { totalCompletion: 0, count: 0 };
      map.set(key, {
        totalCompletion: current.totalCompletion + task.completion,
        count: current.count + 1,
      });
      return map;
    }, new Map<string, { totalCompletion: number; count: number }>()),
  )
    .map(([label, value]) => ({
      label,
      value: value.count > 0 ? Math.round(value.totalCompletion / value.count) : 0,
      taskCount: value.count,
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  const companyTaskSegments = Array.from(
    projectTableRows.reduce((map, task) => {
      const key = task.companyName || "Unassigned company";
      map.set(key, (map.get(key) ?? 0) + 1);
      return map;
    }, new Map<string, number>()),
  ).map(([label, value], index) => ({
    label,
    value,
    color: pieChartColor(index),
  }));

  return (
    <section className="space-y-5 rounded-[1.75rem] border border-zinc-200 bg-zinc-50 p-3 shadow-[0_18px_60px_rgba(15,23,42,0.10)] dark:border-zinc-800 dark:bg-[#070707] sm:p-4 xl:p-5">
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-[#090909]">
        <div className="border-b border-zinc-200 bg-white px-4 py-3 text-zinc-900 dark:border-zinc-800 dark:bg-[#0d0d0d] dark:text-zinc-100 sm:px-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/25 dark:bg-orange-500/10 dark:text-orange-300">
                <ClipboardList className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-xl font-black uppercase tracking-tight sm:text-2xl">Task &amp; Project Tracker</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-orange-700 dark:text-orange-300">
                  {loading ? "Refreshing" : reportingPeriodLabel}
                </p>
              </div>
            </div>
            <div className="grid gap-2 text-xs sm:grid-cols-3 xl:min-w-[34rem]">
              <label className="flex flex-col rounded-lg border border-zinc-200 bg-zinc-50 p-2 font-bold tracking-[0.08em] text-zinc-600 shadow-inner dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-400">
                Select Task/Project
                <select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  className="mt-1 rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-xs font-semibold normal-case tracking-normal text-zinc-900 outline-none focus:border-orange-400/70 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                >
                  <option value={allProjectsValue}>All Tasks/Projects</option>
                  {trackerOptions.projects.map((project) => (
                    <option key={project.name} value={project.name}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              {lockCompanySelection ? (
                <CompanyValueLabel
                  label="Company"
                  value={
                    trackerOptions.companies.find((company) => company.id === selectedCompany)?.name ??
                    "No assigned company"
                  }
                  className="rounded-lg border border-zinc-200 bg-zinc-50 p-2 shadow-inner dark:border-zinc-800 dark:bg-zinc-950/70"
                  valueClassName="mt-1 rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-950"
                />
              ) : (
                <label className="flex flex-col rounded-lg border border-zinc-200 bg-zinc-50 p-2 font-bold tracking-[0.08em] text-zinc-600 shadow-inner dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-400">
                  Select Company
                  <select
                    value={selectedCompany}
                    onChange={(e) => setSelectedCompany(e.target.value)}
                    className="mt-1 rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-xs font-semibold normal-case tracking-normal text-zinc-900 outline-none focus:border-orange-400/70 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                  >
                    {trackerOptions.companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="flex flex-col rounded-lg border border-zinc-200 bg-zinc-50 p-2 font-bold tracking-[0.08em] text-zinc-600 shadow-inner dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-400">
                Today&apos;s date
                <span className="mt-1 rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-xs font-semibold normal-case tracking-normal text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50">
                  {formatMonthNameDate(currentDate)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 bg-zinc-50 p-4 sm:grid-cols-2 xl:grid-cols-4 xl:p-5 dark:bg-[#0d0d0d]">
          <EfficiencyStatCard
            label="Total tasks"
            value={String(projectTotal)}
            tone="neutral"
          />
          <EfficiencyStatCard
            label="Completed tasks"
            value={String(projectDone)}
            tone="green"
          />
          <EfficiencyStatCard
            label="In progress"
            value={String(projectInProgress)}
            tone="orange"
          />
          <EfficiencyStatCard
            label="Pending tasks"
            value={String(projectMissing)}
            tone="amber"
          />
        </div>
      </div>

      <div className={cn("grid items-start gap-4 xl:grid-cols-[1fr_1.18fr_1fr]", loading && "opacity-60")}>
        <section className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_12px_36px_rgba(15,23,42,0.08)] sm:p-5 dark:border-zinc-800 dark:bg-[#0a0a0a]">
          <MetricsPieChart
            title="Task status breakdown"
            itemsLabel={(n) => `${n} task item${n === 1 ? "" : "s"}`}
            emptyDescription="No task work found for this period."
            showPercentages
            donut
            pieClassName="h-40 w-40 2xl:h-48 2xl:w-48"
            segments={projectSegments}
          />
        </section>

        <section className="min-w-0 rounded-2xl border border-orange-200/70 bg-white p-4 shadow-[0_12px_36px_rgba(15,23,42,0.08)] sm:p-5 dark:border-orange-500/20 dark:bg-[#0a0a0a]">
          <EmployeeCompletionProgressChart
            title="Completion % by employee"
            emptyDescription="Assign IT project tasks to personnel to show employee completion."
            rows={employeeCompletionRows}
          />
        </section>

        <section className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_12px_36px_rgba(15,23,42,0.08)] sm:p-5 dark:border-zinc-800 dark:bg-[#0a0a0a]">
          <MetricsPieChart
            title="Task by company"
            itemsLabel={(n) => `${n} task${n === 1 ? "" : "s"}`}
            emptyDescription="No company-scoped IT project tasks in this filter."
            showPercentages
            donut
            pieClassName="h-40 w-40 2xl:h-48 2xl:w-48"
            segments={companyTaskSegments}
          />
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.08)] dark:border-zinc-800 dark:bg-[#080808]">
        <div className="flex flex-col gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-4 sm:flex-row sm:items-end sm:justify-between dark:border-zinc-800 dark:bg-zinc-950/70">
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600 dark:text-zinc-500">
              Task/project details
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <Tabs value={detailsView} onValueChange={(value) => setDetailsView(value as typeof detailsView)}>
              <TabsList className="mr-1 rounded-full border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-950">
                <TabsTrigger value="task" className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] data-[state=active]:bg-orange-600 data-[state=active]:text-white">
                  Tasks
                </TabsTrigger>
                <TabsTrigger value="project" className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] data-[state=active]:bg-orange-600 data-[state=active]:text-white">
                  Project Tasks
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">
              {detailPercent}% complete
            </span>
            <span className="rounded-full bg-orange-100 px-3 py-1 text-orange-800 dark:bg-orange-500/15 dark:text-orange-200">
              {detailMissing} pending
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] table-fixed divide-y divide-zinc-200 text-[11px] dark:divide-zinc-800 xl:text-xs">
            <colgroup>
              <col className="w-[6%]" />
              <col className="w-[16%]" />
              <col className="w-[8%]" />
              <col className="w-[11%]" />
              <col className="w-[18%]" />
              <col className="w-[7%]" />
              <col className="w-[8%]" />
              <col className="w-[7%]" />
              <col className="w-[7%]" />
              <col className="w-[7%]" />
              <col className="w-[5%]" />
            </colgroup>
            <thead className="bg-zinc-100 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-600 dark:bg-zinc-900/80 dark:text-zinc-500">
              <tr>
                <th className="px-2.5 py-3">Task ID</th>
                <th className="px-2.5 py-3">{titleColumnLabel}</th>
                <th className="px-2.5 py-3">Company</th>
                <th className="px-2.5 py-3">Assignee</th>
                <th className="px-2.5 py-3">Task description</th>
                <th className="px-2.5 py-3">Priority</th>
                <th className="px-2.5 py-3">Status</th>
                <th className="px-2.5 py-3">Start date</th>
                <th className="px-2.5 py-3">Due date</th>
                <th className="px-2.5 py-3">Completion</th>
                <th className="px-2.5 py-3 text-center">Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
              {detailTotal > 0 ? (
                detailTableRows.map((row) => (
                  <tr key={row.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                    <td className="break-words px-2.5 py-3 font-mono font-bold text-zinc-700 dark:text-zinc-300">{row.taskId}</td>
                    <td className="whitespace-normal break-normal px-2.5 py-3 font-semibold text-zinc-900 dark:text-zinc-100">{row.projectName}</td>
                    <td className="break-words px-2.5 py-3 text-zinc-600 dark:text-zinc-400">{row.companyName}</td>
                    <td className="break-words px-2.5 py-3 font-semibold text-zinc-700 dark:text-zinc-300">{row.assigneeName ?? "Unassigned"}</td>
                    <td className="break-words px-2.5 py-3 text-zinc-700 dark:text-zinc-300">{row.taskDescription}</td>
                    <td className="px-2.5 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase",
                          row.priority === "High"
                            ? "bg-blue-500/10 text-blue-500 dark:bg-blue-500/20 dark:text-blue-300"
                            : row.priority === "Low"
                              ? "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                              : "bg-orange-500/10 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
                        )}
                      >
                        {row.priority}
                      </span>
                    </td>
                    <td className="break-words px-2.5 py-3 text-zinc-600 dark:text-zinc-400">{row.status}</td>
                    <td className="break-words px-2.5 py-3 font-mono text-zinc-600 dark:text-zinc-400">{formatMonthNameDate(row.startDate)}</td>
                    <td className="break-words px-2.5 py-3 font-mono text-zinc-600 dark:text-zinc-400">{formatMonthNameDate(row.dueDate)}</td>
                    <td className="px-2.5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                          <div className="h-full rounded-full bg-orange-500" style={{ width: `${row.completion}%` }} />
                        </div>
                        <span className="font-mono text-xs font-bold text-orange-700 dark:text-orange-300">{row.completion}%</span>
                      </div>
                    </td>
                    <td className="px-2.5 py-3 text-center font-mono tabular-nums text-zinc-700 dark:text-zinc-300">{formatTrackerHours(row.hours)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-14 text-center text-sm text-zinc-600 dark:text-zinc-500 sm:px-6" colSpan={11}>
                    {detailsView === "project"
                      ? "No IT Project Implementation rows available for this filter yet."
                      : "No task rows available for this filter yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function EmployeeCompletionProgressChart({
  title,
  rows,
  emptyDescription,
}: {
  title: string;
  rows: { label: string; value: number; taskCount: number }[];
  emptyDescription: string;
}) {
  return (
    <div className="min-w-0">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-600 dark:text-zinc-500">{title}</p>
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-zinc-300 py-12 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-500">
          {emptyDescription}
        </p>
      ) : (
        <div className="mt-5 space-y-3">
          {rows.map((row) => {
            const percent = Math.max(0, Math.min(100, row.value));
            return (
              <div
                key={row.label}
                className="grid grid-cols-[minmax(8rem,0.9fr)_minmax(9rem,1.4fr)_3.5rem] items-center gap-3 text-xs"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-zinc-900 dark:text-zinc-100" title={row.label}>
                    {row.label}
                  </p>
                  <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                    {row.taskCount} task{row.taskCount === 1 ? "" : "s"}
                  </p>
                </div>
                <div
                  className="relative h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
                  aria-label={`${row.label} completion ${percent}%`}
                >
                  {percent === 0 ? <span className="absolute left-0 top-0 h-full w-1.5 rounded-full bg-orange-500/70" /> : null}
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width]",
                      percent === 100
                        ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                        : "bg-gradient-to-r from-orange-700 to-orange-500",
                    )}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <span className="text-right font-mono font-bold tabular-nums text-orange-700 dark:text-orange-300">
                  {percent}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EfficiencyStatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "green" | "amber" | "orange";
}) {
  const accentClass =
    tone === "green"
      ? "from-emerald-500 to-emerald-400"
      : tone === "amber"
        ? "from-amber-500 to-orange-400"
        : tone === "orange"
          ? "from-orange-500 to-orange-300"
          : "from-zinc-500 to-zinc-300";
  const valueClass =
    tone === "green"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "amber"
        ? "text-amber-700 dark:text-amber-300"
        : tone === "orange"
          ? "text-orange-700 dark:text-orange-300"
          : "text-zinc-900 dark:text-zinc-50";
  return (
    <article className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-[#111111]">
      <span className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", accentClass)} aria-hidden />
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">{label}</p>
      <p className={cn("mt-2 text-3xl font-black tabular-nums", valueClass)}>{value}</p>
    </article>
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
  reportingTimeZone,
  companies,
  selectedCompany,
  onSelectedCompanyChange,
  lockCompanySelection,
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
  reportingTimeZone: string;
  companies: TaskProjectTrackerOptions["companies"];
  selectedCompany: string;
  onSelectedCompanyChange: (v: string) => void;
  lockCompanySelection: boolean;
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
  const showCompanyTaskMetrics = selectedCompany !== "";

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_12px_36px_rgba(0,0,0,0.06)] sm:p-7 dark:border-zinc-800/90 dark:bg-[#0a0a0a] dark:shadow-[0_16px_48px_rgba(0,0,0,0.35)]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600 dark:text-zinc-500">
            Task metrics
          </h3>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-4 lg:w-auto lg:items-end">
          <div className="grid w-full gap-3 sm:grid-cols-[minmax(12rem,18rem)_auto] sm:items-end">
            {lockCompanySelection ? (
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
            )}
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
        <TaskPillarMetricsGrid
          checklistPillars={checklistPillars}
          metricsCadence={freq}
          reportingPeriodLabel={reportingPeriodLabel}
          helpdeskTickets={helpdeskTickets}
          userSupportTickets={userSupportTickets}
          includeChecklistPillars={showCompanyTaskMetrics}
        />
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
