/**
 * Run PM2 with a project-local PM2_HOME so Windows named pipes are not shared
 * across RDP sessions (avoids connect EPERM \\.\pipe\rpc.sock).
 *
 * Usage: node scripts/pm2-run.cjs <pm2-args...>
 * Example: node scripts/pm2-run.cjs list
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const pm2Home = path.join(root, ".pm2");
fs.mkdirSync(pm2Home, { recursive: true });

const pm2Bin = path.join(
  root,
  "node_modules",
  "pm2",
  "bin",
  "pm2",
);

const env = {
  ...process.env,
  PM2_HOME: pm2Home,
};

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/pm2-run.cjs <pm2-args...>");
  process.exit(1);
}

const result = spawnSync(process.execPath, [pm2Bin, ...args], {
  cwd: root,
  env,
  stdio: "inherit",
  windowsHide: true,
});

process.exit(result.status ?? 1);
