import Link from "next/link";
import { BarChart3, SlidersHorizontal } from "lucide-react";
import type { StaffDashboardHome } from "@/lib/dashboard-home";
import { buildQuickActions } from "@/lib/global-search";
import { BRAND_TITLE } from "@/lib/brand";
import {
  DashboardActionList,
  DashboardFilterPills,
  DashboardQuickCreate,
  DashboardRecentActivity,
  DashboardSummaryCards,
  formatDashboardResponseDuration,
  type SummaryCard,
} from "@/components/dashboard/DashboardHomeSections";

type Props = {
  data: StaffDashboardHome;
  role: string;
  nowLabel: string;
};

export function PersonalizedStaffDashboard({ data, role, nowLabel }: Props) {
  const { summary } = data;
  const createActions = buildQuickActions(role)
    .filter((action) => action.id.startsWith("create-"))
    .slice(0, 4);

  const summaryCards: SummaryCard[] = data.isPersonnelView
    ? [
        { id: "open", label: "Open", value: summary.open, href: "/agent?status=OPEN" },
        {
          id: "in-progress",
          label: "In progress",
          value: summary.inProgress,
          href: "/agent?status=IN_PROGRESS",
        },
        {
          id: "for-confirmation",
          label: "For confirmation",
          value: summary.forConfirmation,
          href: "/agent?status=FOR_CONFIRMATION",
        },
        {
          id: "delayed-tasks",
          label: "Delayed tasks",
          value: summary.tasksDelayed,
          href: "/agent/tasks",
          tone: summary.tasksDelayed > 0 ? "warning" : "default",
        },
      ]
    : [
        { id: "open", label: "Open requests", value: summary.open, href: "/agent?status=OPEN" },
        {
          id: "unassigned",
          label: "Unassigned",
          value: summary.unassigned,
          href: "/agent?assigned=UNASSIGNED",
          tone: summary.unassigned > 0 ? "warning" : "default",
        },
        {
          id: "sla-breached",
          label: "SLA breached",
          value: summary.slaBreached,
          href: "/agent?priority=HIGH",
          tone: summary.slaBreached > 0 ? "danger" : "default",
        },
        {
          id: "pending-approvals",
          label: "Pending approvals",
          value: summary.pendingApprovals,
          href: "/agent",
          tone: summary.pendingApprovals > 0 ? "warning" : "default",
        },
      ];

  const adminKpiCards: SummaryCard[] = data.isAdminView
    ? [
        {
          id: "avg-response",
          label: data.isPersonnelView ? "My avg. response" : "Avg. response",
          value: formatDashboardResponseDuration(summary.avgResponseMinutes),
        },
        {
          id: "resolution-rate",
          label: data.isPersonnelView ? "My resolution rate" : "Resolution rate",
          value: `${summary.resolutionRate.toFixed(1)}%`,
        },
        {
          id: "sla-risk",
          label: "Approaching SLA",
          value: summary.slaAtRisk,
          href: "/agent?priority=HIGH",
          tone: summary.slaAtRisk > 0 ? "warning" : "default",
        },
        {
          id: "escalated",
          label: "Escalated",
          value: summary.escalated,
          href: "/agent?status=ESCALATED",
          tone: summary.escalated > 0 ? "danger" : "default",
        },
      ]
    : [];

  const filterPills = [
    { id: "today", label: "Today", href: "/agent?sort=updatedAt&dir=desc" },
    { id: "week", label: "This week", href: "/agent?sort=updatedAt&dir=desc" },
    { id: "high", label: "High priority", href: "/agent?priority=HIGH" },
    { id: "urgent", label: "Urgent", href: "/agent?priority=URGENT" },
    { id: "unassigned", label: "Unassigned", href: "/agent?assigned=UNASSIGNED" },
  ];

  const dashboardTitle = data.isPersonnelView ? "What do I need to do right now?" : "Operational dashboard";

  return (
    <main className="min-h-full bg-zinc-50 px-3 py-3 text-zinc-900 sm:px-5 sm:py-4 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto w-full max-w-7xl space-y-5">
        <header className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-700 sm:text-[11px] dark:text-orange-400/95">
            {BRAND_TITLE} · Dashboard
          </p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl dark:text-white">
            {dashboardTitle}
          </h1>
          <p className="mt-1 text-xs text-zinc-600 sm:text-sm dark:text-zinc-400">
            Welcome back, {data.greeting}. {nowLabel} · {data.scopeLabel}
          </p>
        </header>

        <DashboardSummaryCards cards={summaryCards} />
        {adminKpiCards.length > 0 ? <DashboardSummaryCards cards={adminKpiCards} /> : null}

        <DashboardQuickCreate actions={createActions} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <DashboardFilterPills pills={filterPills} />
          {data.isAdminView ? (
            <div className="flex flex-wrap gap-2">
              <Link
                href="/insights"
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-orange-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              >
                <BarChart3 className="size-3.5" aria-hidden />
                KPI / Insights
              </Link>
              <Link
                href="/process"
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-orange-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              >
                <SlidersHorizontal className="size-3.5" aria-hidden />
                Process Controls
              </Link>
            </div>
          ) : null}
        </div>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <DashboardActionList
            title="Needs your action"
            emptyMessage={
              data.isPersonnelView
                ? "You're caught up — nothing is waiting on you right now."
                : "No urgent items in your scope right now."
            }
            items={data.needsAction}
            viewAllHref="/agent"
          />

          <div className="space-y-5">
            {data.isPersonnelView ? (
              <DashboardActionList
                title="Assigned to me"
                emptyMessage="No active assignments."
                items={data.assignedPreview}
                viewAllHref="/agent"
              />
            ) : null}

            <DashboardActionList
              title={data.isPersonnelView ? "Overdue / SLA risk" : "Overdue & high priority"}
              emptyMessage="No overdue or at-risk items."
              items={data.overdueItems}
              viewAllHref="/agent?priority=HIGH"
            />

            <DashboardRecentActivity items={data.recentActivity} />
          </div>
        </section>
      </div>
    </main>
  );
}
