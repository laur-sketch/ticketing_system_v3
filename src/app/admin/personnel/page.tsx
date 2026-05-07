import { portalStaffHasAgentRow } from "@/lib/admin-roster";
import { prisma } from "@/lib/prisma";
import { isStaffPortalRole } from "@/lib/staff-role";
import { PersonnelClient } from "./ui";

export const dynamic = "force-dynamic";

export default async function PersonnelPage() {
  const [agents, teams, portalPersonnelRaw] = await Promise.all([
    prisma.agent.findMany({
      include: { team: true },
      orderBy: { name: "asc" },
    }),
    prisma.team.findMany({ orderBy: { name: "asc" } }),
    prisma.portalAccount.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        passwordHash: true,
        accountStatus: true,
        role: true,
        staffDesignatedCompanyId: true,
        staffDesignatedCompany: { select: { id: true, name: true } },
      },
    }),
  ]);
  const portalPersonnel = portalPersonnelRaw.filter((p) => isStaffPortalRole(p.role));
  const pendingPersonnel = portalPersonnel.filter((p) => !portalStaffHasAgentRow(p, agents));

  return <PersonnelClient initialTeams={teams} initialPending={pendingPersonnel} />;
}
