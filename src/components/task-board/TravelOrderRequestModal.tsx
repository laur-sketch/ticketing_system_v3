"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { TaskBoardPopup } from "@/components/task-board/TaskBoardPopup";
import {
  TravelOrderPageNav,
  travelOrderApprovalGridClass,
  type TravelOrderFormPage,
} from "@/components/task-board/TravelOrderPageNav";
import { TravelOrderGatePassFields } from "@/components/task-board/TravelOrderGatePassFields";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { TravelOrderOfflineBanner } from "@/components/offline/TravelOrderOfflineBanner";
import {
  cacheAgents,
  deleteOfflineDraft,
  getOfflineDraft,
  listCachedAgents,
  newTravelOrderOfflineId,
  offlineDraftHasContent,
  saveOfflineDraft,
} from "@/lib/offline/travel-order-offline-db";
import { isBrowserOnline, queueFieldAssignmentCreate, fetchTravelOrderWithTimeout, isTravelOrderNetworkFailure } from "@/lib/offline/travel-order-sync";
import {
  INTAKE_ATTACHMENT_ACCEPT,
  MAX_SCREENSHOT_BYTES,
  isAllowedIntakeAttachment,
} from "@/lib/ticket-intake-screenshots-constants";
import {
  agentIdsFromApprovalLevels,
  approvalLevelsAllowOptional,
  buildEmptyApprovalLevels,
  emptyGatePassDraft,
  emptyTravelLocation,
  emptyTravelOrderDraft,
  travelOrderApprovedByLabel,
  TRAVEL_ORDER_VEHICLE_OPTIONS,
  validateTravelOrderDraft,
  validateTravelOrderGatePass,
  MAX_TRAVEL_ORDER_ATTACHMENTS,
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
  /** @deprecated Task groups removed — title is derived from the Field Assignment label. */
  taskGroupTitle?: string;
  /** Main task / field assignment name. */
  mainTaskName?: string;
  scopedCompanyTeamId?: string | null;
  /** Current operator agent id — used as the automatic requester/traveler, not to lock pickers. */
  companyScopeAgentId?: string | null;
  /** Allow editing the travel order name inside the modal (standalone create). */
  allowEditDetails?: boolean;
  /** Resume a previously saved local draft (IndexedDB localId). */
  resumeLocalId?: string | null;
  onClose: () => void;
  onCreated: (payload: { kpiId: string; offlineQueued?: boolean }) => void;
  /** Called after an explicit Save draft (modal closes). */
  onDraftSaved?: () => void;
};

/**
 * Create-time Travel Order form (three pages):
 * Page 1: Purpose of travel → Travelers → Vehicle → Location(s)
 * Page 2: To be Approved by → To be Confirmed by
 * Page 3: Gate Pass (optional)
 */
export function TravelOrderRequestModal({
  open,
  taskGroupTitle: _unusedTaskGroupTitle = "Travel Orders",
  mainTaskName = "",
  scopedCompanyTeamId,
  companyScopeAgentId = null,
  allowEditDetails: _allowEditDetails = false,
  resumeLocalId = null,
  onClose,
  onCreated,
  onDraftSaved,
}: TravelOrderRequestModalProps) {
  void _unusedTaskGroupTitle;
  const online = useOnlineStatus();
  const [localDraftId, setLocalDraftId] = useState(() => newTravelOrderOfflineId("todraft"));
  const [draft, setDraft] = useState<TravelOrderDraft>(() => emptyTravelOrderDraft());
  const [allAgents, setAllAgents] = useState<AgentOption[]>([]);
  const [agentQuery, setAgentQuery] = useState("");
  const [confirmQuery, setConfirmQuery] = useState("");
  const [travelerQuery, setTravelerQuery] = useState("");
  const [driverQuery, setDriverQuery] = useState("");
  const [levelPickerQuery, setLevelPickerQuery] = useState("");
  const [assigningLevel, setAssigningLevel] = useState<number | null>(null);
  const [levelsPromptOpen, setLevelsPromptOpen] = useState(false);
  const [levelsCountInput, setLevelsCountInput] = useState("2");
  const [formPage, setFormPage] = useState<TravelOrderFormPage>(1);
  const [busy, setBusy] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [queuedOffline, setQueuedOffline] = useState(false);

  const hierarchical = draft.approvalLevels.length > 0;
  /** Internal KPI mainTask — derived from purpose of travel (no separate name field). */
  const effectiveMainTask =
    draft.orderRequest.trim().slice(0, 160) ||
    mainTaskName.trim() ||
    "Travel Order";

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
    return allAgents.find((a) => a.id === agentId) ?? null;
  }

  useEffect(() => {
    if (!open) return;
    setPendingAttachments([]);
    setQueuedOffline(false);
    setError(null);
    setDraftNotice(null);
    setAgentQuery("");
    setConfirmQuery("");
    setTravelerQuery("");
    setDriverQuery("");
    setLevelPickerQuery("");
    setAssigningLevel(null);
    setLevelsPromptOpen(false);
    setLevelsCountInput("2");
    let cancelled = false;
    void (async () => {
      const resumeId = resumeLocalId?.trim() || null;
      if (resumeId) {
        const saved = await getOfflineDraft(resumeId).catch(() => undefined);
        if (!cancelled && saved?.syncStatus === "draft") {
          setLocalDraftId(saved.localId);
          setDraft(saved.draft);
          setFormPage(1);
        } else if (!cancelled) {
          setLocalDraftId(newTravelOrderOfflineId("todraft"));
          setDraft(emptyTravelOrderDraft());
          setFormPage(1);
        }
      } else if (!cancelled) {
        setLocalDraftId(newTravelOrderOfflineId("todraft"));
        setDraft(emptyTravelOrderDraft());
        setFormPage(1);
      }

      // Approvers, confirmer, and travelers are never company-locked.
      try {
        if (!isBrowserOnline()) {
          const cached = await listCachedAgents();
          if (!cancelled) setAllAgents(cached.map((a) => ({ id: a.id, name: a.name, email: a.email })));
          return;
        }
        const res = await fetchTravelOrderWithTimeout("/api/agents?anyCompany=1", { cache: "no-store" });
        const anyList = res.ok ? await res.json() : [];
        if (cancelled) return;
        const parsed = parseAgentList(anyList);
        setAllAgents(parsed);
        void cacheAgents(
          parsed.map((a) => ({
            id: a.id,
            name: a.name,
            email: a.email ?? null,
            cachedAt: new Date().toISOString(),
          })),
        );
      } catch {
        const cached = await listCachedAgents().catch(() => []);
        if (!cancelled) {
          setAllAgents(cached.map((a) => ({ id: a.id, name: a.name, email: a.email })));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, companyScopeAgentId, scopedCompanyTeamId, mainTaskName, resumeLocalId]);

  // Persist in-progress draft so offline edits survive reloads.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      void saveOfflineDraft({
        localId: localDraftId,
        mainTaskName: effectiveMainTask,
        scopedCompanyTeamId: scopedCompanyTeamId ?? null,
        companyScopeAgentId,
        draft,
        attachmentNames: pendingAttachments.map((f) => f.name),
        syncStatus: "draft",
      }).catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(t);
  }, [
    open,
    localDraftId,
    effectiveMainTask,
    scopedCompanyTeamId,
    companyScopeAgentId,
    draft,
    pendingAttachments,
  ]);

  const filteredAgents = useMemo(() => {
    const q = agentQuery.trim().toLowerCase();
    if (!q) return allAgents.slice(0, 40);
    return allAgents
      .filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.email ?? "").toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [allAgents, agentQuery]);

  const filteredConfirmAgents = useMemo(() => {
    const q = confirmQuery.trim().toLowerCase();
    if (!q) return allAgents.slice(0, 40);
    return allAgents
      .filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.email ?? "").toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [allAgents, confirmQuery]);

  const filteredLevelAgents = useMemo(() => {
    const q = levelPickerQuery.trim().toLowerCase();
    if (!q) return allAgents.slice(0, 40);
    return allAgents
      .filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.email ?? "").toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [allAgents, levelPickerQuery]);

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

  const selectedApprovers = draft.approvedByAgentIds
    .map((id) => findAgent(id))
    .filter((a): a is AgentOption => a != null);
  const selectedConfirmer = findAgent(draft.confirmationByAgentId);
  const selectedTravelers = draft.additionalTravelerAgentIds
    .map((id) => findAgent(id))
    .filter((a): a is AgentOption => a != null);
  const creatorAgent = companyScopeAgentId ? findAgent(companyScopeAgentId) : null;
  const travelerOptionsForDriver = (() => {
    const byId = new Map<string, AgentOption>();
    if (!draft.exemptRequesterFromTravelers) {
      if (creatorAgent) {
        byId.set(creatorAgent.id, creatorAgent);
      } else if (companyScopeAgentId) {
        byId.set(companyScopeAgentId, {
          id: companyScopeAgentId,
          name: "You (requester)",
          email: null,
        });
      }
    }
    for (const agent of selectedTravelers) byId.set(agent.id, agent);
    return [...byId.values()];
  })();
  const filteredDriverAgents = (() => {
    const q = driverQuery.trim().toLowerCase();
    const base = q
      ? travelerOptionsForDriver.filter(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            (a.email ?? "").toLowerCase().includes(q),
        )
      : travelerOptionsForDriver;
    return base.slice(0, 40);
  })();
  const selectedDriver = draft.driverAgentId ? findAgent(draft.driverAgentId) : null;

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
    if (
      companyScopeAgentId &&
      agentId === companyScopeAgentId &&
      !draft.exemptRequesterFromTravelers
    ) {
      return;
    }
    setDraft((prev) => {
      const exists = prev.additionalTravelerAgentIds.includes(agentId);
      const additionalTravelerAgentIds = exists
        ? prev.additionalTravelerAgentIds.filter((id) => id !== agentId)
        : [...prev.additionalTravelerAgentIds, agentId];
      const stillTraveler =
        (!prev.exemptRequesterFromTravelers && agentId === companyScopeAgentId) ||
        additionalTravelerAgentIds.includes(agentId);
      return {
        ...prev,
        additionalTravelerAgentIds,
        driverAgentId:
          !stillTraveler && prev.driverAgentId === agentId ? "" : prev.driverAgentId,
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

  async function saveDraftAndClose() {
    const row = {
      localId: localDraftId,
      mainTaskName: effectiveMainTask,
      scopedCompanyTeamId: scopedCompanyTeamId ?? null,
      companyScopeAgentId,
      draft,
      attachmentNames: pendingAttachments.map((f) => f.name),
      syncStatus: "draft" as const,
    };
    if (!offlineDraftHasContent(row)) {
      setError("Add a purpose, traveler, vehicle, location, or approver before saving a draft.");
      setFormPage(1);
      return;
    }
    setDraftSaving(true);
    setError(null);
    try {
      await saveOfflineDraft(row);
      setDraftNotice("Draft saved. You can resume it from Travel Orders.");
      onDraftSaved?.();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save draft.");
    } finally {
      setDraftSaving(false);
    }
  }

  async function submit(opts?: { skipGatePass?: boolean }) {
    const draftForSubmit: TravelOrderDraft = opts?.skipGatePass
      ? { ...draft, gatePass: emptyGatePassDraft() }
      : {
          ...draft,
          gatePass: {
            ...draft.gatePass,
            // Submitting from the Gate Pass page includes Gate Pass even when
            // Est. Departure / Arrival are left blank (optional).
            included: true,
          },
        };

    const validationError = validateTravelOrderDraft(draftForSubmit);
    if (validationError) {
      setError(validationError);
      if (validationError.toLowerCase().includes("gate pass") || validationError.toLowerCase().includes("est.")) {
        setFormPage(3);
      } else if (
        validationError.toLowerCase().includes("approv") ||
        validationError.toLowerCase().includes("confirm")
      ) {
        setFormPage(2);
      } else {
        setFormPage(1);
      }
      return;
    }
    if (!effectiveMainTask.trim()) {
      setError("Enter the purpose of travel.");
      setFormPage(1);
      return;
    }
    if (pendingAttachments.length > MAX_TRAVEL_ORDER_ATTACHMENTS) {
      setError(`You can attach at most ${MAX_TRAVEL_ORDER_ATTACHMENTS} files.`);
      setFormPage(1);
      return;
    }
    for (const file of pendingAttachments) {
      if (file.size > MAX_SCREENSHOT_BYTES) {
        setError("Each attachment must be at most 5MB.");
        setFormPage(1);
        return;
      }
      if (!isAllowedIntakeAttachment(file.type || "", file.name)) {
        setError("Attachments must be images or documents (PDF, Word, Excel, PowerPoint, CSV, TXT).");
        setFormPage(1);
        return;
      }
    }

    const approvedByAgentIds = hierarchical
      ? agentIdsFromApprovalLevels(draftForSubmit.approvalLevels)
      : draftForSubmit.approvedByAgentIds;

    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set(
        "title",
        (effectiveMainTask.trim().replace(/\s+/g, " ").toUpperCase() || "FIELD ASSIGNMENT"),
      );
      form.set("mainTask", effectiveMainTask.trim());
      form.set("orderRequest", draftForSubmit.orderRequest.trim());
      form.set("approvedByAgentIds", JSON.stringify(approvedByAgentIds));
      if (approvedByAgentIds[0]) {
        form.set("approvedByAgentId", approvedByAgentIds[0]);
      }
      if (hierarchical) {
        form.set(
          "approvalLevels",
          JSON.stringify(
            draftForSubmit.approvalLevels.map((lvl) => ({
              level: lvl.level,
              agentId: lvl.agentId,
              optional: lvl.optional === true,
            })),
          ),
        );
      }
      form.set("confirmationByAgentId", draftForSubmit.confirmationByAgentId.trim());
      form.set(
        "additionalTravelerAgentIds",
        JSON.stringify(draftForSubmit.additionalTravelerAgentIds),
      );
      form.set(
        "exemptRequesterFromTravelers",
        draftForSubmit.exemptRequesterFromTravelers ? "1" : "0",
      );
      form.set("vehicle", draftForSubmit.vehicle.trim());
      form.set("driverPresent", draftForSubmit.driverPresent ? "1" : "0");
      form.set(
        "driverAgentId",
        draftForSubmit.driverPresent ? draftForSubmit.driverAgentId.trim() : "",
      );
      form.set(
        "driverLicenseNo",
        draftForSubmit.driverPresent ? draftForSubmit.driverLicenseNo.trim() : "",
      );
      if (scopedCompanyTeamId) form.set("scopedCompanyTeamId", scopedCompanyTeamId);
      form.set(
        "locationsJson",
        JSON.stringify(
          draftForSubmit.locations.map((loc) => ({
            label: loc.label.trim(),
            latitude: null,
            longitude: null,
            remarks: null,
          })),
        ),
      );
      const gp = draftForSubmit.gatePass;
      form.set(
        "gatePassJson",
        JSON.stringify({
          // Est. times are optional — include Gate Pass even when both are blank.
          included: gp.included === true,
          estDepartureAt: gp.estDepartureAt.trim() || null,
          estArrivalAt: gp.estArrivalAt.trim() || null,
          // Actual times / guards are captured only after full approval.
          actualDepartureStartedAt: null,
          actualDepartureStartedLatitude: null,
          actualDepartureStartedLongitude: null,
          actualDepartureEndedAt: null,
          actualDepartureEndedLatitude: null,
          actualDepartureEndedLongitude: null,
          startGuardOnDuty: "",
          endGuardOnDuty: "",
        }),
      );
      for (const file of pendingAttachments) {
        form.append("attachment", file);
      }

      const payloadEntries: Record<string, string> = {};
      for (const [k, v] of form.entries()) {
        if (typeof v === "string") payloadEntries[k] = v;
      }

      async function queueOfflineCreate() {
        const attachments: Array<{ name: string; type: string; dataUrl: string }> = [];
        for (const file of pendingAttachments) {
          if (file.size > MAX_SCREENSHOT_BYTES) continue;
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result ?? ""));
            reader.onerror = () => reject(new Error("Could not read attachment."));
            reader.readAsDataURL(file);
          });
          if (dataUrl) {
            attachments.push({
              name: file.name,
              type: file.type || "application/octet-stream",
              dataUrl,
            });
          }
        }
        await queueFieldAssignmentCreate({
          draftRow: {
            localId: localDraftId,
            mainTaskName: effectiveMainTask,
            scopedCompanyTeamId: scopedCompanyTeamId ?? null,
            companyScopeAgentId,
            draft: draftForSubmit,
            attachmentNames: pendingAttachments.map((f) => f.name),
            syncStatus: "pending",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          payload: payloadEntries,
          attachments,
        });
        setQueuedOffline(true);
        onCreated({ kpiId: localDraftId, offlineQueued: true });
        onClose();
      }

      if (!isBrowserOnline()) {
        await queueOfflineCreate();
        return;
      }

      try {
        const res = await fetchTravelOrderWithTimeout(
          "/api/kpi-maintenance/field-assignment",
          {
            method: "POST",
            body: form,
          },
          8000,
        );
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
        void deleteOfflineDraft(localDraftId).catch(() => undefined);
        onCreated({ kpiId });
        onClose();
      } catch (err) {
        if (isTravelOrderNetworkFailure(err)) {
          await queueOfflineCreate();
          return;
        }
        throw err;
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not create the travel order. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  function goToPage(page: TravelOrderFormPage) {
    if (page === 2 && formPage === 1) {
      if (!draft.orderRequest.trim()) {
        setError("Enter the purpose of travel before continuing.");
        return;
      }
      if (!draft.locations.some((loc) => loc.label.trim())) {
        setError("Add at least one location name before continuing.");
        return;
      }
    }
    if (page === 3 && formPage === 2) {
      if (draft.approvalLevels.length > 0) {
        for (const lvl of draft.approvalLevels) {
          if (!lvl.agentId.trim()) {
            setError(`Assign an approver for ${travelOrderApprovedByLabel(lvl.optional === true)} before continuing.`);
            return;
          }
        }
      } else if (draft.approvedByAgentIds.length === 0) {
        setError("Select at least one approver before continuing.");
        return;
      }
      if (!draft.confirmationByAgentId.trim()) {
        setError("Select who will confirm this travel order before continuing.");
        return;
      }
    }
    setError(null);
    setFormPage(page);
  }

  if (!open) return null;

  return (
    <TaskBoardPopup
      open={open}
      title="Request for Travel Order"
  description={`Field Assignment · ${(effectiveMainTask.trim() || "Travel order")}`}
      onClose={() => {
        if (!busy) onClose();
      }}
      size="lg"
    >
      <div className="space-y-5 overflow-y-auto px-1 pb-2">
        <TravelOrderOfflineBanner />
        {!online ? (
          <p className="rounded-lg border border-amber-400/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
            You are offline. Approvers use the last cached user list. Submit will queue this Travel Order
            and sync when you reconnect.
          </p>
        ) : null}
        {queuedOffline ? (
          <p className="rounded-lg border border-sky-400/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-950 dark:text-sky-100">
            Travel Order saved offline and queued for sync.
          </p>
        ) : null}
        {error ? (
          <p className="rounded-lg border border-rose-400/50 bg-rose-500/10 px-3 py-2 text-sm text-rose-800 dark:text-rose-200">
            {error}
          </p>
        ) : null}

        <TravelOrderPageNav
          page={formPage}
          onPageChange={goToPage}
          nextDisabled={busy}
          backDisabled={busy}
        />

        {formPage === 1 ? (
          <>
            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-500">
              Purpose of travel
              <textarea
                value={draft.orderRequest}
                disabled={busy}
                rows={4}
                placeholder="Purpose of travel, scope of work, and other request details…"
                onChange={(e) => setDraft((prev) => ({ ...prev, orderRequest: e.target.value }))}
                className="mt-1 resize-y rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>

            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-500">
                Attachments
              </p>
              <p className="text-[11px] font-normal normal-case tracking-normal text-zinc-500">
                Optional supporting images or documents (max {MAX_TRAVEL_ORDER_ATTACHMENTS}, 5MB each).
              </p>
              {pendingAttachments.length > 0 ? (
                <ul className="space-y-1.5">
                  {pendingAttachments.map((file, index) => (
                    <li
                      key={`${file.name}-${file.size}-${index}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900/60"
                    >
                      <span className="min-w-0 truncate font-medium text-zinc-800 dark:text-zinc-200">
                        {file.name}
                        <span className="ml-1 font-normal text-zinc-500">
                          ({Math.max(1, Math.round(file.size / 1024))} KB)
                        </span>
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          setPendingAttachments((prev) => prev.filter((_, i) => i !== index))
                        }
                        className="shrink-0 rounded p-0.5 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                        title="Remove file"
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <input
                ref={attachmentInputRef}
                type="file"
                multiple
                accept={INTAKE_ATTACHMENT_ACCEPT}
                disabled={busy || pendingAttachments.length >= MAX_TRAVEL_ORDER_ATTACHMENTS}
                className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []).filter((f) => f.size > 0);
                  e.target.value = "";
                  if (picked.length === 0) return;
                  setPendingAttachments((prev) => {
                    const remaining = MAX_TRAVEL_ORDER_ATTACHMENTS - prev.length;
                    if (remaining <= 0) {
                      setError(`You can attach at most ${MAX_TRAVEL_ORDER_ATTACHMENTS} files.`);
                      return prev;
                    }
                    const next = [...prev];
                    for (const file of picked.slice(0, remaining)) {
                      if (file.size > MAX_SCREENSHOT_BYTES) {
                        setError("Each attachment must be at most 5MB.");
                        continue;
                      }
                      if (!isAllowedIntakeAttachment(file.type || "", file.name)) {
                        setError(
                          "Attachments must be images or documents (PDF, Word, Excel, PowerPoint, CSV, TXT).",
                        );
                        continue;
                      }
                      next.push(file);
                    }
                    return next;
                  });
                }}
              />
              <button
                type="button"
                disabled={busy || pendingAttachments.length >= MAX_TRAVEL_ORDER_ATTACHMENTS}
                onClick={() => attachmentInputRef.current?.click()}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900",
                  (busy || pendingAttachments.length >= MAX_TRAVEL_ORDER_ATTACHMENTS) &&
                    "pointer-events-none opacity-50",
                )}
              >
                <Plus className="size-3.5" aria-hidden />
                Add files
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-500">
                Travelers
              </p>
              <p className="text-[11px] font-normal normal-case tracking-normal text-zinc-500">
                {draft.exemptRequesterFromTravelers
                  ? "You are exempt from the travelers list. Add the people who will travel."
                  : "You are automatically included as the requester. Optionally add co-travelers from any company."}
              </p>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={draft.exemptRequesterFromTravelers}
                  disabled={busy}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setDraft((prev) => {
                      const requesterId = companyScopeAgentId?.trim() || "";
                      const next = {
                        ...prev,
                        exemptRequesterFromTravelers: checked,
                      };
                      if (
                        checked &&
                        requesterId &&
                        prev.driverAgentId === requesterId
                      ) {
                        next.driverAgentId = "";
                      }
                      return next;
                    });
                  }}
                  className="size-4 accent-orange-600"
                />
                <span className="font-medium">Exempt Me from Travelers</span>
              </label>
              {creatorAgent && !draft.exemptRequesterFromTravelers ? (
                <p className="text-xs text-zinc-700 dark:text-zinc-300">
                  Requester:{" "}
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {creatorAgent.name}
                  </span>
                  {creatorAgent.email ? ` · ${creatorAgent.email}` : ""}
                </p>
              ) : creatorAgent && draft.exemptRequesterFromTravelers ? (
                <div className="space-y-1 rounded-lg border border-orange-400/40 bg-orange-500/[0.06] px-2.5 py-2 dark:border-orange-500/30 dark:bg-orange-500/[0.08]">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange-800 dark:text-orange-200">
                    Prepared By:
                  </p>
                  <p className="text-xs text-zinc-800 dark:text-zinc-200">
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {creatorAgent.name}
                    </span>
                    {creatorAgent.email ? (
                      <span className="text-zinc-500"> · {creatorAgent.email}</span>
                    ) : null}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    You are registered as Prepared By and will not appear in the travelers list.
                  </p>
                </div>
              ) : !draft.exemptRequesterFromTravelers ? (
                <p className="text-xs text-zinc-500">You will be assigned as the requester on save.</p>
              ) : null}
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

              <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={draft.driverPresent}
                  disabled={busy}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setDraft((prev) => ({
                      ...prev,
                      driverPresent: checked,
                      driverAgentId: checked ? prev.driverAgentId : "",
                      driverLicenseNo: checked ? prev.driverLicenseNo : "",
                    }));
                    if (!checked) setDriverQuery("");
                  }}
                  className="size-4 accent-orange-600"
                />
                <span className="font-medium">Driver present</span>
              </label>

              {draft.driverPresent ? (
                <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-700 dark:bg-zinc-950/40">
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-500">
                      Driver
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      {draft.exemptRequesterFromTravelers
                        ? "Choose from the travelers on this order."
                        : "Choose from the travelers on this order (requester + co-travelers)."}
                    </p>
                    {selectedDriver ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full border border-orange-400/50 bg-orange-500/10 px-2.5 py-1 text-[11px] font-semibold text-orange-900 dark:text-orange-100">
                          {selectedDriver.name}
                          {selectedDriver.email ? ` · ${selectedDriver.email}` : ""}
                        </span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setDraft((prev) => ({ ...prev, driverAgentId: "" }));
                            setDriverQuery("");
                          }}
                          className="text-[11px] font-semibold text-orange-700 underline dark:text-orange-300"
                        >
                          Clear
                        </button>
                      </div>
                    ) : null}
                    <input
                      type="search"
                      value={driverQuery}
                      disabled={busy}
                      placeholder="Search travelers…"
                      onChange={(e) => setDriverQuery(e.target.value)}
                      className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                    <div className="max-h-28 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
                      {travelerOptionsForDriver.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-zinc-500">
                          {draft.exemptRequesterFromTravelers
                            ? "No travelers yet. Add travelers above to choose a driver."
                            : "No travelers yet. You are included as requester once saved; add co-travelers above to choose among them."}
                        </p>
                      ) : filteredDriverAgents.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-zinc-500">No matching traveler.</p>
                      ) : (
                        filteredDriverAgents.map((agent) => (
                          <button
                            key={`driver-${agent.id}`}
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setDraft((prev) => ({ ...prev, driverAgentId: agent.id }));
                              setDriverQuery(agent.name);
                            }}
                            className={cn(
                              "flex w-full flex-col items-start border-b border-zinc-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-orange-50 dark:border-zinc-800 dark:hover:bg-orange-950/30",
                              draft.driverAgentId === agent.id &&
                                "bg-orange-50 dark:bg-orange-950/40",
                            )}
                          >
                            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                              {agent.name}
                            </span>
                            {agent.email ? (
                              <span className="text-[11px] text-zinc-500">{agent.email}</span>
                            ) : null}
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
                    <span>
                      License No.{" "}
                      <span className="font-semibold normal-case tracking-normal text-zinc-500">
                        (optional)
                      </span>
                    </span>
                    <input
                      type="text"
                      value={draft.driverLicenseNo}
                      disabled={busy}
                      placeholder="Driver license number (optional)"
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, driverLicenseNo: e.target.value }))
                      }
                      className="mt-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </label>
                </div>
              ) : null}
            </div>

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
                        {draft.locations.length > 1
                          ? `Location ${index + 1}`
                          : "Location name / address"}
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
                        <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                          Start
                        </p>
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
                        <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                          End
                        </p>
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
          </>
        ) : formPage === 2 ? (
          <>
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
                    Approvals run in order for required levels. You can assign anyone from any
                    company at every level.
                    {approvalLevelsAllowOptional(draft.approvalLevels.length)
                      ? " With 3+ levels, you can mark seats optional — only required APPROVED BY steps follow the chain. Optional approvers can act anytime and never finish the order alone; every required approval is still needed."
                      : ""}
                  </p>
                  <div className={travelOrderApprovalGridClass(draft.approvalLevels.length)}>
                    {draft.approvalLevels.map((lvl) => {
                      const agent = findAgent(lvl.agentId);
                      const picking = assigningLevel === lvl.level;
                      const optional = lvl.optional === true;
                      const showOptionalToggle = approvalLevelsAllowOptional(
                        draft.approvalLevels.length,
                      );
                      return (
                        <div
                          key={`level-${lvl.level}`}
                          className={cn(
                            "min-w-0 self-start rounded-xl border p-3",
                            optional
                              ? "border-sky-400/40 bg-sky-500/5 dark:border-sky-500/30 dark:bg-sky-950/20"
                              : "border-zinc-200 bg-zinc-50/60 dark:border-zinc-700 dark:bg-zinc-950/40",
                          )}
                        >
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                            <span
                              className={cn(
                                optional
                                  ? "text-sky-700 dark:text-sky-300"
                                  : "text-zinc-500 dark:text-zinc-500",
                              )}
                            >
                              {travelOrderApprovedByLabel(optional)}
                            </span>
                          </p>
                          <p
                            className={cn(
                              "mt-1 break-words text-sm font-medium leading-snug",
                              agent
                                ? "text-emerald-800 dark:text-emerald-300"
                                : "text-zinc-400 dark:text-zinc-600",
                            )}
                          >
                            {agent?.name ?? "—"}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setAssigningLevel(picking ? null : lvl.level);
                                setLevelPickerQuery("");
                              }}
                              className="rounded-lg border border-orange-400/50 px-2 py-1 text-[11px] font-semibold text-orange-800 dark:text-orange-200"
                            >
                              {agent ? "Reassign" : "Assign"}
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
                          {showOptionalToggle ? (
                            <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] text-zinc-700 dark:text-zinc-300">
                              <input
                                type="checkbox"
                                checked={optional}
                                disabled={busy}
                                onChange={() => toggleLevelOptional(lvl.level)}
                                className="size-3.5 accent-sky-600"
                              />
                              Optional
                            </label>
                          ) : null}
                          {picking ? (
                            <div className="mt-2 space-y-2">
                              <p className="text-[11px] text-zinc-500">
                                Search personnel from any company for this{" "}
                                {travelOrderApprovedByLabel(optional)} step.
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
                                        lvl.agentId === agentRow.id &&
                                          "bg-orange-50 dark:bg-orange-950/40",
                                      )}
                                    >
                                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                        {agentRow.name}
                                      </span>
                                      {agentRow.email ? (
                                        <span className="text-[11px] text-zinc-500">
                                          {agentRow.email}
                                        </span>
                                      ) : null}
                                    </button>
                                  ))
                                )}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[11px] font-normal normal-case tracking-normal text-zinc-500">
                    Select one or more approvers from any company. Any selected person can approve
                    the travel order. Use Set Levels for sequential multi-step approval.
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
                    <div
                      className={cn(
                        travelOrderApprovalGridClass(selectedApprovers.length),
                        "rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-700 dark:bg-zinc-950/40",
                      )}
                    >
                      {selectedApprovers.map((agent) => (
                        <div key={`selected-approver-${agent.id}`} className="min-w-0 self-start">
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                            Approver
                          </p>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => toggleApprover(agent.id)}
                            className="mt-1 break-words text-left text-sm font-medium leading-snug text-emerald-800 hover:underline dark:text-emerald-300"
                            title="Remove approver"
                          >
                            {agent.name}
                            <span className="ml-1 text-zinc-400" aria-hidden>
                              ×
                            </span>
                          </button>
                        </div>
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

            <div className="space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-500">
                To be Confirmed by:
              </p>
              <p className="text-[11px] font-normal normal-case tracking-normal text-zinc-500">
                Select who will confirm this travel order. Personnel from any company are listed.
              </p>
              {selectedConfirmer ? (
                <div className="min-w-0 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-700 dark:bg-zinc-950/40">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                    Confirmer
                  </p>
                  <p className="mt-1 break-words text-sm font-medium leading-snug text-emerald-800 dark:text-emerald-300">
                    {selectedConfirmer.name}
                    {selectedConfirmer.email ? (
                      <span className="font-normal text-zinc-500">
                        {" "}
                        · {selectedConfirmer.email}
                      </span>
                    ) : null}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    className="mt-1 text-[11px] text-orange-700 underline dark:text-orange-300"
                    onClick={() => setDraft((prev) => ({ ...prev, confirmationByAgentId: "" }))}
                  >
                    Clear
                  </button>
                </div>
              ) : null}
              <input
                type="search"
                value={confirmQuery}
                disabled={busy}
                placeholder="Search personnel…"
                onChange={(e) => setConfirmQuery(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
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
                        draft.confirmationByAgentId === agent.id &&
                          "bg-orange-50 dark:bg-orange-950/40",
                      )}
                    >
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {agent.name}
                      </span>
                      {agent.email ? (
                        <span className="text-[11px] text-zinc-500">{agent.email}</span>
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            </div>
          </>
        ) : (
          <TravelOrderGatePassFields
            value={draft.gatePass}
            disabled={busy}
            showActualTimes={false}
            onChange={(gatePass) => setDraft((prev) => ({ ...prev, gatePass }))}
          />
        )}

        {draftNotice ? (
          <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-800 dark:text-emerald-200">
            {draftNotice}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <Button
            type="button"
            variant="outline"
            disabled={busy || draftSaving}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy || draftSaving}
            onClick={() => void saveDraftAndClose()}
            title="Save this travel order locally and finish it later"
          >
            {draftSaving ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Saving draft…
              </>
            ) : (
              "Save draft"
            )}
          </Button>
          {formPage === 1 ? (
            <Button
              type="button"
              disabled={busy}
              onClick={() => goToPage(2)}
              className="bg-orange-600 text-white hover:bg-orange-500"
            >
              Next
            </Button>
          ) : formPage === 2 ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => goToPage(1)}
              >
                Back
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={() => goToPage(3)}
                className="bg-orange-600 text-white hover:bg-orange-500"
              >
                Next
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => goToPage(2)}
              >
                Back
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void submit({ skipGatePass: true })}
              >
                Continue without Gate Pass
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
            </>
          )}
        </div>
      </div>
    </TaskBoardPopup>
  );
}
