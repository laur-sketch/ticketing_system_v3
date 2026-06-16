/**
 * PM2 process file — run from this directory:
 *   npm run pm2:start
 *   npm run pm2:reload   (after deploy / env change)
 * Port: set PORT before start, or defaults to 3000 (Next also reads .env / .env.production).
 * Logs: ./logs/pm2-*.log
 */
const fs = require("fs");
const path = require("path");

const cwd = __dirname;

/** Load .env then .env.production into process.env (later file wins). Helps PM2 when the shell has no vars. */
function loadEnvFiles(dir) {
  const mergeLine = (line) => {
    const t = line.trim();
    if (!t || t.startsWith("#")) return;
    const eq = t.indexOf("=");
    if (eq <= 0) return;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  };
  for (const name of [".env", ".env.production"]) {
    const p = path.join(dir, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      mergeLine(line);
    }
  }
}

loadEnvFiles(cwd);

module.exports = {
  apps: [
    {
      name: "ticket_system_v3",
      cwd,
      script: path.join(cwd, "server.js"),
      interpreter: "node",
      node_args: "--max-http-header-size=65536",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 15,
      min_uptime: "10s",
      max_memory_restart: "1G",
      kill_timeout: 5_000,
      listen_timeout: 10_000,
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || "3000",
      },
      error_file: path.join(cwd, "logs", "pm2-error.log"),
      out_file: path.join(cwd, "logs", "pm2-out.log"),
      merge_logs: true,
      time: true,
    },
  ],
};
