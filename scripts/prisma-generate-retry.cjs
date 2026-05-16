/**
 * Windows: Prisma often fails with EPERM renaming query_engine-windows.dll.node when another Node
 * process has the engine loaded (PM2, next dev, Vite, etc.). Retries after a short wait and clears
 * stale .tmp* engine files left by failed runs.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const clientDir = path.join(root, "node_modules", ".prisma", "client");

function sleepMs(ms) {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  if (process.platform === "win32") {
    try {
      execSync(`cmd /c timeout /t ${seconds} /nobreak`, { stdio: "ignore" });
      return;
    } catch {
      /* continue to fallbacks */
    }
    try {
      execSync(`powershell -NoProfile -Command "Start-Sleep -Seconds ${seconds}"`, { stdio: "ignore" });
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    execSync(`sleep ${seconds}`, { stdio: "ignore" });
  } catch {
    /* ignore */
  }
}

function cleanStaleEngineTemps() {
  if (!fs.existsSync(clientDir)) return;
  for (const name of fs.readdirSync(clientDir)) {
    if (!name.includes(".tmp")) continue;
    try {
      fs.unlinkSync(path.join(clientDir, name));
    } catch {
      /* ignore */
    }
  }
}

const maxAttempts = process.platform === "win32" ? 6 : 2;
let lastErr;

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  try {
    execSync("npx prisma generate", { stdio: "inherit", cwd: root, env: process.env });
    process.exit(0);
  } catch (e) {
    lastErr = e;
    if (attempt === maxAttempts) break;
    console.warn(
      `\n[prisma-generate-retry] Attempt ${attempt}/${maxAttempts} failed; retrying in 2.5s. ` +
        "If this keeps failing on Windows, stop PM2 / Next / Vite using this project, then run again.\n",
    );
    cleanStaleEngineTemps();
    sleepMs(2500);
  }
}

console.error(lastErr);
process.exit(1);
