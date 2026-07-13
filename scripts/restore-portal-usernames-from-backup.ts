import { PrismaClient } from "@prisma/client/primary";

const sourceUrl =
  process.env.SOURCE_DATABASE_URL?.trim() ||
  "postgresql://postgres:postgres@localhost:5432/ticketing_restore_tmp?schema=public";
const targetUrl =
  process.env.DATABASE_URL?.trim() ||
  "postgresql://postgres:postgres@localhost:5432/ticketing_system_v3-DEMO?schema=public";

const source = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
const target = new PrismaClient({ datasources: { db: { url: targetUrl } } });

const dryRun = process.argv.includes("--dry-run");
const confirm = process.argv.includes("--confirm");

type Plan = {
  id: string;
  name: string;
  role: string;
  currentUsername: string;
  currentEmail: string;
  originalUsername: string | null;
  originalEmail: string;
  mode: "username-email" | "email-only" | "skip";
  reason: string;
};

async function main() {
  if (!dryRun && !confirm) {
    console.error("Pass --dry-run to preview or --confirm to apply.");
    process.exit(1);
  }

  const [backupAccounts, currentDummyAccounts] = await Promise.all([
    source.portalAccount.findMany({
      select: { id: true, username: true, email: true, name: true, role: true },
    }),
    target.portalAccount.findMany({
      where: { username: { startsWith: "dummy_user_" } },
      select: { id: true, username: true, email: true, name: true, role: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const backupById = new Map(backupAccounts.map((a) => [a.id, a]));
  const reservedUsernames = new Set(
    (await target.portalAccount.findMany({
      where: { NOT: { username: { startsWith: "dummy_user_" } } },
      select: { username: true },
    }))
      .map((a) => (a.username ?? "").toLowerCase())
      .filter(Boolean),
  );
  const reservedEmails = new Set(
    (await target.portalAccount.findMany({
      where: { NOT: { email: { contains: "example.invalid" } } },
      select: { email: true },
    })).map((a) => a.email.toLowerCase()),
  );

  const plans: Plan[] = [];

  for (const current of currentDummyAccounts) {
    const original = backupById.get(current.id);
    if (!original) {
      plans.push({
        id: current.id,
        name: current.name,
        role: current.role,
        currentUsername: current.username ?? "",
        currentEmail: current.email,
        originalUsername: null,
        originalEmail: "",
        mode: "skip",
        reason: "missing-backup",
      });
      continue;
    }

    const originalUsername = original.username?.trim().toLowerCase() || null;
    const originalEmail = original.email.trim().toLowerCase();

    if (reservedEmails.has(originalEmail)) {
      plans.push({
        id: current.id,
        name: current.name,
        role: current.role,
        currentUsername: current.username ?? "",
        currentEmail: current.email,
        originalUsername,
        originalEmail,
        mode: "skip",
        reason: "email-taken",
      });
      continue;
    }

    if (!originalUsername) {
      plans.push({
        id: current.id,
        name: current.name,
        role: current.role,
        currentUsername: current.username ?? "",
        currentEmail: current.email,
        originalUsername: null,
        originalEmail,
        mode: "email-only",
        reason: "backup-had-no-username",
      });
      reservedEmails.add(originalEmail);
      continue;
    }

    if (reservedUsernames.has(originalUsername)) {
      plans.push({
        id: current.id,
        name: current.name,
        role: current.role,
        currentUsername: current.username ?? "",
        currentEmail: current.email,
        originalUsername,
        originalEmail,
        mode: "skip",
        reason: "username-taken",
      });
      continue;
    }

    plans.push({
      id: current.id,
      name: current.name,
      role: current.role,
      currentUsername: current.username ?? "",
      currentEmail: current.email,
      originalUsername,
      originalEmail,
      mode: "username-email",
      reason: "ready",
    });
    reservedUsernames.add(originalUsername);
    reservedEmails.add(originalEmail);
  }

  const usernameEmail = plans.filter((p) => p.mode === "username-email");
  const emailOnly = plans.filter((p) => p.mode === "email-only");
  const skipped = plans.filter((p) => p.mode === "skip");

  console.log(`Dummy accounts: ${currentDummyAccounts.length}`);
  console.log(`Restore username + email: ${usernameEmail.length}`);
  console.log(`Restore email only (no username in backup): ${emailOnly.length}`);
  console.log(`Skipped: ${skipped.length}`);
  console.log("");

  for (const p of usernameEmail) {
    console.log(
      `${p.currentUsername} -> ${p.originalUsername} | ${p.originalEmail} | ${p.role} | ${p.name}`,
    );
  }

  if (emailOnly.length > 0) {
    console.log("\n--- Email only (sign in with email) ---");
    for (const p of emailOnly) {
      console.log(`${p.currentUsername} -> (no username) | ${p.originalEmail} | ${p.name}`);
    }
  }

  if (skipped.length > 0) {
    console.log("\n--- Skipped ---");
    for (const p of skipped) {
      console.log(`${p.reason} | ${p.currentUsername} | ${p.name}`);
    }
  }

  if (dryRun) {
    console.log("\nDry run only. Re-run with --confirm to apply.");
    return;
  }

  let updated = 0;
  for (const p of [...usernameEmail, ...emailOnly]) {
    await target.portalAccount.update({
      where: { id: p.id },
      data: {
        username: p.originalUsername,
        email: p.originalEmail,
      },
    });

    await target.agent.updateMany({
      where: { email: { equals: p.currentEmail, mode: "insensitive" } },
      data: { email: p.originalEmail },
    });

    updated += 1;
  }

  console.log(`\nRestored ${updated} portal account(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await source.$disconnect();
    await target.$disconnect();
  });
