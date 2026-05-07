"use client";

import { signOut, useSession } from "next-auth/react";
import { CustomerSidebar } from "./CustomerSidebar";
import { CustomerTopNav } from "./CustomerTopNav";
import { RealtimeRefreshBeacon } from "@/components/RealtimeRefreshBeacon";

export function CustomerPortalShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const role = session?.user?.role;
  const provider = session?.user?.authProvider;
  const mustUseGoogle =
    status === "authenticated" && role === "Customer" && provider !== "google";

  if (status === "loading") {
    return (
      <div className="flex min-h-dvh flex-1 items-center justify-center bg-zinc-50 text-zinc-600 dark:bg-[#070d19] dark:text-zinc-400">
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  if (mustUseGoogle) {
    return (
      <div className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 px-4 text-center dark:bg-[#070d19]">
        <p className="max-w-md text-sm text-zinc-700 dark:text-zinc-300">
          The customer dashboard is available when you sign in with Google. Sign out and use Google sign-in to continue.
        </p>
        <button
          type="button"
          onClick={() => void signOut({ callbackUrl: "/signin" })}
          className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-500"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-h-dvh flex-1 flex-col bg-zinc-50 text-zinc-900 dark:bg-[#070d19] dark:text-zinc-100">
      <RealtimeRefreshBeacon />
      <CustomerTopNav />
      <div className="flex min-h-0 flex-1">
        <CustomerSidebar />
        <div className="min-w-0 flex-1 overflow-x-hidden">{children}</div>
      </div>
    </div>
  );
}
