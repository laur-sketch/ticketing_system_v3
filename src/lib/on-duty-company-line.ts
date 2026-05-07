import { pickCanonicalAgentForPortal } from "@/lib/admin-roster";
import { isStaffPortalRole } from "@/lib/staff-role";

/** Second line for On Duty: portal staff-designated company when set, else queue team name. */
type AgentForMatch = { id: string; email: string; name: string; createdAt: Date };

export function onDutyCompanyLine(
  agent: { id: string },
  queueTeamName: string | null | undefined,
  portalAccounts: ReadonlyArray<{
    email: string;
    name: string;
    role: string;
    staffDesignatedCompany: { name: string } | null;
  }>,
  allAgents: AgentForMatch[],
): string {
  for (const p of portalAccounts) {
    if (!isStaffPortalRole(p.role)) continue;
    const canon = pickCanonicalAgentForPortal(p, allAgents);
    if (canon?.id === agent.id) {
      const designated = p.staffDesignatedCompany?.name?.trim();
      if (designated) return designated;
      break;
    }
  }
  return queueTeamName?.trim() || "General Queue";
}

/** Agent IDs linked to Head/Personnel portal accounts only (excludes Customer and stray Agent rows). */
export function resolveStaffOnDutyAgentIds(
  portalAccounts: ReadonlyArray<{ email: string; name: string; role: string }>,
  allAgents: AgentForMatch[],
): string[] {
  const ids = new Set<string>();
  for (const p of portalAccounts) {
    if (!isStaffPortalRole(p.role)) continue;
    const canon = pickCanonicalAgentForPortal(p, allAgents);
    if (canon) ids.add(canon.id);
  }
  return [...ids];
}
