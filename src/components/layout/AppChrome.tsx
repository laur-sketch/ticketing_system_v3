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

  if (
    pathname === "/signin" ||
    pathname === "/signup" ||
    pathname === "/customer/signin" ||
    pathname === "/customer/signup"
  ) {
    return <>{children}</>;
  }

  if (status === "unauthenticated" && pathname === "/") {
    return (
      <div className="min-h-screen flex-1 bg-background text-foreground">{children}</div>
    );
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-4 bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <div
          className="h-11 w-11 animate-spin rounded-full border-2 border-brand/30 border-t-brand"
          aria-hidden
        />
        <div className="max-w-sm text-center">
          <p className="text-sm font-medium text-foreground">Loading workspace</p>
          <p className="mt-1 text-xs text-muted">Preparing navigation and your session…</p>
        </div>
      </div>
    );
  }

  if (role === "Customer") {
    return <CustomerPortalShell>{children}</CustomerPortalShell>;
  }

  return (
    <div className="flex min-h-screen flex-1 bg-background text-foreground">
      <RealtimeRefreshBeacon />
      <GlobalSidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
        <Nav />
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
          {children}
        </div>
      </div>
    </div>
  );
}
