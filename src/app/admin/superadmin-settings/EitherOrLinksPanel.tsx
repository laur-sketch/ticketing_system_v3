"use client";

import { useMemo, useState } from "react";
import { GitCompareArrows, Link2, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import { eitherOrLinkLabel } from "@/app/admin/superadmin-settings/org-chart-layers";

export type EitherOrLinkRow = {
  id: string;
  nodeAId: string;
  nodeBId: string;
};

type NodeRow = {
  id: string;
  personName: string;
  personRole: string | null;
  companyName: string | null;
};

export function EitherOrLinksPanel({
  nodes,
  eitherOrLinks,
  busy,
  onCreate,
  onRemove,
}: {
  nodes: NodeRow[];
  eitherOrLinks: EitherOrLinkRow[];
  busy: boolean;
  onCreate: (nodeAId: string, nodeBId: string) => void;
  onRemove: (linkId: string) => void;
}) {
  const [nodeAId, setNodeAId] = useState("");
  const [nodeBId, setNodeBId] = useState("");

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n] as const)), [nodes]);

  const sortedNodes = useMemo(
    () => [...nodes].sort((a, b) => a.personName.localeCompare(b.personName)),
    [nodes],
  );

  const canCreate =
    Boolean(nodeAId && nodeBId && nodeAId !== nodeBId) &&
    !eitherOrLinks.some(
      (link) =>
        (link.nodeAId === nodeAId && link.nodeBId === nodeBId) ||
        (link.nodeAId === nodeBId && link.nodeBId === nodeAId),
    );

  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white/95 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <GitCompareArrows className="h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Link relations (either / or)
            </h2>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            Pair two org members so either person can satisfy the same approval step. Linked
            pairs also appear as shared &quot;reports to&quot; options where hierarchy is used.
          </p>
        </div>
        {eitherOrLinks.length > 0 ? (
          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {eitherOrLinks.length} link{eitherOrLinks.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <label className="block min-w-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
          Person A
          <select
            value={nodeAId}
            disabled={busy || sortedNodes.length === 0}
            onChange={(e) => setNodeAId(e.target.value)}
            className="mt-1.5 h-10 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm text-zinc-900 outline-none focus:border-orange-500/60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <option value="">Select member…</option>
            {sortedNodes.map((n) => (
              <option key={n.id} value={n.id} disabled={n.id === nodeBId}>
                {n.personName}
                {n.personRole ? ` · ${n.personRole}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
          Person B
          <select
            value={nodeBId}
            disabled={busy || sortedNodes.length === 0}
            onChange={(e) => setNodeBId(e.target.value)}
            className="mt-1.5 h-10 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm text-zinc-900 outline-none focus:border-orange-500/60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <option value="">Select member…</option>
            {sortedNodes.map((n) => (
              <option key={n.id} value={n.id} disabled={n.id === nodeAId}>
                {n.personName}
                {n.personRole ? ` · ${n.personRole}` : ""}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          disabled={busy || !canCreate}
          className="h-10 rounded-xl"
          onClick={() => {
            onCreate(nodeAId, nodeBId);
            setNodeAId("");
            setNodeBId("");
          }}
        >
          <Link2 className="mr-1.5 h-3.5 w-3.5" />
          Link as either / or
        </Button>
      </div>

      {sortedNodes.length === 0 ? (
        <p className="mt-4 text-xs text-zinc-500">
          Add people to the org roster before creating link relations.
        </p>
      ) : null}

      <div className="mt-5">
        {eitherOrLinks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-500 dark:border-zinc-700">
            No either/or links yet.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-700">
            {eitherOrLinks.map((link) => {
              const label = eitherOrLinkLabel(link, byId);
              const a = byId.get(link.nodeAId);
              const b = byId.get(link.nodeBId);
              return (
                <li
                  key={link.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {label}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                      {[a?.companyName, b?.companyName].filter(Boolean).join(" · ") ||
                        "Either person can approve for the other"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    className="h-8 rounded-lg px-2.5 text-xs"
                    onClick={() => onRemove(link.id)}
                  >
                    <Link2Off className="mr-1 h-3.5 w-3.5" />
                    Unlink
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
