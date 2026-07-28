import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { resolveOpsPermissions } from "@/lib/ops-permissions";
import { prisma } from "@/lib/prisma";
import { isTravelOrderRunning } from "@/lib/travel-order";
import { findTravelOrderById, serializeTravelOrder } from "@/lib/travel-order-db";
import { finalizeFieldAssignmentKpiFromTravelOrder } from "@/lib/travel-order-kpi-finalize";

/**
 * POST /api/kpi-maintenance/:id/travel-orders/:travelOrderId/submit-done
 * Records Field Assignment KPI = (checked / total) * 100 and marks the task complete.
 */
export async function POST(
  _req: Request,
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

  const canAccess =
    perms.canAssignWork || kpi.assignedAgentId === perms.operator?.id;
  if (!canAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const order = await findTravelOrderById(travelOrderId);
  if (!order || order.kpiMaintenanceId !== id) {
    return NextResponse.json({ error: "Travel order not found." }, { status: 404 });
  }
  if (!isTravelOrderRunning(order.status)) {
    return NextResponse.json(
      { error: "Submit as Done is only available while the travel order is running (approved)." },
      { status: 400 },
    );
  }
  if (order.kpiSubmittedAt) {
    return NextResponse.json(
      { error: "KPI was already submitted for this travel order." },
      { status: 409 },
    );
  }

  try {
    const result = await finalizeFieldAssignmentKpiFromTravelOrder(order);
    if (!result) {
      return NextResponse.json(
        { error: "This travel order has no locations or the task was not found." },
        { status: 400 },
      );
    }

    const updatedKpi = await prisma.kpiMaintenance.findUnique({ where: { id } });

    return NextResponse.json({
      travelOrder: serializeTravelOrder(result.updatedOrder),
      kpi: updatedKpi,
      kpiPercent: result.kpiPercent,
      checked: result.checked,
      total: result.total,
    });
  } catch (err) {
    console.error("[travel-orders] submit-done failed:", err);
    return NextResponse.json({ error: "Could not submit travel order as done." }, { status: 500 });
  }
}
