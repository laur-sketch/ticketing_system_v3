/**
 * Portal account roles stored on PortalAccount.role:
 * SuperAdmin (full platform access; assignable only by a signed-in SuperAdmin in Personnel registry),
 * Admin (company-scoped coordinator), Personnel, Customer.
 * Legacy "Head" strings in the DB are normalized to Admin on read.
 */

export const PORTAL_ROLES = ["SuperAdmin", "Admin", "Personnel", "Customer"] as const;
export type PortalRole = (typeof PORTAL_ROLES)[number];

const LEGACY_PERSONNEL = new Set(
  [
    "personnel",
    "agent",
    "it support",
    "it-support",
    "itsupport",
    "admin", // legacy stored portal label; distinct from role Admin when normalized with other cues
  ].map((s) => s.toLowerCase()),
);

const LEGACY_HEAD = new Set(
  [
    "head",
    "operations head",
    "finance head",
    "hr head",
    "it support head",
  ].map((s) => s.toLowerCase()),
);

/** Self-service signup: Personnel or Customer; Admin is assigned by SuperAdmin in Portal Accounts. */
export const SIGNUP_PORTAL_ROLES = ["Customer", "Personnel"] as const;

/** Staff-facing roster / assignment tooling. */
export const STAFF_PORTAL_ROLES = ["Admin", "Personnel"] as const;

/** @deprecated use STAFF_PORTAL_ROLES */
export const STAFF_ROLE_OPTIONS = STAFF_PORTAL_ROLES;

/**
 * Maps stored portal role to SuperAdmin | Admin | Personnel | Customer. Returns null if unknown.
 */
export function normalizePortalRole(role: string | null | undefined): PortalRole | null {
  const raw = (role ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "superadmin" || raw === "super_admin" || raw === "super-admin") return "SuperAdmin";
  if (raw === "admin") return "Admin";
  if (raw === "personnel") return "Personnel";
  if (raw === "customer") return "Customer";
  if (LEGACY_HEAD.has(raw) || raw.endsWith(" head")) return "Admin";
  if (LEGACY_PERSONNEL.has(raw)) return "Personnel";
  return null;
}

/** @deprecated use normalizePortalRole */
export function normalizeStaffRoleLabel(role: string | null | undefined): string | null {
  return normalizePortalRole(role);
}

export function isStaffPortalRole(role: string | null | undefined): boolean {
  const n = normalizePortalRole(role);
  return n === "Admin" || n === "Personnel";
}

/** Stored portal role grants JWT SuperAdmin; not a company-queue staff tier. */
export function isPlatformSuperAdminPortalRole(role: string | null | undefined): boolean {
  return normalizePortalRole(role) === "SuperAdmin";
}

/** Company coordinator tier (assignment board, KPI assignment within company scope). */
export function isAdminPortalRole(role: string | null | undefined): boolean {
  return normalizePortalRole(role) === "Admin";
}

/** @deprecated use isAdminPortalRole */
export function isHeadPortalRole(role: string | null | undefined): boolean {
  return isAdminPortalRole(role);
}

/** Only Admin staff may hold company coordination privileges (replaces Head tier). */
export function isAdminEligibleStaffRole(role: string | null | undefined): boolean {
  return isAdminPortalRole(role);
}

/** @deprecated use isAdminEligibleStaffRole */
export function isHeadEligibleStaffRole(role: string | null | undefined): boolean {
  return isAdminEligibleStaffRole(role);
}
