import { redirect } from "next/navigation";
import { requireSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { loadPersonnelAccountsPayload } from "@/lib/personnel-accounts-data";
import { SuperAdminSettingsClient } from "./ui";

export const dynamic = "force-dynamic";

export default async function SuperAdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const session = await requireSession();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "SuperAdmin") redirect("/");

  const params = await searchParams;
  const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  // Legacy ?tab=positions redirects into the org chart (Positions UI removed).
  const initialTab =
    tabParam === "orgchart" || tabParam === "positions"
      ? "orgchart"
      : tabParam === "access"
        ? "access"
        : tabParam === "faq"
          ? "faq"
          : "alerts";

  const [triggers, orgNodes, orgSections, eitherOrLinks, roster] = await Promise.all([
    prisma.escalationTrigger.findMany({ orderBy: { priority: "asc" } }),
    prisma.orgChartNode.findMany({
      include: {
        sectionMemberships: {
          select: { sectionId: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.orgChartSection.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        companyTeam: { select: { id: true, name: true } },
        headNode: {
          select: {
            id: true,
            personName: true,
            personRole: true,
            companyName: true,
          },
        },
        _count: { select: { memberships: true } },
      },
    }),
    prisma.orgChartEitherOrLink.findMany({
      orderBy: { createdAt: "asc" },
    }),
    loadPersonnelAccountsPayload({
      role: session.user.role,
      email: session.user.email,
    }),
  ]);

  return (
    <SuperAdminSettingsClient
      initialTab={initialTab}
      initialTriggers={triggers}
      initialOrgNodes={orgNodes}
      initialOrgSections={orgSections.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        sortOrder: s.sortOrder,
        parentId: s.parentId,
        companyTeamId: s.companyTeamId,
        companyName: s.companyTeam?.name ?? null,
        headNodeId: s.headNodeId,
        headName: s.headNode?.personName ?? null,
        headRole: s.headNode?.personRole ?? null,
        headCompanyName: s.headNode?.companyName ?? null,
        memberCount: s._count.memberships,
      }))}
      initialEitherOrLinks={eitherOrLinks.map((l) => ({
        id: l.id,
        nodeAId: l.nodeAId,
        nodeBId: l.nodeBId,
      }))}
      roster={roster.personnel}
    />
  );
}
