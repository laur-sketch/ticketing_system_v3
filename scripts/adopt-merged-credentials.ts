#!/usr/bin/env npx tsx
/**
 * Adopt merged_users as credential SoT:
 * - Clear portal password_hash on all HRIS-linked portal accounts
 * - Mark work-email duplicates that clash with merged users as LEGACY_CONFLICT
 * - Register legacy emails as portal + merged username aliases
 *
 * Usage:
 *   npx tsx scripts/adopt-merged-credentials.ts
 *   npx tsx scripts/adopt-merged-credentials.ts --apply
 */
import { randomUUID } from "node:crypto";
import { normalizePersonName } from "../src/lib/person-name";
import { prismaPrimary, prismaSecondary } from "../src/lib/prisma";

type MergedRow = {
  source_user_id: bigint;
  name: string;
  username: string | null;
  email: string | null;
};

function personTokens(name: string): Set<string> {
  return new Set(
    normalizePersonName(name)
      .replace(/[,.]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1),
  );
}

function emailLocal(email: string): string {
  return email.split("@")[0]?.trim().toLowerCase() ?? "";
}

async function main() {
  const apply = process.argv.includes("--apply");
  const sourceTag = process.env.HRIS_MERGE_SOURCE_TAG?.trim() || "hrisdemo";

  const mergedRows = await prismaSecondary.$queryRaw<MergedRow[]>`
    SELECT source_user_id, name, username, email
    FROM merged_users
    WHERE is_active = 1 AND source_database = ${sourceTag}
  `;

  const portals = await prismaPrimary.portalAccount.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      username: true,
      passwordHash: true,
      mergedSourceUserId: true,
      accountStatus: true,
      role: true,
    },
  });

  let passwordsCleared = 0;
  let legacyMarked = 0;
  let aliases = 0;
  let linked = 0;

  const hrisPortals = portals.filter(
    (p) => p.mergedSourceUserId != null && p.accountStatus !== "LEGACY_CONFLICT",
  );
  const candidates = portals.filter((p) => p.accountStatus !== "LEGACY_CONFLICT");

  // 1) Clear passwords on HRIS-linked portals
  for (const portal of hrisPortals) {
    if (!portal.passwordHash) continue;
    passwordsCleared++;
    if (apply) {
      await prismaPrimary.portalAccount.update({
        where: { id: portal.id },
        data: { passwordHash: null },
      });
    }
  }

  // 2) Match unlinked portals to merged users by name; link or mark legacy + alias
  for (const portal of candidates) {
    if (portal.mergedSourceUserId != null) continue;

    const pt = personTokens(portal.name);
    let best: MergedRow | null = null;
    let bestScore = 0;
    for (const m of mergedRows) {
      const mt = personTokens(m.name);
      const overlap = [...pt].filter((t) => mt.has(t)).length;
      if (overlap >= 2 && overlap > bestScore) {
        best = m;
        bestScore = overlap;
      }
    }
    if (!best) continue;

    const canonical = hrisPortals.find(
      (p) => p.mergedSourceUserId?.toString() === best!.source_user_id.toString(),
    );

    if (canonical && canonical.id !== portal.id) {
      // Duplicate work-email portal → LEGACY_CONFLICT + aliases onto canonical/merged
      legacyMarked++;
      const identifiers = new Set<string>();
      identifiers.add(portal.email.trim().toLowerCase());
      const local = emailLocal(portal.email);
      if (local.length >= 2) identifiers.add(local);
      if (portal.username) identifiers.add(portal.username.trim().toLowerCase());

      for (const id of identifiers) {
        if (id === canonical.email.trim().toLowerCase()) continue;
        if (id === canonical.username?.trim().toLowerCase()) continue;

        if (apply) {
          const portalAliasExists = await prismaPrimary.portalUsernameAlias.findFirst({
            where: { username: { equals: id, mode: "insensitive" } },
          });
          if (!portalAliasExists) {
            await prismaPrimary.portalUsernameAlias.create({
              data: {
                id: randomUUID(),
                portalAccountId: canonical.id,
                username: id,
                source: "adopt_merged",
              },
            });
            aliases++;
          }

          const mergedAliasCount = await prismaSecondary.$queryRaw<Array<{ c: bigint }>>`
            SELECT COUNT(*) AS c FROM merged_username_aliases WHERE LOWER(username) = ${id}
          `;
          if (Number(mergedAliasCount[0]?.c ?? 0) === 0) {
            await prismaSecondary.mergedUsernameAlias.create({
              data: {
                id: randomUUID(),
                sourceUserId: best.source_user_id,
                username: id,
                source: "adopt_merged",
              },
            });
            aliases++;
          }
        } else {
          aliases += 2;
        }
      }

      if (apply) {
        await prismaPrimary.portalAccount.update({
          where: { id: portal.id },
          data: {
            accountStatus: "LEGACY_CONFLICT",
            username: null,
            passwordHash: null,
            mergedSourceUserId: null,
          },
        });
      }
      continue;
    }

    // No canonical portal yet — link this portal to merged user
    linked++;
    if (apply) {
      await prismaPrimary.portalAccount.update({
        where: { id: portal.id },
        data: {
          mergedSourceUserId: best.source_user_id,
          passwordHash: null,
        },
      });
    }
  }

  console.log(apply ? "=== Applied adopt-merged-credentials ===" : "=== Dry run (pass --apply) ===");
  console.log(
    JSON.stringify(
      {
        passwordsCleared,
        legacyMarked,
        linked,
        aliasesRegisteredApprox: aliases,
        mergedUsers: mergedRows.length,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prismaPrimary.$disconnect();
    await prismaSecondary.$disconnect();
  });
