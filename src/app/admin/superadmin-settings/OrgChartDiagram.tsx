"use client";

import type { OrgChartNode } from "@prisma/client/primary";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
} from "@xyflow/react";
import type { Edge, Node, NodeChange, NodeProps, DefaultEdgeOptions } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, Crown, FolderKanban, GitCompareArrows, Link2Off, Lock, LockOpen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  OrgChartBulkReportsBar,
  type BulkReportsToOptions,
} from "./OrgChartBulkReportsBar";
import type { OrgChartSectionRow } from "./OrgChartSectionsPanel";
import {
  eitherOrLinkLabel,
  encodeReportsToValue,
  formatOrgChartLayerLabel,
  orgChartLayerById,
  orgChartOptionLabel,
  sortOrgNodesByLayer,
} from "./org-chart-layers";

const NODE_W = 248;
/** Must match rendered card height so connector handles align with layout rows. */
const NODE_H = 248;
const X_GAP = 48;
const X_ROOT_GAP = 72;
const Y_GAP = 72;
/** Rounded elbow routing for hierarchy connectors. */
const ORG_STEP_PATH = { borderRadius: 14, offset: 28 } as const;
const ORG_PEER_HANDLE_TOP = "38%";
const ORG_CHILD_IN_LEFT = "32%";
const ORG_CHILD_IN_RIGHT = "68%";

const ORG_EDGE_NORMAL: Edge["style"] = {
  stroke: "var(--org-line-strong)",
  strokeWidth: 2,
};

const ORG_EDGE_SHARED: Edge["style"] = {
  stroke: "#ea580c",
  strokeWidth: 2,
  strokeDasharray: "6 4",
};

export type OrgChartDiagramNode = OrgChartNode & {
  sectionMemberships?: Array<{
    sectionId: string;
    roleId?: string | null;
    role?: { id: string; label: string } | null;
  }>;
};

function orgStepEdge(
  partial: Omit<Edge, "type"> & { type?: Edge["type"] },
  pathOptions: { borderRadius: number; offset: number } = ORG_STEP_PATH,
): Edge {
  return {
    type: "smoothstep",
    pathOptions,
    ...partial,
  } as Edge;
}

type ManagersByLayer = Array<[number, OrgChartNode[]]>;

type OrgBoxData = {
  node: OrgChartNode;
  kidsCount: number;
  managersByLayer: ManagersByLayer;
  eitherOrParentOptions: Array<{ value: string; label: string }>;
  reportsToValue: string;
  nodeLayer: number;
  siblingIndex: number;
  siblingCount: number;
  busy: boolean;
  selected: boolean;
  sectionLabel: string | null;
  onReparent: (id: string, parentId: string) => void;
  onMove: (id: string, moveUp: boolean) => void;
  onRemove: (id: string, reports: number) => void;
  onToggleParentLock: (id: string, locked: boolean) => void;
};

type OrgBoxNodeType = Node<OrgBoxData, "orgBox">;

type DiagramNode = OrgBoxNodeType;

const AVATAR_PALETTE = [
  "bg-orange-500",
  "bg-sky-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-amber-500",
  "bg-teal-500",
  "bg-indigo-500",
];

function avatarColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function groupManagersByLayer(
  managerOptions: OrgChartNode[],
  layerById: Map<string, number>,
): ManagersByLayer {
  const sorted = sortOrgNodesByLayer(managerOptions, layerById);
  const groups = new Map<number, OrgChartNode[]>();
  for (const m of sorted) {
    const layer = layerById.get(m.id) ?? 1;
    const list = groups.get(layer) ?? [];
    list.push(m);
    groups.set(layer, list);
  }
  return [...groups.entries()].sort(([a], [b]) => a - b);
}

const OrgBox = memo(function OrgBox({ data }: NodeProps<OrgBoxNodeType>) {
  const {
    node,
    kidsCount,
    managersByLayer,
    eitherOrParentOptions,
    reportsToValue,
    nodeLayer,
    siblingIndex,
    siblingCount,
    busy,
    selected,
    sectionLabel,
    onReparent,
    onMove,
    onRemove,
    onToggleParentLock,
  } = data;
  const roleLine = [node.personRole, node.companyName].filter(Boolean).join(" · ") || "No role info";
  const locked = node.parentLocked;

  return (
    <article
      data-box-id={node.id}
      style={{ minHeight: NODE_H }}
      title={`${node.personName}\n${roleLine}${sectionLabel ? `\nDepartment: ${sectionLabel}` : ""}`}
      className={`w-[248px] rounded-xl border bg-white shadow-sm dark:bg-zinc-900 ${
        selected
          ? "border-orange-500/90 ring-2 ring-orange-500/45"
          : locked
            ? "border-amber-500/70 ring-1 ring-amber-500/30"
            : "border-zinc-200/90 hover:border-orange-400/50 dark:border-zinc-800 dark:hover:border-orange-500/35"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="in"
        className="!h-0.5 !w-0.5 !opacity-0"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="in-left"
        style={{ left: ORG_CHILD_IN_LEFT }}
        className="!h-0.5 !w-0.5 !opacity-0"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="in-right"
        style={{ left: ORG_CHILD_IN_RIGHT }}
        className="!h-0.5 !w-0.5 !opacity-0"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="peer-left"
        style={{ top: ORG_PEER_HANDLE_TOP }}
        className="!h-0.5 !w-0.5 !opacity-0"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="peer-right"
        style={{ top: ORG_PEER_HANDLE_TOP }}
        className="!h-0.5 !w-0.5 !opacity-0"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="peer-in-left"
        style={{ top: ORG_PEER_HANDLE_TOP }}
        className="!h-0.5 !w-0.5 !opacity-0"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="peer-in-right"
        style={{ top: ORG_PEER_HANDLE_TOP }}
        className="!h-0.5 !w-0.5 !opacity-0"
      />
      <div className="flex items-start gap-2.5 px-3 pt-3 pb-2">
        <span
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ring-2 ring-white/70 dark:ring-zinc-800 ${avatarColor(node.id)}`}
        >
          {initials(node.personName)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-zinc-900 dark:text-zinc-100">
            {node.personName}
          </p>
          <p className="mt-0.5 line-clamp-1 text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
            {roleLine}
          </p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-700/90 dark:text-orange-300/90">
            {formatOrgChartLayerLabel(nodeLayer)}
            {sectionLabel ? ` · ${sectionLabel}` : ""}
          </p>
        </div>
        {kidsCount > 0 || locked ? (
          <span className="mt-0.5 flex shrink-0 flex-col items-end gap-0.5">
            {locked ? (
              <span
                className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
                title="Locked to current manager"
              >
                <Lock className="inline h-3 w-3" aria-hidden />
              </span>
            ) : null}
            {kidsCount > 0 ? (
              <span
                className="rounded-md bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-orange-700 dark:bg-orange-950/40 dark:text-orange-300"
                title={`${kidsCount} direct report${kidsCount === 1 ? "" : "s"}`}
              >
                {kidsCount}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>

      <div className="space-y-1.5 border-t border-zinc-100 px-3 py-2 dark:border-zinc-800">
        <label className="block">
          <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
            Reports to · you are {formatOrgChartLayerLabel(nodeLayer)}
          </span>
          <select
            value={reportsToValue}
            disabled={busy || locked}
            onChange={(e) => onReparent(node.id, e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="h-8 w-full cursor-pointer rounded-lg border border-zinc-300 bg-zinc-50 px-2 text-[11px] font-medium text-zinc-900 outline-none transition focus:border-orange-500/60 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 nodrag nopan"
          >
            <option value="">— Top level ({formatOrgChartLayerLabel(1)}) —</option>
            {eitherOrParentOptions.length > 0 ? (
              <optgroup label="Shared either / or">
                {eitherOrParentOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {managersByLayer.map(([layer, people]) => (
              <optgroup key={`layer-${layer}`} label={formatOrgChartLayerLabel(layer)}>
                {people.map((m) => (
                  <option key={m.id} value={m.id}>
                    {orgChartOptionLabel(m, layer)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <div className="mt-1 flex flex-wrap items-center justify-end gap-1.5 nodrag nopan">
          <button
            type="button"
            disabled={busy}
            aria-label={locked ? "Unlock reports-to" : "Lock to current manager"}
            title={
              locked
                ? "Unlock — allow changing reports-to"
                : "Lock to current manager (moves with them when reparented)"
            }
            onClick={(e) => {
              e.stopPropagation();
              onToggleParentLock(node.id, !locked);
            }}
            className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
              locked
                ? "border-amber-400/80 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200"
                : "border-zinc-300 bg-zinc-50 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            }`}
          >
            {locked ? (
              <Lock className="size-3.5 shrink-0 stroke-[2.5]" aria-hidden />
            ) : (
              <LockOpen className="size-3.5 shrink-0 stroke-[2.5]" aria-hidden />
            )}
            <span>{locked ? "Locked" : "Lock"}</span>
          </button>
          <button
            type="button"
            disabled={busy || siblingIndex === 0}
            aria-label="Move up among peers"
            title="Move up among peers"
            onClick={(e) => {
              e.stopPropagation();
              onMove(node.id, true);
            }}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-300 bg-zinc-50 px-2 text-[11px] font-semibold text-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <ArrowUp className="size-3.5 shrink-0 stroke-[2.5]" aria-hidden />
            <span>Up</span>
          </button>
          <button
            type="button"
            disabled={busy || siblingIndex === siblingCount - 1}
            aria-label="Move down among peers"
            title="Move down among peers"
            onClick={(e) => {
              e.stopPropagation();
              onMove(node.id, false);
            }}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-300 bg-zinc-50 px-2 text-[11px] font-semibold text-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <ArrowDown className="size-3.5 shrink-0 stroke-[2.5]" aria-hidden />
            <span>Down</span>
          </button>
          <button
            type="button"
            disabled={busy}
            aria-label="Remove from chart"
            title="Remove from chart"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(node.id, kidsCount);
            }}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-300/70 bg-rose-50 px-2 text-[11px] font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
          >
            <Trash2 className="size-3.5 shrink-0 stroke-[2.5]" aria-hidden />
            <span>Remove</span>
          </button>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="out"
        className="!h-0.5 !w-0.5 !opacity-0"
      />
    </article>
  );
});

const nodeTypes = { orgBox: OrgBox };

/** Section id plus all nested child departments (depth-first). */
function collectSectionSubtreeIds(
  rootId: string,
  childrenByParent: Map<string | null, OrgChartSectionRow[]>,
): string[] {
  const ids: string[] = [rootId];
  const stack = [...(childrenByParent.get(rootId) ?? [])];
  while (stack.length > 0) {
    const child = stack.pop()!;
    ids.push(child.id);
    stack.push(...(childrenByParent.get(child.id) ?? []));
  }
  return ids;
}

function membersOfSectionTree(
  nodes: OrgChartDiagramNode[],
  rootSectionId: string,
  childrenByParent: Map<string | null, OrgChartSectionRow[]>,
): OrgChartDiagramNode[] {
  const sectionIds = new Set(collectSectionSubtreeIds(rootSectionId, childrenByParent));
  const seen = new Set<string>();
  const out: OrgChartDiagramNode[] = [];
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    const inTree =
      (n.sectionId && sectionIds.has(n.sectionId)) ||
      (n.sectionMemberships ?? []).some((m) => sectionIds.has(m.sectionId));
    if (!inTree) continue;
    seen.add(n.id);
    out.push(n);
  }
  return out;
}

/** Scope reports-to layout to members of this department and all nested sub-departments. */
function scopeNodesForSectionView(
  nodes: OrgChartDiagramNode[],
  sectionId: string,
  childrenByParent: Map<string | null, OrgChartSectionRow[]>,
): OrgChartDiagramNode[] {
  const members = membersOfSectionTree(nodes, sectionId, childrenByParent);
  const ids = new Set(members.map((m) => m.id));
  return members.map((n) => ({
    ...n,
    parentId: n.parentId && ids.has(n.parentId) ? n.parentId : null,
    parentEitherOrLinkId:
      n.parentEitherOrLinkId && n.parentId && ids.has(n.parentId)
        ? n.parentEitherOrLinkId
        : null,
  }));
}

function sectionLabelForNode(
  node: OrgChartDiagramNode,
  sectionNameById?: Map<string, string>,
): string | null {
  const fromMemberships = (node.sectionMemberships ?? [])
    .map((m) => sectionNameById?.get(m.sectionId)?.trim())
    .filter((label): label is string => Boolean(label));
  if (fromMemberships.length > 0) {
    return [...new Set(fromMemberships)].join(" · ");
  }
  if (node.sectionId) {
    return sectionNameById?.get(node.sectionId)?.trim() || null;
  }
  return null;
}

/** Angular (elbow) tree layout: children centered under their manager (horizontal siblings). */
function computeLayout(nodes: OrgChartNode[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childrenOf = new Map<string | null, OrgChartNode[]>();
  for (const n of nodes) {
    const list = childrenOf.get(n.parentId) ?? [];
    list.push(n);
    childrenOf.set(n.parentId, list);
  }
  for (const list of childrenOf.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const widthOf = new Map<string, number>();
  function subtreeWidth(id: string): number {
    const kids = childrenOf.get(id) ?? [];
    if (kids.length === 0) return NODE_W;
    const w =
      kids.reduce((sum, k) => sum + subtreeWidth(k.id), 0) + X_GAP * (kids.length - 1);
    widthOf.set(id, w);
    return w;
  }

  const positions = new Map<string, { x: number; y: number }>();
  function place(id: string, left: number, depth: number): number {
    const kids = childrenOf.get(id) ?? [];
    const w = widthOf.get(id) ?? subtreeWidth(id);
    const x = left + (w - NODE_W) / 2;
    positions.set(id, { x, y: depth * (NODE_H + Y_GAP) });
    const childrenWidth =
      kids.reduce((sum, k) => sum + (widthOf.get(k.id) ?? NODE_W), 0) +
      X_GAP * Math.max(0, kids.length - 1);
    let childLeft = left + (w - childrenWidth) / 2;
    for (const kid of kids) {
      childLeft = place(kid.id, childLeft, depth + 1) + X_GAP;
    }
    return left + w;
  }

  const roots = nodes.filter((n) => !n.parentId || !byId.has(n.parentId));
  let cursor = 0;
  for (const root of roots) {
    cursor = place(root.id, cursor, 0) + X_ROOT_GAP;
  }
  return { positions, childrenOf, roots };
}

export type OrgChartEitherOrLinkRow = {
  id: string;
  nodeAId: string;
  nodeBId: string;
};

const SECTION_NODE_W = 248;
const SECTION_NODE_H = 156;
const PERSON_ANCHOR_H = 72;
const SECTION_X_GAP = 40;
const SECTION_X_ROOT_GAP = 56;
const SECTION_Y_GAP = 56;
const PERSON_PREFIX = "person:";

type SectionBoxData = {
  section: OrgChartSectionRow;
  memberCount: number;
  subsectionCount: number;
};

type PersonAnchorData = {
  personName: string;
  personRole: string | null;
  companyName: string | null;
};

type SectionTreeNodeType =
  | Node<SectionBoxData, "sectionBox">
  | Node<PersonAnchorData, "personAnchor">;

function personAnchorId(nodeId: string) {
  return `${PERSON_PREFIX}${nodeId}`;
}

function computeSectionTreeLayout(
  sections: OrgChartSectionRow[],
  peopleById: Map<string, OrgChartDiagramNode>,
) {
  const byId = new Map(sections.map((s) => [s.id, s]));
  /** Parent key: section id, person:<nodeId>, or null for top-level. */
  const childrenOf = new Map<string | null, OrgChartSectionRow[]>();
  const personParentIds = new Set<string>();

  for (const s of sections) {
    let parentKey: string | null = null;
    if (s.reportsToNodeId) {
      parentKey = personAnchorId(s.reportsToNodeId);
      personParentIds.add(s.reportsToNodeId);
    } else if (s.parentId && byId.has(s.parentId)) {
      parentKey = s.parentId;
    }
    const list = childrenOf.get(parentKey) ?? [];
    list.push(s);
    childrenOf.set(parentKey, list);
  }
  for (const list of childrenOf.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }

  const widthOf = new Map<string, number>();
  function subtreeWidth(id: string): number {
    const kids = childrenOf.get(id) ?? [];
    if (kids.length === 0) return SECTION_NODE_W;
    const w =
      kids.reduce((sum, k) => sum + subtreeWidth(k.id), 0) +
      SECTION_X_GAP * (kids.length - 1);
    widthOf.set(id, Math.max(w, SECTION_NODE_W));
    return widthOf.get(id)!;
  }

  const positions = new Map<string, { x: number; y: number }>();

  function placeSection(id: string, left: number, depth: number): number {
    const kids = childrenOf.get(id) ?? [];
    const w = widthOf.get(id) ?? subtreeWidth(id);
    const x = left + (w - SECTION_NODE_W) / 2;
    positions.set(id, { x, y: depth * (SECTION_NODE_H + SECTION_Y_GAP) });
    const childrenWidth =
      kids.reduce((sum, k) => sum + (widthOf.get(k.id) ?? SECTION_NODE_W), 0) +
      SECTION_X_GAP * Math.max(0, kids.length - 1);
    let childLeft = left + (w - childrenWidth) / 2;
    for (const kid of kids) {
      childLeft = placeSection(kid.id, childLeft, depth + 1) + SECTION_X_GAP;
    }
    return left + w;
  }

  function placePersonRoot(personId: string, left: number): number {
    const anchorKey = personAnchorId(personId);
    const kids = childrenOf.get(anchorKey) ?? [];
    for (const kid of kids) subtreeWidth(kid.id);
    const childrenWidth =
      kids.reduce((sum, k) => sum + (widthOf.get(k.id) ?? SECTION_NODE_W), 0) +
      SECTION_X_GAP * Math.max(0, kids.length - 1);
    const w = Math.max(childrenWidth, SECTION_NODE_W);
    positions.set(anchorKey, {
      x: left + (w - SECTION_NODE_W) / 2,
      y: 0,
    });
    let childLeft = left + (w - childrenWidth) / 2;
    for (const kid of kids) {
      childLeft = placeSection(kid.id, childLeft, 1) + SECTION_X_GAP;
    }
    return left + w;
  }

  const topSections = childrenOf.get(null) ?? [];
  const personRoots = [...personParentIds].sort((a, b) => {
    const na = peopleById.get(a)?.personName ?? a;
    const nb = peopleById.get(b)?.personName ?? b;
    return na.localeCompare(nb);
  });

  let cursor = 0;
  for (const personId of personRoots) {
    cursor = placePersonRoot(personId, cursor) + SECTION_X_ROOT_GAP;
  }
  for (const root of topSections) {
    subtreeWidth(root.id);
    cursor = placeSection(root.id, cursor, 0) + SECTION_X_ROOT_GAP;
  }

  return { positions, childrenOf, personParentIds };
}

const SectionBox = memo(function SectionBox({ data }: NodeProps<Node<SectionBoxData, "sectionBox">>) {
  const { section, memberCount, subsectionCount } = data;
  const headLine = section.headName?.trim() || "No head assigned";
  const headMeta = [section.headRole, section.headCompanyName].filter(Boolean).join(" · ");

  return (
    <article
      style={{ width: SECTION_NODE_W, minHeight: SECTION_NODE_H }}
      className="cursor-pointer rounded-xl border border-zinc-200/90 bg-white shadow-sm transition hover:border-orange-400/70 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-orange-500/50"
    >
      <Handle type="target" position={Position.Top} id="in" className="!h-0.5 !w-0.5 !opacity-0" />
      <div className="flex h-full w-full flex-col p-3 text-left nodrag nopan">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
              Department
            </p>
            <h3 className="mt-0.5 line-clamp-2 text-[13px] font-bold leading-snug text-zinc-950 dark:text-zinc-50">
              {section.name}
            </h3>
          </div>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
            <FolderKanban className="size-4" aria-hidden />
          </span>
        </div>
        <div className="mt-2 rounded-lg border border-zinc-100 bg-zinc-50/90 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-950/50">
          <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700 dark:text-amber-300">
            <Crown className="size-3" aria-hidden />
            Head
          </p>
          <p className="mt-0.5 truncate text-[12px] font-semibold text-zinc-900 dark:text-zinc-100">
            {headLine}
          </p>
          {headMeta ? (
            <p className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">{headMeta}</p>
          ) : null}
        </div>
        <p className="mt-2 text-[10px] font-semibold text-zinc-600 dark:text-zinc-400">
          {memberCount} member{memberCount === 1 ? "" : "s"}
          {subsectionCount > 0 ? ` · ${subsectionCount} sub` : ""}
        </p>
        <p className="mt-1 text-[10px] font-semibold text-orange-700 dark:text-orange-300">
          Click to open members →
        </p>
      </div>
      <Handle type="source" position={Position.Bottom} id="out" className="!h-0.5 !w-0.5 !opacity-0" />
    </article>
  );
});

const PersonAnchorBox = memo(function PersonAnchorBox({
  data,
}: NodeProps<Node<PersonAnchorData, "personAnchor">>) {
  const meta = [data.personRole, data.companyName].filter(Boolean).join(" · ");
  return (
    <article
      style={{ width: SECTION_NODE_W, minHeight: PERSON_ANCHOR_H }}
      className="rounded-xl border border-zinc-200/90 bg-white px-3 py-2 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
    >
      <Handle type="target" position={Position.Top} id="in" className="!h-0.5 !w-0.5 !opacity-0" />
      <p className="truncate text-[13px] font-bold text-zinc-950 dark:text-zinc-50">
        {data.personName}
      </p>
      {meta ? (
        <p className="mt-0.5 truncate text-[10px] text-zinc-500 dark:text-zinc-400">{meta}</p>
      ) : null}
      <Handle type="source" position={Position.Bottom} id="out" className="!h-0.5 !w-0.5 !opacity-0" />
    </article>
  );
});

const sectionNodeTypes = {
  sectionBox: SectionBox,
  personAnchor: PersonAnchorBox,
};

function SectionTreeCanvas({
  sections,
  nodes,
  memberCountBySection,
  childrenByParent,
  onOpenSection,
}: {
  sections: OrgChartSectionRow[];
  nodes: OrgChartDiagramNode[];
  memberCountBySection: Map<string, number>;
  childrenByParent: Map<string | null, OrgChartSectionRow[]>;
  onOpenSection: (sectionId: string) => void;
}) {
  const { setViewport } = useReactFlow();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const peopleById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const { positions, personParentIds } = useMemo(
    () => computeSectionTreeLayout(sections, peopleById),
    [sections, peopleById],
  );

  const diagramSize = useMemo(() => {
    let w = 0;
    let h = 0;
    for (const [id, p] of positions) {
      const isPerson = id.startsWith(PERSON_PREFIX);
      w = Math.max(w, p.x + SECTION_NODE_W);
      h = Math.max(h, p.y + (isPerson ? PERSON_ANCHOR_H : SECTION_NODE_H));
    }
    return { w: Math.max(w, 400), h: Math.max(h, 280) };
  }, [positions]);

  const rfNodes = useMemo<SectionTreeNodeType[]>(() => {
    const sectionNodes: SectionTreeNodeType[] = sections.map((section) => ({
      id: section.id,
      type: "sectionBox",
      position: positions.get(section.id) ?? { x: 0, y: 0 },
      width: SECTION_NODE_W,
      height: SECTION_NODE_H,
      draggable: false,
      selectable: true,
      data: {
        section,
        memberCount: memberCountBySection.get(section.id) ?? 0,
        subsectionCount: (childrenByParent.get(section.id) ?? []).length,
      },
    }));
    const anchors: SectionTreeNodeType[] = [...personParentIds].map((personId) => {
      const person = peopleById.get(personId);
      return {
        id: personAnchorId(personId),
        type: "personAnchor",
        position: positions.get(personAnchorId(personId)) ?? { x: 0, y: 0 },
        width: SECTION_NODE_W,
        height: PERSON_ANCHOR_H,
        draggable: false,
        selectable: false,
        data: {
          personName: person?.personName ?? "Unknown person",
          personRole: person?.personRole ?? null,
          companyName: person?.companyName ?? null,
        },
      };
    });
    return [...anchors, ...sectionNodes];
  }, [
    sections,
    positions,
    memberCountBySection,
    childrenByParent,
    personParentIds,
    peopleById,
  ]);

  const rfEdges = useMemo<Edge[]>(() => {
    const edges: Edge[] = [];
    for (const s of sections) {
      if (!positions.has(s.id)) continue;
      if (s.reportsToNodeId) {
        const source = personAnchorId(s.reportsToNodeId);
        if (!positions.has(source)) continue;
        edges.push(
          orgStepEdge({
            id: `dept-person-edge-${s.id}`,
            source,
            target: s.id,
            sourceHandle: "out",
            targetHandle: "in",
            style: ORG_EDGE_NORMAL,
            zIndex: 0,
          }),
        );
      } else if (s.parentId && positions.has(s.parentId)) {
        edges.push(
          orgStepEdge({
            id: `dept-edge-${s.id}`,
            source: s.parentId,
            target: s.id,
            sourceHandle: "out",
            targetHandle: "in",
            style: ORG_EDGE_NORMAL,
            zIndex: 0,
          }),
        );
      }
    }
    return edges;
  }, [sections, positions]);

  const layoutKey = useMemo(
    () =>
      sections
        .map(
          (s) =>
            `${s.id}:${s.parentId ?? ""}:${s.reportsToNodeId ?? ""}:${s.sortOrder}`,
        )
        .join("|"),
    [sections],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height || !diagramSize.w || !diagramSize.h) return;
    const zoom = Math.min(
      Math.min(rect.width / diagramSize.w, rect.height / diagramSize.h),
      1.05,
    );
    setViewport({
      x: (rect.width - diagramSize.w * zoom) / 2,
      y: Math.max(16, (rect.height - diagramSize.h * zoom) / 2),
      zoom,
    });
  }, [setViewport, layoutKey, diagramSize]);

  const handleNodeClick = useCallback(
    (_event: unknown, node: Node) => {
      if (node.type === "sectionBox" && !node.id.startsWith(PERSON_PREFIX)) {
        onOpenSection(node.id);
      }
    },
    [onOpenSection],
  );

  return (
    <div className="relative h-[640px] w-full org-chart-flow">
      <div
        ref={containerRef}
        className="h-full w-full overflow-hidden rounded-2xl border border-zinc-200/80 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-950/40"
      >
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={sectionNodeTypes}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeClick}
          defaultEdgeOptions={
            {
              type: "smoothstep",
              pathOptions: ORG_STEP_PATH,
              style: ORG_EDGE_NORMAL,
            } as unknown as DefaultEdgeOptions
          }
          minZoom={0.05}
          maxZoom={2.5}
          nodesConnectable={false}
          nodesDraggable={false}
          edgesReconnectable={false}
          deleteKeyCode={null}
          elementsSelectable={false}
          selectNodesOnDrag={false}
          panOnDrag
          zoomOnScroll
          fitView={false}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={18}
            size={1.5}
            color="var(--org-line)"
          />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}

export function OrgChartDiagram({
  nodes,
  sections = [],
  busy,
  onReparent,
  onReparentMany,
  onMove,
  onRemove,
  onToggleParentLock,
  onSelectNode,
  onSelectionChange,
  highlightId = null,
  sectionNameById,
  eitherOrLinks = [],
  onCreateEitherOr,
  onRemoveEitherOr,
  onOpenEitherOrPicker,
  bulkReportsTo = "",
  onBulkReportsToChange,
  onBulkApply,
  bulkReportsToOptions,
  bulkMovableCount = 0,
}: {
  nodes: OrgChartDiagramNode[];
  /** Org-chart departments — top-level browse shows these (+ heads) instead of every person. */
  sections?: OrgChartSectionRow[];
  busy: boolean;
  onReparent: (id: string, parentId: string) => void;
  onReparentMany: (ids: string[], parentId: string) => void;
  onMove: (id: string, moveUp: boolean) => void;
  onRemove: (id: string, reports: number) => void;
  onToggleParentLock: (id: string, locked: boolean) => void;
  onSelectNode: (node: OrgChartNode | null) => void;
  onSelectionChange?: (ids: string[]) => void;
  highlightId?: string | null;
  sectionNameById?: Map<string, string>;
  eitherOrLinks?: OrgChartEitherOrLinkRow[];
  onCreateEitherOr?: (nodeAId: string, nodeBId: string) => void;
  onRemoveEitherOr?: (linkId: string) => void;
  onOpenEitherOrPicker?: (prefillA?: string, prefillB?: string) => void;
  bulkReportsTo?: string;
  onBulkReportsToChange?: (value: string) => void;
  onBulkApply?: () => void;
  bulkReportsToOptions?: BulkReportsToOptions;
  bulkMovableCount?: number;
}) {
  const [drillStack, setDrillStack] = useState<string[]>([]);
  const currentSectionId = drillStack.length > 0 ? drillStack[drillStack.length - 1]! : null;

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, OrgChartSectionRow[]>();
    for (const s of sections) {
      const list = map.get(s.parentId) ?? [];
      list.push(s);
      map.set(s.parentId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    }
    return map;
  }, [sections]);

  const sectionById = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections]);

  const rootSections = useMemo(() => {
    return sections.filter((s) => !s.parentId || !sectionById.has(s.parentId));
  }, [sections, sectionById]);

  const currentSection = currentSectionId ? sectionById.get(currentSectionId) ?? null : null;
  const childSections = currentSectionId
    ? (childrenByParent.get(currentSectionId) ?? [])
    : [];

  const scopedNodes = useMemo(() => {
    if (!currentSectionId) return [];
    return scopeNodesForSectionView(nodes, currentSectionId, childrenByParent);
  }, [nodes, currentSectionId, childrenByParent]);

  const scopedEitherOrLinks = useMemo(() => {
    if (!currentSectionId) return [];
    const ids = new Set(scopedNodes.map((n) => n.id));
    return eitherOrLinks.filter((l) => ids.has(l.nodeAId) && ids.has(l.nodeBId));
  }, [eitherOrLinks, scopedNodes, currentSectionId]);

  const memberCountBySection = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sections) {
      map.set(s.id, membersOfSectionTree(nodes, s.id, childrenByParent).length);
    }
    return map;
  }, [sections, nodes, childrenByParent]);

  function openSection(sectionId: string) {
    setDrillStack((prev) => [...prev, sectionId]);
    onSelectionChange?.([]);
    onSelectNode(null);
  }

  const handleOpenSection = useCallback(
    (sectionId: string) => {
      setDrillStack((prev) => [...prev, sectionId]);
      onSelectionChange?.([]);
      onSelectNode(null);
    },
    [onSelectionChange, onSelectNode],
  );

  function goBack() {
    setDrillStack((prev) => prev.slice(0, -1));
    onSelectionChange?.([]);
    onSelectNode(null);
  }

  function jumpToBreadcrumb(index: number) {
    setDrillStack((prev) => prev.slice(0, index + 1));
    onSelectionChange?.([]);
    onSelectNode(null);
  }

  // No sections yet — fall back to the classic full people chart.
  if (sections.length === 0) {
    return (
      <div className="space-y-3">
        <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-3 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          Create departments under <span className="font-semibold">Manage departments</span> to
          browse by group. Until then, all chart members are shown here.
        </p>
        <ReactFlowProvider>
          <OrgChartCanvas
            nodes={nodes}
            busy={busy}
            onReparent={onReparent}
            onReparentMany={onReparentMany}
            onMove={onMove}
            onRemove={onRemove}
            onToggleParentLock={onToggleParentLock}
            onSelectNode={onSelectNode}
            onSelectionChange={onSelectionChange}
            highlightId={highlightId}
            sectionNameById={sectionNameById}
            eitherOrLinks={eitherOrLinks}
            onCreateEitherOr={onCreateEitherOr}
            onRemoveEitherOr={onRemoveEitherOr}
            onOpenEitherOrPicker={onOpenEitherOrPicker}
            bulkReportsTo={bulkReportsTo}
            onBulkReportsToChange={onBulkReportsToChange}
            onBulkApply={onBulkApply}
            bulkReportsToOptions={bulkReportsToOptions}
            bulkMovableCount={bulkMovableCount}
          />
        </ReactFlowProvider>
      </div>
    );
  }

  if (!currentSectionId || !currentSection) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Department org chart — each box is a department and its head. Lines connect parent
          departments (or a person a department reports to). Click a department to open its
          members.
        </p>
        {rootSections.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
            No departments yet. Use Manage departments to create one.
          </p>
        ) : (
          <ReactFlowProvider>
            <SectionTreeCanvas
              sections={sections}
              nodes={nodes}
              memberCountBySection={memberCountBySection}
              childrenByParent={childrenByParent}
              onOpenSection={handleOpenSection}
            />
          </ReactFlowProvider>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <nav
            className="flex flex-wrap items-center gap-1 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400"
            aria-label="Department path"
          >
            <button
              type="button"
              className="hover:text-orange-600 dark:hover:text-orange-300"
              onClick={() => {
                setDrillStack([]);
                onSelectionChange?.([]);
                onSelectNode(null);
              }}
            >
              Department chart
            </button>
            {drillStack.map((id, index) => {
              const s = sectionById.get(id);
              if (!s) return null;
              const isLast = index === drillStack.length - 1;
              return (
                <span key={id} className="inline-flex items-center gap-1">
                  <span className="text-zinc-400">/</span>
                  {isLast ? (
                    <span className="text-zinc-800 dark:text-zinc-200">{s.name}</span>
                  ) : (
                    <button
                      type="button"
                      className="hover:text-orange-600 dark:hover:text-orange-300"
                      onClick={() => jumpToBreadcrumb(index)}
                    >
                      {s.name}
                    </button>
                  )}
                </span>
              );
            })}
          </nav>
          <h3 className="mt-1 text-lg font-bold text-zinc-950 dark:text-zinc-50">
            {currentSection.name}
          </h3>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-300">
              <Crown className="size-3.5" aria-hidden />
              {currentSection.headName?.trim() || "No head"}
            </span>
            {" · "}
            {scopedNodes.length} member{scopedNodes.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button type="button" variant="outline" className="h-9 rounded-xl" onClick={goBack}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back to chart
        </Button>
      </div>

      {childSections.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
            Child departments
          </span>
          {childSections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => openSection(section.id)}
              className="rounded-full border border-orange-300/70 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-800 transition hover:bg-orange-100 dark:border-orange-700/50 dark:bg-orange-950/30 dark:text-orange-200 dark:hover:bg-orange-950/50"
            >
              {section.name}
              <span className="ml-1 opacity-70">
                ({memberCountBySection.get(section.id) ?? 0})
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
          Members in this department
          {childSections.length > 0 ? " (includes sub-departments)" : ""}
        </p>
        {scopedNodes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
            No members assigned to this department or its sub-departments yet. Use Manage
            departments to add people.
          </p>
        ) : (
          <ReactFlowProvider>
            <OrgChartCanvas
              nodes={scopedNodes}
              busy={busy}
              onReparent={onReparent}
              onReparentMany={onReparentMany}
              onMove={onMove}
              onRemove={onRemove}
              onToggleParentLock={onToggleParentLock}
              onSelectNode={onSelectNode}
              onSelectionChange={onSelectionChange}
              highlightId={highlightId}
              sectionNameById={sectionNameById}
              eitherOrLinks={scopedEitherOrLinks}
              onCreateEitherOr={onCreateEitherOr}
              onRemoveEitherOr={onRemoveEitherOr}
              onOpenEitherOrPicker={onOpenEitherOrPicker}
              bulkReportsTo={bulkReportsTo}
              onBulkReportsToChange={onBulkReportsToChange}
              onBulkApply={onBulkApply}
              bulkReportsToOptions={bulkReportsToOptions}
              bulkMovableCount={bulkMovableCount}
            />
          </ReactFlowProvider>
        )}
      </div>
    </div>
  );
}

function OrgChartCanvas({
  nodes,
  busy,
  onReparent,
  onReparentMany,
  onMove,
  onRemove,
  onToggleParentLock,
  onSelectNode,
  onSelectionChange,
  highlightId,
  sectionNameById,
  eitherOrLinks,
  onCreateEitherOr,
  onRemoveEitherOr,
  onOpenEitherOrPicker,
  bulkReportsTo = "",
  onBulkReportsToChange,
  onBulkApply,
  bulkReportsToOptions,
  bulkMovableCount = 0,
}: {
  nodes: OrgChartDiagramNode[];
  busy: boolean;
  onReparent: (id: string, parentId: string) => void;
  onReparentMany: (ids: string[], parentId: string) => void;
  onMove: (id: string, moveUp: boolean) => void;
  onRemove: (id: string, reports: number) => void;
  onToggleParentLock: (id: string, locked: boolean) => void;
  onSelectNode: (node: OrgChartNode | null) => void;
  onSelectionChange?: (ids: string[]) => void;
  highlightId?: string | null;
  sectionNameById?: Map<string, string>;
  eitherOrLinks: OrgChartEitherOrLinkRow[];
  onCreateEitherOr?: (nodeAId: string, nodeBId: string) => void;
  onRemoveEitherOr?: (linkId: string) => void;
  onOpenEitherOrPicker?: (prefillA?: string, prefillB?: string) => void;
  bulkReportsTo?: string;
  onBulkReportsToChange?: (value: string) => void;
  onBulkApply?: () => void;
  bulkReportsToOptions?: BulkReportsToOptions;
  bulkMovableCount?: number;
}) {
  const { setViewport } = useReactFlow();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { positions, childrenOf } = useMemo(() => computeLayout(nodes), [nodes]);

  const diagramSize = useMemo(() => {
    let w = 0;
    let h = 0;
    for (const p of positions.values()) {
      w = Math.max(w, p.x + NODE_W);
      h = Math.max(h, p.y + NODE_H);
    }
    return { w, h };
  }, [positions]);

  const descendants = useMemo(() => {
    const result = new Map<string, Set<string>>();
    const visit = (id: string): Set<string> => {
      const set = new Set<string>();
      for (const child of childrenOf.get(id) ?? []) {
        set.add(child.id);
        for (const d of visit(child.id)) set.add(d);
      }
      return set;
    };
    for (const n of nodes) result.set(n.id, visit(n.id));
    return result;
  }, [childrenOf, nodes]);

  const siblingInfo = useMemo(() => {
    const info = new Map<string, { index: number; count: number }>();
    for (const list of childrenOf.values()) {
      list.forEach((n, index) => info.set(n.id, { index, count: list.length }));
    }
    for (const n of nodes) {
      if (!info.has(n.id)) info.set(n.id, { index: 0, count: 1 });
    }
    return info;
  }, [childrenOf, nodes]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedIdsRef = useRef<Set<string>>(new Set());
  const overIdRef = useRef<string | null>(null);
  const dragIdsRef = useRef<Set<string> | null>(null);
  const draggingRef = useRef(false);
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  function updateSelection(next: Set<string>) {
    selectedIdsRef.current = next;
    setSelectedIds(next);
    onSelectionChangeRef.current?.([...next]);
  }

  function handleNodeClick(event: React.MouseEvent, node: Node) {
    if (node.type !== "orgBox") return;
    const orgNode = node as OrgBoxNodeType;
    const multi = event.shiftKey || event.metaKey || event.ctrlKey;
    const next = new Set(selectedIdsRef.current);
    if (multi) {
      if (next.has(orgNode.id)) next.delete(orgNode.id);
      else next.add(orgNode.id);
    } else {
      next.clear();
      next.add(orgNode.id);
    }
    updateSelection(next);
    onSelectNode(next.has(orgNode.id) ? orgNode.data.node : null);
  }

  function isEligibleTarget(dragging: Set<string>, targetId: string) {
    if (dragging.has(targetId)) return false;
    for (const id of dragging) {
      if (descendants.get(id)?.has(targetId)) return false;
    }
    return true;
  }

  const layerById = useMemo(() => orgChartLayerById(nodes), [nodes]);

  const layoutNodes = useMemo<DiagramNode[]>(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const sharedKidsByPeer = new Map<string, number>();
    for (const link of eitherOrLinks) {
      const count = nodes.filter((c) => c.parentEitherOrLinkId === link.id).length;
      if (count === 0) continue;
      // Layout parent (nodeA) already counted via childrenOf; credit nodeB only.
      sharedKidsByPeer.set(
        link.nodeBId,
        (sharedKidsByPeer.get(link.nodeBId) ?? 0) + count,
      );
    }
    const personNodes: OrgBoxNodeType[] = nodes.map((n) => {
      const sibling = siblingInfo.get(n.id) ?? { index: 0, count: 1 };
      const selected = selectedIds.has(n.id);
      const managerOptions = nodes.filter(
        (m) => m.id !== n.id && !(descendants.get(n.id)?.has(m.id) ?? false),
      );
      const eitherOrParentOptions = eitherOrLinks
        .filter((link) => {
          if (link.nodeAId === n.id || link.nodeBId === n.id) return false;
          if (descendants.get(n.id)?.has(link.nodeAId)) return false;
          if (descendants.get(n.id)?.has(link.nodeBId)) return false;
          return true;
        })
        .map((link) => ({
          value: encodeReportsToValue({ parentEitherOrLinkId: link.id }),
          label: eitherOrLinkLabel(link, byId),
        }));
      return {
        id: n.id,
        type: "orgBox",
        position: positions.get(n.id) ?? { x: 0, y: 0 },
        width: NODE_W,
        height: NODE_H,
        selectable: true,
        draggable: !n.parentLocked,
        selected,
        zIndex: 1,
        data: {
          node: n,
          kidsCount:
            (childrenOf.get(n.id) ?? []).length + (sharedKidsByPeer.get(n.id) ?? 0),
          managersByLayer: groupManagersByLayer(managerOptions, layerById),
          eitherOrParentOptions,
          reportsToValue: encodeReportsToValue({
            parentId: n.parentId,
            parentEitherOrLinkId: n.parentEitherOrLinkId,
          }),
          nodeLayer: layerById.get(n.id) ?? 1,
          siblingIndex: sibling.index,
          siblingCount: sibling.count,
          busy,
          selected,
          sectionLabel: sectionLabelForNode(n, sectionNameById),
          onReparent,
          onMove,
          onRemove,
          onToggleParentLock,
        },
      };
    });
    return personNodes;
  }, [
    nodes,
    positions,
    childrenOf,
    descendants,
    siblingInfo,
    layerById,
    busy,
    selectedIds,
    sectionNameById,
    eitherOrLinks,
    onReparent,
    onMove,
    onRemove,
    onToggleParentLock,
  ]);

  const [liveNodes, setLiveNodes] = useState<DiagramNode[]>(layoutNodes);

  useEffect(() => {
    if (draggingRef.current) return;
    setLiveNodes(layoutNodes);
  }, [layoutNodes]);

  const rfEdges = useMemo<Edge[]>(() => {
    const linkById = new Map(eitherOrLinks.map((l) => [l.id, l]));
    const hierarchy = nodes
      .filter((n) => n.parentId && positions.has(n.parentId))
      .flatMap((n) => {
        const shared = n.parentEitherOrLinkId
          ? linkById.get(n.parentEitherOrLinkId)
          : undefined;

        // Shared either/or parent: clean V from both peers into the child top.
        if (shared) {
          const peers = [shared.nodeAId, shared.nodeBId]
            .filter((id) => positions.has(id))
            .sort((a, b) => (positions.get(a)!.x - positions.get(b)!.x));
          if (peers.length >= 2) {
            return peers.map((sourceId, i) =>
              orgStepEdge(
                {
                  id: `edge-shared-${n.id}-${sourceId}`,
                  source: sourceId,
                  target: n.id,
                  sourceHandle: "out",
                  targetHandle: i === 0 ? "in-left" : "in-right",
                  style: ORG_EDGE_SHARED,
                  zIndex: 0,
                },
                { borderRadius: 10, offset: i === 0 ? 28 : 28 },
              ),
            );
          }
          const sourceId = peers[0] ?? n.parentId!;
          return [
            orgStepEdge({
              id: `edge-shared-${n.id}-${sourceId}`,
              source: sourceId,
              target: n.id,
              sourceHandle: "out",
              targetHandle: "in",
              style: ORG_EDGE_SHARED,
              zIndex: 0,
            }),
          ];
        }

        return [
          orgStepEdge({
            id: `edge-${n.id}`,
            source: n.parentId!,
            target: n.id,
            sourceHandle: "out",
            targetHandle: "in",
            style: ORG_EDGE_NORMAL,
            zIndex: 0,
          }),
        ];
      });

    const peers: Edge[] = [];
    for (const link of eitherOrLinks) {
      if (!positions.has(link.nodeAId) || !positions.has(link.nodeBId)) continue;
      const a = positions.get(link.nodeAId)!;
      const b = positions.get(link.nodeBId)!;
      const aIsLeft = a.x <= b.x;
      const sameRow = Math.abs(a.y - b.y) < 12;
      peers.push({
        id: `either-or-${link.id}`,
        source: link.nodeAId,
        target: link.nodeBId,
        sourceHandle: aIsLeft ? "peer-right" : "peer-left",
        targetHandle: aIsLeft ? "peer-in-left" : "peer-in-right",
        type: sameRow ? "straight" : "smoothstep",
        pathOptions: sameRow ? undefined : { borderRadius: 8, offset: 16 },
        style: {
          ...ORG_EDGE_SHARED,
          strokeWidth: 1.5,
        },
        zIndex: 1,
        data: { linkId: link.id, kind: "either-or" },
      } as Edge);
    }
    return [...hierarchy, ...peers];
  }, [nodes, positions, eitherOrLinks]);

  const layoutKey = useMemo(
    () =>
      nodes
        .map((n) => `${n.id}:${n.parentId}:${n.parentEitherOrLinkId ?? ""}:${n.parentLocked}:${n.sortOrder}`)
        .join("|"),
    [nodes],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height || !diagramSize.w || !diagramSize.h) return;
    const zoom = Math.min(
      Math.min(rect.width / diagramSize.w, rect.height / diagramSize.h),
      1.05,
    );
    setViewport({
      x: (rect.width - diagramSize.w * zoom) / 2,
      y: (rect.height - diagramSize.h * zoom) / 2,
      zoom,
    });
  }, [setViewport, layoutKey, diagramSize]);

  useEffect(() => {
    const alive = new Set(nodes.map((n) => n.id));
    const next = new Set([...selectedIdsRef.current].filter((id) => alive.has(id)));
    if (next.size !== selectedIdsRef.current.size) {
      updateSelection(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when node ids change
  }, [layoutKey]);

  const nodeElsRef = useRef<Map<string, DOMRect>>(new Map());

  function measureNodeRects() {
    const el = containerRef.current;
    if (!el) return;
    const next = new Map<string, DOMRect>();
    for (const wrapper of el.querySelectorAll<HTMLElement>(".react-flow__node")) {
      const id = wrapper.getAttribute("data-id");
      if (id) next.set(id, wrapper.getBoundingClientRect());
    }
    nodeElsRef.current = next;
  }

  function nodeAtScreenPoint(clientX: number, clientY: number): string | null {
    let hit: string | null = null;
    const rects = nodeElsRef.current;
    for (const [id, r] of rects) {
      if (dragIdsRef.current?.has(id)) continue;
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        hit = id;
      }
    }
    return hit;
  }

  function setDropTargetClass(nextId: string | null) {
    const el = containerRef.current;
    if (!el) return;
    const prev = overIdRef.current;
    if (prev === nextId) return;
    if (prev) {
      el.querySelector(`[data-box-id="${prev}"]`)?.classList.remove("org-chart-drop-target");
    }
    if (nextId) {
      el.querySelector(`[data-box-id="${nextId}"]`)?.classList.add("org-chart-drop-target");
    }
    overIdRef.current = nextId;
  }

  useEffect(() => {
    measureNodeRects();
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (!draggingRef.current) measureNodeRects();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [layoutKey, diagramSize]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    for (const box of el.querySelectorAll<HTMLElement>("[data-box-id]")) {
      box.classList.toggle("org-chart-picked", box.getAttribute("data-box-id") === highlightId);
    }
  });

  const onNodesChange = useCallback((changes: NodeChange<DiagramNode>[]) => {
    if (!draggingRef.current) return;
    const positionChanges = changes.filter((change) => change.type === "position");
    if (positionChanges.length === 0) return;
    setLiveNodes((current) => applyNodeChanges(positionChanges, current));
  }, []);

  const selectedPair = useMemo(() => {
    if (selectedIds.size !== 2) return null;
    const [a, b] = [...selectedIds];
    return a && b ? ([a, b] as const) : null;
  }, [selectedIds]);

  const existingPairLink = useMemo(() => {
    if (!selectedPair) return null;
    const [a, b] = selectedPair;
    return (
      eitherOrLinks.find(
        (l) =>
          (l.nodeAId === a && l.nodeBId === b) || (l.nodeAId === b && l.nodeBId === a),
      ) ?? null
    );
  }, [eitherOrLinks, selectedPair]);

  return (
    <div className="relative h-[640px] w-full org-chart-flow">
      {selectedIds.size >= 2 && bulkReportsToOptions && onBulkApply && onBulkReportsToChange ? (
        <div
          className="absolute inset-x-3 top-3 z-20 rounded-xl border border-orange-300/90 bg-white/95 px-3 py-2.5 shadow-md backdrop-blur-sm dark:border-orange-800 dark:bg-zinc-900/95"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <OrgChartBulkReportsBar
            selectedCount={selectedIds.size}
            movableCount={bulkMovableCount}
            value={bulkReportsTo}
            onChange={onBulkReportsToChange}
            onApply={onBulkApply}
            busy={busy}
            options={bulkReportsToOptions}
          />
        </div>
      ) : null}
      {selectedPair && (onOpenEitherOrPicker || onCreateEitherOr || onRemoveEitherOr) ? (
        <div
          className={`absolute right-3 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-300/90 bg-white/95 px-3 py-2 shadow-md backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/95 ${
            selectedIds.size >= 2 && bulkReportsToOptions && onBulkApply && onBulkReportsToChange
              ? "top-[4.75rem]"
              : "top-3"
          }`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {existingPairLink ? (
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-lg px-3 text-xs"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRemoveEitherOr?.(existingPairLink.id);
              }}
            >
              <Link2Off className="mr-1.5 h-3.5 w-3.5" />
              Unlink either / or
            </Button>
          ) : (
            <Button
              type="button"
              className="h-9 rounded-lg bg-orange-600 px-3 text-xs text-white hover:bg-orange-500"
              disabled={busy || (!onOpenEitherOrPicker && !onCreateEitherOr)}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onOpenEitherOrPicker) {
                  onOpenEitherOrPicker(selectedPair[0], selectedPair[1]);
                  return;
                }
                onCreateEitherOr?.(selectedPair[0], selectedPair[1]);
              }}
            >
              <GitCompareArrows className="mr-1.5 h-3.5 w-3.5" />
              Link either / or
            </Button>
          )}
        </div>
      ) : null}
      <div
        ref={containerRef}
        className="h-full w-full overflow-hidden rounded-2xl border border-zinc-200/80 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-950/40"
      >
      <ReactFlow
        nodes={liveNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={
          {
            type: "smoothstep",
            pathOptions: ORG_STEP_PATH,
            style: ORG_EDGE_NORMAL,
          } as unknown as DefaultEdgeOptions
        }
        minZoom={0.05}
        maxZoom={2.5}
        nodesConnectable={false}
        edgesReconnectable={false}
        deleteKeyCode={null}
        elementsSelectable={false}
        selectNodesOnDrag={false}
        onlyRenderVisibleElements
        elevateNodesOnSelect={false}
        autoPanOnNodeDrag={false}
        multiSelectionKeyCode={["Shift"]}
        onPaneClick={() => {
          updateSelection(new Set());
          onSelectNode(null);
        }}
        onNodesChange={onNodesChange}
        onNodeClick={(event, node) => handleNodeClick(event, node)}
        onNodeDragStart={(_, node) => {
          if (node.type !== "orgBox") return;
          if (!("node" in node.data) || node.data.node.parentLocked) return;
          const dragSet = new Set(selectedIdsRef.current);
          if (!dragSet.has(node.id)) {
            dragSet.clear();
            dragSet.add(node.id);
          }
          for (const id of [...dragSet]) {
            const n = nodes.find((x) => x.id === id);
            if (n?.parentLocked) dragSet.delete(id);
          }
          if (dragSet.size === 0) return;
          draggingRef.current = true;
          dragIdsRef.current = dragSet;
          setDropTargetClass(null);
          measureNodeRects();
          onSelectNode(node.data.node);
        }}
        onNodeDrag={(event) => {
          if (!dragIdsRef.current) return;
          const cx = "clientX" in event ? event.clientX : 0;
          const cy = "clientY" in event ? event.clientY : 0;
          const hit = nodeAtScreenPoint(cx, cy);
          const next = hit && isEligibleTarget(dragIdsRef.current, hit) ? hit : null;
          setDropTargetClass(next);
        }}
        onNodeDragStop={(_, node) => {
          const draggedSet = dragIdsRef.current ?? new Set([node.id]);
          const target = overIdRef.current;
          draggingRef.current = false;
          dragIdsRef.current = null;
          setDropTargetClass(null);
          setLiveNodes(layoutNodes);
          if (target && isEligibleTarget(draggedSet, target)) {
            const ids = [...draggedSet];
            if (ids.length > 1) {
              onReparentMany(ids, target);
            } else {
              onReparent(ids[0], target);
            }
          }
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={18}
          size={1.5}
          color="var(--org-line)"
        />
        <Controls showInteractive={false} />
      </ReactFlow>
      </div>
    </div>
  );
}
