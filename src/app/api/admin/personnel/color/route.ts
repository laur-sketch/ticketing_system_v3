import { NextResponse } from "next/server";
import { ensureAgentRowForPortalStaff } from "@/lib/admin-roster";
import { requireRole } from "@/lib/access";
import {
  canonicalProfileFromMerged,
  syncPortalProfile,
} from "@/lib/auth/sync-portal-profile";
import { MERGED_SOURCE_DATABASE } from "@/lib/merged-database-sources";
import { isPersonnelAssignmentColorKey } from "@/lib/personnel-assignment-colors";
import {
  getPortalStaffAssignmentColor,
  setPortalStaffAssignmentColor,
} from "@/lib/portal-staff-assignment-color-sql";
import { prismaPrimary, prismaSecondary } from "@/lib/prisma";
import { isStaffPortalRole } from "@/lib/staff-role";

function resolveHrisSourceTag(): string {
  return (
    process.env.HRIS_MERGE_SOURCE_TAG?.trim() ||
    process.env.HRIS_MERGE_SOURCE_DB?.trim() ||
    MERGED_SOURCE_DATABASE.HRIS_DEMO
  );
}

/**
 * PATCH /api/admin/personnel/color
 * SuperAdmin/Admin: set assignment color for an HRIS merged user.
 * Ensures a portal_accounts profile exists first (creates one if needed).
 *
 * Body: { mergedSourceUserId: string, staffAssignmentColor: string | null }
 */
export async function PATCH(req: Request) {
  const { unauthorized } = await requireRole(["Admin"]);
  if (unauthorized) return unauthorized;

  const body = (await req.json().catch(() => ({}))) as {
    mergedSourceUserId?: string;
    staffAssignmentColor?: string | null;
  };

  const mergedIdRaw = body.mergedSourceUserId?.trim() ?? "";
  if (!/^\d+$/.test(mergedIdRaw)) {
    return NextResponse.json({ error: "mergedSourceUserId is required." }, { status: 400 });
  }
  const mergedSourceUserId = BigInt(mergedIdRaw);
  const sourceTag = resolveHrisSourceTag();

  let colorNext: string | null = null;
  if (body.staffAssignmentColor != null && String(body.staffAssignmentColor).trim() !== "") {
    const key = String(body.staffAssignmentColor).trim().toUpperCase();
    if (!isPersonnelAssignmentColorKey(key)) {
      return NextResponse.json({ error: "Invalid assignment color." }, { status: 400 });
    }
    colorNext = key;
  }

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
      AND source_database = ${sourceTag}
      AND is_active = 1
    LIMIT 1
  `;
  const merged = mergedRows[0];
  if (!merged) {
    return NextResponse.json({ error: "HRIS user not found in mergedatabase." }, { status: 404 });
  }

  // Prefer an already-linked portal; otherwise create/sync from merged profile.
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
      role: merged.role,
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

  if (!portal) {
    return NextResponse.json(
      { error: "Could not create a portal profile for this HRIS user." },
      { status: 500 },
    );
  }

  // Ensure mergedSourceUserId link is set (profile sync may have matched by email).
  await prismaPrimary.portalAccount.update({
    where: { id: portal.id },
    data: { mergedSourceUserId },
  });

  // If company_name maps to a known team and portal has no designated company, attach it.
  if (!portal.staffDesignatedCompanyId && merged.company_name?.trim()) {
    const companyKey = merged.company_name.trim().toLowerCase();
    const team = await prismaPrimary.team.findFirst({
      where: { name: { equals: merged.company_name.trim(), mode: "insensitive" } },
      select: { id: true },
    });
    // loose match for HRIS names like MCHISI vs MCONPINCO is left to SuperAdmin company picker
    if (team || companyKey) {
      if (team) {
        await prismaPrimary.portalAccount.update({
          where: { id: portal.id },
          data: { staffDesignatedCompanyId: team.id },
        });
        portal = { ...portal, staffDesignatedCompanyId: team.id };
      }
    }
  }

  try {
    await setPortalStaffAssignmentColor(portal.id, colorNext);
  } catch (e) {
    console.error("setPortalStaffAssignmentColor failed", e);
    return NextResponse.json({ error: "Could not save assignment color." }, { status: 500 });
  }

  if (portal.staffDesignatedCompanyId && isStaffPortalRole(portal.role)) {
    try {
      await ensureAgentRowForPortalStaff(
        { email: portal.email, name: portal.name },
        portal.staffDesignatedCompanyId,
      );
    } catch (e) {
      console.error("ensureAgentRowForPortalStaff after color update failed", e);
    }
  }

  const saved = await getPortalStaffAssignmentColor(portal.id);
  return NextResponse.json({
    ok: true,
    mergedSourceUserId: mergedIdRaw,
    portalAccountId: portal.id,
    staffAssignmentColor: saved,
  });
}
