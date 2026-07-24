"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DateTime } from "luxon";
import { ImagePlus, Check, Loader2, MapPin, X } from "lucide-react";
import { MapLocationPicker } from "@/components/task-board/MapLocationPicker";
import {
  canApproveTravelOrderNow,
  canCancelTravelOrderNow,
  canConfirmTravelOrderNow,
  getOperatorActionableApprovalLevel,
  getUnlockedIncompleteLevels,
  hasHierarchicalApprovals,
  isApprovalHierarchySatisfied,
  isApprovalLevelOptional,
  isApprovalLevelUnlocked,
  isTravelOrderApproved,
  isTravelOrderRunning,
  TRAVEL_ORDER_STATUS,
  travelOrderLocationVisitStatus,
  travelOrderLocationVisitStatusLabel,
  travelOrderVehicleLabel,
  type TravelOrderDto,
  type TravelOrderLocationDto,
} from "@/lib/travel-order";
import { cn } from "@/lib/cn";

type TravelOrderSummaryPanelProps = {
  taskId: string;
  /** When set, only this travel order is shown (e.g. notification deep link). */
  focusTravelOrderId?: string | null;
  /** Current operator agent id (for designated approver checks). */
  operatorAgentId?: string | null;
  /** Admins / assigners can also approve. */
  canAssignWork?: boolean;
  /** Whether the viewer can mark locations / edit remarks. */
  canCheckIn?: boolean;
  /** Refresh board after KPI is recorded. */
  onKpiSubmitted?: () => void;
};

/** Display travel-order check-in times in Taiwan (GMT+8). */
const TRAVEL_ORDER_TIME_ZONE = "Asia/Taipei";
const MAX_LOCATION_IMAGES = 5;

function formatCheckedAt(iso: string | null): string {
  if (!iso) return "";
  const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone(TRAVEL_ORDER_TIME_ZONE);
  if (!dt.isValid) return iso;
  return `${dt.toFormat("MMM d, yyyy, h:mm:ss a")} GMT+8 Taiwan`;
}

function readDeviceGps(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation is not available on this device."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      (err) => {
        reject(new Error(err.message || "Could not read GPS position."));
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });
}

/** Compact Travel Order summary shown inside task details for Field Assignment cards. */
export function TravelOrderSummaryPanel({
  taskId,
  focusTravelOrderId = null,
  operatorAgentId = null,
  canAssignWork = false,
  canCheckIn = true,
  onKpiSubmitted,
}: TravelOrderSummaryPanelProps) {
  const [orders, setOrders] = useState<TravelOrderDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [declineDraft, setDeclineDraft] = useState<{
    orderId: string;
    asConfirmer: boolean;
    reason: string;
  } | null>(null);
  const [mapLoc, setMapLoc] = useState<{
    label: string;
    kind: "start" | "end";
    latitude: number;
    longitude: number;
    capturedAt: string | null;
  } | null>(null);
  const remarksTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/kpi-maintenance/${encodeURIComponent(taskId)}/travel-orders`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not load travel orders.");
      }
      const payload = (await res.json()) as { travelOrders?: TravelOrderDto[] };
      setOrders(Array.isArray(payload.travelOrders) ? payload.travelOrders : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not load travel orders.");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const timers = remarksTimers.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  function replaceOrder(next: TravelOrderDto) {
    setOrders((prev) => prev.map((o) => (o.id === next.id ? next : o)));
  }

  async function approveOrder(order: TravelOrderDto) {
    setBusyKey(`approve-${order.id}`);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/kpi-maintenance/${encodeURIComponent(taskId)}/travel-orders/${encodeURIComponent(order.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "approve-level" }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as {
        travelOrder?: TravelOrderDto;
        error?: string;
      };
      if (!res.ok || !body.travelOrder) {
        throw new Error(body.error ?? "Could not approve the travel order.");
      }
      replaceOrder(body.travelOrder);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Could not approve the travel order.");
    } finally {
      setBusyKey(null);
    }
  }

  async function confirmOrder(order: TravelOrderDto) {
    setBusyKey(`confirm-${order.id}`);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/kpi-maintenance/${encodeURIComponent(taskId)}/travel-orders/${encodeURIComponent(order.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: TRAVEL_ORDER_STATUS.CONFIRMED }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as {
        travelOrder?: TravelOrderDto;
        error?: string;
      };
      if (!res.ok || !body.travelOrder) {
        throw new Error(body.error ?? "Could not confirm the travel order.");
      }
      replaceOrder(body.travelOrder);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Could not confirm the travel order.");
    } finally {
      setBusyKey(null);
    }
  }

  async function rejectOrder(order: TravelOrderDto, asConfirmer: boolean, reason: string) {
    const trimmed = reason.trim();
    if (!trimmed) {
      setActionError("Please explain why you are declining this travel order.");
      return;
    }
    setBusyKey(`reject-${order.id}`);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/kpi-maintenance/${encodeURIComponent(taskId)}/travel-orders/${encodeURIComponent(order.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reject", rejectionReason: trimmed }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as {
        travelOrder?: TravelOrderDto;
        error?: string;
      };
      if (!res.ok || !body.travelOrder) {
        throw new Error(body.error ?? "Could not decline the travel order.");
      }
      replaceOrder(body.travelOrder);
      setDeclineDraft(null);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Could not decline the travel order.");
    } finally {
      setBusyKey(null);
    }
  }

  async function cancelOrder(order: TravelOrderDto) {
    const ok = window.confirm(
      "Cancel this travel order? Approvers will no longer be able to act on it.",
    );
    if (!ok) return;
    setBusyKey(`cancel-${order.id}`);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/kpi-maintenance/${encodeURIComponent(taskId)}/travel-orders/${encodeURIComponent(order.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "cancel" }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as {
        travelOrder?: TravelOrderDto;
        error?: string;
      };
      if (!res.ok || !body.travelOrder) {
        throw new Error(body.error ?? "Could not cancel the travel order.");
      }
      replaceOrder(body.travelOrder);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Could not cancel the travel order.");
    } finally {
      setBusyKey(null);
    }
  }

  async function submitAsDone(order: TravelOrderDto) {
    setBusyKey(`done-${order.id}`);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/kpi-maintenance/${encodeURIComponent(taskId)}/travel-orders/${encodeURIComponent(order.id)}/submit-done`,
        { method: "POST" },
      );
      const body = (await res.json().catch(() => ({}))) as {
        travelOrder?: TravelOrderDto;
        error?: string;
        kpiPercent?: number;
      };
      if (!res.ok || !body.travelOrder) {
        throw new Error(body.error ?? "Could not submit travel order as done.");
      }
      replaceOrder(body.travelOrder);
      onKpiSubmitted?.();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Could not submit travel order as done.");
    } finally {
      setBusyKey(null);
    }
  }

  async function patchLocation(
    orderId: string,
    locationId: string,
    body: Record<string, unknown>,
  ): Promise<TravelOrderDto | null> {
    const res = await fetch(
      `/api/kpi-maintenance/${encodeURIComponent(taskId)}/travel-orders/${encodeURIComponent(orderId)}/locations/${encodeURIComponent(locationId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const payload = (await res.json().catch(() => ({}))) as {
      travelOrder?: TravelOrderDto;
      error?: string;
    };
    if (!res.ok || !payload.travelOrder) {
      throw new Error(payload.error ?? "Could not update location.");
    }
    replaceOrder(payload.travelOrder);
    return payload.travelOrder;
  }

  async function captureVisit(
    order: TravelOrderDto,
    loc: TravelOrderLocationDto,
    visitAction: "start" | "end",
  ) {
    const key = `${visitAction}-${loc.id}`;
    setBusyKey(key);
    setActionError(null);
    try {
      const gps = await readDeviceGps();
      await patchLocation(order.id, loc.id, {
        visitAction,
        latitude: gps.latitude,
        longitude: gps.longitude,
        capturedAt: new Date().toISOString(),
      });
    } catch (err: unknown) {
      setActionError(
        err instanceof Error
          ? err.message
          : visitAction === "start"
            ? "Could not start location visit."
            : "Could not end location visit.",
      );
    } finally {
      setBusyKey(null);
    }
  }

  function scheduleRemarksSave(orderId: string, locationId: string, remarks: string) {
    const key = locationId;
    const existing = remarksTimers.current.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      void (async () => {
        setBusyKey(`remarks-${locationId}`);
        setActionError(null);
        try {
          await patchLocation(orderId, locationId, { remarks });
        } catch (err: unknown) {
          setActionError(err instanceof Error ? err.message : "Could not save remarks.");
        } finally {
          setBusyKey((prev) => (prev === `remarks-${locationId}` ? null : prev));
        }
      })();
    }, 500);
    remarksTimers.current.set(key, timer);
  }

  async function uploadLocationImages(order: TravelOrderDto, loc: TravelOrderLocationDto, fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const remaining = MAX_LOCATION_IMAGES - loc.attachments.length;
    if (remaining <= 0) {
      setActionError(`At most ${MAX_LOCATION_IMAGES} images per location.`);
      return;
    }
    const files = Array.from(fileList).slice(0, remaining);
    const key = `img-${loc.id}`;
    setBusyKey(key);
    setActionError(null);
    try {
      const form = new FormData();
      for (const file of files) form.append("images", file);
      const res = await fetch(
        `/api/kpi-maintenance/${encodeURIComponent(taskId)}/travel-orders/${encodeURIComponent(order.id)}/locations/${encodeURIComponent(loc.id)}`,
        { method: "POST", body: form },
      );
      const payload = (await res.json().catch(() => ({}))) as {
        travelOrder?: TravelOrderDto;
        error?: string;
      };
      if (!res.ok || !payload.travelOrder) {
        throw new Error(payload.error ?? "Could not upload images.");
      }
      replaceOrder(payload.travelOrder);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Could not upload images.");
    } finally {
      setBusyKey(null);
    }
  }

  async function removeLocationImage(order: TravelOrderDto, loc: TravelOrderLocationDto, storedFileName: string) {
    const key = `rm-${loc.id}-${storedFileName}`;
    setBusyKey(key);
    setActionError(null);
    try {
      await patchLocation(order.id, loc.id, { removeAttachment: storedFileName });
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Could not remove image.");
    } finally {
      setBusyKey(null);
    }
  }

  function openGpsPin(
    loc: TravelOrderLocationDto,
    kind: "start" | "end",
  ) {
    if (kind === "start") {
      if (loc.startedLatitude == null || loc.startedLongitude == null) return;
      setMapLoc({
        label: loc.label,
        kind: "start",
        latitude: loc.startedLatitude,
        longitude: loc.startedLongitude,
        capturedAt: loc.startedAt,
      });
      return;
    }
    const lat = loc.endedLatitude ?? loc.latitude;
    const lng = loc.endedLongitude ?? loc.longitude;
    if (lat == null || lng == null) return;
    setMapLoc({
      label: loc.label,
      kind: "end",
      latitude: lat,
      longitude: lng,
      capturedAt: loc.endedAt ?? loc.checkedAt,
    });
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-xs text-zinc-500">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Loading travel orders…
      </p>
    );
  }
  if (error) {
    return <p className="text-xs text-rose-600 dark:text-rose-300">{error}</p>;
  }
  if (orders.length === 0) return null;

  const focusId = focusTravelOrderId?.trim() || null;
  const visibleOrders = focusId ? orders.filter((o) => o.id === focusId) : orders;
  if (visibleOrders.length === 0) {
    return (
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        This travel order is no longer available.
      </p>
    );
  }

  return (
    <>
      <div className="space-y-3 rounded-xl border border-orange-400/40 bg-orange-500/[0.06] p-3 dark:border-orange-500/30 dark:bg-orange-500/[0.08]">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-orange-800 dark:text-orange-200">
          Travel order{visibleOrders.length === 1 ? "" : "s"}
        </p>
        {actionError ? (
          <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-700 dark:text-rose-200">
            {actionError}
          </p>
        ) : null}
        {visibleOrders.map((order) => {
          const approved = isTravelOrderApproved(order.status);
          const running = isTravelOrderRunning(order.status);
          const confirmed = order.status === TRAVEL_ORDER_STATUS.CONFIRMED;
          const hierarchical = hasHierarchicalApprovals(order.approvalLevels ?? []);
          const levels = order.approvalLevels ?? [];
          const actionableLevel = hierarchical
            ? getOperatorActionableApprovalLevel(levels, operatorAgentId, { canAssignWork })
            : null;
          const unlockedLevels = hierarchical ? getUnlockedIncompleteLevels(levels) : [];
          const hierarchyDone = hierarchical && isApprovalHierarchySatisfied(levels);
          const earlyOptionalDone = levels.find(
            (l) => isApprovalLevelOptional(l) && Boolean(l.approvedAt),
          );
          const canApproveThis = canApproveTravelOrderNow(
            operatorAgentId,
            { ...order, approvalLevels: levels },
            { canAssignWork },
          );
          const canConfirmThis = canConfirmTravelOrderNow(
            operatorAgentId,
            order,
            { canAssignWork },
          );
          const rejected = order.status === TRAVEL_ORDER_STATUS.REJECTED;
          const cancelled = order.status === TRAVEL_ORDER_STATUS.CANCELLED;
          const canCancelThis = canCancelTravelOrderNow(operatorAgentId, order);
          const checkedCount = order.locations.filter((l) => l.endedAt || l.checkedAt).length;
          const totalCount = order.locations.length;
          const liveKpiPercent =
            totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;
          const kpiAlreadySubmitted = order.kpiSubmittedAt != null;
          const canSubmitDone = running && canCheckIn && !kpiAlreadySubmitted;

          return (
            <div
              key={order.id}
              className="space-y-2 rounded-lg border border-zinc-200 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-950/60"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p
                  className={
                    rejected || cancelled
                      ? "text-xs font-semibold text-rose-700 dark:text-rose-300"
                      : "text-xs font-semibold text-zinc-900 dark:text-zinc-100"
                  }
                >
                  Status: {order.status}
                </p>
                {!hierarchical ? (
                  <p className="text-[11px] text-zinc-500">
                    {approved ? "Approved by" : "To be Approved by"}:{" "}
                    {(order.approvedByAgents?.length
                      ? order.approvedByAgents.map((a) => a.name).join(", ")
                      : order.approvedByAgent?.name) ?? "—"}
                  </p>
                ) : null}
              </div>
              {rejected ? (
                <div className="space-y-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-2 dark:text-rose-200">
                  <p className="text-xs font-semibold text-rose-700 dark:text-rose-200">
                    This travel order was declined
                    {order.rejectedByAgent?.name ? ` by ${order.rejectedByAgent.name}` : ""}
                    {order.rejectedAtLevel != null
                      ? ` at Level ${order.rejectedAtLevel}`
                      : order.rejectedByAgent
                        ? " at confirmation"
                        : ""}
                    {" "}and cannot proceed.
                  </p>
                  {order.rejectionReason ? (
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-rose-800/80 dark:text-rose-300/90">
                        Decline feedback
                      </p>
                      <p className="whitespace-pre-wrap text-xs text-rose-900/90 dark:text-rose-100/90">
                        {order.rejectionReason}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {cancelled ? (
                <p className="rounded-lg border border-zinc-400/40 bg-zinc-500/10 px-2.5 py-1.5 text-xs text-zinc-700 dark:text-zinc-300">
                  This travel order was cancelled by its creator.
                </p>
              ) : null}
              {(order.travelers?.length ?? 0) > 0 || order.createdByAgent ? (
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                  Travelers:{" "}
                  {(order.travelers?.length
                    ? order.travelers.map((t) => t.name).join(", ")
                    : order.createdByAgent?.name) ?? "—"}
                </p>
              ) : null}
              {order.vehicle ? (
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                  Vehicle: {travelOrderVehicleLabel(order.vehicle)}
                </p>
              ) : null}

              {hierarchical ? (
                <div className="space-y-1.5 rounded-lg border border-zinc-200 bg-zinc-50/80 p-2.5 dark:border-zinc-700 dark:bg-zinc-900/40">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-400">
                    Approval hierarchy
                    {order.status === TRAVEL_ORDER_STATUS.SUBMITTED && unlockedLevels.length > 0
                      ? ` · waiting on Level${unlockedLevels.length > 1 ? "s" : ""} ${unlockedLevels
                          .map((l) => l.level)
                          .join(", ")}`
                      : null}
                    {hierarchyDone &&
                    (approved || order.status === TRAVEL_ORDER_STATUS.SUBMITTED)
                      ? earlyOptionalDone
                        ? ` · completed via optional Level ${earlyOptionalDone.level}`
                        : " · all required levels approved"
                      : null}
                    {rejected && order.rejectedAtLevel != null
                      ? ` · declined at Level ${order.rejectedAtLevel}`
                      : null}
                    {rejected && order.rejectedAtLevel == null && order.rejectedByAgent
                      ? " · declined after approval"
                      : null}
                  </p>
                  <ol className="space-y-1.5">
                    {levels.map((lvl) => {
                      const done = Boolean(lvl.approvedAt);
                      const optional = isApprovalLevelOptional(lvl);
                      const declinedHere =
                        rejected &&
                        order.rejectedAtLevel != null &&
                        order.rejectedAtLevel === lvl.level;
                      const closedAfterDecline =
                        rejected &&
                        order.rejectedAtLevel != null &&
                        lvl.level > order.rejectedAtLevel;
                      const unlocked =
                        !rejected &&
                        order.status === TRAVEL_ORDER_STATUS.SUBMITTED &&
                        !done &&
                        isApprovalLevelUnlocked(levels, lvl.level);
                      const skipped =
                        !done &&
                        !declinedHere &&
                        !closedAfterDecline &&
                        (approved || hierarchyDone) &&
                        !unlocked;
                      return (
                        <li
                          key={`${order.id}-lvl-${lvl.level}`}
                          className="flex flex-wrap items-start gap-2 text-xs"
                        >
                          <span
                            className={
                              declinedHere
                                ? "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white"
                                : done
                                  ? "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"
                                  : unlocked
                                    ? "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-orange-600 text-[10px] font-bold text-white"
                                    : skipped
                                      ? "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-sky-400/50 text-[10px] font-bold text-sky-700 dark:text-sky-300"
                                      : "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-[10px] font-bold text-zinc-500 dark:border-zinc-600"
                            }
                            aria-hidden
                          >
                            {declinedHere ? (
                              <X className="size-3" />
                            ) : done ? (
                              <Check className="size-3" />
                            ) : (
                              lvl.level
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                              Level {lvl.level}: {lvl.agent?.name ?? "Unassigned"}
                              <span
                                className={
                                  optional
                                    ? "ml-1.5 text-[10px] font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300"
                                    : "ml-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500"
                                }
                              >
                                {optional ? "Optional" : "Required"}
                              </span>
                            </p>
                            {declinedHere ? (
                              <p className="text-[11px] text-rose-700 dark:text-rose-300">
                                Declined
                                {order.rejectedByAgent?.name
                                  ? ` by ${order.rejectedByAgent.name}`
                                  : lvl.agent?.name
                                    ? ` by ${lvl.agent.name}`
                                    : ""}
                                {order.rejectedAt
                                  ? ` · ${formatCheckedAt(order.rejectedAt)}`
                                  : ""}
                              </p>
                            ) : done ? (
                              <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                                Approved
                                {optional ? " (optional — completed chain)" : ""}
                                {lvl.approvedByAgent?.name
                                  ? ` by ${lvl.approvedByAgent.name}`
                                  : ""}
                                {lvl.approvedAt
                                  ? ` · ${formatCheckedAt(lvl.approvedAt)}`
                                  : ""}
                              </p>
                            ) : unlocked ? (
                              <p className="text-[11px] text-orange-700 dark:text-orange-300">
                                Pending — actionable now
                                {optional ? " · approving completes the order" : ""}
                              </p>
                            ) : skipped ? (
                              <p className="text-[11px] text-sky-700 dark:text-sky-300">
                                {earlyOptionalDone
                                  ? `Skipped — optional Level ${earlyOptionalDone.level} completed the chain`
                                  : "Skipped — not required after hierarchy completed"}
                              </p>
                            ) : closedAfterDecline ? (
                              <p className="text-[11px] text-zinc-500">
                                Closed — declined at Level {order.rejectedAtLevel}
                              </p>
                            ) : (
                              <p className="text-[11px] text-zinc-500">
                                Waiting for previous required level(s)
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                  {rejected && order.rejectedAtLevel == null && order.rejectedByAgent ? (
                    <p className="mt-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-700 dark:text-rose-300">
                      Declined at confirmation by {order.rejectedByAgent.name}
                      {order.rejectedAt ? ` · ${formatCheckedAt(order.rejectedAt)}` : ""}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {canApproveThis ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={
                        busyKey === `approve-${order.id}` ||
                        busyKey === `reject-${order.id}` ||
                        declineDraft?.orderId === order.id
                      }
                      onClick={() => void approveOrder(order)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busyKey === `approve-${order.id}` ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      ) : null}
                      {hierarchical && actionableLevel
                        ? `Approve Level ${actionableLevel.level}${
                            isApprovalLevelOptional(actionableLevel) ? " (optional)" : ""
                          }`
                        : "Approve travel order"}
                    </button>
                    <button
                      type="button"
                      disabled={busyKey === `approve-${order.id}` || busyKey === `reject-${order.id}`}
                      onClick={() =>
                        setDeclineDraft({ orderId: order.id, asConfirmer: false, reason: "" })
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/50 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:text-rose-200"
                    >
                      Do not approve
                    </button>
                  </div>
                  {declineDraft?.orderId === order.id && !declineDraft.asConfirmer ? (
                    <div className="space-y-2 rounded-lg border border-rose-500/40 bg-rose-500/5 p-2.5">
                      <label className="block space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-rose-800 dark:text-rose-300">
                          Why are you declining?
                        </span>
                        <textarea
                          value={declineDraft.reason}
                          onChange={(e) =>
                            setDeclineDraft((prev) =>
                              prev ? { ...prev, reason: e.target.value } : prev,
                            )
                          }
                          rows={3}
                          maxLength={2000}
                          placeholder="Explain why this travel order is not approved…"
                          className="w-full rounded-lg border border-rose-400/40 bg-white px-2.5 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-rose-500 dark:border-rose-500/30 dark:bg-zinc-950 dark:text-zinc-100"
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busyKey === `reject-${order.id}` || !declineDraft.reason.trim()}
                          onClick={() => void rejectOrder(order, false, declineDraft.reason)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {busyKey === `reject-${order.id}` ? (
                            <Loader2 className="size-3.5 animate-spin" aria-hidden />
                          ) : null}
                          Submit decline
                        </button>
                        <button
                          type="button"
                          disabled={busyKey === `reject-${order.id}`}
                          onClick={() => setDeclineDraft(null)}
                          className="inline-flex items-center rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {canCancelThis ? (
                <button
                  type="button"
                  disabled={busyKey === `cancel-${order.id}`}
                  onClick={() => void cancelOrder(order)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-400/60 bg-zinc-500/10 px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200"
                >
                  {busyKey === `cancel-${order.id}` ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : null}
                  Cancel travel order
                </button>
              ) : null}
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-400">
                  Order request
                </p>
                <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
                  {order.orderRequest || "—"}
                </p>
              </div>
              <ul className="space-y-2">
                {order.locations.map((loc) => {
                  const visitStatus = travelOrderLocationVisitStatus(loc);
                  const statusLabel = travelOrderLocationVisitStatusLabel(visitStatus);
                  const started = Boolean(loc.startedAt);
                  const ended = Boolean(loc.endedAt || loc.checkedAt);
                  const startBusy = busyKey === `start-${loc.id}`;
                  const endBusy = busyKey === `end-${loc.id}`;
                  const hasStartGps =
                    loc.startedLatitude != null && loc.startedLongitude != null;
                  const hasEndGps =
                    (loc.endedLatitude ?? loc.latitude) != null &&
                    (loc.endedLongitude ?? loc.longitude) != null;

                  if (!approved) {
                    return (
                      <li
                        key={loc.id}
                        className="rounded-lg border border-dashed border-zinc-300 px-2.5 py-2 dark:border-zinc-700"
                      >
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          <MapPin className="size-3.5 text-orange-600" aria-hidden />
                          {loc.label}
                        </p>
                        <p className="mt-0.5 text-[11px] text-zinc-500">
                          Start/End GPS capture, remarks, and images unlock after approval.
                        </p>
                      </li>
                    );
                  }

                  return (
                    <li
                      key={loc.id}
                      className={cn(
                        "space-y-2 rounded-lg border px-2.5 py-2",
                        visitStatus === "completed"
                          ? "border-emerald-400/50 bg-emerald-500/5 dark:border-emerald-700/50"
                          : visitStatus === "in_progress"
                            ? "border-orange-400/50 bg-orange-500/5 dark:border-orange-700/40"
                            : "border-zinc-300 dark:border-zinc-700",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          {loc.label}
                        </p>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                            visitStatus === "completed"
                              ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
                              : visitStatus === "in_progress"
                                ? "bg-orange-500/15 text-orange-800 dark:text-orange-200"
                                : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
                          )}
                        >
                          {statusLabel}
                        </span>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1.5 rounded-lg border border-zinc-200 bg-white/70 p-2 dark:border-zinc-700 dark:bg-zinc-950/40">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                              Start
                            </p>
                            <button
                              type="button"
                              disabled={!canCheckIn || started || startBusy || ended}
                              onClick={() => void captureVisit(order, loc, "start")}
                              className="inline-flex items-center gap-1 rounded-lg bg-orange-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-45"
                            >
                              {startBusy ? (
                                <Loader2 className="size-3 animate-spin" aria-hidden />
                              ) : null}
                              Start
                            </button>
                          </div>
                          {started ? (
                            <div className="space-y-1">
                              <p className="text-[11px] tabular-nums text-zinc-600 dark:text-zinc-400">
                                {loc.startedAt ? formatCheckedAt(loc.startedAt) : "Started"}
                              </p>
                              {hasStartGps ? (
                                <button
                                  type="button"
                                  onClick={() => openGpsPin(loc, "start")}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-700 hover:underline dark:text-orange-300"
                                >
                                  <MapPin className="size-3" aria-hidden />
                                  {loc.startedLatitude!.toFixed(5)}, {loc.startedLongitude!.toFixed(5)}
                                </button>
                              ) : null}
                            </div>
                          ) : (
                            <p className="text-[11px] text-zinc-500">
                              Captures GPS + time when you arrive.
                            </p>
                          )}
                        </div>

                        <div className="space-y-1.5 rounded-lg border border-zinc-200 bg-white/70 p-2 dark:border-zinc-700 dark:bg-zinc-950/40">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                              End
                            </p>
                            <button
                              type="button"
                              disabled={!canCheckIn || !started || ended || endBusy}
                              onClick={() => void captureVisit(order, loc, "end")}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-45 dark:text-emerald-200"
                            >
                              {endBusy ? (
                                <Loader2 className="size-3 animate-spin" aria-hidden />
                              ) : null}
                              End
                            </button>
                          </div>
                          {ended ? (
                            <div className="space-y-1">
                              <p className="text-[11px] tabular-nums text-zinc-600 dark:text-zinc-400">
                                {formatCheckedAt(loc.endedAt ?? loc.checkedAt)}
                              </p>
                              {hasEndGps ? (
                                <button
                                  type="button"
                                  onClick={() => openGpsPin(loc, "end")}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
                                >
                                  <MapPin className="size-3" aria-hidden />
                                  {(loc.endedLatitude ?? loc.latitude)!.toFixed(5)},{" "}
                                  {(loc.endedLongitude ?? loc.longitude)!.toFixed(5)}
                                </button>
                              ) : null}
                            </div>
                          ) : (
                            <p className="text-[11px] text-zinc-500">
                              {started
                                ? "Captures GPS + time when you finish."
                                : "Available after Start."}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="block text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                          Remarks
                          <textarea
                            rows={2}
                            defaultValue={loc.remarks ?? ""}
                            disabled={!canCheckIn}
                            onChange={(e) => scheduleRemarksSave(order.id, loc.id, e.target.value)}
                            placeholder="Notes for this location…"
                            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-normal normal-case tracking-normal text-zinc-900 placeholder:text-zinc-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                          />
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                          <label
                            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 ${
                              !canCheckIn ||
                              loc.attachments.length >= MAX_LOCATION_IMAGES ||
                              busyKey === `img-${loc.id}`
                                ? "pointer-events-none opacity-50"
                                : ""
                            }`}
                          >
                            {busyKey === `img-${loc.id}` ? (
                              <Loader2 className="size-3.5 animate-spin" aria-hidden />
                            ) : (
                              <ImagePlus className="size-3.5 text-orange-600" aria-hidden />
                            )}
                            Upload image
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/jpg"
                              multiple
                              className="sr-only"
                              disabled={
                                !canCheckIn ||
                                loc.attachments.length >= MAX_LOCATION_IMAGES ||
                                busyKey === `img-${loc.id}`
                              }
                              onChange={(e) => {
                                void uploadLocationImages(order, loc, e.target.files);
                                e.target.value = "";
                              }}
                            />
                          </label>
                          <span className="text-[10px] text-zinc-500">
                            {loc.attachments.length}/{MAX_LOCATION_IMAGES} · JPG/PNG
                          </span>
                        </div>
                        {loc.attachments.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {loc.attachments.map((att) => {
                              const href = `/api/kpi-maintenance/${encodeURIComponent(taskId)}/travel-orders/${encodeURIComponent(order.id)}/files/${encodeURIComponent(att.storedFileName)}`;
                              const removing = busyKey === `rm-${loc.id}-${att.storedFileName}`;
                              return (
                                <div
                                  key={att.storedFileName}
                                  className="relative overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-700"
                                >
                                  <a href={href} target="_blank" rel="noreferrer" className="block">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={href}
                                      alt={att.originalName}
                                      className="h-16 w-16 object-cover"
                                    />
                                  </a>
                                  {canCheckIn ? (
                                    <button
                                      type="button"
                                      disabled={removing}
                                      onClick={() =>
                                        void removeLocationImage(order, loc, att.storedFileName)
                                      }
                                      className="absolute right-0.5 top-0.5 inline-flex size-5 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/85 disabled:opacity-50"
                                      aria-label={`Remove ${att.originalName}`}
                                    >
                                      {removing ? (
                                        <Loader2 className="size-3 animate-spin" aria-hidden />
                                      ) : (
                                        <X className="size-3" aria-hidden />
                                      )}
                                    </button>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
                {canSubmitDone ? (
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-zinc-500">
                      KPI preview: {checkedCount}/{totalCount} completed · {liveKpiPercent}%
                      {" "}(formula: completed ÷ total × 100)
                    </p>
                    <button
                      type="button"
                      disabled={busyKey === `done-${order.id}`}
                      onClick={() => void submitAsDone(order)}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-orange-600 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busyKey === `done-${order.id}` ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      ) : null}
                      Submit as Done
                    </button>
                  </div>
                ) : kpiAlreadySubmitted ? (
                  <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                    KPI recorded: {order.kpiPercent ?? liveKpiPercent}% ({checkedCount}/{totalCount} completed)
                    {order.kpiSubmittedAt
                      ? ` · ${formatCheckedAt(order.kpiSubmittedAt)}`
                      : ""}
                  </p>
                ) : null}

                <div className="space-y-1.5 rounded-lg border border-orange-400/30 bg-orange-500/[0.05] p-2.5 dark:border-orange-500/25">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange-800 dark:text-orange-200">
                    Approval confirmation
                  </p>
                  <p className="text-xs text-zinc-700 dark:text-zinc-300">
                    {order.confirmationByAgent?.name ?? "—"}
                    {order.confirmationByAgent?.email
                      ? ` · ${order.confirmationByAgent.email}`
                      : ""}
                  </p>
                  {confirmed ? (
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                      Confirmed
                    </p>
                  ) : rejected ? (
                    <p className="text-[11px] text-rose-700 dark:text-rose-300">
                      Declined — confirmation closed
                    </p>
                  ) : cancelled ? (
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                      Cancelled — confirmation closed
                    </p>
                  ) : canConfirmThis ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={
                            busyKey === `confirm-${order.id}` ||
                            busyKey === `reject-${order.id}` ||
                            declineDraft?.orderId === order.id
                          }
                          onClick={() => void confirmOrder(order)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50 dark:text-emerald-200"
                        >
                          {busyKey === `confirm-${order.id}` ? (
                            <Loader2 className="size-3.5 animate-spin" aria-hidden />
                          ) : null}
                          Confirm travel order
                        </button>
                        <button
                          type="button"
                          disabled={
                            busyKey === `confirm-${order.id}` || busyKey === `reject-${order.id}`
                          }
                          onClick={() =>
                            setDeclineDraft({ orderId: order.id, asConfirmer: true, reason: "" })
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/50 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:text-rose-200"
                        >
                          Do not confirm
                        </button>
                      </div>
                      {declineDraft?.orderId === order.id && declineDraft.asConfirmer ? (
                        <div className="space-y-2 rounded-lg border border-rose-500/40 bg-rose-500/5 p-2.5">
                          <label className="block space-y-1">
                            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-rose-800 dark:text-rose-300">
                              Why are you declining confirmation?
                            </span>
                            <textarea
                              value={declineDraft.reason}
                              onChange={(e) =>
                                setDeclineDraft((prev) =>
                                  prev ? { ...prev, reason: e.target.value } : prev,
                                )
                              }
                              rows={3}
                              maxLength={2000}
                              placeholder="Explain why confirmation is declined…"
                              className="w-full rounded-lg border border-rose-400/40 bg-white px-2.5 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-rose-500 dark:border-rose-500/30 dark:bg-zinc-950 dark:text-zinc-100"
                            />
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={
                                busyKey === `reject-${order.id}` || !declineDraft.reason.trim()
                              }
                              onClick={() => void rejectOrder(order, true, declineDraft.reason)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {busyKey === `reject-${order.id}` ? (
                                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                              ) : null}
                              Submit decline
                            </button>
                            <button
                              type="button"
                              disabled={busyKey === `reject-${order.id}`}
                              onClick={() => setDeclineDraft(null)}
                              className="inline-flex items-center rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : order.confirmationByAgentId && approved ? (
                    <p className="text-[11px] text-zinc-500">
                      Waiting for confirmation
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {mapLoc ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 px-3 py-6 backdrop-blur-sm"
          onClick={() => setMapLoc(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`GPS for ${mapLoc.label}`}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-800 dark:bg-surface"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-orange-700 dark:text-orange-400">
                  {mapLoc.kind === "start" ? "Start GPS" : "End GPS"}
                </p>
                <h4 className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {mapLoc.label}
                </h4>
                {mapLoc.capturedAt ? (
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    {formatCheckedAt(mapLoc.capturedAt)}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setMapLoc(null)}
                className="rounded-full border border-zinc-300 p-1.5 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                aria-label="Close map"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <MapLocationPicker
              latitude={mapLoc.latitude}
              longitude={mapLoc.longitude}
              readOnly
              heightClassName="h-64"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
