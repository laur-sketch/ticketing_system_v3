import { prisma } from "@/lib/prisma";

/** Portal designated company for an agent, with same-name portal-linked peer fallback. */
export async function resolveAgentDesignatedCompanyId(agentId: string): Promise<string | null> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { id: true, email: true, name: true },
  });
  if (!agent) return null;

  const email = agent.email.trim().toLowerCase();
  if (email) {
    const portal = await prisma.portalAccount.findFirst({
      where: {
        email: { equals: email, mode: "insensitive" },
        staffDesignatedCompanyId: { not: null },
      },
      select: { staffDesignatedCompanyId: true },
    });
    if (portal?.staffDesignatedCompanyId) return portal.staffDesignatedCompanyId;
  }

  const name = agent.name.trim();
  if (!name) return null;

  const peers = await prisma.agent.findMany({
    where: {
      name: { equals: name, mode: "insensitive" },
      NOT: { id: agent.id },
    },
    select: { email: true },
    take: 10,
  });
  for (const peer of peers) {
    const peerEmail = peer.email.trim().toLowerCase();
    if (!peerEmail) continue;
    const peerPortal = await prisma.portalAccount.findFirst({
      where: {
        email: { equals: peerEmail, mode: "insensitive" },
        staffDesignatedCompanyId: { not: null },
      },
      select: { staffDesignatedCompanyId: true },
    });
    if (peerPortal?.staffDesignatedCompanyId) return peerPortal.staffDesignatedCompanyId;
  }
  return null;
}

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
