import { KpiFrequency, Prisma } from "@prisma/client";
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
  collectAllSubKpiItems,
  enablePillarScreenshots,
  getPillarScreenshots,
  hasSubKpiAssignedTo,
  pillarScreenshotsEnabled,
  type NormalizedSubKpis,
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
  subKpiAssignedAgentId,
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
  setItProjectSubKpiSchedule,
  updateItProjectPhases,
  wrapItProjectSubKpis,
  type ItProjectData,
} from "@/lib/it-project-subkpis";
import { isItProjectImplementationPillar } from "@/lib/it-task-pillar-titles";
import { prisma } from "@/lib/prisma";
import { portalCompanyAdminPrivilegesForEmail } from "@/lib/portal-staff";
import { timeZoneFromPeriodKey, upsertKpiPeriodSnapshot } from "@/lib/kpi-period-snapshots";
import { resolveOpsPermissions } from "@/lib/ops-permissions";
import { persistTaskScreenshot, validateTaskScreenshotFile } from "@/lib/task-screenshots";
import { MAX_TASK_SCREENSHOTS_PER_SLOT } from "@/lib/task-screenshot-constants";
import type { TaskScreenshotSlot } from "@/lib/task-screenshot-meta";

const allowedFrequencies = new Set(Object.values(KpiFrequency));

function checklistFullyComplete(subKpis: unknown): boolean {
  const items = isItProjectEnvelope(subKpis)
    ? itProjectAllItems(parseItProjectSubKpis(subKpis))
    : collectAllSubKpiItems(normalizeSubKpis(subKpis));
  if (items.length === 0) return false;
  return items.every((x) => x.done);
}

function taskScreenshotsEnabled(item: { screenshotsEnabled?: boolean; beforeScreenshot?: unknown[]; afterScreenshot?: unknown[] }): boolean {
  return (
    item.screenshotsEnabled === true ||
    (item.beforeScreenshot?.length ?? 0) > 0 ||
    (item.afterScreenshot?.length ?? 0) > 0
  );
}

function hasBeforeAndAfterScreenshots(item: { beforeScreenshot?: unknown[]; afterScreenshot?: unknown[] }): boolean {
  return (item.beforeScreenshot?.length ?? 0) > 0 && (item.afterScreenshot?.length ?? 0) > 0;
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
    const portals = await prisma.portalAccount.findMany({
      where: { staffDesignatedCompanyId: companyTeamId },
      select: { email: true },
    });
    const emails = portals.map((p) => p.email.trim().toLowerCase()).filter(Boolean);
    const agentsInSbu =
      emails.length > 0
        ? await prisma.agent.findMany({
            where: { email: { in: emails } },
            select: { id: true },
          })
        : [];
    const agentIds = agentsInSbu.map((a) => a.id);
    const scopedOr: Prisma.KpiMaintenanceWhereInput[] = [{ assignedAgentId: null }];
    if (agentIds.length > 0) {
      scopedOr.push({ assignedAgentId: { in: agentIds } });
    }
    where = {
      AND: [where, { OR: scopedOr }],
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
    rows = rows.filter((row) => row.assignedAgentId === operatorId || hasSubKpiAssignedTo(row.subKpis, operatorId));
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

    const complete = checklistFullyComplete(row.subKpis);
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
      rows = rows.filter((row) => row.assignedAgentId === operatorId || hasSubKpiAssignedTo(row.subKpis, operatorId));
    }
  }

  return NextResponse.json({
    rows,
    canAssignWork: perms.canAssignWork,
    canUnassignWork: session.user.role === "SuperAdmin",
    canCompleteUnassignedWork: session.user.role === "SuperAdmin",
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
    screenshotAttachmentScope?: "subtask" | "pillar";
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
  };
  const title = body.title?.trim() ?? "";
  const isItProject = isItProjectImplementationPillar(title);
  const frequency = (body.frequency?.toUpperCase() ?? "DAILY") as KpiFrequency;
  if (!title || !allowedFrequencies.has(frequency)) {
    return NextResponse.json({ error: "title and frequency are required." }, { status: 400 });
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
  if (isRecurring && frequency === "WEEKLY") {
    const wd = body.recurrenceWeekday;
    if (typeof wd !== "number" || wd < 0 || wd > 6 || !Number.isInteger(wd)) {
      return NextResponse.json(
        { error: "recurrenceWeekday is required for WEEKLY (0=Sunday … 6=Saturday)." },
        { status: 400 },
      );
    }
    recurrenceWeekday = wd;
  }
  if (isRecurring && (frequency === "MONTHLY" || frequency === "QUARTERLY")) {
    const dom = body.recurrenceMonthDay;
    if (typeof dom !== "number" || dom < 1 || dom > 31 || !Number.isInteger(dom)) {
      return NextResponse.json(
        { error: "recurrenceMonthDay is required for MONTHLY/QUARTERLY (1–31)." },
        { status: 400 },
      );
    }
    recurrenceMonthDay = dom;
  }
  if (!isRecurring && !isItProject) {
    const startIso = body.nonRecurringStartAt?.trim() ?? "";
    const endIso = body.nonRecurringEndAt?.trim() ?? "";
    if (!startIso || !endIso) {
      return NextResponse.json(
        { error: "nonRecurringStartAt and nonRecurringEndAt are required when task is not recurring." },
        { status: 400 },
      );
    }
    const parsedStart = new Date(startIso);
    const parsedEnd = new Date(endIso);
    if (
      !Number.isFinite(parsedStart.getTime()) ||
      !Number.isFinite(parsedEnd.getTime()) ||
      parsedEnd.getTime() <= parsedStart.getTime()
    ) {
      return NextResponse.json(
        { error: "For non-recurring tasks, end date/time must be after start date/time." },
        { status: 400 },
      );
    }
    nonRecurringStartAt = parsedStart;
    nonRecurringEndAt = parsedEnd;
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
    const subTaskScreenshots = body.screenshotAttachmentScope !== "pillar";
    const flatItems =
      Array.isArray(body.subKpis) && !body.subKpisSegmented
        ? body.subKpis
            .map((s) => ({
              title: (s.title ?? "").trim(),
              startDate: (s.startDate ?? "").trim(),
              dueDate: isRecurring ? "" : (s.dueDate ?? s.endDate ?? "").trim(),
              screenshotsEnabled: subTaskScreenshots && s.screenshotsEnabled === true,
            }))
            .filter((s) => s.title.length > 0)
        : [];

    const segmentsInput =
      body.subKpisSegmented === true && Array.isArray(body.segments)
        ? body.segments.map((seg) => ({
            label: (seg.label ?? "").trim(),
            items: Array.isArray(seg.items)
              ? seg.items
                  .map((i) => ({
                    title: (i.title ?? "").trim(),
                    startDate: (i.startDate ?? "").trim(),
                    dueDate: isRecurring ? "" : (i.dueDate ?? i.endDate ?? "").trim(),
                    screenshotsEnabled: subTaskScreenshots && i.screenshotsEnabled === true,
                  }))
                  .filter((i) => i.title.length > 0)
              : [],
          }))
        : undefined;

    built = validateSegmentStructureForPersist(
      body.subKpisSegmented === true,
      flatItems,
      segmentsInput,
    );
  }

  if (!built.ok) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  let subKpisPersist = (itProjectPersist ?? wrapForPersist(built.norm)) as Prisma.InputJsonValue;
  if (!isItProject && body.screenshotAttachmentScope === "pillar") {
    subKpisPersist = enablePillarScreenshots(subKpisPersist);
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

  let created;
  try {
    created = await prisma.kpiMaintenance.create({
      data: {
        title,
        isRecurring,
        frequency,
        subKpis: subKpisPersist,
        assignedAgentId: assignee?.id ?? null,
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
          {
            error:
              "A task with this title already exists. Remove the duplicate KPI or choose a different pillar title.",
          },
          { status: 409 },
        );
      }
    }
    const msg = e instanceof Error ? e.message : "Could not create KPI.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  return NextResponse.json(created, { status: 201 });
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
      location?: string | null;
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
      assignedAgent: { select: { id: true, email: true } },
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
      },
      snapshotTz,
    );
  }
  const isAssignee = !!perms.operator && perms.operator.id === kpiRow.assignedAgentId;
  const subKpiItems = isItProjectImplementationPillar(kpiRow.title)
    ? itProjectAllItems(parseItProjectSubKpis(kpiRow.subKpis, kpiRow.itProjectPhase))
    : collectAllSubKpiItems(normalizeSubKpis(kpiRow.subKpis));
  const canEditSubKpi = (subKpiId: string) => {
    if (isAssignee) return true;
    const operatorId = perms.operator?.id;
    const item = subKpiItems.find((it) => it.id === subKpiId);
    if (!item) return false;
    const subAssigneeId = subKpiAssignedAgentId(item);
    if (operatorId && subAssigneeId === operatorId) return true;
    return session.user.role === "SuperAdmin" && !kpiRow.assignedAgentId && !subAssigneeId;
  };
  const canCompleteSubKpi = (subKpiId: string) => {
    if (canEditSubKpi(subKpiId)) return true;
    const item = subKpiItems.find((it) => it.id === subKpiId);
    return Boolean(item && perms.canAssignWork && taskScreenshotsEnabled(item) && hasBeforeAndAfterScreenshots(item));
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
    const updatedJson = setSubKpiItemWorkMeta(kpiRow.subKpis, subKpiIdMeta, {
      startDate: meta.startDate,
      dueDate: recurring ? undefined : meta.dueDate,
      actualDate: recurring ? undefined : meta.actualDate,
      location: meta.location,
    });
    const prevComplete = checklistFullyComplete(kpiRow.subKpis);
    const nextComplete = checklistFullyComplete(updatedJson);
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
    const prevComplete = checklistFullyComplete(kpiRow.subKpis);
    const nextComplete = checklistFullyComplete(updatedJson);
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
    if (assignee) {
      const mainAssigneeEmail = kpiRow.assignedAgent?.email?.trim().toLowerCase() ?? "";
      const subAssigneeEmail = assignee.email.trim().toLowerCase();
      if (!mainAssigneeEmail) {
        return NextResponse.json(
          { error: "Assign the main task before assigning sub-tasks to personnel." },
          { status: 400 },
        );
      }
      const portalCompanies = await prisma.portalAccount.findMany({
        where: { email: { in: [mainAssigneeEmail, subAssigneeEmail] } },
        select: { email: true, staffDesignatedCompanyId: true },
      });
      const companyByEmail = new Map(
        portalCompanies.map((p) => [p.email.trim().toLowerCase(), p.staffDesignatedCompanyId] as const),
      );
      const mainAssigneeCompanyId = companyByEmail.get(mainAssigneeEmail) ?? null;
      const subAssigneeCompanyId = companyByEmail.get(subAssigneeEmail) ?? null;
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
    if (slot !== "before" && slot !== "after") {
      return NextResponse.json({ error: "Screenshot slot (before/after) is required." }, { status: 400 });
    }
    if (isItProjectImplementationPillar(kpiRow.title)) {
      return NextResponse.json(
        { error: "Before/after screenshots are not available for IT Project Implementation tasks." },
        { status: 400 },
      );
    }
    if (!perms.canAssignWork && !isAssignee) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!pillarScreenshotsEnabled(kpiRow.subKpis)) {
      return NextResponse.json(
        { error: "Pillar screenshots were not enabled when this task was created." },
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
    const updatedJson = setPillarScreenshots(kpiRow.subKpis, slot, [
      ...existingScreenshots,
      ...uploaded,
    ]);
    const updated = await prisma.kpiMaintenance.update({
      where: { id },
      data: { subKpis: updatedJson },
    });
    return NextResponse.json(updated);
  }

  if (body.pillarScreenshotDelete != null && typeof body.pillarScreenshotDelete === "object") {
    const slot = body.pillarScreenshotDelete.slot;
    const storedFileName = String(body.pillarScreenshotDelete.storedFileName ?? "").trim();
    if (slot !== "before" && slot !== "after") {
      return NextResponse.json({ error: "Screenshot slot (before/after) is required." }, { status: 400 });
    }
    if (!storedFileName) {
      return NextResponse.json({ error: "storedFileName is required." }, { status: 400 });
    }
    if (isItProjectImplementationPillar(kpiRow.title)) {
      return NextResponse.json(
        { error: "Before/after screenshots are not available for IT Project Implementation tasks." },
        { status: 400 },
      );
    }
    if (!perms.canAssignWork && !isAssignee) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (checklistFullyComplete(kpiRow.subKpis)) {
      return NextResponse.json({ error: "Screenshots cannot be removed after the task card reaches Done." }, { status: 400 });
    }
    const existingScreenshots = getPillarScreenshots(kpiRow.subKpis, slot);
    if (!existingScreenshots.some((item) => item.storedFileName === storedFileName)) {
      return NextResponse.json({ error: "Screenshot not found." }, { status: 404 });
    }
    const updatedJson = removePillarScreenshot(kpiRow.subKpis, slot, storedFileName);
    const updated = await prisma.kpiMaintenance.update({
      where: { id },
      data: { subKpis: updatedJson },
    });
    return NextResponse.json(updated);
  }

  if (body.subKpiScreenshot != null && typeof body.subKpiScreenshot === "object") {
    const subKpiIdShot = String(body.subKpiScreenshot.subKpiId ?? "").trim();
    const slot = body.subKpiScreenshot.slot;
    if (!subKpiIdShot || (slot !== "before" && slot !== "after")) {
      return NextResponse.json({ error: "subKpiId and screenshot slot (before/after) are required." }, { status: 400 });
    }
    if (isItProjectImplementationPillar(kpiRow.title)) {
      return NextResponse.json(
        { error: "Before/after screenshots are not available for IT Project Implementation tasks." },
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
    if (!taskScreenshotsEnabled(target)) {
      return NextResponse.json(
        { error: "Before/after screenshots were not enabled when this task was created." },
        { status: 400 },
      );
    }
    if (screenshotFiles.length === 0) {
      return NextResponse.json({ error: "Screenshot file is required." }, { status: 400 });
    }
    const existingScreenshots = slot === "before" ? target.beforeScreenshot ?? [] : target.afterScreenshot ?? [];
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
    const updatedJson = setSubKpiItemScreenshots(kpiRow.subKpis, subKpiIdShot, slot, [
      ...existingScreenshots,
      ...uploaded,
    ]);
    const updated = await prisma.kpiMaintenance.update({
      where: { id },
      data: { subKpis: updatedJson },
    });
    return NextResponse.json(updated);
  }

  if (body.subKpiScreenshotDelete != null && typeof body.subKpiScreenshotDelete === "object") {
    const subKpiIdShot = String(body.subKpiScreenshotDelete.subKpiId ?? "").trim();
    const slot = body.subKpiScreenshotDelete.slot;
    const storedFileName = String(body.subKpiScreenshotDelete.storedFileName ?? "").trim();
    if (!subKpiIdShot || (slot !== "before" && slot !== "after")) {
      return NextResponse.json({ error: "subKpiId and screenshot slot (before/after) are required." }, { status: 400 });
    }
    if (!storedFileName) {
      return NextResponse.json({ error: "storedFileName is required." }, { status: 400 });
    }
    if (isItProjectImplementationPillar(kpiRow.title)) {
      return NextResponse.json(
        { error: "Before/after screenshots are not available for IT Project Implementation tasks." },
        { status: 400 },
      );
    }
    if (!perms.canAssignWork && !canEditSubKpi(subKpiIdShot)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (checklistFullyComplete(kpiRow.subKpis)) {
      return NextResponse.json({ error: "Screenshots cannot be removed after the task card reaches Done." }, { status: 400 });
    }
    const target = subKpiItems.find((it) => it.id === subKpiIdShot);
    if (!target) {
      return NextResponse.json({ error: "Sub-task not found." }, { status: 404 });
    }
    if (target.done) {
      return NextResponse.json({ error: "Screenshots cannot be removed after the sub-task is done." }, { status: 400 });
    }
    const existingScreenshots = slot === "before" ? target.beforeScreenshot ?? [] : target.afterScreenshot ?? [];
    if (!existingScreenshots.some((item) => item.storedFileName === storedFileName)) {
      return NextResponse.json({ error: "Screenshot not found." }, { status: 404 });
    }
    const updatedJson = removeSubKpiItemScreenshot(kpiRow.subKpis, subKpiIdShot, slot, storedFileName);
    const updated = await prisma.kpiMaintenance.update({
      where: { id },
      data: { subKpis: updatedJson },
    });
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
    const prevComplete = checklistFullyComplete(kpiRow.subKpis);
    const nextComplete = checklistFullyComplete(wrapped);
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
    if (target && taskScreenshotsEnabled(target) && !hasBeforeAndAfterScreenshots(target)) {
      return NextResponse.json(
        { error: "Upload both before and after screenshots before marking this sub-task done." },
        { status: 400 },
      );
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

  const prevComplete = checklistFullyComplete(kpiRow.subKpis);
  const nextComplete = checklistFullyComplete(updatedJson);
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
