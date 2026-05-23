import "@/lib/auth-env";
import type { NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import bcrypt from "bcryptjs";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import {
  findPortalByEmailOnly,
  findPortalByLogin,
  upsertPortalOAuthAccount,
} from "@/lib/portal-account";
import { normalizePortalRole } from "@/lib/staff-role";

export type UserRole = "SuperAdmin" | "Admin" | "Personnel" | "Customer";

function normalizeRole(role: string | undefined | null): UserRole | null {
  if (!role) return null;
  const v = role.trim().toLowerCase();
  if (v === "superadmin" || v === "super_admin" || v === "super-admin") return "SuperAdmin";
  if (v === "admin") return "Admin";
  if (v === "agent") return "Personnel";
  /** Legacy JWT / stored session values */
  if (v === "head") return "Admin";
  const portal = normalizePortalRole(role);
  if (portal === "Admin") return "Admin";
  if (portal === "Personnel") return "Personnel";
  if (portal === "Customer") return "Customer";
  return null;
}

function roleFromEmail(email: string | undefined | null): UserRole {
  const lower = (email ?? "").toLowerCase();
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const agents = (process.env.AGENT_EMAILS ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  if (admins.includes(lower)) return "SuperAdmin";
  if (agents.includes(lower)) return "Personnel";
  return "Customer";
}

function elevateRoleByEmail(email: string | undefined | null, base: UserRole): UserRole {
  if (roleFromEmail(email) === "SuperAdmin") return "SuperAdmin";
  return base;
}

function extractRoleFromProfile(
  profile: { [key: string]: unknown } | undefined,
): UserRole | null {
  if (!profile) return null;
  const role = normalizeRole(
    typeof profile.role === "string" ? profile.role : null,
  );
  if (role) return role;

  if (Array.isArray(profile.roles)) {
    for (const r of profile.roles) {
      if (typeof r === "string") {
        const mapped = normalizeRole(r);
        if (mapped) return mapped;
      }
    }
  }

  if (Array.isArray(profile.groups)) {
    for (const g of profile.groups) {
      if (typeof g === "string") {
        const mapped = normalizeRole(g);
        if (mapped) return mapped;
      }
    }
  }

  return null;
}

function roleFromJwt(token: JWT): UserRole {
  return normalizeRole(typeof token.role === "string" ? token.role : null) ?? "Customer";
}

const googleReady = !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  logger: {
    error(code, metadata) {
      if (code === "JWT_SESSION_ERROR") {
        return;
      }
      console.error(code, metadata);
    },
  },
  providers: [
    ...(googleReady
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),
    CredentialsProvider({
      name: "Local login",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const loginId = credentials?.username?.toString().trim() ?? "";
        if (!loginId) return null;
        const password = credentials?.password?.toString() ?? "";

        try {
          const portal = await findPortalByLogin(loginId);
          if (portal) {
            const match = await bcrypt.compare(password, portal.passwordHash);
            if (!match) return null;
            const baseRole = normalizeRole(portal.role) ?? "Customer";
            /**
             * Customer accounts created via self-signup are allowed to sign in
             * with username/password. Google sign-in continues to work in
             * parallel for the same account (email match).
             */
            const role = elevateRoleByEmail(portal.email, baseRole);
            return {
              id: portal.id,
              email: portal.email,
              name: portal.name,
              role,
              staffRoleLabel: normalizePortalRole(portal.role),
              companyId: portal.companyId,
              companyName: portal.companyName,
              customerOrgRole: portal.customerOrgRole,
            };
          }
        } catch (e) {
          console.error("Portal lookup failed", e);
        }

        /**
         * Allow env-listed admin/agent emails to authenticate without a
         * portal record (rescue path); everyone else must have a portal account.
         */
        if (loginId.includes("@")) {
          const emailRole = roleFromEmail(loginId);
          if (emailRole === "SuperAdmin" || emailRole === "Personnel") {
            return {
              id: loginId,
              email: loginId.toLowerCase(),
              name: loginId.split("@")[0] || "User",
              role: emailRole,
            };
          }
        }
        return null;
      },
    }),
  ],
  callbacks: {
    /**
     * Same rules as NextAuth default (`new URL(url).origin === baseUrl`), plus reject
     * `//host` paths that start with "/" but are not same-site relative URLs.
     */
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/") && !url.startsWith("//")) return `${baseUrl}${url}`;
      try {
        if (new URL(url).origin === baseUrl) return url;
      } catch {
        /* ignore */
      }
      return baseUrl;
    },
    async signIn({ user, account }) {
      if (!account || account.provider === "credentials") return true;
      const email = (user.email ?? "").trim().toLowerCase();
      if (!email) return true;
      try {
        const portal = await findPortalByEmailOnly(email);
        await upsertPortalOAuthAccount({
          email,
          name: user.name ?? portal?.name ?? email.split("@")[0] ?? "User",
          role: portal?.role ?? normalizeRole(String(user.role ?? "")) ?? "Customer",
        });
      } catch (e) {
        console.error("upsertPortalOAuthAccount failed", e);
      }
      return true;
    },
    async jwt({ token, profile, user, account }) {
      if (account?.provider) {
        token.authProvider = account.provider;
      }
      if (profile) {
        token.role =
          extractRoleFromProfile(profile as { [key: string]: unknown }) ??
          roleFromEmail(token.email);
      }
      if (user && "role" in user) {
        token.role = normalizeRole(String(user.role)) ?? token.role;
      }
      if (user) {
        const u = user as {
          companyId?: string | null;
          companyName?: string | null;
          customerOrgRole?: string | null;
          staffRoleLabel?: string | null;
        };
        if (u.companyId !== undefined) token.companyId = u.companyId;
        if (u.companyName !== undefined) token.companyName = u.companyName;
        if (u.customerOrgRole !== undefined) token.customerOrgRole = u.customerOrgRole;
        if (u.staffRoleLabel !== undefined) token.staffRoleLabel = u.staffRoleLabel;
      }
      if (typeof token.role === "string") {
        token.role = elevateRoleByEmail(token.email, normalizeRole(token.role) ?? "Customer");
      }
      if (!token.role) token.role = roleFromEmail(token.email);
      /**
       * Always reconcile the JWT with the portal record (when an email is known) so
       * stale Customer roles or missing company metadata self-heal on the next refresh.
       */
      if (typeof token.email === "string" && token.email.length > 0) {
        const portal = await findPortalByEmailOnly(token.email);
        if (portal) {
          token.companyId = portal.companyId;
          token.companyName = portal.companyName;
          token.customerOrgRole = portal.customerOrgRole;
          token.staffRoleLabel = normalizePortalRole(portal.role);
          token.role = elevateRoleByEmail(
            portal.email,
            normalizeRole(portal.role) ?? (normalizeRole(String(token.role ?? "")) ?? "Customer"),
          );
        } else if (token.companyId === undefined) {
          token.companyId = null;
          token.companyName = null;
          token.customerOrgRole = null;
          token.staffRoleLabel = null;
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.role = roleFromJwt(token);
      if (!session.user.email && typeof token.email === "string") {
        session.user.email = token.email;
      }
      if (typeof token.authProvider === "string") {
        session.user.authProvider = token.authProvider;
      } else {
        session.user.authProvider = null;
      }
      session.user.companyId = typeof token.companyId === "string" ? token.companyId : null;
      session.user.companyName = typeof token.companyName === "string" ? token.companyName : null;
      session.user.customerOrgRole =
        typeof token.customerOrgRole === "string" ? token.customerOrgRole : null;
      session.user.staffRoleLabel =
        typeof token.staffRoleLabel === "string" ? token.staffRoleLabel : null;
      return session;
    },
  },
  pages: {
    signIn: "/signin",
  },
};
