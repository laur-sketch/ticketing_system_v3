import { redirect } from "next/navigation";
import { requireSession } from "@/lib/access";
import { loadOnDutySnapshot } from "@/lib/load-on-duty-snapshot";
import { ActivitiesClient } from "./ui";

export const dynamic = "force-dynamic";

const ON_DUTY_PAGE_SIZE = 18;

export default async function ActivitiesPage() {
  const session = await requireSession();
  if (!session?.user) redirect("/signin");
  if (!["SuperAdmin", "Admin"].includes(session.user.role)) redirect("/");

  const onDuty = await loadOnDutySnapshot({ page: 1, pageSize: ON_DUTY_PAGE_SIZE });

  return (
    <ActivitiesClient
      initialOnDutyAgents={onDuty.agents}
      initialOnDutyPage={onDuty.page}
      onDutyTotalPages={onDuty.totalPages}
      onDutyTotal={onDuty.total}
      initialOnDutyCompanies={onDuty.companies}
      onDutyPageSize={ON_DUTY_PAGE_SIZE}
    />
  );
}
