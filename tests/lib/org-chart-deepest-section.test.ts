import { describe, expect, it } from "vitest";

/**
 * Depth ranking logic mirrored from pickDeepestOrgChartSectionId (pure unit).
 */
function pickDeepestId(
  ids: string[],
  rows: Array<{ id: string; parentId: string | null }>,
): string | null {
  if (ids.length === 0) return null;
  const byId = new Map(rows.map((s) => [s.id, s]));
  const present = ids.filter((id) => byId.has(id));
  if (present.length === 0) return ids[0] ?? null;

  function depthOf(sectionId: string): number {
    let depth = 0;
    let current: string | null = sectionId;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      seen.add(current);
      const row = byId.get(current);
      if (!row?.parentId) break;
      depth += 1;
      current = row.parentId;
    }
    return depth;
  }

  const ranked = [...present].sort((a, b) => {
    const depthDiff = depthOf(b) - depthOf(a);
    if (depthDiff !== 0) return depthDiff;
    return a.localeCompare(b);
  });
  return ranked[0] ?? null;
}

describe("pickDeepestOrgChartSectionId (INT-01)", () => {
  it("prefers the nested subsection over its parent", () => {
    const rows = [
      { id: "root", parentId: null },
      { id: "child", parentId: "root" },
      { id: "leaf", parentId: "child" },
    ];
    expect(pickDeepestId(["root", "leaf"], rows)).toBe("leaf");
    expect(pickDeepestId(["child", "root"], rows)).toBe("child");
  });
});
