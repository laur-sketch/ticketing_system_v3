import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

function isAllowed(role: string | undefined, allowed: string[]) {
  if (!role) return false;
  if (role === "SuperAdmin" && allowed.includes("Admin")) return true;
  return allowed.includes(role);
}

export async function proxy(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/agent")) {
    if (!token) {
      const signInUrl = new URL("/signin", req.url);
      signInUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(signInUrl);
    }
    if (!isAllowed(token.role as string | undefined, ["Admin", "Personnel"])) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  if (pathname.startsWith("/insights")) {
    if (!token) {
      const signInUrl = new URL("/signin", req.url);
      signInUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(signInUrl);
    }
    if (!isAllowed(token.role as string | undefined, ["Admin", "Personnel"])) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  if (pathname.startsWith("/admin") || pathname.startsWith("/reports")) {
    if (pathname.startsWith("/admin/manual-assignment")) {
      if (!token) {
        const signInUrl = new URL("/signin", req.url);
        signInUrl.searchParams.set("callbackUrl", pathname);
        return NextResponse.redirect(signInUrl);
      }
      if (!isAllowed(token.role as string | undefined, ["Admin", "Personnel"])) {
        return NextResponse.redirect(new URL("/", req.url));
      }
      return NextResponse.next();
    }
    if (pathname.startsWith("/admin/account")) {
      if (!token) {
        const signInUrl = new URL("/signin", req.url);
        signInUrl.searchParams.set("callbackUrl", pathname);
        return NextResponse.redirect(signInUrl);
      }
      if (!isAllowed(token.role as string | undefined, ["Admin", "Personnel", "Customer"])) {
        return NextResponse.redirect(new URL("/", req.url));
      }
      return NextResponse.next();
    }
    if (!token) {
      const signInUrl = new URL("/signin", req.url);
      signInUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(signInUrl);
    }
    if (!isAllowed(token.role as string | undefined, ["Admin"])) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  if (pathname.startsWith("/tickets/new") || pathname.startsWith("/tickets/")) {
    if (!token) {
      const signInUrl = new URL("/signin", req.url);
      signInUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(signInUrl);
    }
  }

  /** `/customer/signin` is a compatibility redirect to `/signin` (no session required). */
  const publicCustomerAuthPaths = ["/customer/signin", "/customer/signup"];
  if (pathname.startsWith("/customer/") && !publicCustomerAuthPaths.includes(pathname)) {
    if (!token) {
      const signInUrl = new URL("/signin", req.url);
      signInUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(signInUrl);
    }
    if (!isAllowed(token.role as string | undefined, ["Customer"])) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/agent/:path*",
    "/insights/:path*",
    "/admin/:path*",
    "/reports/:path*",
    "/tickets/new",
    "/tickets/:path*",
    "/my-tickets/:path*",
    "/customer/:path*",
  ],
};
