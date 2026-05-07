"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { BookOpen, Home, LifeBuoy, Settings, Ticket } from "lucide-react";
import { cn } from "@/lib/cn";
import { BrandLockup } from "@/components/BrandLockup";

const items: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/my-tickets", label: "Active Tickets", icon: Ticket },
  { href: "/tickets/knowledge", label: "Knowledge Base", icon: BookOpen },
  { href: "/tickets/knowledge#settings", label: "Settings", icon: Settings },
];

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function useHash() {
  return useSyncExternalStore(
    subscribeHash,
    () => window.location.hash,
    () => "",
  );
}

export function CustomerSidebar() {
  const pathname = usePathname();
  const hash = useHash();

  return (
    <aside className="hidden w-72 shrink-0 flex-col border-r border-zinc-200 bg-white px-4 py-5 dark:border-zinc-800 dark:bg-[#0b1220] lg:flex">
      <div className="mb-6 min-w-0 px-0.5">
        <BrandLockup variant="customer-sidebar" href="/" />
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 text-sm" aria-label="Sidebar">
        {items.map(({ href, label, icon: Icon }) => {
          let active = false;
          if (label === "Dashboard") active = pathname === "/";
          else if (label === "Active Tickets")
            active = pathname === "/my-tickets" || pathname.startsWith("/my-tickets/");
          else if (label === "Knowledge Base")
            active = pathname === "/tickets/knowledge" && hash !== "#settings";
          else if (label === "Settings")
            active = pathname === "/tickets/knowledge" && hash === "#settings";
          return (
            <Link
              key={label + href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2.5 font-medium transition",
                active
                  ? "bg-orange-500/15 text-orange-800 dark:bg-orange-500/20 dark:text-orange-200"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
              )}
            >
              <Icon className="size-4 shrink-0 opacity-80" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 pr-2">
        <a
          href="mailto:support@example.com"
          className="flex w-full items-center justify-center gap-1.5 py-2 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
        >
          <LifeBuoy className="size-3.5" />
          Need help?
        </a>
      </div>
    </aside>
  );
}
