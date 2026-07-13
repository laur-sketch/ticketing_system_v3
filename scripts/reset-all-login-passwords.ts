/**
 * Reset login passwords for HRIS merged users + portal fallback accounts.
 *
 * Credential sign-in checks merged_users first, then portal_accounts.
 *
 * Usage:
 *   npx tsx scripts/reset-all-login-passwords.ts --confirm aci12345
 */
import bcrypt from "bcryptjs";
import { PrismaClient as PrismaClientPrimary } from "@prisma/client/primary";
import { PrismaClient as PrismaClientSecondary } from "@prisma/client/secondary";

const DEFAULT_PASSWORD = "aci12345";

function parseArgs(argv: string[]) {
  const confirm = argv.includes("--confirm");
  const args = argv.filter((a) => a !== "--confirm");
  const password =
    process.env.RESET_ALL_LOGIN_PASSWORDS?.trim() || args.join(" ").trim() || DEFAULT_PASSWORD;
  return { confirm, password };
}

async function main() {
  const { confirm, password } = parseArgs(process.argv.slice(2));
  if (!confirm) {
    console.error('Refusing to run without --confirm. Example:');
    console.error('  npx tsx scripts/reset-all-login-passwords.ts --confirm aci12345');
    process.exit(1);
  }
  if (!password || password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  // Laravel HRIS stores $2y$ — bcryptjs verify normalizes on read; store $2y$ for ETL compatibility.
  const hrisHash = passwordHash.replace(/^\$2a\$/, "$2y$");

  const syncUrl = process.env.DATABASE_URL_SECONDARY_SYNC?.trim();
  if (!syncUrl) {
    console.error("DATABASE_URL_SECONDARY_SYNC is required for merged_users writes.");
    process.exit(1);
  }

  const prismaPrimary = new PrismaClientPrimary();
  const prismaSecondary = new PrismaClientSecondary({
    datasources: { db: { url: syncUrl } },
  });

  const merged = await prismaSecondary.$executeRaw`
    UPDATE merged_users
    SET password_hash = ${hrisHash}
    WHERE is_active = 1
  `;

  let hrisUsers = 0;
  try {
    hrisUsers = await prismaSecondary.$executeRaw`
      UPDATE \`hris-dev\`.users u
      INNER JOIN merged_users mu ON mu.source_user_id = u.id
      SET u.password = ${hrisHash}
      WHERE mu.is_active = 1
    `;
  } catch (e) {
    console.warn("[reset-all-login-passwords] hris-dev.users update skipped:", (e as Error).message);
  }

  const portal = await prismaPrimary.portalAccount.updateMany({
    data: { passwordHash },
  });

  console.log(`Password set to: ${password}`);
  console.log(`  merged_users rows updated: ${merged}`);
  console.log(`  hris-dev.users rows updated: ${hrisUsers}`);
  console.log(`  portal_accounts rows updated: ${portal.count}`);
  console.log("Sign in at /signin with HRIS username (or email) and this password.");

  await prismaPrimary.$disconnect();
  await prismaSecondary.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
