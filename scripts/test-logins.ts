import { findMergedUserByLogin, verifyMergedPassword } from "../src/lib/auth/merged-credentials";
import { findPortalByLogin } from "../src/lib/portal-account";
import { ensurePortalFromMergedUser } from "../src/lib/auth/ensure-portal-from-merged";
import { prismaPrimary } from "../src/lib/prisma";

const logins = ["manilyn", "ag88", "admin", "marvin"];

async function main() {
  for (const login of logins) {
    const merged = await findMergedUserByLogin(login);
    const portal = await findPortalByLogin(login);
    let mergedOk = false;
    let portalOk = false;
    if (merged?.passwordHash) mergedOk = await verifyMergedPassword(merged.passwordHash, "aci12345");
    if (portal?.passwordHash) {
      const bcrypt = await import("bcryptjs");
      portalOk = await bcrypt.compare("aci12345", portal.passwordHash);
    }
    let syncOk = false;
    if (merged && mergedOk) {
      try {
        await ensurePortalFromMergedUser(merged);
        syncOk = true;
      } catch (e) {
        console.log(login, "sync fail:", (e as Error).message);
      }
    }
    console.log({ login, merged: !!merged, portal: !!portal, mergedOk, portalOk, syncOk });
  }

  const manilynPortal = await prismaPrimary.portalAccount.findMany({
    where: {
      OR: [
        { username: { equals: "manilyn", mode: "insensitive" } },
        { email: { contains: "manilyn", mode: "insensitive" } },
      ],
    },
    select: { id: true, username: true, email: true },
  });
  console.log("manilyn portals:", manilynPortal);
}

main().finally(() => prismaPrimary.$disconnect());
