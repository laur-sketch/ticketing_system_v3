/**
 * Sets the same bcrypt password on every PortalAccount (staff + customer portal users).
 * Does not affect Google-only rescue logins from env (no portal row).
 *
 * Usage (from repo root):
 *   npx tsx scripts/reset-all-portal-passwords.ts --confirm "your-new-password"
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client/primary";

const prisma = new PrismaClient();

function parseArgs(argv: string[]) {
  const confirm = argv.includes("--confirm");
  const args = argv.filter((a) => a !== "--confirm");
  const password =
    process.env.RESET_ALL_PORTAL_PASSWORDS?.trim() || args.join(" ").trim() || "";
  return { confirm, password };
}

async function main() {
  const { confirm, password } = parseArgs(process.argv.slice(2));
  if (!confirm) {
    console.error("Refusing to run without --confirm (prevents accidental execution).");
    process.exit(1);
  }
  if (!password || password.length < 8) {
    console.error("Password must be non-empty and at least 8 characters (or set RESET_ALL_PORTAL_PASSWORDS).");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await prisma.portalAccount.updateMany({
    data: { passwordHash },
  });

  console.log(`Updated passwordHash for ${result.count} portal account(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
