import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { isItProjectImplementationPillar } from "@/lib/it-task-pillar-titles";
import { kpiMainTaskLabel } from "@/lib/kpi-main-task";
import { normalizeTimeZone } from "@/lib/kpi-recurrence";
import { removeSubKpiItem, updateSubKpiItem } from "@/lib/kpi-subkpis";
import { listSubTaskDtos } from "@/lib/kpi-subtasks-rest";
import { resolveOpsPermissions } from "@/lib/ops-permissions";
import { prisma } from "@/lib/prisma";
import { KPI_ROW_SELECT, type KpiRow, checklistFullyComplete, snapshotIfRecurring } from "../_shared";

async function loadAdminAndRow(id: string) {
  const { session, unauthorized } = await requireRole(["Admin", "Personnel"]);
  if (unauthorized || !session) return { errorResponse: unauthorized as NextResponse };
  const perms = await resolveOpsPermissions(session);
  if (!perms.isAdminRole) {
    return { errorResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  const row = await prisma.kpiMaintenance.findUnique({ where: { id }, select: KPI_ROW_SELECT });
  if (!row) {
    return { errorResponse: NextResponse.json({ error: "Task not found." }, { status: 404 }) };
  }
  if (isItProjectImplementationPillar(row.title)) {
    return {
      errorResponse: NextResponse.json(
        { error: "Use task management to edit IT Project Implementation checklists." },
        { status: 400 },
      ),
    };
  }
  return { row };
}

async function persistSubKpis(
  row: KpiRow,
  updatedJson: Parameters<typeof listSubTaskDtos>[0],
  tz: string,
) {
  const label = kpiMainTaskLabel(row);
  const prevComplete = checklistFullyComplete(row.subKpis, label);
  const nextComplete = checklistFullyComplete(updatedJson, label);
  let lastFullCompletionAt: Date | null | undefined;
  if (!prevComplete && nextComplete) lastFullCompletionAt = new Date();
  else if (prevComplete && !nextComplete) lastFullCompletionAt = null;

  await prisma.kpiMaintenance.update({
    where: { id: row.id },
    data: {
      subKpis: updatedJson as never,
      ...(nextComplete ? { rolledOverIncomplete: false } : {}),
      ...(lastFullCompletionAt !== undefined ? { lastFullCompletionAt } : {}),
    },
  });
  await snapshotIfRecurring(row, updatedJson, tz);
}

/** PUT /api/kpi-maintenance/:id/subtasks/:subtaskId — edit a sub-task (admins only). */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string; subtaskId: string }> }) {
  const { id, subtaskId } = await ctx.params;
  const { row, errorResponse } = await loadAdminAndRow(id);
  if (!row) return errorResponse;
  const tz = normalizeTimeZone(new URL(req.url).searchParams.get("tz"));

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    description?: string | null;
    dueDate?: string | null;
    priority?: string | null;
    done?: boolean;
  };
  if (
    body.title === undefined &&
    body.description === undefined &&
    body.dueDate === undefined &&
    body.priority === undefined
  ) {
    return NextResponse.json(
      { error: "Provide title, description, dueDate, and/or priority to update a Sub Task." },
      { status: 400 },
    );
  }

  const result = updateSubKpiItem(row.subKpis, subtaskId, {
    ...(body.title !== undefined ? { title: body.title } : {}),
    ...(body.description !== undefined ? { description: body.description ?? null } : {}),
    ...(body.dueDate !== undefined ? { dueDate: body.dueDate } : {}),
    ...(body.priority !== undefined ? { projectPriority: body.priority ?? null } : {}),
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  await persistSubKpis(row, result.json, tz);
  return NextResponse.json({ taskId: row.id, subtasks: listSubTaskDtos(result.json) });
}

/** DELETE /api/kpi-maintenance/:id/subtasks/:subtaskId — remove a sub-task (admins only). */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string; subtaskId: string }> }) {
  const { id, subtaskId } = await ctx.params;
  const { row, errorResponse } = await loadAdminAndRow(id);
  if (!row) return errorResponse;
  const tz = normalizeTimeZone(new URL(req.url).searchParams.get("tz"));

  const result = removeSubKpiItem(row.subKpis, subtaskId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  await persistSubKpis(row, result.json, tz);
  return NextResponse.json({ taskId: row.id, subtasks: listSubTaskDtos(result.json) });
}
