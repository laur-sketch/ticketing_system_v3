/**
 * Generates all Prisma clients (primary + secondary + auth) with retry-on-EPERM for Windows.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const primarySchema = path.join(root, "prisma", "db-primary", "schema.prisma");
const secondarySchema = path.join(root, "prisma", "db-secondary", "schema.prisma");
const authSchema = path.join(root, "prisma", "db-auth", "schema.prisma");

const engineDirs = [
  path.join(root, "node_modules", ".prisma", "client"),
  path.join(root, "node_modules", ".prisma", "primary"),
  path.join(root, "node_modules", ".prisma", "secondary"),
  path.join(root, "node_modules", ".prisma", "auth"),
  path.join(root, "node_modules", "@prisma", "client", "primary"),
  path.join(root, "node_modules", "@prisma", "client", "secondary"),
  path.join(root, "node_modules", "@prisma", "client", "auth"),
];

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

function runGenerate(schemaPath, label) {
  const maxAttempts = process.platform === "win32" ? 6 : 2;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`\n[prisma-generate] Generating ${label} client...`);
      execSync(`npx prisma generate --schema="${schemaPath}"`, {
        stdio: "inherit",
        cwd: root,
        env: process.env,
      });
      return;
    } catch (e) {
      lastErr = e;
      if (attempt === maxAttempts) {
        console.error(`[prisma-generate] Failed to generate ${label} client after ${maxAttempts} attempts.`);
        throw lastErr;
      }
      console.warn(
        `\n[prisma-generate] ${label} attempt ${attempt}/${maxAttempts} failed; retrying in 2.5s. ` +
          "If this keeps failing on Windows, stop PM2 / Next / Vite using this project, then run again.\n",
      );
      cleanStaleEngineTemps();
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
  runGenerate(primarySchema, "primary (PostgreSQL)");
  runGenerate(secondarySchema, "secondary (MySQL mergeddatabase-dev)");
  runGenerate(authSchema, "auth (PostgreSQL)");
  patchPrismaClientExports();
  console.log("\n[prisma-generate] All clients generated successfully.");
}

try {
  main();
} catch (e) {
  console.error(e);
  process.exit(1);
}
