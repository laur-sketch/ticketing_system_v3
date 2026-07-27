import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { rosterTeamNameFilter, sortByRosterOrder } from "@/lib/company-roster";
import { prisma } from "@/lib/prisma";
import { resolveStaffCompanyTeamId } from "@/lib/staff-company-scope";

/** Lightweight company list for Request / Task metrics filters (avoids heavy tracker queries). */
export async function GET() {
  const { session, unauthorized } = await requireRole(["SuperAdmin", "Admin"]);
  if (unauthorized) return unauthorized;

  const teams = sortByRosterOrder(
    await prisma.team.findMany({
      where: rosterTeamNameFilter(),
      select: { id: true, name: true },
    }),
  );

  if (session.user.role === "Admin") {
    const scopedCompanyId = await resolveStaffCompanyTeamId(session.user.email);
    return NextResponse.json({
      companies: scopedCompanyId ? teams.filter((t) => t.id === scopedCompanyId) : [],
    });
  }

  return NextResponse.json({ companies: teams });
}
