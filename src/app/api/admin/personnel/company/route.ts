import { NextResponse } from "next/server";
import { ensureAgentRowForPortalStaff } from "@/lib/admin-roster";
import { requireRole } from "@/lib/access";
import {
  resolveHrisSourceTags,
  resolveSecondaryDatabaseName,
} from "@/lib/merged-database-sources";
import { prismaPrimary, prismaSecondary } from "@/lib/prisma";
import { withSecondaryWriteClient } from "@/lib/prisma-secondary-write";
import { isStaffPortalRole } from "@/lib/staff-role";
import { Prisma } from "@prisma/client/secondary";

/**
 * PATCH /api/admin/personnel/company
 * SuperAdmin: set company on a merged DB (HRIS) user.
 * Body: { mergedSourceUserId: string, teamId: string | null }
 */
export async function PATCH(req: Request) {
  const { unauthorized } = await requireRole(["SuperAdmin"]);
  if (unauthorized) return unauthorized;

  const body = (await req.json().catch(() => ({}))) as {
    mergedSourceUserId?: string;
    teamId?: string | null;
  };

  const mergedIdRaw = body.mergedSourceUserId?.trim() ?? "";
  if (!/^\d+$/.test(mergedIdRaw)) {
    return NextResponse.json({ error: "mergedSourceUserId is required." }, { status: 400 });
  }
  const mergedSourceUserId = BigInt(mergedIdRaw);
  const sourceTags = resolveHrisSourceTags();

  const existing = await prismaSecondary.$queryRaw<
    Array<{ source_user_id: bigint; name: string; email: string | null }>
  >`
    SELECT source_user_id, name, email
    FROM merged_users
    WHERE source_user_id = ${mergedSourceUserId}
      AND source_database IN (${Prisma.join(sourceTags)})
      AND is_active = 1
    LIMIT 1
  `;
  if (!existing[0]) {
    return NextResponse.json(
      { error: `HRIS user not found in ${resolveSecondaryDatabaseName()}.` },
      { status: 404 },
    );
  }

  let companyName: string | null = null;
  let teamId: string | null = null;

  if (body.teamId != null && String(body.teamId).trim() !== "") {
    teamId = String(body.teamId).trim();
    const team = await prismaPrimary.team.findUnique({
      where: { id: teamId },
      select: { id: true, name: true },
    });
    if (!team) {
      return NextResponse.json({ error: "Company queue not found." }, { status: 404 });
    }
    companyName = team.name;
  }

  // Keep linked portal profile + agent queue aligned when present.
  // Prefer HRIS-linked portal; fall back to email (merge may lag the link).
  const emailNeedle = existing[0].email?.trim().toLowerCase() || null;
  let portal =
    (await prismaPrimary.portalAccount.findFirst({
      where: { mergedSourceUserId, accountStatus: { not: "LEGACY_CONFLICT" } },
      select: { id: true, email: true, name: true, role: true },
    })) ??
    (await prismaPrimary.portalAccount.findFirst({
      where: { mergedSourceUserId },
      select: { id: true, email: true, name: true, role: true },
    })) ??
    (emailNeedle
      ? await prismaPrimary.portalAccount.findFirst({
          where: {
            email: { equals: emailNeedle, mode: "insensitive" },
            accountStatus: { not: "LEGACY_CONFLICT" },
          },
          select: { id: true, email: true, name: true, role: true },
        })
      : null);

  if (portal) {
    try {
      await prismaPrimary.portalAccount.updateMany({
        where: { mergedSourceUserId, NOT: { id: portal.id } },
        data: { mergedSourceUserId: null },
      });
      await prismaPrimary.portalAccount.update({
        where: { id: portal.id },
        data: {
          mergedSourceUserId,
          staffDesignatedCompanyId: teamId,
        },
      });
    } catch (e) {
      console.warn("company route: could not link mergedSourceUserId", e);
      await prismaPrimary.portalAccount.update({
        where: { id: portal.id },
        data: { staffDesignatedCompanyId: teamId },
      });
    }

    if (teamId && isStaffPortalRole(portal.role)) {
      try {
        await ensureAgentRowForPortalStaff(
          { email: portal.email, name: portal.name },
          teamId,
        );
      } catch (e) {
        console.error("ensureAgentRowForPortalStaff after company update failed", e);
      }
    }
  }

  let mergedSynced = false;
  try {
    // Writes go through DATABASE_URL_SECONDARY_SYNC (not merge_app SELECT-only).
    await withSecondaryWriteClient(async (db) => {
      await db.$executeRaw`
        UPDATE merged_users
        SET company_name = ${companyName}, updated_at = CURRENT_TIMESTAMP
        WHERE source_user_id = ${mergedSourceUserId}
      `;
    });
    mergedSynced = true;
  } catch (e) {
    console.warn(
      "merged_users company sync skipped (portal company still updated):",
      e instanceof Error ? e.message : e,
    );
    if (!portal) {
      return NextResponse.json(
        {
          error:
            "Could not update company: merge database write failed and no portal account is linked. Set DATABASE_URL_SECONDARY_SYNC to a user with UPDATE on merged_users.",
        },
        { status: 503 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    mergedSourceUserId: mergedIdRaw,
    companyName,
    teamId,
    portalAccountId: portal?.id ?? null,
    mergedSynced,
  });
}
