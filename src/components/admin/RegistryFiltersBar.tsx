"use client";

import { authInputClass, authLabelClass } from "@/components/auth/AuthShell";
import { cn } from "@/lib/cn";
import { NO_COMPANY_FILTER, portalRegistryRoleLabel, type RosterCompany } from "@/lib/portal-account-registry";
import { PORTAL_ROLES } from "@/lib/staff-role";

const registryFilterSelectClass = cn(authInputClass, "min-w-[10rem] py-1.5 text-xs sm:min-w-[11rem]");
const registrySearchInputClass = cn(authInputClass, "min-w-[12rem] py-1.5 text-xs sm:min-w-[14rem]");

type Props = {
  showCompanyFilter?: boolean;
  totalCount: number;
  filteredCount: number;
  registryRoleFilter: string;
  onRegistryRoleFilterChange: (value: string) => void;
  registryCompanyFilter: string;
  onRegistryCompanyFilterChange: (value: string) => void;
  registrySearchQuery: string;
  onRegistrySearchQueryChange: (value: string) => void;
  rosterCompanies: RosterCompany[];
  registryFiltersActive: boolean;
};

export function RegistryFiltersBar({
  showCompanyFilter = true,
  totalCount,
  filteredCount,
  registryRoleFilter,
  onRegistryRoleFilterChange,
  registryCompanyFilter,
  onRegistryCompanyFilterChange,
  registrySearchQuery,
  onRegistrySearchQueryChange,
  rosterCompanies,
  registryFiltersActive,
}: Props) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-3 dark:border-zinc-800/90 dark:bg-zinc-900/40 sm:flex-row sm:flex-wrap sm:items-end">
      <label className="flex min-w-[10rem] flex-col gap-1">
        <span className={authLabelClass}>Filter by role</span>
        <select
          value={registryRoleFilter}
          onChange={(e) => onRegistryRoleFilterChange(e.target.value)}
          className={registryFilterSelectClass}
        >
          <option value="">All roles</option>
          {PORTAL_ROLES.map((r) => (
            <option key={r} value={r}>
              {portalRegistryRoleLabel(r)}
            </option>
          ))}
        </select>
      </label>
      {showCompanyFilter ? (
        <label className="flex min-w-[10rem] flex-col gap-1">
          <span className={authLabelClass}>Filter by company</span>
          <select
            value={registryCompanyFilter}
            onChange={(e) => onRegistryCompanyFilterChange(e.target.value)}
            disabled={rosterCompanies.length === 0 && !registryCompanyFilter}
            className={registryFilterSelectClass}
          >
            <option value="">All companies</option>
            <option value={NO_COMPANY_FILTER}>No company assigned</option>
            {rosterCompanies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="flex min-w-[12rem] flex-1 flex-col gap-1 sm:max-w-xs">
        <span className={authLabelClass}>Search by name or email</span>
        <input
          type="search"
          value={registrySearchQuery}
          onChange={(e) => onRegistrySearchQueryChange(e.target.value)}
          placeholder="Name or email…"
          className={registrySearchInputClass}
          autoComplete="off"
        />
      </label>
      <p className="w-full text-[11px] text-zinc-500 dark:text-zinc-500 sm:ml-auto sm:w-auto sm:text-right">
        {registryFiltersActive
          ? `Showing ${filteredCount} of ${totalCount} user${totalCount === 1 ? "" : "s"}`
          : `${totalCount} user${totalCount === 1 ? "" : "s"}`}
      </p>
    </div>
  );
}
