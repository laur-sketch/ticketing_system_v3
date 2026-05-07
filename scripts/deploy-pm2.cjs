/**
 * One-command deploy: stop PM2 (releases Prisma engine lock on Windows), build, restart app.
 * Usage: npm run deploy:pm2
 */
const { execSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const opts = { stdio: "inherit", cwd: root, env: process.env };

try {
  execSync("pm2 stop ticket_system_v3", opts);
} catch {
  /* not registered yet */
}

if (process.platform === "win32") {
  try {
    execSync("powershell -NoProfile -Command \"Start-Sleep -Seconds 2\"", { stdio: "ignore" });
  } catch {
    /* ignore */
  }
}

execSync("npm run build", opts);

try {
  execSync("npx tsx scripts/ensure-unset-priority-data.ts", opts);
} catch {
  /* DB may be unreachable from build host; SLA row is required only when using UNSET priority */
}

try {
  execSync("pm2 restart ticket_system_v3 --update-env", opts);
} catch {
  execSync("pm2 start ecosystem.config.cjs", opts);
}

try {
  execSync("pm2 save", opts);
} catch {
  /* optional */
}
