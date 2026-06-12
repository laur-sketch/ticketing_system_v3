import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { computeKpis, parseHelpdeskCadence, parseKpiRangeFromQuery } from "@/lib/kpis";
import { prisma } from "@/lib/prisma";
import { findSessionAgentId } from "@/lib/session-agent";

export async function GET(req: Request) {
  const startedAt = Date.now();
  const { session, unauthorized } = await requireRole(["SuperAdmin", "Admin", "Personnel"]);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(req.url);
  const { from, to } = parseKpiRangeFromQuery(searchParams.get("from"), searchParams.get("to"));

  const operator =
    session?.user?.role === "Personnel"
      ? await findSessionAgentId({ email: session.user.email, name: session.user.name })
      : null;
  const assignedAgentId = session?.user?.role === "Personnel" ? operator?.id ?? "__none__" : undefined;
  const companyId =
    session?.user?.role === "SuperAdmin" || session?.user?.role === "Admin"
      ? searchParams.get("companyId")?.trim() || null
      : null;
  const assignedAgentIds = companyId ? await agentIdsForCompany(companyId) : undefined;

  const helpdeskCadence = parseHelpdeskCadence(searchParams.get("helpdeskCadence"));
  const kpis = await computeKpis({ from, to }, { assignedAgentId, assignedAgentIds }, { helpdeskCadence });
  if (process.env.NODE_ENV === "development") {
    console.info(
      `[perf] GET /api/kpis ${Date.now() - startedAt}ms from=${from.toISOString()} to=${to.toISOString()}`,
    );
  }
  return NextResponse.json(kpis, {
    headers: {
      "cache-control": "private, no-store, max-age=0",
    },
  });
}

async function agentIdsForCompany(companyId: string) {
  const accounts = await prisma.portalAccount.findMany({
    where: { staffDesignatedCompanyId: companyId },
    select: { email: true },
  });
  const emails = accounts.map((account) => account.email.trim().toLowerCase()).filter(Boolean);
  if (emails.length === 0) return [];
  const agents = await prisma.agent.findMany({
    where: { email: { in: emails } },
    select: { id: true },
  });
  return agents.map((agent) => agent.id);
}
