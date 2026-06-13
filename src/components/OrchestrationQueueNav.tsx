"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Tabs } from "@/components/ui/vercel-tabs";

const adminTabs = [
  { id: "assignment", label: "Assignment Board" },
  { id: "company", label: "Company Board" },
  { id: "ticket", label: "Ticket Board" },
  { id: "kpi", label: "Task Board" },
];

const personnelTabs = [
  { id: "ticket", label: "Ticket Board" },
  { id: "kpi", label: "Task Board" },
];

export function OrchestrationQueueNav() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data } = useSession();
  const role = data?.user?.role;
  const onOrchestration = pathname === "/agent";
  const onAssignment = pathname === "/admin/manual-assignment";

  const isAdmin = role === "SuperAdmin" || role === "Admin";
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
  const onKpiBoard = onOrchestration && board === "kpi";

  if (!onOrchestration && !onAssignment) return null;

  const activeTab = onAssignment ? "assignment" : onCompanyBoard ? "company" : onKpiBoard ? "kpi" : "ticket";
  const goToTab = (tabId: string) => {
    if (tabId === "assignment") {
      router.push("/admin/manual-assignment");
      return;
    }
    if (tabId === "company") {
      router.push("/agent?board=company");
      return;
    }
    if (tabId === "kpi") {
      router.push("/agent?board=kpi");
      return;
    }
    router.push("/agent?board=ticket");
  };

  if (canAccessAssignmentBoard) {
    return (
      <nav className="-mx-1 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        <Tabs tabs={adminTabs} activeTab={activeTab} onTabChange={goToTab} />
      </nav>
    );
  }

  if (onAssignment) return null;

  /** Personnel see only Ticket Board + Task Board; Company Board is admin-only. */
  return (
    <nav className="-mx-1 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      <Tabs tabs={personnelTabs} activeTab={activeTab} onTabChange={goToTab} />
    </nav>
  );
}
