import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { unauthorized } = await requireRole(["Admin", "Personnel"]);
  if (unauthorized) return unauthorized;
  const agents = await prisma.agent.findMany({
    orderBy: { name: "asc" },
    include: { team: true },
  });
  const portals = await prisma.portalAccount.findMany({
    where: { email: { in: agents.map((a) => a.email) } },
    select: { email: true, headPrivileges: true },
  });
  const headByEmail = new Map(portals.map((p) => [p.email.toLowerCase(), p.headPrivileges]));
  const payload = agents.map((a) => ({
    ...a,
    headPrivileges: headByEmail.get(a.email.toLowerCase()) ?? false,
  }));
  return NextResponse.json(payload);
}
