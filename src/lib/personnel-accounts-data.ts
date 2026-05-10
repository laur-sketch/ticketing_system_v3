import { ensureAgentRowForPortalStaff, pickCanonicalAgentForPortal } from "@/lib/admin-roster";
import type { UserRole } from "@/lib/auth";
import { findPortalByEmailOnly } from "@/lib/portal-account";
import { prisma } from "@/lib/prisma";
import { isStaffPortalRole } from "@/lib/staff-role";

export type PersonnelRosterRow = {
  agentId: string;
  name: string;
  email: string;
  username: string | null;
  teamId: string;
  teamName: string;
  portalAccountId: string;
  staffRole: string;
  accountStatus: string;
};

export type PersonnelAccountsPayload = {
  teams: { id: string; name: string }[];
  personnel: PersonnelRosterRow[];
  scopedCompanyTeamId: string | null;
  scopedCompanyName: string | null;
  scopeUnavailable: boolean;
  viewerMode: "superadmin" | "admin";
};

/**
 * Shared bundle for `/admin/personnel` and `GET /api/admin/accounts`.
 * Staff portal accounts with a designated company are auto-promoted to the agent
 * roster on read, eliminating any "awaiting team assignment" intermediate state.
 * SuperAdmin sees all teams + the full roster; Admin sees only their company queue.
 */
export async function loadPersonnelAccountsPayload(viewer: {
  role: UserRole;
  email: string | null | undefined;
}): Promise<PersonnelAccountsPayload> {
  const email = (viewer.email ?? "").trim().toLowerCase();
  const isSuperAdmin = viewer.role === "SuperAdmin";

  /**
   * Backfill: any staff portal with a designated company but no Agent row gets one
   * created on its team automatically. This keeps personnel always-promoted.
   */
  const staffWithCompany = await prisma.portalAccount.findMany({
    where: {
      role: { in: ["Admin", "Personnel"] },
      staffDesignatedCompanyId: { not: null },
    },
    select: {
      email: true,
      name: true,
      staffDesignatedCompanyId: true,
    },
  });
  for (const p of staffWithCompany) {
    if (!p.staffDesignatedCompanyId) continue;
    try {
      await ensureAgentRowForPortalStaff(
        { email: p.email, name: p.name },
        p.staffDesignatedCompanyId,
      );
    } catch (e) {
      console.error("ensureAgentRowForPortalStaff backfill failed", e);
    }
  }

  const [agents, teams, portalPersonnelRaw] = await Promise.all([
    prisma.agent.findMany({
      include: { team: true },
      orderBy: { name: "asc" },
    }),
    prisma.team.findMany({ orderBy: { name: "asc" } }),
    prisma.portalAccount.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        passwordHash: true,
        accountStatus: true,
        role: true,
        staffDesignatedCompanyId: true,
        staffDesignatedCompany: { select: { id: true, name: true } },
      },
    }),
  ]);

  const portalPersonnel = portalPersonnelRaw.filter((p) => isStaffPortalRole(p.role));

  const personnel: PersonnelRosterRow[] = portalPersonnel
    .map((p) => {
      const a = pickCanonicalAgentForPortal(p, agents);
      if (!a?.team) return null;
      return {
        agentId: a.id,
        name: a.name,
        email: p.email.trim().toLowerCase(),
        username: p.username,
        teamId: a.teamId,
        teamName: a.team.name,
        portalAccountId: p.id,
        staffRole: p.role,
        accountStatus: p.accountStatus ?? "ACTIVE",
      };
    })
    .filter((row): row is PersonnelRosterRow => row !== null);

  if (isSuperAdmin) {
    return {
      teams,
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
  const scopedName =
    companyTeam?.name ?? portal?.staffDesignatedCompanyName ?? null;

  return {
    teams: teams.filter((t) => t.id === scopeId),
    personnel: personnel.filter((row) => row.teamId === scopeId),
    scopedCompanyTeamId: scopeId,
    scopedCompanyName: scopedName,
    scopeUnavailable: false,
    viewerMode: "admin",
  };
}
