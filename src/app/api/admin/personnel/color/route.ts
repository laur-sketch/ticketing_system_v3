import { NextResponse } from "next/server";
import { ensureAgentRowForPortalStaff } from "@/lib/admin-roster";
import { requireRole } from "@/lib/access";
import {
  canonicalProfileFromMerged,
  syncPortalProfile,
} from "@/lib/auth/sync-portal-profile";
import {
  resolveHrisSourceTags,
  resolveSecondaryDatabaseName,
} from "@/lib/merged-database-sources";
import { isPersonnelAssignmentColorKey } from "@/lib/personnel-assignment-colors";
import {
  buildCanonicalMergedIdMap,
  canonicalMergedId,
  type MergedIdentityRow,
} from "@/lib/sync/merged-person-identity";
import {
  getPortalStaffAssignmentColor,
  setPortalStaffAssignmentColor,
} from "@/lib/portal-staff-assignment-color-sql";
import { prismaPrimary, prismaSecondary } from "@/lib/prisma";
import { isStaffPortalRole } from "@/lib/staff-role";
import { Prisma } from "@prisma/client/secondary";

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
  const sourceTags = resolveHrisSourceTags();

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
      AND source_database IN (${Prisma.join(sourceTags)})
      AND is_active = 1
    LIMIT 1
  `;
  const merged = mergedRows[0];
  if (!merged) {
    return NextResponse.json(
      { error: `HRIS user not found in ${resolveSecondaryDatabaseName()}.` },
      { status: 404 },
    );
  }

  // Prefer an already-linked ACTIVE portal; fall back to a LEGACY_CONFLICT one
  // (users whose duplicate accounts were merged only have conflict portals left).
  const portalSelect = {
    id: true,
    email: true,
    name: true,
    role: true,
    staffDesignatedCompanyId: true,
  } as const;
  let portal =
    (await prismaPrimary.portalAccount.findFirst({
      where: { mergedSourceUserId, accountStatus: { not: "LEGACY_CONFLICT" } },
      select: portalSelect,
    })) ??
    (await prismaPrimary.portalAccount.findFirst({
      where: { mergedSourceUserId },
      select: portalSelect,
    }));

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
    try {
      await syncPortalProfile(profile, "hris", { forceRoleRefresh: true });
    } catch (e) {
      console.error("syncPortalProfile (color route) failed", e);
      return NextResponse.json(
        { error: "Could not create a portal profile for this HRIS user." },
        { status: 500 },
      );
    }

    portal = await prismaPrimary.portalAccount.findFirst({
      where: {
        OR: [
          { mergedSourceUserId },
          ...(merged.email
            ? [{ email: { equals: merged.email.trim().toLowerCase(), mode: "insensitive" as const } }]
            : []),
        ],
      },
      select: portalSelect,
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

  /**
   * Propagate the color to every other portal row of the same person (duplicate
   * legacy portals link to synthetic merged ids >= 9e9). Agent/ticket views
   * resolve colors by portal email, so all of the person's rows must agree.
   */
  try {
    const identityRows = await prismaSecondary.$queryRaw<
      Array<{ source_user_id: bigint; name: string; email: string | null }>
    >`
      SELECT source_user_id, name, email
      FROM merged_users
      WHERE is_active = 1
    `;
    const canonicalMap = buildCanonicalMergedIdMap(
      identityRows.map(
        (r): MergedIdentityRow => ({
          sourceUserId: r.source_user_id,
          name: r.name,
          email: r.email,
        }),
      ),
    );
    const personIds = identityRows
      .map((r) => r.source_user_id)
      .filter((id) => canonicalMergedId(id, canonicalMap) === mergedSourceUserId);
    const siblingPortals = await prismaPrimary.portalAccount.findMany({
      where: { mergedSourceUserId: { in: personIds }, id: { not: portal.id } },
      select: { id: true },
    });
    for (const sibling of siblingPortals) {
      await setPortalStaffAssignmentColor(sibling.id, colorNext);
    }
  } catch (e) {
    console.error("assignment color propagation to sibling portals failed", e);
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
