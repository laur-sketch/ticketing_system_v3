import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { listOrgChartSectionOptions } from "@/lib/org-chart-section-roster";

/** Read-only org-chart sections for ticket intake dropdowns. */
export async function GET() {
  const { session, unauthorized } = await requireRole(["Admin", "Personnel", "SuperAdmin"]);
  if (unauthorized || !session) return unauthorized;

  const sections = await listOrgChartSectionOptions();
  return NextResponse.json({ sections });
}
