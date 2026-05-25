/**
 * Launches scripts/api-runcheck.ps1 (npm's shell may not have powershell on PATH).
 * Extra args are forwarded, e.g. npm run api:runcheck -- -Warm
 */
const { spawnSync } = require("child_process");
const path = require("path");

const ps1 = path.join(__dirname, "api-runcheck.ps1");
const systemRoot = process.env.SystemRoot || "C:\\Windows";
const powershell = path.join(
  systemRoot,
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe"
);

const args = [
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  ps1,
  ...process.argv.slice(2),
];

const result = spawnSync(powershell, args, { stdio: "inherit" });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
