"use client";

import type { EscalationTrigger, OrgChartNode } from "@prisma/client/primary";
import type { PersonnelRosterRow } from "@/lib/personnel-accounts-data";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, GitBranch, Search, Trash2, UserRound, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BRAND_TITLE } from "@/lib/brand";
import { EscalationTriggersClient } from "../escalation-triggers/ui";
import { AccessControlsPanel } from "./AccessControlsPanel";
import { FaqPanel } from "./FaqPanel";
import {
  OrgChartBulkReportsBar,
  type BulkReportsToOptions,
} from "./OrgChartBulkReportsBar";
import {
  OrgChartSectionsPanel,
  type OrgChartSectionRow,
} from "./OrgChartSectionsPanel";
import {
  eitherOrLinkLabel,
  encodeReportsToValue,
  formatOrgChartLayerLabel,
  orgChartLayerById,
  orgChartOptionLabel,
  orgChartReportsToOptions,
  parseReportsToValue,
  sortOrgNodesByLayer,
} from "./org-chart-layers";

const OrgChartDiagram = dynamic(
  () => import("./OrgChartDiagram").then((m) => m.OrgChartDiagram),
  {
    ssr: false,
    loading: () => (
      <div className="h-[640px] w-full animate-pulse rounded-2xl border border-zinc-200/80 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-950/40" />
    ),
  },
);

export type OrgChartEitherOrLinkRow = {
  id: string;
  nodeAId: string;
  nodeBId: string;
};

export type OrgChartNodeRow = OrgChartNode & {
  sectionMemberships: Array<{ sectionId: string }>;
};

type SuperAdminSettingsTab = "alerts" | "orgchart" | "access" | "faq";

type Trigger = Pick<
  EscalationTrigger,
  "id" | "priority" | "enabled" | "notifyAdmin" | "notifyTarget"
>;

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

export function SuperAdminSettingsClient({
  initialTab,
  initialTriggers,
  initialOrgNodes,
  initialOrgSections,
  initialEitherOrLinks,
  roster,
}: {
  initialTab: SuperAdminSettingsTab;
  initialTriggers: Trigger[];
  initialOrgNodes: OrgChartNodeRow[];
  initialOrgSections: OrgChartSectionRow[];
  initialEitherOrLinks: OrgChartEitherOrLinkRow[];
  roster: PersonnelRosterRow[];
}) {
  const router = useRouter();
  const [tab, setTabState] = useState<SuperAdminSettingsTab>(initialTab);
  const [nodes, setNodes] = useState<OrgChartNodeRow[]>(initialOrgNodes);
  const [sections, setSections] = useState<OrgChartSectionRow[]>(initialOrgSections);
  const [eitherOrLinks, setEitherOrLinks] =
    useState<OrgChartEitherOrLinkRow[]>(initialEitherOrLinks);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTabState(initialTab);
  }, [initialTab]);

  function setTab(next: SuperAdminSettingsTab) {
    setTabState(next);
    const qs =
      next === "orgchart"
        ? "?tab=orgchart"
        : next === "access"
          ? "?tab=access"
          : next === "faq"
            ? "?tab=faq"
            : "?tab=alerts";
    router.replace(`/admin/superadmin-settings${qs}`, { scroll: false });
  }

  const companyOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const person of roster) {
      if (!person.teamId || person.teamId.startsWith("company:")) continue;
      if (!map.has(person.teamId)) map.set(person.teamId, person.teamName || person.teamId);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [roster]);

  const sectionNameById = useMemo(() => {
    const byId = new Map(sections.map((s) => [s.id, s]));
    const cache = new Map<string, string>();
    function pathFor(id: string, visiting = new Set<string>()): string {
      const cached = cache.get(id);
      if (cached) return cached;
      if (visiting.has(id)) return byId.get(id)?.name ?? id;
      visiting.add(id);
      const s = byId.get(id);
      if (!s) return id;
      const label = s.parentId
        ? `${pathFor(s.parentId, visiting)} › ${s.name}`
        : s.name;
      cache.set(id, label);
      return label;
    }
    for (const s of sections) pathFor(s.id);
    return cache;
  }, [sections]);

  // Org chart customizer state
  const [query, setQuery] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<PersonnelRosterRow | null>(null);
  const [pendingAdds, setPendingAdds] = useState<PersonnelRosterRow[]>([]);
  const [chartSelectedIds, setChartSelectedIds] = useState<string[]>([]);
  const [bulkReportsTo, setBulkReportsTo] = useState<string>("");
  const [addParentId, setAddParentId] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  const assignedPersonIds = useMemo(
    () => new Set(nodes.map((n) => n.mergedSourceUserId)),
    [nodes],
  );
  const pendingAddIds = useMemo(
    () => new Set(pendingAdds.map((p) => p.mergedSourceUserId)),
    [pendingAdds],
  );

  useEffect(() => {
    setPendingAdds((prev) => {
      const next = prev.filter((p) => !assignedPersonIds.has(p.mergedSourceUserId));
      return next.length === prev.length ? prev : next;
    });
  }, [assignedPersonIds]);

  const reportsToAssignment = useMemo(
    () => parseReportsToValue(addParentId),
    [addParentId],
  );
  const reportsToParentLabel = useMemo(() => {
    if (reportsToAssignment.parentEitherOrLinkId) {
      const link = eitherOrLinks.find((l) => l.id === reportsToAssignment.parentEitherOrLinkId);
      if (!link) return "shared either/or";
      const byId = new Map(nodes.map((n) => [n.id, n]));
      return eitherOrLinkLabel(link, byId);
    }
    if (reportsToAssignment.parentId) {
      return nodes.find((n) => n.id === reportsToAssignment.parentId)?.personName ?? "manager";
    }
    return "the top level";
  }, [reportsToAssignment, eitherOrLinks, nodes]);
  /** The picker covers the whole roster: people already on the chart carry an
   *  "On chart" badge so the same search works for both Add and Remove. */
  const pickerPeople = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? roster.filter((p) =>
          `${p.name} ${p.teamName} ${p.staffRole}`.toLowerCase().includes(q),
        )
      : roster;
    const unassigned = matches.filter((p) => !assignedPersonIds.has(p.mergedSourceUserId));
    const assigned = matches.filter((p) => assignedPersonIds.has(p.mergedSourceUserId));
    return [...unassigned, ...assigned].slice(0, 60);
  }, [roster, query, assignedPersonIds]);

  /** Selected person's chart node, when they are already on the chart. */
  const selectedOnChart = useMemo(
    () =>
      selectedPerson
        ? nodes.find((n) => n.mergedSourceUserId === selectedPerson.mergedSourceUserId) ?? null
        : null,
    [selectedPerson, nodes],
  );

  const layerById = useMemo(() => orgChartLayerById(nodes), [nodes]);
  const maxOrgLayer = useMemo(() => {
    let max = 1;
    for (const layer of layerById.values()) max = Math.max(max, layer);
    return nodes.length === 0 ? 1 : max;
  }, [layerById, nodes.length]);
  const reportsToOptionsByLayer = useMemo(() => {
    const sorted = sortOrgNodesByLayer(nodes, layerById);
    const groups = new Map<number, typeof nodes>();
    for (const n of sorted) {
      const layer = layerById.get(n.id) ?? 1;
      const list = groups.get(layer) ?? [];
      list.push(n);
      groups.set(layer, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a - b);
  }, [nodes, layerById]);

  const bulkMovableIds = useMemo(
    () =>
      chartSelectedIds.filter(
        (id) => !nodes.find((n) => n.id === id)?.parentLocked,
      ),
    [chartSelectedIds, nodes],
  );

  const bulkReportsToOptions = useMemo(
    () => orgChartReportsToOptions(nodes, chartSelectedIds, eitherOrLinks),
    [nodes, chartSelectedIds, eitherOrLinks],
  );

  /** Close the roster dropdown on outside click / Escape instead of leaving it
   *  floating over the page. */
  useEffect(() => {
    if (!pickerOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPickerOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pickerOpen]);

  const load = useCallback(async () => {
    const [nodesRes, linksRes] = await Promise.all([
      fetch("/api/admin/org-chart"),
      fetch("/api/admin/org-chart-either-or"),
    ]);
    if (!nodesRes.ok) {
      setError("Could not load the chart.");
      return;
    }
    setNodes(await nodesRes.json());
    if (linksRes.ok) {
      setEitherOrLinks(await linksRes.json());
    }
  }, []);

  const run = useCallback(
    async (action: () => Promise<Response>, success: string) => {
      setBusy(true);
      setMessage(null);
      setError(null);
      try {
        const res = await action();
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body?.error ?? "Request failed.");
          return;
        }
        await load();
        setMessage(success);
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const createEitherOr = useCallback(
    (nodeAId: string, nodeBId: string) => {
      if (!nodeAId || !nodeBId || nodeAId === nodeBId) {
        setError("Shift-click two different members on the chart, then link them.");
        return;
      }
      void run(
        () =>
          fetch("/api/admin/org-chart-either-or", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nodeAId, nodeBId }),
          }),
        "Linked members as either/or for approvals.",
      );
    },
    [run],
  );

  const removeEitherOr = useCallback(
    (linkId: string) => {
      void run(
        () =>
          fetch(`/api/admin/org-chart-either-or?id=${encodeURIComponent(linkId)}`, {
            method: "DELETE",
          }),
        "Removed either/or approval link.",
      );
    },
    [run],
  );

  function togglePendingAdd(person: PersonnelRosterRow) {
    if (assignedPersonIds.has(person.mergedSourceUserId)) {
      setSelectedPerson(person);
      setPickerOpen(false);
      return;
    }
    setPendingAdds((prev) => {
      const exists = prev.some((p) => p.mergedSourceUserId === person.mergedSourceUserId);
      if (exists) return prev.filter((p) => p.mergedSourceUserId !== person.mergedSourceUserId);
      return [...prev, person];
    });
  }

  function addMembers() {
    const toAdd = pendingAdds.filter((p) => !assignedPersonIds.has(p.mergedSourceUserId));
    if (toAdd.length === 0) return;
    const assignment = parseReportsToValue(addParentId);
    const body = {
      mergedSourceUserIds: toAdd.map((p) => p.mergedSourceUserId),
      parentId: assignment.parentEitherOrLinkId ? undefined : assignment.parentId,
      parentEitherOrLinkId: assignment.parentEitherOrLinkId,
    };
    const count = toAdd.length;
    void run(
      () =>
        fetch("/api/admin/org-chart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      count === 1
        ? `${toAdd[0]!.name} added under ${reportsToParentLabel}.`
        : `${count} members added under ${reportsToParentLabel}.`,
    ).then(() => {
      setPendingAdds([]);
      setQuery("");
      setPickerOpen(false);
    });
  }

  // Stable identities: these are passed into the org chart diagram and appear in
  // its rfNodes memo deps — recreating them on every panel render would make
  // React Flow re-adopt all nodes and swallow the next card click.
  const reparent = useCallback(
    (id: string, parentValue: string) => {
      const node = nodes.find((n) => n.id === id);
      if (node?.parentLocked) {
        setError("This member is locked to their current manager.");
        return;
      }
      const assignment = parseReportsToValue(parentValue);
      void run(
        () =>
          fetch("/api/admin/org-chart", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id,
              parentId: assignment.parentEitherOrLinkId ? null : assignment.parentId,
              parentEitherOrLinkId: assignment.parentEitherOrLinkId,
            }),
          }),
        "Manager updated.",
      );
    },
    [run, nodes],
  );

  const reparentMany = useCallback(
    (ids: string[], parentValue: string) => {
      const movable = ids.filter((id) => !nodes.find((n) => n.id === id)?.parentLocked);
      if (movable.length === 0) {
        setError("All selected members are locked to their current manager.");
        return;
      }
      const assignment = parseReportsToValue(parentValue);
      const suffix =
        movable.length > 1
          ? ` (${movable.length} members)`
          : movable.length < ids.length
            ? ` (${movable.length} unlocked)`
            : "";
      void run(
        () =>
          fetch("/api/admin/org-chart", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ids: movable,
              parentId: assignment.parentEitherOrLinkId ? null : assignment.parentId,
              parentEitherOrLinkId: assignment.parentEitherOrLinkId,
            }),
          }),
        `Moved under the new head${suffix}.`,
      );
    },
    [run, nodes],
  );

  const toggleParentLock = useCallback(
    (id: string, locked: boolean) => {
      void run(
        () =>
          fetch("/api/admin/org-chart", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, parentLocked: locked }),
          }),
        locked
          ? "Member locked to their current manager."
          : "Member unlocked — reports-to can be changed.",
      );
    },
    [run],
  );

  function applyBulkReportsTo() {
    if (bulkMovableIds.length === 0) {
      setError("All selected members are locked to their current manager.");
      return;
    }
    reparentMany(bulkMovableIds, bulkReportsTo);
  }

  const move = useCallback(
    (id: string, moveUp: boolean) => {
      void run(
        () =>
          fetch("/api/admin/org-chart", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, moveUp, moveDown: !moveUp }),
          }),
        "Order updated.",
      );
    },
    [run],
  );

  /** When several selected nodes nest under each other, only delete the
   *  outermost ones — cascade removal already clears their selected children. */
  function topmostSelectedIds(ids: string[]) {
    const idSet = new Set(ids);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    return ids.filter((id) => {
      let cur = byId.get(id);
      while (cur?.parentId) {
        if (idSet.has(cur.parentId)) return false;
        cur = byId.get(cur.parentId);
      }
      return true;
    });
  }

  const remove = useCallback(
    (id: string, reports: number) => {
      const suffix = reports > 0 ? ` This also removes ${reports} direct report${reports === 1 ? "" : "s"}.` : "";
      if (!window.confirm(`Remove this member from the chart?${suffix}`)) return;
      void run(
        () => fetch(`/api/admin/org-chart?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
        "Member removed from the chart.",
      ).then(() => {
        setChartSelectedIds((prev) => prev.filter((x) => x !== id));
      });
    },
    [run],
  );

  const removeMany = useCallback(
    (ids: string[]) => {
      const targets = topmostSelectedIds(ids);
      if (targets.length === 0) return;
      const names = targets
        .map((id) => nodes.find((n) => n.id === id)?.personName ?? "member")
        .slice(0, 5);
      const extra = targets.length > names.length ? ` (+${targets.length - names.length} more)` : "";
      const cascadeNote =
        " Removing a member also removes their direct reports from the chart.";
      if (
        !window.confirm(
          targets.length === 1
            ? `Remove ${names[0]} from the chart?${cascadeNote}`
            : `Remove ${targets.length} members (${names.join(", ")}${extra}) from the chart?${cascadeNote}`,
        )
      ) {
        return;
      }
      void run(async () => {
        let last: Response | null = null;
        for (const id of targets) {
          last = await fetch(`/api/admin/org-chart?id=${encodeURIComponent(id)}`, {
            method: "DELETE",
          });
          if (!last.ok) return last;
        }
        return last!;
      }, targets.length === 1 ? "Member removed from the chart." : `${targets.length} members removed from the chart.`).then(
        () => {
          setChartSelectedIds([]);
          setSelectedPerson(null);
          setQuery("");
          setPickerOpen(false);
        },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- topmostSelectedIds uses nodes
    [nodes, run],
  );

  function removeSelectedMember() {
    if (chartSelectedIds.length > 1) {
      removeMany(chartSelectedIds);
      return;
    }
    if (chartSelectedIds.length === 1) {
      const id = chartSelectedIds[0];
      const reports = nodes.filter((n) => n.parentId === id).length;
      remove(id, reports);
      return;
    }
    if (!selectedPerson || !selectedOnChart) return;
    const reports = nodes.filter((n) => n.parentId === selectedOnChart.id).length;
    remove(selectedOnChart.id, reports);
  }

  const handleChartSelectionChange = useCallback((ids: string[]) => {
    setChartSelectedIds(ids);
  }, []);

  const handleSectionMemberSelect = useCallback(
    (node: OrgChartNodeRow) => {
      const row =
        roster.find((p) => p.mergedSourceUserId === node.mergedSourceUserId) ?? null;
      setSelectedPerson(row);
      setChartSelectedIds([node.id]);
      setPickerOpen(false);
    },
    [roster],
  );

  /** Live copy of selectedOnChart so handleCardSelect stays identity-stable
   *  (recreating it on every selection would re-trigger the diagram's rfNodes
   *  memo and swallow the next card click) while still reading fresh state. */
  const selectedOnChartRef = useRef(selectedOnChart);
  selectedOnChartRef.current = selectedOnChart;

  /** A card clicked on the chart selects that member in the panel, so Remove
   *  member can act on it directly. */
  const handleCardSelect = useCallback(
    (node: OrgChartNode | null) => {
      if (!node) {
        // Shift-toggle unselected a card: clear only if it was the panel's pick.
        if (selectedOnChartRef.current) setSelectedPerson(null);
        return;
      }
      const row =
        roster.find((p) => p.mergedSourceUserId === node.mergedSourceUserId) ?? null;
      setSelectedPerson(row);
      setPickerOpen(false);
    },
    [roster],
  );

  return (
    <main className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8 md:px-8 md:py-10">
      <header className="panel p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400/95">
              {BRAND_TITLE} · SuperAdmin Settings
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white">
              SuperAdmin Settings
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Manage escalation alerts, the organizational chart, access controls, and the
              public sign-in FAQ.
            </p>
          </div>
          <div className="flex justify-end">
            <Tabs
              value={tab}
              onValueChange={(value) => setTab(value as SuperAdminSettingsTab)}
            >
              <TabsList className="flex flex-wrap rounded-full border border-zinc-300 bg-zinc-100 p-1 text-xs dark:border-zinc-700 dark:bg-zinc-900">
                <TabsTrigger
                  value="alerts"
                  className="rounded-full px-3 py-1.5 text-xs data-[state=active]:bg-zinc-900 data-[state=active]:text-white dark:data-[state=active]:bg-white dark:data-[state=active]:text-zinc-900"
                >
                  Priority Alerts
                </TabsTrigger>
                <TabsTrigger
                  value="orgchart"
                  className="rounded-full px-3 py-1.5 text-xs data-[state=active]:bg-zinc-900 data-[state=active]:text-white dark:data-[state=active]:bg-white dark:data-[state=active]:text-zinc-900"
                >
                  Organization Chart
                </TabsTrigger>
                <TabsTrigger
                  value="access"
                  className="rounded-full px-3 py-1.5 text-xs data-[state=active]:bg-zinc-900 data-[state=active]:text-white dark:data-[state=active]:bg-white dark:data-[state=active]:text-zinc-900"
                >
                  Access Controls
                </TabsTrigger>
                <TabsTrigger
                  value="faq"
                  className="rounded-full px-3 py-1.5 text-xs data-[state=active]:bg-zinc-900 data-[state=active]:text-white dark:data-[state=active]:bg-white dark:data-[state=active]:text-zinc-900"
                >
                  FAQ
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </header>

      {message ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-100">
          {error}
        </p>
      ) : null}

      {tab === "alerts" ? (
        <EscalationTriggersClient initialTriggers={initialTriggers} embedded />
      ) : tab === "access" ? (
        <AccessControlsPanel maxOrgLayer={maxOrgLayer} />
      ) : tab === "faq" ? (
        <FaqPanel />
      ) : (
        <section className="space-y-6">
          <OrgChartSectionsPanel
            sections={sections}
            nodes={nodes}
            companyOptions={companyOptions}
            busy={busy}
            chartSelectedIds={chartSelectedIds}
            onSectionsChange={setSections}
            onNodesChange={setNodes}
            onSelectMember={handleSectionMemberSelect}
            onMessage={setMessage}
            onError={setError}
            setBusy={setBusy}
          />

          <div className="rounded-2xl border border-zinc-200/80 bg-white/95 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
                  <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                    Add or remove member
                  </h2>
                </div>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                  Search the roster and click several people to queue them, choose who they
                  report to, then add. Shift-click chart boxes to multi-select, then remove.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] sm:items-end">
                <div ref={pickerRef} className="relative min-w-0">
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                    Person
                  </label>
                  <div className="flex h-10 items-center gap-2 rounded-xl border border-zinc-300 bg-zinc-50 px-3 transition focus-within:border-orange-500/60 dark:border-zinc-700 dark:bg-zinc-950">
                    <Search className="h-4 w-4 shrink-0 text-zinc-400" />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setPickerOpen(true);
                      }}
                      onFocus={() => setPickerOpen(true)}
                      placeholder="Search and click several people…"
                      className="h-full w-full min-w-0 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-500 dark:text-zinc-100"
                      autoComplete="off"
                    />
                    {query ? (
                      <button
                        type="button"
                        aria-label="Clear search"
                        onClick={() => {
                          setQuery("");
                          setPickerOpen(true);
                        }}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                  {pickerOpen ? (
                    <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                      <p className="border-b border-zinc-100 px-3 py-2 text-[11px] font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                        {pickerPeople.length} {pickerPeople.length === 1 ? "person" : "people"}
                        {query.trim() ? " found" : " on the roster"}
                        {pendingAdds.length > 0
                          ? ` · ${pendingAdds.length} queued to add`
                          : " · click to queue several under one manager"}
                      </p>
                      {pickerPeople.length === 0 ? (
                        <p className="px-4 py-3 text-xs text-zinc-500">
                          {query.trim()
                            ? "No matches."
                            : "Everyone in the roster is already on the chart."}
                        </p>
                      ) : (
                        <ul className="max-h-60 divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-800">
                          {pickerPeople.map((p) => {
                            const onChart = assignedPersonIds.has(p.mergedSourceUserId);
                            const queued = pendingAddIds.has(p.mergedSourceUserId);
                            return (
                              <li key={p.mergedSourceUserId}>
                                <button
                                  type="button"
                                  onClick={() => togglePendingAdd(p)}
                                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-orange-50 dark:hover:bg-zinc-800/60 ${
                                    queued ? "bg-orange-50 dark:bg-orange-950/30" : ""
                                  }`}
                                >
                                  <span
                                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${avatarColor(p.mergedSourceUserId)}`}
                                  >
                                    {queued ? <Check className="h-4 w-4" /> : initials(p.name)}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                      {p.name}
                                    </span>
                                    <span className="block truncate text-xs text-zinc-500">
                                      {[p.teamName, p.staffRole].filter(Boolean).join(" · ")}
                                    </span>
                                  </span>
                                  {onChart ? (
                                    <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                                      On chart
                                    </span>
                                  ) : queued ? (
                                    <span className="shrink-0 rounded-full bg-orange-200/80 px-2 py-0.5 text-[10px] font-semibold text-orange-800 dark:bg-orange-900/50 dark:text-orange-200">
                                      Queued
                                    </span>
                                  ) : null}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </div>

                <label className="min-w-0">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                    Reports to
                  </span>
                  <select
                    value={addParentId}
                    onChange={(e) => setAddParentId(e.target.value)}
                    className="h-10 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm font-medium text-zinc-900 outline-none transition focus:border-orange-500/60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    <option value="">— Top level ({formatOrgChartLayerLabel(1)}) —</option>
                    {eitherOrLinks.length > 0 ? (
                      <optgroup label="Shared either / or">
                        {eitherOrLinks.map((link) => {
                          const byId = new Map(nodes.map((n) => [n.id, n]));
                          return (
                            <option key={link.id} value={encodeReportsToValue({ parentEitherOrLinkId: link.id })}>
                              {eitherOrLinkLabel(link, byId)}
                            </option>
                          );
                        })}
                      </optgroup>
                    ) : null}
                    {reportsToOptionsByLayer.map(([layer, people]) => (
                      <optgroup key={`add-layer-${layer}`} label={formatOrgChartLayerLabel(layer)}>
                        {people.map((n) => (
                          <option key={n.id} value={n.id}>
                            {orgChartOptionLabel(n, layer)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
              </div>

              {pendingAdds.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Adding under {reportsToParentLabel}:
                  </span>
                  {pendingAdds.map((p) => (
                    <button
                      key={`queued-${p.mergedSourceUserId}`}
                      type="button"
                      onClick={() => togglePendingAdd(p)}
                      className="inline-flex items-center gap-1 rounded-full border border-orange-300 bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-900 hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-100 dark:hover:bg-orange-950/70"
                      title="Remove from queue"
                    >
                      {p.name}
                      <X className="h-3 w-3" aria-hidden />
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                <Button
                  className="h-10 min-w-[9.5rem] flex-1 rounded-xl px-4 sm:flex-none"
                  disabled={busy || pendingAdds.length === 0}
                  onClick={addMembers}
                >
                  {pendingAdds.length > 1 ? (
                    <Users className="mr-2 h-4 w-4" />
                  ) : (
                    <UserRound className="mr-2 h-4 w-4" />
                  )}
                  {pendingAdds.length === 0
                    ? "Add members"
                    : pendingAdds.length === 1
                      ? `Add ${pendingAdds[0]!.name.trim().split(/\s+/)[0] || "member"}`
                      : `Add ${pendingAdds.length} members`}
                </Button>
                <Button
                  variant="outline"
                  className="h-10 min-w-[9.5rem] flex-1 rounded-xl border-rose-300 px-4 text-rose-700 hover:border-rose-400 hover:bg-rose-50 hover:text-rose-700 sm:flex-none dark:border-rose-800 dark:text-rose-300 dark:hover:border-rose-700 dark:hover:bg-rose-950/40 dark:hover:text-rose-200"
                  disabled={
                    busy ||
                    (chartSelectedIds.length === 0 && (!selectedPerson || !selectedOnChart))
                  }
                  onClick={removeSelectedMember}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {chartSelectedIds.length > 1
                    ? `Remove ${chartSelectedIds.length}`
                    : "Remove member"}
                </Button>
              </div>

              {chartSelectedIds.length >= 2 ? (
                <div className="rounded-xl border border-orange-300 bg-orange-50 px-3 py-2.5 dark:border-orange-800 dark:bg-orange-950/40">
                  <p className="mb-2 text-[11px] font-semibold text-orange-900 dark:text-orange-100">
                    Bulk move — {chartSelectedIds.length} chart boxes selected
                  </p>
                  <OrgChartBulkReportsBar
                    selectedCount={chartSelectedIds.length}
                    movableCount={bulkMovableIds.length}
                    value={bulkReportsTo}
                    onChange={setBulkReportsTo}
                    onApply={applyBulkReportsTo}
                    busy={busy}
                    options={bulkReportsToOptions as BulkReportsToOptions}
                  />
                </div>
              ) : null}

              <div
                className={`flex min-h-[42px] flex-wrap items-center gap-2 rounded-xl border px-3.5 py-2 text-xs ${
                  pendingAdds.length > 0 || chartSelectedIds.length > 1 || selectedPerson
                    ? "border-orange-200 bg-orange-50 font-medium text-orange-900 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-100"
                    : "border-dashed border-zinc-200 bg-zinc-50/70 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-400"
                }`}
              >
                {pendingAdds.length > 0 ? (
                  <>
                    <Users className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {pendingAdds.length} {pendingAdds.length === 1 ? "person" : "people"} queued
                      under {reportsToParentLabel}
                      <span className="font-normal opacity-80">
                        {" "}
                        · click more names to add them to the same manager
                      </span>
                    </span>
                  </>
                ) : chartSelectedIds.length > 1 ? (
                  <>
                    <Users className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {chartSelectedIds.length} boxes selected
                      <span className="font-normal opacity-80">
                        {" "}
                        · use Bulk move above · Shift-click on chart to adjust selection
                      </span>
                    </span>
                  </>
                ) : selectedPerson ? (
                  <>
                    <UserRound className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 truncate">
                      Selected: {selectedPerson.name}
                      <span className="font-normal opacity-80"> · {selectedPerson.teamName}</span>
                    </span>
                    {selectedOnChart ? (
                      <span className="rounded-full bg-orange-200/70 px-2 py-0.5 text-[10px] font-semibold text-orange-800 dark:bg-orange-900/40 dark:text-orange-200">
                        On chart
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-200/70 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                        Ready to add
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <Search className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    <span>
                      Search and click several people, then choose who they report to.
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200/80 bg-white/95 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Users className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  Organizational chart
                </h2>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {nodes.length} {nodes.length === 1 ? "member" : "members"}
                </span>
                {eitherOrLinks.length > 0 ? (
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-800 dark:bg-orange-950/50 dark:text-orange-200">
                    {eitherOrLinks.length} either/or
                  </span>
                ) : null}
                {chartSelectedIds.length > 0 ? (
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-800 dark:bg-orange-950/50 dark:text-orange-200">
                    {chartSelectedIds.length} selected
                  </span>
                ) : null}
              </div>
              <p className="max-w-xl text-xs leading-relaxed text-zinc-500">
                Reports hang below managers on elbow connectors. Drag a box onto another
                member to reassign, or Shift-click several boxes and set Reports to for all
                at once. Use Lock on a card to pin someone to their manager — locked
                reports move with that manager when they are reparented.
                Shift-click two boxes to link them as either/or for approvals.
              </p>
            </div>

            {chartSelectedIds.length < 2 ? (
              <p className="mt-3 text-[11px] text-zinc-500">
                Tip: hold Shift and click multiple people on the chart for bulk move (Apply to
                N), or two people to link either/or for approvals.
              </p>
            ) : null}

            <div className="mt-4">
              {nodes.length === 0 ? (
                <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
                  The chart is empty. Add the first member above.
                </p>
              ) : (
                <OrgChartDiagram
                  nodes={nodes}
                  busy={busy}
                  onReparent={reparent}
                  onReparentMany={reparentMany}
                  onMove={move}
                  onRemove={remove}
                  onToggleParentLock={toggleParentLock}
                  onSelectNode={handleCardSelect}
                  onSelectionChange={handleChartSelectionChange}
                  highlightId={selectedOnChart?.id ?? null}
                  sectionNameById={sectionNameById}
                  eitherOrLinks={eitherOrLinks}
                  onCreateEitherOr={createEitherOr}
                  onRemoveEitherOr={removeEitherOr}
                  bulkReportsTo={bulkReportsTo}
                  onBulkReportsToChange={setBulkReportsTo}
                  onBulkApply={applyBulkReportsTo}
                  bulkReportsToOptions={bulkReportsToOptions}
                  bulkMovableCount={bulkMovableIds.length}
                />
              )}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
