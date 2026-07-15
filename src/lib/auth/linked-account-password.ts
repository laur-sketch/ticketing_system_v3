import bcrypt from "bcryptjs";
import {
  findMergedUserByEmail,
  normalizeBcryptHash,
  verifyMergedPassword,
} from "@/lib/auth/merged-credentials";
import { useMergedCredentials } from "@/lib/auth/credentials-source";
import { isOAuthOnlyPortal, verifyPortalPassword } from "@/lib/auth/portal-password";
import { prismaPrimary, prismaSecondary } from "@/lib/prisma";

type PortalAuthRow = {
  id: string;
  email: string;
  passwordHash: string | null;
  mergedSourceUserId: bigint | null;
};

/**
 * Verify the caller's password against the configured credential SoT.
 * When merged is SoT and the portal is HRIS-linked, portal.passwordHash is ignored.
 */
export async function verifyLinkedAccountPassword(
  portal: PortalAuthRow,
  password: string,
): Promise<{ ok: true } | { ok: false; reason: "INVALID" | "PASSWORD_REQUIRED" | "OAUTH_ONLY" }> {
  if (useMergedCredentials() && portal.mergedSourceUserId != null) {
    const rows = await prismaSecondary.$queryRaw<Array<{ password_hash: string | null }>>`
      SELECT password_hash FROM merged_users
      WHERE source_user_id = ${portal.mergedSourceUserId} AND is_active = 1
      LIMIT 1
    `;
    const hash = rows[0]?.password_hash;
    if (!hash) {
      // Linked but no merged password — try portal email match on merged_users
      const byEmail = await findMergedUserByEmail(portal.email);
      if (!byEmail?.passwordHash) return { ok: false, reason: "OAUTH_ONLY" };
      const ok = await verifyMergedPassword(byEmail.passwordHash, password);
      return ok ? { ok: true } : { ok: false, reason: "INVALID" };
    }
    const ok = await verifyMergedPassword(hash, password);
    return ok ? { ok: true } : { ok: false, reason: "INVALID" };
  }

  const portalCheck = await verifyPortalPassword(portal.passwordHash, password);
  if (portalCheck.ok && portalCheck.oauthOnly) return { ok: false, reason: "OAUTH_ONLY" };
  if (!portalCheck.ok) {
    return { ok: false, reason: portalCheck.reason === "PASSWORD_REQUIRED" ? "PASSWORD_REQUIRED" : "INVALID" };
  }
  return { ok: true };
}

/** Persist a new password hash to the credential SoT (merged_users and/or portal). */
export async function setLinkedAccountPassword(
  portal: PortalAuthRow,
  plaintext: string,
): Promise<void> {
  const nextHash = await bcrypt.hash(plaintext, 12);
  const laravelHash = nextHash.startsWith("$2a$")
    ? `$2y$${nextHash.slice(4)}`
    : nextHash;

  if (useMergedCredentials() && portal.mergedSourceUserId != null) {
    await prismaSecondary.$executeRaw`
      UPDATE merged_users
      SET password_hash = ${laravelHash}, updated_at = CURRENT_TIMESTAMP
      WHERE source_user_id = ${portal.mergedSourceUserId}
    `;
    // Keep portal hash cleared so dual-credential conflicts cannot return.
    await prismaPrimary.portalAccount.update({
      where: { id: portal.id },
      data: { passwordHash: null },
    });
    return;
  }

  await prismaPrimary.portalAccount.update({
    where: { id: portal.id },
    data: { passwordHash: nextHash },
  });
}

export { isOAuthOnlyPortal, normalizeBcryptHash };
