"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Tabs } from "@/components/ui/vercel-tabs";

const adminTabs = [
  { id: "assignment", label: "Assignment Board" },
  { id: "company", label: "Company Board" },
  { id: "ticket", label: "Ticket Board" },
  { id: "my-requests", label: "My requests" },
];

const personnelTabs = [
  { id: "ticket", label: "Ticket Board" },
  { id: "my-requests", label: "My requests" },
];

export function OrchestrationQueueNav() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data } = useSession();
  const role = data?.user?.role;
  const onOrchestration = pathname === "/agent";
  const onAssignment = pathname === "/admin/manual-assignment";
  const onMyRequests = pathname === "/my-requests" || pathname.startsWith("/my-requests/");

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

  if (!onOrchestration && !onAssignment && !onMyRequests) return null;

  const activeTab = onMyRequests
    ? "my-requests"
    : onAssignment
      ? "assignment"
      : onCompanyBoard
        ? "company"
        : "ticket";

  const goToTab = (tabId: string) => {
    if (tabId === "assignment") {
      router.push("/admin/manual-assignment");
      return;
    }
    if (tabId === "company") {
      router.push("/agent?board=company");
      return;
    }
    if (tabId === "my-requests") {
      router.push("/my-requests");
      return;
    }
    router.push("/agent?board=ticket");
  };

  if (canAccessAssignmentBoard) {
    return (
      <nav className="overflow-x-auto pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <Tabs tabs={adminTabs} activeTab={activeTab} onTabChange={goToTab} />
      </nav>
    );
  }

  if (onAssignment) return null;

  return (
    <nav className="overflow-x-auto pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      <Tabs tabs={personnelTabs} activeTab={activeTab} onTabChange={goToTab} />
    </nav>
  );
}
