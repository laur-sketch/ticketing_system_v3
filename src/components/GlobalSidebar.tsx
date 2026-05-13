"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Suspense, useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  CheckSquare,
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
      { kind: "link", href: "/", label: "Ticket Dashboard" },
      { kind: "link", href: "/admin/personnel", label: "Personnel" },
      { kind: "link", href: "/agent", label: "Board" },
      { kind: "link", href: "/insights", label: "Metrics & Reports" },
      { kind: "link", href: "/admin/escalation-triggers", label: "Escalation triggers" },
      { kind: "link", href: "/admin/account", label: "My Account" },
    ];
  }
  if (role === "Admin") {
    return [
      { kind: "link", href: "/", label: "Ticket Dashboard" },
      { kind: "link", href: "/admin/personnel", label: "Personnel" },
      { kind: "link", href: "/agent", label: "Board" },
      { kind: "link", href: "/insights", label: "Metrics & Reports" },
      { kind: "link", href: "/admin/escalation-triggers", label: "Escalation triggers" },
      { kind: "link", href: "/admin/account", label: "My Account" },
    ];
  }
  if (role === "Personnel") {
    return [
      { kind: "link", href: "/my-requests", label: "Ticket Dashboard" },
      {
        kind: "group",
        label: "Board",
        children: [
          { href: "/agent", label: "Ticket Board", matchBoard: "ticket" },
          { href: "/agent?board=kpi", label: "Task Board", matchBoard: "kpi" },
        ],
      },
      { kind: "link", href: "/insights", label: "Metrics & Reports" },
      { kind: "link", href: "/admin/account", label: "My Account" },
    ];
  }
  return [
    { kind: "link", href: "/", label: "Home" },
    { kind: "link", href: "/admin/account", label: "My Account" },
  ];
}

function iconForLink(label: string) {
  const key = label.toLowerCase();
  if (key.includes("ticket dashboard")) return LayoutDashboard;
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
  if (key.includes("my account")) return UserCircle;
  if (key.includes("account")) return UserCircle;
  if (key.includes("escalation")) return LifeBuoy;
  if (key.includes("process")) return GitBranch;
  if (key.includes("submit")) return PlusSquare;
  if (key.includes("queue metrics")) return Gauge;
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
          <aside className="absolute left-0 top-0 h-full w-[82vw] max-w-[320px] border-r border-zinc-200 bg-white px-4 py-5 shadow-2xl dark:border-zinc-800 dark:bg-[#0b1220]">
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
                  return (
                    <div key={`m-group-${item.label}`} className="space-y-1">
                      <div className="flex items-center gap-2 px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        <GroupIcon size={14} strokeWidth={2.1} />
                        {item.label}
                      </div>
                      <div className="space-y-1 pl-3">
                        {item.children.map((child) => {
                          const ChildIcon = iconForLink(child.label);
                          const active = child.matchBoard
                            ? agentBoardActive(pathname, searchParams, child.matchBoard)
                            : navLinkActive(pathname, child.href);
                          return (
                            <Link
                              key={`m-${child.href}-${child.label}`}
                              href={child.href}
                              onClick={() => setMobileOpen(false)}
                              className={`block rounded-md px-3 py-2 ${
                                active
                                  ? "bg-orange-500/15 font-semibold text-orange-800 dark:bg-orange-500/20 dark:text-orange-200"
                                  : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
                    </div>
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
                        ? "bg-orange-500/15 font-semibold text-orange-800 dark:bg-orange-500/20 dark:text-orange-200"
                        : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
        className={`hidden h-screen min-h-0 shrink-0 flex-col border-r border-zinc-200 bg-white px-4 py-5 transition-all duration-200 dark:border-zinc-800 dark:bg-[#0b1220] lg:flex lg:flex-col ${collapsed ? "w-20" : "w-72"}`}
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
              return (
                <div
                  key={`group-${item.label}`}
                  className={collapsed ? "flex w-full flex-col items-center gap-1" : "space-y-1"}
                >
                  {!collapsed ? (
                    <div className="flex items-center gap-2 px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      <GroupIcon size={14} strokeWidth={2.1} />
                      {item.label}
                    </div>
                  ) : null}
                  <div className={collapsed ? "flex flex-col items-center gap-1" : "space-y-1 pl-3"}>
                    {item.children.map((child) => {
                      const ChildIcon = iconForLink(child.label);
                      const active = child.matchBoard
                        ? agentBoardActive(pathname, searchParams, child.matchBoard)
                        : navLinkActive(pathname, child.href);
                      return (
                        <Link
                          key={`${child.href}-${child.label}`}
                          href={child.href}
                          title={collapsed ? child.label : undefined}
                          className={`block rounded-md ${
                            collapsed ? "w-10 px-0 py-2 text-center" : "px-3 py-2"
                          } ${
                            active
                              ? "bg-orange-500/15 font-semibold text-orange-800 dark:bg-orange-500/20 dark:text-orange-200"
                              : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          }`}
                        >
                          {collapsed ? (
                            <span className="inline-flex w-full items-center justify-center">
                              <ChildIcon size={16} strokeWidth={2.2} />
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-2">
                              <ChildIcon size={16} strokeWidth={2.1} />
                              {child.label}
                            </span>
                          )}
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
                    ? "bg-orange-500/15 font-semibold text-orange-800 dark:bg-orange-500/20 dark:text-orange-200"
                    : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
