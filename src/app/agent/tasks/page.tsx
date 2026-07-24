import { redirect } from "next/navigation";
import { requireSession } from "@/lib/access";
import { rosterTeamNameFilter, sortByRosterOrder } from "@/lib/company-roster";
import { prisma } from "@/lib/prisma";
import { portalCompanyAdminPrivilegesForEmail } from "@/lib/portal-staff";
import { loadAgentIdsForCompanyTeam, resolveStaffCompanyTeamId } from "@/lib/staff-company-scope";
import { AutoSubmitForm } from "@/components/AutoSubmitForm";
import { BRAND_TITLE } from "@/lib/brand";
import { AgentKpiKanbanFlow } from "../kpi-kanban-flow";
import { TicketBoardCompanySelect } from "../ticket-board-filters";

export const dynamic = "force-dynamic";

function firstQuery(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AgentTasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    company?: string | string[];
    assigned?: string | string[];
    task?: string | string[];
  }>;
}) {
  const session = await requireSession();
  if (!session?.user) redirect("/signin");
  if (!["SuperAdmin", "Personnel", "Admin"].includes(session.user.role)) redirect("/");

  const params = await searchParams;
  const selectedCompany = firstQuery(params.company) ?? "ALL";
  const selectedAssigned = firstQuery(params.assigned) ?? "ALL";
  const focusTaskId = firstQuery(params.task)?.trim() || null;

  const companyCoordinator = await portalCompanyAdminPrivilegesForEmail(session.user.email);
  const showKpiCompanyFilter =
    session.user.role === "SuperAdmin" || companyCoordinator;
  const showKpiTaskFilters = showKpiCompanyFilter;
  const kpiCompanySelected = selectedCompany !== "ALL";
  const kpiAssignedFilterActive = showKpiTaskFilters && kpiCompanySelected;

  const adminScopedCompanyId =
    session.user.role !== "SuperAdmin" &&
    (session.user.role === "Admin" || companyCoordinator)
      ? await resolveStaffCompanyTeamId(session.user.email)
      : null;

  const rosterTeamsForKpiFilter = showKpiCompanyFilter
    ? sortByRosterOrder(
        await prisma.team.findMany({
          where: rosterTeamNameFilter(),
          select: { id: true, name: true },
        }),
      ).filter((t) => (adminScopedCompanyId ? t.id === adminScopedCompanyId : true))
    : [];

  async function loadAgentsForCompanyFilter(companyTeamId: string) {
    const agentIds = await loadAgentIdsForCompanyTeam(companyTeamId);
    if (agentIds.length === 0) return [];
    return prisma.agent.findMany({
      where: { id: { in: agentIds } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
  }

  const agentsForKpiAssigneeFilter = kpiAssignedFilterActive
    ? await loadAgentsForCompanyFilter(selectedCompany)
    : [];

  const effectiveKpiAssigned =
    kpiAssignedFilterActive &&
    selectedAssigned !== "ALL" &&
    !agentsForKpiAssigneeFilter.some((a) => a.id === selectedAssigned)
      ? "ALL"
      : kpiAssignedFilterActive
        ? selectedAssigned
        : "ALL";

  return (
    <main className="flex min-h-[calc(100vh-56px)] flex-col bg-zinc-50 px-3 py-4 text-zinc-900 dark:bg-background dark:text-zinc-100 sm:px-4">
      <div className="mx-auto flex w-full max-w-[96rem] flex-1 flex-col space-y-4">
        <section className="space-y-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-700 dark:text-orange-400/95">
              {BRAND_TITLE} · Tasks
            </p>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Task Board
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Field assignments, projects, and running tasks.
            </p>
          </div>

          <section className="min-w-0">
            {showKpiTaskFilters || adminScopedCompanyId ? (
              <div className="mb-3 flex flex-col gap-2 sm:mb-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <div className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 sm:min-w-[240px]">
                    <span className="shrink-0 text-zinc-600 dark:text-zinc-400">Company:</span>
                    {adminScopedCompanyId ? (
                      <span className="min-w-0 flex-1 text-sm font-semibold text-zinc-900 dark:text-zinc-200">
                        {rosterTeamsForKpiFilter.find((t) => t.id === adminScopedCompanyId)?.name ??
                          "Your company"}
                      </span>
                    ) : (
                      <AutoSubmitForm className="contents" method="get">
                        {focusTaskId ? <input type="hidden" name="task" value={focusTaskId} /> : null}
                        <TicketBoardCompanySelect
                          defaultValue={selectedCompany}
                          options={rosterTeamsForKpiFilter}
                          className="min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-900 outline-none dark:text-zinc-200"
                        />
                      </AutoSubmitForm>
                    )}
                  </div>
                  {adminScopedCompanyId ? null : (
                    <AutoSubmitForm className="contents" method="get">
                      {selectedCompany !== "ALL" ? (
                        <input type="hidden" name="company" value={selectedCompany} />
                      ) : null}
                      {focusTaskId ? <input type="hidden" name="task" value={focusTaskId} /> : null}
                      {kpiAssignedFilterActive ? (
                        <label className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 sm:min-w-[220px]">
                          <span className="shrink-0 text-zinc-600 dark:text-zinc-400">Assigned:</span>
                          <select
                            name="assigned"
                            key={`kpi-assigned-${selectedCompany}-${effectiveKpiAssigned}`}
                            defaultValue={effectiveKpiAssigned}
                            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-900 outline-none dark:text-zinc-200"
                          >
                            <option value="ALL">All personnel</option>
                            {agentsForKpiAssigneeFilter.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </AutoSubmitForm>
                  )}
                </div>
                {!adminScopedCompanyId && showKpiTaskFilters ? (
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-500">
                    {kpiCompanySelected
                      ? effectiveKpiAssigned !== "ALL"
                        ? "Showing running tasks assigned to the selected person."
                        : "Showing running tasks assigned to personnel in this company."
                      : "Select a company to view running tasks by assignee."}
                  </p>
                ) : null}
                {adminScopedCompanyId ? (
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-500">
                    Showing running tasks for your designated company.
                  </p>
                ) : null}
              </div>
            ) : null}
            <AgentKpiKanbanFlow
              companyFilterTeamId={
                adminScopedCompanyId ??
                (showKpiCompanyFilter && selectedCompany !== "ALL" ? selectedCompany : null)
              }
              assignedAgentFilterId={
                !adminScopedCompanyId &&
                kpiAssignedFilterActive &&
                effectiveKpiAssigned !== "ALL"
                  ? effectiveKpiAssigned
                  : null
              }
              companyFilterOptions={
                adminScopedCompanyId ? [] : showKpiCompanyFilter ? rosterTeamsForKpiFilter : []
              }
              currentCompanyFilter={
                adminScopedCompanyId ?? (showKpiCompanyFilter ? selectedCompany : "ALL")
              }
              showAdminTaskManagement={
                session.user.role === "SuperAdmin" || session.user.role === "Admin"
              }
              focusTaskId={focusTaskId}
            />
          </section>
        </section>
      </div>
    </main>
  );
}
