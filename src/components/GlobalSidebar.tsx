"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
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
  LogOut,
  Menu,
  PlusSquare,
  Ticket,
  UserCircle,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { navLinkActive } from "@/lib/nav-link-active";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SidebarOpsWidget } from "@/components/SidebarOpsWidget";
import { closeStaffMobileNav, subscribeStaffMobileNav } from "@/lib/staff-mobile-nav";
import { SESSION_PROFILE_IMAGE_ROUTE } from "@/lib/session-profile-image";
import { cn } from "@/lib/cn";

type NavChild = { href: string; label: string };
type NavItem =
  | { kind: "link"; href: string; label: string }
  | { kind: "group"; label: string; children: NavChild[] };

function linksForRole(role: string | undefined): NavItem[] {
  if (role === "SuperAdmin") {
    return [
      { kind: "link", href: "/", label: "Dashboard" },
      {
        kind: "group",
        label: "Operations",
        children: [
          { href: "/agent", label: "Requests" },
          { href: "/agent/tasks", label: "Tasks" },
        ],
      },
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
    ];
  }
  if (role === "Admin") {
    return [
      { kind: "link", href: "/", label: "Dashboard" },
      {
        kind: "group",
        label: "Operations",
        children: [
          { href: "/agent", label: "Requests" },
          { href: "/agent/tasks", label: "Tasks" },
        ],
      },
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
    ];
  }
  if (role === "Personnel") {
    return [
      { kind: "link", href: "/", label: "Dashboard" },
      {
        kind: "group",
        label: "Operations",
        children: [
          { href: "/agent", label: "Requests" },
          { href: "/agent/tasks", label: "Tasks" },
        ],
      },
      { kind: "group", label: "Reports", children: [{ href: "/insights", label: "Metrics & Reports" }] },
    ];
  }
  return [{ kind: "link", href: "/", label: "Home" }];
}

function iconForLink(label: string) {
  const key = label.toLowerCase();
  if (key === "dashboard") return LayoutDashboard;
  if (key.includes("my request")) return LayoutDashboard;
  if (key === "tickets") return Ticket;
  if (key === "tasks") return CheckSquare;
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
  if (key.includes("escalation") || key.includes("priority")) return LifeBuoy;
  if (key.includes("process")) return GitBranch;
  if (key.includes("submit")) return PlusSquare;
  if (key.includes("queue metrics")) return Gauge;
  if (key.includes("create request")) return PlusSquare;
  if (key.includes("requests")) return Ticket;
  return Home;
}

function navChildActive(pathname: string, _searchParams: URLSearchParams | null, child: NavChild): boolean {
  return navLinkActive(pathname, child.href);
}

function NavLinkRow({
  href,
  label,
  active,
  onNavigate,
  dense,
}: {
  href: string;
  label: string;
  active: boolean;
  onNavigate?: () => void;
  dense?: boolean;
}) {
  const Icon = iconForLink(label);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-xl transition",
        dense ? "px-2.5 py-1.5" : "px-3 py-2",
        active
          ? "bg-orange-500/15 text-orange-800 ring-1 ring-inset ring-orange-500/25 dark:bg-orange-500/15 dark:text-orange-200 dark:ring-orange-400/20"
          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100",
      )}
    >
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-lg",
          dense ? "size-7" : "size-8",
          active
            ? "bg-orange-600 text-white"
            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300",
        )}
      >
        <Icon size={dense ? 14 : 16} strokeWidth={2.1} />
      </span>
      <span className={cn("min-w-0 flex-1 truncate font-semibold", dense ? "text-xs" : "text-sm")}>{label}</span>
    </Link>
  );
}

function SidebarProfileFooter({
  variant,
  collapsed,
  roleLabel,
  userName,
  userEmail,
  avatarSrc,
  accountActive,
  onNavigate,
  className,
}: {
  variant: "mobile" | "desktop";
  collapsed?: boolean;
  roleLabel: string;
  userName: string;
  userEmail: string;
  avatarSrc: string | undefined;
  accountActive: boolean;
  onNavigate?: () => void;
  className?: string;
}) {
  const mobile = variant === "mobile";

  if (collapsed) {
    return (
      <div
        className={cn(
          "flex shrink-0 flex-col items-center gap-2 border-t border-zinc-200/80 px-2 py-3 dark:border-white/10",
          className,
        )}
      >
        <Link
          href="/admin/account"
          title={`${roleLabel} · ${userName}`}
          className={cn(
            "inline-flex size-10 items-center justify-center rounded-xl transition",
            accountActive
              ? "ring-2 ring-orange-500/40"
              : "hover:bg-zinc-200/70 dark:hover:bg-zinc-900",
          )}
        >
          <Avatar className="size-9 border border-orange-500/30 bg-gradient-to-br from-orange-600 to-orange-800 text-white">
            <AvatarImage src={avatarSrc} alt={userName} />
            <AvatarFallback className="bg-transparent">
              <UserRound className="size-4" aria-hidden />
            </AvatarFallback>
          </Avatar>
        </Link>
        <button
          type="button"
          title="Sign out"
          onClick={() => void signOut({ callbackUrl: "/" })}
          className="inline-flex size-9 items-center justify-center rounded-xl border border-zinc-300 text-zinc-600 transition hover:bg-white dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          <LogOut size={15} />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "shrink-0 border-t px-3 pt-2",
        mobile
          ? "border-white/10 pb-[max(1rem,env(safe-area-inset-bottom,0px))]"
          : "border-zinc-200/80 pb-2 dark:border-white/10",
        className,
      )}
    >
      <Link
        href="/admin/account"
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-3 rounded-xl px-2.5 py-2 transition",
          mobile
            ? accountActive
              ? "bg-orange-500/15 ring-1 ring-inset ring-orange-400/25"
              : "hover:bg-white/5"
            : accountActive
              ? "bg-orange-500/15 ring-1 ring-inset ring-orange-500/25"
              : "hover:bg-zinc-100 dark:hover:bg-zinc-900",
        )}
        title={userEmail}
      >
        <Avatar className="size-10 shrink-0 border border-orange-500/30 bg-gradient-to-br from-orange-600 to-orange-800 text-white shadow-sm">
          <AvatarImage src={avatarSrc} alt={userName} />
          <AvatarFallback className="bg-transparent">
            <UserRound className="size-4" aria-hidden />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate text-sm font-semibold",
              mobile ? "text-zinc-50" : "text-zinc-900 dark:text-zinc-100",
            )}
          >
            {roleLabel}
          </p>
          <p
            className={cn(
              "truncate text-[11px]",
              mobile ? "text-zinc-400" : "text-zinc-500 dark:text-zinc-400",
            )}
          >
            {userName}
          </p>
        </div>
        <UserCircle
          size={16}
          className={cn(mobile ? "text-zinc-500" : "text-zinc-400")}
          aria-hidden
        />
      </Link>
      <button
        type="button"
        onClick={() => {
          onNavigate?.();
          void signOut({ callbackUrl: "/" });
        }}
        className={cn(
          "mt-2 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition",
          mobile
            ? "bg-orange-600 text-white hover:bg-orange-500"
            : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800",
        )}
      >
        <LogOut size={15} />
        Sign out
      </button>
    </div>
  );
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
  const roleLabel = role === "SuperAdmin" ? "SuperAdmin" : role ?? "Staff";
  const userName = data?.user?.name ?? data?.user?.email ?? "Account";
  const userEmail = data?.user?.email ?? "";
  const avatarEmail = userEmail.trim().toLowerCase();
  const avatarSrc = data?.user
    ? data.user.image && /^https?:\/\//i.test(data.user.image)
      ? data.user.image
      : `${SESSION_PROFILE_IMAGE_ROUTE}?u=${encodeURIComponent(avatarEmail || data.user.id || "me")}`
    : undefined;
  const accountActive = navLinkActive(pathname, "/admin/account");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      const stored = window.localStorage.getItem("sidebar-collapsed");
      setCollapsed(stored === "1");
    });
  }, []);

  useEffect(() => {
    return subscribeStaffMobileNav((open) => {
      setMobileOpen(open);
    });
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    closeStaffMobileNav();
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  if (
    pathname === "/signin" ||
    pathname === "/signup" ||
    pathname === "/customer/signin" ||
    pathname === "/customer/signup"
  ) {
    return null;
  }

  const links = linksForRole(role);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  }

  function closeMobile() {
    setMobileOpen(false);
    closeStaffMobileNav();
  }

  return (
    <>
      {mobileOpen ? (
        <div className="fixed inset-0 z-[90] lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-zinc-950/60 backdrop-blur-[2px]"
            onClick={closeMobile}
            aria-label="Close navigation menu"
          />
          <aside
            className="absolute inset-y-0 left-0 flex w-[min(92vw,22rem)] max-w-[22rem] flex-col border-r border-zinc-800 bg-zinc-950 text-zinc-100 shadow-[20px_0_60px_rgba(0,0,0,0.45)]"
            role="dialog"
            aria-modal="true"
            aria-label="Main navigation"
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5 pt-[max(0.85rem,env(safe-area-inset-top,0px))]">
              <p className="text-sm font-bold tracking-wide text-zinc-100">Menu</p>
              <button
                type="button"
                onClick={closeMobile}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-200 transition hover:bg-white/10"
                aria-label="Close navigation menu"
              >
                <X size={16} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <nav className="space-y-5 px-3 py-4">
                {links.map((item) => {
                  if (item.kind === "link") {
                    return (
                      <div key={`m-${item.href}-${item.label}`}>
                        <NavLinkRow
                          href={item.href}
                          label={item.label}
                          active={navLinkActive(pathname, item.href)}
                          onNavigate={closeMobile}
                        />
                      </div>
                    );
                  }
                  return (
                    <div key={`m-group-${item.label}`} className="space-y-1.5">
                      <p className="px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                        {item.label}
                      </p>
                      <div className="space-y-1">
                        {item.children.map((child) => (
                          <NavLinkRow
                            key={`m-${child.href}-${child.label}`}
                            href={child.href}
                            label={child.label}
                            active={navChildActive(pathname, searchParams, child)}
                            onNavigate={closeMobile}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}

                <div className="space-y-1.5 border-t border-white/10 pt-4">
                  <p className="px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Quick</p>
                  <NavLinkRow
                    href="/process"
                    label="Process"
                    active={navLinkActive(pathname, "/process")}
                    onNavigate={closeMobile}
                  />
                </div>
              </nav>

              <SidebarOpsWidget compact />
            </div>

            <SidebarProfileFooter
              variant="mobile"
              roleLabel={roleLabel}
              userName={userName}
              userEmail={userEmail}
              avatarSrc={avatarSrc}
              accountActive={accountActive}
              onNavigate={closeMobile}
            />
          </aside>
        </div>
      ) : null}

      <aside
        className={cn(
          "hidden h-full min-h-0 shrink-0 flex-col self-stretch overflow-hidden border-r border-zinc-200 bg-zinc-50 transition-all duration-200 dark:border-zinc-800 dark:bg-zinc-950 lg:flex",
          collapsed ? "w-[4.5rem]" : "w-64",
        )}
      >
        <div
          className={cn(
            "flex h-12 shrink-0 items-center border-b border-zinc-200/80 px-2.5 dark:border-zinc-800",
            collapsed ? "justify-center" : "justify-between gap-2 px-3",
          )}
        >
          {!collapsed ? (
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Navigate
            </p>
          ) : null}
          <button
            type="button"
            onClick={toggleCollapsed}
            className="inline-flex size-8 items-center justify-center rounded-lg border border-zinc-300 text-zinc-600 transition hover:bg-white dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Menu size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <nav
            className={cn(
              "min-h-0 flex-1 overflow-hidden px-2 py-2 text-sm",
              collapsed && "flex flex-col items-center",
            )}
          >
            <div className={cn(collapsed ? "flex flex-col items-center gap-1.5" : "space-y-2.5")}>
              {links.map((item) => {
                if (item.kind === "group") {
                  if (collapsed) {
                    return (
                      <div key={`group-${item.label}`} className="flex w-full flex-col items-center gap-1">
                        {item.children.map((child) => {
                          const ChildIcon = iconForLink(child.label);
                          const active = navChildActive(pathname, searchParams, child);
                          return (
                            <Link
                              key={`${child.href}-${child.label}`}
                              href={child.href}
                              title={child.label}
                              className={cn(
                                "inline-flex size-9 items-center justify-center rounded-xl transition",
                                active
                                  ? "bg-orange-500/15 text-orange-700 dark:text-orange-300"
                                  : "text-zinc-500 hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100",
                              )}
                            >
                              <ChildIcon size={16} strokeWidth={2.2} />
                            </Link>
                          );
                        })}
                      </div>
                    );
                  }
                  return (
                    <div key={`group-${item.label}`} className="space-y-0.5">
                      <p className="px-2.5 text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-500">
                        {item.label}
                      </p>
                      <div className="space-y-0.5">
                        {item.children.map((child) => (
                          <NavLinkRow
                            key={`${child.href}-${child.label}`}
                            href={child.href}
                            label={child.label}
                            active={navChildActive(pathname, searchParams, child)}
                            dense
                          />
                        ))}
                      </div>
                    </div>
                  );
                }

                const active = navLinkActive(pathname, item.href);
                const Icon = iconForLink(item.label);
                if (collapsed) {
                  return (
                    <Link
                      key={`${item.href}-${item.label}`}
                      href={item.href}
                      title={item.label}
                      className={cn(
                        "inline-flex size-9 items-center justify-center rounded-xl transition",
                        active
                          ? "bg-orange-500/15 text-orange-700 dark:text-orange-300"
                          : "text-zinc-500 hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100",
                      )}
                    >
                      <Icon size={16} strokeWidth={2.2} />
                    </Link>
                  );
                }
                return (
                  <NavLinkRow
                    key={`${item.href}-${item.label}`}
                    href={item.href}
                    label={item.label}
                    active={active}
                    dense
                  />
                );
              })}
            </div>
          </nav>

          {!collapsed ? <SidebarOpsWidget /> : null}

          <SidebarProfileFooter
            variant="desktop"
            collapsed={collapsed}
            roleLabel={roleLabel}
            userName={userName}
            userEmail={userEmail}
            avatarSrc={avatarSrc}
            accountActive={accountActive}
          />
        </div>
      </aside>
    </>
  );
}
