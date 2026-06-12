"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Bell, CircleHelp, LifeBuoy, Menu, Plus, Search, X } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/cn";
import { BrandLockup } from "@/components/BrandLockup";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { CUSTOMER_PORTAL_NAV_ITEMS, customerPortalNavItemActive } from "@/components/portal/customer-portal-nav";
import { useHash } from "@/components/portal/useHash";

const tabs: { href: string; label: string }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/my-tickets", label: "Active Tickets" },
  { href: "/tickets/knowledge", label: "Knowledge Base" },
];

export function CustomerTopNav() {
  const pathname = usePathname();
  const hash = useHash();
  const { data } = useSession();
  const [navOpen, setNavOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifBusy, setNotifBusy] = useState(false);
  type NotifRow = {
    id: string;
    ticketId: string;
    ticketNumber: string;
    summary: string;
    detail: string | null;
    createdAt: string;
    href: string;
  };
  const [notifications, setNotifications] = useState<NotifRow[]>([]);
  const [intake, setIntake] = useState<{
    canCreateTickets: boolean;
    authProvider: string | null;
    pendingConfirmation: { ticketId: string; ticketNumber: string; verificationHref: string } | null;
  }>({ canCreateTickets: true, authProvider: null, pendingConfirmation: null });
  const initial = (data?.user?.name?.[0] ?? data?.user?.email?.[0] ?? "U").toUpperCase();
  const userKey = (data?.user?.email ?? "customer").toLowerCase();
  const seenStorageKey = `customer-notif-seen:${userKey}`;

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      setNotifBusy(true);
      const res = await fetch("/api/customer/notifications", { cache: "no-store" });
      const payload = await res.json().catch(() => ({}));
      if (!cancelled) {
        setNotifications(Array.isArray(payload.notifications) ? payload.notifications : []);
        if (payload.intake && typeof payload.intake === "object") {
          setIntake({
            canCreateTickets: Boolean(payload.intake.canCreateTickets),
            authProvider: typeof payload.intake.authProvider === "string" ? payload.intake.authProvider : null,
            pendingConfirmation:
              payload.intake.pendingConfirmation && typeof payload.intake.pendingConfirmation === "object"
                ? payload.intake.pendingConfirmation
                : null,
          });
        }
        setNotifBusy(false);
      }
    }
    void refresh();
    const t = window.setInterval(() => void refresh(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!notifOpen) return;
    window.localStorage.setItem(seenStorageKey, String(Date.now()));
  }, [notifOpen, seenStorageKey]);

  const groupedNotifications = useMemo(() => {
    const byTicket = new Map<string, (typeof notifications)[number]>();
    for (const n of notifications) {
      const existing = byTicket.get(n.ticketId);
      if (!existing) byTicket.set(n.ticketId, n);
      else {
        const a = new Date(existing.createdAt).getTime();
        const b = new Date(n.createdAt).getTime();
        if (b > a) byTicket.set(n.ticketId, n);
      }
    }
    return [...byTicket.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [notifications]);

  const unreadCount = useMemo(() => {
    if (typeof window === "undefined") return 0;
    const seenMs = Number(window.localStorage.getItem(seenStorageKey) ?? "0") || 0;
    return notifications.filter((n) => new Date(n.createdAt).getTime() > seenMs).length;
  }, [notifications, seenStorageKey]);

  function markAllRead() {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(seenStorageKey, String(Date.now()));
    setNotifOpen(false);
  }

  return (
    <header className="shrink-0 border-b border-zinc-200 bg-white/95 text-zinc-900 shadow-[0_8px_32px_rgba(0,0,0,0.06)] backdrop-blur dark:border-zinc-800/90 dark:bg-[#11100f]/95 dark:text-zinc-100 dark:shadow-[0_8px_32px_rgba(0,0,0,0.18)]">
      {navOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setNavOpen(false)}
            aria-label="Close menu"
          />
          <aside className="absolute left-0 top-0 flex h-dvh w-[min(88vw,320px)] max-w-[320px] flex-col overflow-y-auto border-r border-zinc-200 bg-white px-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-[max(1.25rem,env(safe-area-inset-top,0px))] shadow-2xl dark:border-zinc-800 dark:bg-[#0b1220]">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Menu</p>
              <button
                type="button"
                onClick={() => setNavOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                aria-label="Close menu"
              >
                <X className="size-4" />
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-0.5 text-sm" aria-label="Mobile">
              {CUSTOMER_PORTAL_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                const active = customerPortalNavItemActive(label, pathname, hash);
                return (
                  <Link
                    key={`drawer-${label}`}
                    href={href}
                    onClick={() => setNavOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2.5 font-medium transition",
                      active
                        ? "bg-orange-500/15 text-orange-800 dark:bg-orange-500/20 dark:text-orange-200"
                        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
                    )}
                  >
                    <Icon className="size-4 shrink-0 opacity-80" />
                    {label}
                  </Link>
                );
              })}
            </nav>
            <a
              href="mailto:support@example.com"
              className="mt-4 flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 py-2.5 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800/80"
            >
              <LifeBuoy className="size-3.5 shrink-0" />
              Need help?
            </a>
          </aside>
        </div>
      ) : null}
      <div className="flex min-h-[3.5rem] flex-col gap-2 px-3 py-2 sm:px-4 lg:flex-row lg:items-center lg:gap-4 lg:px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-[#181716] dark:text-zinc-200 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>
            <div className="min-w-0">
              <BrandLockup variant="customer-topnav" href="/" />
            </div>
          </div>
          <nav
            className="-mx-1 mt-2 flex items-center gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] lg:hidden [&::-webkit-scrollbar]:hidden"
            aria-label="Primary"
          >
            {tabs.map((t) => {
              const active = t.href === "/" ? pathname === "/" : pathname === t.href || pathname.startsWith(t.href + "/");
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={cn(
                    "relative shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition",
                    active
                      ? "text-orange-700 dark:text-orange-200"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/[0.04] dark:hover:text-zinc-100",
                  )}
                >
                  {t.label}
                  {active ? (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-orange-500" />
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 lg:min-w-0 lg:flex-1">
          <form
            action="/my-tickets"
            method="get"
            className="order-last flex w-full items-center gap-2 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 shadow-inner md:order-none md:w-[min(30rem,38vw)] md:min-w-[18rem] dark:border-zinc-800 dark:bg-[#181716]"
          >
            <Search className="size-4 shrink-0 text-zinc-500" aria-hidden />
            <input
              name="q"
              placeholder="Search tickets, IDs, or keywords…"
              className="w-full bg-transparent text-sm text-zinc-900 placeholder:text-zinc-500 focus:outline-none dark:text-zinc-100 dark:placeholder:text-zinc-600"
              aria-label="Search"
            />
          </form>
          <Link
            href={
              intake.canCreateTickets
                ? "/tickets/new"
                : (intake.pendingConfirmation?.verificationHref ?? "/my-tickets")
            }
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold shadow-sm md:hidden",
              intake.canCreateTickets
                ? "bg-orange-600 text-white hover:bg-orange-500"
                : "border border-amber-500/50 bg-amber-500/15 text-amber-950 hover:bg-amber-500/25 dark:text-amber-100",
            )}
            title={
              intake.canCreateTickets
                ? "Submit a new request"
                : "You have a ticket in progress or awaiting confirmation. Finish it before submitting a new request."
            }
          >
            <Plus className="size-4" />
            New
          </Link>
          <div className="relative">
            <button
              type="button"
              onClick={() => setNotifOpen((v) => !v)}
              className="inline-flex size-9 items-center justify-center rounded-lg border border-zinc-300 bg-zinc-50 text-zinc-600 transition hover:border-zinc-400 hover:text-zinc-950 dark:border-zinc-800 dark:bg-[#181716] dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-100"
              aria-label="Notifications"
            >
              <Bell className="size-4" />
              {unreadCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-orange-600 px-1 text-[10px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </button>
            {notifOpen ? (
              <div className="fixed inset-x-3 top-[calc(3.5rem_+_env(safe-area-inset-top,0px))] z-20 mt-0 max-h-[calc(100dvh_-_4.5rem_-_env(safe-area-inset-bottom,0px))] w-auto overflow-hidden rounded-xl border border-zinc-200 bg-white p-2 shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[min(320px,calc(100vw_-_2rem))] dark:border-zinc-700 dark:bg-[#0b1220]">
                <div className="flex items-center justify-between gap-2 px-2 py-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                    Notifications
                  </p>
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="text-[11px] font-semibold text-orange-700 hover:text-orange-800 dark:text-orange-300 dark:hover:text-orange-200"
                  >
                    Mark all as read
                  </button>
                </div>
                <div className="mt-1 max-h-[min(20rem,calc(100dvh_-_8rem))] space-y-1 overflow-auto">
                  {notifBusy && groupedNotifications.length === 0 ? (
                    <p className="px-2 py-3 text-xs text-zinc-500 dark:text-zinc-500">Loading…</p>
                  ) : null}
                  {!notifBusy && groupedNotifications.length === 0 ? (
                    <p className="px-2 py-3 text-xs text-zinc-500 dark:text-zinc-500">No updates yet.</p>
                  ) : null}
                  {groupedNotifications.map((n) => (
                    <Link
                      key={n.id}
                      href={n.href}
                      className="block rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-2 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:bg-zinc-800"
                    >
                      <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        {n.ticketNumber} ·{" "}
                        {n.summary === "PENDING_RESOLUTION_CONFIRM"
                          ? "Confirmation required — verify your resolved ticket"
                          : n.summary === "PENDING_INTAKE_LOCK"
                            ? "Ticket is now in progress"
                            : n.summary === "Status → IN_PROGRESS"
                              ? "Ticket is now in progress"
                              : n.summary === "Resolution email sent"
                                ? "Ticket resolved — verification required"
                                : n.summary.startsWith("Priority →")
                                  ? `Priority changed (${n.summary.replace("Priority →", "").trim()})`
                                  : n.summary}
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-400">
                        {new Date(n.createdAt).toLocaleString()}
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <ThemeToggle className="rounded-lg border-zinc-300 bg-zinc-50 text-zinc-600 hover:border-zinc-400 hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-800 dark:bg-[#181716] dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-[#181716] dark:hover:text-zinc-100" />
          <Link
            href="/process"
            className="inline-flex size-9 items-center justify-center rounded-lg border border-zinc-300 bg-zinc-50 text-zinc-600 transition hover:border-zinc-400 hover:text-zinc-950 dark:border-zinc-800 dark:bg-[#181716] dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-100"
            aria-label="Help"
          >
            <CircleHelp className="size-4" />
          </Link>
          <div className="flex items-center gap-2 pl-1">
            <div className="flex size-9 items-center justify-center overflow-hidden rounded-lg border border-orange-500/30 bg-gradient-to-br from-orange-600 to-orange-800 text-xs font-bold text-white shadow-sm">
              {data?.user?.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.user.image} alt={data.user.name ?? "Profile"} className="h-full w-full object-cover" />
              ) : (
                initial
              )}
            </div>
            <button
              type="button"
              onClick={() => void signOut({ callbackUrl: "/signin" })}
              className="hidden text-xs font-semibold text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100 min-[380px]:inline"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
