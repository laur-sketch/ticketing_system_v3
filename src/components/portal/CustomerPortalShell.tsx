"use client";

import { useSession } from "next-auth/react";
import { CustomerSidebar } from "./CustomerSidebar";
import { CustomerTopNav } from "./CustomerTopNav";
import { RealtimeRefreshBeacon } from "@/components/RealtimeRefreshBeacon";

export function CustomerPortalShell({ children }: { children: React.ReactNode }) {
  const { status } = useSession();

  if (status === "loading") {
    return (
      <div className="flex min-h-dvh flex-1 items-center justify-center bg-zinc-50 text-zinc-600 dark:bg-[#0e0e0d] dark:text-zinc-400">
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-h-dvh flex-1 flex-col bg-zinc-50 text-zinc-900 dark:bg-[#0e0e0d] dark:text-zinc-100">
      <RealtimeRefreshBeacon />
      <CustomerTopNav />
      <div className="flex min-h-0 flex-1">
        <CustomerSidebar />
        <div className="min-w-0 flex-1 overflow-x-hidden bg-zinc-50 dark:bg-[#0e0e0d]">{children}</div>
      </div>
    </div>
  );
}
