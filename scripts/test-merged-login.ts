#!/usr/bin/env npx tsx
import {
  findMergedUserByLogin,
  verifyMergedPassword,
} from "../src/lib/auth/merged-credentials";
import { ensurePortalFromMergedUser } from "../src/lib/auth/ensure-portal-from-merged";

const loginId = process.argv[2] ?? "manilyn";
const password = process.argv[3] ?? "";

async function main() {
  const merged = await findMergedUserByLogin(loginId);
  console.log("merged found:", merged ? {
    username: merged.username,
    email: merged.email,
    role: merged.role,
    hasHash: Boolean(merged.passwordHash),
    hashPrefix: merged.passwordHash?.slice(0, 12),
  } : null);

  if (!merged) {
    process.exit(1);
  }

  if (password) {
    const ok = await verifyMergedPassword(merged.passwordHash, password);
    console.log("password ok:", ok);
    if (ok) {
      try {
        const portal = await ensurePortalFromMergedUser(merged);
        console.log("portal:", { id: portal.id, email: portal.email, role: portal.role });
      } catch (e) {
        console.error("ensurePortalFromMergedUser failed:", e);
        process.exit(1);
      }
    }
  } else {
    console.log("Pass password as 2nd arg to test verify.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    const { prismaPrimary, prismaSecondary } = await import("../src/lib/prisma");
    await prismaPrimary.$disconnect();
    await prismaSecondary.$disconnect();
  });
