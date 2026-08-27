import { isElevatedUserRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/access";
import { BRAND_TITLE } from "@/lib/brand";
import { TASK_FREQUENCY_DONUT_KEYS } from "@/lib/task-metrics-task-type";
import { AgentKpiKanbanFlow } from "../kpi-kanban-flow";
import { TaskBoardFilterBar } from "./task-board-filter-bar";

export const dynamic = "force-dynamic";

function firstQuery(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AgentTasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    task?: string | string[];
    fromJobOrder?: string | string[];
    q?: string | string[];
    category?: string | string[];
    frequency?: string | string[];
  }>;
}) {
  const session = await requireSession();
  if (!session?.user) redirect("/signin");
  if (!["SuperAdmin", "HighAdmin", "Personnel", "Admin"].includes(session.user.role)) redirect("/");

  const params = await searchParams;
  const focusTaskId = firstQuery(params.task)?.trim() || null;
  const fromJobOrderTicketId = firstQuery(params.fromJobOrder)?.trim() || null;
  const searchQuery = (firstQuery(params.q) ?? "").replace(/^#/, "").trim();

  const categoryFilter = (() => {
    const v = firstQuery(params.category) ?? "all";
    return v === "task" || v === "project" || v === "field" ? v : "all";
  })();

  const frequencyFilter = (() => {
    const v = (firstQuery(params.frequency) ?? "all").trim();
    return TASK_FREQUENCY_DONUT_KEYS.includes(v as (typeof TASK_FREQUENCY_DONUT_KEYS)[number])
      ? v
      : "all";
  })();

  const categoryOptions = [
    { value: "all", label: "All categories" },
    { value: "task", label: "Task" },
    { value: "project", label: "Project" },
    { value: "field", label: "Field Assignment" },
  ];

  const frequencyOptions = [
    { value: "all", label: "All frequencies" },
    ...TASK_FREQUENCY_DONUT_KEYS.map((key) => ({
      value: key,
      label: key
        .split("-")
        .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
        .join(" "),
    })),
  ];

  return (
    <main className="flex min-h-[calc(100vh-56px)] flex-col bg-zinc-50 px-3 py-4 text-zinc-900 dark:bg-background dark:text-zinc-100 sm:px-4">
      <div className="mx-auto flex w-full max-w-[96rem] flex-1 flex-col space-y-4">
        <section className="space-y-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-700 dark:text-orange-400/95">
              {BRAND_TITLE} · Tasks
            </p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:mt-1.5 sm:text-2xl">
              Task Board
            </h1>
            <p className="mt-1 hidden text-sm text-zinc-600 dark:text-zinc-400 sm:block">
              Field assignments, projects, and running tasks.
            </p>
          </div>

          <section className="min-w-0">
            <div className="mb-3 sm:mb-4">
              <TaskBoardFilterBar
                initialQuery={searchQuery}
                placeholder="Search tasks by title"
                savedFilterStorageKey={`saved-task-filters:${session.user.email}:v1`}
                category={{
                  visible: true,
                  value: categoryFilter,
                  options: categoryOptions,
                }}
                frequency={{
                  visible: true,
                  value: frequencyFilter,
                  options: frequencyOptions,
                }}
              />
            </div>
            <AgentKpiKanbanFlow
              companyFilterTeamId={null}
              sessionRole={session.user.role}
              showAdminTaskManagement={
                isElevatedUserRole(session.user.role) || session.user.role === "Admin"
              }
              focusTaskId={focusTaskId}
              fromJobOrderTicketId={fromJobOrderTicketId}
              searchQuery={searchQuery}
              categoryFilter={categoryFilter}
              frequencyFilter={frequencyFilter}
            />
          </section>
        </section>
      </div>
    </main>
  );
}
