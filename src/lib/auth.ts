import "@/lib/auth-env";
import type { NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { findPortalByEmailOnly, findPortalByLogin } from "@/lib/portal-account";
import {
  findMergedUserByLogin,
  verifyMergedPassword,
} from "@/lib/auth/merged-credentials";
import { useMergedCredentials } from "@/lib/auth/credentials-source";
import { ensurePortalFromMergedUser } from "@/lib/auth/ensure-portal-from-merged";
import { normalizePortalRole } from "@/lib/staff-role";
import { applyOAuthSignupIntent, readOAuthSignupIntentFromCookies, clearOAuthSignupIntentCookie } from "@/lib/auth/oauth-signup-intent";
import { syncOAuthUser } from "@/lib/auth/sync-oauth-user";
import { findMergedUserByEmail } from "@/lib/auth/merged-credentials";
import { compactSessionPicture } from "@/lib/session-profile-image";
import { sanitizeCallbackUrl } from "@/lib/session-expiry";
import {
  SESSION_JWT_MAX_AGE_SECONDS,
  computeSessionExpiresAt,
} from "@/lib/session-expiry-policy";

export type UserRole = "SuperAdmin" | "Admin" | "Personnel" | "Customer";

function normalizeRole(role: string | undefined | null): UserRole | null {
  if (!role) return null;
  const v = role.trim().toLowerCase();
  if (v === "superadmin" || v === "super_admin" || v === "super-admin") return "SuperAdmin";
  if (v === "admin") return "Admin";
  if (v === "agent") return "Personnel";
  if (v === "head") return "Admin";
  const portal = normalizePortalRole(role);
  if (portal === "SuperAdmin") return "SuperAdmin";
  if (portal === "Admin") return "Admin";
  if (portal === "Personnel") return "Personnel";
  if (portal === "Customer") return "Customer";
  return null;
}

function roleFromJwt(token: JWT): UserRole | null {
  return normalizeRole(typeof token.role === "string" ? token.role : null);
}

function resolvePortalJwtRole(
  email: string,
  portalRoleRaw: string,
  priorRole: UserRole | null,
): UserRole {
  const portalRole = normalizeRole(portalRoleRaw);
  return elevateRoleByEmail(email, portalRole ?? priorRole ?? roleFromEmail(email));
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

const googleReady = !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

if (!googleReady) {
  console.warn(
    "[auth] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — OAuth sign-in disabled.",
  );
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: SESSION_JWT_MAX_AGE_SECONDS,
    updateAge: 60,
  },
  jwt: {
    maxAge: SESSION_JWT_MAX_AGE_SECONDS,
  },
  logger: {
    error(code, metadata) {
      if (code === "JWT_SESSION_ERROR") {
        return;
      }
      console.error(code, metadata);
    },
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const loginId = credentials?.username?.trim() ?? "";
        const password = credentials?.password ?? "";
        if (!loginId || !password) return null;

        const sessionFromPortal = (portal: {
          id: string;
          email: string;
          name: string;
          role: string;
          companyId: string | null;
          companyName: string | null;
          customerOrgRole: string | null;
        }) => ({
          id: portal.id,
          email: portal.email,
          name: portal.name,
          role: normalizeRole(portal.role) ?? "Customer",
          companyId: portal.companyId,
          companyName: portal.companyName,
          customerOrgRole: portal.customerOrgRole,
          staffRoleLabel: normalizePortalRole(portal.role),
        });

        // Default SoT: merged_users (avoids portal ↔ HRIS password conflicts).
        // Portal password login only when PORTAL_CREDENTIALS_SOURCE=portal, or as
        // a last resort for customer accounts with no merged_users row.
        if (useMergedCredentials()) {
          const merged = await findMergedUserByLogin(loginId);
          if (merged?.passwordHash) {
            const mergedOk = await verifyMergedPassword(merged.passwordHash, password);
            if (!mergedOk) return null;
            try {
              const portal = await ensurePortalFromMergedUser(merged);
              return sessionFromPortal({
                id: portal.id,
                email: portal.email,
                name: portal.name,
                role: portal.role,
                companyId: portal.companyId,
                companyName: portal.company?.name ?? null,
                customerOrgRole: portal.customerOrgRole,
              });
            } catch (e) {
              console.error("ensurePortalFromMergedUser failed", e);
              return null;
            }
          }

          // Pure customer / portal-only accounts (no merged_users credential).
          const portalOnly = await findPortalByLogin(loginId);
          if (
            portalOnly?.passwordHash &&
            portalOnly.accountStatus !== "LEGACY_CONFLICT" &&
            !(await findMergedUserByLogin(portalOnly.email))
          ) {
            const portalOk = await bcrypt.compare(password, portalOnly.passwordHash);
            if (!portalOk) return null;
            return sessionFromPortal(portalOnly);
          }

          return null;
        }

        // Legacy mode: portal_accounts.password_hash first, then merged_users.
        const portalFirst = await findPortalByLogin(loginId);
        if (
          portalFirst?.passwordHash &&
          portalFirst.accountStatus !== "LEGACY_CONFLICT"
        ) {
          const portalOk = await bcrypt.compare(password, portalFirst.passwordHash);
          if (!portalOk) return null;
          return sessionFromPortal(portalFirst);
        }

        const merged = await findMergedUserByLogin(loginId);
        if (merged?.passwordHash) {
          const mergedOk = await verifyMergedPassword(merged.passwordHash, password);
          if (mergedOk) {
            try {
              const portal = await ensurePortalFromMergedUser(merged);
              return sessionFromPortal({
                id: portal.id,
                email: portal.email,
                name: portal.name,
                role: portal.role,
                companyId: portal.companyId,
                companyName: portal.company?.name ?? null,
                customerOrgRole: portal.customerOrgRole,
              });
            } catch (e) {
              console.error("ensurePortalFromMergedUser failed", e);
              return null;
            }
          }
        }

        return null;
      },
    }),
    ...(googleReady
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),
  ],
  callbacks: {
    async redirect({ url, baseUrl }) {
      let path = url;
      if (url.startsWith("/") && !url.startsWith("//")) {
        path = url;
      } else {
        try {
          if (new URL(url).origin === baseUrl) path = `${new URL(url).pathname}${new URL(url).search}${new URL(url).hash}`;
          else return baseUrl;
        } catch {
          return baseUrl;
        }
      }
      const safe = sanitizeCallbackUrl(path);
      return `${baseUrl}${safe}`;
    },
    async signIn({ user, account }) {
      if (!account) return false;
      if (account.provider === "credentials") return true;
      if (account.provider !== "google") return false;
      const email = (user.email ?? "").trim().toLowerCase();
      if (!email) return false;
      if (!account.providerAccountId) return false;
      try {
        const signupIntent = await readOAuthSignupIntentFromCookies();
        if (signupIntent && signupIntent.email.trim().toLowerCase() !== email) {
          await clearOAuthSignupIntentCookie();
          return "/signup?error=email_mismatch";
        }

        const portal = await findPortalByEmailOnly(email);
        const { portal: synced } = await syncOAuthUser({
          email,
          name: user.name,
          image: typeof user.image === "string" ? user.image : null,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          roleHint: portal?.role ?? null,
        });
        const mergedByEmail = await findMergedUserByEmail(email);
        if (mergedByEmail) {
          await ensurePortalFromMergedUser(mergedByEmail);
        }
        await applyOAuthSignupIntent(email, synced.id);
      } catch (e) {
        console.error("syncOAuthUser failed", e);
        return false;
      }
      return true;
    },
    async jwt({ token, profile, user, account }) {
      const now = Math.floor(Date.now() / 1000);
      const isNewLogin = Boolean(user);

      if (token.error === "SessionExpired") {
        return token;
      }

      if (
        !user &&
        !token.error &&
        typeof token.email !== "string" &&
        !roleFromJwt(token)
      ) {
        return { ...token, error: "SessionExpired", exp: now - 1 };
      }

      if (isNewLogin) {
        delete token.error;
      }

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
        const normalized = normalizeRole(token.role);
        if (normalized) {
          token.role = elevateRoleByEmail(token.email, normalized);
        }
      }
      if (!token.role) token.role = roleFromEmail(token.email);

      if (typeof token.email === "string" && token.email.length > 0) {
        const priorRole = roleFromJwt(token);
        const portal = await findPortalByEmailOnly(token.email);
        if (portal) {
          token.sub = portal.id;
          token.name = portal.name;
          token.picture =
            compactSessionPicture(portal.profileImage) ??
            compactSessionPicture(typeof token.picture === "string" ? token.picture : undefined);
          token.companyId = portal.companyId;
          token.companyName = portal.companyName;
          token.customerOrgRole = portal.customerOrgRole;
          token.staffRoleLabel = normalizePortalRole(portal.role);
          token.role = resolvePortalJwtRole(portal.email, portal.role, priorRole);
          token.username = portal.username;
          if (!portal.username) {
            token.needsUsername = true;
          } else {
            delete token.needsUsername;
          }
        } else if (token.companyId === undefined) {
          token.companyId = null;
          token.companyName = null;
          token.customerOrgRole = null;
          token.staffRoleLabel = null;
        }
      }
      if (typeof token.picture === "string") {
        const compact = compactSessionPicture(token.picture);
        if (compact) token.picture = compact;
        else delete token.picture;
      }

      const finalRole =
        roleFromJwt(token) ?? roleFromEmail(typeof token.email === "string" ? token.email : null);
      const expiresAt = computeSessionExpiresAt({
        role: finalRole,
        nowUnixSeconds: now,
        existingSessionExpiresAt:
          typeof token.sessionExpiresAt === "number" ? token.sessionExpiresAt : undefined,
        isNewLogin,
      });
      if (now >= expiresAt) {
        return { ...token, error: "SessionExpired", exp: now - 1 };
      }
      token.sessionExpiresAt = expiresAt;
      token.exp = expiresAt;

      return token;
    },
    async session({ session, token }) {
      if (token.error === "SessionExpired") {
        session.error = "SessionExpired";
        return session;
      }

      if (typeof token.sessionExpiresAt === "number") {
        session.sessionExpiresAt = token.sessionExpiresAt;
        session.expires = new Date(token.sessionExpiresAt * 1000).toISOString();
      }

      const role = roleFromJwt(token) ?? roleFromEmail(typeof token.email === "string" ? token.email : null);
      session.user.role = role;
      if (!session.user.email && typeof token.email === "string") {
        session.user.email = token.email;
      }
      if (typeof token.sub === "string") {
        session.user.id = token.sub;
      }
      if (typeof token.name === "string") {
        session.user.name = token.name;
      }
      if (typeof token.picture === "string") {
        session.user.image = token.picture;
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
      session.user.username =
        typeof token.username === "string" ? token.username : null;
      session.needsUsername = token.needsUsername === true;
      return session;
    },
  },
  pages: {
    signIn: "/signin",
  },
};
