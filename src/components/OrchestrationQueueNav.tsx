"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

const pillActive =
  "rounded-full border border-orange-400/50 bg-orange-500/15 px-3 py-1 text-orange-900 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-200";
const pillInactive =
  "rounded-full border border-zinc-300 bg-white px-3 py-1 text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-200";

export function OrchestrationQueueNav() {
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
  const onTicketBoard = onOrchestration && (board === "ticket" || !searchParams.get("board"));
  const onKpiBoard = onOrchestration && board === "kpi";

  if (!onOrchestration && !onAssignment) return null;

  if (canAccessAssignmentBoard) {
    return (
      <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 text-xs font-medium text-zinc-600 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 dark:text-zinc-500">
        {onAssignment ? (
          <span className={pillActive}>Assignment Board</span>
        ) : (
          <Link href="/admin/manual-assignment" className={pillInactive}>
            Assignment Board
          </Link>
        )}
        {onCompanyBoard ? (
          <span className={pillActive}>Company Board</span>
        ) : (
          <Link href="/agent?board=company" className={pillInactive}>
            Company Board
          </Link>
        )}
        {onTicketBoard ? (
          <span className={pillActive}>Ticket Board</span>
        ) : (
          <Link href="/agent?board=ticket" className={pillInactive}>
            Ticket Board
          </Link>
        )}
        {onKpiBoard ? (
          <span className={pillActive}>Task Board</span>
        ) : (
          <Link href="/agent?board=kpi" className={pillInactive}>
            Task Board
          </Link>
        )}
      </nav>
    );
  }

  if (onAssignment) return null;

  /** Personnel see only Ticket Board + Task Board; Company Board is admin-only. */
  return (
    <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 text-xs font-medium text-zinc-600 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 dark:text-zinc-500">
      {onTicketBoard ? (
        <span className={pillActive}>Ticket Board</span>
      ) : (
        <Link href="/agent?board=ticket" className={pillInactive}>
          Ticket Board
        </Link>
      )}
      {onKpiBoard ? (
        <span className={pillActive}>Task Board</span>
      ) : (
        <Link href="/agent?board=kpi" className={pillInactive}>
          Task Board
        </Link>
      )}
    </nav>
  );
}
