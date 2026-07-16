import { KpiFrequency, Prisma } from "@prisma/client/primary";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { nextRolloverEligibleAtUtc } from "@/lib/kpi-cycle-state";
import { getPeriodStartInclusive } from "@/lib/kpi-period-window";
import {
  computePeriodKey,
  getPeriodEndExclusiveFromCycleStart,
  isLegacyPeriodKey,
  normalizeTimeZone,
  type KpiFrequencyCode,
} from "@/lib/kpi-recurrence";
import {
  applyPillarOnlyTaskCreate,
  collectAllSubKpiItems,
  collectChecklistProgressItems,
  getPillarScreenshots,
  hasSubKpiAssignedTo,
  isPillarOnlyTask,
  pillarScreenshotUploadEnabled,
  pillarScreenshotsEnabled,
  type NormalizedSubKpis,
  type SubKpiItem,
  markEverySubKpiDone,
  normalizeSubKpis,
  removePillarScreenshot,
  removeSubKpiItemScreenshot,
  resetAllSubKpiDone,
  setPillarScreenshots,
  setSubKpiItemAssignee,
  setSubKpiItemDone,
  setSubKpiItemScreenshots,
  setSubKpiItemWorkMeta,
  setTaskCount,
  setTaskDailyPenaltyAmount,
  setTaskPriority,
  syncScreenshotOnlySubKpiDone,
  syncSubKpiDoneFromRequirements,
  syncPillarDoneFromRequirements,
  subKpiAssignedAgentId,
  subKpiAssignedToOperator,
  appendSubKpiItem,
  removeSubKpiItem,
  updateSubKpiItem,
  stripSubKpiStartDates,
  validateSegmentStructureForPersist,
  validateStructuredUpdate,
  wrapForPersist,
  wrapForPersistWithExistingMeta,
} from "@/lib/kpi-subkpis";
import {
  buildItProjectFromPhaseDrafts,
  isItProjectEnvelope,
  itProjectActivePhase,
  itProjectAllItems,
  parseItProjectSubKpis,
  setItProjectActivePhase,
  setItProjectSubKpiAssignee,
  setItProjectSubKpiDone,
  setItProjectSubKpiProjectMeta,
  setItProjectSubKpiSchedule,
  updateItProjectPhases,
  wrapItProjectSubKpis,
  type ItProjectData,
} from "@/lib/it-project-subkpis";
import { isItProjectImplementationPillar } from "@/lib/it-task-pillar-titles";
import { kpiMainTaskLabel } from "@/lib/kpi-main-task";
import { isAgentOnDutyFromMergedDb } from "@/lib/load-on-duty-snapshot";
import { prisma } from "@/lib/prisma";
import { rosterTeamNameFilter } from "@/lib/company-roster";
import { portalCompanyAdminPrivilegesForEmail } from "@/lib/portal-staff";
import { timeZoneFromPeriodKey, upsertKpiPeriodSnapshot } from "@/lib/kpi-period-snapshots";
import { resolveOpsPermissions } from "@/lib/ops-permissions";
import { loadAgentIdsForCompanyTeam, resolveAgentDesignatedCompanyId } from "@/lib/staff-company-scope";
import {
  hasBeforeAndAfterScreenshots,
  hasNumericalRecord,
  hasScreenshotUpload,
  normalizeCompletionRequirements,
  numericalRecordProgressPercent,
  resolveSubKpiCompletionMode,
  resolveSubKpiCompletionRequirements,
  subKpiRequiresCheckbox,
  subKpiRequiresNumerical,
  subKpiRequiresScreenshots,
  subKpiRequiresScreenshotUpload,
  subKpiRequirementsMet,
  subKpiStoredCompletionRequirements,
  isSubKpiCompletionMode,
  type SubKpiCompletionMode,
  type SubKpiCompletionRequirements,
} from "@/lib/sub-kpi-completion-mode";
import { MAX_TASK_SCREENSHOTS_PER_SLOT } from "@/lib/task-screenshot-constants";
import type { TaskScreenshotMetaItem, TaskScreenshotSlot } from "@/lib/task-screenshot-meta";
import {
  deleteTaskScreenshotsDir,
  persistTaskScreenshot,
  validateTaskScreenshotFile,
} from "@/lib/task-screenshots";

const allowedFrequencies = new Set(Object.values(KpiFrequency));

function checklistFullyComplete(subKpis: unknown, taskTitle?: string): boolean {
  const items = isItProjectEnvelope(subKpis)
    ? itProjectAllItems(parseItProjectSubKpis(subKpis))
    : collectChecklistProgressItems(subKpis, taskTitle);
  if (items.length === 0) return false;
  return items.every((x) => subKpiRequirementsMet(x));
}

function subKpiScreenshotsRequired(
  item: Pick<SubKpiItem, "completionRequirements" | "completionMode" | "screenshotsEnabled" | "beforeScreenshot" | "afterScreenshot">,
): boolean {
  return subKpiRequiresScreenshots(resolveSubKpiCompletionRequirements(item));
}

function subKpiScreenshotUploadRequired(
  item: Pick<SubKpiItem, "completionRequirements" | "completionMode" | "screenshotsEnabled" | "beforeScreenshot" | "afterScreenshot">,
): boolean {
  return subKpiRequiresScreenshotUpload(resolveSubKpiCompletionRequirements(item));
}

function subKpiScreenshotList(item: SubKpiItem, slot: TaskScreenshotSlot): TaskScreenshotMetaItem[] {
  if (slot === "before") return item.beforeScreenshot ?? [];
  if (slot === "after") return item.afterScreenshot ?? [];
  return item.uploadScreenshot ?? [];
}

export async function GET(req: Request) {
  const { session, unauthorized } = await requireRole(["Admin", "Personnel"]);
  if (unauthorized || !session) return unauthorized;

  const { searchParams } = new URL(req.url);
  const timeZone = normalizeTimeZone(searchParams.get("tz"));

  const perms = await resolveOpsPermissions(session);
  let where: Prisma.KpiMaintenanceWhereInput = perms.canAssignWork ? {} : {};

  const companyTeamId = searchParams.get("company")?.trim();
  if (perms.canAssignWork && companyTeamId && companyTeamId !== "ALL") {
    // Merged-first company membership so the board filter matches the personnel tab.
    const agentIds = await loadAgentIdsForCompanyTeam(companyTeamId);
    const companyScopeOr: Prisma.KpiMaintenanceWhereInput[] = [
      { assignedAgentId: null, scopedCompanyTeamId: companyTeamId },
    ];
    if (agentIds.length > 0) {
      companyScopeOr.unshift({ assignedAgentId: { in: agentIds } });
    }
    where = {
      AND: [where, { OR: companyScopeOr }],
    };
  }

  const assignedFilterId = searchParams.get("assigned")?.trim();
  if (perms.canAssignWork && assignedFilterId && assignedFilterId !== "ALL") {
    where = {
      AND: [where, { assignedAgentId: assignedFilterId }],
    };
  }

  let rows = await prisma.kpiMaintenance.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      assignedAgent: { select: { id: true, name: true, team: { select: { id: true, name: true } } } },
    },
  });
  if (!perms.canAssignWork) {
    const operatorId = perms.operator?.id ?? null;
    rows = rows.filter((row) => row.assignedAgentId === operatorId);
  }

  const now = new Date();
  const updates: Promise<unknown>[] = [];

  for (const row of rows) {
    if (!row.isRecurring || isItProjectImplementationPillar(row.title)) {
      continue;
    }

    const freq = row.frequency as KpiFrequencyCode;
    const currentCycleStart = getPeriodStartInclusive(
      freq,
      row.recurrenceWeekday,
      row.recurrenceMonthDay,
      now,
      timeZone,
    );
    const anchor =
      row.periodCycleStartAt ??
      getPeriodStartInclusive(
        freq,
        row.recurrenceWeekday,
        row.recurrenceMonthDay,
        row.createdAt,
        timeZone,
      );

    const patch: Prisma.KpiMaintenanceUpdateInput = {};
    const expectedKey = computePeriodKey(freq, row.recurrenceWeekday, row.recurrenceMonthDay, now, timeZone);

    if (!row.periodCycleStartAt) {
      patch.periodCycleStartAt = currentCycleStart;
    }

    if (row.periodKey == null || isLegacyPeriodKey(row.periodKey) || row.periodKey !== expectedKey) {
      patch.periodKey = expectedKey;
      patch.rolledOverIncomplete = false;
    }

    const complete = checklistFullyComplete(row.subKpis, kpiMainTaskLabel(row));
    const staleCycle = currentCycleStart.getTime() > anchor.getTime();
    if (staleCycle) {
      const snapshotPeriodKey =
        row.periodKey && !isLegacyPeriodKey(row.periodKey)
          ? row.periodKey
          : computePeriodKey(freq, row.recurrenceWeekday, row.recurrenceMonthDay, anchor, timeZone);
      await upsertKpiPeriodSnapshot(
        {
          id: row.id,
          title: row.title,
          frequency: row.frequency,
          subKpis: row.subKpis,
          periodKey: row.periodKey,
          recurrenceWeekday: row.recurrenceWeekday,
          recurrenceMonthDay: row.recurrenceMonthDay,
          periodCycleStartAt: row.periodCycleStartAt,
          isRecurring: row.isRecurring,
          assignedAgent: row.assignedAgent
            ? { id: row.assignedAgent.id, name: row.assignedAgent.name }
            : null,
        },
        timeZone,
        anchor,
        snapshotPeriodKey,
      );
      patch.subKpis = resetAllSubKpiDone(row.subKpis);
      patch.periodCycleStartAt = currentCycleStart;
      patch.periodKey = expectedKey;
      patch.lastFullCompletionAt = null;
      patch.rolledOverIncomplete = !complete;
    }

    const lastFull = row.lastFullCompletionAt;
    if (!staleCycle && complete && lastFull) {
      const eligible = nextRolloverEligibleAtUtc(lastFull, timeZone);
      if (eligible && now.getTime() >= eligible.getTime()) {
        await upsertKpiPeriodSnapshot(
          {
            id: row.id,
            title: row.title,
            frequency: row.frequency,
            subKpis: row.subKpis,
            periodKey: row.periodKey,
            recurrenceWeekday: row.recurrenceWeekday,
            recurrenceMonthDay: row.recurrenceMonthDay,
            periodCycleStartAt: row.periodCycleStartAt,
            isRecurring: row.isRecurring,
            assignedAgent: row.assignedAgent
              ? { id: row.assignedAgent.id, name: row.assignedAgent.name }
              : null,
          },
          timeZone,
          now,
        );
        const nextCycleStart = getPeriodEndExclusiveFromCycleStart(
          anchor,
          freq,
          row.recurrenceWeekday,
          row.recurrenceMonthDay,
          timeZone,
        );
        patch.subKpis = resetAllSubKpiDone(row.subKpis);
        patch.periodCycleStartAt = nextCycleStart;
        patch.lastFullCompletionAt = null;
        patch.rolledOverIncomplete = false;
        patch.periodKey = computePeriodKey(freq, row.recurrenceWeekday, row.recurrenceMonthDay, nextCycleStart, timeZone);
      }
    }

    if (Object.keys(patch).length > 0) {
      updates.push(
        prisma.kpiMaintenance.update({
          where: { id: row.id },
          data: patch,
        }),
      );
    }
  }

  if (updates.length > 0) {
    await Promise.all(updates);
    rows = await prisma.kpiMaintenance.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        assignedAgent: { select: { id: true, name: true, team: { select: { id: true, name: true } } } },
      },
    });
    if (!perms.canAssignWork) {
      const operatorId = perms.operator?.id ?? null;
      rows = rows.filter((row) => row.assignedAgentId === operatorId);
    }
  }

  // Archive completed non-recurring tasks when the next calendar day has passed
  const archivedRowIds = new Set<string>();
  for (const row of rows) {
    if (row.isRecurring !== false || isItProjectImplementationPillar(row.title)) continue;
    if (!row.assignedAgentId) continue;
    if (!row.lastFullCompletionAt) continue;
    const complete = checklistFullyComplete(row.subKpis, kpiMainTaskLabel(row));
    if (!complete) continue;
    const eligible = nextRolloverEligibleAtUtc(row.lastFullCompletionAt, timeZone);
    if (!eligible || now.getTime() < eligible.getTime()) continue;
    // Take a period snapshot to archive the completed state
    await upsertKpiPeriodSnapshot(
      {
        id: row.id,
        title: row.title,
        frequency: row.frequency,
        subKpis: row.subKpis,
        periodKey: row.periodKey,
        recurrenceWeekday: row.recurrenceWeekday,
        recurrenceMonthDay: row.recurrenceMonthDay,
        periodCycleStartAt: row.periodCycleStartAt,
        isRecurring: false,
        assignedAgent: row.assignedAgent
          ? { id: row.assignedAgent.id, name: row.assignedAgent.name }
          : null,
      },
      timeZone,
      row.lastFullCompletionAt,
    );
    archivedRowIds.add(row.id);
  }
  if (archivedRowIds.size > 0) {
    rows = rows.filter((r) => !archivedRowIds.has(r.id));
  }

  return NextResponse.json({
    rows,
    canAssignWork: perms.canAssignWork,
    canUnassignWork: session.user.role === "SuperAdmin",
    canCompleteUnassignedWork: session.user.role === "SuperAdmin",
    operatorAgentId: perms.operator?.id ?? null,
    operatorAgentName: perms.operator?.name ?? null,
    rosterCompanies: perms.canAssignWork
      ? await prisma.team.findMany({
          where: rosterTeamNameFilter(),
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : [],
  });
}

export async function POST(req: Request) {
  const { session, unauthorized } = await requireRole(["Admin", "Personnel"]);
  if (unauthorized || !session) return unauthorized;
  const perms = await resolveOpsPermissions(session);
  if (!perms.canAssignWork) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    title?: string;
    frequency?: string;
    subKpisSegmented?: boolean;
    subKpis?: Array<{
      title?: string;
      startDate?: string;
      endDate?: string;
      dueDate?: string;
      screenshotsEnabled?: boolean;
    }>;
    segments?: Array<{
      label?: string;
      items?: Array<{
        title?: string;
        startDate?: string;
        endDate?: string;
        dueDate?: string;
        screenshotsEnabled?: boolean;
      }>;
    }>;
    assignedAgentId?: string;
    recurrenceWeekday?: number;
    recurrenceMonthDay?: number;
    timeZone?: string;
    isRecurring?: boolean;
    nonRecurringStartAt?: string;
    nonRecurringEndAt?: string;
    itProjectName?: string;
    itProjectPhase?: string;
    itProjectPhases?: Array<{ name?: string; items?: Array<{ title?: string; dueDate?: string }> }>;
    itProjectState?: { activePhaseId?: string; phases?: ItProjectData["phases"] };
    scopedCompanyTeamId?: string | null;
    completionRequirements?: SubKpiCompletionRequirements;
    numericalTarget?: number;
    mainTask?: string;
    pillarDueDate?: string;
    taskDailyPenaltyAmount?: number | null;
  };
  const title = body.title?.trim() ?? "";
  const mainTaskRaw = body.mainTask?.trim() ?? "";
  const isItProject = isItProjectImplementationPillar(title);
  const frequency = (body.frequency?.toUpperCase() ?? "DAILY") as KpiFrequency;
  if (!title || !allowedFrequencies.has(frequency)) {
    return NextResponse.json({ error: "title and frequency are required." }, { status: 400 });
  }
  if (!isItProject && !mainTaskRaw) {
    return NextResponse.json({ error: "mainTask is required." }, { status: 400 });
  }
  if (isItProject && body.subKpisSegmented === true) {
    return NextResponse.json(
      { error: "IT Project Implementation does not use segmented checklists." },
      { status: 400 },
    );
  }
  const isRecurring = isItProject ? false : body.isRecurring !== false;
  let nonRecurringStartAt: Date | null = null;
  let nonRecurringEndAt: Date | null = null;

  let recurrenceWeekday: number | null = null;
  let recurrenceMonthDay: number | null = null;
  if (!isItProject && isRecurring && frequency === "WEEKLY") {
    const wd = body.recurrenceWeekday;
    if (typeof wd !== "number" || wd < 0 || wd > 6 || !Number.isInteger(wd)) {
      return NextResponse.json(
        { error: "recurrenceWeekday is required for WEEKLY (0=Sunday … 6=Saturday)." },
        { status: 400 },
      );
    }
    recurrenceWeekday = wd;
  }
  if (!isItProject && isRecurring && (frequency === "MONTHLY" || frequency === "QUARTERLY")) {
    const dom = body.recurrenceMonthDay;
    if (typeof dom !== "number" || dom < 1 || dom > 31 || !Number.isInteger(dom)) {
      return NextResponse.json(
        { error: "recurrenceMonthDay is required for MONTHLY/QUARTERLY (1–31)." },
        { status: 400 },
      );
    }
    recurrenceMonthDay = dom;
  }

  const assigneeId = body.assignedAgentId?.trim() ?? "";
  const assignee = assigneeId
    ? await prisma.agent.findUnique({
        where: { id: assigneeId },
        include: { team: true },
      })
    : null;
  if (assigneeId && !assignee) {
    return NextResponse.json({ error: "Assignee not found." }, { status: 404 });
  }
  if (assigneeId && !(await isAgentOnDutyFromMergedDb(assigneeId))) {
    return NextResponse.json(
      { error: "Assignee is Offline (no merged DB clock-in today). Only On Duty personnel can be assigned." },
      { status: 400 },
    );
  }

  const scopedCompanyTeamIdRaw = body.scopedCompanyTeamId?.trim() ?? "";
  let scopedCompanyTeamId: string | null = null;
  if (scopedCompanyTeamIdRaw) {
    const companyTeam = await prisma.team.findFirst({
      where: { id: scopedCompanyTeamIdRaw, ...rosterTeamNameFilter() },
      select: { id: true },
    });
    if (!companyTeam) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }
    scopedCompanyTeamId = companyTeam.id;
  }

  const taskCompletionRequirements =
    normalizeCompletionRequirements(body.completionRequirements) ?? {
      checkbox: true,
      screenshots: false,
      screenshotUpload: false,
      numerical: false,
    };
  const subTaskCompletionRequirements = subKpiStoredCompletionRequirements(taskCompletionRequirements);

  let numericalTarget: number | null = null;
  const willBePillarOnly =
    !isItProject &&
    body.subKpisSegmented !== true &&
    (!Array.isArray(body.subKpis) ||
      body.subKpis.map((s) => (s.title ?? "").trim()).filter(Boolean).length === 0);
  if (!isItProject && taskCompletionRequirements.numerical) {
    const rawTarget = body.numericalTarget;
    if (willBePillarOnly && isRecurring && rawTarget == null) {
      numericalTarget = null;
    } else if (typeof rawTarget !== "number" || !Number.isFinite(rawTarget)) {
      return NextResponse.json(
        { error: "numericalTarget is required when numerical record completion is enabled." },
        { status: 400 },
      );
    } else {
      numericalTarget = rawTarget;
    }
  }

  let built: { ok: true; norm: NormalizedSubKpis } | { ok: false; error: string };

  let itProjectPersist: Prisma.InputJsonValue | null = null;
  let itProjectPhaseLabel: string | null = null;

  if (isItProject) {
    const phaseDrafts = Array.isArray(body.itProjectPhases)
      ? body.itProjectPhases.map((p) => ({
          name: (p.name ?? "").trim(),
          items: Array.isArray(p.items)
            ? p.items.map((it) => ({
                title: (it.title ?? "").trim(),
                dueDate: (it.dueDate ?? "").trim(),
              }))
            : [],
        }))
      : [];
    const projectBuilt = buildItProjectFromPhaseDrafts(phaseDrafts);
    if (!projectBuilt.ok) {
      return NextResponse.json({ error: projectBuilt.error }, { status: 400 });
    }
    itProjectPersist = wrapItProjectSubKpis(projectBuilt.data);
    itProjectPhaseLabel = itProjectActivePhase(projectBuilt.data).name;
    built = { ok: true, norm: { segmented: false, flat: [] } };
  } else {
    const subTaskScreenshots = subTaskCompletionRequirements.screenshots;
    const mapDraftItem = (s: {
      title?: string;
      startDate?: string;
      dueDate?: string;
      endDate?: string;
      actualDate?: string;
      screenshotsEnabled?: boolean;
    }) => ({
      title: (s.title ?? "").trim(),
      startDate: "",
      dueDate: isRecurring ? "" : (s.dueDate ?? s.endDate ?? "").trim(),
      actualDate: isRecurring ? "" : (s.actualDate ?? "").trim(),
      completionRequirements: subTaskCompletionRequirements,
      screenshotsEnabled: subTaskScreenshots,
      ...(numericalTarget != null ? { numericalTarget } : {}),
    });
    const flatItems =
      Array.isArray(body.subKpis) && !body.subKpisSegmented
        ? body.subKpis.map(mapDraftItem).filter((s) => s.title.length > 0)
        : [];

    const segmentsInput =
      body.subKpisSegmented === true && Array.isArray(body.segments)
        ? body.segments.map((seg) => ({
            label: (seg.label ?? "").trim(),
            items: Array.isArray(seg.items)
              ? seg.items.map(mapDraftItem).filter((i) => i.title.length > 0)
              : [],
          }))
        : undefined;

    built = validateSegmentStructureForPersist(
      body.subKpisSegmented === true,
      flatItems,
      segmentsInput,
      {
        allowPillarOnly:
          flatItems.length === 0 &&
          body.subKpisSegmented !== true &&
          (taskCompletionRequirements.checkbox ||
            taskCompletionRequirements.screenshots ||
            taskCompletionRequirements.screenshotUpload ||
            taskCompletionRequirements.numerical),
      },
    );
  }

  if (!built.ok) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  let subKpisPersist = (itProjectPersist ?? wrapForPersist(built.norm)) as Prisma.InputJsonValue;
  if (!isItProject && built.norm.segmented === false && built.norm.flat.length === 0) {
    subKpisPersist = applyPillarOnlyTaskCreate(subKpisPersist, taskCompletionRequirements, {
      numericalTarget,
      dueDate: !isRecurring ? (body.pillarDueDate?.trim() ?? "") : null,
    });
  }
  if (!isItProject && body.taskDailyPenaltyAmount !== undefined) {
    if (isRecurring) {
      return NextResponse.json(
        { error: "Daily delay penalty applies only to one-off (non-recurring) tasks." },
        { status: 400 },
      );
    }
    const rawPenalty = body.taskDailyPenaltyAmount;
    subKpisPersist = setTaskDailyPenaltyAmount(
      subKpisPersist,
      typeof rawPenalty === "number" && Number.isFinite(rawPenalty) ? Math.max(0, rawPenalty) : null,
    );
  }

  const timeZone = normalizeTimeZone(body.timeZone);
  const periodKey = isRecurring
    ? computePeriodKey(
        frequency as KpiFrequencyCode,
        recurrenceWeekday,
        recurrenceMonthDay,
        new Date(),
        timeZone,
      )
    : null;

  const periodCycleStartAt = isRecurring
    ? getPeriodStartInclusive(frequency as KpiFrequencyCode, recurrenceWeekday, recurrenceMonthDay, new Date(), timeZone)
    : null;

  const itProjectName =
    isItProjectImplementationPillar(title) && typeof body.itProjectName === "string"
      ? body.itProjectName.trim() || null
      : null;
  const itProjectPhase = isItProject
    ? itProjectPhaseLabel
    : isItProjectImplementationPillar(title) && typeof body.itProjectPhase === "string"
      ? body.itProjectPhase.trim() || null
      : null;

  // Check for existing task group by title — deduplicate by name
  const existingTaskGroup = title
    ? await prisma.kpiMaintenance.findFirst({
        where: { title },
        select: { id: true, title: true, mainTask: true, subKpis: true, isRecurring: true, frequency: true, lastFullCompletionAt: true },
      })
    : null;

  if (existingTaskGroup && !isItProject) {
    // Merge new subKpi items into the existing group's subKpis
    const existingNorm = normalizeSubKpis(existingTaskGroup.subKpis);
    const newNorm = normalizeSubKpis(subKpisPersist);
    const mergedItems = [
      ...collectAllSubKpiItems(existingNorm),
      ...collectAllSubKpiItems(newNorm),
    ];
    const taskCount = mergedItems.length;
    const rawWithCount = setTaskCount(existingTaskGroup.subKpis, taskCount);
    const mergedSubKpis = wrapForPersistWithExistingMeta(
      { segmented: false, flat: mergedItems },
      rawWithCount,
    );

    // Reset lastFullCompletionAt so the group goes back to CURRENT when new tasks are added
    const updateData: Prisma.KpiMaintenanceUpdateInput = { subKpis: mergedSubKpis };
    if (existingTaskGroup.lastFullCompletionAt) {
      updateData.lastFullCompletionAt = null;
    }

    const updated = await prisma.kpiMaintenance.update({
      where: { id: existingTaskGroup.id },
      data: updateData,
    });
    return NextResponse.json(
      {
        message: `Task added to group '${updated.title}' (now ${taskCount} task${taskCount !== 1 ? "s" : ""} total).`,
        taskGroup: updated,
      },
      { status: 200 },
    );
  }

  if (existingTaskGroup && isItProject) {
    return NextResponse.json(
      { error: `Task group '${title}' already exists. IT Project tasks cannot be merged into an existing group.` },
      { status: 409 },
    );
  }

  let created;
  try {
    // Set initial taskCount on the subKpis envelope
    const newNorm = normalizeSubKpis(subKpisPersist);
    const newItemCount = collectAllSubKpiItems(newNorm).length;
    const initialJson = setTaskCount(subKpisPersist, newItemCount);

    created = await prisma.kpiMaintenance.create({
      data: {
        title,
        mainTask: isItProject ? null : mainTaskRaw,
        isRecurring,
        frequency,
        subKpis: initialJson,
        assignedAgentId: assignee?.id ?? null,
        scopedCompanyTeamId,
        recurrenceWeekday,
        recurrenceMonthDay,
        nonRecurringStartAt,
        nonRecurringEndAt,
        periodCycleStartAt,
        periodKey,
        assignedRole: assignee
          ? (await portalCompanyAdminPrivilegesForEmail(assignee.email))
            ? "Admin Role"
            : "Personnel"
          : null,
        createdBy: session.user.email ?? session.user.name ?? "unknown",
        createdByRole: session.user.role,
        itProjectName,
        itProjectPhase,
      },
    });
  } catch (e) {
    console.error("[kpi-maintenance POST]", e);
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") {
        return NextResponse.json(
          { error: `Task group '${title}' already exists. Task inserted into the group.` },
          { status: 409 },
        );
      }
    }
    const msg = e instanceof Error ? e.message : "Could not create KPI.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  const createdDate = new Date(created.createdAt).toISOString().slice(0, 10);
  return NextResponse.json(
    {
      message: `New task group '${created.title}' created on ${createdDate}.`,
      taskGroup: created,
    },
    { status: 201 },
  );
}

export async function PATCH(req: Request) {
  const { session, unauthorized } = await requireRole(["Admin", "Personnel"]);
  if (unauthorized || !session) return unauthorized;
  const perms = await resolveOpsPermissions(session);
  const patchTz = normalizeTimeZone(new URL(req.url).searchParams.get("tz"));
  let screenshotFiles: File[] = [];
  let body: {
    id?: string;
    subKpiId?: string;
    done?: boolean;
    markAllDone?: boolean;
    structuredSubKpis?: unknown;
    assignedAgentId?: string;
    itProjectName?: string | null;
    itProjectPhase?: string | null;
    taskPriority?: string | null;
    taskDailyPenaltyAmount?: number | null;
    itProjectState?: { activePhaseId?: string; phases?: ItProjectData["phases"] };
    subKpiSchedule?: {
      subKpiId?: string;
      dueDate?: string | null;
      actualDate?: string | null;
    };
    subKpiWorkMeta?: {
      subKpiId?: string;
      startDate?: string | null;
      dueDate?: string | null;
      actualDate?: string | null;
      projectPriority?: string | null;
      numericalValue?: number | null;
      numericalTarget?: number | null;
    };
    subKpiProjectMeta?: {
      subKpiId?: string;
      projectPriority?: string;
      projectStatus?: string;
    };
    subKpiAssignee?: {
      subKpiId?: string;
      assignedAgentId?: string | null;
    };
    subKpiScreenshot?: {
      subKpiId?: string;
      slot?: TaskScreenshotSlot;
    };
    subKpiScreenshotDelete?: {
      subKpiId?: string;
      slot?: TaskScreenshotSlot;
      storedFileName?: string;
    };
    pillarScreenshot?: {
      slot?: TaskScreenshotSlot;
    };
    pillarScreenshotDelete?: {
      slot?: TaskScreenshotSlot;
      storedFileName?: string;
    };
    addSubKpi?: {
      title?: string;
      segmentId?: string | null;
      startDate?: string | null;
      dueDate?: string | null;
    };
    updateSubKpi?: {
      subKpiId?: string;
      title?: string;
      startDate?: string | null;
      dueDate?: string | null;
      completionMode?: SubKpiCompletionMode;
      numericalTarget?: number | null;
      dailyPenaltyAmount?: number | null;
    };
    removeSubKpi?: {
      subKpiId?: string;
    };
    deleteTask?: boolean;
    taskSchedule?: {
      isRecurring?: boolean;
      frequency?: string;
      recurrenceWeekday?: number;
      recurrenceMonthDay?: number;
      nonRecurringStartAt?: string;
      nonRecurringEndAt?: string;
    };
  };
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const fd = await req.formData();
    screenshotFiles = fd
      .getAll("screenshot")
      .filter((file): file is File => file instanceof File && file.size > 0);
    body = {
      id: String(fd.get("id") ?? ""),
      ...(String(fd.get("pillarScreenshot") ?? "") === "1"
        ? { pillarScreenshot: { slot: String(fd.get("slot") ?? "") as TaskScreenshotSlot } }
        : {
            subKpiScreenshot: {
              subKpiId: String(fd.get("subKpiId") ?? ""),
              slot: String(fd.get("slot") ?? "") as TaskScreenshotSlot,
            },
          }),
    };
  } else {
    body = (await req.json()) as typeof body;
  }
  const id = body.id?.trim() ?? "";

  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const row = await prisma.kpiMaintenance.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      assignedAgentId: true,
      assignedAgent: { select: { id: true, name: true, email: true } },
      subKpis: true,
      isRecurring: true,
      frequency: true,
      recurrenceWeekday: true,
      recurrenceMonthDay: true,
      periodCycleStartAt: true,
      periodKey: true,
      lastFullCompletionAt: true,
      itProjectName: true,
      itProjectPhase: true,
    },
  });
  if (!row) return NextResponse.json({ error: "KPI not found." }, { status: 404 });
  const kpiRow = row;

  if (body.deleteTask === true) {
    if (!perms.isAdminRole) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await prisma.kpiMaintenance.delete({ where: { id } });
    await deleteTaskScreenshotsDir(id);
    return NextResponse.json({ ok: true, id });
  }

  const snapshotTz = timeZoneFromPeriodKey(kpiRow.periodKey) || patchTz;

  async function captureCurrentPeriodSnapshot(subKpis: unknown) {
    if (!kpiRow.isRecurring) return;
    await upsertKpiPeriodSnapshot(
      {
        id: kpiRow.id,
        title: kpiRow.title,
        frequency: kpiRow.frequency,
        subKpis,
        periodKey: kpiRow.periodKey,
        recurrenceWeekday: kpiRow.recurrenceWeekday,
        recurrenceMonthDay: kpiRow.recurrenceMonthDay,
        periodCycleStartAt: kpiRow.periodCycleStartAt,
        isRecurring: kpiRow.isRecurring,
        assignedAgent: kpiRow.assignedAgent
          ? { id: kpiRow.assignedAgent.id, name: kpiRow.assignedAgent.name }
          : null,
      },
      snapshotTz,
    );
  }
  const isAssignee = !!perms.operator && perms.operator.id === kpiRow.assignedAgentId;
  const subKpiItems = isItProjectImplementationPillar(kpiRow.title)
    ? itProjectAllItems(parseItProjectSubKpis(kpiRow.subKpis, kpiRow.itProjectPhase))
    : collectChecklistProgressItems(kpiRow.subKpis, kpiMainTaskLabel(kpiRow));
  const canEditSubKpi = (subKpiId: string) => {
    if (isAssignee) return true;
    const item = subKpiItems.find((it) => it.id === subKpiId);
    if (!item) return false;
    if (
      subKpiAssignedToOperator(item, {
        id: perms.operator?.id,
        name: perms.operator?.name ?? session.user.name,
      })
    ) {
      return true;
    }
    const subAssigneeId = subKpiAssignedAgentId(item);
    return session.user.role === "SuperAdmin" && !kpiRow.assignedAgentId && !subAssigneeId;
  };
  const canCompleteSubKpi = (subKpiId: string) => {
    const item = subKpiItems.find((it) => it.id === subKpiId);
    if (!item) return false;
    const req = resolveSubKpiCompletionRequirements(item);
    if (!req.checkbox) return false;
    if (!canEditSubKpi(subKpiId)) {
      return Boolean(perms.canAssignWork && req.screenshots && hasBeforeAndAfterScreenshots(item));
    }
    if (req.screenshots && !hasBeforeAndAfterScreenshots(item)) return false;
    if (req.screenshotUpload && !hasScreenshotUpload(item)) return false;
    if (req.numerical && !hasNumericalRecord(item)) return false;
    if (req.numerical) {
      const pct = numericalRecordProgressPercent(item.numericalValue, item.numericalTarget);
      if (pct != null && pct < 100) return false;
    }
    return true;
  };

  if (body.itProjectName !== undefined || body.itProjectPhase !== undefined) {
    if (!isAssignee) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!isItProjectImplementationPillar(kpiRow.title)) {
      return NextResponse.json({ error: "Project fields apply only to IT Project Implementation tasks." }, { status: 400 });
    }
    const data: { itProjectName?: string | null; itProjectPhase?: string | null } = {};
    if (body.itProjectName !== undefined) {
      data.itProjectName =
        typeof body.itProjectName === "string" ? body.itProjectName.trim() || null : null;
    }
    if (body.itProjectPhase !== undefined) {
      data.itProjectPhase =
        typeof body.itProjectPhase === "string" ? body.itProjectPhase.trim() || null : null;
    }
    const updated = await prisma.kpiMaintenance.update({ where: { id }, data });
    return NextResponse.json(updated);
  }

  if (body.itProjectState != null && typeof body.itProjectState === "object") {
    if (!isAssignee) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!isItProjectImplementationPillar(kpiRow.title)) {
      return NextResponse.json({ error: "Phase updates apply only to IT Project Implementation." }, { status: 400 });
    }
    let wrapped: Prisma.InputJsonValue;
    if (Array.isArray(body.itProjectState.phases) && body.itProjectState.phases.length > 0) {
      const parsed = parseItProjectSubKpis(kpiRow.subKpis, kpiRow.itProjectPhase);
      const activePhaseId =
        typeof body.itProjectState.activePhaseId === "string" && body.itProjectState.activePhaseId.trim()
          ? body.itProjectState.activePhaseId.trim()
          : parsed.activePhaseId;
      wrapped = updateItProjectPhases(kpiRow.subKpis, {
        activePhaseId,
        phases: body.itProjectState.phases as ItProjectData["phases"],
      });
    } else if (typeof body.itProjectState.activePhaseId === "string" && body.itProjectState.activePhaseId.trim()) {
      wrapped = setItProjectActivePhase(kpiRow.subKpis, body.itProjectState.activePhaseId.trim());
    } else {
      return NextResponse.json({ error: "Provide activePhaseId or phases." }, { status: 400 });
    }
    const active = itProjectActivePhase(parseItProjectSubKpis(wrapped, kpiRow.itProjectPhase));
    const updated = await prisma.kpiMaintenance.update({
      where: { id },
      data: { subKpis: wrapped, itProjectPhase: active.name },
    });
    return NextResponse.json(updated);
  }

  if (body.taskPriority !== undefined) {
    if (isItProjectImplementationPillar(kpiRow.title)) {
      return NextResponse.json({ error: "Task priority applies only to regular tasks." }, { status: 400 });
    }
    if (!perms.canAssignWork && !isAssignee) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const updatedJson = setTaskPriority(kpiRow.subKpis, body.taskPriority);
    const updated = await prisma.kpiMaintenance.update({
      where: { id },
      data: { subKpis: updatedJson },
    });
    return NextResponse.json(updated);
  }

  if (body.taskDailyPenaltyAmount !== undefined) {
    if (isItProjectImplementationPillar(kpiRow.title)) {
      return NextResponse.json(
        { error: "Task daily penalty applies only to regular checklist tasks." },
        { status: 400 },
      );
    }
    if (kpiRow.isRecurring) {
      return NextResponse.json(
        { error: "Daily delay penalty applies only to one-off (non-recurring) tasks." },
        { status: 400 },
      );
    }
    if (!perms.isAdminRole) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const rawPenalty = body.taskDailyPenaltyAmount;
    const updatedJson = setTaskDailyPenaltyAmount(
      kpiRow.subKpis,
      typeof rawPenalty === "number" && Number.isFinite(rawPenalty) ? Math.max(0, rawPenalty) : null,
    );
    const updated = await prisma.kpiMaintenance.update({
      where: { id },
      data: { subKpis: updatedJson },
    });
    return NextResponse.json(updated);
  }

  if (body.subKpiWorkMeta != null && typeof body.subKpiWorkMeta === "object") {
    if (isItProjectImplementationPillar(kpiRow.title)) {
      return NextResponse.json(
        { error: "Task work details are not available for IT Project Implementation tasks." },
        { status: 400 },
      );
    }
    const subKpiIdMeta = String(body.subKpiWorkMeta.subKpiId ?? "").trim();
    if (!subKpiIdMeta) {
      return NextResponse.json({ error: "subKpiWorkMeta.subKpiId is required." }, { status: 400 });
    }
    if (!perms.canAssignWork && !canEditSubKpi(subKpiIdMeta)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const target = subKpiItems.find((it) => it.id === subKpiIdMeta);
    if (!target) {
      return NextResponse.json({ error: "Sub-task not found." }, { status: 404 });
    }
    const meta = body.subKpiWorkMeta;
    const recurring = kpiRow.isRecurring !== false;
    if (meta.numericalTarget !== undefined) {
      const req = resolveSubKpiCompletionRequirements(target);
      if (!subKpiRequiresNumerical(req)) {
        return NextResponse.json({ error: "This sub-task does not use numerical records." }, { status: 400 });
      }
      if (!recurring) {
        return NextResponse.json(
          { error: "Assignees set cycle targets only on recurring tasks. Use task management to edit one-off targets." },
          { status: 400 },
        );
      }
      const assigneeMaySetTarget =
        canEditSubKpi(subKpiIdMeta) &&
        (target.numericalTarget == null || target.numericalValue == null);
      if (!perms.isAdminRole && !assigneeMaySetTarget) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (
        meta.numericalTarget != null &&
        (!Number.isFinite(meta.numericalTarget) || meta.numericalTarget <= 0)
      ) {
        return NextResponse.json({ error: "numericalTarget must be a positive number." }, { status: 400 });
      }
    }
    if (
      meta.numericalValue !== undefined &&
      meta.numericalValue != null &&
      target.numericalTarget == null
    ) {
      return NextResponse.json(
        { error: "Set a target number for this cycle before entering the actual record." },
        { status: 400 },
      );
    }
    if (meta.startDate !== undefined) {
      return NextResponse.json(
        { error: "Sub-task schedule dates are not used for maintenance tasks." },
        { status: 400 },
      );
    }
    let updatedJson = setSubKpiItemWorkMeta(kpiRow.subKpis, subKpiIdMeta, {
      dueDate: recurring ? undefined : meta.dueDate,
      actualDate: recurring ? undefined : meta.actualDate,
      projectPriority: meta.projectPriority,
      numericalValue: meta.numericalValue,
      numericalTarget: meta.numericalTarget,
    });
    updatedJson = syncSubKpiDoneFromRequirements(updatedJson, subKpiIdMeta);
    const prevComplete = checklistFullyComplete(kpiRow.subKpis, kpiMainTaskLabel(kpiRow));
    const nextComplete = checklistFullyComplete(updatedJson, kpiMainTaskLabel(kpiRow));
    let lastFullCompletionAt: Date | null | undefined;
    if (!prevComplete && nextComplete) lastFullCompletionAt = new Date();
    else if (prevComplete && !nextComplete) lastFullCompletionAt = null;
    if (nextComplete) await captureCurrentPeriodSnapshot(updatedJson);

    const updated = await prisma.kpiMaintenance.update({
      where: { id },
      data: {
        subKpis: updatedJson,
        ...(nextComplete ? { rolledOverIncomplete: false } : {}),
        ...(lastFullCompletionAt !== undefined ? { lastFullCompletionAt } : {}),
      },
    });
    return NextResponse.json(updated);
  }

  if (body.subKpiSchedule != null && typeof body.subKpiSchedule === "object") {
    if (!isItProjectImplementationPillar(kpiRow.title)) {
      return NextResponse.json({ error: "Per sub-task scheduling applies only to IT Project Implementation." }, { status: 400 });
    }
    const subKpiIdSched = String(body.subKpiSchedule.subKpiId ?? "").trim();
    if (!subKpiIdSched) {
      return NextResponse.json({ error: "subKpiSchedule.subKpiId is required." }, { status: 400 });
    }
    if (!canEditSubKpi(subKpiIdSched)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const sched = body.subKpiSchedule;
    const updatedJson = setItProjectSubKpiSchedule(kpiRow.subKpis, subKpiIdSched, {
      dueDate: sched.dueDate,
      actualDate: sched.actualDate,
    });
    const prevComplete = checklistFullyComplete(kpiRow.subKpis, kpiMainTaskLabel(kpiRow));
    const nextComplete = checklistFullyComplete(updatedJson, kpiMainTaskLabel(kpiRow));
    let lastFullCompletionAt: Date | null | undefined;
    if (!prevComplete && nextComplete) lastFullCompletionAt = new Date();
    else if (prevComplete && !nextComplete) lastFullCompletionAt = null;

    const updated = await prisma.kpiMaintenance.update({
      where: { id },
      data: {
        subKpis: updatedJson,
        ...(nextComplete ? { rolledOverIncomplete: false } : {}),
        ...(lastFullCompletionAt !== undefined ? { lastFullCompletionAt } : {}),
      },
    });
    return NextResponse.json(updated);
  }

  if (body.subKpiProjectMeta != null && typeof body.subKpiProjectMeta === "object") {
    if (!isItProjectImplementationPillar(kpiRow.title)) {
      return NextResponse.json({ error: "Project metadata applies only to IT Project Implementation." }, { status: 400 });
    }
    const subKpiIdMeta = String(body.subKpiProjectMeta.subKpiId ?? "").trim();
    if (!subKpiIdMeta) {
      return NextResponse.json({ error: "subKpiProjectMeta.subKpiId is required." }, { status: 400 });
    }
    if (!canEditSubKpi(subKpiIdMeta)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const result = setItProjectSubKpiProjectMeta(kpiRow.subKpis, subKpiIdMeta, {
      projectPriority: body.subKpiProjectMeta.projectPriority,
      projectStatus: body.subKpiProjectMeta.projectStatus,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    const prevComplete = checklistFullyComplete(kpiRow.subKpis, kpiMainTaskLabel(kpiRow));
    const nextComplete = checklistFullyComplete(result.json, kpiMainTaskLabel(kpiRow));
    let lastFullCompletionAt: Date | null | undefined;
    if (!prevComplete && nextComplete) lastFullCompletionAt = new Date();
    else if (prevComplete && !nextComplete) lastFullCompletionAt = null;

    const updated = await prisma.kpiMaintenance.update({
      where: { id },
      data: {
        subKpis: result.json,
        ...(nextComplete ? { rolledOverIncomplete: false } : {}),
        ...(lastFullCompletionAt !== undefined ? { lastFullCompletionAt } : {}),
      },
    });
    return NextResponse.json(updated);
  }

  if (body.subKpiAssignee != null && typeof body.subKpiAssignee === "object") {
    if (!perms.canAssignWork) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const subKpiIdAssign = String(body.subKpiAssignee.subKpiId ?? "").trim();
    if (!subKpiIdAssign) {
      return NextResponse.json({ error: "subKpiAssignee.subKpiId is required." }, { status: 400 });
    }
    const target = subKpiItems.find((it) => it.id === subKpiIdAssign);
    if (!target) {
      return NextResponse.json({ error: "Sub-task not found." }, { status: 404 });
    }
    const assignedAgentIdRaw = body.subKpiAssignee.assignedAgentId;
    const assignedAgentId =
      typeof assignedAgentIdRaw === "string" ? assignedAgentIdRaw.trim() : "";
    const assignee = assignedAgentId
      ? await prisma.agent.findUnique({
          where: { id: assignedAgentId },
          select: { id: true, name: true, email: true },
        })
      : null;
    if (assignedAgentId && !assignee) {
      return NextResponse.json({ error: "Assignee not found." }, { status: 404 });
    }
    if (assignedAgentId && !(await isAgentOnDutyFromMergedDb(assignedAgentId))) {
      return NextResponse.json(
        { error: "Assignee is Offline (no merged DB clock-in today). Only On Duty personnel can be assigned." },
        { status: 400 },
      );
    }
    if (assignedAgentId && assignedAgentId === kpiRow.assignedAgentId) {
      return NextResponse.json(
        { error: "Main assignee cannot also be assigned as a sub-task assignee." },
        { status: 400 },
      );
    }
    if (assignee) {
      if (!kpiRow.assignedAgentId) {
        return NextResponse.json(
          { error: "Assign the main task before assigning sub-tasks to personnel." },
          { status: 400 },
        );
      }
      const mainAssigneeCompanyId = await resolveAgentDesignatedCompanyId(kpiRow.assignedAgentId);
      const subAssigneeCompanyId = await resolveAgentDesignatedCompanyId(assignee.id);
      if (!mainAssigneeCompanyId || !subAssigneeCompanyId) {
        return NextResponse.json(
          { error: "Both main task and sub-task assignees must have a designated company." },
          { status: 400 },
        );
      }
      if (subAssigneeCompanyId !== mainAssigneeCompanyId) {
        return NextResponse.json(
          { error: "Sub-task assignee must belong to the same company as the main task assignee." },
          { status: 400 },
        );
      }
    }
    const updatedJson = isItProjectImplementationPillar(kpiRow.title)
      ? setItProjectSubKpiAssignee(kpiRow.subKpis, subKpiIdAssign, assignee)
      : setSubKpiItemAssignee(kpiRow.subKpis, subKpiIdAssign, assignee);
    const updated = await prisma.kpiMaintenance.update({
      where: { id },
      data: { subKpis: updatedJson },
    });
    return NextResponse.json(updated);
  }

  if (body.pillarScreenshot != null && typeof body.pillarScreenshot === "object") {
    const slot = body.pillarScreenshot.slot;
    if (slot !== "before" && slot !== "after" && slot !== "general") {
      return NextResponse.json({ error: "Screenshot slot (before/after/general) is required." }, { status: 400 });
    }
    if (isItProjectImplementationPillar(kpiRow.title)) {
      return NextResponse.json(
        { error: "Pillar screenshots are not available for IT Project Implementation tasks." },
        { status: 400 },
      );
    }
    if (!perms.canAssignWork && !isAssignee) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (slot === "general") {
      if (!pillarScreenshotUploadEnabled(kpiRow.subKpis)) {
        return NextResponse.json(
          { error: "Pillar screenshot uploads were not enabled when this task was created." },
          { status: 400 },
        );
      }
    } else if (!pillarScreenshotsEnabled(kpiRow.subKpis)) {
      return NextResponse.json(
        { error: "Pillar before/after screenshots were not enabled for this task." },
        { status: 400 },
      );
    }
    if (screenshotFiles.length === 0) {
      return NextResponse.json({ error: "Screenshot file is required." }, { status: 400 });
    }
    const existingScreenshots = getPillarScreenshots(kpiRow.subKpis, slot);
    if (existingScreenshots.length + screenshotFiles.length > MAX_TASK_SCREENSHOTS_PER_SLOT) {
      return NextResponse.json(
        { error: `You can upload up to ${MAX_TASK_SCREENSHOTS_PER_SLOT} ${slot} screenshots per pillar.` },
        { status: 400 },
      );
    }
    for (const file of screenshotFiles) {
      const fileCheck = validateTaskScreenshotFile(file);
      if (!fileCheck.ok) {
        return NextResponse.json({ error: fileCheck.error }, { status: 400 });
      }
    }
    const uploaded = await Promise.all(screenshotFiles.map((file) => persistTaskScreenshot(kpiRow.id, file)));
    let updatedJson = setPillarScreenshots(kpiRow.subKpis, slot, [
      ...existingScreenshots,
      ...uploaded,
    ]);
    if (isPillarOnlyTask(updatedJson)) {
      updatedJson = syncPillarDoneFromRequirements(updatedJson);
    }
    const prevComplete = checklistFullyComplete(kpiRow.subKpis, kpiMainTaskLabel(kpiRow));
    const nextComplete = checklistFullyComplete(updatedJson, kpiMainTaskLabel(kpiRow));
    let lastFullCompletionAt: Date | null | undefined;
    if (!prevComplete && nextComplete) lastFullCompletionAt = new Date();
    else if (prevComplete && !nextComplete) lastFullCompletionAt = null;
    const updated = await prisma.kpiMaintenance.update({
      where: { id },
      data: {
        subKpis: updatedJson,
        ...(lastFullCompletionAt !== undefined ? { lastFullCompletionAt } : {}),
      },
    });
    return NextResponse.json(updated);
  }

  if (body.pillarScreenshotDelete != null && typeof body.pillarScreenshotDelete === "object") {
    const slot = body.pillarScreenshotDelete.slot;
    const storedFileName = String(body.pillarScreenshotDelete.storedFileName ?? "").trim();
    if (slot !== "before" && slot !== "after" && slot !== "general") {
      return NextResponse.json({ error: "Screenshot slot (before/after/general) is required." }, { status: 400 });
    }
    if (!storedFileName) {
      return NextResponse.json({ error: "storedFileName is required." }, { status: 400 });
    }
    if (isItProjectImplementationPillar(kpiRow.title)) {
      return NextResponse.json(
        { error: "Pillar screenshots are not available for IT Project Implementation tasks." },
        { status: 400 },
      );
    }
    if (!perms.canAssignWork && !isAssignee) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (checklistFullyComplete(kpiRow.subKpis, kpiMainTaskLabel(kpiRow))) {
      return NextResponse.json({ error: "Screenshots cannot be removed after the task card reaches Done." }, { status: 400 });
    }
    const existingScreenshots = getPillarScreenshots(kpiRow.subKpis, slot);
    if (!existingScreenshots.some((item) => item.storedFileName === storedFileName)) {
      return NextResponse.json({ error: "Screenshot not found." }, { status: 404 });
    }
    const updatedJson = removePillarScreenshot(kpiRow.subKpis, slot, storedFileName);
    let syncedJson = isPillarOnlyTask(updatedJson)
      ? syncPillarDoneFromRequirements(updatedJson)
      : updatedJson;
    const updated = await prisma.kpiMaintenance.update({
      where: { id },
      data: { subKpis: syncedJson },
    });
    return NextResponse.json(updated);
  }

  if (body.subKpiScreenshot != null && typeof body.subKpiScreenshot === "object") {
    const subKpiIdShot = String(body.subKpiScreenshot.subKpiId ?? "").trim();
    const slot = body.subKpiScreenshot.slot;
    if (!subKpiIdShot || (slot !== "before" && slot !== "after" && slot !== "general")) {
      return NextResponse.json(
        { error: "subKpiId and screenshot slot (before/after/general) are required." },
        { status: 400 },
      );
    }
    if (isItProjectImplementationPillar(kpiRow.title)) {
      return NextResponse.json(
        { error: "Screenshots are not available for IT Project Implementation tasks." },
        { status: 400 },
      );
    }
    if (!perms.canAssignWork && !canEditSubKpi(subKpiIdShot)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const target = subKpiItems.find((it) => it.id === subKpiIdShot);
    if (!target) {
      return NextResponse.json({ error: "Sub-task not found." }, { status: 404 });
    }
    if (slot === "general") {
      if (!subKpiScreenshotUploadRequired(target)) {
        return NextResponse.json(
          { error: "Screenshot upload is not enabled for this sub-task." },
          { status: 400 },
        );
      }
    } else if (!subKpiScreenshotsRequired(target)) {
      return NextResponse.json(
        { error: "Before/after screenshots are not required for this sub-task." },
        { status: 400 },
      );
    }
    if (screenshotFiles.length === 0) {
      return NextResponse.json({ error: "Screenshot file is required." }, { status: 400 });
    }
    const existingScreenshots = subKpiScreenshotList(target, slot);
    if (existingScreenshots.length + screenshotFiles.length > MAX_TASK_SCREENSHOTS_PER_SLOT) {
      return NextResponse.json(
        { error: `You can upload up to ${MAX_TASK_SCREENSHOTS_PER_SLOT} ${slot} screenshots per sub-task.` },
        { status: 400 },
      );
    }
    for (const file of screenshotFiles) {
      const fileCheck = validateTaskScreenshotFile(file);
      if (!fileCheck.ok) {
        return NextResponse.json({ error: fileCheck.error }, { status: 400 });
      }
    }
    const uploaded = await Promise.all(screenshotFiles.map((file) => persistTaskScreenshot(kpiRow.id, file)));
    let updatedJson = setSubKpiItemScreenshots(kpiRow.subKpis, subKpiIdShot, slot, [
      ...existingScreenshots,
      ...uploaded,
    ]);
    updatedJson = syncScreenshotOnlySubKpiDone(updatedJson, subKpiIdShot);
    const prevComplete = checklistFullyComplete(kpiRow.subKpis, kpiMainTaskLabel(kpiRow));
    const nextComplete = checklistFullyComplete(updatedJson, kpiMainTaskLabel(kpiRow));
    let lastFullCompletionAt: Date | null | undefined;
    if (!prevComplete && nextComplete) lastFullCompletionAt = new Date();
    else if (prevComplete && !nextComplete) lastFullCompletionAt = null;
    const updated = await prisma.kpiMaintenance.update({
      where: { id },
      data: {
        subKpis: updatedJson,
        ...(nextComplete ? { rolledOverIncomplete: false } : {}),
        ...(lastFullCompletionAt !== undefined ? { lastFullCompletionAt } : {}),
      },
    });
    await captureCurrentPeriodSnapshot(updatedJson);
    return NextResponse.json(updated);
  }

  if (body.subKpiScreenshotDelete != null && typeof body.subKpiScreenshotDelete === "object") {
    const subKpiIdShot = String(body.subKpiScreenshotDelete.subKpiId ?? "").trim();
    const slot = body.subKpiScreenshotDelete.slot;
    const storedFileName = String(body.subKpiScreenshotDelete.storedFileName ?? "").trim();
    if (!subKpiIdShot || (slot !== "before" && slot !== "after" && slot !== "general")) {
      return NextResponse.json(
        { error: "subKpiId and screenshot slot (before/after/general) are required." },
        { status: 400 },
      );
    }
    if (!storedFileName) {
      return NextResponse.json({ error: "storedFileName is required." }, { status: 400 });
    }
    if (isItProjectImplementationPillar(kpiRow.title)) {
      return NextResponse.json(
        { error: "Screenshots are not available for IT Project Implementation tasks." },
        { status: 400 },
      );
    }
    if (!perms.canAssignWork && !canEditSubKpi(subKpiIdShot)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (checklistFullyComplete(kpiRow.subKpis, kpiMainTaskLabel(kpiRow))) {
      return NextResponse.json({ error: "Screenshots cannot be removed after the task card reaches Done." }, { status: 400 });
    }
    const target = subKpiItems.find((it) => it.id === subKpiIdShot);
    if (!target) {
      return NextResponse.json({ error: "Sub-task not found." }, { status: 404 });
    }
    if (target.done) {
      return NextResponse.json({ error: "Screenshots cannot be removed after the sub-task is done." }, { status: 400 });
    }
    const existingScreenshots = subKpiScreenshotList(target, slot);
    if (!existingScreenshots.some((item) => item.storedFileName === storedFileName)) {
      return NextResponse.json({ error: "Screenshot not found." }, { status: 404 });
    }
    let updatedJson = removeSubKpiItemScreenshot(kpiRow.subKpis, subKpiIdShot, slot, storedFileName);
    updatedJson = syncScreenshotOnlySubKpiDone(updatedJson, subKpiIdShot);
    const prevComplete = checklistFullyComplete(kpiRow.subKpis, kpiMainTaskLabel(kpiRow));
    const nextComplete = checklistFullyComplete(updatedJson, kpiMainTaskLabel(kpiRow));
    let lastFullCompletionAt: Date | null | undefined;
    if (!prevComplete && nextComplete) lastFullCompletionAt = new Date();
    else if (prevComplete && !nextComplete) lastFullCompletionAt = null;
    const updated = await prisma.kpiMaintenance.update({
      where: { id },
      data: {
        subKpis: updatedJson,
        ...(nextComplete ? { rolledOverIncomplete: false } : {}),
        ...(lastFullCompletionAt !== undefined ? { lastFullCompletionAt } : {}),
      },
    });
    await captureCurrentPeriodSnapshot(updatedJson);
    return NextResponse.json(updated);
  }

  if (Object.prototype.hasOwnProperty.call(body, "assignedAgentId")) {
    if (!perms.canAssignWork) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const reassignedAgentId = body.assignedAgentId?.trim() ?? "";
    if (!reassignedAgentId) {
      if (session.user.role !== "SuperAdmin") {
        return NextResponse.json({ error: "Only SuperAdmin can move tasks back to unassigned." }, { status: 403 });
      }
      const updated = await prisma.kpiMaintenance.update({
        where: { id },
        data: {
          assignedAgentId: null,
          assignedRole: null,
        },
      });
      return NextResponse.json(updated);
    }
    const assignee = await prisma.agent.findUnique({
      where: { id: reassignedAgentId },
      include: { team: true },
    });
    if (!assignee) {
      return NextResponse.json({ error: "Assignee not found." }, { status: 404 });
    }
    if (!(await isAgentOnDutyFromMergedDb(assignee.id))) {
      return NextResponse.json(
        { error: "Assignee is Offline (no merged DB clock-in today). Only On Duty personnel can be assigned." },
        { status: 400 },
      );
    }
    if (hasSubKpiAssignedTo(kpiRow.subKpis, assignee.id)) {
      return NextResponse.json(
        { error: "This person is already assigned as a sub-task assignee. Choose a different main assignee first." },
        { status: 400 },
      );
    }
    const assignedRole = (await portalCompanyAdminPrivilegesForEmail(assignee.email))
      ? "Admin Role"
      : "Personnel";
    const updated = await prisma.kpiMaintenance.update({
      where: { id },
      data: {
        assignedAgentId: assignee.id,
        assignedRole,
      },
    });
    return NextResponse.json(updated);
  }

  if (body.addSubKpi != null && typeof body.addSubKpi === "object") {
    if (!perms.isAdminRole) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (isItProjectImplementationPillar(kpiRow.title)) {
      return NextResponse.json(
        { error: "Use task management to edit IT Project Implementation checklists." },
        { status: 400 },
      );
    }
    const title = String(body.addSubKpi.title ?? "").trim();
    if (!title) {
      return NextResponse.json({ error: "Sub Task title is required." }, { status: 400 });
    }
    const result = appendSubKpiItem(kpiRow.subKpis, {
      title,
      segmentId: body.addSubKpi.segmentId,
      startDate: body.addSubKpi.startDate,
      dueDate: body.addSubKpi.dueDate,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    const prevComplete = checklistFullyComplete(kpiRow.subKpis, kpiMainTaskLabel(kpiRow));
    const nextComplete = checklistFullyComplete(result.json, kpiMainTaskLabel(kpiRow));
    let lastFullCompletionAt: Date | null | undefined;
    if (!prevComplete && nextComplete) lastFullCompletionAt = new Date();
    else if (prevComplete && !nextComplete) lastFullCompletionAt = null;

    const updated = await prisma.kpiMaintenance.update({
      where: { id },
      data: {
        subKpis: result.json,
        ...(nextComplete ? { rolledOverIncomplete: false } : {}),
        ...(lastFullCompletionAt !== undefined ? { lastFullCompletionAt } : {}),
      },
    });
    await captureCurrentPeriodSnapshot(result.json);
    return NextResponse.json(updated);
  }

  if (body.updateSubKpi != null && typeof body.updateSubKpi === "object") {
    if (!perms.isAdminRole) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (isItProjectImplementationPillar(kpiRow.title)) {
      return NextResponse.json(
        { error: "Use task management to edit IT Project Implementation checklists." },
        { status: 400 },
      );
    }
    const subKpiIdUpdate = String(body.updateSubKpi.subKpiId ?? "").trim();
    if (!subKpiIdUpdate) {
      return NextResponse.json({ error: "updateSubKpi.subKpiId is required." }, { status: 400 });
    }
    const hasTitle = body.updateSubKpi.title !== undefined;
    const hasStartDate = body.updateSubKpi.startDate !== undefined;
    const hasDueDate = body.updateSubKpi.dueDate !== undefined;
    const hasCompletionMode = body.updateSubKpi.completionMode !== undefined;
    const hasNumericalTarget = body.updateSubKpi.numericalTarget !== undefined;
    const hasDailyPenalty = body.updateSubKpi.dailyPenaltyAmount !== undefined;
    if (!hasTitle && !hasStartDate && !hasDueDate && !hasCompletionMode && !hasNumericalTarget && !hasDailyPenalty) {
      return NextResponse.json(
        { error: "Provide title, startDate, dueDate, completionMode, numericalTarget, and/or dailyPenaltyAmount to update a Sub Task." },
        { status: 400 },
      );
    }
    if (hasDailyPenalty && kpiRow.isRecurring) {
      return NextResponse.json(
        { error: "Daily delay penalty applies only to one-off (non-recurring) tasks." },
        { status: 400 },
      );
    }
    if (hasStartDate && !isItProjectImplementationPillar(kpiRow.title)) {
      return NextResponse.json(
        { error: "Sub-task schedule dates are not used for maintenance tasks." },
        { status: 400 },
      );
    }
    if (
      hasCompletionMode &&
      !isSubKpiCompletionMode(body.updateSubKpi.completionMode)
    ) {
      return NextResponse.json({ error: "Invalid completionMode." }, { status: 400 });
    }
    const result = updateSubKpiItem(kpiRow.subKpis, subKpiIdUpdate, {
      ...(hasTitle ? { title: body.updateSubKpi.title } : {}),
      ...(hasStartDate ? { startDate: body.updateSubKpi.startDate } : {}),
      ...(hasDueDate ? { dueDate: body.updateSubKpi.dueDate } : {}),
      ...(hasCompletionMode ? { completionMode: body.updateSubKpi.completionMode as SubKpiCompletionMode } : {}),
      ...(hasNumericalTarget ? { numericalTarget: body.updateSubKpi.numericalTarget ?? null } : {}),
      ...(hasDailyPenalty ? { dailyPenaltyAmount: body.updateSubKpi.dailyPenaltyAmount ?? null } : {}),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    const prevComplete = checklistFullyComplete(kpiRow.subKpis, kpiMainTaskLabel(kpiRow));
    const nextComplete = checklistFullyComplete(result.json, kpiMainTaskLabel(kpiRow));
    let lastFullCompletionAt: Date | null | undefined;
    if (!prevComplete && nextComplete) lastFullCompletionAt = new Date();
    else if (prevComplete && !nextComplete) lastFullCompletionAt = null;

    const updated = await prisma.kpiMaintenance.update({
      where: { id },
      data: {
        subKpis: result.json,
        ...(nextComplete ? { rolledOverIncomplete: false } : {}),
        ...(lastFullCompletionAt !== undefined ? { lastFullCompletionAt } : {}),
      },
    });
    await captureCurrentPeriodSnapshot(result.json);
    return NextResponse.json(updated);
  }

  if (body.removeSubKpi != null && typeof body.removeSubKpi === "object") {
    if (!perms.isAdminRole) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (isItProjectImplementationPillar(kpiRow.title)) {
      return NextResponse.json(
        { error: "Use task management to edit IT Project Implementation checklists." },
        { status: 400 },
      );
    }
    const subKpiIdRemove = String(body.removeSubKpi.subKpiId ?? "").trim();
    if (!subKpiIdRemove) {
      return NextResponse.json({ error: "removeSubKpi.subKpiId is required." }, { status: 400 });
    }
    const result = removeSubKpiItem(kpiRow.subKpis, subKpiIdRemove);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    const prevComplete = checklistFullyComplete(kpiRow.subKpis, kpiMainTaskLabel(kpiRow));
    const nextComplete = checklistFullyComplete(result.json, kpiMainTaskLabel(kpiRow));
    let lastFullCompletionAt: Date | null | undefined;
    if (!prevComplete && nextComplete) lastFullCompletionAt = new Date();
    else if (prevComplete && !nextComplete) lastFullCompletionAt = null;

    const updated = await prisma.kpiMaintenance.update({
      where: { id },
      data: {
        subKpis: result.json,
        ...(nextComplete ? { rolledOverIncomplete: false } : {}),
        ...(lastFullCompletionAt !== undefined ? { lastFullCompletionAt } : {}),
      },
    });
    await captureCurrentPeriodSnapshot(result.json);
    return NextResponse.json(updated);
  }

  if (body.taskSchedule != null && typeof body.taskSchedule === "object") {
    if (!perms.isAdminRole) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (isItProjectImplementationPillar(kpiRow.title)) {
      return NextResponse.json(
        { error: "IT Project Implementation tasks do not use task schedule types." },
        { status: 400 },
      );
    }

    const schedule = body.taskSchedule;
    const isRecurring = schedule.isRecurring !== false;
    const frequency = (schedule.frequency?.toUpperCase() ?? kpiRow.frequency) as KpiFrequency;
    if (!allowedFrequencies.has(frequency)) {
      return NextResponse.json({ error: "Invalid frequency." }, { status: 400 });
    }

    let recurrenceWeekday: number | null = null;
    let recurrenceMonthDay: number | null = null;
    if (isRecurring && frequency === "WEEKLY") {
      const wd = schedule.recurrenceWeekday ?? kpiRow.recurrenceWeekday ?? 1;
      if (typeof wd !== "number" || wd < 0 || wd > 6 || !Number.isInteger(wd)) {
        return NextResponse.json(
          { error: "recurrenceWeekday is required for WEEKLY (0=Sunday … 6=Saturday)." },
          { status: 400 },
        );
      }
      recurrenceWeekday = wd;
    }
    if (isRecurring && (frequency === "MONTHLY" || frequency === "QUARTERLY")) {
      const dom = schedule.recurrenceMonthDay ?? kpiRow.recurrenceMonthDay ?? 1;
      if (typeof dom !== "number" || dom < 1 || dom > 31 || !Number.isInteger(dom)) {
        return NextResponse.json(
          { error: "recurrenceMonthDay is required for MONTHLY/QUARTERLY (1–31)." },
          { status: 400 },
        );
      }
      recurrenceMonthDay = dom;
    }

    if (kpiRow.isRecurring) {
      await captureCurrentPeriodSnapshot(kpiRow.subKpis);
    }

    const now = new Date();
    const freqCode = frequency as KpiFrequencyCode;
    let subKpisUpdate: Prisma.InputJsonValue | undefined;
    if (isRecurring && freqCode === "DAILY" && kpiRow.frequency !== "DAILY") {
      subKpisUpdate = stripSubKpiStartDates(kpiRow.subKpis);
    }

    const data: Prisma.KpiMaintenanceUpdateInput = {
      isRecurring,
      frequency,
      ...(subKpisUpdate !== undefined ? { subKpis: subKpisUpdate } : {}),
    };

    if (isRecurring) {
      data.nonRecurringStartAt = null;
      data.nonRecurringEndAt = null;
      data.recurrenceWeekday = recurrenceWeekday;
      data.recurrenceMonthDay = recurrenceMonthDay;
      data.periodCycleStartAt = getPeriodStartInclusive(
        freqCode,
        recurrenceWeekday,
        recurrenceMonthDay,
        now,
        patchTz,
      );
      data.periodKey = computePeriodKey(freqCode, recurrenceWeekday, recurrenceMonthDay, now, patchTz);
      data.rolledOverIncomplete = false;
    } else {
      data.nonRecurringStartAt = null;
      data.nonRecurringEndAt = null;
      data.recurrenceWeekday = null;
      data.recurrenceMonthDay = null;
      data.periodCycleStartAt = null;
      data.periodKey = null;
      data.lastFullCompletionAt = null;
      data.rolledOverIncomplete = false;
    }

    const updated = await prisma.kpiMaintenance.update({
      where: { id },
      data,
    });
    if (isRecurring) {
      await upsertKpiPeriodSnapshot(
        {
          id: updated.id,
          title: updated.title,
          frequency: updated.frequency,
          subKpis: updated.subKpis,
          periodKey: updated.periodKey,
          recurrenceWeekday: updated.recurrenceWeekday,
          recurrenceMonthDay: updated.recurrenceMonthDay,
          periodCycleStartAt: updated.periodCycleStartAt,
          isRecurring: updated.isRecurring,
          assignedAgent: kpiRow.assignedAgent
            ? { id: kpiRow.assignedAgent.id, name: kpiRow.assignedAgent.name }
            : null,
        },
        patchTz,
      );
    }
    return NextResponse.json(updated);
  }

  if (body.structuredSubKpis !== undefined) {
    if (!isAssignee) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const validated = validateStructuredUpdate(body.structuredSubKpis);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }
    if (isItProjectImplementationPillar(kpiRow.title)) {
      return NextResponse.json(
        { error: "Use phase controls to edit IT Project Implementation checklists." },
        { status: 400 },
      );
    }
    const wrapped = wrapForPersistWithExistingMeta(validated.norm, kpiRow.subKpis);
    const prevComplete = checklistFullyComplete(kpiRow.subKpis, kpiMainTaskLabel(kpiRow));
    const nextComplete = checklistFullyComplete(wrapped, kpiMainTaskLabel(kpiRow));
    let lastFullCompletionAt: Date | null | undefined;
    if (!prevComplete && nextComplete) lastFullCompletionAt = new Date();
    else if (prevComplete && !nextComplete) lastFullCompletionAt = null;

    const updated = await prisma.kpiMaintenance.update({
      where: { id },
      data: {
        subKpis: wrapped,
        ...(nextComplete ? { rolledOverIncomplete: false } : {}),
        ...(lastFullCompletionAt !== undefined ? { lastFullCompletionAt } : {}),
      },
    });
    await captureCurrentPeriodSnapshot(wrapped);
    return NextResponse.json(updated);
  }

  const markAllDone = body.markAllDone;
  const subKpiId = body.subKpiId?.trim() ?? "";
  if (subKpiId && !canCompleteSubKpi(subKpiId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!subKpiId && !isAssignee) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (typeof markAllDone !== "boolean" && (!subKpiId || typeof body.done !== "boolean")) {
    return NextResponse.json(
      { error: "Provide either markAllDone OR (subKpiId + done). Use structuredSubKpis to reorganize checklist." },
      { status: 400 },
    );
  }
  if (!isItProjectImplementationPillar(kpiRow.title) && subKpiId && body.done === true) {
    const target = subKpiItems.find((it) => it.id === subKpiId);
    if (target) {
      const mode = resolveSubKpiCompletionMode(target);
      if (mode === "screenshots") {
        return NextResponse.json(
          { error: "This sub-task completes when before and after screenshots are uploaded." },
          { status: 400 },
        );
      }
      if (mode === "both" && !hasBeforeAndAfterScreenshots(target)) {
        return NextResponse.json(
          { error: "Upload both before and after screenshots before marking this sub-task done." },
          { status: 400 },
        );
      }
    }
  }

  let updatedJson: Prisma.InputJsonValue;
  if (isItProjectImplementationPillar(kpiRow.title)) {
    if (typeof markAllDone === "boolean") {
      return NextResponse.json(
        { error: "Mark-all is not supported for IT Project Implementation. Complete each sub-task with an actual date." },
        { status: 400 },
      );
    }
    const toggled = setItProjectSubKpiDone(kpiRow.subKpis, subKpiId, body.done!);
    if (!toggled.ok) {
      return NextResponse.json({ error: toggled.error }, { status: 400 });
    }
    updatedJson = toggled.json;
  } else {
    updatedJson =
      typeof markAllDone === "boolean"
        ? markEverySubKpiDone(kpiRow.subKpis, markAllDone)
        : setSubKpiItemDone(kpiRow.subKpis, subKpiId, body.done!);
  }

  const prevComplete = checklistFullyComplete(kpiRow.subKpis, kpiMainTaskLabel(kpiRow));
  const nextComplete = checklistFullyComplete(updatedJson, kpiMainTaskLabel(kpiRow));
  let lastFullCompletionAt: Date | null | undefined;
  if (!prevComplete && nextComplete) lastFullCompletionAt = new Date();
  else if (prevComplete && !nextComplete) lastFullCompletionAt = null;

  const userResetProgress = typeof markAllDone === "boolean" && markAllDone === false;
  const updated = await prisma.kpiMaintenance.update({
    where: { id },
    data: {
      subKpis: updatedJson,
      ...(nextComplete ? { rolledOverIncomplete: false } : {}),
      ...(userResetProgress ? { rolledOverIncomplete: false } : {}),
      ...(lastFullCompletionAt !== undefined ? { lastFullCompletionAt } : {}),
    },
  });
  await captureCurrentPeriodSnapshot(updatedJson);
  return NextResponse.json(updated);
}
