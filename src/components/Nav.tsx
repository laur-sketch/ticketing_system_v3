"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Bell, Search, SlidersHorizontal } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { BrandLockup } from "@/components/BrandLockup";
import { AgentTicketDeepLink } from "@/components/AgentTicketDeepLink";
import { ElapsedFromIso } from "@/components/ElapsedFromIso";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

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
  const role = data?.user?.role;
  const isAdminRole = role === "SuperAdmin" || role === "Admin";
  const roleLabel = role === "SuperAdmin" ? "SuperAdmin" : role;
  const showUtilities =
    role === "SuperAdmin" || role === "Admin" || role === "Personnel";
  const inQueueContext =
    pathname.startsWith("/agent") || pathname === "/admin/manual-assignment";

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

  async function refreshUnreadOpenCount(lastSeenMs: number) {
    try {
      const res = await fetch("/api/tickets?status=OPEN");
      if (!res.ok) return;
      const rows = (await res.json()) as Array<{ createdAt?: string; updatedAt?: string }>;
      const ticketCount = rows.filter((t) => {
        const ts = new Date(t.createdAt ?? t.updatedAt ?? 0).getTime();
        return Number.isFinite(ts) && ts > lastSeenMs;
      }).length;
      if (!isAdminRole) {
        setUnreadOpenCount(ticketCount);
        return;
      }

      const reqRes = await fetch("/api/admin/account-requests/notifications", { cache: "no-store" });
      const reqPayload = reqRes.ok
        ? ((await reqRes.json()) as {
            rows?: Array<{ createdAt?: string }>;
          })
        : { rows: [] };
      const requestCount = (reqPayload.rows ?? []).filter((r) => {
        const ts = new Date(r.createdAt ?? 0).getTime();
        return Number.isFinite(ts) && ts > lastSeenMs;
      }).length;
      setUnreadOpenCount(ticketCount + requestCount);
    } catch {
      // Ignore polling/network failures for badge updates.
    }
  }

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
  }, [showUtilities, data?.user]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!notifRef.current) return;
      if (!notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    if (notifOpen) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [notifOpen]);

  if (
    pathname === "/signin" ||
    pathname === "/signup" ||
    pathname === "/customer/signin" ||
    pathname === "/customer/signup"
  ) {
    return null;
  }

  return (
    <header className="shrink-0 border-b border-zinc-200 bg-white backdrop-blur dark:border-zinc-800 dark:bg-[#0b1220]">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-3 py-2.5 sm:gap-x-4 sm:px-4">
        {showUtilities ? (
          <>
            <BrandLockup variant="staff-header-compact" href="/" className="inline-flex shrink-0" />
            <form
              action="/agent"
              method="get"
              className="flex min-w-0 flex-1 basis-[min(100%,18rem)] items-center rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 sm:max-w-xl sm:basis-0"
            >
              {inQueueContext && status ? <input type="hidden" name="status" value={status} /> : null}
              {inQueueContext && priority ? <input type="hidden" name="priority" value={priority} /> : null}
              {inQueueContext && sort ? <input type="hidden" name="sort" value={sort} /> : null}
              {inQueueContext && dir ? <input type="hidden" name="dir" value={dir} /> : null}
              {inQueueContext && view ? <input type="hidden" name="view" value={view} /> : null}
              {inQueueContext && assigned ? <input type="hidden" name="assigned" value={assigned} /> : null}
              <input type="hidden" name="page" value="1" />
              <Search size={14} className="mr-2 shrink-0 text-zinc-400 dark:text-zinc-500" />
              <input
                name="q"
                defaultValue={inQueueContext ? q : ""}
                placeholder="Find ticket..."
                className="min-w-0 flex-1 bg-transparent text-zinc-900 outline-none placeholder:text-zinc-500 dark:text-zinc-200"
                aria-label="Find ticket"
              />
            </form>
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
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-700 shadow-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
                <div className="absolute right-0 z-40 mt-2 w-[min(360px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] rounded-xl border border-zinc-200 bg-white p-2 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Notifications
                    </p>
                    <Link href={agentHref({ page: "1" })} className="text-[11px] text-orange-700 hover:underline dark:text-orange-300">
                      Open board
                    </Link>
                  </div>
                  <div className="mt-1 max-h-[320px] space-y-1 overflow-y-auto">
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
                </div>
              ) : null}
            </div>
            <Link
              href="/process"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-700 shadow-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              aria-label="Open process controls"
              title="Open process controls"
            >
              <SlidersHorizontal size={15} />
            </Link>
          </>
        ) : null}

        <div
          className={`flex flex-wrap items-center gap-2 ${showUtilities ? "sm:ml-auto" : "ml-auto w-full justify-end sm:w-auto"}`}
        >
          {data?.user ? (
            <>
              <ThemeToggle />
              <span className="hidden max-w-[min(280px,40vw)] truncate text-xs text-zinc-600 dark:text-zinc-500 md:inline">
                {data.user.email}
              </span>
              <span
                className="rounded-full border border-zinc-300 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-orange-300"
                title={role ?? undefined}
              >
                {roleLabel}
              </span>
              <Button
                variant="outline"
                className="h-8 rounded-full border-zinc-300 bg-white px-3 text-xs text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
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
