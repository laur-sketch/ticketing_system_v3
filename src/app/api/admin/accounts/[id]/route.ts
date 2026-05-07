import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await requireRole(["Admin"]);
  if (unauthorized) return unauthorized;
  const { id } = await ctx.params;
  const body = (await req.json()) as { teamId?: string };

  const teamId = body.teamId?.trim() ?? "";
  if (!teamId) {
    return NextResponse.json({ error: "teamId is required." }, { status: 400 });
  }

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) {
    return NextResponse.json({ error: "Invalid team." }, { status: 400 });
  }

  const data: Prisma.AgentUpdateInput = {
    team: { connect: { id: teamId } },
  };

  try {
    const updated = await prisma.agent.update({
      where: { id },
      data,
      include: { team: true },
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Could not update personnel." }, { status: 404 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { unauthorized } = await requireRole(["Admin"]);
  if (unauthorized) return unauthorized;
  const { id } = await ctx.params;

  await prisma.agent.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
