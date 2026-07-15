"use client";

import { OnDutyPanel } from "@/components/dashboard/OnDutyPanel";
import { BRAND_TITLE } from "@/lib/brand";
import type { OnDutyAgentSnapshot } from "@/lib/load-on-duty-snapshot";

type Props = {
  initialOnDutyAgents: OnDutyAgentSnapshot[];
  initialOnDutyPage: number;
  onDutyTotalPages: number;
  onDutyTotal: number;
  onDutyActiveCount: number;
  initialOnDutyCompanies: string[];
  onDutyPageSize: number;
};

export function ActivitiesClient({
  initialOnDutyAgents,
  initialOnDutyPage,
  onDutyTotalPages,
  onDutyTotal,
  onDutyActiveCount,
  initialOnDutyCompanies,
  onDutyPageSize,
}: Props) {
  return (
    <main className="min-h-[calc(100vh-56px)] bg-zinc-50 px-3 py-4 text-zinc-900 dark:bg-[#0a0b12] dark:text-zinc-100 sm:px-4 md:py-5">
      <div className="mx-auto max-w-[min(100%,1920px)] space-y-4">
        <header className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800/90 dark:bg-[#12161c] md:p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-400/95">
            {BRAND_TITLE} · Admin console
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-white md:text-3xl">Activities</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Merge-database personnel with live On Duty / Offline status from today&apos;s HRIS
            clock-ins. Updates every 10 seconds.
          </p>
        </header>

        <OnDutyPanel
          variant="cards"
          showCompanyFilter
          pageSize={onDutyPageSize}
          initialAgents={initialOnDutyAgents}
          initialPage={initialOnDutyPage}
          totalPages={onDutyTotalPages}
          initialTotal={onDutyTotal}
          initialOnDutyCount={onDutyActiveCount}
          initialCompanies={initialOnDutyCompanies}
        />
      </div>
    </main>
  );
}
