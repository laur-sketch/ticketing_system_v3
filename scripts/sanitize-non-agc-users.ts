/**
 * Replace portal account emails/passwords with dummy values for non-AGC users.
 *
 * Keeps accounts whose customer company OR staff designated company is AGC,
 * and all SuperAdmin accounts.
 *
 * Usage:
 *   npx tsx scripts/sanitize-non-agc-users.ts --dry-run
 *   npx tsx scripts/sanitize-non-agc-users.ts --confirm
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const AGC_COMPANY_NAME = "AGC";
const DUMMY_PASSWORD = process.env.DUMMY_USER_PASSWORD?.trim() || "DummyPass123!";
const DUMMY_EMAIL_DOMAIN = process.env.DUMMY_EMAIL_DOMAIN?.trim() || "example.invalid";

type AccountRow = {
  id: string;
  username: string | null;
  email: string;
  name: string;
  role: string;
  company: { name: string } | null;
  staffDesignatedCompany: { name: string } | null;
};

function isAgcAccount(account: Pick<AccountRow, "company" | "staffDesignatedCompany">) {
  return (
    account.company?.name === AGC_COMPANY_NAME ||
    account.staffDesignatedCompany?.name === AGC_COMPANY_NAME
  );
}

function shouldKeepAccount(account: AccountRow) {
  return account.role === "SuperAdmin" || isAgcAccount(account);
}

function dummyEmail(index: number) {
  return `dummy-user-${String(index).padStart(4, "0")}@${DUMMY_EMAIL_DOMAIN}`;
}

function dummyUsername(index: number) {
  return `dummy_user_${String(index).padStart(4, "0")}`;
}

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
      company: { select: { name: true } },
      staffDesignatedCompany: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const keep = accounts.filter((account) => shouldKeepAccount(account));
  const mask = accounts.filter((account) => !shouldKeepAccount(account));

  console.log(`Portal accounts: ${accounts.length}`);
  console.log(`Keep (AGC + SuperAdmin): ${keep.length}`);
  console.log(`Mask (non-AGC): ${mask.length}`);
  console.log(`Dummy password: ${DUMMY_PASSWORD}`);
  console.log("");

  if (keep.length > 0) {
    console.log("--- Keeping AGC / SuperAdmin accounts ---");
    for (const account of keep) {
      const company =
        account.company?.name ?? account.staffDesignatedCompany?.name ?? "(none)";
      console.log(`  ${account.role} | ${company} | ${account.username ?? "-"} | ${account.email}`);
    }
    console.log("");
  }

  if (mask.length === 0) {
    console.log("No non-AGC accounts to update.");
    return;
  }

  console.log("--- Masking non-AGC accounts ---");
  const passwordHash = await bcrypt.hash(DUMMY_PASSWORD, 12);

  for (let i = 0; i < mask.length; i += 1) {
    const account = mask[i]!;
    const nextEmail = dummyEmail(i + 1);
    const nextUsername = dummyUsername(i + 1);
    const company =
      account.company?.name ?? account.staffDesignatedCompany?.name ?? "(none)";

    console.log(
      `  ${account.role} | ${company} | ${account.username ?? "-"} | ${account.email} -> ${nextEmail}`,
    );

    if (!dryRun) {
      await prisma.portalAccount.update({
        where: { id: account.id },
        data: {
          email: nextEmail,
          username: nextUsername,
          passwordHash,
        },
      });

      await prisma.agent.updateMany({
        where: { email: { equals: account.email, mode: "insensitive" } },
        data: { email: nextEmail },
      });
    }
  }

  if (dryRun) {
    console.log("\nDry run only. Re-run with --confirm to apply.");
  } else {
    console.log(`\nUpdated ${mask.length} non-AGC portal account(s).`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
