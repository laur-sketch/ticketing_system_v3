import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { isElevatedUserRole } from "@/lib/auth";
import { resolveOpsPermissions } from "@/lib/ops-permissions";
import { resolveAgentDesignatedCompanyId } from "@/lib/staff-company-scope";
import { isPersonnelGuardPortalRole } from "@/lib/staff-role";
import {
  findTravelOrdersVisibleToAgent,
  serializeTravelOrder,
} from "@/lib/travel-order-db";

/**
 * GET /api/travel-orders
 * Lists travel orders for the caller's company, plus any where they are an
 * assigned traveler, designated approver, or confirmer (cross-company OK).
 * Personnel-Guard sees all APPROVED (running) trips for Gate Pass capture.
 */
export async function GET() {
  const { session, unauthorized } = await requireRole([
    "Admin",
    "Personnel",
    "Personnel-Guard",
  ]);
  if (unauthorized || !session) return unauthorized;
  const perms = await resolveOpsPermissions(session);
  const gatePassOnly = isPersonnelGuardPortalRole(session.user.role);

  const operatorId = perms.operator?.id ?? null;
  // SuperAdmin / HighAdmin have no agent row and no company scope — give them the
  // full platform list instead of an empty one.
  const allVisible = !operatorId && isElevatedUserRole(session.user.role);
  if (!operatorId && !allVisible) {
    return NextResponse.json({ travelOrders: [], companyTeamId: null });
  }

  const companyTeamId = gatePassOnly
    ? null
    : await resolveAgentDesignatedCompanyId(operatorId ?? "");
  const rows = await findTravelOrdersVisibleToAgent({
    companyTeamId,
    agentId: operatorId,
    gatePassOnly,
    allVisible,
  });
  return NextResponse.json(
    {
      companyTeamId,
      travelOrders: rows.map(serializeTravelOrder),
    },
    {
      headers: {
        // Role-scoped payload — never let browsers/SW reuse another role's list.
        "Cache-Control": "private, no-store",
      },
    },
  );
}
