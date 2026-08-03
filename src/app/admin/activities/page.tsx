import { redirect } from "next/navigation";
import { requireSession } from "@/lib/access";
import { loadOnDutySnapshot } from "@/lib/load-on-duty-snapshot";
import { resolveAdminOnDutyCompanyFilter } from "@/lib/staff-company-scope";
import { ActivitiesClient } from "./ui";

export const dynamic = "force-dynamic";

const ON_DUTY_PAGE_SIZE = 18;

export default async function ActivitiesPage() {
  const session = await requireSession();
  if (!session?.user) redirect("/signin");
  if (!["SuperAdmin", "Admin"].includes(session.user.role)) redirect("/");

  const lockedCompanyFilter = await resolveAdminOnDutyCompanyFilter(
    session.user.role,
    session.user.email,
  );

  const onDuty = await loadOnDutySnapshot({
    page: 1,
    pageSize: ON_DUTY_PAGE_SIZE,
    ...(lockedCompanyFilter ? { companyFilter: lockedCompanyFilter } : {}),
  });

  return (
    <ActivitiesClient
      initialOnDutyAgents={onDuty.agents}
      initialOnDutyPage={onDuty.page}
      onDutyTotalPages={onDuty.totalPages}
      onDutyTotal={onDuty.total}
      onDutyActiveCount={onDuty.onDutyCount}
      initialOnDutyCompanies={
        lockedCompanyFilter && lockedCompanyFilter !== "__none__"
          ? [lockedCompanyFilter]
          : onDuty.companies
      }
      onDutyPageSize={ON_DUTY_PAGE_SIZE}
      lockedCompanyFilter={lockedCompanyFilter}
      scopeLabel={
        lockedCompanyFilter && lockedCompanyFilter !== "__none__"
          ? lockedCompanyFilter
          : lockedCompanyFilter === "__none__"
            ? "No assigned company"
            : null
      }
    />
  );
}
