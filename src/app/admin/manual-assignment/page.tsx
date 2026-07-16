import type { Prisma, TicketStatus } from "@prisma/client/primary";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/access";
import { rosterTeamNameFilter, sortByRosterOrder } from "@/lib/company-roster";
import { resolveHrisSourceTags } from "@/lib/merged-database-sources";
import { prisma, prismaSecondary } from "@/lib/prisma";
import { portalCompanyAdminPrivilegesForEmail } from "@/lib/portal-staff";
import { isStaffPortalRole, normalizePortalRole } from "@/lib/staff-role";
import { loadStaffAssignmentColorsForAgents } from "@/lib/assignee-assignment-color";
import {
  buildCanonicalMergedIdMap,
  canonicalMergedId,
} from "@/lib/sync/merged-person-identity";
import { ManualAssignmentBoard } from "./ui";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "PENDING_INFO", "ESCALATED"];

export default async function ManualAssignmentPage() {
  const session = await requireSession();
  if (!session?.user) redirect("/signin");
  if (!["SuperAdmin", "Admin", "Personnel"].includes(session.user.role)) redirect("/");

  const meEmail = (session.user.email ?? "").trim().toLowerCase();
  /**
   * Personnel (company coordinators) stay locked to their designated SBU — no roster filter.
   * SuperAdmin and JWT Admin use the company dropdown to narrow unassigned tickets and personnel lanes.
   */
  const isPersonnelCompanyLock = session.user.role === "Personnel";
  let scopedCompanyFilterTeamId: string | null = null;
  let scopedCompanyFilterLabel: string | null = null;

  if (isPersonnelCompanyLock) {
    const mePortal = await prisma.portalAccount.findFirst({
      where: { email: { equals: meEmail, mode: "insensitive" } },
      select: {
        staffDesignatedCompanyId: true,
        companyId: true,
        staffDesignatedCompany: { select: { name: true } },
        company: { select: { name: true } },
      },
    });

    scopedCompanyFilterTeamId = mePortal?.staffDesignatedCompanyId ?? mePortal?.companyId ?? null;
    scopedCompanyFilterLabel =
      mePortal?.staffDesignatedCompany?.name?.trim() ?? mePortal?.company?.name?.trim() ?? null;
  }
  /**
   * Company-scoped roles without a designated company should land on an empty
   * board with a notice rather than seeing everyone.
   */
  const scopeUnavailable = isPersonnelCompanyLock && !scopedCompanyFilterTeamId;

  if (!["SuperAdmin", "Admin"].includes(session.user.role)) {
    const normalizedEmail = (session.user.email ?? "").trim().toLowerCase();
    const normalizedName = (session.user.name ?? "").trim();
    const operator = await prisma.agent.findFirst({
      where: {
        OR: [
          normalizedEmail ? { email: normalizedEmail } : undefined,
          normalizedName ? { name: normalizedName } : undefined,
        ].filter(Boolean) as Prisma.AgentWhereInput[],
      },
      include: { team: true },
    });
    const companyCoordinator = await portalCompanyAdminPrivilegesForEmail(session.user.email);
    if (!operator || !companyCoordinator) {
      redirect("/agent");
    }
  }

  const [teams, companyTeams, unassigned, portalStaff] = await Promise.all([
    prisma.team.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.team.findMany({
      where: rosterTeamNameFilter(),
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.ticket.findMany({
      where: {
        status: { in: ACTIVE_STATUSES },
        assignedAgentId: null,
        ...(scopedCompanyFilterTeamId ? { teamId: scopedCompanyFilterTeamId } : {}),
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        description: true,
        priority: true,
        updatedAt: true,
        teamId: true,
      },
    }),
    prisma.portalAccount.findMany({
      select: {
        email: true,
        name: true,
        role: true,
        headPrivileges: true,
        mergedSourceUserId: true,
        staffDesignatedCompanyId: true,
        companyId: true,
        staffDesignatedCompany: { select: { name: true } },
        company: { select: { name: true } },
      },
    }),
  ]);
  const orderedCompanyTeams = sortByRosterOrder(companyTeams);
  /** Personnel stay locked to their designated SBU; SuperAdmin/Admin see all companies in the board UI. */
  const personnelScopeCompanyId = isPersonnelCompanyLock ? scopedCompanyFilterTeamId : null;
  const effectiveCompanyFilterLabel = isPersonnelCompanyLock ? scopedCompanyFilterLabel : null;
  /**
   * Company/SBU filter narrows **personnel lanes** only. The unassigned pool stays
   * all active unassigned tickets (for SuperAdmin/Admin) so coordinators still see
   * every queue; Personnel already receive a company-scoped `unassigned` query above.
   */
  const scopedUnassigned = scopeUnavailable ? [] : unassigned;

  const defaultTeamId =
    teams.find((t) => t.name.toLowerCase().includes("general"))?.id ??
    teams[0]?.id ??
    null;
  /**
   * Board lanes show only people who exist in the mergedatabase-demo HRIS roster
   * (merged_users, source = HRIS). Portal accounts are matched by their merged
   * link or email; synthetic duplicate ids canonicalize to the HRIS person.
   */
  const hrisSourceTags = new Set(resolveHrisSourceTags());
  const mergedRows = await prismaSecondary.$queryRaw<
    Array<{ source_user_id: bigint; name: string; email: string | null; source_database: string }>
  >`
    SELECT source_user_id, name, email, source_database
    FROM merged_users
    WHERE is_active = 1
  `;
  const canonicalMap = buildCanonicalMergedIdMap(
    mergedRows.map((r) => ({ sourceUserId: r.source_user_id, name: r.name, email: r.email })),
  );
  const hrisMergedIds = new Set(
    mergedRows
      .filter((r) => hrisSourceTags.has(r.source_database))
      .map((r) => r.source_user_id.toString()),
  );
  const mergedIdByEmail = new Map<string, bigint>();
  for (const r of mergedRows) {
    const email = r.email?.trim().toLowerCase();
    if (email && !mergedIdByEmail.has(email)) {
      mergedIdByEmail.set(email, canonicalMergedId(r.source_user_id, canonicalMap));
    }
  }
  const isMergedHrisPerson = (p: { mergedSourceUserId: bigint | null; email: string }) => {
    if (
      p.mergedSourceUserId != null &&
      hrisMergedIds.has(canonicalMergedId(p.mergedSourceUserId, canonicalMap).toString())
    ) {
      return true;
    }
    const byEmail = mergedIdByEmail.get(p.email.trim().toLowerCase());
    return byEmail != null && hrisMergedIds.has(byEmail.toString());
  };

  /**
   * SBU filter uses **staff designation only** (`staffDesignatedCompanyId`).
   * Do not fall back to `companyId` — that is the customer/signup company and stays out of sync,
   * which caused personnel moved to ALI to still appear under AGC.
   */
  const staffPortal = portalStaff.filter((p) => {
    if (!isStaffPortalRole(p.role)) return false;
    if (scopeUnavailable) return false;
    if (!isMergedHrisPerson(p)) return false;
    if (!personnelScopeCompanyId) return true;
    return p.staffDesignatedCompanyId === personnelScopeCompanyId;
  });
  const normalizeName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

  /**
   * One lane per merged person: group staff portals by canonical merged id so a
   * person with several legacy portal emails gets a single lane and we never
   * auto-create a duplicate agent for their secondary email.
   */
  const personKeyFor = (p: { mergedSourceUserId: bigint | null; email: string }) => {
    if (p.mergedSourceUserId != null) {
      return `id:${canonicalMergedId(p.mergedSourceUserId, canonicalMap)}`;
    }
    const byEmail = mergedIdByEmail.get(p.email.trim().toLowerCase());
    return byEmail != null ? `id:${byEmail}` : `email:${p.email.trim().toLowerCase()}`;
  };
  const personPortals = new Map<string, typeof staffPortal>();
  for (const p of staffPortal) {
    const key = personKeyFor(p);
    personPortals.set(key, [...(personPortals.get(key) ?? []), p]);
  }

  const allAgents = await prisma.agent.findMany({
    select: { id: true, email: true, name: true },
  });
  const agentIdByEmail = new Map(allAgents.map((a) => [a.email.trim().toLowerCase(), a.id]));
  const agentIdByName = new Map<string, string>();
  for (const a of allAgents) {
    const key = normalizeName(a.name);
    if (key && !agentIdByName.has(key)) agentIdByName.set(key, a.id);
  }

  const laneAgentIds = new Set<string>();
  for (const portals of personPortals.values()) {
    const emails = portals.map((p) => p.email.trim().toLowerCase()).filter(Boolean);
    const emailHit = emails.find((e) => agentIdByEmail.has(e));
    if (emailHit) {
      laneAgentIds.add(agentIdByEmail.get(emailHit)!);
      continue;
    }
    const nameHit = portals
      .map((p) => agentIdByName.get(normalizeName(p.name)))
      .find((id): id is string => Boolean(id));
    if (nameHit) {
      laneAgentIds.add(nameHit);
      continue;
    }
    if (!defaultTeamId) continue;
    const primary = portals[0]!;
    const created = await prisma.agent
      .create({
        data: {
          name: primary.name,
          email: primary.email.trim().toLowerCase(),
          teamId: defaultTeamId,
        },
      })
      .catch(() => null);
    if (created) laneAgentIds.add(created.id);
  }

  const personnelAgents = laneAgentIds.size
    ? await prisma.agent.findMany({
        where: { id: { in: [...laneAgentIds] } },
        orderBy: { name: "asc" },
        include: { team: true },
      })
    : [];
  const portalByEmail = new Map(portalStaff.map((p) => [p.email.trim().toLowerCase(), p]));

  const assigneeColorByEmail = await loadStaffAssignmentColorsForAgents(
    personnelAgents.map((a) => ({ email: a.email, name: a.name })),
  );

  const agentsForBoard = personnelAgents;

  const assignedByAgent = await prisma.ticket.findMany({
    where: {
      status: { in: ACTIVE_STATUSES },
      assignedAgentId: { in: agentsForBoard.map((a) => a.id) },
      ...(personnelScopeCompanyId ? { teamId: personnelScopeCompanyId } : {}),
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      description: true,
      priority: true,
      updatedAt: true,
      assignedAgentId: true,
    },
  });
  const grouped = new Map<string, typeof assignedByAgent>();
  for (const t of assignedByAgent) {
    const key = t.assignedAgentId ?? "";
    grouped.set(key, [...(grouped.get(key) ?? []), t]);
  }

  const personnel = agentsForBoard.map((a) => {
    const tickets = grouped.get(a.id) ?? [];
    const portalRow =
      portalByEmail.get(a.email.trim().toLowerCase()) ??
      portalStaff.find((p) => normalizeName(p.name) === normalizeName(a.name));
    const roleLabel = normalizePortalRole(portalRow?.role ?? "") ?? "Personnel";
    const teamLabel =
      portalRow?.staffDesignatedCompany?.name?.trim() ||
      portalRow?.company?.name?.trim() ||
      a.team?.name ||
      "Unassigned company/SBU";
    return {
      agentId: a.id,
      name: a.name,
      role: roleLabel,
      teamLabel,
      companyId: portalRow?.staffDesignatedCompanyId ?? null,
      assigneeColorKey: assigneeColorByEmail.get(a.email.trim().toLowerCase()) ?? null,
      cards: tickets.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        title: t.title,
        description: t.description,
        priority: t.priority,
        updatedAt: t.updatedAt.toISOString(),
      })),
    };
  });

  return (
    <ManualAssignmentBoard
      companyFilterLabel={effectiveCompanyFilterLabel}
      showCompanyFilter={!isPersonnelCompanyLock}
      rosterCompanies={orderedCompanyTeams.map((t) => ({ id: t.id, name: t.name }))}
      notice={
        scopeUnavailable
          ? "Your portal account doesn't have a designated company yet. A SuperAdmin can set one in Personnel → Portal Accounts so you can see your team's lanes."
          : null
      }
      unassigned={scopedUnassigned.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        title: t.title,
        description: t.description,
        priority: t.priority,
        updatedAt: t.updatedAt.toISOString(),
      }))}
      personnel={personnel}
    />
  );
}
