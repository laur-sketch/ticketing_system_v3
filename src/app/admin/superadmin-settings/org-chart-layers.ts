import type { OrgChartNode } from "@prisma/client/primary";

export type OrgChartLayerNode = Pick<OrgChartNode, "id" | "parentId">;

/** Depth on the chart: Layer 1 = top-level (no parent), Layer 2 = reports to L1, etc. */
export function orgChartLayerById(nodes: OrgChartLayerNode[]): Map<string, number> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const layers = new Map<string, number>();

  function layerOf(id: string, visiting = new Set<string>()): number {
    const cached = layers.get(id);
    if (cached != null) return cached;
    if (visiting.has(id)) return 1;
    visiting.add(id);
    const node = byId.get(id);
    if (!node?.parentId || !byId.has(node.parentId)) {
      layers.set(id, 1);
      return 1;
    }
    const depth = layerOf(node.parentId, visiting) + 1;
    layers.set(id, depth);
    return depth;
  }

  for (const n of nodes) layerOf(n.id);
  return layers;
}

export function formatOrgChartLayerLabel(layer: number): string {
  return `Layer ${layer}`;
}

/** Sort nodes by layer (asc), then name — for Reports-to dropdowns. */
export function sortOrgNodesByLayer(
  nodes: OrgChartNode[],
  layers: Map<string, number>,
): OrgChartNode[] {
  return [...nodes].sort((a, b) => {
    const la = layers.get(a.id) ?? 1;
    const lb = layers.get(b.id) ?? 1;
    if (la !== lb) return la - lb;
    return a.personName.localeCompare(b.personName, undefined, { sensitivity: "base" });
  });
}

export function orgChartOptionLabel(node: OrgChartNode, layer: number): string {
  const company = node.companyName?.trim();
  const base = `${formatOrgChartLayerLabel(layer)} · ${node.personName}`;
  return company ? `${base} · ${company}` : base;
}

const EITHER_OR_PARENT_PREFIX = "eitherOr:";

/** Select value for a person parent, shared either/or link, or top level. */
export function encodeReportsToValue(opts: {
  parentId?: string | null;
  parentEitherOrLinkId?: string | null;
}): string {
  if (opts.parentEitherOrLinkId) return `${EITHER_OR_PARENT_PREFIX}${opts.parentEitherOrLinkId}`;
  return opts.parentId ?? "";
}

export function parseReportsToValue(value: string): {
  parentId: string | null;
  parentEitherOrLinkId: string | null;
} {
  const raw = value.trim();
  if (!raw) return { parentId: null, parentEitherOrLinkId: null };
  if (raw.startsWith(EITHER_OR_PARENT_PREFIX)) {
    const linkId = raw.slice(EITHER_OR_PARENT_PREFIX.length).trim();
    return { parentId: null, parentEitherOrLinkId: linkId || null };
  }
  return { parentId: raw, parentEitherOrLinkId: null };
}

export function eitherOrLinkLabel(
  link: { id: string; nodeAId: string; nodeBId: string },
  byId: Map<string, Pick<OrgChartNode, "personName">>,
): string {
  const a = byId.get(link.nodeAId)?.personName ?? "Unknown";
  const b = byId.get(link.nodeBId)?.personName ?? "Unknown";
  return `${a} / ${b} (either/or)`;
}

/** Descendant ids for each node (direct + indirect reports). */
export function orgChartDescendantsById(nodes: OrgChartLayerNode[]): Map<string, Set<string>> {
  const childrenOf = new Map<string | null, string[]>();
  for (const n of nodes) {
    const list = childrenOf.get(n.parentId) ?? [];
    list.push(n.id);
    childrenOf.set(n.parentId, list);
  }
  const out = new Map<string, Set<string>>();
  function collect(id: string): Set<string> {
    const cached = out.get(id);
    if (cached) return cached;
    const set = new Set<string>();
    for (const child of childrenOf.get(id) ?? []) {
      set.add(child);
      for (const d of collect(child)) set.add(d);
    }
    out.set(id, set);
    return set;
  }
  for (const n of nodes) collect(n.id);
  return out;
}

/** Manager / either-or options valid for reparenting the given excluded node ids. */
export function orgChartReportsToOptions(
  nodes: OrgChartNode[],
  excludeNodeIds: string[],
  eitherOrLinks: Array<{ id: string; nodeAId: string; nodeBId: string }>,
): {
  managersByLayer: Array<[number, OrgChartNode[]]>;
  eitherOrParentOptions: Array<{ value: string; label: string }>;
} {
  const layerById = orgChartLayerById(nodes);
  const descendants = orgChartDescendantsById(nodes);
  const excluded = new Set(excludeNodeIds);
  for (const id of excludeNodeIds) {
    for (const d of descendants.get(id) ?? []) excluded.add(d);
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const managerOptions = nodes.filter((m) => !excluded.has(m.id));
  const eitherOrParentOptions = eitherOrLinks
    .filter((link) => {
      if (excluded.has(link.nodeAId) || excluded.has(link.nodeBId)) return false;
      return true;
    })
    .map((link) => ({
      value: encodeReportsToValue({ parentEitherOrLinkId: link.id }),
      label: eitherOrLinkLabel(link, byId),
    }));
  const sorted = sortOrgNodesByLayer(managerOptions, layerById);
  const groups = new Map<number, OrgChartNode[]>();
  for (const m of sorted) {
    const layer = layerById.get(m.id) ?? 1;
    const list = groups.get(layer) ?? [];
    list.push(m);
    groups.set(layer, list);
  }
  return {
    managersByLayer: [...groups.entries()].sort(([a], [b]) => a - b),
    eitherOrParentOptions,
  };
}
