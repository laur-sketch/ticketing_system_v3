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
  markEverySubKpiDone,
  normalizeSubKpis,
  resetAllSubKpiDone,
  setSubKpiItemDone,
  validateSegmentStructureForPersist,
  validateStructuredUpdate,
  wrapForPersist,
} from "@/lib/kpi-subkpis";
import { prisma } from "@/lib/prisma";
import { portalCompanyAdminPrivilegesForEmail } from "@/lib/portal-staff";
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

  const created = await prisma.kpiMaintenance.create({
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
    },
  });
  return NextResponse.json(created, { status: 201 });
}

export async function PATCH(req: Request) {
  const { session, unauthorized } = await requireRole(["Admin", "Personnel"]);
  if (unauthorized || !session) return unauthorized;
  const perms = await resolveOpsPermissions(session);
  const body = (await req.json()) as {
    id?: string;
    subKpiId?: string;
    done?: boolean;
    markAllDone?: boolean;
    structuredSubKpis?: unknown;
    assignedAgentId?: string;
  };
  const id = body.id?.trim() ?? "";

  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const row = await prisma.kpiMaintenance.findUnique({
    where: { id },
    select: {
      id: true,
      assignedAgentId: true,
      subKpis: true,
      isRecurring: true,
      frequency: true,
      recurrenceWeekday: true,
      recurrenceMonthDay: true,
      periodCycleStartAt: true,
      lastFullCompletionAt: true,
    },
  });
  if (!row) return NextResponse.json({ error: "KPI not found." }, { status: 404 });
  const isAssignee = !!perms.operator && perms.operator.id === row.assignedAgentId;

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
    const prevComplete = checklistFullyComplete(row.subKpis);
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

  const updatedJson =
    typeof markAllDone === "boolean"
      ? markEverySubKpiDone(row.subKpis, markAllDone)
      : setSubKpiItemDone(row.subKpis, subKpiId, body.done!);

  const prevComplete = checklistFullyComplete(row.subKpis);
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
  return NextResponse.json(updated);
}
