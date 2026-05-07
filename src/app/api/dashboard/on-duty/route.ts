import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { onDutyCompanyLine, resolveStaffOnDutyAgentIds } from "@/lib/on-duty-company-line";
import { prisma } from "@/lib/prisma";
import { withTtlCache } from "@/lib/ttl-cache";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { unauthorized } = await requireRole(["Admin", "Personnel"]);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(req.url);
  const pageSize = 2;
  const pageRaw = Number.parseInt(searchParams.get("page") ?? "1", 10) || 1;
  const result = await withTtlCache(`on-duty:${pageRaw}`, 10_000, async () => {
    const [allAgents, portalAccounts] = await Promise.all([
      prisma.agent.findMany({
        orderBy: { createdAt: "asc" },
        select: { id: true, email: true, name: true, createdAt: true },
      }),
      prisma.portalAccount.findMany({
        select: {
          email: true,
          name: true,
          role: true,
          staffDesignatedCompany: { select: { name: true } },
        },
      }),
    ]);

    const dutyIds = resolveStaffOnDutyAgentIds(portalAccounts, allAgents);
    const total = dutyIds.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(totalPages, Math.max(1, pageRaw));

    const agents =
      dutyIds.length === 0
        ? []
        : await prisma.agent.findMany({
            where: { id: { in: dutyIds } },
            orderBy: { name: "asc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: {
              team: true,
              tickets: {
                select: { updatedAt: true },
                orderBy: { updatedAt: "desc" },
                take: 1,
              },
            },
          });

    const onlineWindowMs = 15 * 60 * 1000;
    const now = Date.now();
    return {
      page,
      totalPages,
      agents: agents.map((a) => ({
        id: a.id,
        name: a.name,
        companyName: onDutyCompanyLine(a, a.team?.name, portalAccounts, allAgents),
        isOnline:
          !!a.tickets[0]?.updatedAt &&
          now - new Date(a.tickets[0].updatedAt).getTime() <= onlineWindowMs,
      })),
    };
  });
  return NextResponse.json(result, {
    headers: { "cache-control": "private, max-age=10, stale-while-revalidate=20" },
  });
}
