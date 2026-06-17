import type { Prisma } from "@prisma/client";
import { pickCanonicalAgentForPortal } from "@/lib/admin-roster";
import { prisma } from "@/lib/prisma";

type SessionIdentity = {
  email?: string | null;
  name?: string | null;
};

function whereFromIdentity(identity: SessionIdentity): Prisma.AgentWhereInput | undefined {
  const normalizedEmail = (identity.email ?? "").trim().toLowerCase();
  const normalizedName = (identity.name ?? "").trim();
  if (!normalizedEmail && !normalizedName) return undefined;
  return {
    OR: [
      normalizedEmail ? { email: normalizedEmail } : undefined,
      normalizedName ? { name: normalizedName } : undefined,
    ].filter(Boolean) as Prisma.AgentWhereInput[],
  };
}

async function findMatchingSessionAgents(identity: SessionIdentity) {
  const where = whereFromIdentity(identity);
  if (!where) return [];
  return prisma.agent.findMany({
    where,
    orderBy: { createdAt: "asc" },
  });
}

function pickSessionAgent<T extends { id: string; email: string; name: string; createdAt: Date }>(
  identity: SessionIdentity,
  agents: T[],
): T | null {
  if (agents.length === 0) return null;
  if (agents.length === 1) return agents[0];
  return pickCanonicalAgentForPortal(
    { email: identity.email ?? "", name: identity.name ?? "" },
    agents,
  );
}

export async function findSessionAgentId(identity: SessionIdentity) {
  const agent = pickSessionAgent(identity, await findMatchingSessionAgents(identity));
  return agent ? { id: agent.id } : null;
}

export async function findSessionAgentWithTeam(identity: SessionIdentity) {
  const where = whereFromIdentity(identity);
  if (!where) return null;
  const agents = await prisma.agent.findMany({
    where,
    include: { team: true },
    orderBy: { createdAt: "asc" },
  });
  return pickSessionAgent(identity, agents);
}
