import { redirect } from "next/navigation";
import { isElevatedUserRole } from "@/lib/auth";
import { requireSession } from "@/lib/access";
import { findSessionAgentWithTeam } from "@/lib/session-agent";
import { resolveOpsPermissions } from "@/lib/ops-permissions";
import { isPersonnelGuardPortalRole } from "@/lib/staff-role";
import { TravelOrdersQuickAccess } from "@/components/task-board/TravelOrdersQuickAccess";

export const dynamic = "force-dynamic";

export default async function TravelOrdersPage() {
  const session = await requireSession();
  if (!session?.user) {
    redirect("/signin?callbackUrl=/travel-orders");
  }
  const role = session.user.role;
  const personnelGuard = isPersonnelGuardPortalRole(role);
  if (!(isElevatedUserRole(role) || role === "Admin" || role === "Personnel" || personnelGuard)) {
    redirect("/");
  }

  const [operator, perms] = await Promise.all([
    findSessionAgentWithTeam({ email: session.user.email, name: session.user.name }),
    resolveOpsPermissions(session),
  ]);

  return (
    <TravelOrdersQuickAccess
      operatorAgentId={operator?.id ?? null}
      canAssignWork={Boolean(perms.canAssignWork)}
      personnelGuard={personnelGuard}
    />
  );
}
