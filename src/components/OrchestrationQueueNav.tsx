"use client";

import { isElevatedPlatformRole } from "@/lib/staff-role";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Tabs } from "@/components/ui/vercel-tabs";

const adminTabs = [
  { id: "assignment", label: "Assign Requests" },
  { id: "company", label: "Group Board" },
  { id: "ticket", label: "Requests" },
];

const personnelTabs = [{ id: "ticket", label: "Requests" }];

export function OrchestrationQueueNav() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data } = useSession();
  const role = data?.user?.role;
  const onOrchestration = pathname === "/agent";
  const onAssignment = pathname === "/admin/manual-assignment";

  const isAdmin = isElevatedPlatformRole(role) || role === "Admin";
  const [fetchedAllow, setFetchedAllow] = useState<boolean | null>(null);

  useEffect(() => {
    if (!role || isAdmin) return;
    if (!["Admin", "Personnel"].includes(role)) {
      queueMicrotask(() => setFetchedAllow(false));
      return;
    }
    let cancelled = false;
    void fetch("/api/me/permissions", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { canAccessAssignmentBoard: false }))
      .then((payload: { canAccessAssignmentBoard?: boolean }) => {
        if (!cancelled) setFetchedAllow(!!payload.canAccessAssignmentBoard);
      })
      .catch(() => {
        if (!cancelled) setFetchedAllow(false);
      });
    return () => {
      cancelled = true;
    };
  }, [role, isAdmin]);

  const canAccessAssignmentBoard = isAdmin || fetchedAllow === true;
  const board = searchParams.get("board") ?? "ticket";
  const onCompanyBoard = onOrchestration && board === "company";

  if (!onOrchestration && !onAssignment) return null;

  const activeTab = onAssignment ? "assignment" : onCompanyBoard ? "company" : "ticket";

  const goToTab = (tabId: string) => {
    if (tabId === "assignment") {
      router.push("/admin/manual-assignment");
      return;
    }
    if (tabId === "company") {
      router.push("/agent?board=company");
      return;
    }
    router.push("/agent?board=ticket");
  };

  if (canAccessAssignmentBoard) {
    return (
      <nav className="overflow-x-auto pb-1 sm:pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <Tabs tabs={adminTabs} activeTab={activeTab} onTabChange={goToTab} />
      </nav>
    );
  }

  if (onAssignment) return null;

  return (
    <nav className="overflow-x-auto pb-1 sm:pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      <Tabs tabs={personnelTabs} activeTab={activeTab} onTabChange={goToTab} />
    </nav>
  );
}
