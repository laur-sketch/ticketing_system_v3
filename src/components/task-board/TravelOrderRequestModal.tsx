"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Plus, Trash2, X } from "lucide-react";
import { TaskBoardPopup } from "@/components/task-board/TaskBoardPopup";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  agentIdsFromApprovalLevels,
  approvalLevelsAllowOptional,
  buildEmptyApprovalLevels,
  emptyTravelLocation,
  emptyTravelOrderDraft,
  TRAVEL_ORDER_VEHICLE_OPTIONS,
  validateTravelOrderDraft,
  type TravelOrderDraft,
  type TravelOrderLocationDraft,
} from "@/lib/travel-order";

type AgentOption = {
  id: string;
  name: string;
  email?: string | null;
};

type TravelOrderRequestModalProps = {
  open: boolean;
  /** Task group title (KpiMaintenance.title). */
  taskGroupTitle?: string;
  /** Main task / field assignment name. */
  mainTaskName?: string;
  scopedCompanyTeamId?: string | null;
  /** When set, agent pickers are scoped to this agent's company. */
  companyScopeAgentId?: string | null;
  /** Allow editing the travel order name inside the modal (standalone create). */
  allowEditDetails?: boolean;
  onClose: () => void;
  onCreated: (payload: { kpiId: string }) => void;
};

/**
 * Create-time Travel Order form layout:
 * 1. Order Request (+ optional name when standalone)
 * 2. Location(s)
 * 3. Travelers (creator + co-travelers)
 * 4. To be Approved by (+ hierarchical Set Levels)
 * 5. Approval confirmation
 */
export function TravelOrderRequestModal({
  open,
  taskGroupTitle = "Travel Orders",
  mainTaskName = "",
  scopedCompanyTeamId,
  companyScopeAgentId = null,
  allowEditDetails = false,
  onClose,
  onCreated,
}: TravelOrderRequestModalProps) {
  const [draft, setDraft] = useState<TravelOrderDraft>(() => emptyTravelOrderDraft());
  const [companyAgents, setCompanyAgents] = useState<AgentOption[]>([]);
  const [allAgents, setAllAgents] = useState<AgentOption[]>([]);
  const [localMainTaskName, setLocalMainTaskName] = useState(mainTaskName);
  const [agentQuery, setAgentQuery] = useState("");
  const [confirmQuery, setConfirmQuery] = useState("");
  const [travelerQuery, setTravelerQuery] = useState("");
  const [levelPickerQuery, setLevelPickerQuery] = useState("");
  const [assigningLevel, setAssigningLevel] = useState<number | null>(null);
  const [levelsPromptOpen, setLevelsPromptOpen] = useState(false);
  const [levelsCountInput, setLevelsCountInput] = useState("2");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hierarchical = draft.approvalLevels.length > 0;
  const effectiveMainTask = allowEditDetails ? localMainTaskName : mainTaskName;

  function parseAgentList(list: unknown): AgentOption[] {
    if (!Array.isArray(list)) return [];
    return list
      .map((row) => {
        const r = row as Record<string, unknown>;
        const id = typeof r.id === "string" ? r.id : "";
        const name = typeof r.name === "string" ? r.name : "";
        if (!id || !name) return null;
        return {
          id,
          name,
          email: typeof r.email === "string" ? r.email : null,
        };
      })
      .filter(Boolean) as AgentOption[];
  }

  function findAgent(agentId: string): AgentOption | null {
    return (
      companyAgents.find((a) => a.id === agentId) ??
      allAgents.find((a) => a.id === agentId) ??
      null
    );
  }

  useEffect(() => {
    if (!open) return;
    setDraft(emptyTravelOrderDraft());
    setLocalMainTaskName(mainTaskName);
    setError(null);
    setAgentQuery("");
    setConfirmQuery("");
    setTravelerQuery("");
    setLevelPickerQuery("");
    setAssigningLevel(null);
    setLevelsPromptOpen(false);
    setLevelsCountInput("2");
    let cancelled = false;
    const companyUrl = companyScopeAgentId
      ? `/api/agents?forMainAgentId=${encodeURIComponent(companyScopeAgentId)}`
      : scopedCompanyTeamId
        ? `/api/agents?company=${encodeURIComponent(scopedCompanyTeamId)}`
        : "/api/agents";
    void Promise.all([
      fetch(companyUrl, { cache: "no-store" }).then((res) => (res.ok ? res.json() : [])),
      fetch("/api/agents?anyCompany=1", { cache: "no-store" }).then((res) =>
        res.ok ? res.json() : [],
      ),
    ])
      .then(([companyList, anyList]) => {
        if (cancelled) return;
        setCompanyAgents(parseAgentList(companyList));
        setAllAgents(parseAgentList(anyList));
      })
      .catch(() => {
        if (!cancelled) {
          setCompanyAgents([]);
          setAllAgents([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, companyScopeAgentId, scopedCompanyTeamId, mainTaskName]);

  const filteredAgents = useMemo(() => {
    const q = agentQuery.trim().toLowerCase();
    if (!q) return companyAgents.slice(0, 40);
    return companyAgents
      .filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.email ?? "").toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [companyAgents, agentQuery]);

  const filteredConfirmAgents = useMemo(() => {
    const q = confirmQuery.trim().toLowerCase();
    if (!q) return companyAgents.slice(0, 40);
    return companyAgents
      .filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.email ?? "").toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [companyAgents, confirmQuery]);

  const filteredLevelAgents = useMemo(() => {
    const pool =
      assigningLevel != null && assigningLevel >= 2 ? allAgents : companyAgents;
    const q = levelPickerQuery.trim().toLowerCase();
    if (!q) return pool.slice(0, 40);
    return pool
      .filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.email ?? "").toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [allAgents, companyAgents, assigningLevel, levelPickerQuery]);

  const filteredTravelerAgents = useMemo(() => {
    const q = travelerQuery.trim().toLowerCase();
    const base = q
      ? allAgents.filter(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            (a.email ?? "").toLowerCase().includes(q),
        )
      : allAgents;
    return base
      .filter((a) => a.id !== companyScopeAgentId)
      .slice(0, 40);
  }, [allAgents, travelerQuery, companyScopeAgentId]);

  const selectedApprovers = companyAgents.filter((a) =>
    draft.approvedByAgentIds.includes(a.id),
  );
  const selectedConfirmer = findAgent(draft.confirmationByAgentId);
  const selectedTravelers = draft.additionalTravelerAgentIds
    .map((id) => findAgent(id))
    .filter((a): a is AgentOption => a != null);
  const creatorAgent = companyScopeAgentId ? findAgent(companyScopeAgentId) : null;

  function toggleApprover(agentId: string) {
    setDraft((prev) => {
      const exists = prev.approvedByAgentIds.includes(agentId);
      return {
        ...prev,
        approvedByAgentIds: exists
          ? prev.approvedByAgentIds.filter((id) => id !== agentId)
          : [...prev.approvedByAgentIds, agentId],
      };
    });
  }

  function toggleTraveler(agentId: string) {
    if (companyScopeAgentId && agentId === companyScopeAgentId) return;
    setDraft((prev) => {
      const exists = prev.additionalTravelerAgentIds.includes(agentId);
      return {
        ...prev,
        additionalTravelerAgentIds: exists
          ? prev.additionalTravelerAgentIds.filter((id) => id !== agentId)
          : [...prev.additionalTravelerAgentIds, agentId],
      };
    });
  }

  function applyLevelsCount() {
    const n = Number.parseInt(levelsCountInput, 10);
    if (!Number.isFinite(n) || n < 1 || n > 20) {
      setError("Enter a number of approval levels between 1 and 20.");
      return;
    }
    setError(null);
    setDraft((prev) => {
      const allowOptional = approvalLevelsAllowOptional(n);
      const nextLevels = buildEmptyApprovalLevels(n).map((lvl) => {
        const existing = prev.approvalLevels.find((e) => e.level === lvl.level);
        if (!existing) return lvl;
        return {
          ...existing,
          optional: allowOptional && existing.optional === true,
        };
      });
      return {
        ...prev,
        approvalLevels: nextLevels,
        approvedByAgentIds: agentIdsFromApprovalLevels(nextLevels),
      };
    });
    setLevelsPromptOpen(false);
    setAssigningLevel(null);
  }

  function clearLevels() {
    setDraft((prev) => ({
      ...prev,
      approvalLevels: [],
    }));
    setAssigningLevel(null);
    setLevelsPromptOpen(false);
  }

  function assignLevelAgent(level: number, agentId: string) {
    setDraft((prev) => {
      const approvalLevels = prev.approvalLevels.map((lvl) =>
        lvl.level === level ? { ...lvl, agentId } : lvl,
      );
      return {
        ...prev,
        approvalLevels,
        approvedByAgentIds: agentIdsFromApprovalLevels(approvalLevels),
      };
    });
    setAssigningLevel(null);
    setLevelPickerQuery("");
  }

  function clearLevelAgent(level: number) {
    setDraft((prev) => {
      const approvalLevels = prev.approvalLevels.map((lvl) =>
        lvl.level === level ? { ...lvl, agentId: "" } : lvl,
      );
      return {
        ...prev,
        approvalLevels,
        approvedByAgentIds: agentIdsFromApprovalLevels(approvalLevels),
      };
    });
  }

  function toggleLevelOptional(level: number) {
    setDraft((prev) => {
      if (!approvalLevelsAllowOptional(prev.approvalLevels.length)) return prev;
      const approvalLevels = prev.approvalLevels.map((lvl) =>
        lvl.level === level ? { ...lvl, optional: !lvl.optional } : lvl,
      );
      return { ...prev, approvalLevels };
    });
  }

  function patchLocation(clientKey: string, patch: Partial<TravelOrderLocationDraft>) {
    setDraft((prev) => ({
      ...prev,
      locations: prev.locations.map((loc) =>
        loc.clientKey === clientKey ? { ...loc, ...patch } : loc,
      ),
    }));
  }

  function addLocation() {
    setDraft((prev) => ({ ...prev, locations: [...prev.locations, emptyTravelLocation()] }));
  }

  function removeLocation(clientKey: string) {
    setDraft((prev) => {
      if (prev.locations.length <= 1) return prev;
      return {
        ...prev,
        locations: prev.locations.filter((loc) => loc.clientKey !== clientKey),
      };
    });
  }

  async function submit() {
    const validationError = validateTravelOrderDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!effectiveMainTask.trim()) {
      setError("Enter a travel order / Field Assignment name.");
      return;
    }

    const approvedByAgentIds = hierarchical
      ? agentIdsFromApprovalLevels(draft.approvalLevels)
      : draft.approvedByAgentIds;

    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("title", (taskGroupTitle.trim() || "Travel Orders"));
      form.set("mainTask", effectiveMainTask.trim());
      form.set("orderRequest", draft.orderRequest.trim());
      form.set("approvedByAgentIds", JSON.stringify(approvedByAgentIds));
      if (approvedByAgentIds[0]) {
        form.set("approvedByAgentId", approvedByAgentIds[0]);
      }
      if (hierarchical) {
        form.set(
          "approvalLevels",
          JSON.stringify(
            draft.approvalLevels.map((lvl) => ({
              level: lvl.level,
              agentId: lvl.agentId,
              optional: lvl.optional === true,
            })),
          ),
        );
      }
      form.set("confirmationByAgentId", draft.confirmationByAgentId.trim());
      form.set(
        "additionalTravelerAgentIds",
        JSON.stringify(draft.additionalTravelerAgentIds),
      );
      form.set("vehicle", draft.vehicle.trim());
      if (scopedCompanyTeamId) form.set("scopedCompanyTeamId", scopedCompanyTeamId);
      form.set(
        "locationsJson",
        JSON.stringify(
          draft.locations.map((loc) => ({
            label: loc.label.trim(),
            latitude: null,
            longitude: null,
            remarks: null,
          })),
        ),
      );

      const res = await fetch("/api/kpi-maintenance/field-assignment", {
        method: "POST",
        body: form,
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        kpi?: { id?: string };
      };
      if (!res.ok) {
        setError(body.error ?? "Could not create the travel order.");
        return;
      }
      const kpiId = body.kpi?.id;
      if (!kpiId) {
        setError("Travel order was created but the task id was missing.");
        return;
      }
      onCreated({ kpiId });
      onClose();
    } catch {
      setError("Could not create the travel order. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <TaskBoardPopup
      open={open}
      title="Request for Travel Order"
      description={`Field Assignment · ${effectiveMainTask.trim() || "Untitled"} · ${(taskGroupTitle.trim() || "Travel Orders")}`}
      onClose={() => {
        if (!busy) onClose();
      }}
      size="lg"
    >
      <div className="space-y-5 overflow-y-auto px-1 pb-2">
        {error ? (
          <p className="rounded-lg border border-rose-400/50 bg-rose-500/10 px-3 py-2 text-sm text-rose-800 dark:text-rose-200">
            {error}
          </p>
        ) : null}

        {allowEditDetails ? (
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-500">
            Travel order name
            <input
              type="text"
              value={localMainTaskName}
              disabled={busy}
              placeholder="e.g. Site visit — Client HQ"
              onChange={(e) => setLocalMainTaskName(e.target.value)}
              className="mt-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>
        ) : null}

        {/* 1. Order Request */}
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-500">
          Order request
          <textarea
            value={draft.orderRequest}
            disabled={busy}
            rows={4}
            placeholder="Purpose of travel, scope of work, and other request details…"
            onChange={(e) => setDraft((prev) => ({ ...prev, orderRequest: e.target.value }))}
            className="mt-1 resize-y rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </label>

        {/* 2. Location(s) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-500">
              Location ({draft.locations.length})
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={addLocation}
              className="h-8 gap-1 border-orange-500/50 text-xs text-orange-700 dark:text-orange-300"
            >
              <Plus className="size-3.5" aria-hidden />
              Add location
            </Button>
          </div>

          {draft.locations.map((loc, index) => (
            <div
              key={loc.clientKey}
              className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-700 dark:bg-zinc-950/40"
            >
              <div className="flex items-start gap-2">
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
                  <span className="mb-1 block">
                    {draft.locations.length > 1 ? `Location ${index + 1}` : "Location name / address"}
                  </span>
                  <input
                    type="text"
                    value={loc.label}
                    disabled={busy}
                    placeholder="e.g. Client site — Makati"
                    onChange={(e) => patchLocation(loc.clientKey, { label: e.target.value })}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy || draft.locations.length <= 1}
                  onClick={() => removeLocation(loc.clientKey)}
                  className="mt-5 inline-flex shrink-0 items-center gap-1 rounded-full border border-rose-400/60 px-2 py-1 text-[10px] font-semibold text-rose-700 disabled:opacity-40 dark:text-rose-300"
                  aria-label={`Remove location ${index + 1}`}
                >
                  <Trash2 className="size-3" aria-hidden />
                  Remove
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-dashed border-zinc-300 px-2.5 py-2 dark:border-zinc-600">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Start</p>
                    <button
                      type="button"
                      disabled
                      className="rounded-lg bg-orange-600/40 px-2.5 py-1.5 text-[11px] font-semibold text-white opacity-60"
                    >
                      Start
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    After approval — captures GPS + time on site.
                  </p>
                </div>
                <div className="rounded-lg border border-dashed border-zinc-300 px-2.5 py-2 dark:border-zinc-600">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">End</p>
                    <button
                      type="button"
                      disabled
                      className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800 opacity-60 dark:text-emerald-200"
                    >
                      End
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    After Start — marks this stop completed.
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 3. Travelers */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-500">
            Travelers
          </p>
          <p className="text-[11px] font-normal normal-case tracking-normal text-zinc-500">
            You are automatically included as the requester. Optionally add co-travelers from any company.
          </p>
          {creatorAgent ? (
            <p className="text-xs text-zinc-700 dark:text-zinc-300">
              Requester:{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">{creatorAgent.name}</span>
              {creatorAgent.email ? ` · ${creatorAgent.email}` : ""}
            </p>
          ) : (
            <p className="text-xs text-zinc-500">You will be assigned as the requester on save.</p>
          )}
          {selectedTravelers.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {selectedTravelers.map((agent) => (
                <button
                  key={`traveler-${agent.id}`}
                  type="button"
                  disabled={busy}
                  onClick={() => toggleTraveler(agent.id)}
                  className="inline-flex items-center gap-1 rounded-full border border-sky-400/50 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-900 dark:text-sky-100"
                  title="Remove traveler"
                >
                  {agent.name}
                  <span aria-hidden>×</span>
                </button>
              ))}
            </div>
          ) : null}
          <input
            type="search"
            value={travelerQuery}
            disabled={busy}
            placeholder="Add traveler — search personnel…"
            onChange={(e) => setTravelerQuery(e.target.value)}
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <div className="max-h-28 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
            {filteredTravelerAgents.length === 0 ? (
              <p className="px-3 py-2 text-xs text-zinc-500">No matching personnel.</p>
            ) : (
              filteredTravelerAgents.map((agent) => {
                const selected = draft.additionalTravelerAgentIds.includes(agent.id);
                return (
                  <button
                    key={`add-traveler-${agent.id}`}
                    type="button"
                    disabled={busy}
                    onClick={() => toggleTraveler(agent.id)}
                    className={cn(
                      "flex w-full items-start gap-2 border-b border-zinc-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-sky-50 dark:border-zinc-800 dark:hover:bg-sky-950/30",
                      selected && "bg-sky-50 dark:bg-sky-950/40",
                    )}
                  >
                    <input
                      type="checkbox"
                      readOnly
                      checked={selected}
                      className="mt-1 size-3.5 accent-sky-600"
                      tabIndex={-1}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-zinc-900 dark:text-zinc-100">
                        {agent.name}
                      </span>
                      {agent.email ? (
                        <span className="text-[11px] text-zinc-500">{agent.email}</span>
                      ) : null}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* 3b. Vehicle */}
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-500">
          Vehicle
          <select
            value={draft.vehicle}
            disabled={busy}
            onChange={(e) => setDraft((prev) => ({ ...prev, vehicle: e.target.value }))}
            className="mt-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <option value="">Select a vehicle…</option>
            {TRAVEL_ORDER_VEHICLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        {/* 4. To be Approved by + Set Levels */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-500">
              To be Approved by:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {hierarchical ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={clearLevels}
                  className="h-7 px-2 text-[11px]"
                >
                  Clear levels
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setLevelsCountInput(
                    hierarchical ? String(draft.approvalLevels.length) : "2",
                  );
                  setLevelsPromptOpen((v) => !v);
                }}
                className="h-7 border-orange-500/50 px-2 text-[11px] text-orange-800 dark:text-orange-200"
              >
                Set Levels
              </Button>
            </div>
          </div>

          {levelsPromptOpen ? (
            <div className="flex flex-wrap items-end gap-2 rounded-xl border border-orange-400/40 bg-orange-500/5 p-3">
              <label className="flex min-w-[8rem] flex-1 flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
                Number of levels
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={levelsCountInput}
                  disabled={busy}
                  onChange={(e) => setLevelsCountInput(e.target.value)}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </label>
              <Button
                type="button"
                disabled={busy}
                onClick={applyLevelsCount}
                className="h-9 bg-orange-600 text-white hover:bg-orange-500"
              >
                Apply
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setLevelsPromptOpen(false)}
                className="h-9"
              >
                Cancel
              </Button>
            </div>
          ) : null}

          {hierarchical ? (
            <>
              <p className="text-[11px] font-normal normal-case tracking-normal text-zinc-500">
                Approvals run in order for required levels. Level 1 is limited to your company;
                Level 2+ can be anyone.
                {approvalLevelsAllowOptional(draft.approvalLevels.length)
                  ? " With 3+ levels, you can mark levels optional — approving an optional level completes the chain early, and optional levels do not block later required steps."
                  : ""}
              </p>
              <ol className="space-y-2">
                {draft.approvalLevels.map((lvl) => {
                  const agent = findAgent(lvl.agentId);
                  const picking = assigningLevel === lvl.level;
                  const optional = lvl.optional === true;
                  const showOptionalToggle = approvalLevelsAllowOptional(
                    draft.approvalLevels.length,
                  );
                  return (
                    <li
                      key={`level-${lvl.level}`}
                      className={cn(
                        "rounded-xl border p-3",
                        optional
                          ? "border-sky-400/40 bg-sky-500/5 dark:border-sky-500/30 dark:bg-sky-950/20"
                          : "border-zinc-200 bg-zinc-50/60 dark:border-zinc-700 dark:bg-zinc-950/40",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white",
                            optional ? "bg-sky-600" : "bg-orange-600",
                          )}
                        >
                          {lvl.level}
                        </span>
                        <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                          Level {lvl.level} Approver
                        </p>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                            optional
                              ? "bg-sky-500/15 text-sky-800 dark:text-sky-200"
                              : "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
                          )}
                        >
                          {optional ? "Optional" : "Required"}
                        </span>
                        {agent ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-200">
                            <Check className="size-3" aria-hidden />
                            {agent.name}
                          </span>
                        ) : (
                          <span className="text-[11px] text-zinc-500">Not assigned</span>
                        )}
                        <div className="ml-auto flex flex-wrap gap-1">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setAssigningLevel(picking ? null : lvl.level);
                              setLevelPickerQuery("");
                            }}
                            className="rounded-lg border border-orange-400/50 px-2 py-1 text-[11px] font-semibold text-orange-800 dark:text-orange-200"
                          >
                            {agent ? "Reassign" : "Click to assign"}
                          </button>
                          {agent ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => clearLevelAgent(lvl.level)}
                              className="inline-flex items-center gap-0.5 rounded-lg border border-zinc-300 px-2 py-1 text-[11px] text-zinc-600 dark:border-zinc-600 dark:text-zinc-300"
                            >
                              <X className="size-3" aria-hidden />
                              Clear
                            </button>
                          ) : null}
                        </div>
                      </div>
                      {showOptionalToggle ? (
                        <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] text-zinc-700 dark:text-zinc-300">
                          <input
                            type="checkbox"
                            checked={optional}
                            disabled={busy}
                            onChange={() => toggleLevelOptional(lvl.level)}
                            className="size-3.5 accent-sky-600"
                          />
                          Make this level optional
                        </label>
                      ) : null}
                      {picking ? (
                        <div className="mt-2 space-y-2">
                          <p className="text-[11px] text-zinc-500">
                            {lvl.level === 1
                              ? "Level 1: colleagues from the requester’s company only."
                              : "Level 2+: personnel from any company."}
                          </p>
                          <input
                            type="search"
                            value={levelPickerQuery}
                            disabled={busy}
                            placeholder="Search personnel…"
                            onChange={(e) => setLevelPickerQuery(e.target.value)}
                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                          />
                          <div className="max-h-36 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                            {filteredLevelAgents.length === 0 ? (
                              <p className="px-3 py-2 text-xs text-zinc-500">No matching users.</p>
                            ) : (
                              filteredLevelAgents.map((agentRow) => (
                                <button
                                  key={`lvl-${lvl.level}-${agentRow.id}`}
                                  type="button"
                                  disabled={busy}
                                  onClick={() => assignLevelAgent(lvl.level, agentRow.id)}
                                  className={cn(
                                    "flex w-full flex-col items-start border-b border-zinc-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-orange-50 dark:border-zinc-800 dark:hover:bg-orange-950/30",
                                    lvl.agentId === agentRow.id && "bg-orange-50 dark:bg-orange-950/40",
                                  )}
                                >
                                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                    {agentRow.name}
                                  </span>
                                  {agentRow.email ? (
                                    <span className="text-[11px] text-zinc-500">{agentRow.email}</span>
                                  ) : null}
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </>
          ) : (
            <>
              <p className="text-[11px] font-normal normal-case tracking-normal text-zinc-500">
            Select one or more approvers from your company. Any selected person can approve the
            travel order. Use Set Levels for sequential multi-step approval (Level 2+ can be any
            company).
          </p>
              <input
                type="search"
                value={agentQuery}
                disabled={busy}
                placeholder="Search personnel…"
                onChange={(e) => setAgentQuery(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
              {selectedApprovers.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {selectedApprovers.map((agent) => (
                    <button
                      key={`selected-approver-${agent.id}`}
                      type="button"
                      disabled={busy}
                      onClick={() => toggleApprover(agent.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-orange-400/50 bg-orange-500/10 px-2.5 py-1 text-[11px] font-semibold text-orange-900 dark:text-orange-100"
                      title="Remove approver"
                    >
                      {agent.name}
                      <span aria-hidden>×</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500">No approvers selected yet.</p>
              )}
              <div className="max-h-36 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
                {filteredAgents.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-zinc-500">No matching users.</p>
                ) : (
                  filteredAgents.map((agent) => {
                    const selected = draft.approvedByAgentIds.includes(agent.id);
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        disabled={busy}
                        onClick={() => toggleApprover(agent.id)}
                        className={cn(
                          "flex w-full items-start gap-2 border-b border-zinc-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-orange-50 dark:border-zinc-800 dark:hover:bg-orange-950/30",
                          selected && "bg-orange-50 dark:bg-orange-950/40",
                        )}
                      >
                        <input
                          type="checkbox"
                          readOnly
                          checked={selected}
                          className="mt-1 size-3.5 accent-orange-600"
                          tabIndex={-1}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-zinc-900 dark:text-zinc-100">
                            {agent.name}
                          </span>
                          {agent.email ? (
                            <span className="text-[11px] text-zinc-500">{agent.email}</span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>

        {/* 5. Approval confirmation */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-500">
            Approval confirmation:
          </p>
          <p className="text-[11px] font-normal normal-case tracking-normal text-zinc-500">
            Only colleagues from your company are listed (same rule as Level 1 approval).
          </p>
          <input
            type="search"
            value={confirmQuery}
            disabled={busy}
            placeholder="Search personnel…"
            onChange={(e) => setConfirmQuery(e.target.value)}
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
          {selectedConfirmer ? (
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Selected:{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">{selectedConfirmer.name}</span>
              {selectedConfirmer.email ? ` · ${selectedConfirmer.email}` : ""}
              <button
                type="button"
                disabled={busy}
                className="ml-2 text-orange-700 underline dark:text-orange-300"
                onClick={() => setDraft((prev) => ({ ...prev, confirmationByAgentId: "" }))}
              >
                Clear
              </button>
            </p>
          ) : null}
          <div className="max-h-36 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
            {filteredConfirmAgents.length === 0 ? (
              <p className="px-3 py-2 text-xs text-zinc-500">No matching users.</p>
            ) : (
              filteredConfirmAgents.map((agent) => (
                <button
                  key={`confirm-${agent.id}`}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setDraft((prev) => ({ ...prev, confirmationByAgentId: agent.id }));
                    setConfirmQuery(agent.name);
                  }}
                  className={cn(
                    "flex w-full flex-col items-start border-b border-zinc-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-orange-50 dark:border-zinc-800 dark:hover:bg-orange-950/30",
                    draft.confirmationByAgentId === agent.id && "bg-orange-50 dark:bg-orange-950/40",
                  )}
                >
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">{agent.name}</span>
                  {agent.email ? (
                    <span className="text-[11px] text-zinc-500">{agent.email}</span>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="bg-orange-600 text-white hover:bg-orange-500"
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Saving…
              </>
            ) : (
              "Submit travel order"
            )}
          </Button>
        </div>
      </div>
    </TaskBoardPopup>
  );
}
