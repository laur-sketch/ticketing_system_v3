import { redirect } from "next/navigation";
import { requireSession } from "@/lib/access";
import { sortByRosterOrder, rosterTeamNameFilter } from "@/lib/company-roster";
import { loadPersonnelAccountsPayload } from "@/lib/personnel-accounts-data";
import { prisma } from "@/lib/prisma";
import { PersonnelClient } from "./ui";

export const dynamic = "force-dynamic";

export default async function PersonnelPage() {
  const session = await requireSession();
  if (!session?.user) redirect("/signin");
  if (!["SuperAdmin", "Admin"].includes(session.user.role)) redirect("/");

  const [payload, assignableTeams] = await Promise.all([
    loadPersonnelAccountsPayload({
      role: session.user.role,
      email: session.user.email,
    }),
    prisma.team.findMany({
      where: rosterTeamNameFilter(),
      select: { id: true, name: true },
    }),
  ]);

  return (
    <PersonnelClient
      initialTeams={payload.teams}
      initialPersonnel={payload.personnel}
      initialAssignableCompanies={sortByRosterOrder(assignableTeams)}
      viewerMode={payload.viewerMode}
      scopeUnavailable={payload.scopeUnavailable}
      scopedCompanyName={payload.scopedCompanyName}
    />
  );
}
