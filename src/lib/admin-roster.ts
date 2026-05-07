import type { Agent, Team } from "@prisma/client";

/** Normalize display name for loose matching (same as personnel screens). */
export function normalizePersonName(v: string) {
  return v.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Same identity check as pickCanonicalAgentForPortal (email first, then normalized name). */
export function agentMatchesPortalStaff<
  T extends { id: string; email: string; name: string },
>(portal: { email: string; name: string }, agent: T): boolean {
  const pe = portal.email.trim().toLowerCase();
  return (
    agent.email.trim().toLowerCase() === pe ||
    normalizePersonName(agent.name) === normalizePersonName(portal.name)
  );
}

export type AgentWithTeam = Agent & { team: Team };

/**
 * When portal email was updated or a second Agent row was created by name match only,
 * multiple Agent rows can refer to the same staff person. Pick a single canonical row.
 */
export function pickCanonicalAgentForPortal<
  T extends { id: string; email: string; name: string; createdAt: Date },
>(portal: { email: string; name: string }, agents: T[]): T | null {
  const matching = agents.filter((a) => agentMatchesPortalStaff(portal, a));
  if (matching.length === 0) return null;
  if (matching.length === 1) return matching[0];
  const pe = portal.email.trim().toLowerCase();
  const emailHit = matching.find((a) => a.email.trim().toLowerCase() === pe);
  return (
    emailHit ??
    matching.slice().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]
  );
}

export function portalStaffHasAgentRow<
  T extends { id: string; email: string; name: string; createdAt: Date },
>(portal: { email: string; name: string }, agents: T[]): boolean {
  return pickCanonicalAgentForPortal(portal, agents) !== null;
}
