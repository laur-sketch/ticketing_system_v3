/**
 * PM2 process file — run from this directory:
 *   npm run pm2:start
 *   npm run pm2:reload   (after deploy / env change)
 * Port: set PORT before start, or defaults to 3000 (Next also reads .env / .env.production).
 * Logs: ./logs/pm2-*.log
 */
const path = require("path");

const cwd = __dirname;

module.exports = {
  apps: [
    {
      name: "ticket_system_v3",
      cwd,
      script: path.join(cwd, "server.js"),
      interpreter: "node",
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
