import { findPortalByEmailOnly } from "@/lib/portal-account";
import { loadPortalStaffAssignmentColorMap } from "@/lib/portal-staff-assignment-color-sql";
import { MERGED_SOURCE_DATABASE } from "@/lib/merged-database-sources";
import { mapHrisToPortalRole } from "@/lib/auth/role-mapping";
import type { UserRole } from "@/lib/auth";
import { prismaPrimary, prismaSecondary } from "@/lib/prisma";
import { normalizePersonName } from "@/lib/person-name";
import { normalizePortalRole } from "@/lib/staff-role";

export type PersonnelRosterRow = {
  /** HRIS / merged_users primary key */
  mergedSourceUserId: string;
  /** Linked ticketing agent when progress can be attributed (optional). */
  agentId: string | null;
  name: string;
  email: string;
  username: string | null;
  teamId: string;
  teamName: string;
  /** Linked portal profile id when present (colors / auth projection). */
  portalAccountId: string | null;
  staffRole: string;
  accountStatus: string;
  staffAssignmentColor: string | null;
  /** Overall KPI % from merged_kpi_user_averages (synced from PG). */
  kpiOverallPercent: number | null;
  kpiAveragePercent: number | null;
};

export type PersonnelAccountsPayload = {
  teams: { id: string; name: string }[];
  personnel: PersonnelRosterRow[];
  scopedCompanyTeamId: string | null;
  scopedCompanyName: string | null;
  scopeUnavailable: boolean;
  viewerMode: "superadmin" | "admin";
};

type MergedStaffRow = {
  source_user_id: bigint;
  name: string;
  username: string | null;
  email: string | null;
  role: string;
  company_name: string | null;
  position: string | null;
  department: string | null;
  is_active: number | boolean;
};

type KpiAvgRow = {
  source_user_id: bigint;
  overall_percent: number;
  average_percent: number;
};

function resolveHrisSourceTag(): string {
  return (
    process.env.HRIS_MERGE_SOURCE_TAG?.trim() ||
    process.env.HRIS_MERGE_SOURCE_DB?.trim() ||
    MERGED_SOURCE_DATABASE.HRIS_DEMO
  );
}

function companyKey(name: string | null | undefined): string {
  return normalizePersonName(name ?? "");
}

function matchTeamId(
  companyName: string | null,
  teams: Array<{ id: string; name: string }>,
): { teamId: string; teamName: string } {
  const display = companyName?.trim() || "Unassigned";
  const key = companyKey(display);
  if (!key || key === "unassigned") {
    return { teamId: "company:unassigned", teamName: "Unassigned" };
  }
  const exact = teams.find((t) => companyKey(t.name) === key);
  if (exact) return { teamId: exact.id, teamName: exact.name };
  const loose = teams.find((t) => {
    const tk = companyKey(t.name);
    return tk.includes(key) || key.includes(tk);
  });
  if (loose) return { teamId: loose.id, teamName: loose.name };
  return { teamId: `company:${key.replace(/\s+/g, "-")}`, teamName: display };
}

function personTokens(name: string): Set<string> {
  return new Set(
    normalizePersonName(name)
      .replace(/[,.]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1),
  );
}

function scoreNames(a: string, b: string): number {
  const at = personTokens(a);
  const bt = personTokens(b);
  return [...at].filter((t) => bt.has(t)).length;
}

/**
 * Personnel roster from mergedatabase (hrisdemo users).
 * PostgreSQL portal/agent rows are not listed — only used to attach
 * assignment color / optional agent link for synced progress.
 */
export async function loadPersonnelAccountsPayload(viewer: {
  role: UserRole;
  email: string | null | undefined;
}): Promise<PersonnelAccountsPayload> {
  const email = (viewer.email ?? "").trim().toLowerCase();
  const isSuperAdmin = viewer.role === "SuperAdmin";
  const sourceTag = resolveHrisSourceTag();

  const [teams, agents, portals, mergedUsers, kpiAverages] = await Promise.all([
    prismaPrimary.team.findMany({ orderBy: { name: "asc" } }),
    prismaPrimary.agent.findMany({ select: { id: true, email: true, name: true } }),
    prismaPrimary.portalAccount.findMany({
      where: {
        accountStatus: { not: "LEGACY_CONFLICT" },
        mergedSourceUserId: { not: null },
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        mergedSourceUserId: true,
        accountStatus: true,
        staffDesignatedCompanyId: true,
      },
    }),
    prismaSecondary.$queryRaw<MergedStaffRow[]>`
      SELECT
        source_user_id, name, username, email, role, company_name, position, department, is_active
      FROM merged_users
      WHERE is_active = 1
        AND source_database = ${sourceTag}
      ORDER BY name ASC
    `,
    prismaSecondary.$queryRaw<KpiAvgRow[]>`
      SELECT source_user_id, overall_percent, average_percent
      FROM merged_kpi_user_averages
    `,
  ]);

  const colorByPortalId = await loadPortalStaffAssignmentColorMap();
  const portalByMergedId = new Map(
    portals
      .filter((p) => p.mergedSourceUserId != null)
      .map((p) => [p.mergedSourceUserId!.toString(), p]),
  );
  const kpiByMergedId = new Map(
    kpiAverages.map((k) => [
      k.source_user_id.toString(),
      { overall: k.overall_percent, average: k.average_percent },
    ]),
  );

  const personnel: PersonnelRosterRow[] = mergedUsers.map((m) => {
    const id = m.source_user_id.toString();
    const portal = portalByMergedId.get(id) ?? null;
    const company = matchTeamId(m.company_name, teams);
    const mapped = mapHrisToPortalRole({
      hrisRole: m.role,
      position: m.position,
      department: m.department,
    });
    // Prefer SuperAdmin-managed portal role when a linked profile exists.
    const portalRole =
      (portal ? normalizePortalRole(portal.role) : null) ?? mapped.portalRole;

    // Optional: link a PG agent by email or name for ops/progress attribution.
    const emailNeedle = (m.email ?? portal?.email ?? "").trim().toLowerCase();
    let agent =
      emailNeedle.length > 0
        ? agents.find((a) => a.email.trim().toLowerCase() === emailNeedle) ?? null
        : null;
    if (!agent) {
      let best = 0;
      for (const a of agents) {
        const score = scoreNames(m.name, a.name);
        if (score >= 2 && score > best) {
          best = score;
          agent = a;
        }
      }
    }

    const kpi = kpiByMergedId.get(id) ?? null;
    return {
      mergedSourceUserId: id,
      agentId: agent?.id ?? null,
      name: m.name,
      email: (m.email ?? portal?.email ?? "").trim().toLowerCase() || `${m.username ?? id}@hris.merged`,
      username: m.username,
      teamId: company.teamId,
      teamName: company.teamName,
      portalAccountId: portal?.id ?? null,
      staffRole: portalRole,
      accountStatus: portal?.accountStatus ?? (m.is_active ? "ACTIVE" : "INACTIVE"),
      staffAssignmentColor: portal ? colorByPortalId.get(portal.id) ?? null : null,
      kpiOverallPercent: kpi?.overall ?? null,
      kpiAveragePercent: kpi?.average ?? null,
    };
  });

  // Company list for filters: prefer real teams, plus any HRIS-only companies.
  const companyNames = new Map<string, { id: string; name: string }>();
  for (const t of teams) companyNames.set(t.id, t);
  for (const row of personnel) {
    if (!companyNames.has(row.teamId)) {
      companyNames.set(row.teamId, { id: row.teamId, name: row.teamName });
    }
  }
  const companies = [...companyNames.values()].sort((a, b) => a.name.localeCompare(b.name));

  if (isSuperAdmin) {
    return {
      teams: companies,
      personnel,
      scopedCompanyTeamId: null,
      scopedCompanyName: null,
      scopeUnavailable: false,
      viewerMode: "superadmin",
    };
  }

  const portal = email ? await findPortalByEmailOnly(email) : null;
  const scopeId = portal?.staffDesignatedCompanyId ?? null;
  if (!scopeId) {
    return {
      teams: [],
      personnel: [],
      scopedCompanyTeamId: null,
      scopedCompanyName: null,
      scopeUnavailable: true,
      viewerMode: "admin",
    };
  }

  const companyTeam = teams.find((t) => t.id === scopeId);
  const scopedName = companyTeam?.name ?? portal?.staffDesignatedCompanyName ?? null;
  const scopedKey = companyKey(scopedName);

  return {
    teams: companies.filter((t) => t.id === scopeId || companyKey(t.name) === scopedKey),
    personnel: personnel.filter(
      (row) => row.teamId === scopeId || companyKey(row.teamName) === scopedKey,
    ),
    scopedCompanyTeamId: scopeId,
    scopedCompanyName: scopedName,
    scopeUnavailable: false,
    viewerMode: "admin",
  };
}
