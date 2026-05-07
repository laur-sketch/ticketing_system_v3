import { NextResponse } from "next/server";
import { COMPANY_ROSTER, rosterTeamNameFilter, sortByRosterOrder } from "@/lib/company-roster";
import { prisma } from "@/lib/prisma";

/** Public list of company queues (for customer signup). */
export async function GET() {
  for (const name of COMPANY_ROSTER) {
    const existing = await prisma.team.findFirst({
      where: { name },
      select: { id: true },
    });
    if (!existing) {
      await prisma.team.create({ data: { name } });
    }
  }
  const teams = await prisma.team.findMany({
    where: rosterTeamNameFilter(),
    select: { id: true, name: true },
  });
  return NextResponse.json(sortByRosterOrder(teams));
}
