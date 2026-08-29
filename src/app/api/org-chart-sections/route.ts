import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { listOrgChartSectionOptions } from "@/lib/org-chart-section-roster";

/** Read-only org-chart sections for ticket intake + Insights department filter. */
export async function GET() {
  const { session, unauthorized } = await requireRole([
    "Admin",
    "Personnel",
    "SuperAdmin",
    "HighAdmin",
  ]);
  if (unauthorized || !session) return unauthorized;

  const [sections, memberships, primaryNodes] = await Promise.all([
    listOrgChartSectionOptions(),
    prisma.orgChartNodeSectionMembership.findMany({
      select: {
        sectionId: true,
        node: { select: { mergedSourceUserId: true } },
      },
    }),
    prisma.orgChartNode.findMany({
      where: { sectionId: { not: null } },
      select: { sectionId: true, mergedSourceUserId: true },
    }),
  ]);

  const membersBySection: Record<string, string[]> = {};
  const addMember = (sectionId: string | null | undefined, mergedSourceUserId: string) => {
    const sid = (sectionId ?? "").trim();
    const mid = mergedSourceUserId.trim();
    if (!sid || !mid) return;
    const list = membersBySection[sid] ?? (membersBySection[sid] = []);
    if (!list.includes(mid)) list.push(mid);
  };
  for (const row of memberships) {
    addMember(row.sectionId, row.node.mergedSourceUserId);
  }
  for (const node of primaryNodes) {
    addMember(node.sectionId, node.mergedSourceUserId);
  }

  return NextResponse.json({ sections, membersBySection });
}
