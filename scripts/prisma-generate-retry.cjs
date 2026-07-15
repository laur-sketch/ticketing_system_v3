/**
 * Generates all Prisma clients (primary + secondary + auth) with retry-on-EPERM for Windows.
 *
 * - Skips generation when the schema is unchanged (hash check) so builds don't
 *   need to touch the locked query-engine DLL at all.
 * - If the DLL is still locked (app server running), stops the server via
 *   server-ctl.cjs, generates, then restarts it.
 */
const { execSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const serverCtl = path.join(root, "scripts", "server-ctl.cjs");

const clients = [
  {
    label: "primary (PostgreSQL)",
    schema: path.join(root, "prisma", "db-primary", "schema.prisma"),
    outDir: path.join(root, "node_modules", "@prisma", "client", "primary"),
  },
  {
    label: "secondary (MySQL mergeddatabase)",
    schema: path.join(root, "prisma", "db-secondary", "schema.prisma"),
    outDir: path.join(root, "node_modules", "@prisma", "client", "secondary"),
  },
  {
    label: "auth (PostgreSQL)",
    schema: path.join(root, "prisma", "db-auth", "schema.prisma"),
    outDir: path.join(root, "node_modules", "@prisma", "client", "auth"),
  },
];

const engineDirs = [
  path.join(root, "node_modules", ".prisma", "client"),
  ...clients.map((c) => c.outDir),
];

let stoppedServer = false;

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
  for (const dir of engineDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.includes(".tmp")) continue;
      try {
        fs.unlinkSync(path.join(dir, name));
      } catch {
        /* ignore */
      }
    }
  }
}

function schemaHash(schemaPath) {
  return crypto.createHash("sha256").update(fs.readFileSync(schemaPath)).digest("hex");
}

function hashFilePath(outDir) {
  return path.join(outDir, ".schema-hash");
}

/** Client is fresh when index.js exists and the stored schema hash matches. */
function clientIsFresh(client) {
  const indexJs = path.join(client.outDir, "index.js");
  const hashFile = hashFilePath(client.outDir);
  if (!fs.existsSync(indexJs) || !fs.existsSync(hashFile)) return false;
  try {
    return fs.readFileSync(hashFile, "utf8").trim() === schemaHash(client.schema);
  } catch {
    return false;
  }
}

function recordSchemaHash(client) {
  try {
    fs.writeFileSync(hashFilePath(client.outDir), schemaHash(client.schema), "utf8");
  } catch {
    /* non-fatal */
  }
}

function stopAppServer() {
  if (stoppedServer) return;
  console.warn(
    "[prisma-generate] Query engine DLL is locked by the running app server — stopping it to regenerate...",
  );
  try {
    execSync(`"${process.execPath}" "${serverCtl}" stop`, { stdio: "inherit", cwd: root });
    stoppedServer = true;
    sleepMs(2000);
  } catch {
    console.warn("[prisma-generate] server-ctl stop failed (server may not be running).");
  }
}

function restartAppServerIfStopped() {
  if (!stoppedServer) return;
  console.log("[prisma-generate] Restarting the app server that was stopped for generation...");
  try {
    execSync(`"${process.execPath}" "${serverCtl}" start`, { stdio: "inherit", cwd: root });
  } catch {
    console.warn(
      "[prisma-generate] Failed to restart the app server. Start it manually: npm run pm2:start",
    );
  }
}

function runGenerate(client) {
  if (clientIsFresh(client)) {
    console.log(`\n[prisma-generate] ${client.label} client is up to date; skipping.`);
    return;
  }

  const maxAttempts = process.platform === "win32" ? 6 : 2;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`\n[prisma-generate] Generating ${client.label} client...`);
      execSync(`npx prisma generate --schema="${client.schema}"`, {
        stdio: "inherit",
        cwd: root,
        env: process.env,
      });
      recordSchemaHash(client);
      return;
    } catch (e) {
      lastErr = e;
      if (attempt === maxAttempts) {
        console.error(`[prisma-generate] Failed to generate ${client.label} client after ${maxAttempts} attempts.`);
        throw lastErr;
      }
      cleanStaleEngineTemps();
      // EPERM on Windows almost always means the app server holds the DLL.
      // Stop it once (restarted after all generates complete).
      if (process.platform === "win32" && attempt === 2 && !stoppedServer) {
        stopAppServer();
        continue;
      }
      console.warn(
        `\n[prisma-generate] ${client.label} attempt ${attempt}/${maxAttempts} failed; retrying in 2.5s.\n`,
      );
      sleepMs(2500);
    }
  }
}

function patchPrismaClientExports() {
  const pkgJsonPath = path.join(root, "node_modules", "@prisma", "client", "package.json");
  if (!fs.existsSync(pkgJsonPath)) {
    console.warn("[prisma-generate] @prisma/client/package.json not found; skipping exports patch.");
    return;
  }
  try {
    const raw = fs.readFileSync(pkgJsonPath, "utf-8");
    const pkg = JSON.parse(raw);
    if (pkg.exports) {
      const subpaths = {
        "./primary": {
          require: { types: "./primary/index.d.ts", default: "./primary/index.js" },
          import: { types: "./primary/index.d.ts", default: "./primary/index.js" },
        },
        "./secondary": {
          require: { types: "./secondary/index.d.ts", default: "./secondary/index.js" },
          import: { types: "./secondary/index.d.ts", default: "./secondary/index.js" },
        },
        "./auth": {
          require: { types: "./auth/index.d.ts", default: "./auth/index.js" },
          import: { types: "./auth/index.d.ts", default: "./auth/index.js" },
        },
      };
      let changed = false;
      for (const [subpath, value] of Object.entries(subpaths)) {
        if (!pkg.exports[subpath]) {
          pkg.exports[subpath] = value;
          changed = true;
          console.log(`[prisma-generate] Added exports entry: ${subpath}`);
        }
      }
      if (changed) {
        fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
        console.log("[prisma-generate] Patched @prisma/client/package.json exports.");
      }
    }
  } catch (err) {
    console.warn("[prisma-generate] Failed to patch exports:", err.message);
  }
}

function main() {
  cleanStaleEngineTemps();
  try {
    for (const client of clients) {
      runGenerate(client);
    }
    patchPrismaClientExports();
    console.log("\n[prisma-generate] All clients generated successfully.");
  } finally {
    restartAppServerIfStopped();
  }
}

try {
  main();
} catch (e) {
  console.error(e);
  process.exit(1);
}
