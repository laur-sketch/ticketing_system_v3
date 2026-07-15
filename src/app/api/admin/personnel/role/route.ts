import { NextResponse } from "next/server";
import { ensureAgentRowForPortalStaff } from "@/lib/admin-roster";
import { requireRole } from "@/lib/access";
import { mapPortalRoleToMergedHrisRole } from "@/lib/auth/portal-to-merged-role";
import {
  canonicalProfileFromMerged,
  syncPortalProfile,
} from "@/lib/auth/sync-portal-profile";
import { MERGED_SOURCE_DATABASE } from "@/lib/merged-database-sources";
import { setPortalStaffAssignmentColor } from "@/lib/portal-staff-assignment-color-sql";
import { prismaPrimary, prismaSecondary } from "@/lib/prisma";
import {
  isPlatformSuperAdminPortalRole,
  isStaffPortalRole,
  normalizePortalRole,
  PORTAL_ROLES,
  type PortalRole,
} from "@/lib/staff-role";

function resolveHrisSourceTag(): string {
  return (
    process.env.HRIS_MERGE_SOURCE_TAG?.trim() ||
    process.env.HRIS_MERGE_SOURCE_DB?.trim() ||
    MERGED_SOURCE_DATABASE.HRIS_DEMO
  );
}

const MANAGEABLE = new Set<string>(PORTAL_ROLES);

/**
 * PATCH /api/admin/personnel/role
 * SuperAdmin: set portal role on an HRIS merged user (updates merged_users + portal).
 * Body: { mergedSourceUserId: string, role: PortalRole }
 */
export async function PATCH(req: Request) {
  const { unauthorized } = await requireRole(["SuperAdmin"]);
  if (unauthorized) return unauthorized;

  const body = (await req.json().catch(() => ({}))) as {
    mergedSourceUserId?: string;
    role?: string;
  };

  const mergedIdRaw = body.mergedSourceUserId?.trim() ?? "";
  if (!/^\d+$/.test(mergedIdRaw)) {
    return NextResponse.json({ error: "mergedSourceUserId is required." }, { status: 400 });
  }

  const roleRaw = body.role?.trim() ?? "";
  const portalRole = normalizePortalRole(roleRaw);
  if (!portalRole || !MANAGEABLE.has(portalRole)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  const mergedSourceUserId = BigInt(mergedIdRaw);
  const sourceTag = resolveHrisSourceTag();
  const mergedHrisRole = mapPortalRoleToMergedHrisRole(portalRole);

  const mergedRows = await prismaSecondary.$queryRaw<
    Array<{
      source_user_id: bigint;
      name: string;
      username: string | null;
      email: string | null;
      role: string;
      company_name: string | null;
      position: string | null;
      department: string | null;
    }>
  >`
    SELECT source_user_id, name, username, email, role, company_name, position, department
    FROM merged_users
    WHERE source_user_id = ${mergedSourceUserId}
      AND (source_database = ${sourceTag} OR source_user_id >= 9000000000)
      AND is_active = 1
    LIMIT 1
  `;
  const merged = mergedRows[0];
  if (!merged) {
    return NextResponse.json({ error: "HRIS user not found in mergedatabase." }, { status: 404 });
  }

  await prismaSecondary.$executeRaw`
    UPDATE merged_users
    SET role = ${mergedHrisRole}, updated_at = CURRENT_TIMESTAMP
    WHERE source_user_id = ${mergedSourceUserId}
  `;

  let portal = await prismaPrimary.portalAccount.findFirst({
    where: { mergedSourceUserId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      staffDesignatedCompanyId: true,
    },
  });

  if (!portal) {
    const profile = canonicalProfileFromMerged({
      sourceUserId: merged.source_user_id,
      username: merged.username,
      name: merged.name,
      email: merged.email,
      role: mergedHrisRole,
      companyName: merged.company_name,
      position: merged.position,
      department: merged.department,
    });
    await syncPortalProfile(profile, "hris", { forceRoleRefresh: true });
    portal = await prismaPrimary.portalAccount.findFirst({
      where: {
        OR: [
          { mergedSourceUserId },
          ...(merged.email
            ? [{ email: { equals: merged.email.trim().toLowerCase(), mode: "insensitive" as const } }]
            : []),
        ],
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        staffDesignatedCompanyId: true,
      },
    });
  }

  if (portal) {
    const wasSuper = isPlatformSuperAdminPortalRole(portal.role);
    // Always apply the SuperAdmin-chosen portal role (HRIS mapping alone treats
    // merged "admin" as Personnel unless the job title says head/leader).
    await prismaPrimary.portalAccount.update({
      where: { id: portal.id },
      data: {
        role: portalRole,
        headPrivileges: portalRole === "Admin",
        ...(portalRole === "SuperAdmin"
          ? { staffDesignatedCompany: { disconnect: true } }
          : {}),
        ...(portalRole !== "Customer"
          ? { company: { disconnect: true }, customerOrgRole: null }
          : {}),
      },
    });

    if (wasSuper || portalRole === "SuperAdmin") {
      try {
        await setPortalStaffAssignmentColor(portal.id, null);
      } catch (e) {
        console.error("setPortalStaffAssignmentColor after role change failed", e);
      }
    }

    if (portal.staffDesignatedCompanyId && isStaffPortalRole(portalRole)) {
      try {
        await ensureAgentRowForPortalStaff(
          { email: portal.email, name: portal.name },
          portal.staffDesignatedCompanyId,
        );
      } catch (e) {
        console.error("ensureAgentRowForPortalStaff after role update failed", e);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    mergedSourceUserId: mergedIdRaw,
    role: portalRole as PortalRole,
    mergedRole: mergedHrisRole,
    portalAccountId: portal?.id ?? null,
  });
}
