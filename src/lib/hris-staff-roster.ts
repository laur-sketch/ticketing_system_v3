/**
 * HRIS-first staff roster for Assignment board, Task board assignees, and Activities.
 * Source of truth: merged_users (from HRIS). Portal/Agent rows are attached when present,
 * and Agent rows are created on demand so boards can assign work.
 */
import { pickCanonicalAgentForPortal } from "@/lib/admin-roster";
import { resolveRosterCompanyName } from "@/lib/hris-company-aliases";
import { resolveHrisSourceTags } from "@/lib/merged-database-sources";
import { prisma, prismaSecondary } from "@/lib/prisma";
import { ensureRosterTeamsInDb } from "@/lib/roster-teams";
import { isStaffPortalRole, normalizePortalRole } from "@/lib/staff-role";
import type { EffectiveAssignmentCompany } from "@/lib/staff-company-scope";
import {
  buildCanonicalMergedIdMap,
  canonicalMergedId,
} from "@/lib/sync/merged-person-identity";
import { Prisma } from "@prisma/client/secondary";

export type HrisAssignableStaff = {
  mergedSourceUserId: string;
  agentId: string;
  name: string;
  email: string;
  portalRole: string | null;
  headPrivileges: boolean;
  assignmentCompany: EffectiveAssignmentCompany | null;
  teamLabel: string;
};

type MergedRosterRow = {
  source_user_id: bigint;
  name: string;
  email: string | null;
  username: string | null;
  role: string;
  company_name: string | null;
  source_database: string;
};

function syntheticEmail(sourceUserId: string, username: string | null): string {
  const u = username?.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "") || sourceUserId;
  return `${u}@hris.merged`;
}

/**
 * Load active HRIS people from merged_users and ensure each has a primary Agent id
 * (create Agent under their roster Team when missing).
 */
export async function loadHrisAssignableStaff(options?: {
  /** Limit to one roster Team id (Personnel company lock / task filter). */
  companyTeamId?: string | null;
  /** Skip HRIS super_admin rows (default true — matches Activities). */
  excludeHrisSuperAdmin?: boolean;
}): Promise<HrisAssignableStaff[]> {
  const excludeSuper = options?.excludeHrisSuperAdmin !== false;
  const companyTeamId = options?.companyTeamId?.trim() || null;
  const sourceTags = resolveHrisSourceTags();

  await ensureRosterTeamsInDb();

  const [mergedRows, teams, portals, agents] = await Promise.all([
    prismaSecondary.$queryRaw<MergedRosterRow[]>`
      SELECT source_user_id, name, email, username, role, company_name, source_database
      FROM merged_users
      WHERE is_active = 1
        AND source_database IN (${Prisma.join(sourceTags)})
      ORDER BY name ASC
    `,
    prisma.team.findMany({ select: { id: true, name: true } }),
    prisma.portalAccount.findMany({
      where: { mergedSourceUserId: { not: null } },
      select: {
        email: true,
        name: true,
        role: true,
        headPrivileges: true,
        mergedSourceUserId: true,
        accountStatus: true,
        staffDesignatedCompanyId: true,
        staffDesignatedCompany: { select: { id: true, name: true } },
      },
    }),
    prisma.agent.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, name: true, createdAt: true, teamId: true },
    }),
  ]);

  const teamByName = new Map(teams.map((t) => [t.name.toLowerCase(), t]));
  const fallbackTeam =
    teams.find((t) => t.name === "OUTSIDE COMPANY") ??
    teams.find((t) => t.name.toLowerCase().includes("general")) ??
    teams[0] ??
    null;

  const canonicalMap = buildCanonicalMergedIdMap(
    mergedRows.map((r) => ({
      sourceUserId: r.source_user_id,
      name: r.name,
      email: r.email,
    })),
  );

  const portalByCanonicalId = new Map<string, (typeof portals)[number]>();
  for (const p of portals) {
    if (p.mergedSourceUserId == null) continue;
    if (p.accountStatus === "LEGACY_CONFLICT") continue;
    const key = canonicalMergedId(p.mergedSourceUserId, canonicalMap).toString();
    const existing = portalByCanonicalId.get(key);
    if (!existing || (isStaffPortalRole(p.role) && !isStaffPortalRole(existing.role))) {
      portalByCanonicalId.set(key, p);
    }
  }

  const agentByEmail = new Map(
    agents.map((a) => [a.email.trim().toLowerCase(), a] as const),
  );
  let mutableAgents = [...agents];

  const out: HrisAssignableStaff[] = [];
  const seenAgentIds = new Set<string>();

  for (const row of mergedRows) {
    if (excludeSuper && row.role === "super_admin") continue;

    const sourceKey = row.source_user_id.toString();
    const portal = portalByCanonicalId.get(sourceKey) ?? null;
    const rosterName = resolveRosterCompanyName(row.company_name);
    const team =
      (rosterName ? teamByName.get(rosterName.toLowerCase()) : null) ??
      portal?.staffDesignatedCompany ??
      fallbackTeam;

    if (companyTeamId && team?.id !== companyTeamId) continue;

    const email =
      (row.email ?? "").trim().toLowerCase() ||
      portal?.email.trim().toLowerCase() ||
      syntheticEmail(sourceKey, row.username);

    const candidates = [
      { email, name: row.name },
      ...(portal ? [{ email: portal.email, name: portal.name }] : []),
    ];

    let agent =
      candidates
        .map((c) => pickCanonicalAgentForPortal(c, mutableAgents))
        .find((a): a is NonNullable<typeof a> => a != null) ?? null;

    if (!agent && team) {
      try {
        const created = await prisma.agent.create({
          data: {
            name: row.name,
            email,
            teamId: team.id,
          },
          select: { id: true, email: true, name: true, createdAt: true, teamId: true },
        });
        agent = created;
        mutableAgents.push(created);
        agentByEmail.set(email, created);
      } catch {
        agent = agentByEmail.get(email) ?? null;
        if (!agent) {
          // Email collision under another name — fall back to any name match after reload.
          const refreshed = await prisma.agent.findMany({
            orderBy: { createdAt: "asc" },
            select: { id: true, email: true, name: true, createdAt: true, teamId: true },
          });
          mutableAgents = refreshed;
          agent = pickCanonicalAgentForPortal({ email, name: row.name }, refreshed);
        }
      }
    }

    if (!agent) continue;
    if (seenAgentIds.has(agent.id)) continue;
    seenAgentIds.add(agent.id);

    if (team && agent.teamId !== team.id) {
      await prisma.agent
        .update({ where: { id: agent.id }, data: { teamId: team.id } })
        .catch(() => null);
    }

    const assignmentCompany: EffectiveAssignmentCompany | null = team
      ? { id: team.id, name: team.name }
      : null;

    const portalRole =
      (portal && isStaffPortalRole(portal.role) ? normalizePortalRole(portal.role) : null) ??
      (row.role === "admin" || row.role === "hr" ? "Admin" : "Personnel");

    out.push({
      mergedSourceUserId: sourceKey,
      agentId: agent.id,
      name: row.name,
      email,
      portalRole,
      headPrivileges: portal?.headPrivileges ?? false,
      assignmentCompany,
      teamLabel: assignmentCompany?.name ?? "Unassigned company/SBU",
    });
  }

  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
