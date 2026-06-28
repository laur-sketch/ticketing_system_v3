"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  isAuthRequiredPath,
  isSessionExpired,
  logoutExpiredSession,
  redirectToSignIn,
  sessionExpiresAtMs,
} from "@/lib/session-expiry-client";

/** Signs the user out when the fixed 30-minute session lifetime ends. */
export function SessionExpiryGuard() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const loggingOutRef = useRef(false);

  function logoutOnce() {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    logoutExpiredSession();
  }

  useLayoutEffect(() => {
    if (loggingOutRef.current || status === "loading") return;

    if (session && isSessionExpired(session)) {
      logoutOnce();
      return;
    }

    if (status === "unauthenticated" && isAuthRequiredPath(pathname)) {
      const search = searchParams.toString() ? `?${searchParams.toString()}` : "";
      redirectToSignIn(pathname, search);
    }
  }, [pathname, searchParams, session, status]);

  useEffect(() => {
    if (status !== "authenticated" || !session || loggingOutRef.current) return;

    const expiresAtMs = sessionExpiresAtMs(session);
    if (!expiresAtMs) return;

    const delay = expiresAtMs - Date.now();
    if (delay <= 0) {
      logoutOnce();
      return;
    }

    const timer = window.setTimeout(logoutOnce, delay);
    return () => window.clearTimeout(timer);
  }, [session, status]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible" || status !== "authenticated" || !session) return;
      if (isSessionExpired(session)) logoutOnce();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [session, status]);

  return null;
}
