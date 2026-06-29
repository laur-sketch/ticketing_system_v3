import { PORTAL_ROLES, normalizePortalRole } from "@/lib/staff-role";

export const ALL_SBUS_VALUE = "__ALL_SBUS__";
export const NO_COMPANY_FILTER = "__NO_COMPANY__";
export const PORTAL_REGISTRY_PAGE_SIZE = 10;

export type PortalAccountRow = {
  id: string;
  username: string | null;
  passwordHash: string;
  email: string;
  name: string;
  role: string;
  headPrivileges?: boolean;
  accountStatus?: string;
  staffDesignatedCompanyId?: string | null;
  staffDesignatedCompany?: { id: string; name: string } | null;
  staffAssignmentColor?: string | null;
  createdAt: string;
  agentId: string | null;
  onPersonnelRoster: boolean;
};

export type RosterCompany = { id: string; name: string };

export function portalRegistryRoleLabel(role: (typeof PORTAL_ROLES)[number]) {
  if (role === "SuperAdmin") return "Super Admin (platform)";
  return role;
}

export function accountStatusClass(statusRaw: string | undefined) {
  const status = (statusRaw ?? "ACTIVE").toUpperCase();
  if (status === "SUSPENDED") return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (status === "DELETED") return "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300";
  return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
}

export function matchesRegistryRoleFilter(role: string, filter: string): boolean {
  if (!filter) return true;
  return (normalizePortalRole(role) ?? role) === filter;
}

export function matchesRegistryCompanyFilter(companyId: string | null | undefined, filter: string): boolean {
  if (!filter) return true;
  if (filter === NO_COMPANY_FILTER) return !companyId;
  return companyId === filter;
}
