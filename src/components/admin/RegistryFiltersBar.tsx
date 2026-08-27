"use client";

import { authInputClass, authLabelClass } from "@/components/auth/AuthShell";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { NO_COMPANY_FILTER, portalRegistryRoleLabel, type RosterCompany } from "@/lib/portal-account-registry";
import { PORTAL_ROLES } from "@/lib/staff-role";

const registryFilterSelectClass = cn(authInputClass, "min-w-[10rem] py-1.5 text-xs sm:min-w-[11rem]");

type Props = {
  showCompanyFilter?: boolean;
  /** Hide the built-in search input when a parent-level search bar is used instead. */
  hideSearch?: boolean;
  /** Hide the role dropdown when the parent search bar's Filter chips drive it. */
  hideRoleFilter?: boolean;
  /** Hide the company dropdown when the parent search bar's Filter chips drive it. */
  hideCompanyFilter?: boolean;
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
  hideSearch = false,
  hideRoleFilter = false,
  hideCompanyFilter = false,
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
      {hideRoleFilter ? null : (
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
      )}
      {showCompanyFilter && !hideCompanyFilter ? (
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
      {hideSearch ? null : (
        <label className="flex min-w-[12rem] flex-1 items-center gap-2 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-600 shadow-sm sm:max-w-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
          <Search className="size-4 shrink-0 opacity-60" aria-hidden />
          <input
            type="search"
            value={registrySearchQuery}
            onChange={(e) => onRegistrySearchQueryChange(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full min-w-0 bg-transparent text-zinc-900 outline-none placeholder:text-zinc-500 dark:text-zinc-200"
            autoComplete="off"
          />
        </label>
      )}
      <p className="w-full text-[11px] text-zinc-500 dark:text-zinc-500 sm:ml-auto sm:w-auto sm:text-right">
        {registryFiltersActive
          ? `Showing ${filteredCount} of ${totalCount} user${totalCount === 1 ? "" : "s"}`
          : `${totalCount} user${totalCount === 1 ? "" : "s"}`}
      </p>
    </div>
  );
}
