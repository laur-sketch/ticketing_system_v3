"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { GlobalSidebar } from "@/components/GlobalSidebar";
import { Nav } from "@/components/Nav";
import { RealtimeRefreshBeacon } from "@/components/RealtimeRefreshBeacon";
import { CustomerPortalShell } from "@/components/portal/CustomerPortalShell";

type Props = { children: React.ReactNode };

export function AppChrome({ children }: Props) {
  const pathname = usePathname();
  const { data, status } = useSession();
  const role = data?.user?.role;

  if (pathname === "/signin" || pathname === "/signup" || pathname === "/customer/signup") {
    return <>{children}</>;
  }

  if (status === "unauthenticated" && pathname === "/") {
    return (
      <div className="min-h-screen flex-1 bg-zinc-50 dark:bg-[#070d19]">{children}</div>
    );
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-4 bg-zinc-950 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <div
          className="h-11 w-11 animate-spin rounded-full border-2 border-orange-500/30 border-t-orange-500"
          aria-hidden
        />
        <div className="max-w-sm text-center">
          <p className="text-sm font-medium text-zinc-200">Loading workspace</p>
          <p className="mt-1 text-xs text-zinc-500">Preparing navigation and your session…</p>
        </div>
      </div>
    );
  }

  if (role === "Customer") {
    return <CustomerPortalShell>{children}</CustomerPortalShell>;
  }

  return (
    <div className="flex min-h-screen flex-1 bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <RealtimeRefreshBeacon />
      <GlobalSidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Nav />
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}
