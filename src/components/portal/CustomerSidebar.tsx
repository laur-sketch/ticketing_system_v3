"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { CUSTOMER_PORTAL_NAV_ITEMS, customerPortalNavItemActive } from "@/components/portal/customer-portal-nav";
import { useHash } from "@/components/portal/useHash";

type CustomerSidebarProps = {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
};

export function CustomerSidebar({ collapsed, onCollapsedChange }: CustomerSidebarProps) {
  const pathname = usePathname();
  const hash = useHash();

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r border-zinc-200 bg-white px-3 pb-4 pt-3 text-zinc-900 shadow-[10px_0_36px_rgba(0,0,0,0.05)] transition-[width] duration-200 dark:border-zinc-800/80 dark:bg-[#0f0f0e] dark:text-zinc-100 dark:shadow-[10px_0_36px_rgba(0,0,0,0.16)] lg:flex",
        collapsed ? "w-16" : "w-56",
      )}
    >
      <div className={cn("mb-2 flex", collapsed ? "justify-center" : "justify-end")}>
        <button
          type="button"
          onClick={() => onCollapsedChange(!collapsed)}
          className="inline-flex size-8 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-500 transition hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:bg-[#181716] dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-100"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
        </button>
      </div>
      <nav className="flex flex-1 flex-col gap-1 text-sm" aria-label="Sidebar">
        {CUSTOMER_PORTAL_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = customerPortalNavItemActive(label, pathname, hash);
          return (
            <Link
              key={label + href}
              href={href}
              title={collapsed ? label : undefined}
              aria-label={collapsed ? label : undefined}
              className={cn(
                "group flex items-center rounded-lg border py-2 font-medium transition",
                collapsed ? "justify-center px-0" : "gap-2.5 px-2.5",
                active
                  ? "border-orange-500/30 bg-orange-500/10 text-orange-900 shadow-[inset_2px_0_0_rgba(249,115,22,0.9)] dark:border-orange-500/25 dark:bg-orange-500/[0.08] dark:text-zinc-50"
                  : "border-transparent text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/[0.04] dark:hover:text-zinc-100",
              )}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-md transition",
                  active
                    ? "bg-orange-500/15 text-orange-700 dark:bg-orange-500/12 dark:text-orange-300"
                    : "text-zinc-500 group-hover:bg-zinc-200 group-hover:text-zinc-800 dark:group-hover:bg-zinc-900 dark:group-hover:text-zinc-300",
                )}
              >
                <Icon className="size-3.5" />
              </span>
              <span className={cn("truncate", collapsed && "sr-only")}>{label}</span>
            </Link>
          );
        })}
        <Link
          href="/tickets/new"
          title={collapsed ? "New Ticket" : undefined}
          aria-label={collapsed ? "New Ticket" : undefined}
          className={cn(
            "mt-2 flex items-center rounded-lg border border-orange-500/35 bg-orange-600 py-2 font-semibold text-white shadow-[0_10px_24px_rgba(234,88,12,0.22)] transition hover:bg-orange-500",
            collapsed ? "justify-center px-0" : "gap-2.5 px-2.5",
          )}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-white/15">
            <Plus className="size-3.5" />
          </span>
          <span className={cn("truncate", collapsed && "sr-only")}>New Ticket</span>
        </Link>
      </nav>
    </aside>
  );
}
