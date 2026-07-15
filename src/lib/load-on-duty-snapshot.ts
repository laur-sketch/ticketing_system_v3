/**
 * Activities / On Duty roster: HRIS-linked personnel from primary portals,
 * enriched with today's clock-in status from the merged database only.
 */

import { pickCanonicalAgentForPortal } from "@/lib/admin-roster";
import { resolveRosterCompanyName } from "@/lib/hris-company-aliases";
import {
  dutyStatusFromLatestClockIn,
  isOnDutyStatus,
  loadTodayClockInsBySourceUserId,
  type DutyStatus,
} from "@/lib/merged-duty-status";
import { prisma } from "@/lib/prisma";
import { isStaffPortalRole } from "@/lib/staff-role";

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

function companyLabelForPortal(portal: {
  staffDesignatedCompany: { name: string } | null;
}): string {
  const designated = portal.staffDesignatedCompany?.name?.trim();
  if (designated) {
    return resolveRosterCompanyName(designated) ?? designated;
  }
  return "General Queue";
}

/**
 * Load all active HRIS-linked staff, status from merged DB clock-ins for today (PHT).
 */
export async function loadOnDutySnapshot(options: LoadOnDutyOptions = {}): Promise<OnDutySnapshot> {
  const pageSize = Math.min(48, Math.max(1, options.pageSize ?? 6));
  const pageRaw = Math.max(1, options.page ?? 1);
  const companyFilter = options.companyFilter?.trim() ?? "";

  const [portals, agents] = await Promise.all([
    prisma.portalAccount.findMany({
      where: {
        mergedSourceUserId: { not: null },
        accountStatus: "ACTIVE",
      },
      select: {
        email: true,
        name: true,
        role: true,
        mergedSourceUserId: true,
        staffDesignatedCompany: { select: { name: true } },
      },
    }),
    prisma.agent.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, name: true, createdAt: true },
    }),
  ]);

  const staffPortals = portals.filter((p) => isStaffPortalRole(p.role) && p.mergedSourceUserId != null);
  if (staffPortals.length === 0) {
    return { agents: [], page: 1, totalPages: 1, total: 0, companies: [], onDutyCount: 0 };
  }

  const sourceIds = staffPortals.map((p) => p.mergedSourceUserId!);
  const clockInsToday = await loadTodayClockInsBySourceUserId(sourceIds);

  const allAgents: OnDutyAgentSnapshot[] = [];
  const seenAgentIds = new Set<string>();

  for (const portal of staffPortals) {
    const canon = pickCanonicalAgentForPortal(portal, agents);
    if (!canon || seenAgentIds.has(canon.id)) continue;
    seenAgentIds.add(canon.id);

    const sourceKey = portal.mergedSourceUserId!.toString();
    const lastClockIn = clockInsToday.get(sourceKey) ?? null;
    const dutyStatus = dutyStatusFromLatestClockIn(lastClockIn);
    const isOnDuty = isOnDutyStatus(dutyStatus);
    const companyName = companyLabelForPortal(portal);

    allAgents.push({
      id: canon.id,
      name: canon.name || portal.name,
      companyName,
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
