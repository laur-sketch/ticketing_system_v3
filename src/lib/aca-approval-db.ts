import { Prisma } from "@prisma/client/primary";
import { prisma } from "@/lib/prisma";
import { parseAcaApprovalMeta, type AcaApprovalMeta } from "@/lib/aca-approval";

export async function loadAcaApprovalMeta(ticketId: string): Promise<AcaApprovalMeta | null> {
  const rows = await prisma.$queryRaw<Array<{ aca_approval_meta: unknown }>>`
    SELECT aca_approval_meta FROM tickets WHERE id = ${ticketId} LIMIT 1
  `;
  const raw = rows[0]?.aca_approval_meta;
  if (raw == null) return null;
  return parseAcaApprovalMeta(raw);
}

export type SaveAcaApprovalMetaResult = { ok: true } | { ok: false; reason: "conflict" };

export async function saveAcaApprovalMeta(
  ticketId: string,
  meta: AcaApprovalMeta,
  expectedProceduralStep?: string | null,
): Promise<SaveAcaApprovalMetaResult> {
  const json = JSON.stringify(meta);
  if (expectedProceduralStep != null && expectedProceduralStep !== "") {
    const updated = await prisma.$executeRaw`
      UPDATE tickets
      SET aca_approval_meta = ${json}::jsonb
      WHERE id = ${ticketId}
        AND (
          aca_approval_meta IS NULL
          OR aca_approval_meta->>'proceduralStep' = ${expectedProceduralStep}
        )
    `;
    if (Number(updated) === 0) return { ok: false, reason: "conflict" };
    return { ok: true };
  }
  await prisma.$executeRaw`
    UPDATE tickets
    SET aca_approval_meta = ${json}::jsonb
    WHERE id = ${ticketId}
  `;
  return { ok: true };
}

export async function initAcaApprovalMetaIfNeeded(
  ticketId: string,
  seed?: AcaApprovalMeta,
): Promise<AcaApprovalMeta | null> {
  const existing = await loadAcaApprovalMeta(ticketId);
  if (existing) return existing;
  if (!seed) return null;
  await saveAcaApprovalMeta(ticketId, seed);
  return seed;
}

export async function loadAcaApprovalMetaMap(
  ticketIds: string[],
): Promise<Map<string, AcaApprovalMeta>> {
  const map = new Map<string, AcaApprovalMeta>();
  if (ticketIds.length === 0) return map;
  const rows = await prisma.$queryRaw<Array<{ id: string; aca_approval_meta: unknown }>>`
    SELECT id, aca_approval_meta
    FROM tickets
    WHERE id IN (${Prisma.join(ticketIds)})
      AND aca_approval_meta IS NOT NULL
  `;
  for (const row of rows) {
    const parsed = parseAcaApprovalMeta(row.aca_approval_meta);
    if (parsed) map.set(row.id, parsed);
  }
  return map;
}
