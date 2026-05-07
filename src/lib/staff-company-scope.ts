import { prisma } from "@/lib/prisma";

/**
 * Company queue (Team id) used to scope Admin assignment / board visibility.
 * Prefers portal staffDesignatedCompanyId; falls back to agent roster team.
 */
export async function resolveStaffCompanyTeamId(email: string | null | undefined): Promise<string | null> {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return null;
  const portal = await prisma.portalAccount.findFirst({
    where: { email: { equals: e, mode: "insensitive" } },
    select: { staffDesignatedCompanyId: true },
  });
  if (portal?.staffDesignatedCompanyId) return portal.staffDesignatedCompanyId;
  const agent = await prisma.agent.findFirst({
    where: { email: { equals: e, mode: "insensitive" } },
    select: { teamId: true },
  });
  return agent?.teamId ?? null;
}
