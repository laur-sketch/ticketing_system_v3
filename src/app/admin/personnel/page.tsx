import { redirect } from "next/navigation";
import { requireSession } from "@/lib/access";
import { loadPersonnelAccountsPayload } from "@/lib/personnel-accounts-data";
import { PersonnelClient } from "./ui";

export const dynamic = "force-dynamic";

export default async function PersonnelPage() {
  const session = await requireSession();
  if (!session?.user) redirect("/signin");
  if (!["SuperAdmin", "Admin"].includes(session.user.role)) redirect("/");

  const payload = await loadPersonnelAccountsPayload({
    role: session.user.role,
    email: session.user.email,
  });

  return (
    <PersonnelClient
      initialTeams={payload.teams}
      initialPersonnel={payload.personnel}
      viewerMode={payload.viewerMode}
      scopeUnavailable={payload.scopeUnavailable}
      scopedCompanyName={payload.scopedCompanyName}
    />
  );
}
