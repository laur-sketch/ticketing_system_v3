import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { resolveOpsPermissions } from "@/lib/ops-permissions";
import { prisma } from "@/lib/prisma";
import {
  TRAVEL_ORDER_STATUS,
  canApproveTravelOrderNow,
  canCancelTravelOrderNow,
  canConfirmTravelOrderNow,
  getOperatorActionableApprovalLevel,
  hasHierarchicalApprovals,
} from "@/lib/travel-order";
import {
  approveTravelOrderSequential,
  findTravelOrderById,
  serializeTravelOrder,
  updateTravelOrderStatus,
} from "@/lib/travel-order-db";

/**
 * PATCH /api/kpi-maintenance/:id/travel-orders/:travelOrderId
 * Approve (flat or sequential level) / confirm / reject / update status.
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; travelOrderId: string }> },
) {
  const { session, unauthorized } = await requireRole(["Admin", "Personnel"]);
  if (unauthorized || !session) return unauthorized;
  const perms = await resolveOpsPermissions(session);
  const { id, travelOrderId } = await ctx.params;

  const kpi = await prisma.kpiMaintenance.findUnique({
    where: { id },
    select: { id: true, assignedAgentId: true },
  });
  if (!kpi) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  const order = await findTravelOrderById(travelOrderId);
  if (!order || order.kpiMaintenanceId !== id) {
    return NextResponse.json({ error: "Travel order not found." }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    status?: string;
    action?: string;
    rejectionReason?: string;
  };
  const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
  const statusRaw = typeof body.status === "string" ? body.status.trim().toUpperCase() : "";
  const operatorId = perms.operator?.id ?? null;
  const canAssignWork = Boolean(perms.canAssignWork);

  // Sequential / flat approve via action or APPROVED status.
  if (action === "approve-level" || statusRaw === TRAVEL_ORDER_STATUS.APPROVED) {
    try {
      const updated = await approveTravelOrderSequential({
        travelOrderId,
        kpiMaintenanceId: id,
        operatorAgentId: operatorId,
        canAssignWork,
      });
      return NextResponse.json({ travelOrder: serializeTravelOrder(updated) });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not approve travel order.";
      const status =
        message.includes("Only") || message.includes("designated") || message.includes("approver")
          ? 403
          : message.includes("not found")
            ? 404
            : 400;
      return NextResponse.json({ error: message }, { status });
    }
  }

  if (action === "reject" || statusRaw === TRAVEL_ORDER_STATUS.REJECTED) {
    const canRejectAsApprover = canApproveTravelOrderNow(operatorId, order, { canAssignWork });
    const canRejectAsConfirmer = canConfirmTravelOrderNow(operatorId, order, { canAssignWork });
    if (!canRejectAsApprover && !canRejectAsConfirmer) {
      return NextResponse.json(
        {
          error:
            "Only the current assigned approver or confirmer (or an admin) can decline this travel order.",
        },
        { status: 403 },
      );
    }
    const rejectionReason =
      typeof body.rejectionReason === "string" ? body.rejectionReason.trim() : "";
    if (!rejectionReason) {
      return NextResponse.json(
        { error: "Please provide a reason for declining this travel order." },
        { status: 400 },
      );
    }
    if (rejectionReason.length > 2000) {
      return NextResponse.json(
        { error: "Decline reason must be 2000 characters or fewer." },
        { status: 400 },
      );
    }
    try {
      const rejectedAtLevel = canRejectAsApprover
        ? hasHierarchicalApprovals(order.approvalLevels ?? [])
          ? (getOperatorActionableApprovalLevel(order.approvalLevels ?? [], operatorId, {
              canAssignWork,
            })?.level ?? null)
          : null
        : null;
      const updated = await updateTravelOrderStatus({
        travelOrderId,
        kpiMaintenanceId: id,
        status: TRAVEL_ORDER_STATUS.REJECTED,
        rejectionReason,
        rejectedByAgentId: operatorId,
        rejectedAtLevel,
      });
      if (!updated) {
        return NextResponse.json({ error: "Travel order could not be updated." }, { status: 500 });
      }
      return NextResponse.json({ travelOrder: serializeTravelOrder(updated) });
    } catch (err) {
      console.error("[travel-orders] reject failed:", err);
      return NextResponse.json({ error: "Could not decline travel order." }, { status: 500 });
    }
  }

  if (action === "cancel" || statusRaw === TRAVEL_ORDER_STATUS.CANCELLED) {
    if (!canCancelTravelOrderNow(operatorId, order)) {
      return NextResponse.json(
        {
          error:
            "Only the person who created this travel order can cancel it, and only before it is confirmed.",
        },
        { status: 403 },
      );
    }
    try {
      const updated = await updateTravelOrderStatus({
        travelOrderId,
        kpiMaintenanceId: id,
        status: TRAVEL_ORDER_STATUS.CANCELLED,
      });
      if (!updated) {
        return NextResponse.json({ error: "Travel order could not be updated." }, { status: 500 });
      }
      return NextResponse.json({ travelOrder: serializeTravelOrder(updated) });
    } catch (err) {
      console.error("[travel-orders] cancel failed:", err);
      return NextResponse.json({ error: "Could not cancel travel order." }, { status: 500 });
    }
  }

  if (!statusRaw) {
    return NextResponse.json({ error: "Provide status." }, { status: 400 });
  }

  if (
    statusRaw !== TRAVEL_ORDER_STATUS.CONFIRMED &&
    statusRaw !== TRAVEL_ORDER_STATUS.SUBMITTED
  ) {
    return NextResponse.json({ error: "Invalid travel order status." }, { status: 400 });
  }

  try {
    if (statusRaw === TRAVEL_ORDER_STATUS.CONFIRMED) {
      if (!canConfirmTravelOrderNow(operatorId, order, { canAssignWork })) {
        if (order.status !== TRAVEL_ORDER_STATUS.APPROVED) {
          return NextResponse.json(
            { error: "Only a running (approved) travel order can be confirmed." },
            { status: 400 },
          );
        }
        if (!order.confirmationByAgentId) {
          return NextResponse.json(
            { error: "This travel order has no confirmation person assigned." },
            { status: 400 },
          );
        }
        return NextResponse.json(
          { error: "Only the designated confirmer (or an admin) can confirm this travel order." },
          { status: 403 },
        );
      }
    }

    const updated = await updateTravelOrderStatus({
      travelOrderId,
      kpiMaintenanceId: id,
      status: statusRaw,
    });
    if (!updated) {
      return NextResponse.json({ error: "Travel order could not be updated." }, { status: 500 });
    }
    return NextResponse.json({ travelOrder: serializeTravelOrder(updated) });
  } catch (err) {
    console.error("[travel-orders] update failed:", err);
    return NextResponse.json({ error: "Could not update travel order." }, { status: 500 });
  }
}
