/**
 * Reset portal passwords for staff roles to the app default.
 *
 * Usage:
 *   npx tsx scripts/reset-staff-portal-passwords.ts --dry-run
 *   npx tsx scripts/reset-staff-portal-passwords.ts --confirm
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_PASSWORD_RESET } from "../src/lib/default-reset-password";
import { normalizePortalRole } from "../src/lib/staff-role";

const prisma = new PrismaClient();

const STAFF_ROLES = new Set(["SuperAdmin", "Admin", "Personnel"]);

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const confirm = process.argv.includes("--confirm");

  if (!dryRun && !confirm) {
    console.error("Pass --dry-run to preview or --confirm to apply changes.");
    process.exit(1);
  }

  const accounts = await prisma.portalAccount.findMany({
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      role: true,
      staffDesignatedCompany: { select: { name: true } },
    },
    orderBy: [{ role: "asc" }, { email: "asc" }],
  });

  const targets = accounts.filter((account) => {
    const role = normalizePortalRole(account.role);
    return role != null && STAFF_ROLES.has(role);
  });

  console.log(`Default password: ${DEFAULT_PASSWORD_RESET}`);
  console.log(`Staff accounts to update: ${targets.length}`);
  console.log("");

  for (const account of targets) {
    const role = normalizePortalRole(account.role) ?? account.role;
    const company = account.staffDesignatedCompany?.name ?? "(none)";
    console.log(`  ${role} | ${company} | ${account.username ?? "-"} | ${account.email}`);
  }

  if (targets.length === 0) {
    return;
  }

  if (dryRun) {
    console.log("\nDry run only. Re-run with --confirm to apply.");
    return;
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD_RESET, 12);
  const result = await prisma.portalAccount.updateMany({
    where: { id: { in: targets.map((account) => account.id) } },
    data: { passwordHash },
  });

  console.log(`\nUpdated passwordHash for ${result.count} staff portal account(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
