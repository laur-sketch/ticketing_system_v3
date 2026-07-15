import { NextResponse } from "next/server";
import { ensureAgentRowForPortalStaff } from "@/lib/admin-roster";
import { requireRole } from "@/lib/access";
import { MERGED_SOURCE_DATABASE } from "@/lib/merged-database-sources";
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
 * PATCH /api/admin/personnel/company
 * SuperAdmin: set company on a mergedatabase (HRIS) user.
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
  const sourceTag = resolveHrisSourceTag();

  const existing = await prismaSecondary.$queryRaw<
    Array<{ source_user_id: bigint; name: string; email: string | null }>
  >`
    SELECT source_user_id, name, email
    FROM merged_users
    WHERE source_user_id = ${mergedSourceUserId}
      AND source_database = ${sourceTag}
      AND is_active = 1
    LIMIT 1
  `;
  if (!existing[0]) {
    return NextResponse.json({ error: "HRIS user not found in mergedatabase." }, { status: 404 });
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

  await prismaSecondary.$executeRaw`
    UPDATE merged_users
    SET company_name = ${companyName}, updated_at = CURRENT_TIMESTAMP
    WHERE source_user_id = ${mergedSourceUserId}
  `;

  // Keep linked portal profile + agent queue aligned when present.
  const portal = await prismaPrimary.portalAccount.findFirst({
    where: { mergedSourceUserId },
    select: { id: true, email: true, name: true, role: true },
  });

  if (portal) {
    await prismaPrimary.portalAccount.update({
      where: { id: portal.id },
      data: { staffDesignatedCompanyId: teamId },
    });

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

  return NextResponse.json({
    ok: true,
    mergedSourceUserId: mergedIdRaw,
    companyName,
    teamId,
    portalAccountId: portal?.id ?? null,
  });
}
