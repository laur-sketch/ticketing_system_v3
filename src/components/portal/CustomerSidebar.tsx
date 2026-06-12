"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { CUSTOMER_PORTAL_NAV_ITEMS, customerPortalNavItemActive } from "@/components/portal/customer-portal-nav";
import { useHash } from "@/components/portal/useHash";

export function CustomerSidebar() {
  const pathname = usePathname();
  const hash = useHash();

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-zinc-200 bg-white px-3 pb-4 pt-4 text-zinc-900 shadow-[10px_0_36px_rgba(0,0,0,0.05)] dark:border-zinc-800/80 dark:bg-[#0f0f0e] dark:text-zinc-100 dark:shadow-[10px_0_36px_rgba(0,0,0,0.16)] lg:flex">
      <nav className="flex flex-1 flex-col gap-1 text-sm" aria-label="Sidebar">
        {CUSTOMER_PORTAL_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = customerPortalNavItemActive(label, pathname, hash);
          return (
            <Link
              key={label + href}
              href={href}
              className={cn(
                "group flex items-center gap-2.5 rounded-lg border px-2.5 py-2 font-medium transition",
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
              {label}
            </Link>
          );
        })}
        <Link
          href="/tickets/new"
          className="mt-2 flex items-center gap-2.5 rounded-lg border border-orange-500/35 bg-orange-600 px-2.5 py-2 font-semibold text-white shadow-[0_10px_24px_rgba(234,88,12,0.22)] transition hover:bg-orange-500"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-white/15">
            <Plus className="size-3.5" />
          </span>
          New Ticket
        </Link>
      </nav>
    </aside>
  );
}
