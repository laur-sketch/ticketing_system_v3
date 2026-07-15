/**
 * One-command deploy: stop app (releases Prisma engine lock on Windows), build, restart.
 * Usage: npm run deploy:pm2
 */
const { execSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const pm2Home = path.join(root, ".pm2");
const isWin = process.platform === "win32";
const ctl = `"${process.execPath}" "${path.join(root, "scripts", "server-ctl.cjs")}"`;
const pm2 = `"${process.execPath}" "${path.join(root, "node_modules", "pm2", "bin", "pm2")}"`;
const opts = { stdio: "inherit", cwd: root, env: { ...process.env, PM2_HOME: pm2Home } };

function runStop() {
  if (isWin) {
    try {
      execSync(`${ctl} stop`, opts);
    } catch {
      /* not running */
    }
    return;
  }
  try {
    execSync(`${pm2} stop ticket_system_v3`, opts);
  } catch {
    /* not registered yet */
  }
}

function runStart() {
  if (isWin) {
    execSync(`${ctl} start`, opts);
    return;
  }
  try {
    execSync(`${pm2} restart ticket_system_v3 --update-env`, opts);
  } catch {
    execSync(`${pm2} start ecosystem.config.cjs`, opts);
  }
  try {
    execSync(`${pm2} save`, opts);
  } catch {
    /* optional */
  }
}

/** Apply schema updates for deploy (multi-DB project — no root schema.prisma). */
function runDatabasePrep() {
  console.log("Applying primary PostgreSQL migrations…");
  execSync("npm run db:migrate:deploy:primary", opts);

  console.log("Syncing auth PostgreSQL schema…");
  try {
    execSync("npm run db:migrate:deploy:auth", opts);
  } catch {
    console.warn("Auth migrate deploy unavailable; falling back to prisma db push.");
    execSync("npx prisma db push --schema=prisma/db-auth/schema.prisma --skip-generate", opts);
  }

  console.log("Skipping secondary MySQL migrate (ETL-managed mergeddatabase schema).");
}

runStop();

if (process.platform === "win32") {
  try {
    execSync("powershell -NoProfile -Command \"Start-Sleep -Seconds 2\"", { stdio: "ignore" });
  } catch {
    /* ignore */
  }
}

execSync("npm run build", opts);

try {
  runDatabasePrep();
} catch (e) {
  console.error("Database preparation failed. Fix migrations before serving traffic.");
  throw e;
}

try {
  execSync("npx tsx scripts/ensure-unset-priority-data.ts", opts);
} catch {
  /* DB may be unreachable from build host; SLA row is required only when using UNSET priority */
}

runStart();
