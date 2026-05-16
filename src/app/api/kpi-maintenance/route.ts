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
  applyItProjectSubTaskDoneMeta,
  collectAllSubKpiItems,
  markEverySubKpiDone,
  normalizeSubKpis,
  resetAllSubKpiDone,
  setSubKpiItemDone,
  setSubKpiItemScheduleMeta,
  validateSegmentStructureForPersist,
  validateStructuredUpdate,
  wrapForPersist,
} from "@/lib/kpi-subkpis";
import { isItProjectImplementationPillar } from "@/lib/it-task-pillar-titles";
import { prisma } from "@/lib/prisma";
import { portalCompanyAdminPrivilegesForEmail } from "@/lib/portal-staff";
import { timeZoneFromPeriodKey, upsertKpiPeriodSnapshot } from "@/lib/kpi-period-snapshots";
import { resolveOpsPermissions } from "@/lib/ops-permissions";

const allowedFrequencies = new Set(Object.values(KpiFrequency));

function checklistFullyComplete(subKpis: unknown): boolean {
  const items = collectAllSubKpiItems(normalizeSubKpis(subKpis));
  if (items.length === 0) return false;
  return items.every((x) => x.done);
}

export async function GET(req: Request) {
  const { session, unauthorized } = await requireRole(["Admin", "Personnel"]);
  if (unauthorized || !session) return unauthorized;

  const { searchParams } = new URL(req.url);
  const timeZone = normalizeTimeZone(searchParams.get("tz"));

  const perms = await resolveOpsPermissions(session);
  let where: Prisma.KpiMaintenanceWhereInput = perms.canAssignWork
    ? {}
    : { assignedAgentId: perms.operator?.id ?? "__none__" };

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
      assignedAgent: { select: { id: true, name: true, team: { select: { name: true } } } },
    },
  });

  const now = new Date();
  const updates: Promise<unknown>[] = [];

  for (const row of rows) {
    if (!row.isRecurring) {
      continue;
    }

    const freq = row.frequency as "DAILY" | "WEEKLY" | "MONTHLY";
    const inferredCycleStart = getPeriodStartInclusive(
      freq,
      row.recurrenceWeekday,
      row.recurrenceMonthDay,
      row.createdAt,
      timeZone,
    );
    const anchor = row.periodCycleStartAt ?? inferredCycleStart;

    const patch: Prisma.KpiMaintenanceUpdateInput = {};

    if (!row.periodCycleStartAt) {
      patch.periodCycleStartAt = inferredCycleStart;
    }

    const expectedKey = computePeriodKey(freq, row.recurrenceWeekday, row.recurrenceMonthDay, now, timeZone);
    if (row.periodKey == null || isLegacyPeriodKey(row.periodKey)) {
      patch.periodKey = expectedKey;
      patch.rolledOverIncomplete = false;
    }

    const complete = checklistFullyComplete(row.subKpis);
    const lastFull = row.lastFullCompletionAt;
    if (complete && lastFull) {
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
        assignedAgent: { select: { id: true, name: true, team: { select: { name: true } } } },
      },
    });
  }

  return NextResponse.json({ rows, canAssignWork: perms.canAssignWork });
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
    subKpis?: Array<{ title?: string }>;
    segments?: Array<{ label?: string; items?: Array<{ title?: string }> }>;
    assignedAgentId?: string;
    recurrenceWeekday?: number;
    recurrenceMonthDay?: number;
    timeZone?: string;
    isRecurring?: boolean;
    nonRecurringStartAt?: string;
    nonRecurringEndAt?: string;
    itProjectName?: string;
    itProjectPhase?: string;
  };
  const title = body.title?.trim() ?? "";
  const frequency = body.frequency?.toUpperCase() as KpiFrequency;
  if (!title || !allowedFrequencies.has(frequency)) {
    return NextResponse.json({ error: "title and frequency are required." }, { status: 400 });
  }
  const isRecurring = body.isRecurring !== false;
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
  if (isRecurring && frequency === "MONTHLY") {
    const dom = body.recurrenceMonthDay;
    if (typeof dom !== "number" || dom < 1 || dom > 31 || !Number.isInteger(dom)) {
      return NextResponse.json(
        { error: "recurrenceMonthDay is required for MONTHLY (1–31)." },
        { status: 400 },
      );
    }
    recurrenceMonthDay = dom;
  }
  if (!isRecurring) {
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

  const flatTitles =
    Array.isArray(body.subKpis) && !body.subKpisSegmented
      ? body.subKpis.map((s) => (s.title ?? "").trim()).filter((t) => t.length > 0)
      : [];

  const segmentsInput =
    body.subKpisSegmented === true && Array.isArray(body.segments)
      ? body.segments.map((seg) => ({
          label: (seg.label ?? "").trim(),
          items: Array.isArray(seg.items)
            ? seg.items.map((i) => (i.title ?? "").trim()).filter((t) => t.length > 0)
            : [],
        }))
      : undefined;

  const built = validateSegmentStructureForPersist(
    body.subKpisSegmented === true,
    flatTitles,
    segmentsInput,
  );

  if (!built.ok) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  const subKpisPersist = wrapForPersist(built.norm) as Prisma.InputJsonValue;

  const timeZone = normalizeTimeZone(body.timeZone);
  const periodKey = isRecurring
    ? computePeriodKey(
        frequency as "DAILY" | "WEEKLY" | "MONTHLY",
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
  const itProjectPhase =
    isItProjectImplementationPillar(title) && typeof body.itProjectPhase === "string"
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
  const body = (await req.json()) as {
    id?: string;
    subKpiId?: string;
    done?: boolean;
    markAllDone?: boolean;
    structuredSubKpis?: unknown;
    assignedAgentId?: string;
    itProjectName?: string | null;
    itProjectPhase?: string | null;
    subKpiSchedule?: { subKpiId?: string; dueDate?: string | null; actualDate?: string | null };
  };
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

  async function captureCompletedPeriod(subKpis: unknown) {
    if (!kpiRow.isRecurring || !checklistFullyComplete(subKpis)) return;
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
      timeZoneFromPeriodKey(kpiRow.periodKey),
    );
  }
  const isAssignee = !!perms.operator && perms.operator.id === kpiRow.assignedAgentId;

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

  if (body.subKpiSchedule != null && typeof body.subKpiSchedule === "object") {
    if (!isAssignee) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!isItProjectImplementationPillar(kpiRow.title)) {
      return NextResponse.json({ error: "Per sub-task scheduling applies only to IT Project Implementation." }, { status: 400 });
    }
    const subKpiIdSched = String(body.subKpiSchedule.subKpiId ?? "").trim();
    if (!subKpiIdSched) {
      return NextResponse.json({ error: "subKpiSchedule.subKpiId is required." }, { status: 400 });
    }
    const sched = body.subKpiSchedule;
    const updatedJson = setSubKpiItemScheduleMeta(kpiRow.subKpis, subKpiIdSched, {
      dueDate: sched.dueDate,
      actualDate: sched.actualDate,
    });
    const updated = await prisma.kpiMaintenance.update({ where: { id }, data: { subKpis: updatedJson } });
    return NextResponse.json(updated);
  }

  const reassignedAgentId = body.assignedAgentId?.trim() ?? "";
  if (reassignedAgentId) {
    if (!perms.canAssignWork) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
    const wrapped = wrapForPersist(validated.norm);
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
    if (nextComplete) await captureCompletedPeriod(wrapped);
    return NextResponse.json(updated);
  }

  if (!isAssignee) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const markAllDone = body.markAllDone;
  const subKpiId = body.subKpiId?.trim() ?? "";
  if (typeof markAllDone !== "boolean" && (!subKpiId || typeof body.done !== "boolean")) {
    return NextResponse.json(
      { error: "Provide either markAllDone OR (subKpiId + done). Use structuredSubKpis to reorganize checklist." },
      { status: 400 },
    );
  }

  const updatedJsonRaw =
    typeof markAllDone === "boolean"
      ? markEverySubKpiDone(kpiRow.subKpis, markAllDone)
      : setSubKpiItemDone(kpiRow.subKpis, subKpiId, body.done!);
  let updatedJson: Prisma.InputJsonValue = updatedJsonRaw;
  if (
    isItProjectImplementationPillar(kpiRow.title) &&
    typeof body.done === "boolean" &&
    subKpiId
  ) {
    updatedJson = applyItProjectSubTaskDoneMeta(updatedJsonRaw, subKpiId, body.done, patchTz);
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
  if (nextComplete) await captureCompletedPeriod(updatedJson);
  return NextResponse.json(updated);
}
