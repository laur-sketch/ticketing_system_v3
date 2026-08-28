/** Server-only Job Order worker queries (Prisma). */

import { prisma } from "@/lib/prisma";

/**
 * Linked Task Board project ids where the agent is a JO co-worker (Field Assignment-style visibility).
 */
export async function kpiIdsWhereAgentIsJobOrderWorker(
  agentId: string | null | undefined,
): Promise<Set<string>> {
  const id = agentId?.trim();
  if (!id) return new Set();
  const rows = await prisma.$queryRaw<Array<{ linked_kpi_maintenance_id: string | null }>>`
    SELECT linked_kpi_maintenance_id
    FROM tickets
    WHERE request_type = 'JOB_ORDER'
      AND linked_kpi_maintenance_id IS NOT NULL
      AND job_order_approval_meta->'workerAgentIds' @> ${JSON.stringify([id])}::jsonb
  `;
  return new Set(
    rows
      .map((row) => row.linked_kpi_maintenance_id?.trim())
      .filter((value): value is string => Boolean(value)),
  );
}
