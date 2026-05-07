import type { Prisma } from "@prisma/client";
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

export async function findSessionAgentId(identity: SessionIdentity) {
  const where = whereFromIdentity(identity);
  if (!where) return null;
  return prisma.agent.findFirst({ where, select: { id: true } });
}

export async function findSessionAgentWithTeam(identity: SessionIdentity) {
  const where = whereFromIdentity(identity);
  if (!where) return null;
  return prisma.agent.findFirst({ where, include: { team: true } });
}
