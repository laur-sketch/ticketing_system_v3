/**
 * Activities / On Duty roster: active personnel from the secondary merge DB
 * (merged_users is the source of truth for who exists, their name and company),
 * enriched with today's clock-in status from the merged attendance table.
 */

import { pickCanonicalAgentForPortal } from "@/lib/admin-roster";
import { resolveRosterCompanyName } from "@/lib/hris-company-aliases";
import {
  dutyStatusFromLatestClockIn,
  isOnDutyStatus,
  loadTodayClockInsBySourceUserId,
  type DutyStatus,
} from "@/lib/merged-duty-status";
import { resolveHrisSourceTags } from "@/lib/merged-database-sources";
import { prisma, prismaSecondary } from "@/lib/prisma";
import { isStaffPortalRole } from "@/lib/staff-role";
import {
  buildCanonicalMergedIdMap,
  canonicalMergedId,
} from "@/lib/sync/merged-person-identity";

export type OnDutyAgentSnapshot = {
  id: string;
  name: string;
  companyName: string;
  /** @deprecated Prefer `dutyStatus` / `isOnDuty` — kept for older clients. */
  isOnline: boolean;
  dutyStatus: DutyStatus;
  isOnDuty: boolean;
  /** Latest clock-in today from merged DB (ISO), or null. */
  lastClockInAt: string | null;
  lastActivity: string;
};

export type OnDutySnapshot = {
  agents: OnDutyAgentSnapshot[];
  page: number;
  totalPages: number;
  total: number;
  companies: string[];
  /** Count currently On Duty from merged clock-ins (full filtered set). */
  onDutyCount: number;
};

type LoadOnDutyOptions = {
  page?: number;
  pageSize?: number;
  companyFilter?: string;
  /** When true, only return personnel who are On Duty today. */
  onDutyOnly?: boolean;
};

function formatLastActivity(clockInAt: Date | null, dutyStatus: DutyStatus): string {
  if (!clockInAt || dutyStatus === "OFFLINE") return "No clock-in today";
  return `Clocked in ${clockInAt.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  })}`;
}

/** Company label straight from merged_users.company_name (personnel source of truth). */
function companyLabel(mergedCompanyName: string | null | undefined): string {
  const merged = mergedCompanyName?.trim();
  if (merged) return resolveRosterCompanyName(merged) ?? merged;
  return "Unassigned";
}

type MergedRosterRow = {
  source_user_id: bigint;
  name: string;
  email: string | null;
  role: string;
  company_name: string | null;
  source_database: string;
};

/**
 * Load the active merge-DB HRIS roster with today's clock-in status (PHT).
 * Primary portals/agents are used only to attach a stable agent id per person.
 */
export async function loadOnDutySnapshot(options: LoadOnDutyOptions = {}): Promise<OnDutySnapshot> {
  const pageSize = Math.min(48, Math.max(1, options.pageSize ?? 6));
  const pageRaw = Math.max(1, options.page ?? 1);
  const companyFilter = options.companyFilter?.trim() ?? "";
  const sourceTags = new Set(resolveHrisSourceTags());

  const [mergedRows, portals, agents] = await Promise.all([
    prismaSecondary.$queryRaw<MergedRosterRow[]>`
      SELECT source_user_id, name, email, role, company_name, source_database
      FROM merged_users
      WHERE is_active = 1
      ORDER BY name ASC
    `,
    prisma.portalAccount.findMany({
      where: { mergedSourceUserId: { not: null } },
      select: { email: true, name: true, mergedSourceUserId: true },
    }),
    prisma.agent.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, name: true, createdAt: true },
    }),
  ]);

  /** Roster = HRIS rows only; other merged rows (portal duplicates) map back via canonical ids. */
  const rosterRows = mergedRows.filter(
    (r) => sourceTags.has(r.source_database) && r.role !== "super_admin",
  );
  if (rosterRows.length === 0) {
    return { agents: [], page: 1, totalPages: 1, total: 0, companies: [], onDutyCount: 0 };
  }

  const canonicalMap = buildCanonicalMergedIdMap(
    mergedRows.map((r) => ({ sourceUserId: r.source_user_id, name: r.name, email: r.email })),
  );
  const portalsByCanonicalId = new Map<string, Array<{ email: string; name: string }>>();
  for (const p of portals) {
    if (p.mergedSourceUserId == null) continue;
    const key = canonicalMergedId(p.mergedSourceUserId, canonicalMap).toString();
    const list = portalsByCanonicalId.get(key) ?? [];
    list.push({ email: p.email, name: p.name });
    portalsByCanonicalId.set(key, list);
  }

  const clockInsToday = await loadTodayClockInsBySourceUserId(
    rosterRows.map((r) => r.source_user_id),
  );

  const allAgents: OnDutyAgentSnapshot[] = [];
  const seenIds = new Set<string>();

  for (const row of rosterRows) {
    const sourceKey = row.source_user_id.toString();

    /** Attach a primary agent id when one exists (by merged email, portal emails, or name). */
    const candidates = [
      ...(row.email?.trim() ? [{ email: row.email.trim().toLowerCase(), name: row.name }] : []),
      ...(portalsByCanonicalId.get(sourceKey) ?? []),
    ];
    let canon: { id: string } | null = null;
    for (const candidate of candidates) {
      canon = pickCanonicalAgentForPortal(candidate, agents);
      if (canon) break;
    }
    if (!canon) {
      canon = pickCanonicalAgentForPortal({ email: `${sourceKey}@hris.merged`, name: row.name }, agents);
    }

    const id = canon?.id ?? `merged:${sourceKey}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const lastClockIn = clockInsToday.get(sourceKey) ?? null;
    const dutyStatus = dutyStatusFromLatestClockIn(lastClockIn);
    const isOnDuty = isOnDutyStatus(dutyStatus);

    allAgents.push({
      id,
      name: row.name,
      companyName: companyLabel(row.company_name),
      isOnline: isOnDuty,
      dutyStatus,
      isOnDuty,
      lastClockInAt: lastClockIn?.toISOString() ?? null,
      lastActivity: formatLastActivity(lastClockIn, dutyStatus),
    });
  }

  allAgents.sort((a, b) => {
    if (a.isOnDuty !== b.isOnDuty) return a.isOnDuty ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const companies = [...new Set(allAgents.map((agent) => agent.companyName))].sort((a, b) =>
    a.localeCompare(b),
  );

  let filtered = companyFilter
    ? allAgents.filter((agent) => agent.companyName === companyFilter)
    : allAgents;

  if (options.onDutyOnly) {
    filtered = filtered.filter((agent) => agent.isOnDuty);
  }

  const onDutyCount = filtered.filter((a) => a.isOnDuty).length;
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(totalPages, pageRaw);
  const start = (page - 1) * pageSize;
  const pageAgents = filtered.slice(start, start + pageSize);

  return { agents: pageAgents, page, totalPages, total, companies, onDutyCount };
}

/**
 * Set of primary Agent IDs that are On Duty today (merged clock-in).
 * Used by `/api/agents` and assignment APIs.
 */
export async function loadOnDutyAgentIdSet(
  agentIds?: ReadonlyArray<string>,
): Promise<Set<string>> {
  const portals = await prisma.portalAccount.findMany({
    where: {
      mergedSourceUserId: { not: null },
      accountStatus: "ACTIVE",
      ...(agentIds && agentIds.length > 0
        ? undefined
        : { role: { in: ["Admin", "Personnel"] } }),
    },
    select: {
      email: true,
      name: true,
      role: true,
      mergedSourceUserId: true,
    },
  });

  const staff = portals.filter((p) => isStaffPortalRole(p.role) && p.mergedSourceUserId != null);
  if (staff.length === 0) return new Set();

  const agents = await prisma.agent.findMany({
    where:
      agentIds && agentIds.length > 0
        ? { id: { in: [...agentIds] } }
        : {
            email: {
              in: staff.map((p) => p.email.trim().toLowerCase()).filter(Boolean),
            },
          },
    select: { id: true, email: true, name: true, createdAt: true },
  });

  const clockIns = await loadTodayClockInsBySourceUserId(staff.map((p) => p.mergedSourceUserId!));
  const onDuty = new Set<string>();

  for (const portal of staff) {
    const key = portal.mergedSourceUserId!.toString();
    if (!clockIns.has(key)) continue;
    const canon = pickCanonicalAgentForPortal(portal, agents);
    if (canon) onDuty.add(canon.id);
  }
  return onDuty;
}

/** True when the agent is linked to HRIS and has a clock-in today in the merged DB. */
export async function isAgentOnDutyFromMergedDb(agentId: string): Promise<boolean> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { email: true, name: true, createdAt: true, id: true },
  });
  if (!agent) return false;

  const portals = await prisma.portalAccount.findMany({
    where: {
      mergedSourceUserId: { not: null },
      accountStatus: "ACTIVE",
      role: { in: ["Admin", "Personnel"] },
    },
    select: { email: true, name: true, role: true, mergedSourceUserId: true },
  });

  const match = portals.find((p) => {
    if (!isStaffPortalRole(p.role) || p.mergedSourceUserId == null) return false;
    return pickCanonicalAgentForPortal(p, [agent])?.id === agent.id;
  });
  if (!match?.mergedSourceUserId) return false;

  const clockIns = await loadTodayClockInsBySourceUserId([match.mergedSourceUserId]);
  return clockIns.has(match.mergedSourceUserId.toString());
}
