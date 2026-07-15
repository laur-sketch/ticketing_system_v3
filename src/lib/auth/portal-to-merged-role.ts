import { normalizePortalRole, type PortalRole } from "@/lib/staff-role";

/** Map ticketing portal role → merged_users.role (HRIS-style enum string). */
export function mapPortalRoleToMergedHrisRole(
  portalRole: string | null | undefined,
  headPrivileges = false,
): string {
  const role = normalizePortalRole(portalRole ?? "") ?? "Customer";
  if (role === "SuperAdmin") return "super_admin";
  if (role === "Admin" || headPrivileges) return "admin";
  if (role === "Personnel") return "employee";
  return "employee";
}

/** Map merged_users.role → portal role for display (inverse; head/leader still from position). */
export function mapMergedHrisRoleToPortalRole(hrisRole: string): PortalRole {
  const key = (hrisRole ?? "").trim().toLowerCase();
  if (key === "super_admin") return "SuperAdmin";
  if (key === "admin") return "Admin";
  return "Personnel";
}
