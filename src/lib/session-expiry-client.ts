"use client";

import type { Session } from "next-auth";
import { signOut } from "next-auth/react";
import { isJwtSessionExpired, sanitizeCallbackUrl } from "@/lib/session-expiry";

export { isAuthRequiredPath } from "@/lib/session-expiry";

/** Where users land after an automatic session timeout logout. */
export const SESSION_TIMEOUT_SIGNIN_URL = "/signin?reason=session-expired";
export const SESSION_MIDNIGHT_SIGNIN_URL = "/signin?reason=session-expired-midnight";

export function isSessionExpired(session: Session | null | undefined): boolean {
  if (!session) return false;
  return isJwtSessionExpired({
    error: session.error,
    sessionExpiresAt: session.sessionExpiresAt,
    exp: session.expires ? Math.floor(new Date(session.expires).getTime() / 1000) : undefined,
  });
}

export function sessionExpiresAtMs(session: Session | null | undefined): number | null {
  if (!session) return null;
  if (typeof session.sessionExpiresAt === "number") return session.sessionExpiresAt * 1000;
  if (session.expires) {
    const ms = new Date(session.expires).getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/** Clear the session and send the user to sign-in (standard NextAuth logout). */
export function logoutExpiredSession(reason: "idle" | "midnight" = "idle") {
  void signOut({
    callbackUrl: reason === "midnight" ? SESSION_MIDNIGHT_SIGNIN_URL : SESSION_TIMEOUT_SIGNIN_URL,
  });
}

/** Unauthenticated visit to a protected route — sign-in with a safe return path. */
export function redirectToSignIn(pathname?: string, search = "") {
  const returnPath =
    pathname && pathname.length > 0
      ? sanitizeCallbackUrl(`${pathname}${search}`)
      : "/";
  if (returnPath === "/") {
    window.location.replace("/signin");
    return;
  }
  window.location.replace(`/signin?callbackUrl=${encodeURIComponent(returnPath)}`);
}
