import { TaskStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { resolveOpsPermissions } from "@/lib/ops-permissions";

const statusSet = new Set(Object.values(TaskStatus));

export async function GET() {
  const { session, unauthorized } = await requireRole(["Admin", "Personnel"]);
  if (unauthorized || !session) return unauthorized;
  const perms = await resolveOpsPermissions(session);
  const role = session.user.role;

  // Admins oversee all tasks; Heads see all operational tasks they can coordinate;
  // others only see rows assigned to their linked Agent profile.
  const where =
    role === "Admin" || role === "SuperAdmin"
      ? {}
      : perms.canAssignWork
        ? {}
        : { assignedAgentId: perms.operator?.id ?? "__none__" };
  const rows = await prisma.taskItem.findMany({
    where,
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: { assignedAgent: { select: { id: true, name: true, team: { select: { name: true } } } } },
  });
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
    description?: string;
    assignedAgentId?: string;
    dueAt?: string;
    priority?: string;
  };
  const title = body.title?.trim() ?? "";
  if (!title || !body.assignedAgentId) {
    return NextResponse.json({ error: "title and assignedAgentId are required." }, { status: 400 });
  }
  const assignee = await prisma.agent.findUnique({ where: { id: body.assignedAgentId }, select: { id: true } });
  if (!assignee) {
    return NextResponse.json({ error: "Assignee not found." }, { status: 404 });
  }
  const dueAt = body.dueAt ? new Date(body.dueAt) : null;
  const created = await prisma.taskItem.create({
    data: {
      title,
      description: body.description?.trim() || null,
      assignedAgentId: assignee.id,
      dueAt: dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt : null,
      priority: body.priority?.trim() || null,
      createdBy: session.user.email ?? session.user.name ?? "unknown",
      createdByRole: session.user.role,
    },
  });
  await prisma.taskActivity.create({
    data: {
      taskId: created.id,
      author: session.user.email ?? session.user.name ?? "unknown",
      action: "Task created",
      detail: `Assigned to ${body.assignedAgentId}`,
    },
  });
  return NextResponse.json(created, { status: 201 });
}

export async function PATCH(req: Request) {
  const { session, unauthorized } = await requireRole(["Admin", "Personnel"]);
  if (unauthorized || !session) return unauthorized;
  const perms = await resolveOpsPermissions(session);

  const body = (await req.json()) as { id?: string; status?: string };
  const id = body.id?.trim() ?? "";
  const status = body.status?.toUpperCase() as TaskStatus;
  if (!id || !status || !statusSet.has(status)) {
    return NextResponse.json({ error: "id and valid status are required." }, { status: 400 });
  }

  const task = await prisma.taskItem.findUnique({ where: { id }, select: { id: true, assignedAgentId: true } });
  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  const isAssignee = !!perms.operator && perms.operator.id === task.assignedAgentId;

  // Admin/SuperAdmin cannot change task status (oversee only).
  if (session.user.role === "Admin" || session.user.role === "SuperAdmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isAssignee) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const current = await prisma.taskItem.findUnique({ where: { id }, select: { status: true } });
  const updated = await prisma.taskItem.update({ where: { id }, data: { status } });
  if (current && current.status !== status) {
    await prisma.taskActivity.create({
      data: {
        taskId: id,
        author: session.user.email ?? session.user.name ?? "unknown",
        action: "Status updated",
        detail: `${current.status} -> ${status}`,
      },
    });
  }
  return NextResponse.json(updated);
}
