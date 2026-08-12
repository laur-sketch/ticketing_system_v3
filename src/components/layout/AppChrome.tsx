"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { GlobalSidebar } from "@/components/GlobalSidebar";
import { Nav } from "@/components/Nav";
import { RealtimeRefreshBeacon } from "@/components/RealtimeRefreshBeacon";
import { CustomerPortalShell } from "@/components/portal/CustomerPortalShell";
import { SessionLogoutSplash } from "@/components/SessionLogoutSplash";
import { RedirectLoadingIndicator } from "@/components/ui/redirect-loading-indicator";
import { isAuthRequiredPath, isSessionExpired } from "@/lib/session-expiry-client";

type Props = { children: React.ReactNode };

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

function StaffAppShell({ children }: { children: React.ReactNode }) {
  const isLg = useIsDesktopLg();
  useLockDocumentScroll(isLg);

  if (!isLg) {
    return (
      <div className="flex min-h-dvh flex-1 flex-col bg-zinc-50 text-foreground dark:bg-zinc-950">
        <RealtimeRefreshBeacon />
        <GlobalSidebar />
        <Suspense fallback={null}>
          <Nav />
        </Suspense>
        <div className="min-w-0 flex-1 overflow-x-hidden pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-0 flex overflow-hidden bg-zinc-50 text-foreground dark:bg-zinc-950">
      <RealtimeRefreshBeacon />
      <GlobalSidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950">
        <Suspense fallback={null}>
          <Nav />
        </Suspense>
        <div
          data-staff-main-scroll=""
          className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function AppChrome({ children }: Props) {
  const pathname = usePathname();
  const { data, status } = useSession();
  const role = data?.user?.role;

  if (
    pathname === "/signin" ||
    pathname === "/signup" ||
    pathname === "/customer/signin" ||
    pathname === "/customer/signup" ||
    pathname === "/process" ||
    pathname === "/travel-orders" ||
    pathname.startsWith("/travel-orders/")
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

  return <StaffAppShell>{children}</StaffAppShell>;
}
