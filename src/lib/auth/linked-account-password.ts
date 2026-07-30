import bcrypt from "bcryptjs";
import {
  findMergedUserByEmail,
  normalizeBcryptHash,
  toLaravelBcryptHash,
  verifyMergedUserPassword,
} from "@/lib/auth/merged-credentials";
import { useMergedCredentials } from "@/lib/auth/credentials-source";
import { isOAuthOnlyPortal, verifyPortalPassword } from "@/lib/auth/portal-password";
import { prismaPrimary, prismaSecondary } from "@/lib/prisma";
import { withSecondaryWriteClient } from "@/lib/prisma-secondary-write";
import { resolveHrisSourceTags } from "@/lib/merged-database-sources";


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
    const rows = await prismaSecondary.$queryRaw<
      Array<{ password_hash: string | null; source_database: string }>
    >`
      SELECT password_hash, source_database FROM merged_users
      WHERE source_user_id = ${portal.mergedSourceUserId} AND is_active = 1
      LIMIT 1
    `;
    const row = rows[0];
    if (!row?.password_hash) {
      const byEmail = await findMergedUserByEmail(portal.email);
      if (!byEmail?.passwordHash) return { ok: false, reason: "OAUTH_ONLY" };
      const ok = await verifyMergedUserPassword(byEmail, password);
      return ok ? { ok: true } : { ok: false, reason: "INVALID" };
    }
    const ok = await verifyMergedUserPassword(
      {
        sourceUserId: portal.mergedSourceUserId,
        sourceDatabase: row.source_database,
        employeeCode: null,
        username: null,
        passwordHash: row.password_hash,
        name: "",
        email: portal.email,
        role: "",
        companyName: null,
        isActive: true,
      },
      password,
    );
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
  const laravelHash = toLaravelBcryptHash(nextHash);

  if (useMergedCredentials() && portal.mergedSourceUserId != null) {
    await withSecondaryWriteClient(async (db) => {
      await db.$executeRaw`
        UPDATE merged_users
        SET password_hash = ${laravelHash}, updated_at = CURRENT_TIMESTAMP
        WHERE source_user_id = ${portal.mergedSourceUserId}
      `;

      // Keep live HRIS in sync so login (which prefers hris.users.password) accepts
      // the password the user just set in the portal.
      const hrisTags = resolveHrisSourceTags();
      const tagged = await db.$queryRaw<Array<{ source_database: string }>>`
        SELECT source_database FROM merged_users
        WHERE source_user_id = ${portal.mergedSourceUserId}
        LIMIT 1
      `;
      if (tagged[0] && hrisTags.includes(tagged[0].source_database)) {
        const liveDb = process.env.HRIS_LIVE_SOURCE_DB?.trim() || "hris-dev";
        if (/^[A-Za-z0-9_-]+$/.test(liveDb)) {
          try {
            await db.$executeRawUnsafe(
              `UPDATE \`${liveDb}\`.users SET password = ? WHERE id = ?`,
              laravelHash,
              portal.mergedSourceUserId,
            );
          } catch (e) {
            console.warn("[linked-account-password] HRIS password write failed", e);
          }
        }
      }
    });

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
