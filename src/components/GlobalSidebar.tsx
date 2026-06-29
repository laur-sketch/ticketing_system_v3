"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Suspense, useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  CheckSquare,
  ChevronDown,
  Gauge,
  GitBranch,
  Home,
  LayoutDashboard,
  LifeBuoy,
  Menu,
  PlusSquare,
  Ticket,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import { navLinkActive } from "@/lib/nav-link-active";
import { BrandLockup } from "@/components/BrandLockup";

type NavChild = { href: string; label: string; matchBoard?: "ticket" | "kpi" };
type NavItem =
  | { kind: "link"; href: string; label: string }
  | { kind: "group"; label: string; children: NavChild[] };

function linksForRole(role: string | undefined): NavItem[] {
  if (role === "SuperAdmin") {
    return [
      {
        kind: "group",
        label: "Tickets",
        children: [
          { href: "/", label: "Ticket Dashboard" },
          { href: "/my-requests", label: "My requests" },
          { href: "/admin/ticket-requests", label: "Create requests" },
        ],
      },
      { kind: "group", label: "Operations", children: [{ href: "/agent", label: "Board" }] },
      {
        kind: "group",
        label: "Management",
        children: [
          { href: "/admin/personnel", label: "Personnel" },
          { href: "/admin/activities", label: "Activities" },
          { href: "/admin/escalation-triggers", label: "Priority alerts" },
        ],
      },
      { kind: "group", label: "Reports", children: [{ href: "/insights", label: "Metrics & Reports" }] },
      { kind: "group", label: "Account", children: [{ href: "/admin/account", label: "My Account" }] },
    ];
  }
  if (role === "Admin") {
    return [
      {
        kind: "group",
        label: "Tickets",
        children: [
          { href: "/", label: "Ticket Dashboard" },
          { href: "/my-requests", label: "My requests" },
          { href: "/admin/ticket-requests", label: "Create requests" },
        ],
      },
      { kind: "group", label: "Operations", children: [{ href: "/agent", label: "Board" }] },
      {
        kind: "group",
        label: "Management",
        children: [
          { href: "/admin/personnel", label: "Personnel" },
          { href: "/admin/activities", label: "Activities" },
          { href: "/admin/escalation-triggers", label: "Priority alerts" },
        ],
      },
      { kind: "group", label: "Reports", children: [{ href: "/insights", label: "Metrics & Reports" }] },
      { kind: "group", label: "Account", children: [{ href: "/admin/account", label: "My Account" }] },
    ];
  }
  if (role === "Personnel") {
    return [
      {
        kind: "group",
        label: "Tickets",
        children: [
          { href: "/my-requests", label: "Ticket Dashboard" },
          { href: "/agent", label: "Board" },
        ],
      },
      { kind: "group", label: "Reports", children: [{ href: "/insights", label: "Metrics & Reports" }] },
      { kind: "group", label: "Account", children: [{ href: "/admin/account", label: "My Account" }] },
    ];
  }
  return [
    { kind: "link", href: "/", label: "Home" },
    { kind: "link", href: "/admin/account", label: "My Account" },
  ];
}

function iconForLink(label: string) {
  const key = label.toLowerCase();
  if (key.includes("my request")) return LayoutDashboard;
  if (key === "board") return Ticket;
  if (key.includes("ticket board")) return Ticket;
  if (key.includes("task board")) return CheckSquare;
  if (key.includes("home") || key.includes("dashboard")) return Home;
  if (key.includes("ticket")) return Ticket;
  if (key.includes("metrics") || key.includes("reports")) return BarChart3;
  if (key.includes("metric")) return Gauge;
  if (key.includes("analytics")) return BarChart3;
  if (key.includes("report")) return Activity;
  if (key.includes("personnel")) return Users;
  if (key.includes("activities")) return Activity;
  if (key.includes("my account")) return UserCircle;
  if (key.includes("account")) return UserCircle;
  if (key.includes("escalation")) return LifeBuoy;
  if (key.includes("process")) return GitBranch;
  if (key.includes("submit")) return PlusSquare;
  if (key.includes("queue metrics")) return Gauge;
  if (key.includes("create request")) return PlusSquare;
  return Home;
}

function agentBoardActive(
  pathname: string,
  searchParams: URLSearchParams | null,
  match: "ticket" | "kpi",
): boolean {
  if (!(pathname === "/agent" || pathname.startsWith("/agent/"))) return false;
  const board = searchParams?.get("board") ?? "";
  if (match === "kpi") return board === "kpi";
  return board === "" || board === "ticket" || board === "company";
}

function navChildActive(pathname: string, searchParams: URLSearchParams | null, child: NavChild): boolean {
  return child.matchBoard ? agentBoardActive(pathname, searchParams, child.matchBoard) : navLinkActive(pathname, child.href);
}

function navGroupActive(pathname: string, searchParams: URLSearchParams | null, item: Extract<NavItem, { kind: "group" }>) {
  return item.children.some((child) => navChildActive(pathname, searchParams, child));
}

export function GlobalSidebar() {
  return (
    <Suspense fallback={null}>
      <GlobalSidebarInner />
    </Suspense>
  );
}

function GlobalSidebarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data } = useSession();
  const role = data?.user?.role;
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      const stored = window.localStorage.getItem("sidebar-collapsed");
      setCollapsed(stored === "1");
    });
  }, []);

  if (pathname === "/signin" || pathname === "/signup" || pathname === "/customer/signin" || pathname === "/customer/signup") return null;

  const links = linksForRole(role);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-700 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 lg:hidden"
        style={{
          bottom: "max(1rem, env(safe-area-inset-bottom, 0px))",
          left: "max(1rem, env(safe-area-inset-left, 0px))",
        }}
        aria-label="Open navigation menu"
      >
        <Menu size={18} />
      </button>
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation menu"
          />
          <aside className="absolute left-0 top-0 flex h-dvh w-[min(88vw,320px)] max-w-[320px] flex-col overflow-y-auto border-r border-border bg-surface px-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-[max(1.25rem,env(safe-area-inset-top,0px))] shadow-2xl dark:border-zinc-800">
            <div className="mb-5 flex items-center justify-between">
              <BrandLockup variant="staff-sidebar-expanded" />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                aria-label="Close navigation menu"
              >
                <X size={16} />
              </button>
            </div>
            <nav className="space-y-2 text-sm">
              {links.map((item) => {
                if (item.kind === "group") {
                  const GroupIcon = iconForLink(item.label);
                  const groupActive = navGroupActive(pathname, searchParams, item);
                  return (
                    <details
                      key={`m-group-${item.label}`}
                      className="group space-y-1"
                      {...(groupActive ? { open: true } : {})}
                    >
                      <summary
                        className={`flex cursor-pointer list-none items-center justify-between rounded-md px-3 py-2 text-sm font-semibold transition marker:hidden [&::-webkit-details-marker]:hidden ${
                          groupActive
                            ? "text-orange-700 dark:text-orange-300"
                            : "text-muted hover:bg-surface-muted hover:text-foreground"
                        }`}
                      >
                        <span className="inline-flex items-center gap-2">
                          <GroupIcon size={16} strokeWidth={2.1} />
                          {item.label}
                        </span>
                        <ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden />
                      </summary>
                      <div className="space-y-1 border-l border-border/80 pl-3">
                        {item.children.map((child) => {
                          const ChildIcon = iconForLink(child.label);
                          const active = navChildActive(pathname, searchParams, child);
                          return (
                            <Link
                              key={`m-${child.href}-${child.label}`}
                              href={child.href}
                              onClick={() => setMobileOpen(false)}
                              className={`block rounded-md px-3 py-2 ${
                                active
                                  ? "stoic-nav-active"
                                  : "text-muted hover:bg-surface-muted hover:text-foreground"
                              }`}
                            >
                              <span className="inline-flex items-center gap-2">
                                <ChildIcon size={16} strokeWidth={2.1} />
                                {child.label}
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    </details>
                  );
                }
                const active = navLinkActive(pathname, item.href);
                const Icon = iconForLink(item.label);
                return (
                  <Link
                    key={`m-${item.href}-${item.label}`}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`block rounded-md px-3 py-2 ${
                      active
                        ? "stoic-nav-active"
                        : "text-muted hover:bg-surface-muted hover:text-foreground"
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Icon size={16} strokeWidth={2.1} />
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      ) : null}
      <aside
        className={`hidden h-screen min-h-0 shrink-0 flex-col border-r border-border bg-surface px-4 py-5 transition-all duration-200 dark:border-zinc-800 bg-surface lg:flex lg:flex-col ${collapsed ? "w-20" : "w-72"}`}
      >
        <div className={`shrink-0 flex ${collapsed ? "flex-col items-center gap-3" : "items-start justify-between gap-3"}`}>
          <div className={`min-w-0 flex-1 ${collapsed ? "text-center" : ""}`}>
            {collapsed ? (
              <BrandLockup variant="staff-sidebar-collapsed" />
            ) : (
              <BrandLockup variant="staff-sidebar-expanded" />
            )}
          </div>
          <button
            type="button"
            onClick={toggleCollapsed}
            className={`rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 ${collapsed ? "w-full" : ""}`}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? ">>" : "<<"}
          </button>
        </div>
        <nav
          className={`mt-6 min-h-0 flex-1 space-y-2 overflow-y-auto text-sm ${collapsed ? "flex flex-col items-center" : ""}`}
        >
          {links.map((item) => {
            if (item.kind === "group") {
              const GroupIcon = iconForLink(item.label);
              const groupActive = navGroupActive(pathname, searchParams, item);
              if (!collapsed) {
                return (
                  <details
                    key={`group-${item.label}`}
                    className="group space-y-1"
                    {...(groupActive ? { open: true } : {})}
                  >
                    <summary
                      className={`flex cursor-pointer list-none items-center justify-between rounded-md px-3 py-2 text-sm font-semibold transition marker:hidden [&::-webkit-details-marker]:hidden ${
                        groupActive
                          ? "text-orange-700 dark:text-orange-300"
                          : "text-muted hover:bg-surface-muted hover:text-foreground"
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <GroupIcon size={16} strokeWidth={2.1} />
                        {item.label}
                      </span>
                      <ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden />
                    </summary>
                    <div className="space-y-1 border-l border-border/80 pl-3">
                      {item.children.map((child) => {
                        const ChildIcon = iconForLink(child.label);
                        const active = navChildActive(pathname, searchParams, child);
                        return (
                          <Link
                            key={`${child.href}-${child.label}`}
                            href={child.href}
                            className={`block rounded-md px-3 py-2 ${
                              active
                                ? "stoic-nav-active"
                                : "text-muted hover:bg-surface-muted hover:text-foreground"
                            }`}
                          >
                            <span className="inline-flex items-center gap-2">
                              <ChildIcon size={16} strokeWidth={2.1} />
                              {child.label}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </details>
                );
              }
              return (
                <div
                  key={`group-${item.label}`}
                  className="flex w-full flex-col items-center gap-1"
                >
                  <div className="flex flex-col items-center gap-1">
                    {item.children.map((child) => {
                      const ChildIcon = iconForLink(child.label);
                      const active = navChildActive(pathname, searchParams, child);
                      return (
                        <Link
                          key={`${child.href}-${child.label}`}
                          href={child.href}
                          title={collapsed ? child.label : undefined}
                          className={`block rounded-md w-10 px-0 py-2 text-center ${
                            active
                              ? "stoic-nav-active"
                              : "text-muted hover:bg-surface-muted hover:text-foreground"
                          }`}
                        >
                          <span className="inline-flex w-full items-center justify-center">
                            <ChildIcon size={16} strokeWidth={2.2} />
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            }
            const active = navLinkActive(pathname, item.href);
            const Icon = iconForLink(item.label);
            return (
              <Link
                key={`${item.href}-${item.label}`}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={`block rounded-md ${
                  collapsed ? "w-10 px-0 py-2 text-center" : "px-3 py-2"
                } ${
                  active
                    ? "stoic-nav-active"
                    : "text-muted hover:bg-surface-muted hover:text-foreground"
                }`}
              >
                {collapsed ? (
                  <span className="inline-flex w-full items-center justify-center">
                    <Icon size={16} strokeWidth={2.2} />
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <Icon size={16} strokeWidth={2.1} />
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
