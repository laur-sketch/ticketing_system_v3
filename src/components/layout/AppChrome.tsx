"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { GlobalSearchProvider } from "@/components/global-search/GlobalSearchProvider";
import { BreadcrumbProvider } from "@/components/navigation/BreadcrumbProvider";
import { StaffBreadcrumbs } from "@/components/navigation/StaffBreadcrumbs";
import { GlobalSidebar } from "@/components/GlobalSidebar";
import { Nav } from "@/components/Nav";
import { RealtimeRefreshBeacon } from "@/components/RealtimeRefreshBeacon";
import { CustomerPortalShell } from "@/components/portal/CustomerPortalShell";
import { SessionLogoutSplash } from "@/components/SessionLogoutSplash";
import { RedirectLoadingIndicator } from "@/components/ui/redirect-loading-indicator";
import { isAuthRequiredPath, isSessionExpired } from "@/lib/session-expiry-client";

type Props = { children: React.ReactNode; initialRole?: string };

function useIsDesktopLg() {
  const [isLg, setIsLg] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsLg(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return isLg;
}

/** Locks document scroll so only the main pane scrolls; desktop staff chrome only. */
function useLockDocumentScroll(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyHeight = body.style.height;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.height = "100%";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.height = prevBodyHeight;
    };
  }, [active]);
}

function StaffMainChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <Suspense fallback={null}>
        <Nav />
      </Suspense>
      <StaffBreadcrumbs />
      <div
        data-staff-main-scroll=""
        className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom,0px)]"
      >
        {children}
      </div>
    </div>
  );
}

function StaffAppShell({
  children,
  initialRole,
}: {
  children: React.ReactNode;
  initialRole?: string;
}) {
  const isLg = useIsDesktopLg();
  useLockDocumentScroll(isLg);

  if (!isLg) {
    return (
      <GlobalSearchProvider>
        <BreadcrumbProvider>
          <div className="flex min-h-dvh flex-1 flex-col bg-background text-foreground">
            <RealtimeRefreshBeacon />
            <GlobalSidebar initialRole={initialRole} />
            <StaffMainChrome>{children}</StaffMainChrome>
          </div>
        </BreadcrumbProvider>
      </GlobalSearchProvider>
    );
  }

  return (
    <GlobalSearchProvider>
      <BreadcrumbProvider>
        <div className="fixed inset-0 z-0 flex overflow-hidden bg-background text-foreground">
          <RealtimeRefreshBeacon />
          <GlobalSidebar initialRole={initialRole} />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
            <StaffMainChrome>{children}</StaffMainChrome>
          </div>
        </div>
      </BreadcrumbProvider>
    </GlobalSearchProvider>
  );
}

export function AppChrome({ children, initialRole }: Props) {
  const pathname = usePathname();
  const { data, status } = useSession();
  const role = data?.user?.role;

  if (
    pathname === "/signin" ||
    pathname === "/signup" ||
    pathname === "/customer/signin" ||
    pathname === "/customer/signup"
  ) {
    return <>{children}</>;
  }

  if (status === "unauthenticated" && pathname === "/") {
    return (
      <div className="min-h-screen flex-1 bg-background text-foreground">{children}</div>
    );
  }

  if (isSessionExpired(data)) {
    return <SessionLogoutSplash reason="midnight" />;
  }

  if (status === "unauthenticated" && isAuthRequiredPath(pathname)) {
    return <SessionLogoutSplash message="Sign in required…" logout={false} />;
  }

  if (status === "loading" && !data) {
    return (
      <div className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-4 bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <RedirectLoadingIndicator
          fallback={
            <div
              className="h-11 w-11 animate-spin rounded-full border-2 border-brand/30 border-t-brand"
              aria-hidden
            />
          }
        />
        <div className="max-w-sm text-center">
          <p className="text-sm font-medium text-foreground">Loading workspace</p>
          <p className="mt-1 text-xs text-muted">Preparing navigation and your session…</p>
        </div>
      </div>
    );
  }

  if (role === "Customer") {
    return <CustomerPortalShell>{children}</CustomerPortalShell>;
  }

  return <StaffAppShell initialRole={initialRole}>{children}</StaffAppShell>;
}
