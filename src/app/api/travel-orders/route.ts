import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { resolveOpsPermissions } from "@/lib/ops-permissions";
import { resolveAgentDesignatedCompanyId } from "@/lib/staff-company-scope";
import {
  findTravelOrdersByCompanyTeamId,
  serializeTravelOrder,
} from "@/lib/travel-order-db";

/**
 * GET /api/travel-orders
 * Lists travel orders visible to the caller's company.
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
  if (!companyTeamId) {
    return NextResponse.json({ travelOrders: [], companyTeamId: null });
  }

  const rows = await findTravelOrdersByCompanyTeamId(companyTeamId);
  return NextResponse.json({
    companyTeamId,
    travelOrders: rows.map(serializeTravelOrder),
  });
}
