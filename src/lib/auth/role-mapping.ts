import type { PortalRole } from "@/lib/staff-role";
import { normalizePortalRole } from "@/lib/staff-role";

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
  { hrisRole: "admin", portalRole: "Admin", headPrivileges: true },
  { hrisRole: "employee", portalRole: "Personnel", headPrivileges: false },
];

function normalizeHrisToken(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Detect department/position head titles (e.g. "IT Support Head", "Operations Head"). */
export function isHrisHeadTitle(input: Pick<HrisRoleMappingInput, "position" | "department" | "hrisRole">): boolean {
  const tokens = [
    normalizeHrisToken(input.position),
    normalizeHrisToken(input.department),
    normalizeHrisToken(input.hrisRole),
  ].filter(Boolean);

  return tokens.some(
    (t) => t === "head" || t.endsWith(" head") || t.includes(" head ") || t.startsWith("head "),
  );
}

/**
 * Map HRIS role (+ optional position) to portal role and headPrivileges.
 * Head titles elevate non-admin staff to Admin with headPrivileges.
 */
export function mapHrisToPortalRole(
  input: HrisRoleMappingInput,
  overrides?: Partial<MappedPortalRole> | null,
): MappedPortalRole {
  if (overrides?.portalRole) {
    return {
      portalRole: overrides.portalRole,
      headPrivileges: overrides.headPrivileges ?? overrides.portalRole === "Admin",
    };
  }

  const roleKey = normalizeHrisToken(input.hrisRole);
  const preset = DEFAULT_HRIS_ROLE_MAPPINGS.find((m) => m.hrisRole === roleKey);

  if (preset) {
    if (preset.portalRole === "Personnel" && isHrisHeadTitle(input)) {
      return { portalRole: "Admin", headPrivileges: true };
    }
    return { portalRole: preset.portalRole, headPrivileges: preset.headPrivileges };
  }

  const normalized = normalizePortalRole(input.hrisRole);
  if (normalized) {
    return {
      portalRole: normalized,
      headPrivileges: normalized === "Admin" || isHrisHeadTitle(input),
    };
  }

  if (isHrisHeadTitle(input)) {
    return { portalRole: "Admin", headPrivileges: true };
  }

  return { portalRole: "Personnel", headPrivileges: false };
}
