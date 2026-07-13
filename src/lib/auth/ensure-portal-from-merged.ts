import {
  canonicalProfileFromMerged,
  syncPortalProfile,
} from "@/lib/auth/sync-portal-profile";
import type { MergedAuthUser } from "@/lib/auth/merged-credentials";
import { fallbackEmailFromUsername } from "@/lib/auth/canonical-user-profile";
import { prismaPrimary } from "@/lib/prisma";

/** @deprecated use fallbackEmailFromUsername from canonical-user-profile */
export function mergedPortalEmail(merged: Pick<MergedAuthUser, "email" | "username">): string {
  const email = merged.email?.trim().toLowerCase();
  if (email) return email;
  return fallbackEmailFromUsername(merged.username);
}

/**
 * After merged DB auth, ensure Auth DB + Primary portal_accounts rows exist for JWT/session.
 */
export async function ensurePortalFromMergedUser(merged: MergedAuthUser) {
  const profile = canonicalProfileFromMerged({
    sourceUserId: merged.sourceUserId,
    username: merged.username,
    name: merged.name,
    email: merged.email,
    role: merged.role,
    companyName: merged.companyName,
  });

  await syncPortalProfile(profile, "hris");

  const include = {
    company: { select: { name: true } },
    staffDesignatedCompany: { select: { name: true } },
  } as const;

  const byEmail = await prismaPrimary.portalAccount.findUnique({
    where: { email: profile.email },
    include,
  });
  if (byEmail) return byEmail;

  const username = merged.username?.trim();
  if (username) {
    const byUsername = await prismaPrimary.portalAccount.findFirst({
      where: { username: { equals: username, mode: "insensitive" } },
      include,
    });
    if (byUsername) return byUsername;
  }

  throw new Error(`No portal account after HRIS sync for ${username ?? profile.email}`);
}
