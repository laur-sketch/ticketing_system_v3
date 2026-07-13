import { Prisma } from "@prisma/client/primary";
import { agentMatchesPortalStaff, pickCanonicalAgentForPortal } from "@/lib/admin-roster";
import { prisma } from "@/lib/prisma";

export type PortalAgentDuplicateMapping = {
  portalEmail: string;
  portalName: string;
  portalRole: string;
  canonicalId: string;
  canonicalEmail: string;
  staleId: string;
  staleEmail: string;
};

export function listPortalAgentDuplicateMappings(
  portals: Array<{ email: string; name: string; role: string }>,
  agents: Array<{ id: string; email: string; name: string; createdAt: Date }>,
): PortalAgentDuplicateMapping[] {
  const out: PortalAgentDuplicateMapping[] = [];
  for (const portal of portals) {
    const matching = agents.filter((agent) => agentMatchesPortalStaff(portal, agent));
    if (matching.length <= 1) continue;
    const canonical = pickCanonicalAgentForPortal(portal, agents);
    if (!canonical) continue;
    for (const stale of matching) {
      if (stale.id === canonical.id) continue;
      out.push({
        portalEmail: portal.email,
        portalName: portal.name,
        portalRole: portal.role,
        canonicalId: canonical.id,
        canonicalEmail: canonical.email,
        staleId: stale.id,
        staleEmail: stale.email,
      });
    }
  }
  return out;
}

function replaceAssignedAgentIdInJson(
  value: unknown,
  staleId: string,
  canonical: { id: string; name: string },
): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((entry) => replaceAssignedAgentIdInJson(entry, staleId, canonical));
  }
  if (typeof value !== "object") return value;
  const obj = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(obj)) {
    if (key === "assignedAgentId" && raw === staleId) {
      next.assignedAgentId = canonical.id;
      next.assignedAgentName = canonical.name;
      continue;
    }
    next[key] = replaceAssignedAgentIdInJson(raw, staleId, canonical);
  }
  return next;
}

export async function listPortalAgentDuplicateMappingsFromDb() {
  const [portals, agents] = await Promise.all([
    prisma.portalAccount.findMany({
      where: { role: { in: ["Admin", "Personnel", "SuperAdmin"] } },
      select: { email: true, name: true, role: true },
    }),
    prisma.agent.findMany({ orderBy: { createdAt: "asc" } }),
  ]);
  return listPortalAgentDuplicateMappings(portals, agents);
}

export type ReconcileDuplicateAgentsResult = {
  mappings: PortalAgentDuplicateMapping[];
  ticketsUpdated: number;
  kpisUpdated: number;
  tasksUpdated: number;
  kpiSubAssigneeRowsUpdated: number;
  staleAgentsDeleted: number;
};

export async function reconcileDuplicateAgentRows(options?: { dryRun?: boolean }) {
  const dryRun = options?.dryRun ?? true;
  const mappings = await listPortalAgentDuplicateMappingsFromDb();
  const canonicalByStaleId = new Map(
    mappings.map((mapping) => [
      mapping.staleId,
      { id: mapping.canonicalId, name: mapping.portalName, email: mapping.canonicalEmail },
    ]),
  );

  let ticketsUpdated = 0;
  let kpisUpdated = 0;
  let tasksUpdated = 0;
  let kpiSubAssigneeRowsUpdated = 0;
  let staleAgentsDeleted = 0;

  for (const [staleId, canonical] of canonicalByStaleId) {
    if (!dryRun) {
      const ticketResult = await prisma.ticket.updateMany({
        where: { assignedAgentId: staleId },
        data: { assignedAgentId: canonical.id },
      });
      ticketsUpdated += ticketResult.count;

      const kpiResult = await prisma.kpiMaintenance.updateMany({
        where: { assignedAgentId: staleId },
        data: { assignedAgentId: canonical.id },
      });
      kpisUpdated += kpiResult.count;

      const taskResult = await prisma.taskItem.updateMany({
        where: { assignedAgentId: staleId },
        data: { assignedAgentId: canonical.id },
      });
      tasksUpdated += taskResult.count;
    } else {
      ticketsUpdated += await prisma.ticket.count({ where: { assignedAgentId: staleId } });
      kpisUpdated += await prisma.kpiMaintenance.count({ where: { assignedAgentId: staleId } });
      tasksUpdated += await prisma.taskItem.count({ where: { assignedAgentId: staleId } });
    }

    const kpiRows = await prisma.kpiMaintenance.findMany({
      where: { subKpis: { not: Prisma.DbNull } },
      select: { id: true, subKpis: true },
    });
    for (const row of kpiRows) {
      const raw = JSON.stringify(row.subKpis);
      if (!raw.includes(staleId)) continue;
      kpiSubAssigneeRowsUpdated += 1;
      if (!dryRun) {
        await prisma.kpiMaintenance.update({
          where: { id: row.id },
          data: {
            subKpis: replaceAssignedAgentIdInJson(row.subKpis, staleId, canonical) as Prisma.InputJsonValue,
          },
        });
      }
    }
  }

  for (const staleId of canonicalByStaleId.keys()) {
    const stillReferenced =
      (await prisma.ticket.count({ where: { assignedAgentId: staleId } })) +
      (await prisma.kpiMaintenance.count({ where: { assignedAgentId: staleId } })) +
      (await prisma.taskItem.count({ where: { assignedAgentId: staleId } }));
    const subKpiRows = await prisma.kpiMaintenance.findMany({
      where: { subKpis: { not: Prisma.DbNull } },
      select: { subKpis: true },
    });
    const stillInSubKpis = subKpiRows.some((row) => JSON.stringify(row.subKpis).includes(staleId));
    if (stillReferenced > 0 || stillInSubKpis) continue;
    staleAgentsDeleted += 1;
    if (!dryRun) {
      await prisma.agent.delete({ where: { id: staleId } });
    }
  }

  return {
    mappings,
    ticketsUpdated,
    kpisUpdated,
    tasksUpdated,
    kpiSubAssigneeRowsUpdated,
    staleAgentsDeleted,
  } satisfies ReconcileDuplicateAgentsResult;
}
