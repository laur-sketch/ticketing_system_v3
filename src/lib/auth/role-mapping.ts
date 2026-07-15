import type { PortalRole } from "@/lib/staff-role";

export type HrisRoleMappingInput = {
  hrisRole: string;
  position?: string | null;
  department?: string | null;
};

export type MappedPortalRole = {
  portalRole: PortalRole;
  headPrivileges: boolean;
};

/** Default HRIS → portal mappings when auth_role_mappings row is absent. */
export const DEFAULT_HRIS_ROLE_MAPPINGS: ReadonlyArray<{
  hrisRole: string;
  portalRole: PortalRole;
  headPrivileges: boolean;
}> = [
  { hrisRole: "super_admin", portalRole: "SuperAdmin", headPrivileges: false },
  // Staff roles resolve by head title; presets default to Personnel until elevated.
  { hrisRole: "admin", portalRole: "Personnel", headPrivileges: false },
  { hrisRole: "employee", portalRole: "Personnel", headPrivileges: false },
];

function normalizeHrisToken(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

const ADMIN_TITLE_PATTERN = /\b(head|leader)\b/;

/** Detect head/leader titles in position or department (e.g. "Team Head", "Unit Team Leader"). */
export function isHrisHeadTitle(input: Pick<HrisRoleMappingInput, "position" | "department" | "hrisRole">): boolean {
  const tokens = [
    normalizeHrisToken(input.position),
    normalizeHrisToken(input.department),
    normalizeHrisToken(input.hrisRole),
  ].filter(Boolean);

  return tokens.some((t) => ADMIN_TITLE_PATTERN.test(t));
}

function mapHeadOrPersonnel(input: HrisRoleMappingInput): MappedPortalRole {
  if (isHrisHeadTitle(input)) {
    return { portalRole: "Admin", headPrivileges: true };
  }
  return { portalRole: "Personnel", headPrivileges: false };
}

/**
 * Map HRIS profile to portal role.
 * - super_admin → SuperAdmin
 * - Head/leader titles (position/department) → Admin
 * - Everyone else → Personnel
 */
export function mapHrisToPortalRole(
  input: HrisRoleMappingInput,
  overrides?: Partial<MappedPortalRole> | null,
): MappedPortalRole {
  const roleKey = normalizeHrisToken(input.hrisRole);

  if (roleKey === "super_admin") {
    return { portalRole: "SuperAdmin", headPrivileges: false };
  }

  if (overrides?.portalRole) {
    const base: MappedPortalRole = {
      portalRole: overrides.portalRole,
      headPrivileges: overrides.headPrivileges ?? overrides.portalRole === "Admin",
    };
    if (base.portalRole === "Personnel" && isHrisHeadTitle(input)) {
      return { portalRole: "Admin", headPrivileges: true };
    }
    return base;
  }

  return mapHeadOrPersonnel(input);
}
