import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { loadPersonnelAccountsPayload } from "@/lib/personnel-accounts-data";

export async function GET() {
  const { session, unauthorized } = await requireRole(["Admin"]);
  if (unauthorized) return unauthorized;

  const payload = await loadPersonnelAccountsPayload({
    role: session.user.role,
    email: session.user.email,
  });

  return NextResponse.json({
    personnel: payload.personnel,
    teams: payload.teams,
    scopedCompanyTeamId: payload.scopedCompanyTeamId,
    scopedCompanyName: payload.scopedCompanyName,
    scopeUnavailable: payload.scopeUnavailable,
    viewerMode: payload.viewerMode,
  });
}
