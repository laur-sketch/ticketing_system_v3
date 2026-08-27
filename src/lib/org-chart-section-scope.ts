/**
 * Promote org-chart section heads to portal Admin, and resolve section-scoped
 * visibility for request / task boards. Custom org-chart section roles
 * (Deputy, Coordinator, …) remain membership labels — they do not change
 * portal role; only the singleton section head maps to Admin.
 */
import { Prisma } from "@prisma/client/primary";
import { prisma } from "@/lib/prisma";
import { resolveMergedSourceUserIdForSessionEmail } from "@/lib/approval-position-resolver";
import { personnelRequestBoardWhere } from "@/lib/rfp-request-board";
import {
  resolveOrgChartSectionIdsForMergedUser,
  resolveAgentIdsForOrgChartSection,
} from "@/lib/org-chart-section-roster";
import { isElevatedUserRole } from "@/lib/auth";
import { hasSubKpiAssignedTo } from "@/lib/kpi-subkpis";

function collectDescendantIds(
  rootId: string,
  childrenByParent: Map<string | null, string[]>,
): Set<string> {
  const out = new Set<string>([rootId]);
  const stack = [...(childrenByParent.get(rootId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    stack.push(...(childrenByParent.get(id) ?? []));
  }
  return out;
}

/** Membership sections plus all nested subsections. */
export async function expandOrgChartSectionIdsWithDescendants(
  sectionIds: string[],
): Promise<string[]> {
  const roots = [...new Set(sectionIds.map((id) => id.trim()).filter(Boolean))];
  if (roots.length === 0) return [];
  const sections = await prisma.orgChartSection.findMany({
    select: { id: true, parentId: true },
  });
  const childrenByParent = new Map<string | null, string[]>();
  for (const s of sections) {
    const list = childrenByParent.get(s.parentId) ?? [];
    list.push(s.id);
    childrenByParent.set(s.parentId, list);
  }
  const out = new Set<string>();
  for (const root of roots) {
    for (const id of collectDescendantIds(root, childrenByParent)) out.add(id);
  }
  return [...out];
}

/**
 * When a node is set as section head, upgrade their portal account to Admin
 * (with headPrivileges). Never demotes SuperAdmin/HighAdmin; skips Customer /
 * Personnel-Guard. Does not clear custom section roles on the membership.
 */
export async function ensurePortalAdminForOrgChartHeadNode(
  headNodeId: string | null | undefined,
): Promise<void> {
  const id = (headNodeId ?? "").trim();
  if (!id) return;
  const node = await prisma.orgChartNode.findUnique({
    where: { id },
    select: { mergedSourceUserId: true },
  });
  const mergedId = (node?.mergedSourceUserId ?? "").trim();
  if (!mergedId) return;

  const portal = await prisma.portalAccount.findFirst({
    where: { mergedSourceUserId: mergedId },
    select: { id: true, role: true, headPrivileges: true, authUserId: true },
  });
  if (!portal) return;
  if (portal.role === "SuperAdmin" || portal.role === "HighAdmin") return;
  if (portal.role === "Customer" || portal.role === "Personnel-Guard") return;
  if (portal.role === "Admin" && portal.headPrivileges === true) return;

  await prisma.portalAccount.update({
    where: { id: portal.id },
    data: { role: "Admin", headPrivileges: true },
  });
}

/** Backfill: ensure every current section head is portal Admin. */
export async function ensurePortalAdminForAllOrgChartSectionHeads(): Promise<number> {
  const heads = await prisma.orgChartSection.findMany({
    where: { headNodeId: { not: null } },
    select: { headNodeId: true },
  });
  const unique = [...new Set(heads.map((h) => h.headNodeId).filter(Boolean))] as string[];
  for (const headNodeId of unique) {
    await ensurePortalAdminForOrgChartHeadNode(headNodeId);
  }
  return unique.length;
}

export type ViewerSectionScope = {
  /** Direct memberships + descendants. Empty if the user has no org-chart section. */
  sectionIds: string[];
  /** Agent ids of people in those sections (for task-board filtering). */
  agentIds: string[];
};

export async function resolveViewerOrgChartSectionScope(
  email: string | null | undefined,
): Promise<ViewerSectionScope> {
  const mergedId = await resolveMergedSourceUserIdForSessionEmail(email);
  const membershipIds = await resolveOrgChartSectionIdsForMergedUser(mergedId);
  const sectionIds = await expandOrgChartSectionIdsWithDescendants(membershipIds);
  if (sectionIds.length === 0) {
    return { sectionIds: [], agentIds: [] };
  }
  const agentIdSets = await Promise.all(
    sectionIds.map((id) => resolveAgentIdsForOrgChartSection(id)),
  );
  const agentIds = [...new Set(agentIdSets.flat())];
  return { sectionIds, agentIds };
}

/**
 * Ticket visibility for Admin / Personnel: send-to section in the viewer's
 * section tree, OR personal assignee / procedural / transfer scope.
 * SuperAdmin / HighAdmin use unrestricted board scope (all departments).
 */
export async function sectionScopedTicketWhere(input: {
  email: string | null | undefined;
  agentId: string | null | undefined;
}): Promise<Prisma.TicketWhereInput> {
  const scope = await resolveViewerOrgChartSectionScope(input.email);
  const personal =
    input.agentId != null ? await personnelRequestBoardWhere(input.agentId) : null;

  if (scope.sectionIds.length === 0) {
    return personal ?? { id: "__none__" };
  }

  const sectionScope: Prisma.TicketWhereInput = {
    orgChartSectionId: { in: scope.sectionIds },
  };
  if (personal) {
    return { OR: [sectionScope, personal] };
  }
  return sectionScope;
}

/** True when the ticket's send-to department is in the viewer's org-chart section tree. */
export async function ticketInViewerSectionScope(input: {
  email: string | null | undefined;
  orgChartSectionId: string | null | undefined;
}): Promise<boolean> {
  const sectionId = (input.orgChartSectionId ?? "").trim();
  if (!sectionId) return false;
  const scope = await resolveViewerOrgChartSectionScope(input.email);
  return scope.sectionIds.includes(sectionId);
}

/** Human-readable department scope label for dashboards (falls back to company). */
export async function resolveViewerDepartmentScopeLabel(
  email: string | null | undefined,
): Promise<string | null> {
  const scope = await resolveViewerOrgChartSectionScope(email);
  if (scope.sectionIds.length === 0) return null;
  const sections = await prisma.orgChartSection.findMany({
    where: { id: { in: scope.sectionIds } },
    select: { id: true, name: true, parentId: true },
  });
  const idSet = new Set(scope.sectionIds);
  const roots = sections.filter((s) => !s.parentId || !idSet.has(s.parentId));
  const names = (roots.length > 0 ? roots : sections)
    .map((s) => s.name.trim())
    .filter(Boolean)
    .slice(0, 3);
  if (names.length === 0) return null;
  if (roots.length > 3 || sections.length > roots.length) {
    return `${names.join(", ")} (+subs)`;
  }
  return names.join(", ");
}

/** Whether this session role should be limited to org-chart section scope. */
export function roleUsesOrgChartSectionBoardScope(role: string | null | undefined): boolean {
  if (!role) return false;
  if (isElevatedUserRole(role)) return false;
  return role === "Admin" || role === "Personnel";
}

/**
 * Task-board filter: main/sub assignee in the section agent set.
 * Unassigned tasks are hidden under section scope (no section FK on KPIs yet).
 */
export function kpiRowInSectionAgentScope(
  row: {
    assignedAgentId: string | null;
    subKpis: unknown;
  },
  sectionAgentIds: Set<string>,
): boolean {
  if (sectionAgentIds.size === 0) return false;
  if (row.assignedAgentId && sectionAgentIds.has(row.assignedAgentId)) return true;
  for (const agentId of sectionAgentIds) {
    if (hasSubKpiAssignedTo(row.subKpis, agentId)) return true;
  }
  return false;
}
