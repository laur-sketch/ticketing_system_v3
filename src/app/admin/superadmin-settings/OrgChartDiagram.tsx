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
import type { Edge, Node, NodeChange, NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, GitCompareArrows, Link2Off, Lock, LockOpen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  OrgChartBulkReportsBar,
  type BulkReportsToOptions,
} from "./OrgChartBulkReportsBar";
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
const NODE_H = 224;
const X_GAP = 48;
const X_ROOT_GAP = 72;
const Y_GAP = 64;
/** Rounded elbow routing for hierarchy connectors. */
const ORG_STEP_PATH = { borderRadius: 12, offset: 36 } as const;
const ORG_PEER_HANDLE_TOP = "38%";
const ORG_CHILD_IN_LEFT = "32%";
const ORG_CHILD_IN_RIGHT = "68%";

const ORG_EDGE_NORMAL: Edge["style"] = {
  stroke: "var(--org-line)",
  strokeWidth: 1.75,
};

const ORG_EDGE_SHARED: Edge["style"] = {
  stroke: "#ea580c",
  strokeWidth: 1.75,
  strokeDasharray: "5 4",
};

function orgStepEdge(
  partial: Omit<Edge, "type"> & { type?: Edge["type"] },
  pathOptions: { borderRadius: number; offset: number } = ORG_STEP_PATH,
): Edge {
  return {
    type: "step",
    pathOptions,
    ...partial,
  };
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
      title={`${node.personName}\n${roleLine}${sectionLabel ? `\nSection: ${sectionLabel}` : ""}`}
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

/** Angular (elbow) tree layout: children centered under their manager. */
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

export function OrgChartDiagram({
  nodes,
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
  bulkReportsTo = "",
  onBulkReportsToChange,
  onBulkApply,
  bulkReportsToOptions,
  bulkMovableCount = 0,
}: {
  nodes: OrgChartNode[];
  busy: boolean;
  onReparent: (id: string, parentId: string) => void;
  onReparentMany: (ids: string[], parentId: string) => void;
  onMove: (id: string, moveUp: boolean) => void;
  onRemove: (id: string, reports: number) => void;
  onToggleParentLock: (id: string, locked: boolean) => void;
  /** Card clicked on the chart → selected in the Add/Remove panel. */
  onSelectNode: (node: OrgChartNode | null) => void;
  /** Multi-selection for bulk remove / panel status. */
  onSelectionChange?: (ids: string[]) => void;
  /** Node id picked in the Add/Remove panel → highlighted on the chart. */
  highlightId?: string | null;
  /** Optional section labels keyed by section id. */
  sectionNameById?: Map<string, string>;
  /** Either/or approval relation lines between two nodes. */
  eitherOrLinks?: OrgChartEitherOrLinkRow[];
  onCreateEitherOr?: (nodeAId: string, nodeBId: string) => void;
  onRemoveEitherOr?: (linkId: string) => void;
  bulkReportsTo?: string;
  onBulkReportsToChange?: (value: string) => void;
  onBulkApply?: () => void;
  bulkReportsToOptions?: BulkReportsToOptions;
  bulkMovableCount?: number;
}) {
  return (
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
        bulkReportsTo={bulkReportsTo}
        onBulkReportsToChange={onBulkReportsToChange}
        onBulkApply={onBulkApply}
        bulkReportsToOptions={bulkReportsToOptions}
        bulkMovableCount={bulkMovableCount}
      />
    </ReactFlowProvider>
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
  bulkReportsTo = "",
  onBulkReportsToChange,
  onBulkApply,
  bulkReportsToOptions,
  bulkMovableCount = 0,
}: {
  nodes: OrgChartNode[];
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

  function handleNodeClick(event: React.MouseEvent, node: OrgBoxNodeType) {
    const multi = event.shiftKey || event.metaKey || event.ctrlKey;
    const next = new Set(selectedIdsRef.current);
    if (multi) {
      if (next.has(node.id)) next.delete(node.id);
      else next.add(node.id);
    } else {
      next.clear();
      next.add(node.id);
    }
    updateSelection(next);
    onSelectNode(next.has(node.id) ? node.data.node : null);
  }

  function isEligibleTarget(dragging: Set<string>, targetId: string) {
    if (dragging.has(targetId)) return false;
    for (const id of dragging) {
      if (descendants.get(id)?.has(targetId)) return false;
    }
    return true;
  }

  const layerById = useMemo(() => orgChartLayerById(nodes), [nodes]);

  const layoutNodes = useMemo<OrgBoxNodeType[]>(() => {
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
    return nodes.map((n) => {
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
          sectionLabel: n.sectionId ? (sectionNameById?.get(n.sectionId) ?? null) : null,
          onReparent,
          onMove,
          onRemove,
          onToggleParentLock,
        },
      };
    });
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

  const [liveNodes, setLiveNodes] = useState<OrgBoxNodeType[]>(layoutNodes);

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
        type: sameRow ? "straight" : "step",
        pathOptions: sameRow ? undefined : { borderRadius: 8, offset: 16 },
        style: {
          ...ORG_EDGE_SHARED,
          strokeWidth: 1.5,
        },
        zIndex: 1,
        data: { linkId: link.id, kind: "either-or" },
      });
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

  const onNodesChange = useCallback((changes: NodeChange<OrgBoxNodeType>[]) => {
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
          {selectedPair && (onCreateEitherOr || onRemoveEitherOr) ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-orange-200/80 pt-2 dark:border-orange-900/40">
              <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">
                Either / or approval
              </span>
              {existingPairLink ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 rounded-lg px-2 text-xs"
                  disabled={busy}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRemoveEitherOr?.(existingPairLink.id);
                  }}
                >
                  <Link2Off className="mr-1 h-3.5 w-3.5" />
                  Remove link
                </Button>
              ) : (
                <Button
                  type="button"
                  className="h-8 rounded-lg bg-orange-600 px-2 text-xs text-white hover:bg-orange-500"
                  disabled={busy || !onCreateEitherOr}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onCreateEitherOr?.(selectedPair[0], selectedPair[1]);
                  }}
                >
                  <GitCompareArrows className="mr-1 h-3.5 w-3.5" />
                  Link as either / or
                </Button>
              )}
            </div>
          ) : null}
        </div>
      ) : selectedPair && (onCreateEitherOr || onRemoveEitherOr) ? (
        <div
          className="absolute left-3 top-3 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-orange-300/80 bg-white/95 px-3 py-2 shadow-sm dark:border-orange-800 dark:bg-zinc-900/95"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">
            Either / or approval
          </span>
          {existingPairLink ? (
            <Button
              type="button"
              variant="outline"
              className="h-8 rounded-lg px-2 text-xs"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRemoveEitherOr?.(existingPairLink.id);
              }}
            >
              <Link2Off className="mr-1 h-3.5 w-3.5" />
              Remove link
            </Button>
          ) : (
            <Button
              type="button"
              className="h-8 rounded-lg bg-orange-600 px-2 text-xs text-white hover:bg-orange-500"
              disabled={busy || !onCreateEitherOr}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onCreateEitherOr?.(selectedPair[0], selectedPair[1]);
              }}
            >
              <GitCompareArrows className="mr-1 h-3.5 w-3.5" />
              Link as either / or
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
        defaultEdgeOptions={{
          type: "step",
          pathOptions: ORG_STEP_PATH,
          style: ORG_EDGE_NORMAL,
        }}
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
          if (node.data.node.parentLocked) return;
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
