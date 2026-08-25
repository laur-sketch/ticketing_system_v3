"use client";

import type { OrgChartNode } from "@prisma/client/primary";
import { useCallback, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Crown,
  FolderKanban,
  Pencil,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export type OrgChartSectionRow = {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  parentId: string | null;
  companyTeamId: string | null;
  companyName: string | null;
  headNodeId: string | null;
  headName: string | null;
  headRole: string | null;
  headCompanyName: string | null;
  memberCount: number;
};

type OrgChartNodeRow = OrgChartNode & {
  sectionMemberships: Array<{ sectionId: string }>;
};

type CompanyOption = { id: string; name: string };

export function OrgChartSectionsPanel({
  sections,
  nodes,
  companyOptions,
  busy,
  chartSelectedIds,
  onSectionsChange,
  onNodesChange,
  onSelectMember,
  onMessage,
  onError,
  setBusy,
}: {
  sections: OrgChartSectionRow[];
  nodes: OrgChartNodeRow[];
  companyOptions: CompanyOption[];
  busy: boolean;
  chartSelectedIds: string[];
  onSectionsChange: (next: OrgChartSectionRow[]) => void;
  onNodesChange: (next: OrgChartNode[]) => void;
  onSelectMember: (node: OrgChartNodeRow) => void;
  onMessage: (msg: string | null) => void;
  onError: (msg: string | null) => void;
  setBusy: (busy: boolean) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [parentIdForCreate, setParentIdForCreate] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [companyTeamId, setCompanyTeamId] = useState("");
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [dropSectionId, setDropSectionId] = useState<string | null>(null);

  const nodesBySection = useMemo(() => {
    const map = new Map<string | null, OrgChartNodeRow[]>();
    for (const n of nodes) {
      if (n.sectionMemberships.length === 0) {
        const list = map.get(null) ?? [];
        list.push(n);
        map.set(null, list);
        continue;
      }
      for (const membership of n.sectionMemberships) {
        const list = map.get(membership.sectionId) ?? [];
        list.push(n);
        map.set(membership.sectionId, list);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.personName.localeCompare(b.personName));
    }
    return map;
  }, [nodes]);

  const { roots, childrenByParent } = useMemo(() => {
    const byParent = new Map<string, OrgChartSectionRow[]>();
    const top: OrgChartSectionRow[] = [];
    for (const s of sections) {
      if (s.parentId) {
        const list = byParent.get(s.parentId) ?? [];
        list.push(s);
        byParent.set(s.parentId, list);
      } else {
        top.push(s);
      }
    }
    for (const list of byParent.values()) {
      list.sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      );
    }
    top.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    return { roots: top, childrenByParent: byParent };
  }, [sections]);

  const sectionById = useMemo(() => {
    const map = new Map(sections.map((s) => [s.id, s]));
    return map;
  }, [sections]);

  const unassigned = nodesBySection.get(null) ?? [];

  function resetForm() {
    setCreating(false);
    setEditId(null);
    setParentIdForCreate(null);
    setName("");
    setDescription("");
    setCompanyTeamId("");
  }

  function startCreateMain() {
    setEditId(null);
    setParentIdForCreate(null);
    setCreating(true);
    setName("");
    setDescription("");
    setCompanyTeamId("");
  }

  function startCreateSubsection(parent: OrgChartSectionRow) {
    setEditId(null);
    setParentIdForCreate(parent.id);
    setCreating(true);
    setName("");
    setDescription("");
    setCompanyTeamId(parent.companyTeamId ?? "");
    setCollapsed((prev) => ({ ...prev, [parent.id]: false }));
  }

  function startEdit(section: OrgChartSectionRow) {
    setCreating(false);
    setParentIdForCreate(section.parentId);
    setEditId(section.id);
    setName(section.name);
    setDescription(section.description ?? "");
    setCompanyTeamId(section.companyTeamId ?? "");
  }

  const reloadSections = useCallback(async () => {
    const res = await fetch("/api/admin/org-chart-sections", { cache: "no-store" });
    if (!res.ok) throw new Error("Could not reload sections.");
    const body = (await res.json()) as OrgChartSectionRow[];
    onSectionsChange(body);
  }, [onSectionsChange]);

  const reloadNodes = useCallback(async () => {
    const res = await fetch("/api/admin/org-chart", { cache: "no-store" });
    if (!res.ok) throw new Error("Could not reload chart members.");
    const body = (await res.json()) as OrgChartNodeRow[];
    onNodesChange(body);
  }, [onNodesChange]);

  async function saveSection() {
    const trimmed = name.trim();
    if (!trimmed) {
      onError("Enter a section name.");
      return;
    }
    setBusy(true);
    onError(null);
    onMessage(null);
    try {
      const payload: Record<string, unknown> = {
        name: trimmed,
        description: description.trim() || null,
        companyTeamId: companyTeamId || null,
      };
      if (editId) {
        payload.id = editId;
      } else if (parentIdForCreate) {
        payload.parentId = parentIdForCreate;
      }
      const res = await fetch("/api/admin/org-chart-sections", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body?.error === "string" ? body.error : "Could not save section.",
        );
      }
      await reloadSections();
      const kind = parentIdForCreate && !editId ? "subsection" : "section";
      onMessage(
        editId ? `Updated ${kind} “${trimmed}”.` : `Created ${kind} “${trimmed}”.`,
      );
      resetForm();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not save section.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSection(section: OrgChartSectionRow) {
    function collectDescendantIds(sectionId: string): string[] {
      const ids: string[] = [];
      const stack = [...(childrenByParent.get(sectionId) ?? [])];
      while (stack.length > 0) {
        const child = stack.pop()!;
        ids.push(child.id);
        stack.push(...(childrenByParent.get(child.id) ?? []));
      }
      return ids;
    }

    function countMembersInSubtree(sectionId: string): number {
      let total = nodesBySection.get(sectionId)?.length ?? 0;
      for (const child of childrenByParent.get(sectionId) ?? []) {
        total += countMembersInSubtree(child.id);
      }
      return total;
    }

    const descendantIds = collectDescendantIds(section.id);
    const members = countMembersInSubtree(section.id);
    const bits: string[] = [];
    if (descendantIds.length > 0) {
      bits.push(
        `${descendantIds.length} nested subsection${descendantIds.length === 1 ? "" : "s"} will also be deleted`,
      );
    }
    if (members > 0) {
      bits.push(
        `${members} section membership${members === 1 ? "" : "s"} will be removed (hierarchy stays)`,
      );
    }
    const ok = window.confirm(
      bits.length > 0
        ? `Delete “${section.name}”? ${bits.join(". ")}.`
        : `Delete “${section.name}”?`,
    );
    if (!ok) return;

    setBusy(true);
    onError(null);
    onMessage(null);
    try {
      const res = await fetch(
        `/api/admin/org-chart-sections?id=${encodeURIComponent(section.id)}`,
        { method: "DELETE" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body?.error === "string" ? body.error : "Could not delete section.",
        );
      }
      await reloadNodes();
      await reloadSections();
      onMessage(`Deleted “${section.name}”.`);
      if (editId === section.id || parentIdForCreate === section.id) resetForm();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not delete section.");
    } finally {
      setBusy(false);
    }
  }

  async function setSectionHead(sectionId: string, headNodeId: string | null) {
    setBusy(true);
    onError(null);
    onMessage(null);
    try {
      const res = await fetch("/api/admin/org-chart-sections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sectionId, headNodeId }),
      });
      const body = (await res.json().catch(() => ({}))) as OrgChartSectionRow & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(body.error ?? "Could not update section head.");
      }
      await reloadSections();
      const section = sectionById.get(sectionId);
      if (headNodeId) {
        const personName =
          body.headName ??
          nodesBySection.get(sectionId)?.find((n) => n.id === headNodeId)?.personName ??
          "Member";
        onMessage(`Set ${personName} as head of “${section?.name ?? body.name}”.`);
      } else {
        onMessage(`Cleared head for “${section?.name ?? body.name}”.`);
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not update section head.");
    } finally {
      setBusy(false);
    }
  }

  async function assignNodes(sectionId: string | null, nodeIds: string[]) {
    const ids = [...new Set(nodeIds.filter(Boolean))];
    if (ids.length === 0) return;

    setBusy(true);
    onError(null);
    onMessage(null);
    try {
      if (sectionId) {
        const res = await fetch("/api/admin/org-chart-sections", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: sectionId, nodeIds: ids }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof body?.error === "string" ? body.error : "Could not assign members.",
          );
        }
      } else {
        const res = await fetch("/api/admin/org-chart-sections", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clear: true, nodeIds: ids }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof body?.error === "string" ? body.error : "Could not unassign members.",
          );
        }
      }

      await reloadNodes();
      await reloadSections();
      const label =
        sectionId == null
          ? "Unassigned"
          : sections.find((s) => s.id === sectionId)?.name ?? "section";
      onMessage(
        ids.length === 1
          ? sectionId == null
            ? "Cleared all section memberships for member."
            : `Added member to ${label}.`
          : sectionId == null
            ? `Cleared all section memberships for ${ids.length} members.`
            : `Added ${ids.length} members to ${label}.`,
      );
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not update section members.");
    } finally {
      setBusy(false);
      setDragNodeId(null);
      setDropSectionId(null);
    }
  }

  async function removeNodesFromSection(sectionId: string, nodeIds: string[]) {
    const ids = [...new Set(nodeIds.filter(Boolean))];
    if (ids.length === 0) return;

    setBusy(true);
    onError(null);
    onMessage(null);
    try {
      const res = await fetch("/api/admin/org-chart-sections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sectionId, nodeIds: ids, remove: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "Could not remove section memberships.",
        );
      }
      await reloadNodes();
      await reloadSections();
      const label = sections.find((s) => s.id === sectionId)?.name ?? "section";
      onMessage(
        ids.length === 1
          ? `Removed member from ${label}.`
          : `Removed ${ids.length} members from ${label}.`,
      );
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not remove section memberships.");
    } finally {
      setBusy(false);
      setDragNodeId(null);
      setDropSectionId(null);
    }
  }

  function toggleCollapsed(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const formOpen = creating || editId != null;
  const editingSection = editId ? sectionById.get(editId) ?? null : null;
  const formParent =
    parentIdForCreate && !editId
      ? sectionById.get(parentIdForCreate) ?? null
      : editingSection?.parentId
        ? sectionById.get(editingSection.parentId) ?? null
        : null;
  const isSubsectionForm = Boolean(formParent) || Boolean(editingSection?.parentId);

  function renderMemberList(section: OrgChartSectionRow, emptyHint: string) {
    const members = nodesBySection.get(section.id) ?? [];
    return (
      <div>
        {members.length > 0 ? (
          <div className="border-b border-zinc-100 px-4 py-2.5 dark:border-zinc-800">
            <label className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                <Crown className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                Section head
              </span>
              <select
                disabled={busy}
                value={section.headNodeId ?? ""}
                onChange={(e) => {
                  const next = e.target.value;
                  void setSectionHead(section.id, next || null);
                }}
                className="h-8 min-w-[12rem] flex-1 rounded-lg border border-zinc-300 bg-white px-2 text-xs outline-none focus:border-orange-500/60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value="">— No head —</option>
                {members.map((n) => (
                  <option key={`head-${section.id}-${n.id}`} value={n.id}>
                    {n.personName}
                    {[n.personRole, n.companyName].filter(Boolean).length > 0
                      ? ` · ${[n.personRole, n.companyName].filter(Boolean).join(" · ")}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {members.length === 0 ? (
            <li className="px-4 py-3 text-xs text-zinc-500">{emptyHint}</li>
          ) : (
            members.map((n) => {
              const isHead = section.headNodeId === n.id;
              return (
                <li
                  key={n.id}
                  draggable={!busy}
                  onClick={() => onSelectMember(n)}
                  onDragStart={(e) => {
                    setDragNodeId(n.id);
                    e.dataTransfer.setData("text/org-node-id", n.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    setDragNodeId(null);
                    setDropSectionId(null);
                  }}
                  className={`flex items-center gap-3 px-4 py-2.5 text-sm ${
                    dragNodeId === n.id ? "opacity-50" : ""
                  } ${isHead ? "bg-amber-50/80 dark:bg-amber-950/20" : ""} ${
                    busy
                      ? "cursor-default"
                      : "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  {isHead ? (
                    <Crown
                      className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                      aria-hidden
                    />
                  ) : (
                    <span className="w-3.5 shrink-0" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate font-medium text-zinc-900 dark:text-zinc-100">
                    {n.personName}
                    {isHead ? (
                      <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                        Head
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 truncate text-xs text-zinc-500">
                    {[n.personRole, n.companyName].filter(Boolean).join(" · ")}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    className="shrink-0 text-[11px] font-semibold text-zinc-500 hover:text-rose-600 disabled:opacity-40"
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeNodesFromSection(section.id, [n.id]);
                    }}
                  >
                    Remove from section
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    );
  }

  function countMembersInSubtree(sectionId: string): number {
    let total = nodesBySection.get(sectionId)?.length ?? 0;
    for (const child of childrenByParent.get(sectionId) ?? []) {
      total += countMembersInSubtree(child.id);
    }
    return total;
  }

  function countDescendantSections(sectionId: string): number {
    let total = 0;
    for (const child of childrenByParent.get(sectionId) ?? []) {
      total += 1 + countDescendantSections(child.id);
    }
    return total;
  }

  function renderSectionBlock(section: OrgChartSectionRow, depth: number) {
    const members = nodesBySection.get(section.id) ?? [];
    const subsections = childrenByParent.get(section.id) ?? [];
    const isCollapsed = collapsed[section.id] === true;
    const isDropTarget = dropSectionId === section.id;
    const totalInTree = countMembersInSubtree(section.id);
    const nestedCount = countDescendantSections(section.id);
    const isMain = depth === 0;

    return (
      <div
        key={section.id}
        onDragOver={(e) => {
          if (!dragNodeId) return;
          e.preventDefault();
          e.stopPropagation();
          setDropSectionId(section.id);
        }}
        onDragLeave={() => {
          if (dropSectionId === section.id) setDropSectionId(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const id = e.dataTransfer.getData("text/org-node-id") || dragNodeId;
          if (id) void assignNodes(section.id, [id]);
        }}
        className={`overflow-hidden rounded-xl border transition ${
          depth > 0 ? "border-l-2 border-l-orange-300/70 dark:border-l-orange-700/60" : ""
        } ${
          isDropTarget
            ? "border-orange-400 bg-orange-50/80 dark:border-orange-600 dark:bg-orange-950/30"
            : "border-zinc-200 dark:border-zinc-800"
        }`}
        style={depth > 0 ? { marginLeft: `${Math.min(depth, 6) * 16}px` } : undefined}
      >
        <div
          className={`flex flex-wrap items-center gap-2 px-3 py-2.5 ${
            isMain
              ? "bg-zinc-50/80 dark:bg-zinc-950/50"
              : "bg-white dark:bg-zinc-900/80"
          }`}
        >
          <button
            type="button"
            onClick={() => toggleCollapsed(section.id)}
            className="inline-flex items-center gap-1.5 text-left"
            aria-expanded={!isCollapsed}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4 text-zinc-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-zinc-500" />
            )}
            <span
              className={`${
                isMain ? "text-sm font-semibold" : "text-sm font-medium"
              } text-zinc-900 dark:text-zinc-100`}
            >
              {section.name}
            </span>
          </button>
          {!isMain ? (
            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-800 dark:bg-orange-950/50 dark:text-orange-200">
              Level {depth + 1}
            </span>
          ) : null}
          <span className="rounded-full bg-zinc-200/80 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {subsections.length > 0
              ? `${totalInTree} · ${members.length} here`
              : members.length}
          </span>
          {subsections.length > 0 ? (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {nestedCount} nested
            </span>
          ) : null}
          {section.companyName ? (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800 dark:bg-sky-950/50 dark:text-sky-200">
              {section.companyName}
            </span>
          ) : null}
          {section.headName ? (
            <span
              className="inline-flex max-w-[14rem] items-center gap-1 truncate rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
              title={[section.headName, section.headRole, section.headCompanyName]
                .filter(Boolean)
                .join(" · ")}
            >
              <Crown className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">Head: {section.headName}</span>
            </span>
          ) : null}
          {section.description ? (
            <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">
              {section.description}
            </span>
          ) : (
            <span className="min-w-0 flex-1" />
          )}
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-lg px-2 text-xs"
            disabled={busy}
            onClick={() => startCreateSubsection(section)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add subsection
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-lg px-2 text-xs"
            disabled={busy || chartSelectedIds.length === 0}
            title={
              chartSelectedIds.length === 0
                ? "Select chart members first"
                : `Add ${chartSelectedIds.length} selected`
            }
            onClick={() => void assignNodes(section.id, chartSelectedIds)}
          >
            <Users className="mr-1 h-3.5 w-3.5" />
            Add selected
          </Button>
          <button
            type="button"
            disabled={busy}
            aria-label={`Edit ${section.name}`}
            onClick={() => startEdit(section)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300 text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={busy}
            aria-label={`Delete ${section.name}`}
            onClick={() => void deleteSection(section)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-300/70 text-rose-700 hover:bg-rose-50 disabled:opacity-40 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {!isCollapsed ? (
          <div className="space-y-2 border-t border-zinc-100 p-2 dark:border-zinc-800">
            {renderMemberList(
              section,
              "No members yet — assign people here first, then choose a head.",
            )}
            {subsections.length > 0 ? (
              <div className="space-y-2 pt-1">
                {subsections.map((child) => renderSectionBlock(child, depth + 1))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white/95 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FolderKanban className="h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Sections
            </h2>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {roots.length} main
              {sections.length > roots.length
                ? ` · ${sections.length - roots.length} sub`
                : ""}
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            Label groups alongside the reports-to hierarchy. Nest subsections at any depth with
            Add subsection, assign members, then pick a head from each group’s member list.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-9 rounded-xl"
          disabled={busy}
          onClick={startCreateMain}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          New section
        </Button>
      </div>

      {formOpen ? (
        <div className="mt-4 space-y-3 rounded-xl border border-orange-200/80 bg-orange-50/50 p-4 dark:border-orange-900/40 dark:bg-orange-950/20">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {editId
                ? isSubsectionForm
                  ? "Edit subsection"
                  : "Edit section"
                : isSubsectionForm
                  ? `New subsection under “${formParent?.name ?? "section"}”`
                  : "Create section"}
            </p>
            <button
              type="button"
              aria-label="Close form"
              onClick={resetForm}
              className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-200/70 dark:hover:bg-zinc-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-1">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                Name
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                placeholder={
                  isSubsectionForm ? "e.g. Field Ops" : "e.g. Operations"
                }
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-orange-500/60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <label className="block sm:col-span-1">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                Company scope (optional)
              </span>
              <select
                value={companyTeamId}
                onChange={(e) => setCompanyTeamId(e.target.value)}
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-orange-500/60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value="">— All companies —</option>
                {companyOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                Description (optional)
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder="Short note about this group"
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500/60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="h-9 rounded-xl" disabled={busy} onClick={saveSection}>
              {editId
                ? "Save changes"
                : isSubsectionForm
                  ? "Create subsection"
                  : "Create section"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-xl"
              disabled={busy}
              onClick={resetForm}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {roots.length === 0 && unassigned.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
            No sections yet. Create one to group people on the chart.
          </p>
        ) : null}

        {roots.map((section) => renderSectionBlock(section, 0))}

        <div
          onDragOver={(e) => {
            if (!dragNodeId) return;
            e.preventDefault();
            setDropSectionId("__unassigned__");
          }}
          onDragLeave={() => {
            if (dropSectionId === "__unassigned__") setDropSectionId(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData("text/org-node-id") || dragNodeId;
            if (id) void assignNodes(null, [id]);
          }}
          className={`overflow-hidden rounded-xl border border-dashed transition ${
            dropSectionId === "__unassigned__"
              ? "border-orange-400 bg-orange-50/80 dark:border-orange-600 dark:bg-orange-950/30"
              : "border-zinc-300 dark:border-zinc-700"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
            <button
              type="button"
              onClick={() => toggleCollapsed("__unassigned__")}
              className="inline-flex items-center gap-1.5"
              aria-expanded={collapsed.__unassigned__ !== true}
            >
              {collapsed.__unassigned__ === true ? (
                <ChevronRight className="h-4 w-4 text-zinc-500" />
              ) : (
                <ChevronDown className="h-4 w-4 text-zinc-500" />
              )}
              <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                Unassigned
              </span>
            </button>
            <span className="rounded-full bg-zinc-200/80 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {unassigned.length}
            </span>
            <span className="min-w-0 flex-1 text-xs text-zinc-500">
              On the chart but not in a section
            </span>
            {chartSelectedIds.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                className="h-8 rounded-lg px-2 text-xs"
                disabled={busy}
                onClick={() => void assignNodes(null, chartSelectedIds)}
              >
                Unassign selected
              </Button>
            ) : null}
          </div>
          {collapsed.__unassigned__ !== true && unassigned.length > 0 ? (
            <ul className="divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
              {unassigned.map((n) => (
                <li
                  key={n.id}
                  draggable={!busy}
                  onDragStart={(e) => {
                    setDragNodeId(n.id);
                    e.dataTransfer.setData("text/org-node-id", n.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    setDragNodeId(null);
                    setDropSectionId(null);
                  }}
                  className={`flex items-center gap-3 px-4 py-2.5 text-sm ${
                    dragNodeId === n.id ? "opacity-50" : ""
                  } ${busy ? "cursor-default" : "cursor-grab active:cursor-grabbing"}`}
                >
                  <span className="min-w-0 flex-1 truncate font-medium text-zinc-900 dark:text-zinc-100">
                    {n.personName}
                  </span>
                  <span className="shrink-0 truncate text-xs text-zinc-500">
                    {[n.personRole, n.companyName].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}
