import type { OAuthProfileInput } from "@/lib/auth/sync-oauth-user.types";
import {
  canonicalProfileFromOAuth,
  syncPortalProfile,
} from "@/lib/auth/sync-portal-profile";
import { findPortalByEmailOnly } from "@/lib/portal-account";
import { prismaAuth, prismaPrimary } from "@/lib/prisma";
import { normalizePortalRole } from "@/lib/staff-role";

export type { OAuthProfileInput };

/**
 * On OAuth sign-in: upsert Auth DB user + Account, sync Primary PortalAccount profile.
 */
export async function syncOAuthUser(input: OAuthProfileInput) {
  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error("OAuth profile missing email");

  const existingPortal = await findPortalByEmailOnly(email);
  const roleHint = normalizePortalRole(input.roleHint ?? existingPortal?.role ?? "Customer");

  const profile = canonicalProfileFromOAuth({
    email,
    name: input.name,
    image: input.image,
    provider: input.provider,
    providerAccountId: input.providerAccountId,
    roleHint,
  });

  const result = await syncPortalProfile(profile, "oauth");

  const authUser = await prismaAuth.user.findUniqueOrThrow({ where: { id: result.authUserId } });
  const portal = await prismaPrimary.portalAccount.findUniqueOrThrow({
    where: { id: result.portalAccountId },
    select: { id: true, email: true, name: true, role: true },
  });

  return { authUser, portal };
}
