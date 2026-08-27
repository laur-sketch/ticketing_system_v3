/** Client-safe org-chart section helpers (no Prisma / Node imports). */

export type OrgChartSectionOption = {
  id: string;
  name: string;
  parentId: string | null;
  companyTeamId: string | null;
  /** Display name (same as `name`; kept for API compatibility). */
  label: string;
  depth: number;
};

export type OrgChartSectionRow = {
  id: string;
  name: string;
  parentId: string | null;
  companyTeamId: string | null;
  sortOrder: number;
};

function compareSectionRows(
  a: { sortOrder: number; name: string },
  b: { sortOrder: number; name: string },
): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

/** Depth-first tree order: parent, then children (by sortOrder, then name). */
export function orderOrgChartSectionsTree(
  sections: OrgChartSectionRow[],
): OrgChartSectionOption[] {
  const childrenByParent = new Map<string | null, OrgChartSectionRow[]>();
  for (const section of sections) {
    const list = childrenByParent.get(section.parentId) ?? [];
    list.push(section);
    childrenByParent.set(section.parentId, list);
  }
  for (const list of childrenByParent.values()) {
    list.sort(compareSectionRows);
  }

  const out: OrgChartSectionOption[] = [];
  function walk(parentId: string | null, depth: number) {
    for (const section of childrenByParent.get(parentId) ?? []) {
      out.push({
        id: section.id,
        name: section.name,
        parentId: section.parentId,
        companyTeamId: section.companyTeamId,
        label: section.name,
        depth,
      });
      walk(section.id, depth + 1);
    }
  }
  walk(null, 0);
  return out;
}

/** Keep ancestor rows so filtered member sections still appear under their parent chain. */
export function expandOrgChartSectionsWithAncestors(
  allSections: OrgChartSectionRow[],
  memberSectionIds: Iterable<string>,
): OrgChartSectionRow[] {
  const byId = new Map(allSections.map((s) => [s.id, s]));
  const needed = new Set<string>();
  for (const id of memberSectionIds) {
    let current: string | null = id;
    const trail = new Set<string>();
    while (current && !trail.has(current)) {
      trail.add(current);
      needed.add(current);
      current = byId.get(current)?.parentId ?? null;
    }
  }
  return allSections.filter((s) => needed.has(s.id));
}

/** Prefix indent for nested section names in `<select>` options. */
export function orgChartSectionOptionText(
  section: Pick<OrgChartSectionOption, "name" | "depth">,
): string {
  if (section.depth <= 0) return section.name;
  return `${"— ".repeat(section.depth)}${section.name}`;
}

/** Top-level departments (depth 0 / no parent). */
export function orgChartMajorDepartments(
  sections: OrgChartSectionOption[],
): OrgChartSectionOption[] {
  return sections.filter((s) => s.depth <= 0 || !s.parentId);
}

/** Direct + nested sub-departments under a major department. */
export function orgChartSubDepartments(
  sections: OrgChartSectionOption[],
  majorId: string,
): OrgChartSectionOption[] {
  const id = majorId.trim();
  if (!id) return [];
  const byId = new Map(sections.map((s) => [s.id, s]));
  const major = byId.get(id);
  if (!major) return [];
  const majorDepth = major.depth;
  return sections.filter((s) => {
    if (s.id === id) return false;
    let cur: OrgChartSectionOption | undefined = s;
    const seen = new Set<string>();
    while (cur?.parentId && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (cur.parentId === id) return true;
      cur = byId.get(cur.parentId);
    }
    return false;
  }).map((s) => ({
    ...s,
    /** Relative indent under the major for the sub-department dropdown. */
    depth: Math.max(0, s.depth - majorDepth - 1),
  }));
}

/** Walk to the top-level department for a section. */
export function orgChartRootSectionId(
  sections: Array<Pick<OrgChartSectionOption, "id" | "parentId">>,
  sectionId: string,
): string {
  const byId = new Map(sections.map((s) => [s.id, s]));
  let cur = byId.get(sectionId);
  const seen = new Set<string>();
  while (cur?.parentId && byId.has(cur.parentId) && !seen.has(cur.id)) {
    seen.add(cur.id);
    cur = byId.get(cur.parentId);
  }
  return cur?.id ?? sectionId;
}

/** Case-insensitive exact name match, then includes fallback. */
export function findOrgChartSectionByName(
  sections: OrgChartSectionOption[],
  name: string,
): OrgChartSectionOption | null {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  const exact = sections.find((s) => s.name.trim().toLowerCase() === needle);
  if (exact) return exact;
  return (
    sections.find((s) => {
      const n = s.name.trim().toLowerCase();
      return n.includes(needle) || needle.includes(n);
    }) ?? null
  );
}

/**
 * Resolve major + optional sub selection for a target section id.
 * Sub is set when the target is nested under the major.
 */
export function resolveSendToDepartmentSelection(
  sections: OrgChartSectionOption[],
  sectionId: string,
): { majorId: string; subId: string } {
  const id = sectionId.trim();
  if (!id) return { majorId: "", subId: "" };
  const majorId = orgChartRootSectionId(sections, id);
  return {
    majorId,
    subId: id === majorId ? "" : id,
  };
}
