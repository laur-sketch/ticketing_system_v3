/**
 * Server-side org-chart section rosters for RFP intake and ticket routing.
 */
import { prisma } from "@/lib/prisma";
import { loadHrisAssignableStaff } from "@/lib/hris-staff-roster";
import {
  expandOrgChartSectionsWithAncestors,
  orderOrgChartSectionsTree,
  type OrgChartSectionOption,
} from "@/lib/org-chart-section-display";

export type { OrgChartSectionOption } from "@/lib/org-chart-section-display";
export {
  expandOrgChartSectionsWithAncestors,
  orderOrgChartSectionsTree,
  orgChartSectionOptionText,
} from "@/lib/org-chart-section-display";

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

export async function listOrgChartSectionOptions(): Promise<OrgChartSectionOption[]> {
  const sections = await prisma.orgChartSection.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, parentId: true, companyTeamId: true, sortOrder: true },
  });
  return orderOrgChartSectionsTree(sections);
}

async function loadSectionMemberGraph() {
  const [sections, memberships, primaryNodes, staff] = await Promise.all([
    prisma.orgChartSection.findMany({
      select: { id: true, parentId: true, companyTeamId: true },
    }),
    prisma.orgChartNodeSectionMembership.findMany({
      select: {
        sectionId: true,
        node: { select: { id: true, mergedSourceUserId: true } },
      },
    }),
    prisma.orgChartNode.findMany({
      where: { sectionId: { not: null } },
      select: { id: true, sectionId: true, mergedSourceUserId: true },
    }),
    loadHrisAssignableStaff({}),
  ]);

  const agentByMerged = new Map<string, string>();
  for (const row of staff) {
    if (row.mergedSourceUserId && row.agentId) {
      agentByMerged.set(row.mergedSourceUserId, row.agentId);
    }
  }

  const childrenByParent = new Map<string | null, string[]>();
  for (const s of sections) {
    const list = childrenByParent.get(s.parentId) ?? [];
    list.push(s.id);
    childrenByParent.set(s.parentId, list);
  }

  const membersBySection = new Map<string, Array<{ nodeId: string; mergedSourceUserId: string }>>();
  const addMember = (sectionId: string, nodeId: string, mergedSourceUserId: string) => {
    const list = membersBySection.get(sectionId) ?? [];
    if (list.some((m) => m.nodeId === nodeId)) return;
    list.push({ nodeId, mergedSourceUserId });
    membersBySection.set(sectionId, list);
  };
  for (const m of memberships) {
    addMember(m.sectionId, m.node.id, m.node.mergedSourceUserId);
  }
  for (const node of primaryNodes) {
    if (!node.sectionId) continue;
    addMember(node.sectionId, node.id, node.mergedSourceUserId);
  }

  return { sections, childrenByParent, membersBySection, agentByMerged };
}

/** Merged HRIS user ids for a section and all nested subsections. */
export async function resolveMergedSourceUserIdsForOrgChartSection(
  sectionId: string,
): Promise<string[]> {
  const id = sectionId.trim();
  if (!id) return [];
  const { childrenByParent, membersBySection } = await loadSectionMemberGraph();
  const treeIds = collectDescendantIds(id, childrenByParent);
  const mergedIds = new Set<string>();
  for (const sid of treeIds) {
    for (const member of membersBySection.get(sid) ?? []) {
      mergedIds.add(member.mergedSourceUserId);
    }
  }
  return [...mergedIds];
}

/** Agent ids for a section and all nested subsections. */
export async function resolveAgentIdsForOrgChartSection(
  sectionId: string,
): Promise<string[]> {
  const id = sectionId.trim();
  if (!id) return [];
  const { agentByMerged } = await loadSectionMemberGraph();
  const mergedIds = await resolveMergedSourceUserIdsForOrgChartSection(id);
  const agentIds: string[] = [];
  for (const mergedId of mergedIds) {
    const agentId = agentByMerged.get(mergedId);
    if (agentId) agentIds.push(agentId);
  }
  return [...new Set(agentIds)];
}

/** Sections the merged HRIS user belongs to (memberships + primary sectionId). */
export async function resolveOrgChartSectionIdsForMergedUser(
  mergedSourceUserId: string | null | undefined,
): Promise<string[]> {
  const key = (mergedSourceUserId ?? "").trim();
  if (!key) return [];
  const [memberships, primary] = await Promise.all([
    prisma.orgChartNodeSectionMembership.findMany({
      where: { node: { mergedSourceUserId: key } },
      select: { sectionId: true },
    }),
    prisma.orgChartNode.findFirst({
      where: { mergedSourceUserId: key, sectionId: { not: null } },
      select: { sectionId: true },
    }),
  ]);
  const ids = new Set<string>();
  for (const m of memberships) ids.add(m.sectionId);
  if (primary?.sectionId) ids.add(primary.sectionId);
  return [...ids];
}

/** Walk section tree upward to find a company team for board routing. */
export async function resolveCompanyTeamIdForOrgChartSection(
  sectionId: string | null | undefined,
): Promise<string | null> {
  let current = (sectionId ?? "").trim() || null;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const row = await prisma.orgChartSection.findUnique({
      where: { id: current },
      select: { companyTeamId: true, parentId: true },
    });
    if (!row) return null;
    if (row.companyTeamId) return row.companyTeamId;
    current = row.parentId;
  }
  return null;
}

export async function orgChartSectionExists(sectionId: string): Promise<boolean> {
  const id = sectionId.trim();
  if (!id) return false;
  const row = await prisma.orgChartSection.findUnique({
    where: { id },
    select: { id: true },
  });
  return Boolean(row);
}

type SectionRow = {
  id: string;
  name: string;
  parentId: string | null;
  headNodeId: string | null;
};

/** Root / main section for a section id (walks parentId upward). */
export async function resolveMainOrgChartSectionId(
  sectionId: string | null | undefined,
): Promise<string | null> {
  let current = (sectionId ?? "").trim() || null;
  let mainId: string | null = null;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    mainId = current;
    const row = await prisma.orgChartSection.findUnique({
      where: { id: current },
      select: { parentId: true },
    });
    if (!row) break;
    current = row.parentId;
  }
  return mainId;
}

/** Selected section plus its main (root) ancestor. */
export async function resolveOrgChartSectionContext(sectionId: string | null | undefined): Promise<{
  selected: SectionRow | null;
  main: SectionRow | null;
  isSubsection: boolean;
} | null> {
  const id = (sectionId ?? "").trim();
  if (!id) return null;

  const chain: SectionRow[] = [];
  let current: string | null = id;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const row: SectionRow | null = await prisma.orgChartSection.findUnique({
      where: { id: current },
      select: { id: true, name: true, parentId: true, headNodeId: true },
    });
    if (!row) break;
    chain.push(row);
    current = row.parentId;
  }
  if (chain.length === 0) return null;

  const selected = chain[0]!;
  const main = chain[chain.length - 1]!;
  return {
    selected,
    main,
    isSubsection: chain.length > 1,
  };
}
