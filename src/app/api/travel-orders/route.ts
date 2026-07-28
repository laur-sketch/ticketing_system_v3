import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { resolveOpsPermissions } from "@/lib/ops-permissions";
import { resolveAgentDesignatedCompanyId } from "@/lib/staff-company-scope";
import {
  findTravelOrdersVisibleToAgent,
  serializeTravelOrder,
} from "@/lib/travel-order-db";

/**
 * GET /api/travel-orders
 * Lists travel orders for the caller's company, plus any where they are an
 * assigned traveler (including cross-company co-travelers).
 */
export async function GET() {
  const { session, unauthorized } = await requireRole(["Admin", "Personnel"]);
  if (unauthorized || !session) return unauthorized;
  const perms = await resolveOpsPermissions(session);

  const operatorId = perms.operator?.id ?? null;
  if (!operatorId) {
    return NextResponse.json({ travelOrders: [], companyTeamId: null });
  }

  const companyTeamId = await resolveAgentDesignatedCompanyId(operatorId);
  const rows = await findTravelOrdersVisibleToAgent({
    companyTeamId,
    agentId: operatorId,
  });
  return NextResponse.json({
    companyTeamId,
    travelOrders: rows.map(serializeTravelOrder),
  });
}
