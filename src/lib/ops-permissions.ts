import { findSessionAgentWithTeam } from "@/lib/session-agent";
import { portalCompanyAdminPrivilegesForEmail } from "@/lib/portal-staff";
import { isElevatedPlatformRole } from "@/lib/staff-role";

export async function resolveOpsPermissions(session: {
  user: { role: string; email?: string | null; name?: string | null };
}) {
  const role = session.user.role;
  const isAdminRole = isElevatedPlatformRole(role) || role === "Admin";
  const operator = await findSessionAgentWithTeam({
    email: session.user.email,
    name: session.user.name,
  });
  const isCompanyAdminRole = await portalCompanyAdminPrivilegesForEmail(session.user.email);
  const canAssignWork = isAdminRole || isCompanyAdminRole;
  return {
    operator,
    isAdminRole,
    /** Company-level coordinator (portal Admin tier; replaces legacy Head). */
    isCompanyAdminRole,
    /** @deprecated use isCompanyAdminRole */
    isHeadRole: isCompanyAdminRole,
    canAssignWork,
  };
}
