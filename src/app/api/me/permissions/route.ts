import { NextResponse } from "next/server";
import { requireSession } from "@/lib/access";
import { findSessionAgentWithTeam } from "@/lib/session-agent";
import { portalCompanyAdminPrivilegesForEmail } from "@/lib/portal-staff";

export async function GET() {
  const session = await requireSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;
  const operator = await findSessionAgentWithTeam({ email: session.user.email, name: session.user.name });
  const coord = await portalCompanyAdminPrivilegesForEmail(session.user.email);

  const canAccessAssignmentBoard =
    role === "SuperAdmin" || role === "Admin" || coord;

  return NextResponse.json({
    canAccessAssignmentBoard,
    operatorAgentId: operator?.id ?? null,
  });
}
