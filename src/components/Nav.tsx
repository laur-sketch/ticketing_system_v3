"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Bell, SlidersHorizontal, UserRound } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./ui/button";
import { BrandLockup } from "@/components/BrandLockup";
import { AgentTicketDeepLink } from "@/components/AgentTicketDeepLink";
import { ElapsedFromIso } from "@/components/ElapsedFromIso";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { PhilippineTimeClock } from "@/components/PhilippineTimeClock";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PatchNotesControl } from "@/components/PatchNotesControl";

export function Nav() {
  const { data } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifications, setNotifications] = useState<
    Array<{ id: string; ticketNumber: string; title: string; status: string; updatedAt: string }>
  >([]);
  const [accountRequestNotifications, setAccountRequestNotifications] = useState<
    Array<{ id: string; requestType: string; createdAt: string; portalAccount: { name: string; email: string } }>
  >([]);
  const [unreadOpenCount, setUnreadOpenCount] = useState(0);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const mobileNotifPanelRef = useRef<HTMLDivElement | null>(null);
  const desktopNotifPanelRef = useRef<HTMLDivElement | null>(null);
  const role = data?.user?.role;
  const isAdminRole = role === "SuperAdmin" || role === "Admin";
  const roleLabel = role === "SuperAdmin" ? "SuperAdmin" : role;
  const userName = data?.user?.name ?? data?.user?.email ?? "Account";
  const showUtilities =
    role === "SuperAdmin" || role === "Admin" || role === "Personnel";

  const status = searchParams.get("status") ?? "";
  const priority = searchParams.get("priority") ?? "";
  const sort = searchParams.get("sort") ?? "";
  const dir = searchParams.get("dir") ?? "";
  const q = searchParams.get("q") ?? "";
  const view = searchParams.get("view") ?? "";
  const assigned = searchParams.get("assigned") ?? "";

  function agentHref(next: Record<string, string | null>) {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (priority) qs.set("priority", priority);
    if (sort) qs.set("sort", sort);
    if (dir) qs.set("dir", dir);
    if (q) qs.set("q", q);
    if (view) qs.set("view", view);
    if (assigned) qs.set("assigned", assigned);
    for (const [k, v] of Object.entries(next)) {
      if (!v) qs.delete(k);
      else qs.set(k, v);
    }
    const s = qs.toString();
    return s ? `/agent?${s}` : "/agent";
  }

  const refreshUnreadOpenCount = useCallback(async (lastSeenMs: number) => {
    try {
      const params = new URLSearchParams({ lastSeenMs: String(lastSeenMs) });
      const res = await fetch(`/api/notifications/unread-count?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) return;
      const payload = (await res.json()) as { total?: number };
      setUnreadOpenCount(Math.max(0, Number(payload.total ?? 0) || 0));
    } catch {
      // Ignore polling/network failures for badge updates.
    }
  }, []);

  useEffect(() => {
    if (!notifOpen || !showUtilities) return;
    let ignore = false;
    queueMicrotask(() => setNotifLoading(true));
    void fetch("/api/tickets")
      .then((r) => (r.ok ? r.json() : []))
      .then(async (rows: Array<{ id: string; ticketNumber: string; title: string; status: string; updatedAt: string }>) => {
        if (ignore) return;
        const latestTickets = [...rows]
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
          .slice(0, 6);
        setNotifications(latestTickets);

        if (!isAdminRole) {
          setAccountRequestNotifications([]);
          return;
        }

        const reqRes = await fetch("/api/admin/account-requests/notifications", { cache: "no-store" });
        const reqPayload = reqRes.ok
          ? ((await reqRes.json()) as {
              rows?: Array<{
                id: string;
                requestType: string;
                createdAt: string;
                portalAccount: { name: string; email: string };
              }>;
            })
          : { rows: [] };
        if (!ignore) setAccountRequestNotifications(reqPayload.rows ?? []);
      })
      .catch(() => {
        if (!ignore) {
          setNotifications([]);
          setAccountRequestNotifications([]);
        }
      })
      .finally(() => {
        if (!ignore) setNotifLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [notifOpen, showUtilities, isAdminRole]);

  useEffect(() => {
    if (!showUtilities || !data?.user) return;
    if (typeof window === "undefined") return;
    const key = `notif-open-seen-ts:${data.user.email ?? "unknown"}`;
    const lastSeenMs = Number(window.localStorage.getItem(key) ?? "0") || 0;
    queueMicrotask(() => void refreshUnreadOpenCount(lastSeenMs));
    const timer = window.setInterval(() => {
      const latestSeen = Number(window.localStorage.getItem(key) ?? "0") || 0;
      void refreshUnreadOpenCount(latestSeen);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [showUtilities, data?.user, refreshUnreadOpenCount]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (notifRef.current?.contains(target)) return;
      if (mobileNotifPanelRef.current?.contains(target)) return;
      if (desktopNotifPanelRef.current?.contains(target)) return;
      setNotifOpen(false);
    }
    if (notifOpen) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [notifOpen]);

  useEffect(() => {
    if (!notifOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [notifOpen]);

  if (
    pathname === "/signin" ||
    pathname === "/signup" ||
    pathname === "/customer/signin" ||
    pathname === "/customer/signup"
  ) {
    return null;
  }

  const notifPanelBody = (
    <>
      <div className="flex items-center justify-between px-2 py-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Notifications
        </p>
        <Link href={agentHref({ page: "1" })} className="text-[11px] text-orange-700 hover:underline dark:text-orange-300">
          Open board
        </Link>
      </div>
      <div className="mt-1 max-h-[min(320px,calc(100dvh_-_9rem))] space-y-1 overflow-y-auto">
        {notifLoading ? (
          <p className="px-2 py-6 text-center text-sm text-zinc-500 dark:text-zinc-500">Loading…</p>
        ) : notifications.length === 0 && accountRequestNotifications.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-zinc-500 dark:text-zinc-500">
            No recent notifications.
          </p>
        ) : (
          <>
            {isAdminRole && accountRequestNotifications.length > 0 ? (
              <div className="space-y-1">
                <p className="px-2 pt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700 dark:text-amber-300">
                  Account requests
                </p>
                {accountRequestNotifications.map((n) => (
                  <Link
                    key={n.id}
                    href="/admin/account"
                    onClick={() => setNotifOpen(false)}
                    className="block rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 hover:bg-amber-500/15 dark:border-amber-500/30 dark:bg-amber-500/10 dark:hover:bg-amber-500/15"
                  >
                    <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      {n.requestType === "DELETION"
                        ? "Deletion request"
                        : n.requestType === "PASSWORD_RESET"
                          ? "Password reset request"
                          : "Suspension request"}
                    </p>
                    <p className="line-clamp-1 text-xs text-zinc-700 dark:text-zinc-300">
                      {n.portalAccount.name} · {n.portalAccount.email}
                    </p>
                    <p className="mt-1 text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                      Pending · <ElapsedFromIso iso={n.createdAt} className="inline" />
                    </p>
                  </Link>
                ))}
              </div>
            ) : null}
            {notifications.map((n) => (
              <AgentTicketDeepLink
                key={n.id}
                ticketId={n.id}
                onNavigate={() => setNotifOpen(false)}
                className="block rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950/60 dark:hover:bg-zinc-800/70"
              >
                <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-200">{n.ticketNumber}</p>
                <p className="line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">{n.title}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                  {n.status.replaceAll("_", " ")} ·{" "}
                  <ElapsedFromIso iso={n.updatedAt} className="inline" />
                </p>
              </AgentTicketDeepLink>
            ))}
          </>
        )}
      </div>
    </>
  );

  const mobileNotifOverlay =
    notifOpen && typeof document !== "undefined"
      ? createPortal(
          <>
            <button
              type="button"
              className="fixed inset-0 z-[200] bg-background sm:hidden"
              aria-label="Close notifications"
              onClick={() => setNotifOpen(false)}
            />
            <div
              ref={mobileNotifPanelRef}
              className="fixed inset-x-3 top-[calc(4.25rem_+_env(safe-area-inset-top,0px))] z-[201] max-h-[calc(100dvh_-_5.5rem_-_env(safe-area-inset-bottom,0px))] overflow-hidden rounded-[var(--radius-stoic-lg)] border border-border bg-[var(--surface-elevated)] p-2 shadow-[var(--shadow-elevated)] sm:hidden"
            >
              {notifPanelBody}
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <header className="relative z-50 shrink-0 border-b border-border bg-surface/95 backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-3 py-2.5 sm:gap-x-4 sm:px-4">
        {showUtilities ? (
          <>
            <BrandLockup variant="staff-header-compact" href="/" className="inline-flex min-w-0 shrink-0 max-sm:flex-1" />
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:basis-0 sm:max-w-xl">
              <PhilippineTimeClock compact className="shrink-0" />
              <div className="relative shrink-0" ref={notifRef}>
                <button
                  type="button"
                  onClick={() => {
                    setNotifOpen((v) => {
                      const next = !v;
                      if (next && typeof window !== "undefined") {
                        const key = `notif-open-seen-ts:${data?.user?.email ?? "unknown"}`;
                        const now = Date.now().toString();
                        window.localStorage.setItem(key, now);
                        setUnreadOpenCount(0);
                      }
                      return next;
                    });
                  }}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-foreground shadow-sm transition hover:bg-surface-muted sm:h-9 sm:w-9"
                  aria-label="Open notifications panel"
                  title="Open notifications panel"
                >
                  <Bell size={15} />
                  {unreadOpenCount > 0 ? (
                    <span className="absolute -right-1 -top-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-4 text-white">
                      {unreadOpenCount > 9 ? "9+" : unreadOpenCount}
                    </span>
                  ) : null}
                </button>
                {notifOpen ? (
                  <div
                    ref={desktopNotifPanelRef}
                    className="absolute left-0 z-50 mt-2 hidden w-[min(360px,calc(100vw_-_2rem))] max-w-[calc(100vw_-_2rem)] max-h-[min(420px,calc(100dvh_-_6rem))] overflow-hidden stoic-card-elevated bg-[var(--surface-elevated)] p-2 sm:block"
                  >
                    {notifPanelBody}
                  </div>
                ) : null}
              </div>
              {mobileNotifOverlay}
              <Link
                href="/process"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-700 shadow-sm transition hover:bg-zinc-100 sm:h-9 sm:w-9 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                aria-label="Open process controls"
                title="Open process controls"
              >
                <SlidersHorizontal size={15} />
              </Link>
              <PatchNotesControl visible={showUtilities} />
            </div>
          </>
        ) : null}

        <div
          className={`flex flex-wrap items-center gap-2 ${showUtilities ? "ml-auto justify-end" : "ml-auto w-full justify-end sm:w-auto"}`}
        >
          {data?.user ? (
            <>
              <ThemeToggle />
              <div
                className="flex max-w-[14rem] items-center gap-2 rounded-full border border-zinc-300 bg-orange-50 py-1 pl-1 pr-3 text-orange-800 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-orange-200"
                title={data.user.email ?? role ?? undefined}
              >
                <Avatar className="size-7 border border-orange-500/30 bg-gradient-to-br from-orange-600 to-orange-800 text-white shadow-sm">
                  <AvatarImage src={data.user.image ?? undefined} alt={data.user.name ?? "Profile"} />
                  <AvatarFallback className="bg-transparent">
                    <UserRound className="size-3.5" aria-hidden />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold leading-4">{roleLabel}</p>
                  <p className="hidden truncate text-[10px] leading-3 text-zinc-600 dark:text-zinc-500 sm:block">
                    {userName}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                className="h-8 rounded-full border-zinc-300 bg-white px-2.5 text-xs text-zinc-900 hover:bg-zinc-100 sm:px-3 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                onClick={() => void signOut({ callbackUrl: "/" })}
              >
                Sign out
              </Button>
            </>
          ) : (
            <>
              <ThemeToggle />
              <Link
                href="/signin"
                className="rounded-full bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-500"
              >
                Sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
